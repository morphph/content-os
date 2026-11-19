# News Intel — daily AI news brief

Adapted from the original morning-intel source battery and stable report headings. Use America/Chicago for report dating and a rolling 24-hour news window. Read current sources through available tools or verified fresh cached results; do not assume private fetch scripts or scheduled jobs exist. Parallelize independent source reads when supported.

## Source battery

- AI news: current smol.ai coverage, primary provider announcements/changelogs and linked original reporting. Cover Anthropic/Claude, OpenAI/Codex and other relevant providers; the selected execution provider does not limit the news scope.
- Hacker News: relevant front-page and recent AI stories, with observed points/comments.
- YouTube: recent AI-builder videos with title, channel, subscribers, views, date and URL. Main-radar views/subscribers ratio of at least 0.3 is an audience signal; label the formula and unknown inputs.
- X: current primary announcements and useful builder reactions. Read them with the `x_research_data` tool (see the X data rubric); only when it reports it is unavailable, search both current and legacy domains. Verify dates against the post or corroborating dated coverage; search rank is not a freshness guarantee. Unavailable engagement figures stay unknown.

## Original source coverage

Keep the targeted X gap-fill battery, adapting only topic/date inputs. With `x_research_data` available, run the three X lines as `search` queries using `from:` operators (for example `from:AnthropicAI OR from:claudeai OR from:ClaudeDevs`) over the last 24 hours instead of the `site:x.com` form; the `site:x.com` form below is the web-search fallback:

- `site:x.com AnthropicAI OR claudeai OR ClaudeDevs <topic keywords>`
- `site:x.com bcherny OR _catwu OR alexalbert__ claude code`
- `site:x.com sama OR gdb OR OpenAIDevs OR Codex_Changelog`
- `Anthropic OR "Claude Code" announcement news <today's date>`
- `OpenAI OR Codex announcement news <today's date>`

Use equivalent legacy-domain queries where useful. Search snippets are evidence to verify, not measured engagement. The baseline uses smol.ai as the Reddit/Discord discussion proxy; there is no bundled direct Reddit integration. Label proxy coverage and its possible one-to-two-day lag. Do not repeatedly probe blocked mirrors or claim direct Reddit coverage unless an available authorized connector was actually used.

## Stable result headings

Return the complete report with these headings:

# News Intel - YYYY-MM-DD (Weekday)

## TL;DR
Three to six bullets with the most consequential story first.

## Top Story
One or two paragraphs with direct sources and a verified useful statistic if available.

## AI News (last 24h)
Group Anthropic/Claude, OpenAI/Codex and others. Link factual claims and include relevant changelog changes.

## Hacker News Pulse
Relevant stories, measured points/comments and why they matter.

## YouTube Radar
Table of linked title, channel/subscribers, views and explicitly named ratio. Discuss recurring hooks or underserved audience signals without overclaiming.

## Source Status
Source / Status / Freshness or failure table, including X. Preserve useful partial findings and clearly mark unavailable sections. End with observed generation time in CT. The bridge saves the complete answer; do not replace it with a short summary or a file link.
