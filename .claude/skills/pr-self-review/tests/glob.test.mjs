import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globToRegExp, matchesAny } from '../scripts/lib/glob.mjs';

test('** matches any number of segments, including none', () => {
  const re = globToRegExp('server/src/**/*.ts');
  assert.ok(re.test('server/src/app.ts'));
  assert.ok(re.test('server/src/modules/agents/routes.ts'));
  assert.ok(!re.test('server/test/app.ts'));
  assert.ok(!re.test('server/src/app.tsx'));
});

test('* stays inside one segment', () => {
  const re = globToRegExp('server/src/*.ts');
  assert.ok(re.test('server/src/app.ts'));
  assert.ok(!re.test('server/src/modules/index.ts'));
});

test('braces alternate and dots are literal', () => {
  const re = globToRegExp('client/src/**/*.{ts,tsx}');
  assert.ok(re.test('client/src/app/page.tsx'));
  assert.ok(re.test('client/src/lib/api.ts'));
  assert.ok(!re.test('client/src/lib/apixts'));
  assert.ok(!re.test('client/src/globals.css'));
});

test('dot files and a leading ** match', () => {
  assert.ok(matchesAny('server/.env.example', ['**/.env*']));
  assert.ok(matchesAny('.env', ['**/.env*']));
  assert.ok(matchesAny('client/tsconfig.json', ['**/tsconfig*.json']));
  assert.ok(matchesAny('anything/at/all.md', ['**']));
});

test('matchesAny is false for an empty list', () => {
  assert.equal(matchesAny('a.ts', []), false);
  assert.equal(matchesAny('a.ts', undefined), false);
});
