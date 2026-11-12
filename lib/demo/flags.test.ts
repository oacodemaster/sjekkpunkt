import { describe, expect, it } from 'vitest';
import { paidDemoOn, scriptedDemoOn } from './flags';

describe('demo flags (landing page brief, section 3)', () => {
  it('the free scripted demos are on unless switched off by name', () => {
    expect(scriptedDemoOn({})).toBe(true);
    expect(scriptedDemoOn({ NEXT_PUBLIC_SCRIPTED_DEMO: 'true' })).toBe(true);
    expect(scriptedDemoOn({ NEXT_PUBLIC_SCRIPTED_DEMO: '' })).toBe(true);
    expect(scriptedDemoOn({ NEXT_PUBLIC_SCRIPTED_DEMO: 'false' })).toBe(false);
  });

  it('the paid pieces are off unless DEMO_ENABLED is exactly true', () => {
    expect(paidDemoOn({})).toBe(false);
    expect(paidDemoOn({ DEMO_ENABLED: 'false' })).toBe(false);
    expect(paidDemoOn({ DEMO_ENABLED: '1' })).toBe(false);
    expect(paidDemoOn({ DEMO_ENABLED: 'true' })).toBe(true);
  });

  it('the scripted flag does not read DEMO_ENABLED, so production can keep it false', () => {
    expect(scriptedDemoOn({ DEMO_ENABLED: 'false', NEXT_PUBLIC_DEMO_ENABLED: 'false' } as Record<string, string>)).toBe(true);
  });
});
