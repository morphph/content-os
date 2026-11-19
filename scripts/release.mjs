#!/usr/bin/env node
// Lists, or with --create makes, the annotated tags for every skill (and the
// tools) whose current version has no tag yet. Push them with: git push origin --tags
// Run on a clean main checkout after CI passes.
import {execFileSync} from 'node:child_process';
import {REPO,read,splitFrontmatter,frontmatterScalar} from './lib/fidelity.mjs';
import {skillNames} from './sync.mjs';

const git=(...args)=>execFileSync('git',args,{cwd:REPO,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const tagExists=tag=>{try{git('rev-parse','-q','--verify',`refs/tags/${tag}`);return true}catch{return false}};
const create=process.argv.includes('--create');
if(create&&git('status','--porcelain'))throw new Error('Commit or stash changes before tagging a release.');
const pending=[];
for(const name of skillNames()){const v=frontmatterScalar(splitFrontmatter(read(`skills/${name}/SKILL.md`)).frontmatter,'version');pending.push([`${name}/v${v}`,`${name} ${v}`])}
const tools=read('tools/VERSION').trim();pending.push([`tools/v${tools}`,`content-os tools ${tools}`]);
for(const [tag,message] of pending){
 if(tagExists(tag)){console.log(`${tag} (exists)`);continue}
 if(create){git('tag','-a',tag,'-m',message);console.log(`${tag} (created)`)}else console.log(`${tag} (pending)`);
}
