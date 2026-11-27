/**
 * Built-in skills of the Test Quality Reviewer, used by the seed. A skill is text only: its
 * name and description head the block, its body is the checklist appended to the agent's
 * prompt under `## Skills / rules`. The description is the skill's interface, written as a
 * directive. The DB row is the source of truth at run time; editing a body here only affects
 * freshly seeded workspaces. The fourth skill of the agent, `flaky-test-patterns`, is not
 * seeded: it is imported through the UI from `docs/examples/skills/` to exercise the import.
 */

/** A seeded skill, in the order it is linked to the Test Quality Reviewer. */
export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const UNTESTED_BRANCHES_SKILL: SeedSkill = {
  name: 'untested-branches',
  description:
    'Flag every branch, guard or error path added in the diff that no test in the diff exercises.',
  type: 'rubric',
  body: `# Untested branches

Map the changed production code to the tests in the same diff before judging the tests.

## Procedure
1. List every decision point the diff adds or changes in non-test files: \`if\` / \`else\`,
   early \`return\`, \`throw\`, \`switch\` cases, ternaries, \`??\` / \`||\` fallbacks, \`catch\` blocks.
2. For each one, look for a test in the diff whose input drives execution down that path
   and asserts its outcome (return value, thrown error, side effect).
3. Report each path without such a test as one finding.

## Reporting
- Cite the production lines of the untested branch, not the test file.
- Title: "Untested branch: <condition>", e.g. "Untested branch: amount above the balance throws".
- Severity: WARNING when the branch changes the result, throws, or guards money, auth or
  data; SUGGESTION for logging-only or trivially delegating branches.
- Category: \`test\`. Suggest the concrete test: its inputs and the expected outcome.
- One finding per branch; merge both sides of an \`if\` / \`else\` only when neither is tested.

## Do not report
- Branches a test in the diff already covers, even indirectly.
- Code the diff does not touch.`,
};

export const BOUNDARY_CASES_SKILL: SeedSkill = {
  name: 'boundary-cases',
  description:
    'Flag missing tests for boundary inputs of changed code: zero, negative, exact limits, rounding, empty and duplicate values.',
  type: 'rubric',
  body: `# Boundary cases

Happy-path tests pass while the bugs live at the edges. For each function the diff adds or
changes, derive its boundaries from its parameters and conditions, then check the tests.

## Boundaries to derive
- Numbers: 0, negative, the exact limit of a comparison (\`>\` vs \`>=\`), limit ± 1, the maximum.
- Money and ratios: rounding direction, remainders that accumulate over several calls
  (pro-rata parts must add up to the whole), minor units.
- Collections and strings: empty, one element, duplicates, very long input.
- Optional input: \`null\`, \`undefined\`, missing fields.
- Sequences: the first and the last call (the first partial refund vs the final one).

## Reporting
- One finding per boundary that the code treats specially, or where a wrong result is
  plausible, and that no test in the diff covers.
- Cite the line with the comparison or the calculation; name the concrete input and the
  result it should produce.
- Severity: WARNING when a wrong result is plausible at that boundary; SUGGESTION otherwise.
- Category: \`test\`.

## Do not report
- Boundaries the type system already rules out.
- Generic advice ("add more tests") without a specific input.`,
};

export const MOCKING_DISCIPLINE_SKILL: SeedSkill = {
  name: 'mocking-discipline',
  description:
    'Flag tests that mock the unit under test, assert on mock calls instead of behaviour, or mock pure code.',
  type: 'convention',
  body: `# Mocking discipline

Mocks stand in for slow or external collaborators: the network, the database, the clock,
randomness. Everything else runs for real.

## Flag
- The module under test, or a function it owns, is mocked (\`vi.mock\` of its own path,
  \`vi.spyOn(subject, …)\` with a stubbed result).
- Assertions only check that mocks were called (\`toHaveBeenCalledWith\`) while the result
  or the observable state goes unchecked.
- Pure functions, value objects or in-memory data are mocked instead of used.
- A mock returns data the real collaborator cannot return (wrong shape, impossible state).
- A library the project does not own is mocked where a fake of an owned port would do.

## Reporting
- Cite the test lines with the mock or the assertion.
- Severity: WARNING when the mock hides the behaviour the test claims to verify;
  SUGGESTION for a redundant mock.
- Category: \`test\`. Suggest the replacement: the real code, an in-memory fake, or an
  assertion on behaviour.

## Do not report
- Mocks of the network, the clock, randomness or a paid API.`,
};

/** Seeded skills in link order. */
export const TEST_QUALITY_SKILLS: readonly SeedSkill[] = [
  UNTESTED_BRANCHES_SKILL,
  BOUNDARY_CASES_SKILL,
  MOCKING_DISCIPLINE_SKILL,
];
