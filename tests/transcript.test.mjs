import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const tools=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','tools');
const python=process.env.CONTENT_OS_PYTHON||(process.platform==='win32'?'python':'python3');
const hasPython=spawnSync(python,['--version']).status===0;
const py=code=>{const r=spawnSync(python,['-I','-c',`import sys,json;sys.path.insert(0,${JSON.stringify(tools)});import transcript as T\n${code}`],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return JSON.parse(r.stdout)};

test('video ids are read from every common URL shape and nothing else',{skip:!hasPython&&'python unavailable'},()=>{
 const ids=py(`print(json.dumps([T.video_id(v) for v in ["dQw4w9WgXcQ","https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30","https://youtu.be/dQw4w9WgXcQ?si=x","youtube.com/shorts/dQw4w9WgXcQ","https://m.youtube.com/live/dQw4w9WgXcQ","https://example.com/watch?v=dQw4w9WgXcQ","not a video","https://youtube.com/watch?v=short"]]))`);
 assert.deepEqual(ids,['dQw4w9WgXcQ','dQw4w9WgXcQ','dQw4w9WgXcQ','dQw4w9WgXcQ','dQw4w9WgXcQ',null,null,null]);
});
test('WebVTT captions become timed segments without rolling duplicates or markup',{skip:!hasPython&&'python unavailable'},()=>{
 const vtt='WEBVTT\\nKind: captions\\n\\n00:00:01.000 --> 00:00:03.500 align:start\\nhello <c>world</c>\\n\\n00:00:03.500 --> 00:00:06.000\\nhello world\\nthis is &amp; that\\n\\n01:00:00.000 --> 01:00:02.000\\nlast line';
 const segments=py(`print(json.dumps(T.parse_vtt("${vtt}")))`);
 assert.deepEqual(segments,[{start:1,duration:2.5,text:'hello world'},{start:3.5,duration:2.5,text:'this is & that'},{start:3600,duration:2,text:'last line'}]);
});
test('original captions are preferred, failures are all reported, and metadata is never a transcript',{skip:!hasPython&&'python unavailable'},()=>{
 const r=py(`
def api(vid,langs): raise RuntimeError("youtube-transcript-api is not installed")
def ok(vid,langs): return T._result("yt-dlp",vid,"en",False,[{"start":0,"duration":2,"text":"hi there"}],"Title")
def none(vid,langs): raise RuntimeError("no subtitles")
print(json.dumps([T.read_transcript("dQw4w9WgXcQ",["en"],"auto",api,ok),T.read_transcript("dQw4w9WgXcQ",["en"],"auto",api,none),T.read_transcript("nope",["en"])]))`);
 assert.equal(r[0].available,true);assert.equal(r[0].method,'yt-dlp');assert.equal(r[0].text,'hi there');assert.equal(r[0].attempts.length,2);assert.equal(r[0].attempts[0].ok,false);
 assert.equal(r[1].available,false);assert.deepEqual(r[1].attempts.map(a=>a.method),['youtube-transcript-api','yt-dlp']);assert.match(r[1].error,/Do not substitute the title/);
 assert.equal(r[2].available,false);assert.equal(r[2].videoId,null);
});
test('the API path orders manual captions before generated ones',{skip:!hasPython&&'python unavailable'},()=>{
 const r=py(`
import types
class Tr:
    def __init__(s,code,gen): s.language_code=code; s.is_generated=gen
    def fetch(s): return [types.SimpleNamespace(text=s.language_code+(" auto" if s.is_generated else " manual"),start=0.0,duration=1.0)]
class Api:
    def list(s,vid): return [Tr("en",True),Tr("de",False),Tr("en-US",False)]
mod=types.ModuleType("youtube_transcript_api"); mod.YouTubeTranscriptApi=Api; sys.modules["youtube_transcript_api"]=mod
print(json.dumps(T.via_api("dQw4w9WgXcQ",["en"])))`);
 assert.equal(r.text,'en-US manual');assert.equal(r.isGenerated,false);assert.equal(r.language,'en-US');
});
test('the command exits 2 with JSON when no method can be used',{skip:!hasPython&&'python unavailable'},()=>{
 const r=spawnSync(python,['-I',path.join(tools,'transcript.py'),'https://youtu.be/dQw4w9WgXcQ','--method','api'],{encoding:'utf8'});
 if(r.status===0)return; // youtube-transcript-api installed and online
 assert.equal(r.status,2);const out=JSON.parse(r.stdout);assert.equal(out.available,false);assert.equal(out.attempts[0].method,'youtube-transcript-api');
});
