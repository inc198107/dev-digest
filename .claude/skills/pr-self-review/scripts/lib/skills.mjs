/**
 * Discovers the project's skills (`.claude/skills/<name>/SKILL.md`) and reads the few
 * frontmatter fields the router needs. A tiny line-based reader is enough for the flat
 * frontmatter these files use; it is not a general YAML parser.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {object} SkillInfo
 * @property {string} name Skill name (frontmatter `name`, else the folder name).
 * @property {string} dir Folder name below `.claude/skills/`.
 * @property {string} description Frontmatter `description`.
 * @property {string[]} paths Frontmatter `paths` globs, if any.
 */

/**
 * Strip matching surrounding quotes from a scalar.
 * @param {string} value Raw scalar.
 * @returns {string} Unquoted value.
 */
function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) return v.slice(1, -1);
  return v;
}

/**
 * Parse the top-level scalar and list fields of a SKILL.md frontmatter block.
 * @param {string} text Whole SKILL.md content.
 * @returns {Record<string, string | string[]>} Field name → scalar or list of scalars.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  /** @type {Record<string, string | string[]>} */
  const fields = {};
  /** @type {string | null} */
  let listKey = null;
  for (let i = 1; i < lines.length; i += 1) {
    const line = /** @type {string} */ (lines[i]);
    if (line.trim() === '---') break;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const list = /** @type {string[]} */ (fields[listKey]);
      list.push(unquote(item[1] ?? ''));
      continue;
    }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = /** @type {string} */ (kv[1]);
    const raw = (kv[2] ?? '').trim();
    listKey = null;
    if (raw === '') {
      fields[key] = [];
      listKey = key;
    } else if (raw.startsWith('[') && raw.endsWith(']')) {
      fields[key] = raw
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter((s) => s.length > 0);
    } else {
      fields[key] = unquote(raw);
    }
  }
  return fields;
}

/**
 * List every skill folder that has a SKILL.md.
 * @param {string} root Repository root.
 * @returns {SkillInfo[]} Skills sorted by folder name.
 */
export function discoverSkills(root) {
  const base = join(root, '.claude', 'skills');
  if (!existsSync(base)) return [];
  /** @type {SkillInfo[]} */
  const skills = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(base, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const fm = parseFrontmatter(readFileSync(file, 'utf8'));
    const paths = fm.paths;
    skills.push({
      name: typeof fm.name === 'string' && fm.name ? fm.name : entry.name,
      dir: entry.name,
      description: typeof fm.description === 'string' ? fm.description : '',
      paths: Array.isArray(paths) ? paths : typeof paths === 'string' ? paths.split(',').map(unquote) : [],
    });
  }
  return skills.sort((a, b) => a.dir.localeCompare(b.dir));
}
