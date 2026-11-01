export const FILTER_URLS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://cdn.jsdelivr.net/npm/@list-kr/filterslists@latest/dist/filterslist-uBlockOrigin.txt'
];
export function hostname(value: string): string {
  try { const u = new URL(value.includes('://') ? value : `https://${value}`); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/\.$/, '') : ''; } catch { return ''; }
}
export function excluded(url: string, domains: string[]): boolean {
  const host = hostname(url);
  return !!host && domains.some(d => host === d || host.endsWith(`.${d}`));
}
export function requestType(type: string, mainFrame: boolean): RequestType {
  const map: Record<string, RequestType> = {Document:mainFrame?'main_frame':'sub_frame',XHR:'xmlhttprequest',Fetch:'xmlhttprequest',Image:'image',Script:'script',Stylesheet:'stylesheet',Media:'media',Font:'font',Ping:'ping',WebSocket:'websocket'};
  return map[type] || 'other';
}
export function validateList(text: string): boolean {
  return text.length > 1000 && !/^\s*</.test(text) && (text.includes('||') || text.includes('##'));
}
import type {RequestType} from '@ghostery/adblocker';
