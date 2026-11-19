#!/usr/bin/env node
// Verifies the upstream snapshot against a real agentic-os checkout, read-only:
//   node scripts/verify-upstream.mjs --agentic-os ../agentic-os
// Every file in upstream/agentic-os must equal `git show <commit>:<path>` there.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {UPSTREAM} from './lib/fidelity.mjs';

const i=process.argv.indexOf('--agentic-os'),checkout=i>0?path.resolve(process.argv[i+1]):null;
if(!checkout)throw new Error('Usage: node scripts/verify-upstream.mjs --agentic-os <checkout>');
const source=JSON.parse(fs.readFileSync(path.join(UPSTREAM,'SOURCE.json'),'utf8'));
let bad=0;
for(const rel of Object.keys(source.files)){
 const upstreamBytes=execFileSync('git',['-C',checkout,'show',`${source.commit}:${rel}`],{maxBuffer:1<<26});
 const ok=Buffer.compare(upstreamBytes,fs.readFileSync(path.join(UPSTREAM,rel)))===0;
 if(!ok)bad++;console.log(`${ok?'ok  ':'DIFF'} ${rel}`);
}
console.log(`${Object.keys(source.files).length-bad}/${Object.keys(source.files).length} files match ${source.repo}@${source.commit}`);
if(bad)process.exit(1);
