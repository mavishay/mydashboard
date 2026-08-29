import { useState, useEffect, useCallback } from 'react';

type RuleField = 'from' | 'to' | 'subject' | 'body' | 'domain' | 'date';
type RuleOperator = 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'matches_regex';
type Classification = 'urgent' | 'action' | 'fyi' | 'noise';
type RuleAction = 'classify' | 'skip_llm';

interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

interface ClassificationRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  action: RuleAction;
  classification: Classification | null;
  createdAt: string;
  updatedAt: string;
}

interface TestEmail {
  from: string;
  to: string;
  subject: string;
  body: string;
}

const FIELD_OPTIONS: { value: RuleField; label: string }[] = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
  { value: 'domain', label: 'Domain' },
  { value: 'date', label: 'Date' },
];

const OPERATOR_OPTIONS: { value: RuleOperator; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'matches_regex', label: 'Matches regex' },
];

const CLASSIFICATION_OPTIONS: { value: Classification; label: string; color: string }[] = [
  { value: 'urgent', label: 'Urgent', color: '#d32f2f' },
  { value: 'action', label: 'Action', color: '#f57c00' },
  { value: 'fyi', label: 'FYI', color: '#1976d2' },
  { value: 'noise', label: 'Noise', color: '#757575' },
];

const DEFAULT_RULES: Omit<ClassificationRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Newsletters → Noise',
    enabled: false,
    priority: 0,
    conditions: [{ field: 'from', operator: 'contains', value: 'newsletter' }],
    action: 'classify',
    classification: 'noise',
  },
  {
    name: 'Automated notifications → Noise',
    enabled: false,
    priority: 0,
    conditions: [{ field: 'from', operator: 'contains', value: 'noreply' }],
    action: 'classify',
    classification: 'noise',
  },
];

const inputStyle: React.CSSProperties = {
  padding: '0.375rem 0.5rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
  fontSize: '0.8125rem',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: '#fff',
};

const btnSmall: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
  background: '#f5f5f5',
  cursor: 'pointer',
  fontSize: '0.75rem',
};

export function ClassificationRules() {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPriority, setFormPriority] = useState(0);
  const [formAction, setFormAction] = useState<RuleAction>('classify');
  const [formClassification, setFormClassification] = useState<Classification>('noise');
  const [formConditions, setFormConditions] = useState<RuleCondition[]>([
    { field: 'from', operator: 'contains', value: '' },
  ]);
  const [testEmail, setTestEmail] = useState<TestEmail>({ from: '', to: '', subject: '', body: '' });
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const list = await window.electronAPI.rules.getAll();
      setRules(list);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleToggle = async (rule: ClassificationRule) => {
    try {
      await window.electronAPI.rules.update(rule.id, { enabled: !rule.enabled });
      await loadRules();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.rules.delete(id);
      await loadRules();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  const handleAddCondition = () => {
    setFormConditions([...formConditions, { field: 'from', operator: 'contains', value: '' }]);
  };

  const handleRemoveCondition = (index: number) => {
    setFormConditions(formConditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index: number, updates: Partial<RuleCondition>) => {
    setFormConditions(
      formConditions.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
  };

  const resetForm = () => {
    setEditing(false);
    setEditingRuleId(null);
    setFormName('');
    setFormPriority(0);
    setFormAction('classify');
    setFormClassification('noise');
    setFormConditions([{ field: 'from', operator: 'contains', value: '' }]);
    setError(null);
    setTestResult(null);
  };

  const handleStartEdit = (rule: ClassificationRule) => {
    setEditing(true);
    setEditingRuleId(rule.id);
    setFormName(rule.name);
    setFormPriority(rule.priority);
    setFormAction(rule.action);
    setFormClassification(rule.classification ?? 'noise');
    setFormConditions([...rule.conditions]);
    setError(null);
    setTestResult(null);
  };

  const handleSaveRule = async () => {
    setError(null);
    if (!formName.trim()) {
      setError('Rule name is required');
      return;
    }
    if (formConditions.some((c) => !c.value.trim())) {
      setError('All conditions must have a value');
      return;
    }

    try {
      if (editingRuleId) {
        await window.electronAPI.rules.update(editingRuleId, {
          name: formName.trim(),
          priority: formPriority,
          conditions: formConditions,
          action: formAction,
          classification: formClassification,
        });
      } else {
        await window.electronAPI.rules.create({
          name: formName.trim(),
          enabled: true,
          priority: formPriority,
          conditions: formConditions,
          action: formAction,
          classification: formClassification,
        });
      }
      resetForm();
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    if (formConditions.some((c) => !c.value.trim())) {
      setError('Fill in all condition values before testing');
      return;
    }

    try {
      const result = await window.electronAPI.rules.test(formConditions, {
        from: testEmail.from || null,
        to: testEmail.to || null,
        subject: testEmail.subject || null,
        body: testEmail.body || null,
      });
      setTestResult(result.matched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    }
  };

  const handleSeedDefaults = async () => {
    for (const rule of DEFAULT_RULES) {
      const exists = rules.some((r) => r.name === rule.name);
      if (!exists) {
        try {
          await window.electronAPI.rules.create(rule);
        } catch (err) {
          console.error('Failed to seed default rule:', err);
        }
      }
    }
    await loadRules();
  };

  if (loading) {
    return <p style={{ color: '#999', fontSize: '0.875rem' }}>Loading rules...</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <p style={{ color: '#666', fontSize: '0.875rem', margin: 0 }}>
            Create rules to classify emails before or instead of AI. Rules are evaluated by priority (highest first).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {rules.length === 0 && (
            <button onClick={handleSeedDefaults} style={{ ...btnSmall, background: '#e3f2fd', border: '1px solid #1976d2', color: '#1976d2' }}>
              Add example rules
            </button>
          )}
          <button onClick={() => setEditing(true)} style={{ ...btnSmall, background: '#1976d2', border: '1px solid #1976d2', color: '#fff' }}>
            + Add rule
          </button>
        </div>
      </div>

      {rules.length === 0 && !editing && (
        <p style={{ color: '#999', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
          No classification rules yet. Add one to get started.
        </p>
      )}

      {rules.map((rule) => (
        <div
          key={rule.id}
          style={{
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '0.5rem',
            opacity: rule.enabled ? 1 : 0.6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => handleToggle(rule)}
                  style={{ width: '1rem', height: '1rem' }}
                />
              </label>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{rule.name}</div>
                <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.125rem' }}>
                  {rule.conditions.length} condition{rule.conditions.length > 1 ? 's' : ''} (AND) · Priority {rule.priority} ·{' '}
                  {rule.action === 'skip_llm' ? 'Skip LLM' : 'Override'} →{' '}
                  {rule.classification && (
                    <span style={{ color: CLASSIFICATION_OPTIONS.find((c) => c.value === rule.classification)?.color, fontWeight: 600 }}>
                      {CLASSIFICATION_OPTIONS.find((c) => c.value === rule.classification)?.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button onClick={() => handleStartEdit(rule)} style={{ ...btnSmall, border: '1px solid #1976d2', color: '#1976d2' }}>
                Edit
              </button>
              <button onClick={() => handleDelete(rule.id)} style={{ ...btnSmall, color: '#d32f2f', border: '1px solid #d32f2f' }}>
                Delete
              </button>
            </div>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {rule.conditions.map((c, i) => (
              <span
                key={i}
                style={{
                  background: '#f5f5f5',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }}
              >
                {c.field} {c.operator} &quot;{c.value}&quot;
              </span>
            ))}
          </div>
        </div>
      ))}

      {editing && (
        <div
          style={{
            border: '2px solid #1976d2',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
            {editingRuleId ? 'Edit Classification Rule' : 'New Classification Rule'}
          </h3>

          {error && (
            <div style={{ color: '#d32f2f', fontSize: '0.8125rem', padding: '0.5rem', background: '#ffeaea', borderRadius: '4px', marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', fontWeight: 600 }}>Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. VIP sender → urgent"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={{ flex: 0, minWidth: '80px' }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', fontWeight: 600 }}>Priority</label>
              <input
                type="number"
                value={formPriority}
                onChange={(e) => setFormPriority(Number(e.target.value))}
                min={0}
                max={1000}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', fontWeight: 600 }}>Action</label>
              <select value={formAction} onChange={(e) => setFormAction(e.target.value as RuleAction)} style={{ ...selectStyle, width: '100%' }}>
                <option value="classify">Override classification</option>
                <option value="skip_llm">Skip LLM (use rule result directly)</option>
              </select>
            </div>
            {formAction === 'classify' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.25rem', fontWeight: 600 }}>Classification</label>
                <select
                  value={formClassification}
                  onChange={(e) => setFormClassification(e.target.value as Classification)}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 600 }}>Conditions (all must match — AND logic)</label>
            {formConditions.map((cond, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem', alignItems: 'center' }}>
                <select value={cond.field} onChange={(e) => handleConditionChange(i, { field: e.target.value as RuleField })} style={{ ...selectStyle, width: '100px' }}>
                  {FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select value={cond.operator} onChange={(e) => handleConditionChange(i, { operator: e.target.value as RuleOperator })} style={{ ...selectStyle, width: '130px' }}>
                  {OPERATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={cond.value}
                  onChange={(e) => handleConditionChange(i, { value: e.target.value })}
                  placeholder="value"
                  style={{ ...inputStyle, flex: 1 }}
                />
                {formConditions.length > 1 && (
                  <button onClick={() => handleRemoveCondition(i)} style={{ ...btnSmall, color: '#d32f2f' }}>×</button>
                )}
              </div>
            ))}
            <button onClick={handleAddCondition} style={{ ...btnSmall, marginTop: '0.25rem' }}>+ Add condition</button>
          </div>

          <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', marginBottom: '0.375rem', fontWeight: 600 }}>Test with sample email</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem', marginBottom: '0.375rem' }}>
              <input type="text" value={testEmail.from} onChange={(e) => setTestEmail({ ...testEmail, from: e.target.value })} placeholder="From: user@example.com" style={inputStyle} />
              <input type="text" value={testEmail.subject} onChange={(e) => setTestEmail({ ...testEmail, subject: e.target.value })} placeholder="Subject: ..." style={inputStyle} />
              <input type="text" value={testEmail.to} onChange={(e) => setTestEmail({ ...testEmail, to: e.target.value })} placeholder="To: me@company.com" style={inputStyle} />
              <input type="text" value={testEmail.body} onChange={(e) => setTestEmail({ ...testEmail, body: e.target.value })} placeholder="Body snippet..." style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={handleTest} style={{ ...btnSmall, background: '#e8f5e9', border: '1px solid #2e7d32', color: '#2e7d32' }}>
                Test rule
              </button>
              {testResult !== null && (
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: testResult ? '#2e7d32' : '#d32f2f' }}>
                  {testResult ? 'Matched' : 'Not matched'}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={resetForm} style={btnSmall}>
              Cancel
            </button>
            <button
              onClick={handleSaveRule}
              style={{ ...btnSmall, background: '#1976d2', border: '1px solid #1976d2', color: '#fff' }}
            >
              {editingRuleId ? 'Update rule' : 'Save rule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
