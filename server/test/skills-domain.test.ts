import { describe, it, expect } from 'vitest';
import { MAX_SKILL_NOTE_CHARS } from '@devdigest/shared';
import {
  acceptRate,
  cleanVersionNote,
  decodeSkillText,
  draftBodyProblem,
  draftFromMarkdown,
  fileKind,
  fileNameFromUrl,
  firstParagraph,
  formatSkillBlock,
  ignoredReason,
  isModelVisibleChange,
  normalizeSkillUrl,
  planSkillVersion,
  pullFrequency,
  ratio,
  restoreNote,
  selectSkillCore,
  slugifySkillName,
  splitFrontmatter,
  stripHiddenCharacters,
  hiddenOnlyProblem,
  toSkillStats,
  toSkillStatsSummary,
  withoutHiddenCharacters,
} from '../src/modules/skills/domain.js';

/** Pure skills rules: no Postgres, no Fastify, no fakes needed. */

const SKILL = { name: 'untested-branches', description: 'Flag untested branches.', body: '# Body', version: 2 };

describe('skill versioning', () => {
  it('bumps on a model-visible change only', () => {
    expect(planSkillVersion(SKILL, { body: '# New' })).toEqual({ bump: true, version: 3 });
    expect(planSkillVersion(SKILL, { description: 'Other.' })).toEqual({ bump: true, version: 3 });
    expect(planSkillVersion(SKILL, { name: 'renamed' })).toEqual({ bump: true, version: 3 });
    expect(planSkillVersion(SKILL, { type: 'security', enabled: false })).toEqual({ bump: false, version: 2 });
  });

  it('an unchanged value is not a change', () => {
    expect(isModelVisibleChange(SKILL, { body: '# Body', name: 'untested-branches' })).toBe(false);
  });
});

describe('version notes', () => {
  it('a note never decides a version bump', () => {
    expect(planSkillVersion(SKILL, { note: 'Tightened wording' } as never)).toEqual({ bump: false, version: 2 });
    expect(planSkillVersion(SKILL, { body: '# New', note: 'x' })).toEqual({ bump: true, version: 3 });
  });

  it('cleans a note: invisible characters out, whitespace collapsed, blank is no note', () => {
    expect(cleanVersionNote('  Tightened\n  the   rubric\u200B ')).toBe('Tightened the rubric');
    expect(cleanVersionNote('\u200B\u202E  ')).toBeNull();
    expect(cleanVersionNote('')).toBeNull();
    expect(cleanVersionNote(undefined)).toBeNull();
    expect(cleanVersionNote(null)).toBeNull();
    expect(cleanVersionNote('x'.repeat(MAX_SKILL_NOTE_CHARS + 50))).toHaveLength(MAX_SKILL_NOTE_CHARS);
  });

  it('a restore is noted with the restored version', () => {
    expect(restoreNote(3)).toBe('Restored from v3');
  });
});

describe('skill stats rates', () => {
  it('ratio is null without a denominator and clamped to [0, 1]', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 3)).toBe(0);
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
    expect(ratio(5, 4)).toBe(1);
    expect(ratio(-1, 4)).toBe(0);
    expect(ratio(1, Number.NaN)).toBeNull();
  });

  it('pull frequency is skill runs over all runs; null without runs', () => {
    expect(pullFrequency(2, 3)).toBeCloseTo(2 / 3);
    expect(pullFrequency(0, 5)).toBe(0);
    expect(pullFrequency(0, 0)).toBeNull();
  });

  it('accept rate counts decided findings only; null when none was decided', () => {
    expect(acceptRate(3, 1)).toBe(0.75);
    expect(acceptRate(0, 2)).toBe(0);
    expect(acceptRate(0, 0)).toBeNull();
  });

  it('maps counts to the summary and the full stats', () => {
    const counts = { skillId: 's1', usedBy: 2, skillRuns: 1, findings: 5, accepted: 1, dismissed: 3 };
    expect(toSkillStatsSummary(counts, 4)).toEqual({ skill_id: 's1', used_by: 2, pull_frequency: 0.25, accept_rate: 0.25 });
    expect(toSkillStats(counts, 4, [{ category: 'bug', count: 5 }])).toEqual({
      skill_id: 's1',
      used_by: 2,
      runs_30d: 4,
      skill_runs_30d: 1,
      pull_frequency: 0.25,
      accept_rate: 0.25,
      findings_30d: 5,
      findings_by_category: [{ category: 'bug', count: 5 }],
    });
    expect(toSkillStatsSummary({ ...counts, skillRuns: 0, accepted: 0, dismissed: 0 }, 0)).toMatchObject({
      pull_frequency: null,
      accept_rate: null,
    });
  });
});

describe('formatSkillBlock', () => {
  it('renders the name, the one-line description and the trimmed body', () => {
    expect(formatSkillBlock({ name: 'n', description: 'Flag\n  this  now.', body: '\n# B\n\ntext\n' })).toBe(
      '### Skill: n\n> Flag this now.\n\n# B\n\ntext',
    );
  });
});

describe('splitFrontmatter', () => {
  it('returns the whole text as body when there is no frontmatter', () => {
    expect(splitFrontmatter('# Title\nbody')).toEqual({ meta: {}, body: '# Title\nbody' });
  });

  it('strips a BOM, normalizes CRLF and reads plain, quoted and commented scalars', () => {
    const text = '\uFEFF---\r\nname: my-skill\r\ndescription: "Flag \\"quoted\\" things"\r\ntype: rubric # main\r\n---\r\n# Body\r\n';
    expect(splitFrontmatter(text)).toEqual({
      meta: { name: 'my-skill', description: 'Flag "quoted" things', type: 'rubric' },
      body: '# Body\n',
    });
  });

  it('reads block scalars and continuation lines and skips nested maps', () => {
    const text = [
      '---',
      "name: 'single ''quoted'''",
      'description: >-',
      '  Flag tests that',
      '  mock the subject.',
      'notes: |',
      '  line one',
      '  line two',
      'summary: first part',
      '  second part',
      'metadata:',
      '  version: "1.0.0"',
      '---',
      'body',
    ].join('\n');
    expect(splitFrontmatter(text).meta).toEqual({
      name: "single 'quoted'",
      description: 'Flag tests that mock the subject.',
      notes: 'line one\nline two',
      summary: 'first part second part',
    });
  });

  it('accepts an empty frontmatter block', () => {
    expect(splitFrontmatter('---\n---\nbody')).toEqual({ meta: {}, body: 'body' });
  });
});

describe('slugifySkillName', () => {
  it('turns any text into kebab-case ASCII of at most 64 characters', () => {
    expect(slugifySkillName('Flaky Tests (v2)!')).toBe('flaky-tests-v2');
    expect(slugifySkillName('Ünïcödé — names')).toBe('unicode-names');
    expect(slugifySkillName('a'.repeat(80))).toHaveLength(64);
    expect(slugifySkillName('---')).toBe('imported-skill');
  });
});

describe('draftFromMarkdown', () => {
  it('maps frontmatter to fields without warnings when everything is present', () => {
    const draft = draftFromMarkdown('---\nname: boundary-cases\ndescription: Flag edges.\ntype: Rubric\n---\n\n# B\n', 'x');
    expect(draft).toEqual({ name: 'boundary-cases', description: 'Flag edges.', type: 'rubric', body: '# B', warnings: [] });
  });

  it('falls back to the file name, the first paragraph and custom, with warnings', () => {
    const draft = draftFromMarkdown('# Title\n\nChecks *flaky* tests.\n\n- a', 'Flaky Tests');
    expect(draft).toMatchObject({ name: 'flaky-tests', description: 'Checks flaky tests.', type: 'custom' });
    expect(draft.warnings).toHaveLength(2);
  });

  it('warns about an unknown type and a converted name', () => {
    const draft = draftFromMarkdown('---\nname: My Skill\ndescription: d\ntype: lint\n---\nbody', 'x');
    expect(draft).toMatchObject({ name: 'my-skill', type: 'custom' });
    expect(draft.warnings.join(' ')).toMatch(/kebab-case.*Unknown type "lint"/s);
  });

  it('asks for a description when none can be derived', () => {
    const draft = draftFromMarkdown('---\nname: n\n---\n# Only a heading', 'x');
    expect(draft.description).toBe('');
    expect(draft.warnings.join(' ')).toMatch(/write one before saving/);
  });
});

describe('import hardening', () => {
  it('parses a frontmatter value with a huge blank run in linear time (no ReDoS)', () => {
    const text = `---\nname: a${' '.repeat(500_000)}b\ndescription: d\n---\nbody`;
    const started = Date.now();
    const draft = draftFromMarkdown(text, 'x');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(draft.body).toBe('body');
  });

  it('still strips a trailing comment from a plain scalar', () => {
    expect(splitFrontmatter('---\ntype: rubric   # main\n---\n').meta.type).toBe('rubric');
  });

  it('removes invisible characters before the preview and says how many', () => {
    const tag = String.fromCodePoint(0xe0041, 0xe0042);
    const text = `---\nname: safe\ndescription: Flag\u200B things.\n---\nCheck tests.${tag}\u202E`;
    const draft = draftFromMarkdown(text, 'x');
    expect(draft.description).toBe('Flag things.');
    expect(draft.body).toBe('Check tests.');
    expect(draft.warnings.join(' ')).toMatch(/Removed 4 invisible character/);
    expect(stripHiddenCharacters('plain text')).toEqual({ text: 'plain text', removed: 0 });
  });

  it('covers variation selectors, bidi marks, fillers and controls, and keeps tab and newlines', () => {
    const smuggled = `a\uFE00\u{E0100}\u061C\u3164\u034F\u0007\u009Fb\t\r\nc`;
    expect(stripHiddenCharacters(smuggled)).toEqual({ text: 'ab\t\r\nc', removed: 7 });
  });

  it('parses a key followed by a huge blank run and U+2028 in linear time', () => {
    const text = `---\nname:${' '.repeat(200_000)} x\ndescription: d\n---\nbody`;
    const started = Date.now();
    const draft = draftFromMarkdown(text, 'fallback');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(draft.body).toBe('body');
  });

  it('withoutHiddenCharacters strips only the text fields and hiddenOnlyProblem flags emptied ones', () => {
    const patch = withoutHiddenCharacters({ body: 'Check\u200B tests', type: 'rubric' as const, enabled: true });
    expect(patch).toEqual({ body: 'Check tests', type: 'rubric', enabled: true });
    expect(hiddenOnlyProblem(withoutHiddenCharacters({ description: '\u200B\u200B' }))).toMatch(/description holds only invisible/);
    expect(hiddenOnlyProblem({ name: 'ok' })).toBeNull();
  });
});

describe('firstParagraph', () => {
  it('skips headings, lists, quotes and fenced code', () => {
    expect(firstParagraph('# H\n\n```\ncode\n\nmore\n```\n\n> quote\n\nReal text\nhere.')).toBe('Real text here.');
  });
});

describe('draftBodyProblem', () => {
  it('rejects an empty or oversized body', () => {
    expect(draftBodyProblem({ body: '  \n' })).toMatch(/no body/);
    expect(draftBodyProblem({ body: 'x'.repeat(20_001) })).toMatch(/limit is 20000/);
    expect(draftBodyProblem({ body: 'ok' })).toBeNull();
  });
});

describe('selectSkillCore', () => {
  it('takes the shallowest SKILL.md and lists everything else with a reason', () => {
    const result = selectSkillCore([
      'pkg/SKILL.md',
      'pkg/nested/SKILL.md',
      'pkg/scripts/run.sh',
      'pkg/references/notes.md',
      'pkg/assets/logo.png',
      'pkg/tool.py',
    ]);
    expect(result).toEqual({
      ok: true,
      core: 'pkg/SKILL.md',
      folderName: 'pkg',
      ignored: [
        { path: 'pkg/nested/SKILL.md', reason: 'not_skill_core' },
        { path: 'pkg/scripts/run.sh', reason: 'executable' },
        { path: 'pkg/references/notes.md', reason: 'not_skill_core' },
        { path: 'pkg/assets/logo.png', reason: 'binary' },
        { path: 'pkg/tool.py', reason: 'executable' },
      ],
    });
  });

  it('never takes a core from a scripts folder, an unsafe path or OS junk', () => {
    const result = selectSkillCore(['scripts/SKILL.md', '../SKILL.md', '__MACOSX/pkg/._SKILL.md', 'README.md']);
    expect(result).toMatchObject({ ok: true, core: 'README.md', folderName: '' });
  });

  it('falls back to the only Markdown file and fails without one or with several', () => {
    expect(selectSkillCore(['skill/rules.md', 'skill/run.sh'])).toMatchObject({ ok: true, core: 'skill/rules.md' });
    expect(selectSkillCore(['run.sh'])).toMatchObject({ ok: false, problem: expect.stringMatching(/no SKILL.md/) });
    expect(selectSkillCore(['a.md', 'b.md'])).toMatchObject({ ok: false, problem: expect.stringMatching(/several/) });
  });

  it('normalizes backslashes but keeps the stored entry name for reading', () => {
    expect(selectSkillCore(['pkg\\SKILL.md'])).toMatchObject({ ok: true, core: 'pkg\\SKILL.md', folderName: 'pkg' });
  });
});

describe('ignoredReason', () => {
  it('classifies by folder and extension', () => {
    expect(ignoredReason('bin/tool')).toBe('executable');
    expect(ignoredReason('x/hooks/pre.txt')).toBe('executable');
    expect(ignoredReason('fonts/a.woff2')).toBe('binary');
    expect(ignoredReason('LICENSE')).toBe('not_skill_core');
  });
});

describe('fileKind and decodeSkillText', () => {
  it('detects zip by magic bytes or extension and Markdown by extension', () => {
    const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0]);
    expect(fileKind('skill.md', zip)).toBe('archive');
    expect(fileKind('pkg.skill', new Uint8Array([1]))).toBe('archive');
    expect(fileKind('SKILL.MD', new Uint8Array([35]))).toBe('markdown');
    expect(fileKind('run.sh', new Uint8Array([35]))).toBe('unsupported');
  });

  it('accepts UTF-8 text only', () => {
    expect(decodeSkillText(new TextEncoder().encode('héllo'))).toBe('héllo');
    expect(decodeSkillText(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
    expect(decodeSkillText(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull();
  });
});

describe('skill URLs', () => {
  it('reads GitHub file pages raw and keeps other URLs', () => {
    expect(normalizeSkillUrl('https://github.com/acme/skills/blob/main/flaky/SKILL.md')).toBe(
      'https://raw.githubusercontent.com/acme/skills/main/flaky/SKILL.md',
    );
    expect(normalizeSkillUrl('https://example.com/a/SKILL.md')).toBe('https://example.com/a/SKILL.md');
  });

  it('takes the decoded last path segment as the file name', () => {
    expect(fileNameFromUrl('https://example.com/a/my%20skill.md?x=1')).toBe('my skill.md');
  });
});
