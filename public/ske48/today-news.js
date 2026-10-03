(() => {
  const todayBox = document.querySelector('#today .ske-hub-placeholder');
  if (!todayBox) return;

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  async function loadTodayNews() {
    try {
      const response = await fetch('/api/ske48/today-news', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) return;

      const section = document.createElement('div');
      section.className = 'ske-today-news';
      section.style.marginTop = '24px';
      section.style.paddingTop = '20px';
      section.style.borderTop = '1px dashed rgba(120,100,70,.22)';

      const items = Array.isArray(data.items) ? data.items : [];
      section.innerHTML = `
        <div style="font-weight:800;font-size:1.05rem;margin-bottom:12px;">公式ニュース</div>
        ${items.length ? `
          <div class="ske-schedule-list">
            ${items.map(item => `
              <a class="ske-schedule-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
                <span class="ske-schedule-kind event">${escapeHtml(item.category || 'ニュース')}</span>
                <span class="ske-schedule-title">${escapeHtml(item.title)}</span>
                <span class="ske-schedule-arrow" aria-hidden="true">›</span>
              </a>
            `).join('')}
          </div>` : `
          <p style="margin:0 0 10px;">本日の公式ニュースはありません。</p>
        `}
        <div class="ske-schedule-source">
          <span>SKE48公式NEWSから自動取得</span>
          <a href="${escapeHtml(data.sourceUrl || 'https://ske48.co.jp/news/29/')}" target="_blank" rel="noopener noreferrer">公式で確認 ↗</a>
        </div>`;

      todayBox.appendChild(section);
    } catch (error) {
      console.error('today official news:', error);
    }
  }

  // ske48.js が「今日の予定」を描画したあとに追加する。
  window.addEventListener('load', () => setTimeout(loadTodayNews, 150));
})();
