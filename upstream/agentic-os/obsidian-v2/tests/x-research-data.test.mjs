import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {collectXResearch,xDailyLimit,X_RUN_LIMIT,X_DAILY_LIMIT} from '../runner/x-research-data.mjs';

const env={TWITTERAPI_IO_KEY:'x-fixture-secret-do-not-return'},now=new Date('2026-11-16T12:00:00Z');
const ledger=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'x-data-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'x-data-usage.json')};
const legacy=date=>{const d=new Date(date),days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],two=n=>String(n).padStart(2,'0');return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`};
const tweet=(n,extra={})=>({id:String(1000+n),url:'https://x.com/example/status/'+(1000+n),text:'Example post '+n,createdAt:legacy('2026-11-16T10:00:00Z'),likeCount:150,retweetCount:50,replyCount:7,quoteCount:3,viewCount:9000,bookmarkCount:4,isReply:false,lang:'en',author:{userName:'example',name:'Example Author',followers:1200,isBlueVerified:true},...extra});
const json=(body,init={})=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'},...init});
function fixture(pages){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const parsed=new URL(url);
  assert.equal(parsed.origin,'https://api.twitterapi.io');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.equal(options.headers['X-API-Key'],env.TWITTERAPI_IO_KEY);assert.equal(url.includes(env.TWITTERAPI_IO_KEY),false);assert.ok(options.signal instanceof AbortSignal);
  calls.push({path:parsed.pathname,params:parsed.searchParams});
  const page=pages[Math.min(calls.length-1,pages.length-1)];
  return typeof page==='function'?page():json(page);
 };
 return {fetchImpl,calls};
}
const collect=(t,options,f,extra={})=>collectXResearch({env,now,usageFile:ledger(t),retryDelayMs:0,...options,fetchImpl:f.fetchImpl,...extra});

test('search sends the query with the time window and returns posts with real engagement',async t=>{
 const f=fixture([{tweets:[tweet(1),tweet(2,{likeCount:10,retweetCount:0})],has_next_page:false,next_cursor:''}]);
 const r=await collect(t,{operation:'search',query:' claude code ',sinceHours:24},f);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/twitter/tweet/advanced_search');
 assert.equal(f.calls[0].params.get('query'),`(claude code) since_time:${Math.floor((now.getTime()-24*3600000)/1000)}`,'the window must cover every OR term');assert.equal(f.calls[0].params.get('queryType'),'Top');
 assert.equal(r.available,true);assert.equal(r.source,'twitterapi.io');assert.equal(r.posts.length,2);
 const p=r.posts[0];
 assert.equal(p.url,'https://x.com/example/status/1001');assert.equal(p.author,'example');assert.equal(p.authorFollowers,1200);assert.equal(p.createdAt,'2026-11-16T10:00:00.000Z');assert.equal(p.ageHours,2);
 assert.deepEqual([p.likes,p.reposts,p.replies,p.quotes,p.views,p.bookmarks],[150,50,7,3,9000,4]);assert.equal(p.velocityPerHour,100);
 assert.equal('_created' in p,false);assert.equal(r.coverage.billedPosts,2);assert.equal(r.coverage.hasMore,false);assert.match(r.coverage.warnings.join(' '),/non-exhaustive/);
 assert.equal(r.budget.runRemaining,X_RUN_LIMIT-2);assert.equal(r.budget.dailyRemaining,X_DAILY_LIMIT-2);
 assert.equal(JSON.stringify(r).includes(env.TWITTERAPI_IO_KEY),false);
});

test('user_posts reads one handle, accepts a leading @ and drops posts older than the window',async t=>{
 const f=fixture([{status:'success',data:{pin_tweet:null,tweets:[tweet(1),tweet(2,{createdAt:legacy('2026-11-01T10:00:00Z')})]},has_next_page:true,next_cursor:'c2'},{status:'success',data:{tweets:[tweet(3,{createdAt:legacy('2026-10-30T10:00:00Z')})]},has_next_page:true,next_cursor:'c3'}]);
 const r=await collect(t,{operation:'user_posts',handle:'@AnthropicAI',maxResults:40},f);
 assert.equal(f.calls[0].path,'/twitter/user/last_tweets');assert.equal(f.calls[0].params.get('userName'),'AnthropicAI');assert.equal(f.calls[0].params.get('includeReplies'),'false');
 assert.equal(f.calls.length,2,'a page with nothing inside the window ends paging');assert.equal(f.calls[1].params.get('cursor'),'c2');
 assert.deepEqual(r.posts.map(p=>p.id),['1001']);assert.equal(r.coverage.outsideWindow,2);assert.equal(r.window.sinceHours,48);
});

test('paging stops at maxResults and reports that more exist',async t=>{
 const page=start=>({tweets:Array.from({length:20},(_,i)=>tweet(start+i)),has_next_page:true,next_cursor:'next'});
 const f=fixture([page(0),page(20),page(40)]);
 const r=await collect(t,{operation:'search',query:'agents',maxResults:30},f);
 assert.equal(f.calls.length,2);assert.equal(r.posts.length,30);assert.equal(r.coverage.billedPosts,40);assert.equal(r.coverage.hasMore,true);assert.match(r.coverage.warnings.join(' '),/more matches exist/);
});

test('an empty result is available and explicitly not an outage',async t=>{
 const f=fixture([{tweets:[],has_next_page:false,next_cursor:''}]);
 const r=await collect(t,{operation:'search',query:'nothing here'},f);
 assert.equal(r.available,true);assert.deepEqual(r.posts,[]);assert.match(r.coverage.warnings.join(' '),/empty result, not an outage/);
});

test('missing counters and dates stay unknown instead of zero',async t=>{
 const f=fixture([{tweets:[tweet(1,{likeCount:undefined,viewCount:'12',createdAt:'not a date',author:{userName:'bad handle!'}})],has_next_page:false}]);
 const r=await collect(t,{operation:'search',query:'x'},f),p=r.posts[0];
 assert.equal(p.likes,null);assert.equal(p.views,null);assert.equal(p.createdAt,null);assert.equal(p.ageHours,null);assert.equal(p.velocityPerHour,null);assert.equal(p.author,null);assert.equal(p.url,'https://x.com/i/status/1001');
 assert.match(r.coverage.warnings.join(' '),/remain null, not zero/);
});

test('a missing key is reported as unavailable with the web-search fallback, without any request',async t=>{
 let called=0;const fetchImpl=async()=>{called++;return json({tweets:[]})};
 for(const configured of [{},{TWITTERAPI_IO_KEY:''},{TWITTERAPI_IO_KEY:'   '}]){
  const r=await collectXResearch({env:configured,now,usageFile:ledger(t),operation:'search',query:'x',fetchImpl});
  assert.equal(r.available,false);assert.equal(r.reason,'not_configured');assert.match(r.fallback,/site:x\.com/);assert.match(r.fallback,/Source Status/);
 }
 assert.equal(called,0);
});

test('rejected keys, exhausted credits and outages each name their reason and never reveal the key or body',async t=>{
 const phrase='PRIVATE BODY '+env.TWITTERAPI_IO_KEY;
 const cases=[[()=>new Response(phrase,{status:401}),'key_rejected'],[()=>new Response(phrase,{status:403}),'key_rejected'],[()=>new Response(phrase,{status:402}),'credits_exhausted'],[()=>new Response(phrase,{status:400}),'api_error'],[()=>new Response(phrase),'api_error'],[()=>json({status:'error',msg:'Credits is not enough, please recharge '+env.TWITTERAPI_IO_KEY}),'credits_exhausted'],[()=>json({tweets:'bad'}),'api_error'],[()=>{throw new Error('https://api.twitterapi.io/?k='+env.TWITTERAPI_IO_KEY)},'api_error']];
 for(const [page,reason] of cases){
  const r=await collect(t,{operation:'search',query:'x'},fixture([page]));
  assert.equal(r.available,false);assert.equal(r.reason,reason);
  const text=JSON.stringify(r);assert.equal(text.includes(env.TWITTERAPI_IO_KEY),false);assert.equal(text.includes('PRIVATE BODY'),false);assert.equal(text.includes('https://api'),false);
 }
});

test('a rate limit or server error is retried once, then reported',async t=>{
 const recovered=fixture([()=>new Response('',{status:429}),{tweets:[tweet(1)],has_next_page:false}]);
 const r=await collect(t,{operation:'search',query:'x'},recovered);assert.equal(recovered.calls.length,2);assert.equal(r.available,true);assert.equal(r.posts.length,1);
 const down=fixture([()=>new Response('',{status:503})]);
 const failed=await collect(t,{operation:'search',query:'x'},down);assert.equal(down.calls.length,2);assert.equal(failed.available,false);assert.equal(failed.reason,'api_error');
 const denied=fixture([()=>new Response('',{status:401})]);await collect(t,{operation:'search',query:'x'},denied);assert.equal(denied.calls.length,1,'a rejected key is not retried');
});

test('a failure after the first page keeps the posts already read',async t=>{
 const f=fixture([{tweets:Array.from({length:20},(_,i)=>tweet(i)),has_next_page:true,next_cursor:'n'},()=>new Response('',{status:402})]);
 const r=await collect(t,{operation:'search',query:'x',maxResults:40},f);
 assert.equal(r.available,true);assert.equal(r.posts.length,20);assert.equal(r.coverage.hasMore,true);assert.match(r.coverage.warnings.join(' '),/stopped early/);
});

test('the daily budget is shared through the ledger file and blocks further requests',async t=>{
 const file=ledger(t),page={tweets:Array.from({length:20},(_,i)=>tweet(i)),has_next_page:false};
 const limited={...env,X_DATA_DAILY_POST_LIMIT:'40'};
 for(let i=0;i<2;i++){const f=fixture([page]);const r=await collectXResearch({env:limited,now,usageFile:file,operation:'search',query:'x',fetchImpl:f.fetchImpl});assert.equal(r.available,true)}
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{date:'2026-11-16',posts:40,requests:2});
 const blocked=fixture([page]),r=await collectXResearch({env:limited,now,usageFile:file,operation:'search',query:'x',fetchImpl:blocked.fetchImpl});
 assert.equal(blocked.calls.length,0);assert.equal(r.available,false);assert.equal(r.reason,'daily_cap_reached');assert.equal(r.budget.dailyRemaining,0);assert.match(r.fallback,/web search/);
 const nextDay=fixture([page]),tomorrow=await collectXResearch({env:limited,now:new Date('2026-11-17T00:00:01Z'),usageFile:file,operation:'search',query:'x',fetchImpl:nextDay.fetchImpl});
 assert.equal(tomorrow.available,true,'the budget resets on the next UTC day');
});

test('the per-run budget stops one worker run regardless of the daily budget',async t=>{
 const file=ledger(t),runUsage={posts:X_RUN_LIMIT-20},page={tweets:Array.from({length:20},(_,i)=>tweet(i)),has_next_page:true,next_cursor:'n'};
 const f=fixture([page]),r=await collectXResearch({env,now,usageFile:file,runUsage,operation:'search',query:'x',maxResults:40,fetchImpl:f.fetchImpl});
 assert.equal(f.calls.length,1);assert.equal(r.posts.length,20);assert.equal(runUsage.posts,X_RUN_LIMIT);assert.match(r.coverage.warnings.join(' '),/per-run X data budget/);
 const again=fixture([page]),blocked=await collectXResearch({env,now,usageFile:file,runUsage,operation:'search',query:'x',fetchImpl:again.fetchImpl});
 assert.equal(again.calls.length,0);assert.equal(blocked.reason,'run_cap_reached');
});

test('the daily limit setting accepts whole numbers only and is capped',()=>{
 assert.equal(xDailyLimit({}),X_DAILY_LIMIT);assert.equal(xDailyLimit({X_DATA_DAILY_POST_LIMIT:''}),X_DAILY_LIMIT);assert.equal(xDailyLimit({X_DATA_DAILY_POST_LIMIT:'200'}),200);assert.equal(xDailyLimit({X_DATA_DAILY_POST_LIMIT:'0'}),0);
 assert.equal(xDailyLimit({X_DATA_DAILY_POST_LIMIT:'999999'}),5000);
 for(const bad of ['-5','1.5','lots','1e3'])assert.equal(xDailyLimit({X_DATA_DAILY_POST_LIMIT:bad}),X_DAILY_LIMIT,bad);
});

test('invalid requests are rejected before any network call',async t=>{
 let called=0;const fetchImpl=async()=>{called++;return json({tweets:[]})},usageFile=ledger(t);
 const bad=[{operation:'delete'},{operation:'search'},{operation:'search',query:''},{operation:'search',query:'x'.repeat(301)},{operation:'search',query:'x since_time:1'},{operation:'search',query:'x',sort:'Hot'},{operation:'search',query:'x',handle:'a'},{operation:'search',query:'x',sinceHours:0},{operation:'search',query:'x',sinceHours:5000},{operation:'search',query:'x',maxResults:41},{operation:'search',query:'x',maxResults:1.5},{operation:'search',query:'x',url:'https://example.com'},{operation:'user_posts'},{operation:'user_posts',handle:'has space'},{operation:'user_posts',handle:'a'.repeat(16)},{operation:'user_posts',handle:'ok',query:'x'}];
 for(const options of bad)await assert.rejects(collectXResearch({env,now,usageFile,fetchImpl,...options}),/Invalid X research request/,JSON.stringify(options));
 await assert.rejects(collectXResearch({env,now,fetchImpl,operation:'search',query:'x'}),/Invalid X research request/,'a ledger path is required');
 await assert.rejects(collectXResearch({env,now:'bad-date',usageFile,fetchImpl,operation:'search',query:'x'}),/collection date/);
 assert.equal(called,0);
});

test('post text cannot echo the configured key and control characters are removed',async t=>{
 const f=fixture([{tweets:[tweet(1,{text:'leak '+env.TWITTERAPI_IO_KEY+' \u0007bell',author:{userName:'example',name:env.TWITTERAPI_IO_KEY}})],has_next_page:false}]);
 const r=await collect(t,{operation:'search',query:'x'},f);
 assert.equal(JSON.stringify(r).includes(env.TWITTERAPI_IO_KEY),false);assert.equal(r.posts[0].text,'leak [redacted] bell');
});

test('cancellation stops a hung request, and a hung request times out as an outage',async t=>{
 let called=false;
 await assert.rejects(collectXResearch({env,now,usageFile:ledger(t),operation:'search',query:'x',signal:AbortSignal.abort(),fetchImpl:async()=>{called=true}}),/cancelled/);assert.equal(called,false);
 const controller=new AbortController();
 const pending=collectXResearch({env,now,usageFile:ledger(t),operation:'search',query:'x',signal:controller.signal,fetchImpl:async()=>new Promise(()=>{})});
 await new Promise(setImmediate);controller.abort();await assert.rejects(pending,/cancelled/);
 t.mock.timers.enable({apis:['setTimeout']});
 const hung=collectXResearch({env,now,usageFile:ledger(t),operation:'search',query:'x',fetchImpl:async()=>new Promise(()=>{})});
 await new Promise(setImmediate);t.mock.timers.tick(15000);
 const r=await hung;assert.equal(r.available,false);assert.equal(r.reason,'api_error');assert.match(r.message,/timed out/);
});
