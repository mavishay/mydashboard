import { describe, it, expect } from 'vitest';
import {
  SetTelemetryOptInSchema,
  GetTelemetryEventsSchema,
} from '../../../electron/main/ipc/telemetry-handlers';

describe('Telemetry IPC Zod schemas', () => {
  describe('SetTelemetryOptInSchema', () => {
    it('accepts true', () => {
      const result = SetTelemetryOptInSchema.safeParse({ optedIn: true });
      expect(result.success).toBe(true);
    });

    it('accepts false', () => {
      const result = SetTelemetryOptInSchema.safeParse({ optedIn: false });
      expect(result.success).toBe(true);
    });

    it('rejects non-boolean', () => {
      const result = SetTelemetryOptInSchema.safeParse({ optedIn: 'yes' });
      expect(result.success).toBe(false);
    });

    it('rejects missing optedIn', () => {
      const result = SetTelemetryOptInSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('GetTelemetryEventsSchema', () => {
    it('accepts valid limit', () => {
      const result = GetTelemetryEventsSchema.safeParse({ limit: 50 });
      expect(result.success).toBe(true);
    });

    it('accepts empty payload', () => {
      const result = GetTelemetryEventsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts undefined payload', () => {
      const result = GetTelemetryEventsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('rejects limit below 1', () => {
      const result = GetTelemetryEventsSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects limit above 1000', () => {
      const result = GetTelemetryEventsSchema.safeParse({ limit: 1001 });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer limit', () => {
      const result = GetTelemetryEventsSchema.safeParse({ limit: 1.5 });
      expect(result.success).toBe(false);
    });
  });
});
