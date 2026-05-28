import { describe, it, expect } from 'vitest';
import { withDefaults, DEFAULT_SETTINGS } from './settings';

describe('settings withDefaults', () => {
  it('fills missing fields with defaults', () => {
    expect(withDefaults({})).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps provided fields', () => {
    expect(withDefaults({ syncConnectionHistory: true })).toEqual({ syncConnectionHistory: true });
  });
});
