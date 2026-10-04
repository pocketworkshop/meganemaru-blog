(() => {
  const cfg = window.SITE_CONFIG || {};
  const siteName = cfg.siteName || 'めがねまるのブログ';
  const tagline = cfg.tagline || '好きなことで、毎日をちょっと楽しく。';
  if (!document.body.hasAttribute('data-preserve-title') && !document.getElementById('articleRoot')?.hasAttribute('data-server-rendered')) document.title = siteName;
  document.querySelectorAll('.js-site-name').forEach(el => el.textContent = siteName);
  document.querySelectorAll('.js-tagline').forEach(el => el.textContent = tagline);

  // Latest-post cards: styles.css の後段にある .article-card-link{display:block}
  // がスマホ用の横並び指定を上書きするため、トップページだけ意図した配置へ戻す。
  const latestCardFix = document.createElement('style');
  latestCardFix.textContent = `
    @media (max-width:800px){
      #latestPosts .article-card.article-card-link{
        display:grid;
        grid-template-columns:125px minmax(0,1fr);
      }
      #latestPosts .article-card .thumb{
        height:100%;
        min-height:125px;
      }
    }
    @media (max-width:450px){
      #latestPosts .article-card.article-card-link{
        grid-template-columns:105px minmax(0,1fr);
      }
    }
  `;
  document.head.appendChild(latestCardFix);

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

  const stockCategoryStyle=document.createElement('style');
  stockCategoryStyle.textContent='.thumb-stock{background:linear-gradient(135deg,#2f80ed,#1858b8)}.chip-stock{background:#e5f0ff;color:#1d62b7}.stock-bg{background:#e5f0ff;color:#1d62b7}';
  document.head.appendChild(stockCategoryStyle);
  
  const categoryClass = (category) => ({
    'SKE48': 'ske',
    '競馬': 'keiba',
    '株': 'stock',
    'ゲーム': 'game',
    '便利ツール': 'tool',
    '雑記': 'note'
  })[category] || 'note';

  const formatDate = (date) => String(date || '').replaceAll('-', '.');
  const escapeHtml = (value) => String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const postKey = (post) => post.slug || post.id || '';
  const label = (theme) => theme === 'ske' ? 'DAILY LOG' : theme === 'keiba' ? 'RACE NOTE' : theme === 'stock' ? 'STOCK NOTE' : theme === 'game' ? 'PLAY LOG' : theme === 'tool' ? 'WEB TOOL' : 'BLOG NOTE';

  async function loadLatestPosts() {
    const grid = document.getElementById('latestPosts');
    if (!grid) return;
    try {
      const response = await fetch('/data/posts.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('posts.json could not be loaded');
      const posts = await response.json();
      const latest = [...posts].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,3);
      grid.innerHTML = latest.map(post => {
        const theme = categoryClass(post.category);
        const key = postKey(post);
        return `
          <a class="article-card article-card-link" href="/blog/article.html?slug=${encodeURIComponent(key)}">
            <div class="thumb thumb-${theme}"><span>${escapeHtml(post.category)}</span><b>${label(theme)}</b></div>
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