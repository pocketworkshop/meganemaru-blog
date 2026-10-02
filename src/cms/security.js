import { createRemoteJWKSet, jwtVerify, sanitizeHtml } from './runtime.mjs';
const keysets = new Map();
export class CmsError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function fail(status, message) { throw new CmsError(status, message); }
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function authorize(request, env) {
  const domain = String(env.CMS_ACCESS_TEAM_DOMAIN || '').trim().replace(/\/$/,'');
  const aud = String(env.CMS_ACCESS_AUD || '').trim();
  const email = String(env.CMS_ADMIN_EMAIL || '').trim().toLowerCase();
  const site = String(env.CMS_SITE_ORIGIN || '').trim().replace(/\/$/,'');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !aud || !email || !/^https:\/\/[^/]+$/.test(site)) fail(503,'CMS認証設定が未完了です。導入手順を確認してください。');
  if (new URL(request.url).origin !== site) fail(403,'このURLでは管理画面を利用できません。設定した本番URLを使用してください。');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) fail(401,'Cloudflare Accessの本人認証が必要です。管理画面を開き直してください。');
  let payload;
  try {
    if (!keysets.has(domain)) keysets.set(domain, createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`)));
    ({payload} = await jwtVerify(token,keysets.get(domain), {issuer:domain,audience:aud,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']}));
  } catch { fail(401,'認証が無効または期限切れです。管理画面を開き直してください。'); }
  if (String(payload.email || '').toLowerCase() !== email) fail(403,'管理者本人のみ利用できます。');
  return payload;
}
export function requireMutation(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('X-CMS-Request') !== '1') fail(403,'操作元を確認できませんでした。管理画面から操作してください。');
  const mode=request.headers.get('Sec-Fetch-Site');
  if (mode && mode !== 'same-origin') fail(403,'別サイトから操作できません。');
}
export async function boundedBody(request, max) {
  const size = Number(request.headers.get('Content-Length'));
  if (size > max) fail(413,'ファイルまたは本文が大きすぎます。');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let count=0; const chunks=[];
  while (true) {const {done,value}=await reader.read(); if(done)break; count+=value.byteLength; if(count>max){await reader.cancel();fail(413,'ファイルまたは本文が大きすぎます。');}chunks.push(value);}
  const result=new Uint8Array(count);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
export async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) fail(415,'JSON形式が必要です。');
  try{return JSON.parse(new TextDecoder().decode(await boundedBody(request,900000)));}catch(e){if(e instanceof CmsError)throw e;fail(400,'入力形式を確認してください。');}
}
export function cleanHtml(input) {
  return sanitizeHtml(String(input || ''), {
    allowedTags:['p','br','h1','h2','h3','h4','strong','b','em','i','s','u','ul','ol','li','a','blockquote','hr','pre','code','span','img','figure','figcaption','table','thead','tbody','tr','th','td'],
    allowedAttributes:{'*':['style'],a:['href','title','rel','target'],img:['src','alt','title','width','loading'],ol:['start'],th:['colspan','rowspan'],td:['colspan','rowspan']},
    allowedStyles:{'*':{'text-align':[/^(left|center|right|justify)$/],'font-family':[/^(sans-serif|serif)$/],'font-size':[/^(14|16|18|20|24|28|32)px$/]}},
    allowedSchemes:['http','https','mailto'], allowedSchemesByTag:{img:['https']}, allowProtocolRelative:false,
    transformTags:{a:(tag,attrs)=>({tagName:'a',attribs:{...attrs,rel:'noopener noreferrer',target:'_blank'}}),img:(tag,attrs)=>{
      const src=String(attrs.src||'').replace(/^\/admin\/media\/cms\//,'/media/cms/');
      const safe=/^\/(?!\/)[^\s\\]*$/.test(src)||/^https:\/\//i.test(src);
      return {tagName:'img',attribs:{src:safe?src:'',alt:attrs.alt||'',title:attrs.title||'',width:['320','480','640','800'].includes(attrs.width)?attrs.width:'',loading:'lazy'}};
    }},
    exclusiveFilter:frame => frame.tag==='img'&&!frame.attribs.src,
    enforceHtmlBoundary:true,
  });
}
export function secureResponse(response, admin=false) {
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  if(admin){headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Referrer-Policy','no-referrer');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: blob:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");}
  return new Response(response.body,{status:response.status,headers});
}
