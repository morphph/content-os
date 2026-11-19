#!/usr/bin/env node
// x_research_data as a command, over the agentic-os twitterapi.io library.
//   node x-data.mjs new-run                       -> prints a run id
//   node x-data.mjs --run <id> '{"operation":"search","query":"from:AnthropicAI OR from:claudeai","sinceHours":24,"maxResults":20}'
//   node x-data.mjs budget [--run <id>]           -> remaining run/day budget, no API call
//
// Spending is bounded three ways, as in agentic-os: a page per call, a per-run
// budget and a per-UTC-day budget. agentic-os counted a "run" per MCP server
// process; a command is a new process per call, so a run is a run id whose
// usage is kept in <state>/x-runs/<id>.json. The daily ledger is
// <state>/x-data-usage.json. A state-directory lock serializes calls, so
// parallel parts of one workflow cannot lose ledger updates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {collectXResearch,xDailyLimit,X_RUN_LIMIT} from './lib/x-research-data.mjs';
import {parseArgs,jsonArgs,print,fail,isMain,stateDir} from './lib/config.mjs';

export const ALLOWED=['operation','query','handle','sort','sinceHours','maxResults'];
const RUN_ID=/^[A-Za-z0-9_-]{1,64}$/;
const LOCK_STALE_MS=120000,LOCK_WAIT_MS=90000,RUN_RETENTION_MS=7*24*3600000;

export const newRunId=(now=new Date())=>`${now.toISOString().slice(0,10)}-${crypto.randomBytes(4).toString('hex')}`;
// Without an explicit run id, calls in the same UTC hour share one run budget.
export const defaultRunId=(now=new Date())=>`hour-${now.toISOString().slice(0,13).replace('T','-')}`;

function readRun(file){try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(Number.isSafeInteger(data?.posts)&&data.posts>=0)return {posts:data.posts}}catch{}return {posts:0}}
function writeRun(file,usage){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify({posts:usage.posts,updatedAt:new Date().toISOString()},null,2));try{fs.renameSync(temp,file)}catch(e){try{fs.unlinkSync(temp)}catch{}throw e}}
function pruneRuns(dir,now){try{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);const stat=fs.statSync(file,{throwIfNoEntry:false});if(stat?.isFile()&&now-stat.mtimeMs>RUN_RETENTION_MS)fs.rmSync(file,{force:true})}}catch{}}

export async function withLock(dir,work,{waitMs=LOCK_WAIT_MS,staleMs=LOCK_STALE_MS}={}){
 fs.mkdirSync(dir,{recursive:true});
 const lock=path.join(dir,'x-data.lock'),started=Date.now();
 for(;;){
  try{fs.mkdirSync(lock);break}catch(e){
   if(e.code!=='EEXIST')throw e;
   const stat=fs.statSync(lock,{throwIfNoEntry:false});
   if(stat&&Date.now()-stat.mtimeMs>staleMs){fs.rmSync(lock,{recursive:true,force:true});continue}
   if(Date.now()-started>waitMs)throw new Error('Another X data call is still running; try again shortly.');
   await new Promise(r=>setTimeout(r,100));
  }
 }
 try{return await work()}finally{fs.rmSync(lock,{recursive:true,force:true})}
}

export async function run(args,{runId,env=process.env,state=stateDir({env}),fetchImpl=fetch,now=new Date(),retryDelayMs}={}){
 if(!args||Array.isArray(args)||Object.keys(args).some(key=>!ALLOWED.includes(key)))throw new Error('Unsupported X research arguments.');
 const implicit=!runId;const id=runId||defaultRunId(now);
 if(!RUN_ID.test(id))throw new Error('Invalid run id.');
 const runsDir=path.join(state,'x-runs'),runFile=path.join(runsDir,id+'.json');
 return withLock(state,async()=>{
  pruneRuns(runsDir,now.getTime());
  const runUsage=readRun(runFile),before=runUsage.posts;
  try{
   const result=await collectXResearch({...args,env,usageFile:path.join(state,'x-data-usage.json'),runUsage,fetchImpl,now,...(retryDelayMs===undefined?{}:{retryDelayMs})});
   if(implicit&&result&&typeof result==='object')result.runNote=`No --run id was given, so this call shared the hourly run budget "${id}". Start a workflow with "x-data.mjs new-run" and pass --run on every call.`;
   return result;
  }finally{if(runUsage.posts!==before)writeRun(runFile,runUsage)}
 });
}
export function budget({runId,env=process.env,state=stateDir({env}),now=new Date()}={}){
 const id=runId||defaultRunId(now);if(!RUN_ID.test(id))throw new Error('Invalid run id.');
 const day=now.toISOString().slice(0,10),dailyLimit=xDailyLimit(env);
 let spent=0;try{const data=JSON.parse(fs.readFileSync(path.join(state,'x-data-usage.json'),'utf8'));if(data?.date===day&&Number.isSafeInteger(data.posts))spent=data.posts}catch{}
 const used=readRun(path.join(state,'x-runs',id+'.json')).posts;
 return {runId:id,configured:typeof env.TWITTERAPI_IO_KEY==='string'&&!!env.TWITTERAPI_IO_KEY.trim(),runRemaining:Math.max(0,X_RUN_LIMIT-used),dailyRemaining:Math.max(0,dailyLimit-spent),runLimit:X_RUN_LIMIT,dailyLimit};
}
if(isMain(import.meta.url)){
 // The library waits for its one retry on an unref()'d timer; keep the process
 // alive until the call settles, or Node would exit silently mid-retry.
 const keepAlive=setInterval(()=>{},1000);
 try{
  const {flags,positional}=parseArgs(process.argv.slice(2));
  const runId=flags.run||process.env.CONTENT_OS_RUN_ID;
  if(positional[0]==='new-run')print({runId:newRunId()});
  else if(positional[0]==='budget')print(budget({runId}));
  else print(await run(await jsonArgs(positional),{runId}));
 }catch(e){fail(e)}
 finally{clearInterval(keepAlive)}
}
