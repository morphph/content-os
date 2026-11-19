#!/usr/bin/env node
// Runs the deterministic agentic-os GitHub Trending fetcher (fetch.py, unchanged)
// and prints the snapshot it wrote. Mirrors agentic-os directWorkflow: up to
// three attempts on HTTP 502/503/504, timeouts and connection resets.
// The snapshot goes to <vault>/inbox/research/github-trending/YYYY-MM-DD-trending.md.
// AGENTIC_OS_VAULT is always set for fetch.py, so it never falls back to reading
// any dotenv file. GITHUB_TOKEN (optional) raises the GitHub API rate limit.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {vaultRoot,timeZone,parseArgs,isMain} from '../lib/config.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export const pythonCommand=(env=process.env,platform=process.platform)=>env.CONTENT_OS_PYTHON||(platform==='win32'?'python':'python3');
function runOnce(command,args,{env,timeout}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},timeout);
  child.stdout.on('data',b=>{out+=b});child.stderr.on('data',b=>{err=(err+b).slice(-20000)});
  child.on('error',e=>{clearTimeout(timer);reject(e)});
  child.on('close',code=>{clearTimeout(timer);timedOut?reject(new Error('Integration timed out')):code!==0?reject(new Error(`${path.basename(command)} failed (${code}): ${(err||out).trim().split(/\r?\n/).slice(-1)[0]?.slice(0,400)}`)):resolve(out)});
 });
}
export async function runGithubTrending({vault=vaultRoot(),env=process.env,timeout=240000,delay=ms=>new Promise(r=>setTimeout(r,ms)),exec=runOnce}={}){
 const childEnv={...env,AGENTIC_OS_VAULT:vault,TZ:env.CONTENT_OS_TZ?timeZone(env):env.TZ};
 if(!childEnv.TZ)delete childEnv.TZ;
 let summary;
 for(let attempt=0;;attempt++){
  try{summary=await exec(pythonCommand(env),[path.join(here,'fetch.py')],{env:childEnv,timeout});break}
  catch(e){if(attempt>=2||!/HTTP Error 50[234]|timed out|ECONNRESET/i.test(e.message))throw e;await delay(1500*(attempt+1))}
 }
 const match=/Wrote (\S+)/.exec(summary||'');
 const report=match?path.join(vault,match[1]):null;
 if(!report||!fs.existsSync(report))throw new Error('GitHub fetch did not produce its report');
 return {path:path.relative(vault,report),summary:String(summary).trim(),text:fs.readFileSync(report,'utf8')};
}
if(isMain(import.meta.url)){
 try{const {flags}=parseArgs(process.argv.slice(2));const result=await runGithubTrending({vault:vaultRoot({flag:flags.vault})});process.stdout.write(`<!-- saved: ${result.path} -->\n${result.text}`)}
 catch(e){process.stderr.write((e?.message||String(e))+'\n');process.exitCode=1}
}
