import { describe, it, expect } from "vitest";
import { evidenceGithubUrl, parseEvidencePath } from "./helpers";

const REPO = { full_name: "acme/payments-api", default_branch: "main" };

describe("parseEvidencePath", () => {
  it("splits a range, a single line and a bare path", () => {
    expect(parseEvidencePath("src/api/users.ts:23-31")).toEqual({ path: "src/api/users.ts", start: 23, end: 31 });
    expect(parseEvidencePath("tsconfig.json:3")).toEqual({ path: "tsconfig.json", start: 3, end: 3 });
    expect(parseEvidencePath("src/api/users.ts")).toEqual({ path: "src/api/users.ts" });
  });

  it("keeps a colon that belongs to the file name", () => {
    expect(parseEvidencePath("docs/a:b.ts:7")).toEqual({ path: "docs/a:b.ts", start: 7, end: 7 });
  });
});

describe("evidenceGithubUrl", () => {
  it("links a line range on the default branch", () => {
    expect(evidenceGithubUrl(REPO, "src/api/users.ts:23-31")).toBe(
      "https://github.com/acme/payments-api/blob/main/src/api/users.ts#L23-L31",
    );
  });

  it("links a single line as #L<n>", () => {
    expect(evidenceGithubUrl(REPO, ".eslintrc.json:4")).toBe(
      "https://github.com/acme/payments-api/blob/main/.eslintrc.json#L4",
    );
  });

  it("encodes the path and the branch but keeps their slashes", () => {
    expect(
      evidenceGithubUrl({ full_name: "acme/web", default_branch: "release/2#1" }, "app/[id]/page.tsx:2-5"),
    ).toBe("https://github.com/acme/web/blob/release/2%231/app/%5Bid%5D/page.tsx#L2-L5");
  });
});
