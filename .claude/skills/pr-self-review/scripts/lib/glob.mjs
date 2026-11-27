/**
 * Minimal glob matcher for repo-relative POSIX paths. No dependencies, so the scripts run on a
 * bare Node 22 without any package install.
 *
 * Supported syntax: `**` (any number of path segments, including none), `*` (any characters
 * inside one segment), `?` (one character inside a segment) and `{a,b}` (alternation, nestable).
 * Dot files match like any other file.
 */

/** @type {Map<string, RegExp>} */
const cache = new Map();

/**
 * Escape one literal character for use in a regular expression.
 * @param {string} ch Single character.
 * @returns {string} Escaped character.
 */
function escapeChar(ch) {
  return /[.+^$()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Convert a glob pattern to an anchored regular expression.
 * @param {string} glob Pattern such as `client/src/**\/*.{ts,tsx}`.
 * @returns {RegExp} Regular expression that matches the whole path.
 */
export function globToRegExp(glob) {
  const hit = cache.get(glob);
  if (hit) return hit;
  let re = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      const atSegmentStart = i === 0 || glob[i - 1] === '/';
      if (atSegmentStart && glob[i + 2] === '/') {
        re += '(?:[^/]*/)*';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (ch === '*') {
      re += '[^/]*';
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '{') {
      depth += 1;
      re += '(?:';
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      re += ')';
    } else if (ch === ',' && depth > 0) {
      re += '|';
    } else {
      re += escapeChar(ch);
    }
  }
  const compiled = new RegExp(`^${re}$`);
  cache.set(glob, compiled);
  return compiled;
}

/**
 * Test a path against a list of globs.
 * @param {string} path Repo-relative POSIX path.
 * @param {readonly string[] | undefined} globs Patterns; an empty or missing list matches nothing.
 * @returns {boolean} True when at least one pattern matches.
 */
export function matchesAny(path, globs) {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => globToRegExp(g).test(path));
}
