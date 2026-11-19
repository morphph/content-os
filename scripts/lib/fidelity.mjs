// Upstream fidelity helpers shared by tests and maintenance scripts.
// A region of a content-os file must be derivable from its agentic-os source
// using only the rewrites registered in provenance.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
export const UPSTREAM=path.join(REPO,'upstream','agentic-os');
export const read=p=>fs.readFileSync(path.join(REPO,p),'utf8');
export const sha256=text=>crypto.createHash('sha256').update(text).digest('hex');
export const upstream=rel=>fs.readFileSync(path.join(UPSTREAM,rel),'utf8');

export function splitFrontmatter(text){
 const m=/^---\n([\s\S]*?)\n---\n/.exec(text);
 return m?{frontmatter:m[1],body:text.slice(m[0].length)}:{frontmatter:null,body:text};
}
// Region markers: <!-- NAME:begin ... --> ... <!-- NAME:end -->
export function extractRegion(text,name){
 const begin=new RegExp(`<!-- ${name}:begin[^>]*-->\\n`),start=begin.exec(text);
 if(!start)return null;
 const from=start.index+start[0].length,end=text.indexOf(`\n<!-- ${name}:end -->`,from);
 if(end<0)throw new Error(`Region ${name} has no end marker`);
 return text.slice(from,end);
}
export const rewritesFor=(prov,file,region)=>(prov.rewrites||[]).filter(r=>r.file===file&&(r.region||null)===(region||null));

// Forward: apply registered rewrites, in order, to the source text.
export function applyRewrites(source,rewrites){
 let text=source;const problems=[];
 for(const r of rewrites){
  if(!text.includes(r.original)){problems.push(`rewrite ${r.id}: original text not found in source`);continue}
  text=text.split(r.original).join(r.replacement);
 }
 return {text,problems};
}
export const unescapeJs=text=>text.replace(/\\'/g,"'").replace(/\\"/g,'"');
// Fragments: each non-empty line, after reversing rewrites, is a substring of a source.
export function fragmentProblems(region,sources,rewrites){
 const haystacks=sources.flatMap(s=>[s,unescapeJs(s)]),problems=[];
 for(const raw of region.split('\n')){
  let line=raw.trim().replace(/^[-*] /,'');
  if(!line||/^#{1,6} /.test(line))continue;
  for(const r of rewrites)line=line.split(r.replacement).join(r.original);
  if(!haystacks.some(h=>h.includes(line)))problems.push(`not found upstream: ${line.slice(0,140)}`);
 }
 return problems;
}
// Very small YAML subset reader for frontmatter scalars at the top level.
export function frontmatterScalar(frontmatter,key){
 const m=new RegExp(`^${key}:[ \\t]*(.*)$`,'m').exec(frontmatter||'');
 if(!m)return null;
 let value=m[1].trim();
 if(value==='>-'||value==='>'||value==='|'||value==='|-'){
  const lines=[];const after=frontmatter.slice(m.index+m[0].length+1).split('\n');
  for(const line of after){if(/^\s+\S/.test(line)||line==='')lines.push(line.trim());else break}
  while(lines.length&&lines.at(-1)==='')lines.pop();
  return value.startsWith('>')?lines.join(' '):lines.join('\n');
 }
 if(/^".*"$/.test(value))return JSON.parse(value);
 if(/^'.*'$/.test(value))return value.slice(1,-1).replace(/''/g,"'");
 return value;
}
