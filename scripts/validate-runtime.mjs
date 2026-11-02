import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const endpoint=`http://127.0.0.1:${process.env.CDP_PORT||9367}`;
const target=(await(await fetch(endpoint+'/json/list')).json()).find(t=>t.type==='page'&&t.title.includes('WebviewerAdblockSandbox')&&t.url==='app://obsidian.md/index.html');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map(),errors=[];
ws.addEventListener('message',e=>{let m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)});
const send=(method,params={})=>new Promise(r=>{let n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{let m=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(m.error||m.result.exceptionDetails)throw Error(JSON.stringify(m));return m.result.result.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){for(let i=0;i<40;i++){if(await evaluate(expression))return;await sleep(250);}throw Error(`Timed out: ${expression}`)}
const p=`app.plugins.plugins['webviewer-adblock']`,view=`app.workspace.getLeavesOfType('webviewer')[0].view`;
const context=`${p}.contexts.get(${view}.webview.getWebContentsId())`;
const page=expression=>evaluate(`${view}.webview.executeJavaScript(${JSON.stringify(expression)})`);
const report={version:'0.1.1',checks:[],errors};
await send('Runtime.enable');await mkdir('artifacts',{recursive:true});
const screenshot=async name=>{
 let s;
 const targets=await(await fetch(endpoint+'/json/list')).json();
 const settings=name==='settings'&&targets.find(t=>t.type==='page'&&t.title.startsWith('설정 - WebviewerAdblockSandbox'));
 if(settings){const other=new WebSocket(settings.webSocketDebuggerUrl);await new Promise(r=>other.addEventListener('open',r,{once:true}));s=await new Promise(r=>{other.addEventListener('message',e=>r(JSON.parse(e.data)),{once:true});other.send(JSON.stringify({id:1,method:'Page.captureScreenshot',params:{format:'png'}}))});other.close();}
 else s=await send('Page.captureScreenshot',{format:'png'});
 await writeFile(`artifacts/${name}.png`,Buffer.from(s.result.data,'base64'));
};
try{
await evaluate(`(async()=>{let leaf=app.workspace.getLeavesOfType('webviewer')[0];await leaf.loadIfDeferred();let p=${p};p.options.enabled=true;p.options.cosmetic=true;p.options.excluded=[];await p.apply();app.workspace.setActiveLeaf(leaf,{focus:true});await ${view}.navigate('http://adblock.test.localhost:19846/',true);})()`);
await until(`(()=>{try{return ${view}.webview.getURL().includes('adblock.test.localhost')}catch{return false}})()`);await sleep(2000);
assert.deepEqual(await page(`({ad:!!window.adScriptLoaded,article:!!window.articleScriptLoaded,banner:getComputedStyle(document.querySelector('.ad-banner-300')).display})`),{ad:false,article:true,banner:'none'});report.checks.push('production ad script blocked; content script runs; banner hidden');
assert.equal(await evaluate(`app.internalPlugins.plugins.webviewer.instance.options.enableAdblocking`),true);report.checks.push('native blocking setting unchanged');
await page(`document.querySelector('button').click()`);await sleep(1400);assert.equal(await page(`[...document.querySelectorAll('.ad-banner-300')].every(e=>getComputedStyle(e).display==='none')`),true);report.checks.push('dynamic banner hidden');await screenshot('enabled');
await page(`(()=>{const e=document.createElement('div');e.className='before-spa';document.body.append(e);history.pushState(null,'','?spa=2')})()`);await sleep(700);
await page(`(()=>{const e=document.createElement('div');e.className='ad-banner-250x600';e.textContent='SPA 이후 동적 광고';document.body.append(e)})()`);await sleep(1400);
await until(`${view}.webview.executeJavaScript("getComputedStyle(document.querySelector('.ad-banner-250x600')).display==='none'")`);report.checks.push('same-document navigation keeps dynamic filtering alive after a pending debounce');
await evaluate(`${context}.action.click()`);await sleep(700);await evaluate(`${view}.webview.reload()`);await sleep(1800);
assert.deepEqual(await page(`({ad:!!window.adScriptLoaded,banner:getComputedStyle(document.querySelector('.ad-banner-300')).display})`),{ad:true,banner:'block'});assert.deepEqual(await evaluate(`${p}.options.excluded`),['adblock.test.localhost']);report.checks.push('real shield button saves site exception; ad script and banner return');await screenshot('excluded');
await evaluate(`${context}.action.click()`);await sleep(500);await evaluate(`${p}.openSettings()`);await sleep(350);await screenshot('settings');
const settings=await evaluate(`app.setting.activeTab.containerEl.innerText`);assert.match(settings,/추가 광고 차단/);assert.match(settings,/지금 업데이트/);report.checks.push('Korean settings visible');
await evaluate(`(()=>{const row=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent==='추가 광고 차단');row.querySelector('.checkbox-container').click()})()`);await sleep(500);assert.equal(await evaluate(`${p}.options.enabled`),false);
await evaluate(`app.setting.close()`);await evaluate(`${view}.webview.reload()`);await sleep(1500);assert.equal(await page(`!!window.adScriptLoaded`),true);report.checks.push('settings toggle disables interception and restores page requests');
await evaluate(`${p}.openSettings()`);await evaluate(`(()=>{const row=[...app.setting.activeTab.containerEl.querySelectorAll('.setting-item')].find(e=>e.querySelector('.setting-item-name')?.textContent==='추가 광고 차단');row.querySelector('.checkbox-container').click()})()`);await sleep(600);await evaluate(`app.setting.close()`);await evaluate(`${view}.webview.reload()`);await sleep(1700);assert.equal(await page(`!!window.adScriptLoaded`),false);report.checks.push('settings toggle re-enables protection');
assert.equal(errors.length,0);report.checks.push('no runtime exceptions');
console.log(JSON.stringify(report,null,2));
}finally{await writeFile('artifacts/runtime-validation.json',JSON.stringify(report,null,2));ws.close()}
