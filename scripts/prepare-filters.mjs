import {FiltersEngine} from '@ghostery/adblocker';
import {mkdir,writeFile} from 'node:fs/promises';
import https from 'node:https';
function download(url){return new Promise((resolve,reject)=>{https.get(url,r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();download(r.headers.location).then(resolve,reject);return}if(r.statusCode!==200){r.resume();reject(Error(`${r.statusCode}: ${url}`));return}let data='';r.setEncoding('utf8');r.on('data',c=>data+=c);r.on('end',()=>resolve(data));r.on('error',reject)}).on('error',reject).setTimeout(60000,function(){this.destroy(Error('Timeout'))})})}
const sources = [
 'https://easylist.to/easylist/easylist.txt',
 'https://easylist.to/easylist/easyprivacy.txt',
 'https://cdn.jsdelivr.net/npm/@list-kr/filterslists@latest/dist/filterslist-uBlockOrigin.txt'
];
const texts=await Promise.all(sources.map(async url=>{const t=await download(url);if(t.length<1000||/^\s*</.test(t))throw Error(`Invalid list ${url}`);return t}));
const engine=FiltersEngine.parse(texts.join('\n'),{enableCompression:true,loadCosmeticFilters:true});
await mkdir('src/generated',{recursive:true});await mkdir('filters',{recursive:true});
for(let i=0;i<texts.length;i++)await writeFile(`filters/${['easylist','easyprivacy','list-kr'][i]}.txt`,texts[i]);
await writeFile('src/generated/engine.json',JSON.stringify({date:new Date().toISOString(),sources,data:Buffer.from(engine.serialize()).toString('base64')}));
console.log(JSON.stringify({bytes:engine.serialize().length,lines:texts.map(t=>t.split('\n').length)}));
