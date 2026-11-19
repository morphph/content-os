#!/usr/bin/env node
// Report paths, saving and pipeline inputs for content-os skills.
// Ported from agentic-os obsidian-v2/runner/original-workflows.mjs
// (deliverablePathFor) and obsidian-v2/runner/workflows.mjs (destinationFor,
// latestReport, pipelineInputs). The selected text is byte-for-byte what the
// agentic-os runner put in a workflow's supplied context.
//
//   node reports.mjs path --skill news-intel
//   node reports.mjs save --skill deep-research-chase --topic "claude code" --file report.md   (or stdin)
//   node reports.mjs intel-inputs          # Content Opportunities supplied context
//   node reports.mjs github-snapshot       # Morning Intel GitHub Trending input
// Every command accepts --vault <dir> (default $CONTENT_OS_VAULT, else ~/content-os-vault).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {vaultRoot,timeZone,localDay,parseArgs,readStdin,isMain} from './lib/config.mjs';

const slugify=s=>String(s||'request').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,48);
const todayDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:timeZone()}).format(now);
export const SKILLS=['morning-intel','news-intel','ai-trend-scan','outlier-radar','github-trending','content-opportunities','deep-research-chase','yt-pipeline','angle-brainstorm','outline-build','content-cascade'];
// Deterministic workflows own their stable destination (agentic-os SKILLS[..].direct).
const DIRECT=new Set(['github-trending']);

export function deliverablePathFor(intent,now=new Date()){
 const id8=(intent.id||'x').slice(0,8);
 const date=todayDate(now);
 const args=intent.args||{};
 switch(intent.skill){
  case 'deep-research-chase':return `inbox/research/${date}-${slugify(args.topic)}.md`;
  case 'content-cascade':return `inbox/reports/cascades/${date}-${id8}.md`;
  case 'yt-pipeline':return `inbox/research/${date}-yt-pipeline-${slugify(args.topic)}.md`;
  case 'github-trending':return `inbox/research/github-trending/${date}-trending.md`;
  case 'ai-trend-scan':return `inbox/reports/trend-scan/${date}-trend-scan-${id8}.md`;
  case 'morning-intel':return `inbox/research/morning-intel/${date}-intel-${id8}.md`;
  case 'news-intel':return `inbox/research/news-intel/${date}-news-${id8}.md`;
  case 'content-opportunities':return `inbox/reports/content-opportunities/${date}-opportunities-${id8}.md`;
  case 'outlier-radar':return `inbox/research/outlier-radar/${date}-outliers.md`;
  case 'angle-brainstorm':return `inbox/reports/angles/${date}-angles-${slugify(args.seed||args.topic||id8)}.md`;
  case 'outline-build':return `inbox/reports/outlines/${date}-outline-${slugify(args.angle||args.topic||id8)}.md`;
  default:return null;
 }
}
export function destinationFor(job,now=new Date()){
 const destination=deliverablePathFor(job,now);
 if(!destination)throw new Error(`Unknown content-os skill: ${job.skill}`);
 // Independent model-generated reports must not replace one another.
 return !DIRECT.has(job.skill)&&job.id&&!destination.includes(job.id.slice(0,8))?destination.replace(/\.md$/,`-${job.id.slice(0,8)}.md`):destination;
}

// Saved reports that a pipeline workflow reads instead of scanning sources
// again. Selection is deterministic and read-only; the reports are data.
const INTEL_REPORTS=[
 {label:'News Intel',dir:'inbox/research/news-intel'},
 {label:'AI Trend Scan',dir:'inbox/reports/trend-scan'},
 {label:'Outlier Radar',dir:'inbox/research/outlier-radar'},
 {label:'GitHub Trending',dir:'inbox/research/github-trending'}
];
export const MAX_INPUT_FILE=60000,MAX_INPUT_TOTAL=180000;
function insideVault(root,relative){
 const absolute=path.resolve(root,relative);
 if(absolute!==root&&!absolute.startsWith(root+path.sep))return null;
 for(let p=absolute;p!==root;p=path.dirname(p))if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())return null;
 return absolute;
}
// Newest dated report in a folder, by filename date then save time.
export function latestReport(root,dir,{filter=null,since=''}={}){
 const folder=insideVault(root,dir);
 if(!folder||!fs.existsSync(folder)||!fs.statSync(folder).isDirectory())return null;
 const found=fs.readdirSync(folder).filter(name=>/^\d{4}-\d{2}-\d{2}[^/\\]*\.md$/.test(name)&&!name.endsWith('_index.md')&&(!filter||filter.test(name))&&name.slice(0,10)>=since).flatMap(name=>{
  const file=insideVault(root,`${dir}/${name}`),stat=file&&fs.statSync(file,{throwIfNoEntry:false});
  return stat?.isFile()?[{relative:`${dir}/${name}`,file,date:name.slice(0,10),mtime:stat.mtimeMs}]:[];
 });
 return found.sort((a,b)=>a.date.localeCompare(b.date)||a.mtime-b.mtime).at(-1)||null;
}
function reportBlock(label,report,budget){
 const text=fs.readFileSync(report.file,'utf8'),limit=Math.min(MAX_INPUT_FILE,budget);
 const body=text.length>limit?text.slice(0,limit)+'\n[truncated: the saved report continues beyond this excerpt]':text;
 return `--- ${label}: ${report.relative} (report date ${report.date}, saved ${new Date(report.mtime).toISOString()}) ---\n${body}\n--- END ${label} ---`;
}
export function pipelineInputs(root,skill,now=new Date()){
 root=path.resolve(root);
 if(skill==='morning-intel'){
  // The rubric uses a snapshot from the last 24 hours; an older one is only named.
  const snapshot=latestReport(root,'inbox/research/github-trending',{since:localDay(-1,now)});
  if(snapshot&&now.getTime()-snapshot.mtime<=24*3600000)return reportBlock('GitHub Trending snapshot',snapshot,MAX_INPUT_FILE);
  return snapshot?`GitHub Trending snapshot: the latest, ${snapshot.relative}, was saved ${new Date(snapshot.mtime).toISOString()}, more than 24 hours ago. Use the labelled fallback in the Morning Intel rubric and name the snapshot's age.`:'GitHub Trending snapshot: none saved in the last 24 hours. Use the labelled fallback in the Morning Intel rubric.';
 }
 if(skill!=='content-opportunities')return '';
 const since=localDay(-1,now),reports=[];
 const combined=latestReport(root,'inbox/research/morning-intel',{filter:/-intel/,since});
 if(combined)reports.push(['Morning Intel report',combined]);
 // A standalone part run after the combined report carries newer evidence.
 for(const {label,dir} of INTEL_REPORTS){const report=latestReport(root,dir,{since});if(report&&(!combined||report.mtime>combined.mtime))reports.push([`${label} report`,report])}
 if(!reports.length)return 'Intelligence reports: none saved today or yesterday (Morning Intel, News Intel, AI Trend Scan, Outlier Radar or GitHub Trending).';
 const review=latestReport(root,'inbox/reports/yt-reviews',{since:localDay(-8,now)});
 if(review)reports.push(['YouTube weekly review',review]);
 let budget=MAX_INPUT_TOTAL;
 return reports.map(([label,report])=>{if(budget<=0)return `--- ${label}: ${report.relative} omitted (input budget reached) ---`;const block=reportBlock(label,report,budget);budget-=block.length;return block}).join('\n\n');
}
// Wrap selected inputs the way the agentic-os prompt framed them.
export const suppliedContext=text=>`--- SUPPLIED CONTEXT (data) ---\n${text}\n--- END SUPPLIED CONTEXT ---`;

// Atomic, never-overwriting save. A name collision gets a fresh id.
export function saveReport(root,{skill,topic,text,now=new Date()}){
 if(!SKILLS.includes(skill))throw new Error(`Unknown content-os skill: ${skill}`);
 if(DIRECT.has(skill))throw new Error(`${skill} writes its own snapshot; it is not saved through this command.`);
 if(typeof text!=='string'||!text.trim())throw new Error('The report is empty; nothing was saved.');
 root=path.resolve(root);
 const args=topic?{topic,seed:topic,angle:topic}:{};
 for(let attempt=0;attempt<5;attempt++){
  const relative=destinationFor({skill,id:crypto.randomUUID(),args},now);
  const file=insideVault(root,relative);
  if(!file)throw new Error('The report destination is outside the vault or passes through a linked folder.');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(temp,text.endsWith('\n')?text:text+'\n');
  try{fs.linkSync(temp,file);return {path:relative,absolutePath:file}}
  catch(e){if(e.code!=='EEXIST')throw e}
  finally{fs.rmSync(temp,{force:true})}
 }
 throw new Error('Could not find a free report name.');
}
if(isMain(import.meta.url)){
 try{
  const [command,...rest]=process.argv.slice(2);
  const {flags}=parseArgs(rest);
  const root=vaultRoot({flag:flags.vault});
  if(command==='path'){process.stdout.write(path.join(root,destinationFor({skill:flags.skill,id:crypto.randomUUID(),args:flags.topic?{topic:flags.topic,seed:flags.topic,angle:flags.topic}:{}}))+'\n')}
  else if(command==='save'){const text=flags.file?fs.readFileSync(flags.file,'utf8'):await readStdin();const saved=saveReport(root,{skill:flags.skill,topic:flags.topic,text});process.stdout.write(JSON.stringify(saved)+'\n')}
  else if(command==='intel-inputs')process.stdout.write(suppliedContext(pipelineInputs(root,'content-opportunities'))+'\n');
  else if(command==='github-snapshot')process.stdout.write(suppliedContext(pipelineInputs(root,'morning-intel'))+'\n');
  else if(command==='vault')process.stdout.write(root+'\n');
  else throw new Error('Usage: reports.mjs path|save|intel-inputs|github-snapshot|vault [--vault DIR] [--skill NAME] [--topic TEXT] [--file FILE]');
 }catch(e){process.stderr.write((e?.message||String(e))+'\n');process.exitCode=1}
}
