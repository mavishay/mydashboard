import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCalendarHandlers } from '../../../electron/main/ipc/calendar-handlers';

vi.mock('../../../electron/main/calendar/calendar-sync', () => ({
  CalendarSync: vi.fn().mockImplementation(() => ({
    syncAccount: vi.fn().mockResolvedValue({
      accountId: 'test-account',
      status: 'idle',
      lastSyncAt: null,
      error: null,
      fetched: 0,
    }),
    syncAll: vi.fn().mockResolvedValue([]),
    getTodayEvents: vi.fn().mockReturnValue([]),
    getEventsForDateRange: vi.fn().mockReturnValue([]),
  })),
}));

describe('Calendar Handlers', () => {
  let mockIpcMain: any;
  let mockDb: any;

  beforeEach(() => {
    mockIpcMain = {
      handle: vi.fn(),
    };
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      }),
    };
    vi.clearAllMocks();
  });

  it('exports registerCalendarHandlers function', () => {
    expect(registerCalendarHandlers).toBeDefined();
    expect(typeof registerCalendarHandlers).toBe('function');
  });

  it('registers IPC handlers', () => {
    registerCalendarHandlers(mockIpcMain, mockDb);
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(5);
  });

  it('registers calendar:sync handler', () => {
    registerCalendarHandlers(mockIpcMain, mockDb);
    expect(mockIpcMain.handle).toHaveBeenCalledWith('calendar:sync', expect.any(Function));
  });

  it('registers calendar:syncAll handler', () => {
    registerCalendarHandlers(mockIpcMain, mockDb);
    expect(mockIpcMain.handle).toHaveBeenCalledWith('calendar:syncAll', expect.any(Function));
  });

  it('registers calendar:getTodayEvents handler', () => {
    registerCalendarHandlers(mockIpcMain, mockDb);
    expect(mockIpcMain.handle).toHaveBeenCalledWith('calendar:getTodayEvents', expect.any(Function));
  });

  it('registers calendar:getFilteredEvents handler', () => {
    registerCalendarHandlers(mockIpcMain, mockDb);
    expect(mockIpcMain.handle).toHaveBeenCalledWith('calendar:getFilteredEvents', expect.any(Function));
  });

  it('registers calendar:status handler', () => {
    registerCalendarHandlers(mockIpcMain, mockDb);
    expect(mockIpcMain.handle).toHaveBeenCalledWith('calendar:status', expect.any(Function));
  });

  it('returns calendarSync instance', () => {
    const result = registerCalendarHandlers(mockIpcMain, mockDb);
    expect(result).toHaveProperty('calendarSync');
  });
});