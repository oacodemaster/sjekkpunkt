import { describe, expect, it } from 'vitest';
import { agentBody, LEAD_TOOLS, PACK_TOOLS, RETURNS_TOOLS } from './agent-config';
import { LeadToolParams } from './lead-tools';

describe('lead assistant config', () => {
  it('tool names match the parameter schemas and never clash with the station tools', () => {
    expect(LEAD_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(LeadToolParams).sort());
    const station = new Set<string>([...RETURNS_TOOLS, ...PACK_TOOLS].map((t) => t.name));
    expect(LEAD_TOOLS.filter((t) => station.has(t.name))).toEqual([]);
  });

  it('has no tool that could resolve, approve or change anything', () => {
    for (const t of LEAD_TOOLS) expect(t.name).toMatch(/^(list|get|show)_/);
  });

  it('speaks Norwegian only: no language presets and no language detection', () => {
    const body = agentBody('lead', ['t1'], null);
    expect(body.conversation_config.agent.language).toBe('no');
    expect(body.conversation_config.language_presets).toEqual({});
    expect(body.conversation_config.agent.prompt.built_in_tools).toEqual({});
    expect(agentBody('return', [], null).conversation_config.agent.prompt.built_in_tools).toHaveProperty('language_detection');
  });

  it('keeps amounts as digits (the voice reads them; the LLM never spells them out)', () => {
    expect(agentBody('lead', [], null).conversation_config.tts).toMatchObject({ text_normalisation_type: 'elevenlabs' });
    expect(agentBody('pack', [], null).conversation_config.tts).toMatchObject({ text_normalisation_type: 'elevenlabs' });
    expect(agentBody('return', [], null).conversation_config.tts).toMatchObject({ text_normalisation_type: 'elevenlabs' });
  });
});
