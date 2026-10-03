import {authorize,checkLoginRateLimit,recordLoginFailure,clearLoginFailures,getSecurityAlert,acknowledgeSecurityAlert,verifyAdminPassword,makeSessionCookie,clearSessionCookie,loginPage,requireMutation,readJson,boundedBody,cleanHtml,escapeHtml as esc,fail,CmsError,secureResponse} from './security.js';
const categories=['SKE48','競馬','ゲーム','便利ツール','雑記'];
const now=()=>new Date().toISOString();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const asPost=row=>({ ...JSON.parse(row.extra_json||'{}'), id:row.id,slug:row.slug,title:row.title,category:row.category,date:row.date,summary:row.summary,theme:row.theme,bodyHtml:row.body_html,status:row.status,version:row.version,updatedAt:row.updated_at});
export async function legacyPosts(request,env) {
 const url=new URL('/data/posts.json',request.url);
 const response=await env.ASSETS.fetch(new Request(url));
 if(!response.ok)fail(503,'既存posts.jsonを取得できません。');
 const posts=await response.json();if(!Array.isArray(posts))fail(503,'既存記事形式を確認してください。');return posts;
}
export async function publicPosts(request,env) {
 const legacy=await legacyPosts(request,env);
 let rows, keys;
 try{rows=await env.DB.prepare("SELECT * FROM cms_posts WHERE status='published' ORDER BY date DESC,updated_at DESC").all();keys=await env.DB.prepare('SELECT key FROM cms_keys').all();}
 catch(e){if(!env.DB || /no such table: (?:main\.)?cms_/.test(String(e)))return legacy.map(p=>({...p,bodyHtml:cleanHtml(p.bodyHtml)}));throw e;}
 const managed=new Set(keys.results.map(x=>x.key));
 return [...rows.results.map(asPost),...legacy.filter(p=>!managed.has(String(p.slug||''))&&!managed.has(String(p.id||''))).map(p=>({...p,bodyHtml:cleanHtml(p.bodyHtml)}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function validate(data) {
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'記事形式が不正です。');
 const get=(field,max,required=false)=>{const value=data[field];if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,`${field}の内容・長さを確認してください。`);return value;};
 const title=get('title',200,true),slug=get('slug',160,true),category=get('category',40,true),date=get('date',10,true),summary=get('summary',240),body=get('bodyHtml',600000);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slug))fail(400,'slugは半角英数字・ハイフン・アンダーバーで入力してください。');
 if(!categories.includes(category))fail(400,'カテゴリーが不正です。');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)fail(400,'公開日が不正です。');
 if(!['draft','published'].includes(data.status))fail(400,'保存状態が不正です。');
 return {title,slug,category,date,summary,bodyHtml:cleanHtml(body),status:data.status,theme:typeof data.theme==='string'?data.theme.slice(0,40):''};
}
async function checkMedia(env,html) {
 const keys=[...new Set([...html.matchAll(/src="\/media\/cms\/([a-z0-9-]+\.(?:png|jpg|webp|gif))"/g)].map(m=>m[1]))];
 if(keys.length>100)fail(400,'画像は1記事100枚までです。');
 for(const key of keys)if(!await stmt(env,'SELECT key FROM cms_media WHERE key=?',key).first())fail(400,'登録されていない画像があります。');
 return keys;
}
async function getPost(env,id){const row=await stmt(env,'SELECT * FROM cms_posts WHERE id=?',id).first();if(!row)fail(404,'記事が見つかりません。');return row;}
function optimistic(data,row){if(!Number.isInteger(data.version)||data.version!==row.version)fail(409,'別の画面で更新されています。一覧から開き直してください。入力内容は端末に残ります。');}
async function save(request,env,id) {
 const data=await readJson(request),post=validate(data),stamp=now(),token=crypto.randomUUID();
 let row;
 if(id){row=await getPost(env,id);optimistic(data,row);if(row.status==='trash')fail(409,'ゴミ箱の記事は先に復元してください。');if(post.slug!==row.slug)fail(400,'保存済みslugはURL保護のため変更できません。');}
 else {
  id=crypto.randomUUID();
  const legacy=await legacyPosts(request,env);
  if(legacy.some(p=>p.slug===post.slug||p.id===post.slug)||await stmt(env,'SELECT key FROM cms_keys WHERE key=?',post.slug).first())fail(409,'このslugは既に使用されています。');
 }
 const refs=await checkMedia(env,post.bodyHtml);
 const statements=[];
 if(row)statements.push(stmt(env,'UPDATE cms_posts SET title=?,category=?,date=?,summary=?,theme=?,body_html=?,status=?,updated_at=?,mutation_token=?,version=version+1 WHERE id=? AND version=?',post.title,post.category,post.date,post.summary,post.theme,post.bodyHtml,post.status,stamp,token,id,row.version));
 else statements.push(stmt(env,'INSERT INTO cms_posts(id,slug,title,category,date,summary,theme,body_html,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,post.slug,post.title,post.category,post.date,post.summary,post.theme,post.bodyHtml,post.status,stamp,stamp),stmt(env,'INSERT INTO cms_keys(key,post_id) VALUES(?,?)',post.slug,id),stmt(env,'INSERT INTO cms_keys(key,post_id) VALUES(?,?)',id,id));
 // D1 batch executes atomically; a conditional guard aborts stale concurrent mutations.
 if(row)statements.push(guard(env,id,row.version+1,token));
 statements.push(stmt(env,'DELETE FROM cms_media_refs WHERE post_id=?',id));
 for(const key of refs)statements.push(stmt(env,'INSERT INTO cms_media_refs(post_id,media_key) VALUES(?,?)',id,key));
 try{await env.DB.batch(statements);}catch(e){if(/UNIQUE|CHECK|NOT NULL/.test(String(e)))fail(409,'重複または同時更新を検出しました。画面を開き直してください。');throw e;}
 return json({post:asPost(await getPost(env,id))});
}
// Insert NULL into a NOT NULL column only if the preceding conditional mutation failed.
function guard(env,id,version,token) {return stmt(env,"INSERT INTO cms_meta(key,value) SELECT 'concurrent_update_guard',NULL WHERE NOT EXISTS(SELECT 1 FROM cms_posts WHERE id=? AND version=? AND mutation_token=?)",id,version,token);}
async function transition(request,env,id,action) {
 const data=await readJson(request),row=await getPost(env,id);optimistic(data,row);let status;
 if(action==='trash'){if(row.status==='trash')fail(409,'既にゴミ箱にあります。');status='trash';}
 else if(action==='restore'){if(row.status!=='trash')fail(409,'ゴミ箱の記事ではありません。');status='draft';}
 else if(action==='publish'||action==='unpublish'){if(row.status==='trash')fail(409,'先に復元してください。');status=action==='publish'?'published':'draft';}
 else fail(404,'操作が見つかりません。');
 const stamp=now(),token=crypto.randomUUID();
 try{await env.DB.batch([stmt(env,'UPDATE cms_posts SET status=?,previous_status=?,updated_at=?,mutation_token=?,version=version+1 WHERE id=? AND version=?',status,row.status,stamp,token,id,row.version),guard(env,id,row.version+1,token)]);}catch(e){if(/NOT NULL|CHECK/.test(String(e)))fail(409,'同時更新を検出しました。開き直してください。');throw e;}
 return json({post:asPost(await getPost(env,id))});
}
async function permanentlyDelete(request,env,id) {
 const data=await readJson(request),row=await getPost(env,id);optimistic(data,row);
 if(row.status!=='trash'||data.confirm!=='DELETE')fail(400,'ゴミ箱の記事のみ完全削除できます。');
 const result=await stmt(env,"DELETE FROM cms_posts WHERE id=? AND version=? AND status='trash'",id,row.version).run();
 if(!result.meta.changes)fail(409,'同時更新を検出しました。');
 // Keys and KV images intentionally remain. Shared media is never deleted here.
 return json({ok:true});
}
async function importLegacy(request,env) {
 const data=await readJson(request);if(data.confirm!=='IMPORT')fail(400,'移行確認が必要です。');
 const marker=await stmt(env,"SELECT value FROM cms_meta WHERE key='legacy_import_v1'").first();
 if(marker)return json({ok:true,alreadyImported:true,message:'移行済みです。再実行による上書きは行いません。'});
 const posts=await legacyPosts(request,env);if(posts.length>80)fail(400,'80件を超えます。安全な分割移行が必要です。');
 const time=now(),commands=[],seen=new Set();
 for(const p of posts){
  const id=String(p.id||crypto.randomUUID()),slug=String(p.slug||id);
  for(const key of new Set([id,slug])){if(seen.has(key)||await stmt(env,'SELECT key FROM cms_keys WHERE key=?',key).first())fail(409,'既存記事とCMSのキーが重複しています。上書きせず移行を中止しました。');seen.add(key);}
  if(!p.title||!p.category||!p.date||typeof p.bodyHtml!=='string')fail(400,'既存記事の必要項目が不足しています。');
  const {bodyHtml,...extras}=p;
  commands.push(stmt(env,"INSERT INTO cms_posts(id,slug,title,category,date,summary,theme,body_html,extra_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'published',?,?)",id,slug,p.title,p.category,p.date,p.summary||'',p.theme||'',cleanHtml(bodyHtml),JSON.stringify(extras),time,time));
  for(const key of new Set([id,slug]))commands.push(stmt(env,'INSERT INTO cms_keys(key,post_id) VALUES(?,?)',key,id));
 }
 commands.push(stmt(env,"INSERT INTO cms_meta(key,value) VALUES('legacy_backup_v1',?)",JSON.stringify(posts)),stmt(env,"INSERT INTO cms_meta(key,value) VALUES('legacy_import_v1',?)",JSON.stringify({count:posts.length,at:time})));
 await env.DB.batch(commands);return json({ok:true,count:posts.length});
}
function imageType(bytes){
 if(bytes.length<16)return null;
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return ['image/png','png'];
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return ['image/jpeg','jpg'];
 const text=(a,b)=>new TextDecoder().decode(bytes.slice(a,b));
 if(['GIF87a','GIF89a'].includes(text(0,6)))return ['image/gif','gif'];
 if(text(0,4)==='RIFF'&&text(8,12)==='WEBP')return ['image/webp','webp'];return null;
}
async function upload(request,env){
 if(!env.CMS_IMAGES)fail(503,'Workers KVのCMS_IMAGES bindingを設定してください。');
 let bytes;
 try{bytes=await boundedBody(request,2*1024*1024);}catch(error){if(error instanceof CmsError&&error.status===413)fail(413,'保存できる画像は2MiB（約2.1MB）までです。JPEG写真は自動縮小します。PNG・GIF・WebPは端末で小さくしてから選び直してください。');throw error;}
 const type=imageType(bytes);
 if(!type||request.headers.get('Content-Type')?.split(';')[0]!==type[0])fail(415,'JPEG・PNG・WebP・GIFのみ使用できます。形式も検証しています。');
 const key=`${crypto.randomUUID()}.${type[1]}`;
 let name;try{name=decodeURIComponent(request.headers.get('X-File-Name')||'image').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200);}catch{fail(400,'画像ファイル名を読み取れません。選び直してください。');}
 try{await env.CMS_IMAGES.put(key,bytes,{metadata:{mime:type[0],size:bytes.length}});}catch{fail(503,'画像をKVへ保存できませんでした。CMS_IMAGES設定、KVの保存容量1GB・書き込み1,000回/日の無料枠をCloudflareで確認してください。');}
 await stmt(env,'INSERT INTO cms_media(key,mime,size,original_name,created_at) VALUES(?,?,?,?,?)',key,type[0],bytes.length,name,now()).run();
 return json({key,url:`/media/cms/${key}`,adminUrl:`/admin/media/cms/${key}`},201);
}
async function media(request,env,key,admin){
 if(!['GET','HEAD'].includes(request.method))fail(405,'Method Not Allowed');
 if(!/^[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(key))fail(404,'画像が見つかりません。');
 if(!admin){const reference=await stmt(env,"SELECT 1 FROM cms_media_refs r JOIN cms_posts p ON p.id=r.post_id WHERE r.media_key=? AND p.status='published' LIMIT 1",key).first();if(!reference)fail(404,'画像が見つかりません。');}
 const info=await stmt(env,'SELECT mime,size FROM cms_media WHERE key=?',key).first();
 if(!info||!['image/jpeg','image/png','image/webp','image/gif'].includes(info.mime))fail(404,'画像が見つかりません。');
 // Check D1 authorization before every KV read. Never cache a public authorization decision.
 let body;try{body=await env.CMS_IMAGES?.get(key,{type:'stream',cacheTtl:30});}catch{fail(503,'画像をKVから読み取れませんでした。KVの読み取り無料枠・binding設定を確認してください。');}
 if(!body)fail(503,'画像の保存先への反映待ち、または画像本体が見つかりません。1分ほど待ってページを再読み込みしてください。');
 const headers=new Headers({'Content-Type':info.mime,'Content-Length':String(info.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${key}"`,'ETag':`"${key}"`});
 if(request.method==='HEAD')await body.cancel();
 return new Response(request.method==='HEAD'?null:body,{headers});
}
function articleMarkup(post,preview=false,origin=''){
 const share=new URL('https://x.com/intent/tweet');share.searchParams.set('text',post.title);share.searchParams.set('url',`${origin}/blog/article.html?slug=${encodeURIComponent(post.slug||post.id)}`);
 const theme=({'SKE48':'ske','競馬':'keiba','ゲーム':'game','便利ツール':'tool','雑記':'note'})[post.category]||'note';
 const body=preview?cleanHtml(post.bodyHtml).replaceAll('/media/cms/','/admin/media/cms/'):cleanHtml(post.bodyHtml);
 return `<article><header class="article-header"><a class="back-link" href="${preview?'/admin/':'/blog/'}">‹ ${preview?'管理画面':'記事一覧'}へ戻る</a><div class="article-meta"><span class="chip chip-${theme}">${esc(post.category)}</span><time>${esc(post.date.replaceAll('-','.'))}</time></div><h1>${esc(post.title)}</h1><p class="article-lead">${esc(post.summary)}</p>${preview?'':`<div class="article-share"><a class="article-share-x" href="${esc(share.href)}" target="_blank" rel="noopener noreferrer">Xで共有</a></div>`}</header><div class="article-prose">${body}</div></article>`;
}
async function articleTemplate(request,env) {
 let url=new URL('/blog/article.html',request.url);
 for(let i=0;i<4;i++) {
  const response=await env.ASSETS.fetch(new Request(url));
  if([301,302,307,308].includes(response.status)&&response.headers.has('Location')){const next=new URL(response.headers.get('Location'),url);if(next.origin!==url.origin)fail(503,'記事テンプレートの転送先が不正です。');url=next;continue;}
  if(!response.ok)fail(503,'記事テンプレートを読み込めません。');return response;
 }
 fail(503,'記事テンプレートの転送を確認してください。');
}
async function articlePage(request,env,post,preview=false){
 const template=await articleTemplate(request,env);
 const canonical=new URL('/blog/article.html',request.url);canonical.searchParams.set('slug',post.slug||post.id);
 let response=new HTMLRewriter().on('title',{element:e=>e.setInnerContent(`${esc(post.title)} | めがねまるのブログ`,{html:true})}).on('meta[name="description"]',{element:e=>e.setAttribute('content',post.summary||'')}).on('head',{element:e=>{if(preview)e.prepend(`<base href="${esc(new URL(request.url).origin)}/"><meta name="robots" content="noindex,nofollow">`,{html:true});else e.append(`<link rel="canonical" href="${esc(canonical.href)}">`,{html:true});}}).on('#articleRoot',{element:e=>{e.setAttribute('data-server-rendered','true');e.setInnerContent(articleMarkup(post,preview,new URL(request.url).origin),{html:true});}});
 if(preview)response=response.on('script',{element:e=>e.remove()});
 const rendered=response.transform(template);const headers=new Headers(rendered.headers);headers.set('Cache-Control','no-store');return new Response(rendered.body,{status:200,headers});
}
export async function handleCms(request,env){
 const url=new URL(request.url),path=url.pathname;
 const admin=path==='/admin'||path.startsWith('/admin/')||path==='/api/admin'||path.startsWith('/api/admin/');
 const handled=admin||path==='/data/posts.json'||path.startsWith('/media/cms/')||['/blog/article','/blog/article.html'].includes(path);
 if(!handled)return null;
 try{
  if(path==='/admin/login'){
   if(request.method==='GET')return secureResponse(new Response(loginPage(),{headers:{'Content-Type':'text/html; charset=utf-8'}}),true);
   if(request.method==='POST'){
    const fetchSite=request.headers.get('Sec-Fetch-Site');
    if(fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none')fail(403,'別サイトからログインできません。');
    const origin=request.headers.get('Origin');
    if(origin){
      let source;
      try{source=new URL(origin);}catch{fail(403,'ログイン元を確認できません。');}
      if(source.protocol!==url.protocol||source.hostname!==url.hostname||source.port!==url.port)fail(403,'別サイトからログインできません。');
    }
    await checkLoginRateLimit(request,env);
    const form=await request.formData();
    if(!await verifyAdminPassword(env,form.get('password'))){
     await recordLoginFailure(request,env);
     return secureResponse(new Response(loginPage('認証情報が一致しません。不正なログイン試行は中止してください。認証失敗が規定回数に達した場合、この接続元からのログインを15分間制限します。'),{status:401,headers:{'Content-Type':'text/html; charset=utf-8'}}),true);
    }
    await clearLoginFailures(request,env);
    return secureResponse(new Response(null,{status:303,headers:{Location:'/admin/','Set-Cookie':await makeSessionCookie(env)}}),true);
   }
   fail(405,'Method Not Allowed');
  }
  if(path==='/admin/logout'){
   if(request.method!=='POST')fail(405,'Method Not Allowed');await authorize(request,env);
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)fail(403,'別サイトから操作できません。');
   return secureResponse(new Response(null,{status:303,headers:{Location:'/admin/login','Set-Cookie':clearSessionCookie()}}),true);
  }
  if(admin){
   try{await authorize(request,env);}catch(error){if(error instanceof CmsError&&error.status===401&&!path.startsWith('/api/'))return secureResponse(new Response(null,{status:303,headers:{Location:'/admin/login'}}),true);throw error;}
   if(!['GET','HEAD'].includes(request.method))requireMutation(request);
  }
  let response;
  if(path==='/data/posts.json'){if(!['GET','HEAD'].includes(request.method))fail(405,'Method Not Allowed');response=json(await publicPosts(request,env));if(request.method==='HEAD')response=new Response(null,{headers:response.headers});}
  else if(path.startsWith('/admin/media/cms/'))response=await media(request,env,path.slice('/admin/media/cms/'.length),true);
  else if(path.startsWith('/media/cms/'))response=await media(request,env,path.slice('/media/cms/'.length),false);
  else if(path==='/api/admin/session'&&request.method==='GET'){
   let schema=false;try{schema=!!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cms_posts'").first();}catch{}
   response=json({email:'管理者',categories,schema,kv:!!env.CMS_IMAGES,securityAlert:await getSecurityAlert(env)});
  }
  else if(path==='/api/admin/security-alert/ack'&&request.method==='POST'){
   await acknowledgeSecurityAlert(env);response=json({ok:true});
  }
  else if(path==='/api/admin/posts'&&request.method==='GET')response=json({posts:(await env.DB.prepare('SELECT * FROM cms_posts ORDER BY updated_at DESC').all()).results.map(asPost)});
  else if(path==='/api/admin/posts'&&request.method==='POST')response=await save(request,env);
  else if(path==='/api/admin/import'&&request.method==='POST')response=await importLegacy(request,env);
  else if(path==='/api/admin/export'&&request.method==='GET')response=json({posts:(await env.DB.prepare('SELECT * FROM cms_posts').all()).results.map(asPost),keys:(await env.DB.prepare('SELECT * FROM cms_keys').all()).results,meta:(await env.DB.prepare('SELECT * FROM cms_meta').all()).results,media:(await env.DB.prepare('SELECT * FROM cms_media').all()).results});
  else if(path==='/api/admin/images'&&request.method==='POST')response=await upload(request,env);
  else if(/^\/api\/admin\/posts\/[^/]+(?:\/(?:trash|restore|publish|unpublish))?$/.test(path)){
   const [,id,action]=path.match(/^\/api\/admin\/posts\/([^/]+)(?:\/(.*))?$/);
   if(request.method==='GET'&&!action)response=json({post:asPost(await getPost(env,id))});
   else if(request.method==='PUT'&&!action)response=await save(request,env,id);
   else if(request.method==='DELETE'&&!action)response=await permanentlyDelete(request,env,id);
   else if(request.method==='POST'&&action)response=await transition(request,env,id,action);else fail(405,'Method Not Allowed');
  }
  else if(path==='/admin/preview'&&request.method==='POST'){
   const data=await readJson(request),post=validate({...data,status:'draft'});response=await articlePage(request,env,post,true);
  }
  else if(path==='/admin/preview'&&request.method==='GET'){
   const row=await getPost(env,url.searchParams.get('id'));response=await articlePage(request,env,asPost(row),true);
  }
  else if(path==='/admin')response=new Response(null,{status:302,headers:{Location:'/admin/'}});
  else if(path.startsWith('/admin/')&&!path.startsWith('/admin/media/')&&['GET','HEAD'].includes(request.method))response=await env.ASSETS.fetch(request);
  else if(path.startsWith('/api/admin'))fail(404,'APIが見つかりません。');
  else {
   const slug=url.searchParams.get('slug'),posts=await publicPosts(request,env),post=posts.find(p=>p.slug===slug||p.id===slug);
   if(!post){const template=await articleTemplate(request,env);const html=new HTMLRewriter().on('#articleRoot',{element:e=>e.setInnerContent('<h1>記事が見つかりませんでした。</h1><a href="/blog/">記事一覧へ戻る</a>',{html:true})}).transform(template);response=new Response(html.body,{status:404,headers:html.headers});}
   else response=await articlePage(request,env,post);
  }
  return secureResponse(response,admin);
 }catch(error){
  if(!(error instanceof CmsError))console.error('CMS failure',error);
  const status=error instanceof CmsError?error.status:503;
  const message=error instanceof CmsError?error.message:'CMSの処理に失敗しました。D1のSQL・binding設定を確認してください。';
  const response=path.startsWith('/api/')?json({error:message},status):new Response(`<meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>${esc(message)}</h1>`,{status,headers:{'Content-Type':'text/html; charset=utf-8'}});
  return secureResponse(response,admin);
 }
}
