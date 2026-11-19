// content-os shared runtime settings. Non-secret configuration only; credentials
// are read from the process environment by the individual tools and never logged.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const expand=p=>p.startsWith('~/')||p==='~'?path.join(os.homedir(),p.slice(1)):p;

// Vault = the content-os data root (agentic-os called it the vault). Reports use
// the agentic-os layout under it, so it can be an existing Obsidian vault.
export function vaultRoot({flag,env=process.env}={}){
 const raw=flag||env.CONTENT_OS_VAULT||'~/content-os-vault';
 return path.resolve(expand(String(raw)));
}
export function stateDir({flag,env=process.env}={}){
 const raw=flag||env.CONTENT_OS_STATE_DIR||'~/.content-os/state';
 return path.resolve(expand(String(raw)));
}
// Report dates follow CONTENT_OS_TZ when set, else the computer's own zone,
// matching agentic-os, which used the machine zone (shared/timezone.mjs).
export function timeZone(env=process.env){
 const wanted=env.CONTENT_OS_TZ;
 if(wanted){try{new Intl.DateTimeFormat('en-CA',{timeZone:wanted});return wanted}catch{throw new Error(`CONTENT_OS_TZ is not a valid IANA time zone: ${wanted}`)}}
 try{return new Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return 'UTC'}
}
export const localDay=(offset=0,now=new Date(),zone=timeZone())=>{const [y,m,d]=new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(now).split('-').map(Number);return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10)};

// Minimal flag parser: --name value, --flag (boolean), positional arguments.
export function parseArgs(argv,booleans=[]){
 const flags={},positional=[];
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a.startsWith('--')){const eq=a.indexOf('=');if(eq>0){flags[a.slice(2,eq)]=a.slice(eq+1);continue}const name=a.slice(2);if(booleans.includes(name)){flags[name]=true;continue}if(i+1>=argv.length)throw new Error(`Missing value for --${name}`);flags[name]=argv[++i]}
  else positional.push(a);
 }
 return {flags,positional};
}
export async function readStdin(){let data='';for await(const chunk of process.stdin)data+=chunk;return data}
// Tool arguments arrive as one JSON object: a positional argument, or "-" for stdin.
export async function jsonArgs(positional){
 const raw=positional[0]==='-'?await readStdin():positional[0];
 if(raw===undefined||!raw.trim())throw new Error('Pass the tool arguments as one JSON object, for example \'{"operation":"search","query":"claude code"}\'.');
 let value;try{value=JSON.parse(raw)}catch{throw new Error('The tool arguments are not valid JSON.')}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The tool arguments must be one JSON object.');
 return value;
}
export const print=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
export function fail(error){process.stdout.write(JSON.stringify({error:error?.message||String(error)})+'\n');process.exitCode=1}
export const isMain=url=>{try{return !!process.argv[1]&&fileURLToPath(url)===fs.realpathSync(path.resolve(process.argv[1]))}catch{return false}};
