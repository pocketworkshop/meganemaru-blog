(() => {
  const root = document.getElementById('articleRoot');
  if (!root) return;

  const categoryClass = (category) => ({
    'SKE48': 'ske',
    '競馬': 'keiba',
    'ゲーム': 'game',
    '便利ツール': 'tool',
    '雑記': 'note'
  })[category] || 'note';
  const escapeHtml = (value) => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const formatDate = (value) => String(value || '').replaceAll('-', '.');

  async function init() {
    const slug = new URLSearchParams(location.search).get('slug');
    if (!slug) return showNotFound();
    try {
      const response = await fetch('/data/posts.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('posts.json could not be loaded');
      const posts = await response.json();
      const post = posts.find(item => item.slug === slug || item.id === slug);
      if (!post) return showNotFound();

      const theme = categoryClass(post.category);
      document.title = `${post.title} | めがねまるのブログ`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', post.summary || '');
      root.innerHTML = `
        <article>
          <header class="article-header">
            <a class="back-link" href="/blog/">‹ 記事一覧へ戻る</a>
            <div class="article-meta"><span class="chip chip-${theme}">${escapeHtml(post.category)}</span><time>${formatDate(post.date)}</time></div>
            <h1>${escapeHtml(post.title)}</h1>
            <p class="article-lead">${escapeHtml(post.summary)}</p>
          </header>
          <div class="article-prose">${post.bodyHtml || ''}</div>
        </article>`;
    } catch (error) {
      console.error(error);
      showNotFound('記事を読み込めませんでした。');
    }
  }

  function showNotFound(message = '記事が見つかりませんでした。') {
    root.innerHTML = `<div class="article-not-found"><h1>${escapeHtml(message)}</h1><a href="/blog/">記事一覧へ戻る</a></div>`;
  }

  init();
})();
