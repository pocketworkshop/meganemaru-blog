import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { prepareImage } from './image-upload.js';
DOMPurify.addHook('uponSanitizeAttribute',(_node,data)=>{
 if(data.attrName!=='style')return;
 const style=document.createElement('span').style;style.cssText=data.attrValue;
 const rules={'text-align':/^(left|center|right|justify)$/,'font-family':/^(sans-serif|serif)$/,'font-size':/^(14|16|18|20|24|28|32)px$/,'font-weight':/^(normal|bold|[1-9]00)$/,'font-style':/^(normal|italic)$/,'text-decoration':/^(underline|line-through)$/};
 data.attrValue=Object.entries(rules).filter(([name,rule])=>rule.test(style.getPropertyValue(name).trim())).map(([name])=>`${name}:${style.getPropertyValue(name).trim()}`).join(';');
});
const $=id=>document.getElementById(id);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const statusLabel={draft:'下書き',published:'公開中',trash:'ゴミ箱'};
let posts=[],filter='all',current=null,dirty=false,busy=false,editor,imagePosition,previewUrl,localKey='',localTimer,programmatic=false;
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function api(path,options={}){
 const method=options.method||'GET',headers=new Headers(options.headers);
 if(method!=='GET'){headers.set('X-CMS-Request','1');if(!options.raw){headers.set('Content-Type','application/json');options.body=JSON.stringify(options.body||{});}}
 const response=await fetch(path,{...options,method,headers,credentials:'same-origin',redirect:'error'}).catch(()=>{throw Error('通信または認証を確認してください。入力内容は端末に控えを残します。');});
 if(!response.ok){let message;try{message=(await response.json()).error;}catch{}throw Error(message||'認証または設定を確認してください。');}
 return options.response?response:response.json();
}
function fieldData(){const slug=$('slug').value.trim()||(current?.slug||`post-${dateJst()}-${crypto.randomUUID().slice(0,8)}`);$('slug').value=slug;return {title:$('title').value.trim(),slug,category:$('category').value,date:$('date').value,summary:$('summary').value,bodyHtml:editor.getHTML().replaceAll('/admin/media/cms/','/media/cms/'),theme:current?.theme||'',version:current?.version,status:current?.status==='published'?'published':'draft'};}
function localId(){return current?.id||'new';}
function stash(){if(!dirty||!localKey)return;try{const all=JSON.parse(localStorage.getItem(localKey)||'{}');all[localId()]={...fieldData(),id:current?.id,baseVersion:current?.version,at:new Date().toISOString()};localStorage.setItem(localKey,JSON.stringify(all));$('saveState').textContent='端末に編集控えを保存（未送信）';}catch{$('saveState').textContent='未保存：端末への控え保存ができません';}}
function changed(){if(programmatic)return;dirty=true;$('saveState').textContent='未保存';clearTimeout(localTimer);localTimer=setTimeout(stash,700);}
function clearStash(id){try{const all=JSON.parse(localStorage.getItem(localKey)||'{}');delete all[id];localStorage.setItem(localKey,JSON.stringify(all));}catch{}}
function restoreLocal(id){try{const all=JSON.parse(localStorage.getItem(localKey)||'{}'),backup=all[id];if(!backup)return;
 if(confirm(`この端末に未送信の編集控えがあります（${new Date(backup.at).toLocaleString('ja-JP')}）。復元しますか？`)){
  if(current&&backup.baseVersion!==current.version){notice('保存済み記事が更新されています。控えを別の新規記事として開きます。',true);current=null;backup.slug=`recovered-${crypto.randomUUID().slice(0,8)}`;backup.status='draft';}
  fill(backup);dirty=true;$('saveState').textContent='編集控えを復元・未保存';
 }else clearStash(id);
 }catch{}}
function fill(post){programmatic=true;for(const id of ['title','slug','category','date','summary'])$(id).value=post[id]||'';
 $('slug').disabled=!!current;$('editLabel').textContent=current?'記事を編集':'新規記事';$('currentStatus').textContent=statusLabel[current?.status||'draft'];$('currentStatus').className=`state-chip ${current?.status||'draft'}`;
 editor.commands.setContent(DOMPurify.sanitize(post.bodyHtml||'<p></p>').replaceAll('/media/cms/','/admin/media/cms/'),{emitUpdate:false});programmatic=false;
 $('saveDraft').hidden=current?.status==='published';$('stopPublishing').hidden=current?.status!=='published';$('publishPost').textContent=current?.status==='published'?'更新する':'公開する';syncToolbar();}
async function openEditor(id){if(dirty&&!confirm('未保存の編集控えを端末に残して移動しますか？'))return;stash();current=id?(await api(`/api/admin/posts/${encodeURIComponent(id)}`)).post:null;
 if(current?.status==='trash')throw Error('ゴミ箱の記事は先に復元してください。');
 dirty=false;fill(current||{date:dateJst(),category:'雑記'});$('listView').hidden=true;$('editView').hidden=false;$('saveState').textContent=current?'保存済み':'未保存';restoreLocal(id||'new');window.scrollTo({top:0,behavior:'instant'});}
function renderList(){const term=$('searchPosts').value.trim().toLowerCase();const visible=posts.filter(p=>(filter==='all'||p.status===filter)&&`${p.title} ${p.category}`.toLowerCase().includes(term));
 $('postList').innerHTML=visible.length?visible.map(p=>`<article class="post-card"><h2>${escape(p.title)}</h2><div class="post-meta"><span class="state-chip ${p.status}">${statusLabel[p.status]}</span><span>${escape(p.category)}</span><span>更新 ${escape(new Date(p.updatedAt).toLocaleString('ja-JP'))}</span></div><div class="button-row">${p.status==='trash'?`<button data-action="restore" data-id="${escape(p.id)}">下書きとして復元</button><button data-action="delete" data-id="${escape(p.id)}" class="danger">完全削除</button>`:`<button data-action="edit" data-id="${escape(p.id)}">編集</button><button data-action="preview" data-id="${escape(p.id)}">プレビュー</button><button data-action="${p.status==='published'?'unpublish':'publish'}" data-id="${escape(p.id)}">${p.status==='published'?'公開停止':'公開'}</button><button data-action="trash" data-id="${escape(p.id)}" class="danger">ゴミ箱へ</button>`}</div></article>`).join(''):'<div class="empty">ここにはまだ記事がありません。<br>「＋ 新規記事」から書き始めましょう。</div>';
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));}
async function loadList(){posts=(await api('/api/admin/posts')).posts;renderList();}
async function withBusy(fn){if(busy)return;busy=true;editor?.setEditable(false,false);document.querySelectorAll('.metadata input,.metadata textarea,.metadata select,#toolbar button,#toolbar select').forEach(e=>e.disabled=true);document.querySelectorAll('.save-bar button,#newPost,#importPosts,#insertImage').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice(e.message,true);$('imageMessage').textContent=e.message;}finally{busy=false;editor?.setEditable(true,false);document.querySelectorAll('.metadata input,.metadata textarea,.metadata select,#toolbar button,#toolbar select').forEach(e=>e.disabled=false);$('slug').disabled=!!current;document.querySelectorAll('.save-bar button,#newPost,#importPosts,#insertImage').forEach(b=>b.disabled=false);}}
async function persist(status){const data={...fieldData(),status};if(!data.title)throw Error('タイトルを入力してください。');stash();const oldId=localId();const result=await api(current?`/api/admin/posts/${current.id}`:'/api/admin/posts',{method:current?'PUT':'POST',body:data});current=result.post;dirty=false;clearTimeout(localTimer);clearStash(oldId);fill(current);$('saveState').textContent=`${status==='published'?'公開中':'下書き'}・保存済み ${new Date().toLocaleTimeString('ja-JP')}`;notice(status==='published'?'公開記事を保存しました。ブログに反映されています。':'下書きを保存しました。一般ユーザーには表示されません。');}
function safePaste(html){return DOMPurify.sanitize(html,{FORBID_TAGS:['script','style','iframe','object','embed','form','input'],FORBID_ATTR:['class','id'],ALLOW_DATA_ATTR:false});}
function looksMarkdown(text){return /^(#{1,6}\s|```|>\s)/m.test(text)||/^\s*(?:[-*+]\s|\d+[.)]\s).+\n\s*(?:[-*+]\s|\d+[.)]\s)/m.test(text)||/\*\*[^*\n]+\*\*/.test(text)||/\[[^\]\n]+\]\(https?:\/\//.test(text);}
const CaptionImage=Image.extend({
 addAttributes(){return {...this.parent?.(),width:{default:null,parseHTML:e=>e.querySelector('img')?.getAttribute('width')||e.getAttribute('width')},caption:{default:'',parseHTML:e=>e.querySelector('figcaption')?.textContent||''},alignment:{default:'center',parseHTML:e=>e.style.textAlign||'center'},src:{default:null,parseHTML:e=>e.querySelector('img')?.getAttribute('src')||e.getAttribute('src')},alt:{default:'',parseHTML:e=>e.querySelector('img')?.getAttribute('alt')||e.getAttribute('alt')||''}};},
 parseHTML(){return [{tag:'figure:has(img)'},{tag:'img[src]'}];},
 renderHTML({node}){const a=node.attrs;const img=['img',{src:a.src,alt:a.alt||'',...(a.width?{width:a.width}:{})}];return ['figure',{style:`text-align: ${a.alignment}`},img,...(a.caption?[['figcaption',{},a.caption]]:[])];},
});
function syncToolbar(){if(!editor)return;for(const button of document.querySelectorAll('[data-command]'))button.classList.toggle('active',editor.isActive(button.dataset.command));$('heading').value=editor.isActive('heading')?String(editor.getAttributes('heading').level):'0';}
function initEditor(){editor=new Editor({element:$('editor'),extensions:[StarterKit.configure({heading:{levels:[1,2,3,4]},link:{openOnClick:false,autolink:false,protocols:['https','http','mailto']}}),CaptionImage,TextAlign.configure({types:['heading','paragraph']}),TextStyle,FontFamily,FontSize,TableKit.configure({table:{resizable:false}})],content:'<p></p>',editorProps:{attributes:{'aria-label':'記事本文',role:'textbox','aria-multiline':'true'},transformPastedHTML:safePaste,handlePaste(view,event){const html=event.clipboardData?.getData('text/html'),text=event.clipboardData?.getData('text/plain')||'';if(html){event.preventDefault();editor.commands.insertContent(safePaste(html));return true;}if(looksMarkdown(text)){event.preventDefault();editor.commands.insertContent(safePaste(marked.parse(text,{gfm:true,breaks:false})));return true;}return false;}},onUpdate:changed,onSelectionUpdate:syncToolbar});
 document.querySelectorAll('[data-command]').forEach(b=>{b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{const command={bold:'toggleBold',italic:'toggleItalic',bulletList:'toggleBulletList',orderedList:'toggleOrderedList',blockquote:'toggleBlockquote',undo:'undo',redo:'redo'}[b.dataset.command];editor.chain().focus()[command]().run();syncToolbar();});});
 $('heading').onchange=()=>{const level=Number($('heading').value);if(level)editor.chain().focus().toggleHeading({level}).run();else editor.chain().focus().setParagraph().run();};
 $('alignment').onchange=()=>editor.chain().focus().setTextAlign($('alignment').value).run();$('font').onchange=()=>editor.chain().focus().setFontFamily($('font').value).run();$('fontSize').onchange=()=>{const size=$('fontSize').value;if(size)editor.chain().focus().setFontSize(size).run();else editor.chain().focus().unsetFontSize().run();};
 $('linkButton').onclick=()=>{const old=editor.getAttributes('link').href||'',value=prompt('リンク先（https://…）。空欄でリンク解除。',old);if(value===null)return;if(!value){editor.chain().focus().extendMarkRange('link').unsetLink().run();return;}if(!/^(https?:\/\/|mailto:)/i.test(value))return notice('リンクはhttp・https・mailtoを使用してください。',true);editor.chain().focus().extendMarkRange('link').setLink({href:value}).run();};
 $('removeImage').onclick=()=>{if(editor.isActive('image'))editor.chain().focus().deleteSelection().run();else notice('外す画像を本文でタップしてから操作してください。');};
}
async function preview(data){const response=await api('/admin/preview',{method:'POST',body:{...data,status:'draft'},response:true});const html=await response.text();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([html],{type:'text/html'}));$('previewFrame').src=previewUrl;$('previewDialog').showModal();}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function start(){initEditor();const session=await api('/api/admin/session');localKey=`meganemaru-cms-v1:${session.email}`;
 if(!session.schema){notice('CMS用D1テーブルを確認できません。DB bindingとmigrations/001_cms.sqlの実行先を確認してください。',true);$('newPost').disabled=true;return;}await loadList();notice(`本人認証済み：${session.email}${session.kv?'':' ／ KV設定前のため画像アップロードは利用できません。'}`);
 $('newPost').onclick=()=>withBusy(()=>openEditor());$('searchPosts').oninput=renderList;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderList();});
 $('postList').onclick=e=>withBusy(async()=>{const button=e.target.closest('button[data-action]');if(!button)return;const {id,action}=button.dataset;const post=posts.find(p=>p.id===id);if(action==='edit')return openEditor(id);if(action==='preview')return preview(post);
 const messages={trash:'この記事をゴミ箱に移しますか？一般ブログから非表示になります。',delete:'この記事を完全削除しますか？元に戻せません。画像は保持します。',restore:'下書きとして復元しますか？自動では再公開しません。',publish:'この記事を公開しますか？',unpublish:'公開を停止して下書きに戻しますか？'};if(!confirm(messages[action]))return;
 await api(action==='delete'?`/api/admin/posts/${id}`:`/api/admin/posts/${id}/${action}`,{method:action==='delete'?'DELETE':'POST',body:{version:post.version,confirm:'DELETE'}});if(action==='delete')clearStash(id);await loadList();notice('記事の状態を更新しました。');});
 $('backToList').onclick=()=>withBusy(async()=>{if(dirty&&!confirm('未保存の控えを端末に残して一覧へ戻りますか？'))return;stash();dirty=false;$('editView').hidden=true;$('listView').hidden=false;await loadList();});
 for(const id of ['title','slug','category','date','summary'])$(id).addEventListener('input',changed);
 $('saveDraft').onclick=()=>withBusy(()=>persist('draft'));$('publishPost').onclick=()=>withBusy(async()=>{if(current?.status!=='published'&&!confirm('この記事を一般公開しますか？'))return;await persist('published');});$('stopPublishing').onclick=()=>withBusy(async()=>{if(confirm('編集内容を保存して公開を停止しますか？'))await persist('draft');});
 $('previewButton').onclick=()=>withBusy(()=>preview(fieldData()));$('closePreview').onclick=()=>{$('previewDialog').close();$('previewFrame').removeAttribute('src');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
 $('imageButton').onclick=()=>{imagePosition={from:editor.state.selection.from,to:editor.state.selection.to};$('imageForm').reset();$('imagePreview').hidden=true;$('imageMessage').textContent='保存は2MiBまで。JPEG写真は長辺1600pxへ自動縮小。PNG・GIF・WebPは形式を保持。';$('imageDialog').showModal();};
 let imagePreviewUrl;
 $('imageFile').onchange=()=>{const file=$('imageFile').files[0];if(imagePreviewUrl)URL.revokeObjectURL(imagePreviewUrl);if(!file)return;imagePreviewUrl=URL.createObjectURL(file);$('imagePreview').src=imagePreviewUrl;$('imagePreview').hidden=false;};
 $('insertImage').onclick=()=>withBusy(async()=>{const file=$('imageFile').files[0];if(!file)throw Error('画像を選択してください。');$('imageMessage').textContent='写真を確認・最適化しています…';const prepared=await prepareImage(file);$('imageMessage').textContent=`${prepared.note}・アップロードしています…`;const result=await api('/api/admin/images',{method:'POST',raw:true,body:prepared.file,headers:{'Content-Type':prepared.file.type,'X-File-Name':encodeURIComponent(file.name)}});editor.chain().focus().setTextSelection(imagePosition).setImage({src:result.adminUrl,alt:$('imageAlt').value,caption:$('imageCaption').value,width:$('imageWidth').value||null,alignment:$('imageAlign').value}).run();$('imageDialog').close();notice(`カーソル位置に画像を挿入しました（${prepared.note}）。表示されない場合はKVの反映を1分ほど待って再読み込みしてください。`);});
 $('importPosts').onclick=()=>withBusy(async()=>{if(!confirm('現在のposts.jsonをD1へ1回だけ取り込みます。元ファイルは残ります。実行しますか？'))return;const result=await api('/api/admin/import',{method:'POST',body:{confirm:'IMPORT'}});await loadList();notice(result.alreadyImported?'移行済みです。既存記事への上書きはありません。':`${result.count}件の記事を取り込みました。`);});
 $('exportPosts').onclick=()=>withBusy(async()=>{download(await api('/api/admin/export'),`meganemaru-cms-backup-${dateJst()}.json`);notice('記事バックアップをダウンロードしました。画像本体はWorkers KVにあります（このバックアップには含みません）。');});
 $('clearLocal').onclick=()=>{if(confirm('この端末に残した未送信の編集控えをすべて消しますか？')){localStorage.removeItem(localKey);notice('端末の編集控えを消しました。D1の記事には影響しません。');}};
 window.addEventListener('beforeunload',e=>{if(dirty){stash();e.preventDefault();e.returnValue='';}});document.addEventListener('visibilitychange',()=>{if(document.hidden)stash();});window.addEventListener('pagehide',stash);
}
start().catch(e=>notice(e.message,true));
