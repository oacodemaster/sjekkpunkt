import { describe, expect, it } from 'vitest';
import { agentBody, AGENT_RETENTION_DAYS } from './agent-config';

// M8: what every agent pushed by `pnpm voice:setup` promises about workers' speech.
describe('agent privacy settings', () => {
  for (const kind of ['return', 'pack', 'lead'] as const) {
    const ps = agentBody(kind, [], null).platform_settings as Record<string, unknown>;
    it(`${kind}: no audio kept, short transcript retention, no emotion inference, token required`, () => {
      expect(ps.privacy).toMatchObject({ record_voice: false, delete_audio: true, retention_days: AGENT_RETENTION_DAYS });
      expect(AGENT_RETENTION_DAYS).toBeGreaterThan(0);
      expect(AGENT_RETENTION_DAYS).toBeLessThanOrEqual(30);
      expect(ps.sentiment_analysis).toEqual({ enabled: false });
      expect(ps.topic_discovery).toEqual({ enabled: false });
      expect(ps.auth).toEqual({ enable_auth: true });
      expect((ps.call_limits as { daily_limit: number }).daily_limit).toBeGreaterThan(0);
    });
  }
});
