import { sanitizeHtml } from './runtime.mjs';
export class CmsError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function fail(status, message) { throw new CmsError(status, message); }
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SESSION_COOKIE = 'meganemaru_cms_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return bytesToHex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));}
function constantEqual(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function passwordSecret(env){const secret=String(env.CMS_ADMIN_PASSWORD||'');if(secret.length<12)fail(503,'CMS管理者パスワードが未設定です。CloudflareのSecret「CMS_ADMIN_PASSWORD」に12文字以上で設定してください。');return secret;}
function cookieValue(request,name){for(const part of (request.headers.get('Cookie')||'').split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return rest.join('=');}return '';}
export async function authorize(request,env){const secret=passwordSecret(env),token=cookieValue(request,SESSION_COOKIE),[expText,sig]=token.split('.'),exp=Number(expText);if(!Number.isInteger(exp)||exp*1000<Date.now()||!sig)fail(401,'管理者ログインが必要です。');const expected=await hmac(secret,`cms-session:${expText}`);if(!constantEqual(sig,expected))fail(401,'管理者ログインが必要です。');return {email:'管理者'};}
function clientRateKey(request){
  const ip=(request.headers.get('CF-Connecting-IP')||'unknown').trim().slice(0,80);
  return `cms-login-rate:${ip}`;
}
export async function checkLoginRateLimit(request,env){
  if(!env.CMS_IMAGES)return;
  const key=clientRateKey(request),now=Math.floor(Date.now()/1000);
  let state;
  try{state=JSON.parse(await env.CMS_IMAGES.get(key)||'null');}catch{return;}
  if(state?.blockedUntil>now){
    const wait=Math.max(1,Math.ceil((state.blockedUntil-now)/60));
    fail(429,`ログイン試行が多すぎます。約${wait}分後にもう一度お試しください。`);
  }
}
export async function recordLoginFailure(request,env){
  if(!env.CMS_IMAGES)return;
  const key=clientRateKey(request),now=Math.floor(Date.now()/1000);
  let state;
  try{state=JSON.parse(await env.CMS_IMAGES.get(key)||'null');}catch{state=null;}
  if(!state||now-(state.firstAt||0)>900)state={count:0,firstAt:now,blockedUntil:0};
  state.count=(state.count||0)+1;
  if(state.count>=5){
    state.blockedUntil=now+900;
    const event={
      at:new Date().toISOString(),
      ip:(request.headers.get('CF-Connecting-IP')||'不明').slice(0,80),
      country:(request.headers.get('CF-IPCountry')||'不明').slice(0,8),
      failures:state.count,
      blockedMinutes:15,
      acknowledged:false
    };
    try{await env.CMS_IMAGES.put('cms-security-latest-alert',JSON.stringify(event));}catch{}
  }
  try{await env.CMS_IMAGES.put(key,JSON.stringify(state),{expirationTtl:1800});}catch{}
}
export async function getSecurityAlert(env){
  if(!env.CMS_IMAGES)return null;
  try{return JSON.parse(await env.CMS_IMAGES.get('cms-security-latest-alert')||'null');}catch{return null;}
}
export async function acknowledgeSecurityAlert(env){
  if(!env.CMS_IMAGES)return;
  let event=await getSecurityAlert(env);
  if(!event)return;
  event.acknowledged=true;
  event.acknowledgedAt=new Date().toISOString();
  await env.CMS_IMAGES.put('cms-security-latest-alert',JSON.stringify(event));
}
export async function clearLoginFailures(request,env){
  if(!env.CMS_IMAGES)return;
  try{await env.CMS_IMAGES.delete(clientRateKey(request));}catch{}
}
export async function verifyAdminPassword(env,password){const secret=passwordSecret(env);const a=bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)));const b=bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(password||''))));return constantEqual(a,b);}
export async function makeSessionCookie(env){const secret=passwordSecret(env),exp=Math.floor(Date.now()/1000)+SESSION_SECONDS,sig=await hmac(secret,`cms-session:${exp}`);return `${SESSION_COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;}
export function clearSessionCookie(){return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
export function loginPage(message=''){
const warning=message?`<div class="legal-warning"><strong>警告：認証に失敗しました</strong><p>${escapeHtml(message)}</p><p>この管理画面は管理者専用です。権限のない者による不正アクセス行為は「不正アクセス行為の禁止等に関する法律」により禁止されています。</p><p>ログイン試行に関する情報は、セキュリティ対策のため記録される場合があります。</p></div>`:'';
const note=warning;return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>管理者ログイン | めがねまるのブログ</title><style>*{box-sizing:border-box}body{margin:0;background:#fff7fb;color:#2d2430;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif}.wrap{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,420px);background:#fff;border:1px solid #eadde5;border-radius:22px;padding:28px;box-shadow:0 12px 36px #5b304012}.logo{width:58px;height:58px;display:block;margin:0 auto 14px}h1{text-align:center;margin:0 0 8px;font-size:1.55rem}.sub{text-align:center;color:#786b74;margin:0 0 24px}label{display:block;font-weight:700;margin-bottom:8px}input{width:100%;font-size:16px;padding:14px;border:1px solid #cdbfc8;border-radius:12px}button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#ff6f91;color:#fff;font-size:16px;font-weight:800}.error{background:#fff0f2;color:#9c263d;padding:10px 12px;border-radius:10px}.legal-warning{background:#fff4f4;border:2px solid #b42318;color:#6b1616;padding:14px;border-radius:12px;margin-bottom:18px}.legal-warning strong{display:block;font-size:1.05rem;margin-bottom:8px}.legal-warning p{margin:7px 0;line-height:1.6}.back{text-align:center;margin-top:18px}.back a{color:#6e5965}</style></head><body><main class="wrap"><section class="card"><img class="logo" src="/assets/bear-logo.png" alt=""><h1>管理者ログイン</h1><p class="sub">めがねまるのブログ CMS</p>${note}<form method="post" action="/admin/login"><label for="password">管理者パスワード</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">ログイン</button></form><p class="back"><a href="/">ブログへ戻る</a></p></section></main></body></html>`;}
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
    allowedAttributes:{'*':['style'],span:['class'],a:['href','title','rel','target'],img:['src','alt','title','width','loading'],ol:['start'],th:['colspan','rowspan'],td:['colspan','rowspan']},
    allowedClasses:{span:['stock-rise','stock-fall','stock-flat']},
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
