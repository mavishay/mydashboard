import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPriorityFromDueDate, formatDueDate } from '../../src/components/TaskList';

describe('getPriorityFromDueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when dueAt is null', () => {
    expect(getPriorityFromDueDate(null)).toBeNull();
  });

  it('returns "high" for overdue tasks', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(getPriorityFromDueDate('2026-09-04T00:00:00Z')).toBe('high');
  });

  it('returns "high" for tasks due yesterday', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(getPriorityFromDueDate('2026-09-04T00:00:00Z')).toBe('high');
  });

  it('returns "medium" for tasks due today', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(getPriorityFromDueDate('2026-09-05T00:00:00Z')).toBe('medium');
  });

  it('returns "low" for future tasks', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(getPriorityFromDueDate('2026-09-06T00:00:00Z')).toBe('low');
  });

  it('returns "low" for tasks due in a week', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(getPriorityFromDueDate('2026-09-12T00:00:00Z')).toBe('low');
  });
});

describe('formatDueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string when dueAt is null', () => {
    expect(formatDueDate(null)).toBe('');
  });

  it('returns "Today" for tasks due today', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(formatDueDate('2026-09-05T00:00:00Z')).toBe('Today');
  });

  it('returns "Yesterday" for tasks due yesterday', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(formatDueDate('2026-09-04T00:00:00Z')).toBe('Yesterday');
  });

  it('returns "Tomorrow" for tasks due tomorrow', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    expect(formatDueDate('2026-09-06T00:00:00Z')).toBe('Tomorrow');
  });

  it('returns formatted date for other dates', () => {
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    const result = formatDueDate('2026-09-12T00:00:00Z');
    expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });
});
