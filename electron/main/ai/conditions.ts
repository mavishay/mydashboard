export type RuleField = 'from' | 'to' | 'subject' | 'body' | 'domain' | 'date';
export type RuleOperator = 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'ends_with' | 'matches_regex';

export interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

export interface EmailData {
  from: string | null;
  to: string | null;
  subject: string | null;
  body: string | null;
  date: string | null;
}

function extractDomain(email: string | null): string {
  if (!email) return '';
  const match = email.match(/@([^>@]+)$/);
  return match ? match[1].toLowerCase() : email.toLowerCase();
}

function getField(email: EmailData, field: RuleField): string {
  switch (field) {
    case 'from':
      return email.from?.toLowerCase() ?? '';
    case 'to':
      return email.to?.toLowerCase() ?? '';
    case 'subject':
      return email.subject?.toLowerCase() ?? '';
    case 'body':
      return email.body?.toLowerCase() ?? '';
    case 'domain':
      return extractDomain(email.from);
    case 'date':
      return email.date?.toLowerCase() ?? '';
  }
}

export function evaluateCondition(email: EmailData, condition: RuleCondition): boolean {
  const fieldValue = getField(email, condition.field);
  const testValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return fieldValue.includes(testValue);
    case 'not_contains':
      return !fieldValue.includes(testValue);
    case 'equals':
      return fieldValue === testValue;
    case 'starts_with':
      return fieldValue.startsWith(testValue);
    case 'ends_with':
      return fieldValue.endsWith(testValue);
    case 'matches_regex':
      try {
        const raw = email[condition.field] ?? '';
        return new RegExp(condition.value, 'i').test(raw);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function evaluateConditions(email: EmailData, conditions: RuleCondition[]): boolean {
  return conditions.every((c) => evaluateCondition(email, c));
}

export const matchesCondition = evaluateCondition;
