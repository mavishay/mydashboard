import { describe, it, expect } from 'vitest';

describe('TodayCalendar', () => {
  it('exports TodayCalendar component', async () => {
    const mod = await import('../../src/components/TodayCalendar');
    expect(mod.TodayCalendar).toBeDefined();
    expect(typeof mod.TodayCalendar).toBe('function');
  });

  it('component is a valid React component', async () => {
    const { TodayCalendar } = await import('../../src/components/TodayCalendar');
    expect(typeof TodayCalendar).toBe('function');
    expect(TodayCalendar.name).toBe('TodayCalendar');
  });
});