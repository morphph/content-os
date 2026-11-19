---
name: github-trending
description: "Pull last-7-days + last-30-days top GitHub repos by stars PLUS a fastest-growing (this-month star velocity) metric, classify AI/dev relevance, write to inbox/research/github-trending/YYYY-MM-DD-trending.md. Deterministic (no AI in the loop) — run the bundled script and return its report unchanged. Use when asked for GitHub trending repos, before Morning Intel, or when invoked via /github-trending."
version: 1.0.0
author: morphph
license: MIT
metadata:
  hermes:
    tags: [content-os, intelligence, github, deterministic]
    category: content-os
    related_skills: [morning-intel, content-opportunities]
    requires_toolsets: [terminal]
    config:
      - key: content_os.vault
        description: "content-os vault: the folder where reports are saved and read (pass it to the scripts as --vault)"
        default: "~/content-os-vault"
        prompt: "content-os vault folder"
  content-os:
    layer: intelligence
    upstream: "morphph/agentic-os@3262ca0"
    upstream_rubric: "obsidian-v2/workflow-references/github-trending.md"
required_environment_variables:
  - name: GITHUB_TOKEN
    prompt: "GitHub token (no scopes needed)"
    help: "https://github.com/settings/tokens - raises the GitHub API limit from 60 to 5000 requests per hour"
    required_for: "higher GitHub API rate limit (optional)"
---

# GitHub Trending

> content-os skill · 情报层 Intelligence · v1.0.0 · ported from agentic-os `github-trending` at `3262ca0`. Registered changes to the original wording are listed in [PROVENANCE.md](PROVENANCE.md).

## Running this skill in content-os

This skill is self-contained. `<skill-dir>` is this skill's directory: under Hermes it is `${HERMES_SKILL_DIR}`; in other agents it is the folder that holds this SKILL.md. Scripts need Node.js 20+ and Python 3.9+.

Terms used by the contract and rubric below:

- *Vault*: the content-os data root. Pass `--vault <dir>` to the scripts when the Hermes skill setting `content_os.vault` is shown to you; otherwise the scripts use `$CONTENT_OS_VAULT`, else `~/content-os-vault`. Vault-relative paths such as `inbox/research/…` are relative to it; the layout matches agentic-os, so the vault can be an existing Obsidian vault.
- *Attached rubric*: the Rubric section of this file, plus the files under `references/` listed in Bundled files.
- *Report time zone*: `$CONTENT_OS_TZ` (an IANA name such as `Asia/Shanghai`), else the computer's own zone; report dates and file names use it.

Steps:

1. Run `node <skill-dir>/scripts/github-trending/run.mjs` (add `--vault <dir>` when the vault is configured in the Hermes skill settings rather than the environment). It needs Python 3.9+; `GITHUB_TOKEN` is optional.
2. Return the printed report exactly as written. Its first line, `<!-- saved: ... -->`, names the vault-relative snapshot path; the script saved the file, so no separate save step runs.
3. If the script fails after its retries, return BLOCKED: with its error line. Do not write a substitute ranking.

Credentials come only from the environment (`GITHUB_TOKEN`); Hermes asks for declared keys securely in the local CLI and passes them to the scripts. Never ask for a key in chat, and never print, echo or inspect key values or credential files.

## Upstream execution contract

These lines are the agentic-os task requirements (`originalPrompt`) and runner contract (`workflowPrompt`) for this workflow, kept word for word apart from registered changes. The rubric below defines content, research and format; this contract controls saving and authorized actions.

<!-- contract:begin source="obsidian-v2/runner/original-workflows.mjs, obsidian-v2/runner/workflows.mjs" -->
Workflow requirements:
- The deterministic GitHub integration owns execution and its dated snapshot. Return its actual complete report.
<!-- contract:end -->

## Rubric

<!-- rubric:begin source="obsidian-v2/workflow-references/github-trending.md" -->
# GitHub Trending

Mechanical fetch — no AI judgment needed. Three metrics, ranks by stars / star-growth, flags AI/dev relevance from topics + description, writes markdown that the cockpit's `GithubTrendingCard` parses.

## The four metrics

1. **This Week** — repos `created:>7d`, sorted by stars (REST search API).
2. **This Month** — repos `created:>30d`, sorted by stars (REST search API).
3. **Fastest Growing (24h)** — top AI/dev repos by **stars gained today**, scraped from `github.com/trending?since=daily`. Catches same-day spikes before they build a monthly number.
4. **Fastest Growing (30d)** — top AI/dev repos by **stars gained this month**, scraped from `github.com/trending?since=monthly`. The durable breakouts.

Metrics 3 & 4 are the velocity pair. Unlike 1 & 2 (which filter on `created:<date>` and so only ever see brand-new repos), they surface a repo of **any age** that is suddenly ripping — the "came out two months ago and is now taking off" case. The trending page gives the star-growth number directly (no cross-run state needed); each AI/dev pick is enriched with one `GET /repos/{full}` call for stars + `created_at` + topics. If a scrape fails, that section degrades gracefully ("_Trending feed unavailable this run._") and the others still render.

_Note: a pure stars-sorted API query CANNOT do velocity — the top of that list is all mega-repos (50k+ stars), so a single-digit-k sleeper never appears in the sampled pool. The trending page is GitHub's own growth ranking and reaches those mid-size sleepers._

## Output

`inbox/research/github-trending/YYYY-MM-DD-trending.md`

Schema (frozen — `lib/reports.ts → parseTrendingRepos` depends on it):

```
# GitHub Trending - YYYY-MM-DD (Weekday)

## Top 10 Trending This Week
_Repos created in the last 7 days, ranked by stars_

### N. [owner/name](url) **[AI/DEV]?**
- **Stars:** N | **Language:** L
- **Created:** YYYY-MM-DD
- **Topics:** comma list or "none"
- **Description:** …

---

## Top 5 Trending This Month
_Repos created in the last 30 days, ranked by stars_

(same shape)

---

## Top 10 Fastest Growing (24h)
_AI/dev repos from GitHub's daily trending, ranked by stars gained today — any age_

### N. [owner/name](url) **[AI/DEV]?**
- **Growth:** +N stars today (created YYYY-MM-DD)
- **Stars:** N | **Language:** L
- **Created:** YYYY-MM-DD
- **Topics:** comma list or "none"
- **Description:** …

---

## Top 10 Fastest Growing (30d)
_AI/dev repos from GitHub's monthly trending, ranked by stars gained this month — any age_

(same shape, Growth line reads "+N stars this month")

(extra `**Growth:**` line vs sections 1 & 2 — `parseTrendingRepos` tags each block
with its section via the `## ` heading; "(24h)" → velocity-day, else velocity-month.)

---

## Content Radar
- **AI/Dev-relevant repos today:** X out of 10
- **Top AI pick:** [owner/name](url) - N stars
- **Why it matters:** description

_Generated automatically at HH:MM on YYYY-MM-DD_
```

## How content-os invokes

Run `node <skill-dir>/scripts/github-trending/run.mjs`. It runs the unchanged `scripts/github-trending/fetch.py` with the vault as its output root (up to three attempts on HTTP 502/503/504, timeouts and connection resets, as the agentic-os runner did), then prints the snapshot the script wrote.

## Manual invocation

```bash
AGENTIC_OS_VAULT="$CONTENT_OS_VAULT" python3 "<skill-dir>/scripts/github-trending/fetch.py"
```

Writes to the directory in `AGENTIC_OS_VAULT`. Always set it (run.mjs does): without it the unchanged script falls back to its agentic-os defaults.

## AI/Dev classifier

Substring match (case-insensitive) on topics OR description against:
`ai, llm, gpt, claude, anthropic, agent, mcp, prompt, embedding, rag, deepseek, kimi, gemini, openai, copilot, codex, fine-tun, transformer, ollama, langchain, ai-`

Not perfect — false positives on "DarkGPT"-style spam, false negatives on AI projects with vague descriptions. Good enough for a glance card.

## Rate limit

Calls per run: 2 Search API (week + month) + 1 HTML GET (trending page, not rate-limited) + up to ~1 enrich call per trending repo scanned until 5 AI/dev picks are found (`GET /repos/{full}`, typically 5–12 of the ~25 trending repos).

- Search API: unauthenticated = 10 req/min, 30 results/min — 2 reqs is fine.
- Core REST (the enrich calls): unauthenticated = 60/hr per IP — ~12 calls/run is fine for the 6-hourly schedule, but **bursty manual re-runs can exhaust it**. Set `GITHUB_TOKEN` to lift both to 5000/hr and remove the worry.

If `GITHUB_TOKEN` env var present, script uses it for the higher limit.
<!-- rubric:end -->

## Bundled files

<!-- files:begin -->
- `scripts/github-trending/fetch.py` — deterministic GitHub Trending fetcher (unchanged from agentic-os)
- `scripts/github-trending/run.mjs` — GitHub Trending runner
- `scripts/lib/config.mjs` — shared settings (vault, state folder, time zone)
- [PROVENANCE.md](PROVENANCE.md) — source commit and every registered wording change
- [CHANGELOG.md](CHANGELOG.md) — release history
<!-- files:end -->
