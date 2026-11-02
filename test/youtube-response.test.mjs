import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
// Exercise the real plugin response handler without loading Obsidian's UI.
await build({entryPoints:['src/main.ts'],outfile:'artifacts/plugin-test.cjs',bundle:true,format:'cjs',platform:'node',target:'es2022',external:['obsidian','@electron/remote']});
const module={exports:{}};
vm.runInNewContext(await readFile('artifacts/plugin-test.cjs','utf8'),{module,exports:module.exports,Buffer,URL,TextEncoder,TextDecoder,console,require:name=>{if(name==='obsidian')return {Plugin:class{},PluginSettingTab:class{}};throw Error(name)}});
function fixture(body){
 const p=new module.exports.default();p.options={enabled:true,excluded:[]};p.refreshStatus=()=>{};p.report=e=>{throw e};
 const calls=[];const ctx={active:true,blocked:0,wc:{getURL:()=> 'https://www.youtube.com/watch?v=video',debugger:{sendCommand:async(method,params)=>{calls.push({method,params});return method==='Fetch.getResponseBody'?{body:Buffer.from(body).toString('base64'),base64Encoded:true}:{}}}}};
 return {p,ctx,calls,request:{requestId:'test',request:{url:'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'},responseStatusCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Content-Encoding',value:'gzip'},{name:'Content-Length',value:'999'}]}};
}
test('response-stage player ads are removed and content stream preserved',async()=>{
 const {p,ctx,calls,request}=fixture(JSON.stringify({adPlacements:[1],adSlots:[2],streamingData:{video:'content'},captions:{text:'subtitle'}}));
 await p.handleRequest(ctx,request);const fulfilled=calls.find(c=>c.method==='Fetch.fulfillRequest');assert.ok(fulfilled);
 assert.deepEqual(JSON.parse(Buffer.from(fulfilled.params.body,'base64')),{streamingData:{video:'content'},captions:{text:'subtitle'}});
 assert.deepEqual(Array.from(fulfilled.params.responseHeaders,h=>h.name),['Content-Type']);assert.equal(p.total,1);
});
test('ad-free responses pass through without unnecessary reserialization',async()=>{
 const {p,ctx,calls,request}=fixture('{"streamingData":{"video":"content"}}');await p.handleRequest(ctx,request);
 assert.equal(calls.at(-1).method,'Fetch.continueRequest');assert.equal(calls.some(c=>c.method==='Fetch.fulfillRequest'),false);
});
test('excluded YouTube and non-player URLs are untouched',async()=>{
 const f=fixture('{"adSlots":[1]}');f.p.options.excluded=['youtube.com'];await f.p.handleRequest(f.ctx,f.request);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'Fetch.continueRequest');
});
