// The pipelineInputs and destination cases are ported from agentic-os
// obsidian-v2/tests/content-pipeline.test.mjs at 3262ca0 (same fixtures and
// assertions, with the agentic-os job objects replaced by skill names).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.CONTENT_OS_TZ='America/Chicago';
const {pipelineInputs,destinationFor,saveReport,suppliedContext,SKILLS,MAX_INPUT_FILE}=await import('../tools/reports.mjs');

const tools=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools');
const job=(skill,args={})=>({skill,id:crypto.randomUUID(),args});
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'aos-pipeline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root};
const day=(offset=0)=>{const [y,m,d]=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date()).split('-').map(Number);return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10)};
const write=(root,relative,text,mtime)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);if(mtime)fs.utimesSync(file,mtime,mtime);};

test('new workflows have their own report homes',()=>{
 assert.match(destinationFor(job('news-intel')),/^inbox\/research\/news-intel\/\d{4}-\d{2}-\d{2}-news-[a-f0-9]{8}\.md$/);
 assert.match(destinationFor(job('content-opportunities')),/^inbox\/reports\/content-opportunities\/\d{4}-\d{2}-\d{2}-opportunities-[a-f0-9]{8}\.md$/);
 assert.match(destinationFor(job('morning-intel')),/^inbox\/research\/morning-intel\/\d{4}-\d{2}-\d{2}-intel-/);
});
test('every content-os skill has the agentic-os report path, with a unique id except the deterministic snapshot',()=>{
 const expected={
  'morning-intel':/^inbox\/research\/morning-intel\/\d{4}-\d{2}-\d{2}-intel-[a-f0-9]{8}\.md$/,
  'ai-trend-scan':/^inbox\/reports\/trend-scan\/\d{4}-\d{2}-\d{2}-trend-scan-[a-f0-9]{8}\.md$/,
  'outlier-radar':/^inbox\/research\/outlier-radar\/\d{4}-\d{2}-\d{2}-outliers-[a-f0-9]{8}\.md$/,
  'github-trending':/^inbox\/research\/github-trending\/\d{4}-\d{2}-\d{2}-trending\.md$/,
  'deep-research-chase':/^inbox\/research\/\d{4}-\d{2}-\d{2}-claude-code-sub-agents-[a-f0-9]{8}\.md$/,
  'yt-pipeline':/^inbox\/research\/\d{4}-\d{2}-\d{2}-yt-pipeline-claude-code-sub-agents-[a-f0-9]{8}\.md$/,
  'angle-brainstorm':/^inbox\/reports\/angles\/\d{4}-\d{2}-\d{2}-angles-claude-code-sub-agents-[a-f0-9]{8}\.md$/,
  'outline-build':/^inbox\/reports\/outlines\/\d{4}-\d{2}-\d{2}-outline-claude-code-sub-agents-[a-f0-9]{8}\.md$/,
  'content-cascade':/^inbox\/reports\/cascades\/\d{4}-\d{2}-\d{2}-[a-f0-9]{8}\.md$/
 };
 const topic='Claude Code: sub-agents'; // slugify keeps agentic-os behaviour: trailing punctuation becomes a trailing dash
 for(const [skill,re] of Object.entries(expected))assert.match(destinationFor(job(skill,{topic,seed:topic,angle:topic})),re,skill);
 assert.equal(SKILLS.length,11);
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
 assert.match(suppliedContext(input),/--- SUPPLIED CONTEXT \(data\) ---[\s\S]*TODAY COMBINED[\s\S]*--- END SUPPLIED CONTEXT ---/);
 assert.equal(pipelineInputs(root,'outline-build'),'');
});
test('standalone parts are used without a combined report, and large reports are truncated within the budgets',t=>{
 const root=temp(t);
 write(root,`inbox/research/news-intel/${day()}-news-a.md`,'N'.repeat(MAX_INPUT_FILE+500));
 write(root,`inbox/research/github-trending/${day(-1)}-trending.md`,'GITHUB YESTERDAY');
 write(root,`inbox/reports/yt-reviews/${day(-9)}-yt-week-review.md`,'OLD REVIEW');
 const input=pipelineInputs(root,'content-opportunities');
 assert.match(input,/News Intel report: inbox\/research\/news-intel\//);assert.match(input,/GitHub Trending report/);
 assert.match(input,/\[truncated: the saved report continues beyond this excerpt\]/);
 assert.doesNotMatch(input,/OLD REVIEW/);
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

test('saving writes the agentic-os path, never overwrites, and refuses empty or unknown reports',t=>{
 const root=temp(t);
 const a=saveReport(root,{skill:'news-intel',text:'# News Intel - A'}),b=saveReport(root,{skill:'news-intel',text:'# News Intel - B'});
 assert.notEqual(a.path,b.path);
 assert.equal(fs.readFileSync(path.join(root,a.path),'utf8'),'# News Intel - A\n');
 assert.equal(fs.readFileSync(path.join(root,b.path),'utf8'),'# News Intel - B\n');
 assert.match(saveReport(root,{skill:'deep-research-chase',topic:'Agent Skills',text:'x'}).path,/^inbox\/research\/\d{4}-\d{2}-\d{2}-agent-skills-[a-f0-9]{8}\.md$/);
 assert.throws(()=>saveReport(root,{skill:'news-intel',text:'  '}),/empty/);
 assert.throws(()=>saveReport(root,{skill:'inbox-brief',text:'x'}),/Unknown/);
 assert.throws(()=>saveReport(root,{skill:'github-trending',text:'x'}),/writes its own snapshot/);
 assert.deepEqual(fs.readdirSync(path.join(root,'inbox/research/news-intel')).filter(n=>n.endsWith('.tmp')),[]);
});
test('saving refuses a destination that passes through a linked folder',t=>{
 const root=temp(t),outside=temp(t);
 fs.mkdirSync(path.join(root,'inbox/reports'),{recursive:true});
 try{fs.symlinkSync(outside,path.join(root,'inbox/reports/cascades'),'dir')}catch{t.skip('symlinks unavailable');return}
 assert.throws(()=>saveReport(root,{skill:'content-cascade',text:'x'}),/linked folder/);
 assert.deepEqual(fs.readdirSync(outside),[]);
});
test('the reports command saves from stdin and prints the saved path',t=>{
 const root=temp(t);
 const r=spawnSync(process.execPath,[path.join(tools,'reports.mjs'),'save','--skill','outline-build','--topic','My Angle','--vault',root],{input:'# Outline\n',encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const saved=JSON.parse(r.stdout);assert.match(saved.path,/^inbox\/reports\/outlines\/\d{4}-\d{2}-\d{2}-outline-my-angle-[a-f0-9]{8}\.md$/);
 assert.equal(fs.readFileSync(path.join(root,saved.path),'utf8'),'# Outline\n');
 const inputs=spawnSync(process.execPath,[path.join(tools,'reports.mjs'),'intel-inputs','--vault',root],{encoding:'utf8'});
 assert.match(inputs.stdout,/^--- SUPPLIED CONTEXT \(data\) ---\nIntelligence reports: none saved today or yesterday/);
 const bad=spawnSync(process.execPath,[path.join(tools,'reports.mjs'),'nope'],{encoding:'utf8'});assert.equal(bad.status,1);
});
