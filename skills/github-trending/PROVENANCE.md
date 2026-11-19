# Provenance — github-trending

This skill is ported from [morphph/agentic-os](https://github.com/morphph/agentic-os) at commit `3262ca00e1de14df4f899df279d314da04415dc2`. This file is generated from `provenance.json` by `node scripts/provenance.mjs`; edit that file, not this one.

| | Source |
|---|---|
| Rubric | `obsidian-v2/workflow-references/github-trending.md` |
| Task and runner contract | `obsidian-v2/runner/original-workflows.mjs originalPrompt('github-trending')` |
| Report path | `obsidian-v2/runner/original-workflows.mjs deliverablePathFor('github-trending')` |
| Bundled tools | `github-trending` (content-os tools 1.0.0) |
| Bundled references | none |

## Fidelity rule

- The Rubric section of SKILL.md equals the upstream rubric (its body, when the source has frontmatter) with exactly the rewrites below applied in order. `tests/fidelity.test.mjs` checks this against the snapshot in `upstream/agentic-os/`.
- Every line of the Upstream execution contract section, with the rewrites below reversed, is found verbatim in the upstream `original-workflows.mjs` or `workflows.mjs`.
- The section "Running this skill in content-os" is new content-os text and is not an upstream quotation.

## Registered rewrites (3)

### `description` — frontmatter `description`

**Reason:** The original description named the agentic-os runner and cockpit card that triggered the script; a skill is triggered by the user or by Morning Intel.

Original:

```text
Direct-exec (no AI in loop) — runner spawns the Python script directly. Use when the cockpit "GitHub Trending" card fires a refresh-new intent, or when manually invoked via /github-trending.
```

Replacement:

```text
Deterministic (no AI in the loop) — run the bundled script and return its report unchanged. Use when asked for GitHub trending repos, before Morning Intel, or when invoked via /github-trending.
```

### `invoke` — Rubric

**Reason:** The agentic-os runner (direct-exec set) launched the script; in content-os the bundled run.mjs wrapper does, with the same retry rule as directWorkflow in workflows.mjs.

Original:

```text
## How runner invokes

Listed in `runner.js → isDirectExec` set. Runner spawns `python scripts/fetch.py` with `cwd: VAULT_ROOT`. Script writes the file. Runner logs exit code + first line.
```

Replacement:

```text
## How content-os invokes

Run `node <skill-dir>/scripts/github-trending/run.mjs`. It runs the unchanged `scripts/github-trending/fetch.py` with the vault as its output root (up to three attempts on HTTP 502/503/504, timeouts and connection resets, as the agentic-os runner did), then prints the snapshot the script wrote.
```

### `manual` — Rubric

**Reason:** The script path and default vault were agentic-os installation paths. fetch.py itself is unchanged; content-os always gives it the vault through AGENTIC_OS_VAULT, which also keeps it from reading any agentic-os dotenv file.

Original:

````text
```bash
python "<starter>/obsidian-v2/runner/scripts/github-trending/fetch.py"
```

Writes to vault if `AGENTIC_OS_VAULT` env var set, else `~/the-vault`.
````

Replacement:

````text
```bash
AGENTIC_OS_VAULT="$CONTENT_OS_VAULT" python3 "<skill-dir>/scripts/github-trending/fetch.py"
```

Writes to the directory in `AGENTIC_OS_VAULT`. Always set it (run.mjs does): without it the unchanged script falls back to its agentic-os defaults.
````
