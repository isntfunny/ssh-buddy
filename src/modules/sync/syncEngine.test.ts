import { describe, it, expect } from 'vitest';
import * as engine from './syncEngine';

describe('syncEngine exports', () => {
  it('exposes syncAll, subscribeRealtime, and pushProfile', () => {
    expect(typeof engine.syncAll).toBe('function');
    expect(typeof engine.subscribeRealtime).toBe('function');
    expect(typeof engine.pushProfile).toBe('function');
  });
});
