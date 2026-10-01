(() => {
  const list = document.getElementById('archiveList');
  const esc = v => String(v || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt = value => {
    const [y,m,d] = String(value || '').split('-');
    return y && m && d ? `${y}年${Number(m)}月${Number(d)}日` : value;
  };
  async function init() {
    try {
      const res = await fetch('/api/ske48/archive?limit=100', {cache:'no-store'});
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'archive failed');
      if (!data.items.length) {
        list.innerHTML = '<div class="ske-digest-empty">保存済みのまとめはまだありません。</div>';
        return;
      }
      list.innerHTML = data.items.map(item => `
        <a class="ske-archive-card" href="/ske48/yesterday.html?date=${encodeURIComponent(item.content_date)}">
          <div class="ske-archive-date">${esc(fmt(item.content_date))}</div>
          <h2>${esc(item.title)}</h2>
          <p>${esc(item.summary)}</p>
          <span class="ske-archive-more">この日のまとめを読む ›</span>
        </a>`).join('');
    } catch (e) {
      console.error(e);
      list.innerHTML = '<div class="posts-error">アーカイブを読み込めませんでした。</div>';
    }
  }
  init();
})();