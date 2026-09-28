(() => {
  const cfg = window.SITE_CONFIG || {};
  const siteName = cfg.siteName || 'めがねまるのブログ';
  document.title = `昨日のSKE48 | ${siteName}`;

  const dateEl = document.getElementById('digestDate');
  const summaryEl = document.getElementById('digestSummary');
  const scheduleEl = document.getElementById('digestSchedule');
  const newsEl = document.getElementById('digestNews');
  const blogsEl = document.getElementById('digestBlogs');

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');

  const kindClass = (category) => ({
    '公演': 'stage',
    'リリース': 'release',
    'イベント': 'event',
    '握手会': 'meeting',
    'メディア': 'media',
    '誕生日': 'birthday',
    'その他': 'other'
  })[category] || 'other';

  const empty = (text) => `<div class="ske-digest-empty">${escapeHtml(text)}</div>`;

  async function init() {
    try {
      const response = await fetch('/api/ske48/yesterday', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'digest failed');
      }

      dateEl.textContent = `${data.year}年${data.month}月${data.day}日（${data.weekday}）`;
      summaryEl.innerHTML = `
        <span class="ske-digest-summary-label">DAILY SUMMARY</span>
        <h2>${escapeHtml(data.summary)}</h2>
        <div class="ske-yesterday-stats">
          <span><b>${data.counts.schedule}</b> 予定</span>
          <span><b>${data.counts.news}</b> 公式ニュース</span>
          <span><b>${data.counts.blogs}</b> メンバーブログ</span>
        </div>`;

      scheduleEl.innerHTML = data.scheduleItems.length
        ? data.scheduleItems.map(item => `
          <a class="ske-digest-row" href="${escapeHtml(data.sources.schedule)}" target="_blank" rel="noopener noreferrer">
            <span class="ske-schedule-kind ${kindClass(item.category)}">${escapeHtml(item.category)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <span>›</span>
          </a>`).join('')
        : empty('公式スケジュール上の項目は見つかりませんでした。');

      newsEl.innerHTML = data.newsItems.length
        ? data.newsItems.map(item => `
          <a class="ske-digest-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ske-digest-tag">${escapeHtml(item.category)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <span>›</span>
          </a>`).join('')
        : empty('この日付の公式ニュースは見つかりませんでした。');

      blogsEl.innerHTML = data.blogItems.length
        ? data.blogItems.map(item => `
          <a class="ske-digest-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="ske-digest-tag member">${escapeHtml(item.member)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <span>›</span>
          </a>`).join('')
        : empty('この日付のメンバーブログは見つかりませんでした。');

    } catch (error) {
      console.error(error);
      summaryEl.innerHTML = `
        <div class="posts-error">昨日のSKE48を読み込めませんでした。</div>`;
      scheduleEl.innerHTML = '';
      newsEl.innerHTML = '';
      blogsEl.innerHTML = '';
    }
  }

  init();
})();
