import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as xcli from '../tools/x-data.mjs';
import * as ycli from '../tools/youtube-data.mjs';
import {X_RUN_LIMIT} from '../tools/lib/x-research-data.mjs';
import {runGithubTrending} from '../tools/github-trending/run.mjs';

const tools=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools');
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'content-os-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir};
const env={TWITTERAPI_IO_KEY:'x-fixture-secret-do-not-return'},now=new Date('2026-11-16T12:00:00Z');
const page=n=>({tweets:Array.from({length:n},(_,i)=>({id:String(5000+i),text:'post '+i,createdAt:'2026-11-16T11:00:00Z',likeCount:1,retweetCount:1,replyCount:0,viewCount:10,author:{userName:'example',followers:5}})),has_next_page:false,next_cursor:''});
const fetchOf=body=>async()=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});

test('the X command allows the same arguments as the agentic-os MCP tool',async t=>{
 const state=temp(t);
 await assert.rejects(xcli.run({operation:'search',query:'x',usageFile:'/etc/passwd'},{env,state,now}),/Unsupported X research arguments/);
 await assert.rejects(xcli.run({operation:'search',query:'x'},{env,state,now,runId:'../escape'}),/Invalid run id/);
 assert.deepEqual(xcli.ALLOWED,['operation','query','handle','sort','sinceHours','maxResults']);
});
test('a run id keeps the per-run budget across separate calls and the daily ledger in the state folder',async t=>{
 const state=temp(t),runId=xcli.newRunId(now);
 assert.match(runId,/^2026-11-16-[0-9a-f]{8}$/);
 const first=await xcli.run({operation:'search',query:'a',maxResults:20},{env,state,now,runId,fetchImpl:fetchOf(page(20))});
 assert.equal(first.available,true);assert.equal(first.budget.runRemaining,X_RUN_LIMIT-20);
 const second=await xcli.run({operation:'search',query:'b',maxResults:20},{env,state,now,runId,fetchImpl:fetchOf(page(20))});
 assert.equal(second.budget.runRemaining,X_RUN_LIMIT-40,'the run budget carries over between processes');
 assert.equal(JSON.parse(fs.readFileSync(path.join(state,'x-runs',runId+'.json'),'utf8')).posts,40);
 assert.equal(JSON.parse(fs.readFileSync(path.join(state,'x-data-usage.json'),'utf8')).posts,40);
 const other=await xcli.run({operation:'search',query:'c',maxResults:20},{env,state,now,runId:xcli.newRunId(now),fetchImpl:fetchOf(page(5))});
 assert.equal(other.budget.runRemaining,X_RUN_LIMIT-5,'a new run starts with a full run budget');
 assert.equal(other.budget.dailyRemaining,600-45,'the daily budget is shared by every run');
 assert.equal(xcli.budget({runId,env,state,now}).runRemaining,X_RUN_LIMIT-40);
 assert.equal(JSON.stringify(first).includes(env.TWITTERAPI_IO_KEY),false);
});
test('a call without a run id shares an hourly run and says so',async t=>{
 const state=temp(t);
 const r=await xcli.run({operation:'search',query:'a'},{env,state,now,fetchImpl:fetchOf(page(3))});
 assert.match(r.runNote,/hour-2026-11-16-12/);
 assert.equal(fs.existsSync(path.join(state,'x-runs','hour-2026-11-16-12.json')),true);
});
test('an unconfigured key spends nothing and creates no run file',async t=>{
 const state=temp(t);
 const r=await xcli.run({operation:'search',query:'a'},{env:{},state,now,runId:'r1',fetchImpl:()=>{throw new Error('no request expected')}});
 assert.equal(r.available,false);assert.equal(r.reason,'not_configured');
 assert.equal(fs.existsSync(path.join(state,'x-runs','r1.json')),false);
});
test('the state lock serializes concurrent calls so no ledger update is lost',async t=>{
 const state=temp(t);
 await Promise.all(Array.from({length:6},(_,i)=>xcli.run({operation:'search',query:'q'+i,maxResults:20},{env,state,now,runId:'parallel',fetchImpl:async()=>{await new Promise(r=>setTimeout(r,20));return new Response(JSON.stringify(page(10)))}})));
 assert.equal(JSON.parse(fs.readFileSync(path.join(state,'x-data-usage.json'),'utf8')).posts,60);
 assert.equal(JSON.parse(fs.readFileSync(path.join(state,'x-runs','parallel.json'),'utf8')).posts,60);
 assert.equal(fs.existsSync(path.join(state,'x-data.lock')),false);
});
test('a stale lock is recovered and a held lock times out',async t=>{
 const state=temp(t);fs.mkdirSync(path.join(state,'x-data.lock'));
 const old=new Date(Date.now()-10*60000);fs.utimesSync(path.join(state,'x-data.lock'),old,old);
 assert.equal(await xcli.withLock(state,async()=>'ran'),'ran');
 fs.mkdirSync(path.join(state,'x-data.lock'));
 await assert.rejects(xcli.withLock(state,async()=>'never',{waitMs:150}),/still running/);
});
test('the YouTube command keeps the agentic-os argument allow-list',async()=>{
 await assert.rejects(ycli.run({operation:'search',query:'x',env:{}}),/Unsupported YouTube research arguments/);
 await assert.rejects(ycli.run({operation:'search',query:'x'},{env:{}}),/not configured/);
 const calls=[];
 const r=await ycli.run({operation:'search',query:'claude code',maxResults:1},{env:{YOUTUBE_API_KEY:'yt-secret'},fetchImpl:async url=>{calls.push(new URL(url).pathname);return new Response(JSON.stringify(calls.length===1?{items:[]}:{items:[]}))}});
 assert.equal(r.videos.length,0);assert.equal(JSON.stringify(r).includes('yt-secret'),false);
});
test('the commands print JSON errors and never echo keys',()=>{
 const run=(file,args,extra={})=>spawnSync(process.execPath,[path.join(tools,file),...args],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:os.tmpdir(),...extra}});
 const y=run('youtube-data.mjs',['{"operation":"search","query":"x"}']);
 assert.equal(y.status,1);assert.match(JSON.parse(y.stdout).error,/not configured/);
 const bad=run('youtube-data.mjs',['not json']);assert.match(JSON.parse(bad.stdout).error,/not valid JSON/);
 const none=run('x-data.mjs',[]);assert.equal(none.status,1);assert.match(JSON.parse(none.stdout).error,/one JSON object/);
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'content-os-'));
 try{
  const x=run('x-data.mjs',['--run','r1','{"operation":"search","query":"x"}'],{CONTENT_OS_STATE_DIR:state});
  assert.equal(x.status,0);assert.equal(JSON.parse(x.stdout).reason,'not_configured');
  assert.match(JSON.parse(run('x-data.mjs',['new-run']).stdout).runId,/^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/);
 }finally{fs.rmSync(state,{recursive:true,force:true})}
});
test('GitHub Trending retries transient failures, sets the vault for fetch.py and returns its snapshot',async t=>{
 const vault=temp(t),seen=[];let attempts=0;
 const exec=async(command,args,{env})=>{
  seen.push({command,script:path.basename(args[0]),vault:env.AGENTIC_OS_VAULT,tz:env.TZ});
  if(++attempts<3)throw new Error('python3 failed (1): urllib.error.HTTPError: HTTP Error 502: Bad Gateway');
  const rel='inbox/research/github-trending/2026-11-19-trending.md';fs.mkdirSync(path.join(vault,path.dirname(rel)),{recursive:true});fs.writeFileSync(path.join(vault,rel),'# GitHub Trending - 2026-11-19 (Thursday)\n');
  return `Wrote ${rel} — 10 weekly / 5 monthly · 4 AI-flagged · 10 fastest-24h / 10 fastest-30d\n`;
 };
 const r=await runGithubTrending({vault,env:{CONTENT_OS_TZ:'Asia/Shanghai',GITHUB_TOKEN:'gh-secret'},exec,delay:async()=>{}});
 assert.equal(attempts,3);assert.equal(seen[0].script,'fetch.py');assert.equal(seen[0].vault,vault);assert.equal(seen[0].tz,'Asia/Shanghai');
 assert.equal(r.path,'inbox/research/github-trending/2026-11-19-trending.md');assert.match(r.text,/GitHub Trending/);
 await assert.rejects(runGithubTrending({vault,env:{},exec:async()=>{throw new Error('python3 failed (1): HTTP Error 401')},delay:async()=>{}}),/401/);
});
