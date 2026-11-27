# Example skill packages

Skills to import through **Skills → Add skill → Import from file** (or from URL). They exercise
the whole import path: upload → preview → confirm → link to an agent.

| File | What it is |
|---|---|
| `flaky-test-patterns/` | A Claude-style skill package: `SKILL.md` (the core), `references/` and `scripts/` |
| `flaky-test-patterns.zip` | The same package, zipped: upload this one |
| `flaky-test-patterns/SKILL.md` | Can also be uploaded on its own as a Markdown skill |

## What the import does with the archive
- It takes `flaky-test-patterns/SKILL.md` as the skill core and reads `name`, `description` and
  `type` from its frontmatter.
- It lists `references/patterns.md` as *not skill core* and `scripts/detect-flaky.sh` as
  *executable, not processed*. Neither is read, unpacked or run.
- It stores nothing until you press **Save skill** in the preview.

`scripts/detect-flaky.sh` writes `$TMPDIR/devdigest-skill-script-ran` (or
`/tmp/devdigest-skill-script-ran`) if anything ever executes it. After an import that file must
not exist.

## Trust
An imported skill is someone else's instructions inside your agent's prompt. Read the whole
body in the preview before saving, the way you would review a dependency.

## Rebuild the zip
After editing the folder, from the repo root:

```sh
# Git Bash / macOS / Linux
(cd docs/examples/skills && rm -f flaky-test-patterns.zip && zip -r flaky-test-patterns.zip flaky-test-patterns)
```

```powershell
# PowerShell
Compress-Archive -Path docs/examples/skills/flaky-test-patterns -DestinationPath docs/examples/skills/flaky-test-patterns.zip -Force
```
