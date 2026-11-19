import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createJiti} from 'jiti';
import {SKILLS} from '../shared/contract.mjs';
import {workflowPrompt,pipelineInputs,destinationFor} from '../runner/workflows.mjs';
import {parseBriefSections} from '../runner/brief-sections.mjs';
const {parseBrief}=await createJiti(import.meta.url).import('../src/lib/morningBrief.ts');

const refs=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','workflow-references');
const read=name=>fs.readFileSync(path.join(refs,name),'utf8');
const lines=text=>text.split('\n').filter(line=>line.trim());
const upstream=read('upstream/morning-intel.md'),upstreamLines=new Set(lines(upstream));
const job=(skill,args={})=>({version:2,id:crypto.randomUUID(),provider:'codex',model:'gpt-6-astra',skill,args,ts:new Date().toISOString(),from:'plugin'});
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'aos-pipeline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root};
const day=(offset=0)=>{const [y,m,d]=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date()).split('-').map(Number);return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10)};
const write=(root,relative,text,mtime)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);if(mtime)fs.utimesSync(file,mtime,mtime);};

// News Intel is upstream morning-intel with sections removed. Every other line
// must stay byte-identical, so a later edit cannot quietly change its logic.
const NEWS_INTEL_EDITS={
 '# News Intel — daily AI news brief':'# Morning Intel — full daily intelligence brief',
 '## Original source coverage':'## Original source and inbox coverage',
 '# News Intel - YYYY-MM-DD (Weekday)':'# Morning Intel - YYYY-MM-DD (Weekday)',
 'Three to six bullets with the most consequential story first.':'Three to six bullets with the most consequential story first, including urgent operational inbox items when present.',
};
test('News Intel keeps upstream morning-intel lines verbatim apart from listed edits',()=>{
 for(const line of lines(read('news-intel.md'))){
  if(line.startsWith('Source / Status / Freshness')){assert.ok(upstreamLines.has(line.replace('including X','including Gmail and X')),line);continue;}
  if(Object.hasOwn(NEWS_INTEL_EDITS,line)){assert.ok(upstreamLines.has(NEWS_INTEL_EDITS[line]),line);continue;}
  assert.ok(upstreamLines.has(line),`news-intel.md line is not from upstream morning-intel.md: ${line}`);
 }
});
test('News Intel and Morning Intel carry no content plan or inbox triage',()=>{
 for(const name of ['news-intel.md','morning-intel.md']){
  const text=read(name);
  assert.doesNotMatch(text,/^## (?:So What|Inbox)/m,name);
  assert.doesNotMatch(text,/Steal my X for Y|lead-magnet format|^- Gmail:/m,name);
 }
});
test('the content plan moved verbatim from upstream morning-intel into Content Opportunities',()=>{
 const start=upstream.indexOf('## So What - Content Plan'),end=upstream.indexOf('## Source Status');
 const moved=lines(upstream.slice(start,end)).slice(1);
 assert.equal(moved.length,2);
 const target=read('content-opportunities.md');
 for(const line of moved)assert.ok(target.includes(line),line);
 // The GitHub fallback rule moved verbatim into the combined report.
 const github=lines(upstream).find(line=>line.startsWith('- GitHub:'));
 assert.ok(read('morning-intel.md').includes(github));
});

test("Morning Intel keeps each part's own queries, X share and the original GitHub implication line",()=>{
 const text=read('morning-intel.md');
 assert.match(text,/still runs every query, handle and channel lookup its own rubric asks for/);
 assert.match(text,/within half of the run budget/);
 assert.match(text,/with a line explaining each AI-builder implication/);
 assert.ok(upstream.includes('with a line explaining each AI-builder implication'));
 assert.match(text,/optional early velocity/);assert.match(text,/last 24 hours first/);
 assert.doesNotMatch(text,/Read each source once/);
 assert.match(read('content-opportunities.md'),/the standalone report is the evidence for its part/);
});
test('Morning Intel assembles the separately maintained intelligence rubrics',()=>{
 const prompt=workflowPrompt(os.tmpdir(),job('morning-intel'),'');
 for(const name of ['morning-intel','news-intel','ai-trend-scan','outlier-radar','youtube-data','x-data'])assert.ok(prompt.includes(`BUNDLED RUBRIC: ${name} ---`),name);
 for(const name of ['inbox-brief','content-opportunities','morning-report'])assert.ok(!prompt.includes(`BUNDLED RUBRIC: ${name} ---`),name);
 const news=workflowPrompt(os.tmpdir(),job('news-intel'),'');
 assert.ok(news.includes('BUNDLED RUBRIC: news-intel ---')&&!news.includes('BUNDLED RUBRIC: outlier-radar ---'));
 const ideas=workflowPrompt(os.tmpdir(),job('content-opportunities'),'');
 assert.ok(ideas.includes('BUNDLED RUBRIC: content-opportunities ---'));
 assert.ok(!ideas.includes('BUNDLED RUBRIC: x-data ---'),'content opportunities does not scan sources');
});
test('new workflows have their own report homes',()=>{
 assert.equal(SKILLS['news-intel'].label,'News Intel');
 assert.match(destinationFor(job('news-intel')),/^inbox\/research\/news-intel\/\d{4}-\d{2}-\d{2}-news-[a-f0-9]{8}\.md$/);
 assert.match(destinationFor(job('content-opportunities')),/^inbox\/reports\/content-opportunities\/\d{4}-\d{2}-\d{2}-opportunities-[a-f0-9]{8}\.md$/);
 assert.match(destinationFor(job('morning-intel')),/^inbox\/research\/morning-intel\/\d{4}-\d{2}-\d{2}-intel-/);
});

test('Content Opportunities reads the newest intelligence instead of scanning',t=>{
 const root=temp(t);
 assert.match(pipelineInputs(root,'content-opportunities'),/none saved today or yesterday/);
 const base=Date.now()/1000;
 write(root,`inbox/research/morning-intel/${day(-1)}-intel-old.md`,'OLDER COMBINED',base-90000);
 write(root,`inbox/research/morning-intel/${day()}-intel-abc.md`,'TODAY COMBINED',base-3600);
 write(root,`inbox/reports/trend-scan/${day()}-trend-scan-1.md`,'TREND BEFORE COMBINED',base-7200);
 write(root,`inbox/research/outlier-radar/${day()}-outliers.md`,'OUTLIERS AFTER COMBINED',base-60);
 write(root,`inbox/research/news-intel/${day(-5)}-news-1.md`,'STALE NEWS',base-500000);
 write(root,`inbox/reports/yt-reviews/${day(-3)}-yt-week-review.md`,'CHANNEL REVIEW',base-250000);
 write(root,'inbox/research/morning-intel/notes.md','UNDATED NOTE');
 const input=pipelineInputs(root,'content-opportunities');
 assert.match(input,/Morning Intel report: inbox\/research\/morning-intel\/\d{4}-\d{2}-\d{2}-intel-abc\.md/);
 assert.match(input,/TODAY COMBINED/);assert.match(input,/OUTLIERS AFTER COMBINED/);assert.match(input,/CHANNEL REVIEW/);
 for(const absent of ['OLDER COMBINED','TREND BEFORE COMBINED','STALE NEWS','UNDATED NOTE'])assert.doesNotMatch(input,new RegExp(absent));
 assert.match(workflowPrompt(root,job('content-opportunities'),''),/--- SUPPLIED CONTEXT \(data\) ---[\s\S]*TODAY COMBINED[\s\S]*--- END SUPPLIED CONTEXT ---/);
 assert.equal(pipelineInputs(root,'outline-build'),'');
});
test('Morning Intel receives the deterministic GitHub snapshot when one is recent',t=>{
 const root=temp(t);
 assert.match(pipelineInputs(root,'morning-intel'),/GitHub Trending snapshot: none saved/);
 write(root,`inbox/research/github-trending/${day(-4)}-trending.md`,'OLD SNAPSHOT');
 assert.match(pipelineInputs(root,'morning-intel'),/none saved/);
 assert.doesNotMatch(pipelineInputs(root,'morning-intel'),/OLD SNAPSHOT/);
 write(root,`inbox/research/github-trending/${day()}-trending.md`,'STALE TODAY',Date.now()/1000-30*3600);
 assert.match(pipelineInputs(root,'morning-intel'),/more than 24 hours ago/);assert.doesNotMatch(pipelineInputs(root,'morning-intel'),/STALE TODAY/);
 write(root,`inbox/research/github-trending/${day()}-trending.md`,'## Top 10 Trending This Week\n### 1. [a/b](https://github.com/a/b)');
 assert.match(pipelineInputs(root,'morning-intel'),/GitHub Trending snapshot: inbox\/research\/github-trending\/[\d-]+-trending\.md[\s\S]*a\/b/);
});
test('report selection never follows a linked folder out of the vault',t=>{
 const root=temp(t),outside=temp(t);
 write(outside,`${day()}-intel-x.md`,'OUTSIDE');
 fs.mkdirSync(path.join(root,'inbox/research'),{recursive:true});
 try{fs.symlinkSync(outside,path.join(root,'inbox/research/morning-intel'),'dir')}catch{t.skip('symlinks unavailable');return}
 assert.doesNotMatch(pipelineInputs(root,'content-opportunities'),/OUTSIDE/);
});

const combined=`# Morning Intel - 2026-11-18 (Wednesday)

## TL;DR
- A launch happened [News Intel]

## Top Story
A provider shipped a thing.

## AI News (last 24h)
### Anthropic / Claude
- A Claude update.

## Hacker News Pulse
| Story | Points | Comments |
| --- | --- | --- |
| [A story](https://example.com) | 120 | 40 |

## YouTube Radar
| Title | Channel | Views | Ratio |
| --- | --- | --- | --- |
| [Video](https://youtube.com/watch?v=1) | Chan (10k) | 5k | 0.5 |

## AI Trend Scan
### Claude Code & Anthropic
1. A seed.

## Outlier Radar
### Small-Channel Outliers
| Title | Channel (subscribers) | Views / age | Lifetime multiplier | Discovery |
| --- | --- | --- | --- | --- |
| [Small video](https://youtube.com/watch?v=2) | Tiny (2.1k subs) | 40k in 3d | 12.5x | topic search |

### Early Velocity Candidates
- None.

## GitHub Trending
### Top 10 Trending This Week
1. [owner/repo](https://github.com/owner/repo)

## Source Status
| Part | Source | Status | Freshness |
| --- | --- | --- | --- |
| News Intel | X | ok | 24h |
`;
test('saved-brief readers still find each section of the combined report',async()=>{
 const sections=parseBriefSections(combined);
 for(const id of ['youtube','outliers','github','source-status','ai-claude'])assert.equal(sections[id].status,'available',id);
 assert.match(sections.outliers.text,/Small video/);
 assert.equal(sections['content-youtube'].status,'missing');
 assert.equal(sections.inbox.status,'missing');
 // An older brief nests outliers under YouTube Radar; that layout still reads.
 const legacy=parseBriefSections('## YouTube Radar\nMain table.\n\n### Small-Channel Outliers\n- [Old](https://youtube.com/watch?v=3) 9x\n');
 assert.equal(legacy.outliers.status,'available');
 const {parseIntelOutlierTable}=await createJiti(import.meta.url).import('../src/lib/reports.ts');
 const rows=parseIntelOutlierTable(combined);
 assert.equal(rows.length,1);assert.equal(rows[0].mult,'12.5x');assert.equal(rows[0].subs,'2.1k subs');
 const brief=parseBrief('inbox/research/morning-intel/2026-11-18-intel-abc.md',combined);
 assert.equal(brief.ytTrending.length,1);assert.equal(brief.hnCount,0);assert.deepEqual(brief.contentOpportunities,[]);
});
test('the dashboard reads ranked YouTube ideas from a Content Opportunities report',()=>{
 const report=parseBrief('inbox/reports/content-opportunities/2026-11-18-opportunities-abc.md',`# Content Opportunities - 2026-11-18 (Wednesday)

Reports used: Morning Intel 2026-11-18.

## So What - Content Plan

### YouTube ideas
1. **First idea** — A hook. Another sentence.
   - **Evidence:** [link](https://example.com) (News Intel)
   - **Urgency:** expires Friday
   - **Seed:** A seed line.
2. **Second idea** — A hook.

### LinkedIn ideas
1. **Steal my skill pack for faster reviews**

### Shorts / carousel ideas
1. **A short**

## Evidence Status
- Morning Intel: today.
`);
 assert.deepEqual(report.contentOpportunities,['First idea','Second idea']);
 assert.equal(report.date,'2026-11-18');
});
