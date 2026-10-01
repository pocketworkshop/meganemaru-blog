(() => {
  const cfg = window.SITE_CONFIG || {};
  document.title = `SKE48 日別まとめ | ${cfg.siteName || 'めがねまるのブログ'}`;
  const dateEl=document.getElementById('digestDate'), summaryEl=document.getElementById('digestSummary'),
    scheduleEl=document.getElementById('digestSchedule'), newsEl=document.getElementById('digestNews'),
    blogsEl=document.getElementById('digestBlogs'), externalNewsEl=document.getElementById('digestExternalNews'),
    youtubeEl=document.getElementById('digestYoutube');
  const esc=v=>String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const kindClass=c=>({'公演':'stage','リリース':'release','イベント':'event','握手会':'meeting','メディア':'media','誕生日':'birthday','その他':'other'})[c]||'other';
  const empty=t=>`<div class="ske-digest-empty">${esc(t)}</div>`;
  const paras=s=>((String(s||'').trim().match(/[^。！？]+[。！？]?/g)||[]).map(x=>`<p>${esc(x.trim())}</p>`).join(''));
  async function init(){
    try{
      const wanted=new URLSearchParams(location.search).get('date');
      const endpoint=wanted?`/api/ske48/archive/day?date=${encodeURIComponent(wanted)}`:'/api/ske48/yesterday';
      const r=await fetch(endpoint,{cache:'no-store'}), d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'digest failed');
      dateEl.textContent=`${d.year}年${d.month}月${d.day}日（${d.weekday}）`;
      summaryEl.innerHTML=`<span class="ske-digest-summary-label">DAILY SUMMARY</span><div class="ske-digest-summary-text">${paras(d.summary)}</div><div class="ske-yesterday-stats"><span><b>${d.counts.schedule}</b> 予定</span><span><b>${d.counts.news}</b> 公式ニュース</span><span><b>${d.counts.blogs}</b> メンバーブログ</span><span><b>${d.counts.externalNews}</b> 外部ニュース</span><span><b>${d.counts.youtube}</b> YouTube</span></div>`;
      scheduleEl.innerHTML=d.scheduleItems.length?d.scheduleItems.map(i=>`<a class="ske-digest-row" href="${esc(i.url||d.sources.schedule)}" target="_blank" rel="noopener noreferrer"><span class="ske-schedule-kind ${kindClass(i.category)}">${esc(i.category)}</span><strong>${esc(i.title)}</strong><span>›</span></a>`).join(''):empty('公式スケジュール上の項目は見つかりませんでした。');
      newsEl.innerHTML=d.newsItems.length?d.newsItems.map(i=>`<a class="ske-digest-row" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><span class="ske-digest-tag">${esc(i.category)}</span><strong>${esc(i.title)}</strong><span>›</span></a>`).join(''):empty('この日付の公式ニュースは見つかりませんでした。');
      blogsEl.innerHTML=d.blogItems.length?d.blogItems.map(i=>`<a class="ske-digest-row" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><span class="ske-digest-tag member">${esc(i.member)}</span><strong>${esc(i.title)}</strong><span>›</span></a>`).join(''):empty('この日付のメンバーブログは見つかりませんでした。');
      externalNewsEl.innerHTML=d.externalNewsItems.length?d.externalNewsItems.map(i=>`<a class="ske-digest-row" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><span class="ske-digest-tag">${esc(i.source)}</span><strong>${esc(i.title)}</strong><span>›</span></a>`).join(''):empty('この日付の外部ニュースは見つかりませんでした。');
      youtubeEl.innerHTML=d.youtubeItems.length?d.youtubeItems.map(i=>`<a class="ske-digest-row" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><span class="ske-digest-tag">YouTube</span><strong>${esc(i.title)}</strong><span>›</span></a>`).join(''):empty('この日付の公式YouTube動画は見つかりませんでした。');
    }catch(e){console.error(e);summaryEl.innerHTML='<div class="posts-error">この日のSKE48まとめを読み込めませんでした。</div>';scheduleEl.innerHTML=newsEl.innerHTML=blogsEl.innerHTML=externalNewsEl.innerHTML=youtubeEl.innerHTML='';}
  } init();
})();