import type Database from 'better-sqlite3';
import { getDecryptedKey, type LlmProvider } from '../auth/api-keys';
import { hasAiConsent } from './consent';
import { evaluateRules, type EmailData } from './rules-engine';

export type Classification = 'urgent' | 'action' | 'fyi' | 'noise';

export interface ClassificationResult {
  emailId: string;
  classification: Classification;
  confidence: number;
  reasoning: string;
}

interface EmailRow {
  id: string;
  subject: string | null;
  snippet: string | null;
  from_address: string | null;
  to_addresses: string | null;
  received_at: string | null;
}

interface ApiKeyInfo {
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string;
}

const CLASSIFICATION_PROMPT = `You are an email classifier for a busy consultant. Classify the following email into exactly ONE category:

- **urgent**: Requires immediate attention (time-sensitive, client emergency, deadline today, security alert)
- **action**: Requires action but not urgent (meeting invite, task assignment, review request, invoice)
- **fyi**: Informational only (newsletter, update, FYI, no action needed)
- **noise**: Spam, marketing, automated notifications, low-value

Respond with ONLY a JSON object in this exact format:
{"category": "<urgent|action|fyi|noise>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}

Email details:
From: {from}
Subject: {subject}
Preview: {snippet}`;

function buildPrompt(email: EmailRow): string {
  return CLASSIFICATION_PROMPT
    .replace('{from}', email.from_address ?? 'unknown')
    .replace('{subject}', email.subject ?? '(no subject)')
    .replace('{snippet}', email.snippet ?? '(no preview)');
}

function parseClassificationResponse(response: string): ClassificationResult | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const category = parsed.category as string;

    if (!['urgent', 'action', 'fyi', 'noise'].includes(category)) {
      return null;
    }

    return {
      emailId: '',
      classification: category as Classification,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return null;
  }
}

async function callOpenAI(
  apiKey: string,
  prompt: string,
  baseUrl?: string
): Promise<string> {
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

async function callAnthropic(
  apiKey: string,
  prompt: string,
  baseUrl?: string
): Promise<string> {
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/v1/messages`
    : 'https://api.anthropic.com/v1/messages';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ text: string }>;
  };
  return data.content[0]?.text ?? '';
}

function getActiveApiKey(db: Database.Database): ApiKeyInfo | null {
  const keys = db
    .prepare('SELECT id, provider, base_url FROM api_keys ORDER BY created_at DESC')
    .all() as Array<{ id: string; provider: LlmProvider; base_url: string | null }>;

  for (const key of keys) {
    const apiKey = getDecryptedKey(db, key.id);
    if (apiKey) {
      return {
        provider: key.provider,
        apiKey,
        baseUrl: key.base_url ?? undefined,
      };
    }
  }
  return null;
}

export async function classifyEmail(
  db: Database.Database,
  emailId: string
): Promise<ClassificationResult | null> {
  if (!hasAiConsent(db)) {
    throw new Error('AI consent required. Enable AI features in Settings.');
  }

  const email = db
    .prepare('SELECT id, subject, snippet, from_address, to_addresses, received_at FROM emails WHERE id = ?')
    .get(emailId) as EmailRow | undefined;

  if (!email) {
    console.log(`[classify] Email ${emailId} not found, skipping`);
    return null;
  }

  console.log(`[classify] Classifying email ${emailId}: "${email.subject ?? '(no subject)'}" from ${email.from_address ?? 'unknown'}`);

  const emailData: EmailData = {
    from: email.from_address,
    to: email.to_addresses,
    subject: email.subject,
    body: email.snippet,
    date: email.received_at,
  };

  const ruleResult = evaluateRules(db, emailData);
  if (ruleResult && ruleResult.skipLlm) {
    console.log(`[classify] Email ${emailId} matched rule "${ruleResult.ruleId}" -> ${ruleResult.classification} (skipped LLM)`);
    db.prepare(
      'UPDATE emails SET classification = ?, classification_source = ?, classification_rule_id = ? WHERE id = ?'
    ).run(ruleResult.classification, ruleResult.source, ruleResult.ruleId, emailId);

    return {
      emailId,
      classification: ruleResult.classification,
      confidence: 1.0,
      reasoning: `Matched rule: ${ruleResult.ruleId}`,
    };
  }

  const keyInfo = getActiveApiKey(db);
  if (!keyInfo) {
    if (ruleResult) {
      console.log(`[classify] Email ${emailId} rule override (no API key): "${ruleResult.ruleId}" -> ${ruleResult.classification}`);
      db.prepare(
        'UPDATE emails SET classification = ?, classification_source = ?, classification_rule_id = ? WHERE id = ?'
      ).run(ruleResult.classification, ruleResult.source, ruleResult.ruleId, emailId);

      return {
        emailId,
        classification: ruleResult.classification,
        confidence: 0.8,
        reasoning: `Rule override (no API key): ${ruleResult.ruleId}`,
      };
    }
    throw new Error('No API key configured. Add an OpenAI or Anthropic key in Settings.');
  }

  const prompt = buildPrompt(email);
  console.log(`[classify] Email ${emailId} calling LLM provider: ${keyInfo.provider}`);

  let rawResponse: string;
  if (keyInfo.provider === 'openai' || keyInfo.provider === 'litellm') {
    rawResponse = await callOpenAI(keyInfo.apiKey, prompt, keyInfo.baseUrl);
  } else if (keyInfo.provider === 'anthropic') {
    rawResponse = await callAnthropic(keyInfo.apiKey, prompt, keyInfo.baseUrl);
  } else {
    throw new Error(`Unsupported provider: ${keyInfo.provider}`);
  }

  console.log(`[classify] Email ${emailId} LLM raw response: ${rawResponse.substring(0, 200)}`);

  const llmResult = parseClassificationResponse(rawResponse);
  if (!llmResult) {
    console.error(`[classify] Email ${emailId} failed to parse LLM response: ${rawResponse}`);
    throw new Error('Failed to parse LLM classification response');
  }

  if (ruleResult) {
    console.log(`[classify] Email ${emailId} rule override: "${ruleResult.ruleId}" -> ${ruleResult.classification} (LLM said: ${llmResult.classification})`);
    db.prepare(
      'UPDATE emails SET classification = ?, classification_source = ?, classification_rule_id = ? WHERE id = ?'
    ).run(ruleResult.classification, ruleResult.source, ruleResult.ruleId, emailId);

    return {
      emailId,
      classification: ruleResult.classification,
      confidence: llmResult.confidence,
      reasoning: `Rule override: ${ruleResult.ruleId} (LLM said: ${llmResult.classification})`,
    };
  }

  console.log(`[classify] Email ${emailId} LLM result: ${llmResult.classification} (confidence: ${llmResult.confidence})`);
  db.prepare(
    'UPDATE emails SET classification = ?, classification_source = ?, classification_rule_id = NULL WHERE id = ?'
  ).run(llmResult.classification, 'llm', emailId);

  return {
    ...llmResult,
    emailId,
  };
}

export interface BatchClassificationResult {
  classified: ClassificationResult[];
  errors: number;
}

export async function classifyUnclassifiedEmails(
  db: Database.Database,
  accountId?: string,
  limit: number = 20
): Promise<BatchClassificationResult> {
  if (!hasAiConsent(db)) {
    throw new Error('AI consent not granted');
  }

  const whereClause = accountId
    ? 'WHERE classification IS NULL AND account_id = ?'
    : 'WHERE classification IS NULL';

  const params = accountId ? [accountId, limit] : [limit];
  const query = `SELECT id FROM emails ${whereClause} ORDER BY received_at DESC LIMIT ?`;

  const emails = db.prepare(query).all(...params) as { id: string }[];

  console.log(`[classify] Batch: ${emails.length} unclassified emails${accountId ? ` for account ${accountId}` : ''}`);

  const classified: ClassificationResult[] = [];
  let errors = 0;

  for (const email of emails) {
    try {
      const result = await classifyEmail(db, email.id);
      if (result) {
        classified.push(result);
      }
    } catch (err) {
      console.error(`[classify] Failed to classify email ${email.id}:`, err);
      errors++;
    }
  }

  console.log(`[classify] Batch complete: ${classified.length} classified, ${errors} errors`);
  return { classified, errors };
}

export function getClassifiedEmails(
  db: Database.Database,
  options: {
    accountId?: string;
    classification?: Classification;
    limit?: number;
    offset?: number;
  } = {}
): Array<{
  id: string;
  accountId: string;
  externalId: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string | null;
  receivedAt: string | null;
  classification: Classification;
  isRead: number;
}> {
  const conditions: string[] = ['is_read = 0'];
  const params: unknown[] = [];

  if (options.accountId) {
    conditions.push('account_id = ?');
    params.push(options.accountId);
  }
  if (options.classification) {
    conditions.push('classification = ?');
    params.push(options.classification);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT id, account_id as accountId, external_id as externalId, subject, snippet, from_address as fromAddress,
           received_at as receivedAt, classification, is_read as isRead
    FROM emails
    ${whereClause}
    ORDER BY
      CASE
        WHEN classification = 'urgent' THEN 1
        WHEN classification = 'action' THEN 2
        WHEN classification = 'fyi' THEN 3
        WHEN classification = 'noise' THEN 4
        ELSE 5
      END,
      received_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  return db.prepare(query).all(...params) as Array<{
    id: string;
    accountId: string;
    externalId: string;
    subject: string | null;
    snippet: string | null;
    fromAddress: string | null;
    receivedAt: string | null;
    classification: Classification;
    isRead: number;
  }>;
}
