#!/usr/bin/env node
/**
 * Step 3 of pr-self-review: validate the reviewers' findings, add the check results, prove the
 * working tree did not change while the review ran, and store the branch verdict that the gate
 * (gate.mjs) reads. Also writes a human-readable `report.md` into the run folder.
 *
 * Usage: node .claude/skills/pr-self-review/scripts/record.mjs [<runDir|runId>]
 *
 * Reads `findings.json` (a JSON array, `[]` when nothing was found) from the run folder, and
 * the optional `waivers.json` (`[{ "id": "F3" | "skill": "check:<id>", "by": "user",
 * "reason": "…" }]`, written only on the user's explicit request). Recording the same run again
 * after adding waivers is allowed while the working tree is unchanged.
 * Exit codes: 0 = PASS, 1 = BLOCK (unwaived critical findings), 2 = error.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectFiles, diffFingerprints } from './lib/changes.mjs';
import { repoRoot } from './lib/git.mjs';
import { pruneRuns, readRunFile, resolveRunDir } from './lib/runs.mjs';
import { SEVERITIES, applyWaivers, checkFindings, countFindings, isBlocking, validateFindings, validateWaivers, writeVerdict } from './lib/verdict.mjs';

/** Run folders kept after recording. */
const KEEP_RUNS = 10;

/**
 * Format one finding for report.md.
 * @param {import('./lib/verdict.mjs').Finding} f Finding.
 * @returns {string} Markdown block.
 */
function renderFinding(f) {
  const where = f.file ? `\`${f.file}${f.line ? `:${f.line}` : ''}\`` : 'whole change';
  const by = [f.skill, ...(f.alsoReportedBy ?? [])].join(', ');
  const lines = [`### [${f.id}] ${f.title}`, '', `${where} · ${by}${f.rule ? ` · ${f.rule}` : ''}${f.carried ? ' · carried from an earlier run' : ''}`];
  if (f.waived) lines.push('', `**Waived by the user:** ${f.waived.reason}`);
  if (f.scenario) lines.push('', `**Scenario:** ${f.scenario}`);
  if (f.evidence) lines.push('', '```', f.evidence.trimEnd(), '```');
  if (f.fix) lines.push('', `**Fix:** ${f.fix}`);
  return lines.join('\n');
}

/**
 * Build report.md.
 * @param {any} plan Plan of the run.
 * @param {import('./lib/verdict.mjs').Verdict} verdict Verdict.
 * @param {{ id: string, status: string, durationMs?: number }[]} checks Check results.
 * @returns {string} Markdown.
 */
function renderReport(plan, verdict, checks) {
  const blocking = verdict.findings.filter(isBlocking);
  const head = verdict.verdict === 'block' ? `**Verdict: BLOCK** (${blocking.length} critical)` : '**Verdict: PASS**';
  const laneSummary = plan.lanes.map((/** @type {any} */ l) => `${l.id} (${l.files.length})`).join(', ') || 'none';
  const checkIcon = (/** @type {string} */ s) => (s === 'pass' ? '✔' : s === 'fail' ? '✘' : '–');
  const out = [
    `# PR self-review — ${verdict.branch}`,
    '',
    head,
    '',
    `- Base: ${verdict.base.ref} @ ${verdict.base.sha.slice(0, 8)} · HEAD ${verdict.head.slice(0, 8)} · run ${verdict.runId} · ${verdict.createdAt}`,
    `- Files: ${plan.counts.files} changed, ${plan.counts.reviewed} reviewed${plan.counts.carried ? `, ${plan.counts.carried} finding(s) carried over` : ''}`,
    `- Lanes: ${laneSummary}`,
    `- Checks: ${checks.map((c) => `${checkIcon(c.status)} ${c.id}`).join(' · ') || 'none'}`,
    `- Counts: ${SEVERITIES.map((s) => `${s} ${verdict.counts[s] ?? 0}`).join(' · ')} · waived ${verdict.counts.waived ?? 0}`,
  ];
  for (const sev of SEVERITIES) {
    const list = verdict.findings.filter((f) => f.severity === sev && !f.waived);
    if (list.length === 0) continue;
    out.push('', `## ${sev[0]?.toUpperCase()}${sev.slice(1)} (${list.length})`, '', list.map(renderFinding).join('\n\n'));
  }
  const waived = verdict.findings.filter((f) => f.waived);
  if (waived.length > 0) out.push('', `## Waived (${waived.length})`, '', waived.map(renderFinding).join('\n\n'));
  const notes = [];
  if (plan.unroutedSkills.length > 0) notes.push(`- Skills without routing: ${plan.unroutedSkills.map((/** @type {any} */ s) => s.name).join(', ')}`);
  if (plan.missingSkills.length > 0) notes.push(`- Routed skills that do not exist: ${plan.missingSkills.join(', ')}`);
  if (plan.uncoveredFiles.length > 0) notes.push(`- Files only the project-rules lane reviewed: ${plan.uncoveredFiles.length}`);
  if (plan.incremental?.refused) notes.push(`- Incremental run refused: ${plan.incremental.refused}`);
  if (notes.length > 0) out.push('', '## Notes', '', ...notes);
  return `${out.join('\n')}\n`;
}

try {
  const root = repoRoot(process.cwd());
  const runDir = resolveRunDir(root, process.argv[2]);
  const plan = readRunFile(runDir, 'plan.json');

  const rawFindings = readRunFile(runDir, 'findings.json');
  if (rawFindings === undefined) throw new Error(`missing ${join(runDir, 'findings.json')}: write the merged findings (or []) first`);
  const laneFindings = validateFindings(rawFindings);

  /** @type {any[] | undefined} */
  const checks = readRunFile(runDir, 'checks.json');
  if (plan.checks.length > 0 && !checks) throw new Error('checks.json is missing: wait for run-checks.mjs to finish');

  const now = Object.fromEntries(collectFiles(root, plan.base.sha).map((f) => [f.path, f.blob]));
  const drift = diffFingerprints(plan.fingerprint, now);
  if (drift.length > 0) {
    const list = drift.slice(0, 15).map((p) => `  - ${p}`).join('\n');
    throw new Error(`files changed while the review ran, so this run cannot be recorded:\n${list}\nStart a new run (plan.mjs, or plan.mjs --incremental after fixes).`);
  }

  /** @type {import('./lib/verdict.mjs').Finding[]} */
  const carried = (plan.carried ?? []).map((/** @type {any} */ f, /** @type {number} */ i) => ({ ...f, id: `K${i + 1}` }));
  const findings = applyWaivers([...checkFindings(checks ?? []), ...laneFindings, ...carried], validateWaivers(readRunFile(runDir, 'waivers.json')));
  const outside = laneFindings.filter((f) => f.file && !(f.file in plan.fingerprint));
  const blocking = findings.filter(isBlocking);

  /** @type {import('./lib/verdict.mjs').Verdict} */
  const verdict = {
    schema: 1,
    branch: plan.branch,
    runId: plan.runId,
    createdAt: new Date().toISOString(),
    base: plan.base,
    head: plan.head,
    files: plan.fingerprint,
    verdict: blocking.length > 0 ? 'block' : 'pass',
    counts: countFindings(findings),
    findings,
    checks: (checks ?? []).map((c) => ({ id: c.id, status: c.status })),
  };
  const verdictFile = writeVerdict(root, verdict);
  writeFileSync(join(runDir, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  const reportFile = join(runDir, 'report.md');
  writeFileSync(reportFile, renderReport(plan, verdict, checks ?? []));
  pruneRuns(root, KEEP_RUNS);

  const c = verdict.counts;
  process.stdout.write(
    `${verdict.verdict.toUpperCase()}: critical ${c.critical}, major ${c.major}, minor ${c.minor}, nit ${c.nit}, waived ${c.waived}\n` +
      `report:  ${reportFile}\nverdict: ${verdictFile}\n`,
  );
  if (outside.length > 0) {
    process.stdout.write(`warning: ${outside.length} finding(s) cite files outside the change set; the gate ignores them: ${outside.map((f) => f.id).join(', ')}\n`);
  }
  for (const f of blocking) process.stdout.write(`  ✘ [${f.id}] ${f.skill}: ${f.title}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''}\n`);
  process.exit(verdict.verdict === 'block' ? 1 : 0);
} catch (err) {
  process.stderr.write(`pr-self-review record: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
