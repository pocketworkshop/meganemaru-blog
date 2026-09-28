(() => {
  const cfg = window.SITE_CONFIG || {};
  const siteName = cfg.siteName || 'めがねまるのブログ';
  const tagline = cfg.tagline || '好きなことで、毎日をちょっと楽しく。';
  document.title = siteName;
  document.querySelectorAll('.js-site-name').forEach(el => el.textContent = siteName);
  document.querySelectorAll('.js-tagline').forEach(el => el.textContent = tagline);

  const button = document.getElementById('menuButton');
  const nav = document.getElementById('mainNav');
  button?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? '×' : '☰';
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    button?.setAttribute('aria-expanded', 'false');
    if (button) button.textContent = '☰';
  }));

  const categoryClass = (category) => ({
    'SKE48': 'ske',
    '競馬': 'keiba',
    'ゲーム': 'game',
    '便利ツール': 'tool',
    '雑記': 'note'
  })[category] || 'note';

  const formatDate = (date) => String(date || '').replaceAll('-', '.');

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  async function loadLatestPosts() {
    const grid = document.getElementById('latestPosts');
    if (!grid) return;
    try {
      const response = await fetch('/data/posts.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('posts.json could not be loaded');
      const posts = await response.json();
      const latest = [...posts]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 3);

      grid.innerHTML = latest.map(post => {
        const theme = categoryClass(post.category);
        return `
          <a class="article-card article-card-link" href="/blog/article.html?slug=${encodeURIComponent(post.slug)}">
            <div class="thumb thumb-${theme}"><span>${escapeHtml(post.category)}</span><b>${theme === 'ske' ? 'DAILY LOG' : theme === 'tool' ? 'WEB TOOL' : 'BLOG NOTE'}</b></div>
            <div class="article-body">
              <span class="chip chip-${theme}">${escapeHtml(post.category)}</span>
              <time>${formatDate(post.date)}</time>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.summary)}</p>
            </div>
          </a>`;
      }).join('');
    } catch (error) {
      grid.innerHTML = '<div class="posts-error">最新記事を読み込めませんでした。</div>';
      console.error(error);
    }
  }

  loadLatestPosts();
})();
