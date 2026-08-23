import { describe, it, expect } from 'vitest';
import {
  windowMinimizeSchema,
  windowMaximizeSchema,
  windowCloseSchema,
  windowIsMaximizedSchema,
  appQuitSchema,
} from '../../../electron/main/ipc/window-handlers';

describe('IPC Zod schemas', () => {
  it('windowMinimizeSchema accepts empty object', () => {
    const result = windowMinimizeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('windowMinimizeSchema rejects non-empty object', () => {
    const result = windowMinimizeSchema.safeParse({ extra: 'field' });
    expect(result.success).toBe(false);
  });

  it('windowMaximizeSchema accepts empty object', () => {
    const result = windowMaximizeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('windowCloseSchema accepts empty object', () => {
    const result = windowCloseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('windowIsMaximizedSchema accepts empty object', () => {
    const result = windowIsMaximizedSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('appQuitSchema accepts empty object', () => {
    const result = appQuitSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
