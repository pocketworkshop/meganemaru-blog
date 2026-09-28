(() => {
  const cfg = window.SITE_CONFIG || {};
  const siteName = cfg.siteName || 'めがねまるのブログ';
  document.title = `SKE48 | ${siteName}`;

  const grid = document.getElementById('skePosts');
  if (!grid) return;

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');

  const formatDate = (value) => String(value || '').replaceAll('-', '.');
  const postKey = (post) => post.slug || post.id || '';

  async function init() {
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

  init();
})();
