const targets = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT||9367}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page' && t.title.includes('WebviewerAdblockSandbox') && t.url==='app://obsidian.md/index.html').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0; const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}});
const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}))});
const expression=process.argv[2] || await (await import('node:fs/promises')).readFile(process.argv[3],'utf8');
const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
console.log(JSON.stringify(r.result,null,2));
if(process.env.CDP_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});await(await import('node:fs/promises')).writeFile(process.env.CDP_SCREENSHOT,Buffer.from(shot.result.data,'base64'));}
ws.close();
