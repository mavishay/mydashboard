import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarSync } from '../../../electron/main/calendar/calendar-sync';

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn(() => ({
      calendarList: {
        list: vi.fn().mockResolvedValue({
          data: { items: [] },
        }),
      },
      events: {
        list: vi.fn().mockResolvedValue({
          data: { items: [] },
        }),
      },
    })),
  },
}));

vi.mock('../../../electron/main/auth/gmail', () => ({
  retrieveTokens: vi.fn().mockReturnValue(null),
}));

describe('CalendarSync', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
      }),
      exec: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('exports CalendarSync class', () => {
    expect(CalendarSync).toBeDefined();
    expect(typeof CalendarSync).toBe('function');
  });

  it('creates CalendarSync instance', () => {
    const sync = new CalendarSync(mockDb);
    expect(sync).toBeDefined();
  });

  it('has getTodayEvents method', () => {
    const sync = new CalendarSync(mockDb);
    expect(typeof sync.getTodayEvents).toBe('function');
  });

  it('has syncAccount method', () => {
    const sync = new CalendarSync(mockDb);
    expect(typeof sync.syncAccount).toBe('function');
  });

  it('has syncAll method', () => {
    const sync = new CalendarSync(mockDb);
    expect(typeof sync.syncAll).toBe('function');
  });
});