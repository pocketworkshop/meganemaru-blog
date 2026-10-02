async function api(path, options={}) {
  const headers=new Headers(options.headers||{});
  if(options.method && !['GET','HEAD'].includes(options.method)) headers.set('X-CMS-Request','1');
  const response=await fetch(path,{...options,headers,credentials:'same-origin'});
  if(!response.ok) throw new Error('security alert request failed');
  return response.json();
}
function fmt(iso){
  try{return new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(new Date(iso));}
  catch{return iso||'';}
}
async function showAlert(){
  try{
    const session=await api('/api/admin/session');
    const a=session.securityAlert;
    if(!a || a.acknowledged) return;
    const box=document.createElement('section');
    box.id='securityAlert';
    box.setAttribute('role','alert');
    box.style.cssText='margin:14px auto;max-width:1100px;padding:14px 16px;border:2px solid #d33;border-radius:14px;background:#fff1f1;color:#5c1717;box-shadow:0 4px 18px #0001';
    box.innerHTML=`<strong style="display:block;font-size:1.05rem;margin-bottom:6px">⚠️ 不審なログイン試行がありました</strong>
      <div>${fmt(a.at)}　${Number(a.failures)||5}回失敗 → ${Number(a.blockedMinutes)||15}分ロック</div>
      <div style="margin-top:4px;font-size:.92rem">接続元IP：${String(a.ip||'不明').replace(/[&<>"']/g,'')}　国：${String(a.country||'不明').replace(/[&<>"']/g,'')}</div>
      <button id="securityAlertAck" style="margin-top:10px;padding:8px 12px">確認済みにする</button>`;
    const main=document.querySelector('.cms-shell');
    main?.prepend(box);
    box.querySelector('#securityAlertAck')?.addEventListener('click',async()=>{
      const b=box.querySelector('button'); b.disabled=true;
      try{await api('/api/admin/security-alert/ack',{method:'POST'});box.remove();}
      catch{b.disabled=false;alert('確認済みにできませんでした。');}
    });
  }catch{}
}
showAlert();
