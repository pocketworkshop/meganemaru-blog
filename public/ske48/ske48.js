(() => {
  const cfg = window.SITE_CONFIG || {};
  const siteName = cfg.siteName || 'めがねまるのブログ';
  document.title = `SKE48 | ${siteName}`;

  const grid = document.getElementById('skePosts');
  const todayBox = document.querySelector('#today .ske-hub-placeholder');
  const yesterdayBox = document.querySelector('#yesterday .ske-hub-placeholder');

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');

  const formatDate = (value) => String(value || '').replaceAll('-', '.');
  const postKey = (post) => post.slug || post.id || '';

  const kindClass = (category) => ({
    '公演': 'stage',
    'リリース': 'release',
    'イベント': 'event',
    '握手会': 'meeting',
    'メディア': 'media',
    '誕生日': 'birthday',
    'その他': 'other'
  })[category] || 'other';

  const loadingHtml = (text) => `
    <div class="ske-schedule-loading">
      <span class="ske-schedule-spinner" aria-hidden="true"></span>
      <strong>${escapeHtml(text)}</strong>
    </div>`;

  async function loadTodaySchedule() {
    if (!todayBox) return;
    todayBox.innerHTML = loadingHtml('公式スケジュールを確認中...');

    try {
      const response = await fetch('/api/ske48/today', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'schedule fetch failed');

      const heading = `${data.month}月${data.day}日（${escapeHtml(data.weekday)}）`;
      if (!data.items?.length) {
        todayBox.innerHTML = `
          <div class="ske-schedule-date">${heading}</div>
          <strong>公式スケジュール上の予定は見つかりませんでした。</strong>
          <p>追加・変更される場合もあるので、公式ページもあわせて確認してください。</p>
          <a class="ske-official-link" href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">
            SKE48公式スケジュールを見る <span>›</span>
          </a>`;
        return;
      }

      todayBox.innerHTML = `
        <div class="ske-schedule-date">${heading}</div>
        <div class="ske-schedule-list">
          ${data.items.map(item => `
            <a class="ske-schedule-item" href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">
              <span class="ske-schedule-kind ${kindClass(item.category)}">${escapeHtml(item.category)}</span>
              <span class="ske-schedule-title">${escapeHtml(item.title)}</span>
              <span class="ske-schedule-arrow" aria-hidden="true">›</span>
            </a>
          `).join('')}
        </div>
        <div class="ske-schedule-source">
          <span>SKE48公式スケジュールから自動取得</span>
          <a href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">公式で確認 ↗</a>
        </div>`;
    } catch (error) {
      console.error(error);
      todayBox.innerHTML = `
        <strong>今日の予定を取得できませんでした。</strong>
        <p>一時的な通信エラーか、公式サイト側の表示変更の可能性があります。</p>
        <a class="ske-official-link" href="https://ske48.co.jp/schedule/list/" target="_blank" rel="noopener noreferrer">
          SKE48公式スケジュールを見る <span>›</span>
        </a>`;
    }
  }

  async function loadYesterdayDigest() {
    if (!yesterdayBox) return;
    yesterdayBox.innerHTML = loadingHtml('昨日の動きをまとめています...');

    try {
      const response = await fetch('/api/ske48/yesterday', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'yesterday digest failed');

      const heading = `${data.month}月${data.day}日（${escapeHtml(data.weekday)}）`;
      yesterdayBox.innerHTML = `
        <div class="ske-yesterday-date">${heading}</div>
        <strong>${escapeHtml(data.summary)}</strong>
        <div class="ske-yesterday-stats">
          <span><b>${data.counts.schedule}</b> 予定</span>
          <span><b>${data.counts.news}</b> 公式ニュース</span>
          <span><b>${data.counts.blogs}</b> メンバーブログ</span>
          <span><b>${data.counts.externalNews}</b> 外部ニュース</span>
          <span><b>${data.counts.youtube}</b> YouTube</span>
        </div>
        <a class="ske-yesterday-button" href="/ske48/yesterday.html">
          昨日のまとめを詳しく見る <span>›</span>
        </a>`;
    } catch (error) {
      console.error(error);
      yesterdayBox.innerHTML = `
        <strong>昨日のまとめを取得できませんでした。</strong>
        <p>取得先の一部が一時的に利用できない可能性があります。時間を置いてもう一度お試しください。</p>`;
    }
  }

  async function loadSkePosts() {
    if (!grid) return;
    try {
      const response = await fetch('/data/posts.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('posts.json could not be loaded');
      const posts = (await response.json())
        .filter(post => post.category === 'SKE48')
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 6);

      if (!posts.length) {
        grid.innerHTML = '<div class="blog-empty">SKE48の記事はまだありません。</div>';
        return;
      }

      grid.innerHTML = posts.map(post => `
        <a class="ske-hub-post-card" href="/blog/article.html?slug=${encodeURIComponent(postKey(post))}">
          <div class="ske-hub-post-mark"><span>SKE48</span><b>DAILY LOG</b></div>
          <div class="ske-hub-post-body">
            <div><span class="chip chip-ske">SKE48</span><time>${formatDate(post.date)}</time></div>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.summary)}</p>
          </div>
        </a>
      `).join('');
    } catch (error) {
      console.error(error);
      grid.innerHTML = '<div class="posts-error">SKE48の記事を読み込めませんでした。</div>';
    }
  }

  loadTodaySchedule();
  loadYesterdayDigest();
  loadSkePosts();
})();
