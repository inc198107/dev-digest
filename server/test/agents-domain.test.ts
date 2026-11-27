import { describe, it, expect } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { isConfigChange, nextSkillOrder, planVersion, unknownSkillIds } from '../src/modules/agents/domain.js';

/** Pure agents rules: no database, no container, plain objects in and out. */

const agent: Agent = {
  id: 'a1',
  name: 'Security',
  description: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  system_prompt: 'Review the diff.',
  output_schema: null,
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

describe('isConfigChange', () => {
  it('is false for an empty patch and for toggling enabled only', () => {
    expect(isConfigChange(agent, {})).toBe(false);
    expect(isConfigChange(agent, { enabled: false })).toBe(false);
  });

  it('is false when a field is set to its current value', () => {
    expect(isConfigChange(agent, { model: 'gpt-4o-mini', name: 'Security' })).toBe(false);
  });

  it.each([
    ['name', { name: 'Perf' }],
    ['description', { description: 'new' }],
    ['provider', { provider: 'anthropic' as const }],
    ['model', { model: 'gpt-4o' }],
    ['system_prompt', { system_prompt: 'Be strict.' }],
    ['strategy', { strategy: 'map-reduce' as const }],
    ['ci_fail_on', { ci_fail_on: 'any' as const }],
    ['repo_intel', { repo_intel: false }],
    ['output_schema (any value)', { output_schema: { type: 'object' } }],
  ])('is true when %s changes', (_field, patch) => {
    expect(isConfigChange(agent, patch)).toBe(true);
  });
});

describe('planVersion', () => {
  it('bumps the version on a config change', () => {
    expect(planVersion(agent, { model: 'gpt-4o' })).toEqual({ bump: true, version: 4 });
  });

  it('keeps the version when only enabled changes', () => {
    expect(planVersion(agent, { enabled: false })).toEqual({ bump: false, version: 3 });
  });
});

describe('nextSkillOrder', () => {
  it('appends when no order is requested', () => {
    expect(nextSkillOrder(2)).toBe(2);
  });

  it('honours a requested order, including 0', () => {
    expect(nextSkillOrder(2, 0)).toBe(0);
  });
});

describe('unknownSkillIds', () => {
  it('returns the requested ids the workspace does not have, in request order', () => {
    expect(unknownSkillIds(['c', 'a', 'b'], ['a'])).toEqual(['c', 'b']);
  });

  it('compares uuids case-insensitively', () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E';
    expect(unknownSkillIds([id], [id.toLowerCase()])).toEqual([]);
  });

  it('returns nothing for an empty request', () => {
    expect(unknownSkillIds([], [])).toEqual([]);
  });
});
