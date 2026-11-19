#!/usr/bin/env node
// Release guard. For each skill whose current version is already tagged
// (<skill>/v<version>), the skill directory must be unchanged since that tag;
// otherwise the version (and CHANGELOG) must be bumped. Needs the tags locally
// (CI checks out with fetch-depth: 0). Also checks tools/VERSION vs tools/v<version>.
import {execFileSync} from 'node:child_process';
import {REPO,read,splitFrontmatter,frontmatterScalar} from './lib/fidelity.mjs';
import {skillNames} from './sync.mjs';

const git=(...args)=>execFileSync('git',args,{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const tagExists=tag=>{try{git('rev-parse','-q','--verify',`refs/tags/${tag}`);return true}catch{return false}};
const changedSince=(tag,dir)=>{try{git('diff','--quiet',tag,'--',dir);return false}catch{return true}};
const untracked=dir=>git('ls-files','--others','--exclude-standard','--',dir)!=='';
const problems=[],report=[];
for(const name of skillNames()){
 const version=frontmatterScalar(splitFrontmatter(read(`skills/${name}/SKILL.md`)).frontmatter,'version'),tag=`${name}/v${version}`;
 if(!tagExists(tag)){report.push(`${tag}: not yet released`);continue}
 if(changedSince(tag,`skills/${name}`)||untracked(`skills/${name}`))problems.push(`${name}: skills/${name} changed since ${tag}; bump version in SKILL.md and add a CHANGELOG entry.`);
 else report.push(`${tag}: released, unchanged`);
}
const tools=read('tools/VERSION').trim(),toolsTag=`tools/v${tools}`;
if(tagExists(toolsTag)&&(changedSince(toolsTag,'tools')||untracked('tools')))problems.push(`tools changed since ${toolsTag}; bump tools/VERSION, run npm run sync, and bump the skills that bundle the changed tools.`);
else report.push(`${toolsTag}: ${tagExists(toolsTag)?'released, unchanged':'not yet released'}`);
console.log(report.join('\n'));
if(problems.length){console.error(problems.join('\n'));process.exit(1)}
