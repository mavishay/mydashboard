import { SortPrefs, GroupPrefs, SortOption, GroupOption } from './utils';

interface SortGroupControlsProps {
  sortPrefs: SortPrefs;
  groupPrefs: GroupPrefs;
  onSortChange: (prefs: SortPrefs) => void;
  onGroupChange: (prefs: GroupPrefs) => void;
  emailCount: number;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'sender', label: 'Sender' },
  { value: 'classification', label: 'Classification' },
  { value: 'account', label: 'Account' },
];

const GROUP_OPTIONS: { value: GroupOption; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'account', label: 'Account' },
  { value: 'classification', label: 'Classification' },
  { value: 'date', label: 'Date' },
  { value: 'sender-domain', label: 'Domain' },
];

export function SortGroupControls({
  sortPrefs,
  groupPrefs,
  onSortChange,
  onGroupChange,
  emailCount,
}: SortGroupControlsProps) {
  const handleSortChange = (option: SortOption) => {
    const direction = option === sortPrefs.option
      ? (sortPrefs.direction === 'asc' ? 'desc' : 'asc')
      : option === 'sender' || option === 'account' ? 'asc' : 'desc';
    onSortChange({ option, direction });
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {`Sorted by ${sortPrefs.option}, ${sortPrefs.direction === 'desc' ? 'newest first' : 'oldest first'}`}
        {groupPrefs.option !== 'none' ? `. Grouped by ${groupPrefs.option}.` : '. No grouping.'}
      </div>
      <span style={{ color: '#666', fontSize: '0.75rem' }}>
        {emailCount} email{emailCount !== 1 ? 's' : ''}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#666' }}>Sort:</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              title={`${opt.label} (S to cycle)`}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: '1px solid',
                borderColor: sortPrefs.option === opt.value ? '#1976d2' : '#d1d5db',
                background: sortPrefs.option === opt.value ? '#e3f2fd' : '#fff',
                color: sortPrefs.option === opt.value ? '#1976d2' : '#666',
                cursor: 'pointer',
                fontWeight: sortPrefs.option === opt.value ? 600 : 400,
              }}
            >
              {opt.label}
              {sortPrefs.option === opt.value && (
                <span style={{ marginLeft: '2px' }}>
                  {sortPrefs.direction === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#666' }}>Group:</span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {GROUP_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onGroupChange({ option: opt.value })}
              title={`${opt.label} (G to cycle)`}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: '1px solid',
                borderColor: groupPrefs.option === opt.value ? '#7b1fa2' : '#d1d5db',
                background: groupPrefs.option === opt.value ? '#f3e5f5' : '#fff',
                color: groupPrefs.option === opt.value ? '#7b1fa2' : '#666',
                cursor: 'pointer',
                fontWeight: groupPrefs.option === opt.value ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
