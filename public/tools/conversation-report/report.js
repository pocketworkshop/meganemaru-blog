(()=>{const $=s=>document.querySelector(s),E=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));let people=[''],msgs=[],sel={side:'me',i:-1},theme=localStorage.getItem('report.theme')||'simple';
const THEMES={
simple:{bg1:'#91b4c3',bg2:'#7fa2b1',left:'#ffffff',right:'#e4f8dc',accent:'#88a5b2',decor:''},
oshi:{bg1:'#ffc3d7',bg2:'#d9c4ff',left:'#fff8fd',right:'#fff0f6',accent:'#f08aaa',decor:'♡  ✦  ♡'},
yume:{bg1:'#bfeaff',bg2:'#d8c8ff',left:'#f1fbff',right:'#e9e4ff',accent:'#9da5e8',decor:'☁  ✦  ☁'},
pop:{bg1:'#ffd86e',bg2:'#ffad82',left:'#fff8e8',right:'#fff1a9',accent:'#f3a94e',decor:'★  ●  ★'},
natural:{bg1:'#b9dfc2',bg2:'#e8ddbb',left:'#fffaf0',right:'#e4f1d8',accent:'#82b690',decor:'❀  ·  ❀'}
};
function applyTheme(){const card=document.querySelector('.card');if(card)card.dataset.theme=theme;document.querySelectorAll('.theme-choice').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));}const H=()=>{try{return JSON.parse(localStorage.getItem('report.names')||'[]')}catch{return[]}};function history(){let h=H();$('#history').innerHTML=h.map(n=>`<option value="${E(n)}">`).join('');$('#historyChips').innerHTML=h.map(n=>`<span class="chip">${E(n)}<button data-x="${E(n)}">×</button></span>`).join('')}function remember(n){n=(n||'').trim();if(!n)return;localStorage.setItem('report.names',JSON.stringify([n,...H().filter(x=>x!==n)].slice(0,50)));history()}function nm(m){return m.side==='me'?($('#me').value.trim()||'自分'):(people[m.i]?.trim()||`相手${m.i+1}`)}function speakers(){let me=$('#me').value.trim()||'自分';$('#speakers').innerHTML=`<button class="speaker me ${sel.side==='me'?'active':''}" data-side="me">${E(me)}</button>`+people.map((n,i)=>`<button class="speaker ${sel.side==='other'&&sel.i===i?'active':''}" data-side="other" data-i="${i}">${E(n.trim()||`相手${i+1}`)}</button>`).join('')}function persons(){ $('#people').innerHTML=people.map((n,i)=>`<div class="person"><input data-person="${i}" list="history" placeholder="相手${i+1}の名前" value="${E(n)}">${people.length>1?`<button class="delete" data-delperson="${i}">×</button>`:''}</div>`).join('');speakers();draw()}function head(){$('#ptitle').textContent=$('#title').value.trim()||'会話レポ';$('#pmeta').textContent=[$('#date').value,$('#slot').value.trim()].filter(Boolean).join(' ・ ')}function draw(){head();$('#conversation').innerHTML=msgs.length?msgs.map((m,i)=>`<div class="msg ${m.side==='me'?'right':'left'}"><span class="name">${E(nm(m))}</span><div class="bubble">${E(m.text)}</div><div class="tools"><button data-up="${i}">↑</button><button data-down="${i}">↓</button><button data-edit="${i}">編集</button><button data-del="${i}">削除</button></div></div>`).join(''):'<div class="empty">会話を追加すると、ここに吹き出しが表示されます。</div>'}function wrap(ctx,t,max){let a=[];String(t).split('\n').forEach(p=>{let l='';[...p].forEach(c=>{if(ctx.measureText(l+c).width>max&&l){a.push(l);l=c}else l+=c});a.push(l)});return a}function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function blob(){return new Promise(ok=>{
 if(!msgs.length){alert('先に会話を追加してください');return ok(null)}
 const W=620,th=THEMES[theme]||THEMES.simple,tmp=document.createElement('canvas').getContext('2d');
 tmp.font='17px sans-serif';
 const bs=msgs.map(m=>({...m,ls:wrap(tmp,m.text,390)}));

 // Each message has: name line + bubble + generous inter-message spacing.
 // Calculate every pixel before creating the canvas so the last bubble can never run under the footer.
 const headerH=124, footerH=52, bottomGap=22;
 const blocks=bs.map(b=>({ ...b, bubbleH:b.ls.length*26+24, blockH:18+(b.ls.length*26+24)+34 }));
 const HH=headerH+blocks.reduce((sum,b)=>sum+b.blockH,0)+bottomGap+footerH;

 const c=document.createElement('canvas');c.width=W*2;c.height=HH*2;
 const x=c.getContext('2d');x.scale(2,2);
 const g=x.createLinearGradient(0,0,W,HH);g.addColorStop(0,th.bg1);g.addColorStop(1,th.bg2);
 x.fillStyle=g;x.fillRect(0,0,W,HH);

 x.globalAlpha=.18;x.fillStyle='#fff';
 for(let i=0;i<Math.max(10,Math.floor(HH/100));i++){x.beginPath();x.arc(35+(i*67)%570,115+(i*91)%Math.max(130,HH-190),8+(i%3)*4,0,Math.PI*2);x.fill()}
 x.globalAlpha=1;

 x.fillStyle='#fff';rounded(x,14,14,W-28,76,18);
 x.fillStyle=th.accent;x.fillRect(14,14,W-28,6);
 x.fillStyle='#29262b';x.textAlign='center';x.font='bold 20px sans-serif';
 x.fillText($('#title').value.trim()||'会話レポ',W/2,47);
 x.fillStyle='#8c8186';x.font='12px sans-serif';
 x.fillText([$('#date').value,$('#slot').value.trim()].filter(Boolean).join(' ・ '),W/2,70);
 if(th.decor){x.fillStyle=th.accent;x.font='12px sans-serif';x.fillText(th.decor,W/2,105)}

 let y=headerH;
 for(const b of blocks){
   const right=b.side==='me';
   const bw=Math.min(430,Math.max(105,...b.ls.map(l=>tmp.measureText(l).width+32)));
   const bx=right?W-24-bw:24;
   x.font='12px sans-serif';x.fillStyle='rgba(255,255,255,.96)';x.textAlign=right?'right':'left';
   x.fillText(nm(b),right?W-25:25,y);
   y+=18;
   x.shadowColor='rgba(40,45,55,.12)';x.shadowBlur=8;x.shadowOffsetY=3;
   x.fillStyle=right?th.right:th.left;rounded(x,bx,y,bw,b.bubbleH,17);
   x.shadowColor='transparent';x.shadowBlur=0;x.shadowOffsetY=0;
   x.fillStyle='#29262b';x.textAlign='left';x.font='17px sans-serif';
   b.ls.forEach((l,j)=>x.fillText(l,bx+16,y+25+j*26));
   y+=b.bubbleH+34;
 }

 // Footer is placed after all messages, never on top of them.
 const fy=HH-footerH;
 x.fillStyle='rgba(255,255,255,.94)';rounded(x,14,fy+10,W-28,28,12);
 x.fillStyle='#9b9195';x.textAlign='center';x.font='10px sans-serif';
 x.fillText('会話レポメーカー',W/2,fy+29);
 c.toBlob(ok,'image/png');
})}
function init(){$('#me').value=localStorage.getItem('report.me')||'';history();persons();head();$('#rememberMe').onclick=()=>{let n=$('#me').value.trim();if(!n)return alert('名前を入力してください');localStorage.setItem('report.me',n);remember(n);speakers();draw();alert('この端末に記憶しました')};$('#me').oninput=()=>{speakers();draw()};$('#addPerson').onclick=()=>{people.push('');persons()};$('#people').oninput=e=>{if(e.target.dataset.person!==undefined){people[+e.target.dataset.person]=e.target.value;speakers();draw()}};$('#people').onchange=e=>{if(e.target.dataset.person!==undefined)remember(e.target.value)};$('#people').onclick=e=>{if(e.target.dataset.delperson!==undefined){let i=+e.target.dataset.delperson;people.splice(i,1);msgs=msgs.filter(m=>m.side!=='other'||m.i!==i).map(m=>m.side==='other'&&m.i>i?{...m,i:m.i-1}:m);sel={side:'me',i:-1};persons()}};$('#speakers').onclick=e=>{let b=e.target.closest('.speaker');if(!b)return;sel=b.dataset.side==='me'?{side:'me',i:-1}:{side:'other',i:+b.dataset.i};speakers()};$('#addMessage').onclick=()=>{let t=$('#message').value.trim();if(!t)return alert('発言を入力してください');if(sel.side==='other'&&!people[sel.i]?.trim())return alert('相手の名前を入力してください');msgs.push({...sel,text:t});if(sel.side==='other')remember(people[sel.i]);$('#message').value='';draw()};['title','date','slot'].forEach(id=>$('#'+id).oninput=head);$('#conversation').onclick=e=>{let i;if(e.target.dataset.del!==undefined)msgs.splice(+e.target.dataset.del,1);else if(e.target.dataset.up!==undefined){i=+e.target.dataset.up;if(i>0)[msgs[i-1],msgs[i]]=[msgs[i],msgs[i-1]]}else if(e.target.dataset.down!==undefined){i=+e.target.dataset.down;if(i<msgs.length-1)[msgs[i+1],msgs[i]]=[msgs[i],msgs[i+1]]}else if(e.target.dataset.edit!==undefined){i=+e.target.dataset.edit;let t=prompt('発言を編集',msgs[i].text);if(t!==null&&t.trim())msgs[i].text=t.trim()}draw()};$('#copy').onclick=async()=>{let s=[$('#title').value.trim()||'会話レポ',[$('#date').value,$('#slot').value.trim()].filter(Boolean).join(' '),...msgs.map(m=>`${nm(m)}「${m.text}」`)].filter(Boolean).join('\n');try{await navigator.clipboard.writeText(s);alert('コピーしました')}catch{alert('コピーできませんでした')}};$('#image').onclick=async()=>{let b=await blob();if(!b)return;let a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='conversation-report.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};$('#shareX').onclick=async()=>{let b=await blob();if(!b)return;let f=new File([b],'conversation-report.png',{type:'image/png'});if(navigator.share&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:$('#title').value.trim()||'会話レポ',text:'#会話レポ\n会話レポメーカーで作成しました\nhttps://meganemaru-blog.pwtools.workers.dev/tools/conversation-report/'});return}catch(e){if(e.name==='AbortError')return}}let a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='conversation-report.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);alert('画像を保存しました。Xで画像を添付してください。')};$('#themePicker').onclick=e=>{let b=e.target.closest('.theme-choice');if(!b)return;theme=b.dataset.theme;localStorage.setItem('report.theme',theme);applyTheme()};
$('#historyChips').onclick=e=>{if(e.target.dataset.x!==undefined){localStorage.setItem('report.names',JSON.stringify(H().filter(n=>n!==e.target.dataset.x)));history()}}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init()})();