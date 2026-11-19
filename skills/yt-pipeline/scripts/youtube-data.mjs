#!/usr/bin/env node
// youtube_research_data as a command: the same read-only operations and argument
// allow-list as the agentic-os vault MCP tool. YOUTUBE_API_KEY comes from the
// environment and never appears in the output.
//   node youtube-data.mjs '{"operation":"search","query":"claude code","maxResults":10}'
//   echo '{"operation":"videos","videoIds":["dQw4w9WgXcQ"]}' | node youtube-data.mjs -
import {collectYouTubeResearch} from './lib/youtube-research-data.mjs';
import {parseArgs,jsonArgs,print,fail,isMain} from './lib/config.mjs';

export const ALLOWED=['operation','query','videoIds','channelIds','channelId','publishedAfter','order','maxResults'];
export async function run(args,{env=process.env,fetchImpl=fetch,now=new Date()}={}){
 if(!args||Array.isArray(args)||Object.keys(args).some(key=>!ALLOWED.includes(key)))throw new Error('Unsupported YouTube research arguments.');
 return collectYouTubeResearch({...args,env,fetchImpl,now});
}
if(isMain(import.meta.url)){
 try{const {positional}=parseArgs(process.argv.slice(2));print(await run(await jsonArgs(positional)))}catch(e){fail(e)}
}
