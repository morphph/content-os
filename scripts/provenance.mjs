#!/usr/bin/env node
// Generates skills/<name>/PROVENANCE.md from provenance.json. --check fails on drift.
import fs from 'node:fs';
import path from 'node:path';
import {REPO,read} from './lib/fidelity.mjs';
import {skillNames,provenanceOf} from './sync.mjs';

const fence=text=>{const longest=Math.max(2,...(text.match(/`+/g)||[]).map(s=>s.length));const f='`'.repeat(longest+1);return `${f}text\n${text}\n${f}`};
const where=r=>r.region==='frontmatter:description'?'frontmatter `description`':r.region==='contract'?'Upstream execution contract':r.region==='rubric'?'Rubric':r.file;
export function render(name){
 const p=provenanceOf(name),u=p.upstream;
 const out=[`# Provenance — ${name}`,'',
  `This skill is ported from [${u.repo}](https://github.com/${u.repo}) at commit \`${u.commit}\`. This file is generated from \`provenance.json\` by \`node scripts/provenance.mjs\`; edit that file, not this one.`,'',
  '| | Source |','|---|---|',
  `| Rubric | \`${u.rubric}\` |`,`| Task and runner contract | \`${u.prompt}\` |`,`| Report path | \`${u.deliverablePath}\` |`,`| Bundled tools | ${p.bundle.tools.length?p.bundle.tools.map(t=>'`'+t+'`').join(', ')+` (content-os tools ${p.bundle.toolsVersion})`:'none'} |`,`| Bundled references | ${p.bundle.references.length?p.bundle.references.map(t=>'`'+t+'`').join(', '):'none'} |`,'',
  '## Fidelity rule','',
  '- The Rubric section of SKILL.md equals the upstream rubric (its body, when the source has frontmatter) with exactly the rewrites below applied in order. `tests/fidelity.test.mjs` checks this against the snapshot in `upstream/agentic-os/`.',
  '- Every line of the Upstream execution contract section, with the rewrites below reversed, is found verbatim in the upstream `original-workflows.mjs` or `workflows.mjs`.',
  '- The section "Running this skill in content-os" is new content-os text and is not an upstream quotation.','',
  `## Registered rewrites (${p.rewrites.length})`,''];
 if(!p.rewrites.length)out.push('None: the rubric and contract are verbatim.','');
 for(const r of p.rewrites)out.push(`### \`${r.id}\` — ${where(r)}`,'',`**Reason:** ${r.reason}`,'','Original:','',fence(r.original),'','Replacement:','',r.replacement?fence(r.replacement):'_(removed)_','');
 return out.join('\n');
}
const check=process.argv.includes('--check'),problems=[];
for(const name of skillNames()){
 const file=path.join(REPO,'skills',name,'PROVENANCE.md'),text=render(name);
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text){if(check)problems.push(`${name}: PROVENANCE.md is out of date`);else fs.writeFileSync(file,text)}
}
if(problems.length){console.error(problems.join('\n')+'\nRun `npm run provenance`.');process.exit(1)}
console.log(check?'provenance: up to date':'provenance: written');
