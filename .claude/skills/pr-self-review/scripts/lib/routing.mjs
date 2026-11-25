/**
 * Pure routing logic: which skill reviews which changed file, and which deterministic checks a
 * change set triggers. Inputs come from `routing.json`, the discovered skills and the plan's
 * file list; nothing here touches git or the filesystem.
 */
import { matchesAny } from './glob.mjs';

/**
 * @typedef {object} LaneRule
 * @property {string} skill Skill name, or the id of a built-in lane.
 * @property {boolean} [builtin] True for lanes that have no skill folder (`project-rules`).
 * @property {string} [instructions] Repo-relative instructions file of a built-in lane.
 * @property {string[]} include Globs of files the lane reviews.
 * @property {string[]} [exclude] Globs removed from `include`.
 * @property {boolean} [includeDeleted] Also route deleted files.
 * @property {boolean} [includeBinary] Also route binary files.
 * @property {number} [chunk] Max files per subagent for this lane.
 */

/**
 * @typedef {object} CheckRule
 * @property {string} id Stable id, used in reports.
 * @property {string[]} when Globs; the check runs when any changed path matches.
 * @property {string} cwd Repo-relative working directory.
 * @property {string} [command] Shell command.
 * @property {string} [bash] Repo-relative script run with Git Bash instead of `command`.
 * @property {string[]} [requires] Repo-relative paths that must exist, else the check is skipped.
 * @property {string} label Human description.
 */

/**
 * @typedef {object} Routing
 * @property {number} defaultChunk Max files per subagent when a lane sets none.
 * @property {string[]} ignore Skills that never review code.
 * @property {string[]} excludeFiles Globs never routed to any lane (still fingerprinted).
 * @property {LaneRule[]} lanes Lane rules.
 * @property {CheckRule[]} checks Deterministic checks.
 */

/**
 * @typedef {object} PlanFile
 * @property {string} path Repo-relative path.
 * @property {string} status Git status letter (`U` = untracked).
 * @property {string} [oldPath] Previous path of a rename.
 * @property {string} blob Working-tree blob SHA, or `deleted`.
 * @property {boolean} binary True when git treats the file as binary.
 */

/**
 * @typedef {object} Lane
 * @property {string} id Unique lane id (`skill` or `skill#n` when chunked).
 * @property {string} skill Skill name or built-in lane id.
 * @property {'routing'|'paths'|'builtin'} source Where the routing came from.
 * @property {string | null} skillFile Repo-relative SKILL.md (or instructions file).
 * @property {{ path: string, status: string, oldPath?: string }[]} files Files to review.
 */

/**
 * Split a list into chunks.
 * @template T
 * @param {T[]} items Items.
 * @param {number} size Max chunk size (≥ 1).
 * @returns {T[][]} Chunks.
 */
function chunk(items, size) {
  const n = Math.max(1, size);
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * Turn the matched files of one lane into one or more lanes.
 * @param {string} skill Lane skill.
 * @param {Lane['source']} source Routing source.
 * @param {string | null} skillFile SKILL.md or instructions path.
 * @param {PlanFile[]} files Matched files.
 * @param {number} size Chunk size.
 * @returns {Lane[]} Lanes.
 */
function toLanes(skill, source, skillFile, files, size) {
  const parts = chunk(files, size);
  return parts.map((part, i) => ({
    id: parts.length > 1 ? `${skill}#${i + 1}` : skill,
    skill,
    source,
    skillFile,
    files: part.map((f) => (f.oldPath ? { path: f.path, status: f.status, oldPath: f.oldPath } : { path: f.path, status: f.status })),
  }));
}

/**
 * Route changed files to review lanes.
 * @param {PlanFile[]} files Changed files of the plan.
 * @param {Routing} routing Parsed `routing.json`.
 * @param {import('./skills.mjs').SkillInfo[]} skills Discovered skills.
 * @returns {{ lanes: Lane[], unroutedSkills: { name: string, description: string }[], missingSkills: string[], uncoveredFiles: string[] }}
 *   Lanes to run, skills with no routing, routed skills with no folder, and code files that only
 *   the built-in lanes look at.
 */
export function buildLanes(files, routing, skills) {
  const routable = files.filter((f) => !matchesAny(f.path, routing.excludeFiles));
  /** @type {Lane[]} */
  const lanes = [];
  /** @type {string[]} */
  const missingSkills = [];
  const covered = new Set();
  const routed = new Set(routing.lanes.map((l) => l.skill));

  for (const rule of routing.lanes) {
    const skill = rule.builtin ? null : skills.find((s) => s.name === rule.skill || s.dir === rule.skill);
    if (!rule.builtin && !skill) {
      missingSkills.push(rule.skill);
      continue;
    }
    const matched = routable.filter(
      (f) =>
        (rule.includeDeleted || f.blob !== 'deleted') &&
        (rule.includeBinary || !f.binary) &&
        matchesAny(f.path, rule.include) &&
        !matchesAny(f.path, rule.exclude),
    );
    if (matched.length === 0) continue;
    if (!rule.builtin) matched.forEach((f) => covered.add(f.path));
    const skillFile = rule.builtin ? (rule.instructions ?? null) : `.claude/skills/${skill?.dir}/SKILL.md`;
    lanes.push(...toLanes(rule.skill, rule.builtin ? 'builtin' : 'routing', skillFile, matched, rule.chunk ?? routing.defaultChunk));
  }

  /** @type {{ name: string, description: string }[]} */
  const unroutedSkills = [];
  for (const skill of skills) {
    if (routed.has(skill.name) || routed.has(skill.dir) || routing.ignore.includes(skill.name) || routing.ignore.includes(skill.dir)) {
      continue;
    }
    if (skill.paths.length === 0) {
      unroutedSkills.push({ name: skill.name, description: skill.description });
      continue;
    }
    const matched = routable.filter((f) => f.blob !== 'deleted' && !f.binary && matchesAny(f.path, skill.paths));
    matched.forEach((f) => covered.add(f.path));
    if (matched.length > 0) {
      lanes.push(...toLanes(skill.name, 'paths', `.claude/skills/${skill.dir}/SKILL.md`, matched, routing.defaultChunk));
    }
  }

  const uncoveredFiles = routable
    .filter((f) => f.blob !== 'deleted' && !f.binary && !covered.has(f.path))
    .map((f) => f.path);
  return { lanes, unroutedSkills, missingSkills, uncoveredFiles };
}

/**
 * Pick the deterministic checks a change set triggers.
 * @param {PlanFile[]} files Changed files (deleted ones count: removing a file can break a build).
 * @param {CheckRule[]} checks Check rules.
 * @returns {CheckRule[]} Triggered checks, in rule order.
 */
export function selectChecks(files, checks) {
  return checks.filter((c) => files.some((f) => matchesAny(f.path, c.when) || (f.oldPath ? matchesAny(f.oldPath, c.when) : false)));
}
