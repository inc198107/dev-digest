import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { buildSkillDraft, fenceLanguage, toKebab, uniqueName } from "./build-skill-draft";

/**
 * @param patch Fields to override.
 * @returns An accepted convention.
 */
function convention(patch: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "c1",
    rule: "Always use async/await instead of .then() chains",
    evidence_path: "src/api/users.ts:23-31",
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: true,
    ...patch,
  };
}

describe("buildSkillDraft", () => {
  it("builds the name, a directive description and one section per rule with its evidence", () => {
    const draft = buildSkillDraft("payments-api", [
      convention(),
      convention({ id: "c2", rule: "Redis access goes through src/lib/redis.ts singleton", evidence_path: "src/lib/redis.ts:1-9", evidence_snippet: "export const redis = new Redis(config.redisUrl);" }),
    ]);

    expect(draft.name).toBe("payments-api-conventions");
    expect(draft.description).toBe("Flag changes that break the 2 house conventions of payments-api.");
    expect(draft.evidenceFiles).toEqual(["src/api/users.ts:23-31", "src/lib/redis.ts:1-9"]);
    expect(draft.body).toBe(
      [
        "# payments-api-conventions",
        "House conventions for `payments-api`. Flag changes that violate any rule below and cite the offending `file:line`.",
        "## async-await-then-chains",
        "Always use async/await instead of .then() chains",
        "Detected in `src/api/users.ts:23-31`:\n```ts\nconst user = await db.users.find(id);\n```",
        "## redis-access-src-lib-redis-ts-singleton",
        "Redis access goes through src/lib/redis.ts singleton",
        "Detected in `src/lib/redis.ts:1-9`:\n```ts\nexport const redis = new Redis(config.redisUrl);\n```",
      ].join("\n\n") + "\n",
    );
  });

  it("avoids taken skill names and repeated headings", () => {
    const draft = buildSkillDraft("payments-api", [convention(), convention({ id: "c2" })], [
      "payments-api-conventions",
      "payments-api-conventions-2",
    ]);
    expect(draft.name).toBe("payments-api-conventions-3");
    expect(draft.body).toContain("## async-await-then-chains\n");
    expect(draft.body).toContain("## async-await-then-chains-2\n");
    expect(draft.description).toContain("2 house conventions");
  });

  it("uses a longer fence when the snippet holds backticks and skips an empty snippet", () => {
    const draft = buildSkillDraft("r", [
      convention({ evidence_snippet: "const s = ```;" }),
      convention({ id: "c2", rule: "Second rule", evidence_snippet: "  " }),
    ]);
    expect(draft.body).toContain("````ts\nconst s = ```;\n````");
    expect(draft.body).toContain("## second-rule\n\nSecond rule\n");
    expect(draft.description).toContain("2 house conventions");
  });

  it("says convention for a single rule", () => {
    expect(buildSkillDraft("r", [convention()]).description).toBe("Flag changes that break the 1 house convention of r.");
  });
});

describe("helpers", () => {
  it("toKebab lower-cases, drops filler words on request and cuts at a word", () => {
    expect(toKebab("My Repo_Name conventions", 64)).toBe("my-repo-name-conventions");
    expect(toKebab("Always use the Result type", 64, true)).toBe("result-type");
    expect(toKebab("alpha beta gamma", 10)).toBe("alpha-beta");
  });

  it("uniqueName keeps the limit when it adds a suffix", () => {
    const base = "a".repeat(64);
    expect(uniqueName(base, [base])).toBe(`${"a".repeat(62)}-2`);
  });

  it("fenceLanguage reads the extension after dropping the line range", () => {
    expect(fenceLanguage("src/a.tsx:1-4")).toBe("tsx");
    expect(fenceLanguage("scripts/run.py:3")).toBe("python");
    expect(fenceLanguage("Makefile:1")).toBe("");
  });
});
