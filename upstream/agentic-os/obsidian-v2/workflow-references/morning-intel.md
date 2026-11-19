# Morning Intel — combined intelligence report

This workflow runs the four intelligence workflows in one pass and returns one combined note. Each part follows its own attached rubric for sources, time windows, eligibility, scoring, deduplication and evidence; this rubric only defines how the parts are assembled. Do not loosen, re-derive or merge their rules. Use America/Chicago for report dating. Run independent source reads concurrently when supported.

| Part | Rubric | Owns |
| --- | --- | --- |
| 1. News Intel | news-intel | AI news, Hacker News, main YouTube radar, X announcements |
| 2. AI Trend Scan | ai-trend-scan | velocity-ranked YouTube and X seeds |
| 3. Outlier Radar | outlier-radar | small-channel videos against their own channel baseline |
| 4. GitHub Trending | deterministic snapshot | repository rankings and growth |

This is an intelligence report: facts, measurements and the evidence notes each part's rubric asks for (such as a seed's "Why this matters" or what an outlier's topic suggests). It contains no content plan, video ideas, angles, hooks, lead-magnet offers or inbox triage. Content ideas come from the separate Content Opportunities workflow, which reads this report; inbox triage is the separate Inbox Brief workflow.

## Shared evidence

Each part still runs every query, handle and channel lookup its own rubric asks for, with its own window, selection and scoring. Overlap only saves repeated calls: do not repeat an identical query within this run, and when a post or video is already read, reuse its measurements instead of reading it again. Never skip a part's own query because another part covered a similar topic.

The X data rubric's per-run budget is shared by News Intel and AI Trend Scan in this run. Plan both parts' X reads before calling the tool, request only the `maxResults` each part's rubric uses, and keep each part within half of the run budget so neither crowds out the other. If a part still runs short, say so in Source Status rather than dropping that part's queries silently.

Keep each metric under its own name: the main radar's views/subscribers ratio, the trend scan's views-per-hour or engagement-per-hour velocity, and the outlier radar's lifetime-baseline multiplier are different measures.

The same item may appear in more than one part when each part's own rules select it. Keep it in each, and add a short "also in Part N" note instead of dropping it.

A failed part does not block the others. Keep useful partial findings, mark the unavailable part, and explain it in Source Status. Return BLOCKED: only when no part produced usable evidence.

## GitHub Trending part

The deterministic GitHub integration owns this data. When the supplied context includes a GitHub Trending snapshot from the last 24 hours, reproduce its ranked sections under the part heading, one heading level lower, keeping each repository line, metric and AI/DEV label exactly as written. Do not re-rank it, drop entries or add star growth the snapshot does not show. After each reproduced repository entry, add one line explaining its AI-builder implication, as the original GitHub Radar asked ("with a line explaining each AI-builder implication"). Leave out the snapshot's own title, its generated-at footer and its Content Radar section; state the snapshot's generation time in Source Status.

When no snapshot from the last 24 hours is supplied, label the latest snapshot's age or its absence, recommend running GitHub Trending before the next Morning Intel, and fall back to the original rule:

- GitHub: top new repositories over 7/30 days and observed growth where available, emphasizing relevant AI/dev projects. Read the deterministic snapshot when fresh; label snapshot age and do not claim historic star growth from one current count.

## Combined result headings

Return the complete report with exactly these level-2 headings, in this order. The dashboard and voice briefing read them by name.

# Morning Intel - YYYY-MM-DD (Weekday)

## TL;DR
Three to six bullets across all four parts, the most consequential first. End each bullet with its part in brackets, for example [News Intel] or [Outlier Radar].

## Top Story
The News Intel Top Story.

## AI News (last 24h)
News Intel's AI News section.

## Hacker News Pulse
News Intel's Hacker News section, as a table with Story, Points and Comments columns.

## YouTube Radar
News Intel's main YouTube radar table and notes. Do not nest small-channel outliers here; they are Part 3.

## AI Trend Scan
The AI Trend Scan result without its own title: the numbered seeds grouped under its theme headings (one level lower), then its coverage and source notes.

## Outlier Radar
The Outlier Radar result without its own title, in these subsections:

### Small-Channel Outliers
Main outliers as a table. The first five columns are fixed, in this order: Title (linked) | Channel (subscribers) | Views / age | Lifetime multiplier | Discovery. Put the rubric's other fields (duration, upload time, baseline size, optional early velocity) in further columns after those five. List findings uploaded in the last 24 hours first and mark them; the rest of the seven-day window follows. A verified zero scan is meaningful; stale/unavailable data is not zero.

### Early Velocity Candidates
Young videos flagged by relative views per hour, labelled as a secondary signal.

### Previously Seen
Findings already in reports from the last 30 days.

### Notes and Coverage
What the topics suggest, query coverage, quota or baseline limits, and confidence.

## GitHub Trending
The snapshot's ranked sections as described above, or the labelled fallback.

## Source Status
One table: Part / Source / Status / Freshness or failure. Cover every source of every part, the X evidence label required by the X data rubric, YouTube quota limits and the GitHub snapshot's generation time. End with observed generation time in CT. The bridge saves the complete answer; do not replace it with a short summary or a file link.
