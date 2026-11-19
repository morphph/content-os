#!/usr/bin/env node
// Copies the single sources into each skill so every skill installs on its own:
//   tools/…                     -> skills/<name>/scripts/…
//   shared/references/<n>.md    -> skills/<name>/references/<n>.md
//   rubric region of skills/<n>/SKILL.md -> skills/<name>/references/<n>.md
// and rewrites the "Bundled files" list in each SKILL.md.
// `node scripts/sync.mjs --check` changes nothing and fails on any drift.
import fs from 'node:fs';
import path from 'node:path';
import {REPO,read,extractRegion} from './lib/fidelity.mjs';

export const TOOL_FILES={
 'youtube-data':['youtube-data.mjs','lib/youtube-research-data.mjs','lib/config.mjs'],
 'x-data':['x-data.mjs','lib/x-research-data.mjs','lib/config.mjs'],
 'transcript':['transcript.py'],
 'reports':['reports.mjs','lib/config.mjs'],
 'github-trending':['github-trending/run.mjs','github-trending/fetch.py','lib/config.mjs']
};
export const skillNames=()=>fs.readdirSync(path.join(REPO,'skills')).filter(n=>fs.existsSync(path.join(REPO,'skills',n,'SKILL.md'))).sort();
export const provenanceOf=name=>JSON.parse(read(`skills/${name}/provenance.json`));

// Expected generated files for one skill: {relativePathInSkill: content}
export function expectedFiles(name){
 const prov=provenanceOf(name),files={};
 for(const tool of prov.bundle.tools){
  if(!TOOL_FILES[tool])throw new Error(`${name}: unknown tool ${tool}`);
  for(const f of TOOL_FILES[tool])files[`scripts/${f}`]=read(`tools/${f}`);
 }
 for(const entry of prov.bundle.references){
  const [kind,ref]=entry.split(':');
  if(kind==='shared')files[`references/${ref}.md`]=read(`shared/references/${ref}.md`);
  else if(kind==='rubric'){const region=extractRegion(read(`skills/${ref}/SKILL.md`),'rubric');if(region===null)throw new Error(`${name}: skills/${ref} has no rubric region`);files[`references/${ref}.md`]=region+'\n'}
  else throw new Error(`${name}: unknown reference kind ${entry}`);
 }
 return files;
}
const DESCRIBE={'scripts/youtube-data.mjs':'`youtube_research_data` command','scripts/x-data.mjs':'`x_research_data` command (run ids, budgets, ledger lock)','scripts/transcript.py':'YouTube transcript reader','scripts/reports.mjs':'report paths, saving and pipeline inputs','scripts/github-trending/run.mjs':'GitHub Trending runner','scripts/github-trending/fetch.py':'deterministic GitHub Trending fetcher (unchanged from agentic-os)','scripts/lib/config.mjs':'shared settings (vault, state folder, time zone)','scripts/lib/youtube-research-data.mjs':'YouTube Data API library (unchanged from agentic-os)','scripts/lib/x-research-data.mjs':'twitterapi.io library (unchanged from agentic-os)','references/youtube-data.md':'shared YouTube research connection rubric','references/x-data.md':'shared X research connection rubric','references/transcript.md':'shared transcript reader rubric (new in content-os)'};
export function filesRegion(name,files){
 const lines=Object.keys(files).sort().map(f=>`- \`${f}\` — ${DESCRIBE[f]||(f.startsWith('references/')?`generated copy of the \`${path.basename(f,'.md')}\` skill's rubric`:'bundled file')}`);
 lines.push('- [PROVENANCE.md](PROVENANCE.md) — source commit and every registered wording change','- [CHANGELOG.md](CHANGELOG.md) — release history');
 return lines.join('\n');
}
function setRegion(text,marker,body){
 const re=new RegExp(`(<!-- ${marker}:begin[^>]*-->\\n)[\\s\\S]*?(<!-- ${marker}:end -->)`);
 if(!re.test(text))throw new Error(`missing ${marker} region`);
 return text.replace(re,(_m,a,b)=>`${a}${body}\n${b}`);
}
export function sync({check=false}={}){
 const problems=[];
 for(const name of skillNames()){
  const dir=path.join(REPO,'skills',name),files=expectedFiles(name);
  const prov=provenanceOf(name),toolsVersion=read('tools/VERSION').trim();
  if(prov.bundle.tools.length&&prov.bundle.toolsVersion!==toolsVersion)problems.push(`${name}: provenance.json bundle.toolsVersion ${prov.bundle.toolsVersion} != tools/VERSION ${toolsVersion}`);
  for(const [rel,content] of Object.entries(files)){
   const file=path.join(dir,rel),current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
   if(current!==content){if(check)problems.push(`${name}: ${rel} is out of date`);else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);if(rel.endsWith('.mjs')||rel.endsWith('.py'))fs.chmodSync(file,0o755)}}
  }
  // Remove generated files that are no longer bundled.
  for(const sub of ['scripts','references']){
   const root=path.join(dir,sub);if(!fs.existsSync(root))continue;
   for(const rel of walk(root).map(f=>`${sub}/${path.relative(root,f).split(path.sep).join('/')}`))if(!(rel in files)){if(check)problems.push(`${name}: ${rel} is not bundled by provenance.json`);else fs.rmSync(path.join(dir,rel))}
  }
  const skillFile=path.join(dir,'SKILL.md'),text=fs.readFileSync(skillFile,'utf8'),next=setRegion(text,'files',filesRegion(name,files));
  if(next!==text){if(check)problems.push(`${name}: SKILL.md Bundled files list is out of date`);else fs.writeFileSync(skillFile,next)}
 }
 return problems;
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='__pycache__'?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
if(process.argv[1]&&path.resolve(process.argv[1])===path.join(REPO,'scripts','sync.mjs')){
 const check=process.argv.includes('--check');
 const problems=sync({check});
 if(problems.length){console.error(problems.join('\n'));console.error(check?'Run `npm run sync` and commit the result.':'');process.exit(1)}
 console.log(check?'sync: no drift':'sync: skills updated');
}
