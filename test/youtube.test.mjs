import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
await build({entryPoints:['src/youtube.ts'],outfile:'artifacts/youtube.mjs',format:'esm',platform:'node'});
const {stripYouTubeAds,isYouTubePlayerResponse,youtubeGuardSource}=await import('../artifacts/youtube.mjs');
function page(host='www.youtube.com'){
 const context=vm.createContext({location:{hostname:host},queueMicrotask,console,URL});
 vm.runInContext(`
 window=globalThis; listeners=new Map(); intervals=new Set();
 setInterval=fn=>{intervals.add(fn);return fn};clearInterval=fn=>intervals.delete(fn);
 Response=class{constructor(body,url){this.body=body;this.url=url}json(){return Promise.resolve(this.body)}};
 MutationObserver=class{constructor(cb){this.callback=cb}observe(){}disconnect(){}};
 video={currentTime:12,duration:120,muted:false,currentSrc:'content'};
 ad=false;skipClicks=0;hasSkip=false;
 player={matches:()=>ad,querySelector:s=>s==='video'?video:(hasSkip?{getClientRects:()=>[1],click:()=>skipClicks++}:null)};
 document={documentElement:{append:s=>{s.isConnected=true}},querySelector:s=>s==='#movie_player'?player:null,
 createElement:()=>({dataset:{},isConnected:false,remove(){this.isConnected=false}}),
 addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
 removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)};
 `,context);
 return context;
}
test('prune player ads while preserving streams captions and playlist data',()=>{
 const value={playerAds:[1],adPlacements:[2],adSlots:[3],adBreakHeartbeatParams:'x',streamingData:{url:'video'},captions:{text:'subtitle'},contents:{playlist:[1,2]},playerResponse:{adSlots:[1],videoDetails:{id:'next'}}};
 stripYouTubeAds(value);assert.deepEqual(value,{streamingData:{url:'video'},captions:{text:'subtitle'},contents:{playlist:[1,2]},playerResponse:{videoDetails:{id:'next'}}});
});
test('only intercept YouTube player/next endpoints, not login or lookalike hosts',()=>{
 assert.equal(isYouTubePlayerResponse('https://www.youtube.com/youtubei/v1/player?key=x'),true);
 for(const url of ['https://youtube.com.evil.test/youtubei/v1/player','https://accounts.google.com/login','https://www.youtube.com/youtubei/v1/browse'])assert.equal(isYouTubePlayerResponse(url),false);
});
test('document-start assignment and JSON parse prune initial and successive player data',()=>{
 const c=page();vm.runInContext(youtubeGuardSource(true),c);
 assert.equal(vm.runInContext(`ytInitialPlayerResponse={adPlacements:[1],videoDetails:{id:'a'}}; JSON.stringify(ytInitialPlayerResponse)`,c),' {"videoDetails":{"id":"a"}}'.trim());
 assert.equal(vm.runInContext(`JSON.stringify(JSON.parse('{"adSlots":[1],"videoDetails":{"id":"b"}}'))`,c),'{"videoDetails":{"id":"b"}}');
 assert.equal(c.video.currentTime,12);assert.equal(c.video.muted,false);
});
test('native Response.json handles successive SPA player responses automatically',async()=>{
 const c=page();vm.runInContext(youtubeGuardSource(true),c);
 for(const id of ['a','b','c']){
  const result=await vm.runInContext(`new Response({adSlots:[1],streamingData:{id:'${id}'}},'https://www.youtube.com/youtubei/v1/player').json()`,c);
  assert.equal(result.adSlots,undefined);assert.equal(result.streamingData.id,id);
 }
});
test('guard is idempotent, skips active ads only, preserves audio and cleans up',()=>{
 const c=page();vm.runInContext('originalParse=JSON.parse;originalJson=Response.prototype.json',c);
 vm.runInContext(youtubeGuardSource(true),c);vm.runInContext(youtubeGuardSource(true),c);assert.equal(c.intervals.size,1);
 c.ad=true;c.video.currentSrc='ad';c.__wvabYouTube.refresh();assert.equal(c.video.currentTime,120);assert.equal(c.video.muted,false);
 c.ad=false;c.video.currentTime=0;c.__wvabYouTube.refresh();assert.equal(c.video.currentTime,0);assert.equal(c.video.muted,false);
 c.hasSkip=true;c.ad=true;c.__wvabYouTube.refresh();assert.equal(c.skipClicks,1);
 vm.runInContext('__wvabYouTube.stop()',c);assert.equal(c.intervals.size,0);assert.equal(vm.runInContext('JSON.parse===originalParse&&Response.prototype.json===originalJson',c),true);
 assert.equal([...c.listeners.values()].every(s=>s.size===0),true);
});
test('site exclusions and unrelated pages do not install automatic guard',()=>{
 const c=page();vm.runInContext(youtubeGuardSource(true,['youtube.com']),c);assert.equal(c.__wvabYouTube,undefined);
 const other=page('example.com');vm.runInContext(youtubeGuardSource(true),other);assert.equal(other.__wvabYouTube,undefined);
});
test('stale ad CSS must not seek or mute the actual content video',()=>{
 const c=page();c.ytInitialPlayerResponse={videoDetails:{lengthSeconds:'120'}};c.ad=true;
 vm.runInContext(youtubeGuardSource(true),c);assert.equal(c.video.currentTime,12);assert.equal(c.video.muted,false);
});
