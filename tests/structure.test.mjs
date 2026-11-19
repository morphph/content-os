import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {REPO,read,splitFrontmatter,frontmatterScalar,extractRegion} from '../scripts/lib/fidelity.mjs';
import {skillNames,provenanceOf,expectedFiles} from '../scripts/sync.mjs';

const LAYERS={intelligence:['morning-intel','news-intel','ai-trend-scan','outlier-radar','github-trending'],topics:['content-opportunities'],research:['deep-research-chase','yt-pipeline'],production:['angle-brainstorm','outline-build'],distribution:['content-cascade']};
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='__pycache__'?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const envExample=read('.env.example');

test('the repository holds exactly the five content layers and nothing from the review layer',()=>{
 assert.deepEqual(skillNames(),Object.values(LAYERS).flat().sort());
 for(const excluded of ['yt-week-review','weekly-review','metrics-pull','inbox-brief','lead-research','morning-report','morning'])assert.ok(!skillNames().includes(excluded),excluded);
});
test('skills.sh.json groups every skill under its layer for Hermes taps',()=>{
 const groups=JSON.parse(read('skills.sh.json')).groupings;
 assert.deepEqual(groups.flatMap(g=>g.skills).sort(),skillNames());
});
for(const name of skillNames()){
 test(`${name}: SKILL.md frontmatter follows agentskills.io and Hermes`,()=>{
  const text=read(`skills/${name}/SKILL.md`),{frontmatter}=splitFrontmatter(text);
  assert.ok(frontmatter,'has frontmatter');
  assert.equal(frontmatterScalar(frontmatter,'name'),name,'name matches the directory');
  assert.match(name,/^[a-z0-9]+(-[a-z0-9]+)*$/);assert.ok(name.length<=64);
  const description=frontmatterScalar(frontmatter,'description');
  assert.ok(description&&description.length<=1024,`description length ${description?.length}`);
  assert.match(frontmatterScalar(frontmatter,'version'),SEMVER);
  assert.equal(frontmatterScalar(frontmatter,'license'),'MIT');
  assert.match(frontmatter,/^metadata:\n  hermes:\n/m);
  assert.match(frontmatter,/^    category: content-os$/m);
  const layer=/^    layer: (\w+)$/m.exec(frontmatter)?.[1];
  assert.ok(LAYERS[layer]?.includes(name),`layer ${layer}`);
  assert.equal(provenanceOf(name).layer,layer);
  for(const rel of (/related_skills: \[([^\]]*)\]/.exec(frontmatter)?.[1]||'').split(',').map(s=>s.trim()).filter(Boolean))assert.ok(skillNames().includes(rel),`related skill ${rel} exists`);
 });
 test(`${name}: version, changelog and provenance agree`,()=>{
  const version=frontmatterScalar(splitFrontmatter(read(`skills/${name}/SKILL.md`)).frontmatter,'version');
  const changelog=read(`skills/${name}/CHANGELOG.md`);
  assert.equal(/^## \[([^\]]+)\]/m.exec(changelog)?.[1],version,'latest CHANGELOG entry is the current version');
  assert.ok(read(`skills/${name}/SKILL.md`).includes(`· v${version} ·`),'the header shows the version');
  if(provenanceOf(name).bundle.tools.length)assert.equal(provenanceOf(name).bundle.toolsVersion,read('tools/VERSION').trim());
 });
 test(`${name}: bundled files are listed, present and referenced so URL installs fetch them`,()=>{
  const dir=path.join(REPO,'skills',name),text=read(`skills/${name}/SKILL.md`);
  const onDisk=walk(dir).map(f=>path.relative(dir,f).split(path.sep).join('/')).filter(f=>/^(scripts|references)\//.test(f)).sort();
  assert.deepEqual(onDisk,Object.keys(expectedFiles(name)).sort());
  const listed=extractRegion(text,'files');
  for(const f of onDisk)assert.ok(listed.includes('`'+f+'`'),`${f} is in the Bundled files list`);
  for(const m of text.matchAll(/`((?:scripts|references)\/[^`\s]+)`/g))assert.ok(fs.existsSync(path.join(dir,m[1])),`referenced ${m[1]} exists`);
  for(const m of text.matchAll(/\]\(([A-Z]+\.md)\)/g))assert.ok(fs.existsSync(path.join(dir,m[1])),`linked ${m[1]} exists`);
  for(const required of ['PROVENANCE.md','CHANGELOG.md','provenance.json'])assert.ok(fs.existsSync(path.join(dir,required)),required);
 });
 test(`${name}: declared environment variables are documented and no secret is committed`,()=>{
  const {frontmatter}=splitFrontmatter(read(`skills/${name}/SKILL.md`));
  const declared=[...frontmatter.matchAll(/^  - name: ([A-Z0-9_]+)$/gm)].map(m=>m[1]);
  for(const v of declared)assert.match(envExample,new RegExp(`^${v}=$`,'m'),`${v} in .env.example`);
  const usesX=provenanceOf(name).bundle.tools.includes('x-data'),usesYT=provenanceOf(name).bundle.tools.includes('youtube-data');
  assert.equal(declared.includes('TWITTERAPI_IO_KEY'),usesX);
  assert.equal(declared.includes('YOUTUBE_API_KEY'),usesYT);
  if(provenanceOf(name).bundle.tools.length)assert.match(frontmatter,/requires_toolsets: \[terminal\]/);
 });
 test(`${name}: sections appear in the documented order`,()=>{
  const text=read(`skills/${name}/SKILL.md`);
  const order=['## Running this skill in content-os','## Upstream execution contract','<!-- contract:begin','## Rubric','<!-- rubric:begin','## Bundled files','<!-- files:begin'].map(s=>text.indexOf(s));
  assert.ok(order.every(i=>i>=0),'all sections present');assert.deepEqual(order,[...order].sort((a,b)=>a-b));
  assert.match(text,/\$\{HERMES_SKILL_DIR\}/,'explains <skill-dir> under Hermes');
 });
}
test('.env.example holds names only, never values, and secrets are git-ignored',()=>{
 for(const line of envExample.split('\n').filter(l=>l&&!l.startsWith('#')))assert.match(line,/^[A-Z0-9_]+=$/,line);
 const ignore=read('.gitignore');assert.match(ignore,/^\.env$/m);
 const secretish=/(AIza[0-9A-Za-z_-]{35}|gh[pousr]_[0-9A-Za-z]{30,}|sk-[A-Za-z0-9]{20,})/;
 for(const file of walk(REPO).filter(f=>!f.includes(`${path.sep}.git${path.sep}`)&&!f.includes('node_modules')))assert.doesNotMatch(fs.readFileSync(file,'utf8'),secretish,path.relative(REPO,file));
});
