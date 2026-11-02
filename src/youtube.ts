/** Mutate only player-response ad fields. Keep media, captions and playlists intact. */
export function stripYouTubeAds<T>(value:T):T {
  const visit=(player:any)=>{
    if(!player||typeof player!=='object'||Array.isArray(player))return;
    for(const key of ['playerAds','adPlacements','adSlots','adBreakHeartbeatParams']){
      if(Object.hasOwn(player,key))delete player[key];
    }
  };
  visit(value);
  if(value&&typeof value==='object'){
    visit((value as any).playerResponse);
    for(const response of (Array.isArray((value as any).playerResponses)?(value as any).playerResponses:[]))visit(response);
  }
  return value;
}

export function isYouTube(url:string):boolean {
  try {const u=new URL(url);return /^https?:$/.test(u.protocol)&&(u.hostname==='youtube.com'||u.hostname.endsWith('.youtube.com'));}catch{return false;}
}
export function isYouTubePlayerResponse(url:string):boolean {
  if(!isYouTube(url))return false;
  const path=new URL(url).pathname;
  return /^\/youtubei\/v1\/(player|next)$/.test(path);
}

/** Runs in the page's main world before YouTube's scripts, and survives SPA changes. */
function installYouTubeGuard(prune:typeof stripYouTubeAds,hideBanners:boolean,excluded:string[]){
  if(location.hostname!=='youtube.com'&&!location.hostname.endsWith('.youtube.com'))return;
  const root=window as any;
  if(excluded.some(host=>location.hostname===host||location.hostname.endsWith('.'+host))){root.__wvabYouTube?.stop();return;}
  const existing=root.__wvabYouTube;
  if(existing){existing.setBanners(hideBanners);existing.refresh();return;}
  let stopped=false;
  const originalParse=JSON.parse;
  const wrappedParse=function(this:any,...args:Parameters<typeof JSON.parse>){return prune(originalParse.apply(this,args));};
  JSON.parse=wrappedParse;
  let initial=root.ytInitialPlayerResponse;
  const initialDescriptor=Object.getOwnPropertyDescriptor(root,'ytInitialPlayerResponse');
  const getInitial=()=>initial;
  const setInitial=(value:any)=>{initial=prune(value);};
  let hookedInitial=false;
  if(!initialDescriptor||initialDescriptor.configurable){
    Object.defineProperty(root,'ytInitialPlayerResponse',{configurable:true,enumerable:true,get:getInitial,set:setInitial});hookedInitial=true;
  }
  prune(initial);
  // Response.json uses the browser's native parser rather than window.JSON.parse.
  const originalJson=Response.prototype.json;
  const wrappedJson=function(this:Response){return originalJson.call(this).then(value=>{
    try{const u=new URL(this.url);if((u.hostname==='youtube.com'||u.hostname.endsWith('.youtube.com'))&&/^\/youtubei\/v1\/(player|next)$/.test(u.pathname))return prune(value);}catch{}
    return value;
  });};
  Response.prototype.json=wrappedJson;
  let style:HTMLStyleElement|undefined;
  const setBanners=(enabled:boolean)=>{
    if(!enabled){style?.remove();style=undefined;return;}
    if(style?.isConnected)return;
    if(!document.documentElement)return;
    style=document.createElement('style');style.dataset.webviewerAdblock='youtube';
    style.textContent='ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-in-feed-ad-layout-renderer,ytd-promoted-sparkles-web-renderer,ytd-promoted-video-renderer,ytd-action-companion-ad-renderer,ytd-player-legacy-desktop-watch-ads-renderer,#player-ads,#masthead-ad,.ytp-ad-overlay-container{display:none!important}';
    document.documentElement.append(style);
  };
  // Fallback for an ad already queued before the plugin was enabled.
  // Never seek content unless YouTube explicitly marks this player as an active ad.
  let adVideo:HTMLVideoElement|undefined;
  let adMarker='';
  const checkAd=()=>{
    if(stopped)return;
    const player=document.querySelector('#movie_player');
    const ad=!!player?.matches('.ad-showing,.ad-interrupting');
    const video=player?.querySelector('video');
    if(!ad){adVideo=undefined;adMarker='';return;}
    const skip=player?.querySelector<HTMLElement>('.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-ad-skip-button-container button');
    if(skip&&skip.getClientRects().length){skip.click();return;}
    if(!video)return;
    const contentDuration=Number((player as any)?.getPlayerResponse?.()?.videoDetails?.lengthSeconds||root.ytInitialPlayerResponse?.videoDetails?.lengthSeconds);
    if(contentDuration>0&&Math.abs(video.duration-contentDuration)<2)return;
    if(adVideo!==video){adVideo=video;adMarker='';}
    if(Number.isFinite(video.duration)&&video.duration>0&&video.currentTime<video.duration-.05){
      // A single HTMLVideoElement is reused for successive ads and content.
      const marker=`${video.currentSrc}|${video.duration}`;
      if(adMarker!==marker){adMarker=marker;try{video.currentTime=video.duration;}catch{}}
    }
  };
  let scheduled=false;
  const refresh=()=>{
    if(stopped)return;prune(root.ytInitialPlayerResponse);setBanners(hideBanners);checkAd();
  };
  const schedule=()=>{if(stopped||scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refresh();});};
  const observer=new MutationObserver(schedule);
  if(document.documentElement)observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  // The document element might not exist yet at document-start.
  const ready=()=>{if(stopped)return;if(document.documentElement)observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});refresh();};
  document.addEventListener('DOMContentLoaded',ready);
  document.addEventListener('yt-navigate-finish',schedule);
  document.addEventListener('yt-page-data-updated',schedule);
  document.addEventListener('loadedmetadata',schedule,true);
  document.addEventListener('durationchange',schedule,true);
  document.addEventListener('play',schedule,true);
  const interval=setInterval(checkAd,500);
  root.__wvabYouTube={
    refresh,
    setBanners:(enabled:boolean)=>{hideBanners=enabled;setBanners(enabled);},
    stop:()=>{
      stopped=true;observer.disconnect();clearInterval(interval);style?.remove();
      document.removeEventListener('DOMContentLoaded',ready);document.removeEventListener('yt-navigate-finish',schedule);document.removeEventListener('yt-page-data-updated',schedule);
      document.removeEventListener('loadedmetadata',schedule,true);document.removeEventListener('durationchange',schedule,true);document.removeEventListener('play',schedule,true);
      if(JSON.parse===wrappedParse)JSON.parse=originalParse;
      if(Response.prototype.json===wrappedJson)Response.prototype.json=originalJson;
      if(hookedInitial&&Object.getOwnPropertyDescriptor(root,'ytInitialPlayerResponse')?.get===getInitial){Object.defineProperty(root,'ytInitialPlayerResponse',{configurable:true,enumerable:true,writable:true,value:initial});}
      delete root.__wvabYouTube;
    }
  };
  refresh();
}

export function youtubeGuardSource(hideBanners:boolean,excluded:string[]=[]):string {
  return `(${installYouTubeGuard.toString()})(${stripYouTubeAds.toString()},${JSON.stringify(hideBanners)},${JSON.stringify(excluded)});`;
}
export const STOP_YOUTUBE_GUARD='window.__wvabYouTube?.stop()';
