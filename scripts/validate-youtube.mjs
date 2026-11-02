import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const endpoint=`http://127.0.0.1:${process.env.CDP_PORT||9367}`;
const targets=await(await fetch(endpoint+'/json/list')).json();
const target=targets.find(t=>t.type==='page'&&t.title.includes('WebviewerAdblockSandbox')&&t.url==='app://obsidian.md/index.html');
if(!target)throw Error('Isolated Sandbox not found');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}});
const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const m=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(m.error||m.result.exceptionDetails)throw Error(JSON.stringify(m));return m.result.result.value};
const c=`app.plugins.plugins['webviewer-adblock'].contexts.get(window.__wvabYTTestId)`;
const page=expression=>evaluate(`${c}.wc.executeJavaScript(${JSON.stringify(expression)},true)`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=async point=>evaluate(`(async()=>{const ctx=${c};ctx.webview.focus();ctx.wc.focus();for(const type of ['mouseMoved','mousePressed','mouseReleased'])await ctx.wc.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:${point.x},y:${point.y},...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});})()`);
const state=()=>page(`({url:location.href,title:document.title,guard:!!window.__wvabYouTube,documentMarker:window.__wvabTestDocumentMarker,ad:!!document.querySelector('#movie_player.ad-showing,#movie_player.ad-interrupting'),time:document.querySelector('video')?.currentTime,duration:document.querySelector('video')?.duration,ready:document.querySelector('video')?.readyState,paused:document.querySelector('video')?.paused,videoId:document.querySelector('#movie_player')?.getVideoData?.().video_id,adKeys:Object.keys(window.ytInitialPlayerResponse||{}).filter(k=>['playerAds','adPlacements','adSlots','adBreakHeartbeatParams'].includes(k))})`);
const report={version:'0.1.1',videos:[],shieldClicks:0};
try{
await mkdir('artifacts',{recursive:true});
await evaluate(`(()=>{const p=app.plugins.plugins['webviewer-adblock'];const ctx=[...p.contexts.values()].find(c=>c.wc.getURL().includes('youtube.com/watch'));if(!ctx)throw Error('Open a YouTube video in Sandbox first');window.__wvabYTTestId=ctx.wc.id;app.workspace.setActiveLeaf(ctx.view.leaf,{focus:true});return ctx.wc.id})()`);
if(!process.env.YOUTUBE_NO_RELOAD){await evaluate(`${c}.webview.reload()`);await sleep(2000);}
for(let index=0;index<3;index++){
 let s;
 for(let i=0;i<100;i++){s=await state();if(s.guard&&s.duration>0&&s.videoId&&new URL(s.url).searchParams.get('v')===s.videoId)break;await sleep(500);}
 assert.equal(s.guard,true);assert.equal(s.ad,false);assert.ok(s.duration>0);
 await page(`window.__wvabTestDocumentMarker=window.__wvabTestDocumentMarker||'same-document'`);
 if((await state()).paused){const rect=await page(`(()=>{const r=document.querySelector('.ytp-play-button').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await click(rect);}
 for(let i=0;i<100;i++){s=await state();assert.equal(s.ad,false);if(!s.paused&&s.ready>=2&&s.time>0)break;await sleep(500);}
 const first=await state();const samples=[];
 for(let i=0;i<24;i++){await sleep(250);samples.push(await state());}
 const last=samples.at(-1);assert.equal(samples.some(s=>s.ad),false,'Ad appeared during playback');assert.ok(last.time>first.time+1,`Playback did not advance: ${JSON.stringify(last)}`);assert.equal(last.paused,false);assert.deepEqual(last.adKeys,[]);
 report.videos.push({url:last.url,title:last.title,duration:last.duration,timeStart:first.time,timeEnd:last.time,adSamples:samples.filter(s=>s.ad).length,guard:last.guard,sameDocument:index===0?null:last.documentMarker==='same-document'});
 console.log(`Verified video ${index+1}: ${last.title}`);
 if(index<2){const previous=last.url;const href=await page(`(()=>{const current=new URL(location.href).searchParams.get('v');const a=[...document.querySelectorAll('a[href]')].find(a=>{try{const u=new URL(a.href);return u.hostname.endsWith('youtube.com')&&u.pathname==='/watch'&&u.searchParams.get('v')&&u.searchParams.get('v')!==current&&!a.closest('ytd-ad-slot-renderer')&&a.getClientRects().length}catch{return false}});if(!a)return null;a.scrollIntoView({block:'center',behavior:'instant'});a.click();return a.href})()`);assert.ok(href,'No related-video link found');for(let i=0;i<80;i++){if((await state()).url!==previous)break;await sleep(250);}assert.notEqual((await state()).url,previous);}
}
assert.equal(await evaluate(`app.plugins.plugins['webviewer-adblock'].lastError`),'');
const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/youtube-verified.png',Buffer.from(shot.result.data,'base64'));
console.log(JSON.stringify(report,null,2));
}finally{await writeFile('artifacts/youtube-validation.json',JSON.stringify(report,null,2));ws.close()}
