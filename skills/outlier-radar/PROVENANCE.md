# Provenance — outlier-radar

This skill is ported from [morphph/agentic-os](https://github.com/morphph/agentic-os) at commit `3262ca00e1de14df4f899df279d314da04415dc2`. This file is generated from `provenance.json` by `node scripts/provenance.mjs`; edit that file, not this one.

| | Source |
|---|---|
| Rubric | `obsidian-v2/workflow-references/outlier-radar.md` |
| Task and runner contract | `obsidian-v2/runner/original-workflows.mjs originalPrompt('outlier-radar'), obsidian-v2/runner/workflows.mjs workflowPrompt` |
| Report path | `obsidian-v2/runner/original-workflows.mjs deliverablePathFor('outlier-radar')` |
| Bundled tools | `youtube-data`, `reports` (content-os tools 1.0.0) |
| Bundled references | `shared:youtube-data` |

## Fidelity rule

- The Rubric section of SKILL.md equals the upstream rubric (its body, when the source has frontmatter) with exactly the rewrites below applied in order. `tests/fidelity.test.mjs` checks this against the snapshot in `upstream/agentic-os/`.
- Every line of the Upstream execution contract section, with the rewrites below reversed, is found verbatim in the upstream `original-workflows.mjs` or `workflows.mjs`.
- The section "Running this skill in content-os" is new content-os text and is not an upstream quotation.

## Registered rewrites (5)

### `contract-header` — Upstream execution contract

**Reason:** agentic-os interpolated its vault path into the prompt; content-os resolves the vault from --vault / CONTENT_OS_VAULT (defined in the adapter section).

Original:

```text
Execute this Agentic OS workflow using the selected provider. Vault root: ${root}.
```

Replacement:

```text
Execute this content-os workflow using the selected provider. Vault root: the content-os vault (see Terms above).
```

### `contract-youtube-tool` — Upstream execution contract

**Reason:** agentic_vault was the agentic-os MCP server name; content-os bundles the same tool as a script.

Original:

```text
agentic_vault youtube_research_data;
```

Replacement:

```text
`youtube_research_data` (`scripts/youtube-data.mjs`);
```

### `contract-output-owner` — Upstream execution contract

**Reason:** agentic-os has a bridge that saves the returned report. content-os has no bridge: the skill saves the report itself with the bundled reports.mjs (same vault-relative path rules as agentic-os) and still returns the complete Markdown.

Original:

```text
OUTPUT CONTRACT: The bridge owns the final report at ${destinationFor(job)}.
```

Replacement:

```text
OUTPUT CONTRACT: This skill saves the final report itself with `scripts/reports.mjs save --skill outlier-radar` (step "Save" above), under the vault at `inbox/research/outlier-radar/YYYY-MM-DD-outliers-<id>.md`.
```

### `contract-output-destination` — Upstream execution contract

**Reason:** In content-os the skill writes the destination, but only through reports.mjs save, which never overwrites an existing report.

Original:

```text
Do not write that destination yourself or substitute
```

Replacement:

```text
Do not write that destination any other way, or substitute
```

### `save` — Rubric

**Reason:** agentic-os has a bridge that saves the returned report. content-os has no bridge: the skill saves the report itself with the bundled reports.mjs (same vault-relative path rules as agentic-os) and still returns the complete Markdown.

Original:

```text
The bridge stores the complete report.
```

Replacement:

```text
Save the complete report as the output contract says and return it in full.
```
