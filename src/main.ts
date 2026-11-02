import {Plugin, PluginSettingTab, Setting, Notice, requestUrl} from 'obsidian';
import {FiltersEngine, Request} from '@ghostery/adblocker';
import {parse} from 'tldts-experimental';
import snapshot from './generated/engine.json';
import {FILTER_URLS, excluded, hostname, requestType, validateList} from './core';
import {isYouTubePlayerResponse,stripYouTubeAds,youtubeGuardSource,STOP_YOUTUBE_GUARD} from './youtube';

interface Options {enabled:boolean; cosmetic:boolean; excluded:string[]; updated:string}
const defaults:Options={enabled:true,cosmetic:true,excluded:[],updated:''};
const BINDING='__webviewerAdblockTokens';
const WATCHER=`(()=>{window.__wvabObserver?.disconnect();clearTimeout(window.__wvabTimer);window.__wvabTimer=0;let previous='';const scan=()=>{const classes=new Set(),ids=new Set();for(const el of Array.from(document.querySelectorAll('[class],[id]')).slice(0,10000)){if(el.id&&ids.size<2000)ids.add(el.id);for(const c of el.classList)if(classes.size<2000)classes.add(c)}const value=JSON.stringify({classes:[...classes],ids:[...ids]});if(value!==previous){previous=value;window.${BINDING}?.(value)}};window.__wvabObserver=new MutationObserver(()=>{if(!window.__wvabTimer)window.__wvabTimer=setTimeout(()=>{window.__wvabTimer=0;scan()},1000)});window.__wvabObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','id']});scan()})()`;
const STOP_WATCHER=`window.__wvabObserver?.disconnect();clearTimeout(window.__wvabTimer);window.__wvabTimer=0`;

type Context={wc:any; view:any; webview:any; active:boolean; blocked:number; cssKey?:string; cssText:string; cssRevision:number; message:(...args:any[])=>void; detach:(...args:any[])=>void; ready:()=>void; navigate:()=>void; action?:HTMLElement; attaching:boolean;mainFrame?:string;frames:Map<string,any>;retryAfter:number;disposed:boolean;connection?:Promise<void>;youtubeScriptId?:string;youtubeConfig?:string;youtubeRevision:number;inPage:()=>void};

export default class WebviewerAdblock extends Plugin {
  options:Options={...defaults};
  engine!:FiltersEngine;
  contexts=new Map<number,Context>();
  status!:HTMLElement;
  total=0;
  lastError='';
  private stopped=false;
  private updating=false;
  private cachePath='';
  private watched=new WeakSet<Element>();
  private navigationPatches=new Map<any,()=>void>();
  private factoryPatch?:{registry:any;original:any;wrapped:any};

  async onload(){
    const saved=await this.loadData();
    this.options={...defaults,...saved,excluded:Array.isArray(saved?.excluded)?saved.excluded.map(hostname).filter(Boolean):[]};
    this.cachePath=`${this.manifest.dir}/filters.bin`;
    this.engine=FiltersEngine.deserialize(Buffer.from(snapshot.data,'base64'));
    try{if(await this.app.vault.adapter.exists(this.cachePath))this.engine=FiltersEngine.deserialize(new Uint8Array(await this.app.vault.adapter.readBinary(this.cachePath)));}catch(e){console.warn('Webviewer Adblock: 캐시 대신 기본 필터 사용',e);}
    this.status=this.addStatusBarItem();this.status.addClass('wvab-status');
    this.status.onclick=()=>this.openSettings();
    this.addRibbonIcon('shield-check','웹뷰어 광고 차단 설정',()=>this.openSettings());
    this.addSettingTab(new AdblockSettings(this.app,this));
    this.addCommand({id:'toggle-current-site',name:'현재 웹뷰어 사이트의 추가 광고 차단 전환',checkCallback:(checking)=>{const view=this.app.workspace.activeLeaf?.view as any;if(view?.getViewType()!=='webviewer')return false;if(!checking)void this.toggleSite(view);return true;}});
    this.registerEvent(this.app.workspace.on('layout-change',()=>this.scan()));
    const watchDocument=(doc:Document)=>{
      const observer=new MutationObserver(records=>{
        const containsWebview=records.some(r=>Array.from(r.addedNodes).some(node=>{
          const element=node as Element;
          return node.nodeType===1&&(element.tagName==='WEBVIEW'||!!element.querySelector('webview'));
        }));
        if(containsWebview)this.scan();
      });
      observer.observe(doc.body,{childList:true,subtree:true});this.register(()=>observer.disconnect());
    };
    watchDocument(document);this.registerEvent(this.app.workspace.on('window-open',(_win,win)=>watchDocument(win.document)));
    this.registerInterval(window.setInterval(()=>this.scan(),1500));
    this.app.workspace.onLayoutReady(()=>this.scan());this.refreshStatus();
  }
  openSettings(){const setting=(this.app as any).setting;setting.open();setting.openTabById(this.manifest.id);}
  enabledFor(url:string){return this.options.enabled&&!excluded(url,this.options.excluded);}
  refreshStatus(){this.status?.setText(`웹 광고 차단 ${this.options.enabled?'켜짐':'꺼짐'} · ${this.total}`);this.status?.setAttribute('aria-label',this.lastError||'추가 차단한 요청 수 · 클릭하여 설정 열기');}
  report(error:unknown){this.lastError=error instanceof Error?error.message:String(error);console.warn('Webviewer Adblock',error);this.refreshStatus();}
  scan(){
    if(this.stopped)return;
    this.patchFactory();
    const alive=new Set<number>();
    const views=new Set<any>();
    for(const leaf of this.app.workspace.getLeavesOfType('webviewer')){
      const view=leaf.view as any;views.add(view);this.patchNavigation(view);const webview=view.webview||view.containerEl.querySelector('webview');if(!webview)continue;
      if(!this.watched.has(webview)){this.watched.add(webview);const scan=()=>this.scan();webview.addEventListener('did-attach',scan);webview.addEventListener('dom-ready',scan);this.register(()=>{webview.removeEventListener('did-attach',scan);webview.removeEventListener('dom-ready',scan);});}
      try{const id=webview.getWebContentsId();alive.add(id);if(!this.contexts.has(id)){
        const remote=require('@electron/remote');const wc=remote.webContents.fromId(id);if(!wc)continue;
        const ctx:Context={wc,view,webview,active:false,attaching:false,blocked:0,cssText:'',cssRevision:0,message:()=>{},detach:()=>{},ready:()=>{},navigate:()=>{},frames:new Map(),retryAfter:0,disposed:false,youtubeRevision:0,inPage:()=>{}};
        ctx.ready=()=>{void this.startCosmetics(ctx)};
        ctx.navigate=()=>{ctx.cssKey=undefined;ctx.cssText='';ctx.cssRevision++;ctx.blocked=0;this.updateAction(ctx);};
        ctx.inPage=()=>{ctx.cssRevision++;this.updateAction(ctx);void this.startCosmetics(ctx);};
        webview.addEventListener('dom-ready',ctx.ready);webview.addEventListener('did-navigate',ctx.navigate);
        webview.addEventListener('did-navigate-in-page',ctx.inPage);
        ctx.action=view.addAction('shield-check','이 사이트의 추가 광고 차단 전환',()=>{void this.toggleSite(view)});
        this.contexts.set(id,ctx);
      }const ctx=this.contexts.get(id)!;this.updateAction(ctx);if(this.options.enabled&&!ctx.active&&!ctx.attaching&&Date.now()>ctx.retryAfter)ctx.connection=this.attach(ctx);
      }catch{/* Webview may not be mounted yet. */}
    }
    for(const [id,ctx]of this.contexts)if(!alive.has(id)){this.contexts.delete(id);void this.dispose(ctx);}
    for(const [view,restore]of this.navigationPatches)if(!views.has(view)){restore();this.navigationPatches.delete(view);}
  }
  private patchFactory(){
    const registry=(this.app as any).viewRegistry?.viewByType;
    if(!registry?.webviewer||this.factoryPatch?.wrapped===registry.webviewer)return;
    const original=registry.webviewer;const plugin=this;
    const wrapped=function(this:any,...args:any[]){const view=original.apply(this,args);if(!plugin.stopped)plugin.patchNavigation(view);return view;};
    registry.webviewer=wrapped;this.factoryPatch={registry,original,wrapped};
  }
  private patchNavigation(view:any){
    if(this.navigationPatches.has(view)||typeof view.navigate!=='function')return;
    const original=view.navigate;const hadOwn=Object.hasOwn(view,'navigate');const plugin=this;
    const wrapped=function(this:any,...args:any[]){
      if(plugin.stopped||!plugin.options.enabled||!this.webviewMounted||!/^https?:/.test(args[0]||''))return original.apply(this,args);
      return (async()=>{plugin.scan();let ctx:Context|undefined;try{ctx=plugin.contexts.get(this.webview.getWebContentsId())}catch{}if(ctx?.connection)await ctx.connection;return original.apply(this,args)})().catch(e=>{plugin.report(e);return original.apply(this,args)});
    };
    view.navigate=wrapped;
    this.navigationPatches.set(view,()=>{if(view.navigate===wrapped){if(hadOwn)view.navigate=original;else delete view.navigate;}});
  }
  updateAction(ctx:Context){try{const on=this.enabledFor(ctx.wc.getURL());ctx.action?.toggleClass('wvab-excluded',!on);ctx.action?.setAttribute('aria-label',on?'광고 차단 중 · 클릭하면 이 사이트의 추가 차단 해제':'추가 차단 꺼짐 · 클릭하면 이 사이트 광고 차단 켜기');}catch{}}
  async attach(ctx:Context){
    ctx.attaching=true;
    try{
      if(ctx.wc.debugger.isAttached()){throw Error('이 웹뷰어는 다른 디버거가 사용 중입니다. 개발자 도구를 닫은 뒤 다시 확인하세요.');}
      ctx.wc.debugger.attach('1.3');ctx.active=true;
      ctx.message=(_event:any,method:string,params:any)=>{
        if(method==='Fetch.requestPaused')void this.handleRequest(ctx,params);
        if(method==='Page.frameNavigated'){ctx.frames.set(params.frame.id,params.frame);if(!params.frame.parentId)ctx.mainFrame=params.frame.id;}
        if(method==='Page.frameDetached')ctx.frames.delete(params.frameId);
        if(method==='Page.navigatedWithinDocument'){const frame=ctx.frames.get(params.frameId);if(frame)frame.url=params.url;}
        if(method==='Runtime.bindingCalled'&&params.name===BINDING&&this.options.cosmetic&&this.enabledFor(ctx.wc.getURL())){
          try{const tokens=JSON.parse(params.payload);if(Array.isArray(tokens.classes)&&Array.isArray(tokens.ids))void this.cosmetics(ctx,tokens.classes.slice(0,2000),tokens.ids.slice(0,2000));}catch{}
        }
      };
      ctx.detach=()=>{ctx.active=false;ctx.wc.debugger.removeListener('message',ctx.message);ctx.wc.debugger.removeListener('detach',ctx.detach);};
      ctx.wc.debugger.on('message',ctx.message);ctx.wc.debugger.on('detach',ctx.detach);
      await ctx.wc.debugger.sendCommand('Page.enable');
      const tree=await ctx.wc.debugger.sendCommand('Page.getFrameTree');
      const collect=(node:any)=>{ctx.frames.set(node.frame.id,node.frame);for(const child of node.childFrames||[])collect(child);};collect(tree.frameTree);ctx.mainFrame=tree.frameTree.frame.id;
      await ctx.wc.debugger.sendCommand('Runtime.enable');
      await ctx.wc.debugger.sendCommand('Runtime.addBinding',{name:BINDING});
      await this.configureYouTube(ctx);
      const responsePatterns=['player','next'].flatMap(endpoint=>['youtube.com','*.youtube.com'].map(host=>({urlPattern:`https://${host}/youtubei/v1/${endpoint}*`,requestStage:'Response'})));
      await ctx.wc.debugger.sendCommand('Fetch.enable',{patterns:[{urlPattern:'http*://*/*',requestStage:'Request'},...responsePatterns]});
      if(this.stopped||ctx.disposed||!this.options.enabled||this.contexts.get(ctx.wc.id)!==ctx){await this.dispose(ctx);return;}
      this.lastError='';this.refreshStatus();
      await this.startCosmetics(ctx);
    }catch(e){ctx.retryAfter=Date.now()+30000;this.report(e);if(ctx.active){await this.releaseDebugger(ctx);}}finally{ctx.attaching=false;}
  }
  async handleRequest(ctx:Context,p:any){
    if(p.responseStatusCode!==undefined||p.responseErrorReason!==undefined){await this.handleYouTubeResponse(ctx,p);return;}
    const d=ctx.wc.debugger;let command='Fetch.continueRequest';let params:any={requestId:p.requestId};
    try{
      const source=ctx.frames.get(p.frameId)?.url||ctx.wc.getURL();
      // Never block top-level documents. Preserve navigations and login redirects.
      const mainDocument=p.resourceType==='Document'&&p.frameId===ctx.mainFrame;
      if(this.enabledFor(ctx.wc.getURL())&&!mainDocument&&/^https?:/.test(p.request.url)){
        const result=this.engine.match(Request.fromRawDetails({url:p.request.url,sourceUrl:source,type:requestType(p.resourceType,false)}));
        if(result.match){command='Fetch.failRequest';params.errorReason='BlockedByClient';ctx.blocked++;this.total++;this.refreshStatus();}
      }
    }catch(e){this.report(e);}
    try{await d.sendCommand(command,params);}catch{/* Navigation or detach may cancel a paused request. */}
  }
  async handleYouTubeResponse(ctx:Context,p:any){
    const d=ctx.wc.debugger;
    try{
      if(this.enabledFor(ctx.wc.getURL())&&isYouTubePlayerResponse(p.request.url)&&p.responseStatusCode===200){
        const body=await d.sendCommand('Fetch.getResponseBody',{requestId:p.requestId});
        const raw=body.base64Encoded?Buffer.from(body.body,'base64').toString('utf8'):body.body;
        if(raw.length<=8*1024*1024){
          const prefix=raw.match(/^\)\]\}'\s*/)?.[0]||'';
          const value=JSON.parse(raw.slice(prefix.length));const before=JSON.stringify(value);stripYouTubeAds(value);const after=JSON.stringify(value);
          if(before!==after){
            const responseHeaders=(p.responseHeaders||[]).filter((h:any)=>!['content-length','content-encoding','transfer-encoding'].includes(h.name.toLowerCase()));
            await d.sendCommand('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:p.responseStatusCode,responseHeaders,body:Buffer.from(prefix+after).toString('base64')});
            this.total++;ctx.blocked++;this.refreshStatus();return;
          }
        }
      }
    }catch(e){if(ctx.active)this.report(e);}
    try{await d.sendCommand('Fetch.continueRequest',{requestId:p.requestId});}catch{}
  }
  private async configureYouTube(ctx:Context){
    const source=youtubeGuardSource(this.options.cosmetic,this.options.excluded);
    if(ctx.youtubeConfig===source&&ctx.youtubeScriptId)return;
    const revision=++ctx.youtubeRevision;
    if(ctx.youtubeScriptId){const old=ctx.youtubeScriptId;ctx.youtubeScriptId=undefined;await ctx.wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:old});}
    const result=await ctx.wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source});
    if(ctx.disposed||!ctx.active||revision!==ctx.youtubeRevision){await ctx.wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:result.identifier});return;}
    ctx.youtubeScriptId=result.identifier;ctx.youtubeConfig=source;
  }
  async startCosmetics(ctx:Context){
    if(!ctx.active)return;
    try{await this.configureYouTube(ctx);await ctx.wc.executeJavaScript(youtubeGuardSource(this.options.cosmetic,this.options.excluded));if(this.options.cosmetic&&this.enabledFor(ctx.wc.getURL())){await ctx.wc.executeJavaScript(WATCHER);}else{await ctx.wc.executeJavaScript(STOP_WATCHER);await this.clearCSS(ctx);}}catch{/* A navigation may destroy this document. */}
  }
  async cosmetics(ctx:Context,classes:string[],ids:string[]){
    try{
      const url=ctx.wc.getURL();if(!this.options.cosmetic||!this.enabledFor(url))return;
      const host=hostname(url);if(!host)return;
      const result=this.engine.getCosmeticsFilters({url,hostname:host,domain:parse(host).domain,classes:classes.filter(c=>typeof c==='string'),ids:ids.filter(i=>typeof i==='string'),getBaseRules:true,getInjectionRules:false,getExtendedRules:false});
      const css=result.styles;if(!css||css===ctx.cssText)return;
      const revision=++ctx.cssRevision;
      const key=await ctx.wc.insertCSS(css);
      if(revision!==ctx.cssRevision||ctx.wc.getURL()!==url||!this.options.cosmetic||!this.enabledFor(url)){await ctx.wc.removeInsertedCSS(key);return;}
      const oldKey=ctx.cssKey;ctx.cssKey=key;ctx.cssText=css;if(oldKey)await ctx.wc.removeInsertedCSS(oldKey);
    }catch{/* Page closed or cosmetic syntax unsupported by Chromium. */}
  }
  async clearCSS(ctx:Context){ctx.cssRevision++;const key=ctx.cssKey;ctx.cssKey=undefined;ctx.cssText='';if(key)try{await ctx.wc.removeInsertedCSS(key)}catch{}}
  async dispose(ctx:Context){
    ctx.disposed=true;
    ctx.action?.remove();ctx.action=undefined;
    ctx.webview.removeEventListener('dom-ready',ctx.ready);ctx.webview.removeEventListener('did-navigate',ctx.navigate);
    ctx.webview.removeEventListener('did-navigate-in-page',ctx.inPage);
    await this.releaseDebugger(ctx);
    try{await ctx.wc.executeJavaScript(STOP_WATCHER+';'+STOP_YOUTUBE_GUARD)}catch{}
    await this.clearCSS(ctx);
  }
  async releaseDebugger(ctx:Context){if(ctx.active){ctx.active=false;ctx.youtubeRevision++;try{await ctx.wc.debugger.sendCommand('Fetch.disable');if(ctx.youtubeScriptId)await ctx.wc.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:ctx.youtubeScriptId});ctx.youtubeScriptId=undefined;ctx.youtubeConfig=undefined;await ctx.wc.debugger.sendCommand('Runtime.removeBinding',{name:BINDING});ctx.wc.debugger.detach();}catch{}try{ctx.wc.debugger.removeListener('message',ctx.message);ctx.wc.debugger.removeListener('detach',ctx.detach);}catch{}}}
  async apply(){
    await this.saveData(this.options);
    if(!this.options.enabled){const contexts=[...this.contexts.values()];this.contexts.clear();await Promise.all(contexts.map(c=>this.dispose(c)));}
    this.scan();for(const ctx of this.contexts.values())await this.startCosmetics(ctx);this.refreshStatus();
  }
  async toggleSite(view:any){
    const url=view.webview?.getURL();const host=hostname(url||'');if(!host){new Notice('먼저 웹사이트를 열어 주세요.');return;}
    if(excluded(url,this.options.excluded))this.options.excluded=this.options.excluded.filter(d=>host!==d&&!host.endsWith(`.${d}`));else this.options.excluded.push(host);
    await this.apply();new Notice(`${host}: 추가 광고 차단 ${excluded(url,this.options.excluded)?'해제':'사용'}. 필요하면 페이지를 새로고침하세요.`);
  }
  async updateFilters(){
    if(this.updating)return;this.updating=true;
    try{
      const texts=await Promise.all(FILTER_URLS.map(async url=>{const response=await requestUrl({url});if(response.status!==200||!validateList(response.text))throw Error('필터 다운로드에 실패했습니다. 기존 필터를 유지합니다.');return response.text;}));
      const next=FiltersEngine.parse(texts.join('\n'),{enableCompression:true,loadCosmeticFilters:true});
      if(this.stopped)return;
      const bytes=next.serialize();const tmp=this.cachePath+'.tmp';await this.app.vault.adapter.writeBinary(tmp,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
      const adapter=this.app.vault.adapter as any;
      await require('fs').promises.rename(adapter.getFullPath(tmp),adapter.getFullPath(this.cachePath));
      this.engine=next;this.lastError='';this.options.updated=new Date().toISOString();await this.apply();new Notice('광고 필터를 업데이트했습니다. 열린 페이지를 새로고침하세요.');
    }catch(e){this.report(e);new Notice('필터 업데이트 실패: 기존 필터로 계속 차단합니다.');}finally{this.updating=false;}
  }
  onunload(){this.stopped=true;for(const ctx of this.contexts.values())void this.dispose(ctx);this.contexts.clear();for(const restore of this.navigationPatches.values())restore();this.navigationPatches.clear();const f=this.factoryPatch;if(f&&f.registry.webviewer===f.wrapped)f.registry.webviewer=f.original;}
}

class AdblockSettings extends PluginSettingTab {
  constructor(app:any,private plugin:WebviewerAdblock){super(app,plugin)}
  display(){
    const {containerEl}=this;const p=this.plugin;containerEl.empty();containerEl.createEl('h2',{text:'웹뷰어 광고 차단'});
    containerEl.createEl('p',{text:'Obsidian 기본 웹뷰어의 광고·추적 요청을 추가 차단합니다. YouTube는 다른 영상으로 이동해도 자동 처리합니다. 기본 광고 차단 설정은 그대로 유지됩니다.'});
    new Setting(containerEl).setName('추가 광고 차단').setDesc('기본 웹뷰어 탭에 적용합니다. 변경 후 열린 페이지를 새로고침하세요.').addToggle(t=>t.setValue(p.options.enabled).onChange(async v=>{p.options.enabled=v;await p.apply();}));
    new Setting(containerEl).setName('광고 영역 숨기기').setDesc('필터에 일치하는 배너와 광고 상자를 숨깁니다.').addToggle(t=>t.setValue(p.options.cosmetic).onChange(async v=>{p.options.cosmetic=v;await p.apply();}));
    new Setting(containerEl).setName('추가 차단 제외 사이트').setDesc('한 줄에 도메인 하나. 하위 도메인에도 적용됩니다. 기본 광고 차단은 유지됩니다.').addTextArea(t=>{t.setPlaceholder('example.com').setValue(p.options.excluded.join('\n'));t.inputEl.rows=5;t.onChange(async v=>{p.options.excluded=[...new Set(v.split(/\s+/).map(hostname).filter(Boolean))];await p.apply();});});
    new Setting(containerEl).setName('광고 필터 업데이트').setDesc(`EasyList · EasyPrivacy · List-KR / 적용일: ${new Date(p.options.updated||snapshot.date).toLocaleDateString()}`).addButton(b=>b.setButtonText('지금 업데이트').onClick(async()=>{b.setDisabled(true);b.setButtonText('업데이트 중…');await p.updateFilters();this.display();}));
    containerEl.createEl('p',{text:`이번 실행의 추가 차단·광고 응답 정리: ${p.total}개. 광고 차단은 자동입니다. 방패 버튼은 사이트별 차단 해제/활성화용이며 영상마다 누를 필요가 없습니다.`});
    containerEl.createEl('p',{text:'업데이트 후 이미 열려 있던 YouTube 탭은 한 번 새로고침하세요. 제외 목록에 YouTube가 있으면 삭제해야 자동 차단이 적용됩니다. 사이트의 광고 전달 방식 변경이나 개발자 도구 사용으로 차단이 제한될 수 있습니다.',cls:'setting-item-description'});
    if(p.lastError)containerEl.createEl('p',{text:`연결 안내: ${p.lastError}`,cls:'wvab-warning'});
  }
}
