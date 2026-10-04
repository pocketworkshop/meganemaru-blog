(() => {
  const list = document.getElementById('blogList');
  const filters = document.getElementById('categoryFilters');
  const search = document.getElementById('postSearch');
  if (!list || !filters || !search) return;

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

  const label = (theme) => theme === 'ske' ? 'DAILY LOG' : theme === 'keiba' ? 'RACE NOTE' : theme === 'stock' ? 'STOCK NOTE' : theme === 'game' ? 'PLAY LOG' : theme === 'tool' ? 'WEB TOOL' : 'BLOG NOTE';
  const escapeHtml = (value) => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const formatDate = (value) => String(value || '').replaceAll('-', '.');
  const postKey = (post) => post.slug || post.id || '';

  let posts = [];
  let activeCategory = new URLSearchParams(location.search).get('category') || 'すべて';

  function renderFilters() {
    const categories = ['すべて', ...new Set(posts.map(post => post.category))];
    if (!categories.includes(activeCategory)) activeCategory = 'すべて';
    filters.innerHTML = categories.map(category => `<button class="filter-button${category === activeCategory ? ' active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
    filters.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      activeCategory = button.dataset.category || 'すべて';
      const url = new URL(location.href);
      if (activeCategory === 'すべて') url.searchParams.delete('category'); else url.searchParams.set('category', activeCategory);
      history.replaceState(null, '', url);
      renderFilters();
      renderPosts();
    }));
  }

  function updateKeibaTool() {
    const tool = document.getElementById('keibaTool');
    if (tool) tool.hidden = activeCategory !== '競馬';
  }
  updateKeibaTool();

  function renderPosts() {
    updateKeibaTool();
    const term = search.value.trim().toLowerCase();
    const filtered = posts.filter(post => {
      const categoryOk = activeCategory === 'すべて' || post.category === activeCategory;
      const haystack = `${post.title} ${post.summary} ${post.category}`.toLowerCase();
      return categoryOk && (!term || haystack.includes(term));
    }).sort((a,b) => {
      if (activeCategory !== 'すべて') {
        const aPinned = a.theme === '__category_pinned__' ? 1 : 0;
        const bPinned = b.theme === '__category_pinned__' ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
      }
      return String(b.date).localeCompare(String(a.date));
    });

    if (!filtered.length) {
      list.innerHTML = '<div class="blog-empty">条件に合う記事はありません。</div>';
      return;
    }

    list.innerHTML = filtered.map(post => {
      const theme = categoryClass(post.category);
      const key = postKey(post);
      return `<a class="blog-card" href="/blog/article.html?slug=${encodeURIComponent(key)}">
        <div class="thumb thumb-${theme}"><span>${escapeHtml(post.category)}</span><b>${label(theme)}</b></div>
        <div class="article-body">
          <span class="chip chip-${theme}">${escapeHtml(post.category)}</span><time>${formatDate(post.date)}</time>
          <h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.summary)}</p>
        </div>
      </a>`;
    }).join('');
  }

  async function init() {
    try {
      const response = await fetch('/data/posts.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('posts.json could not be loaded');
      posts = (await response.json()).sort((a,b) => String(b.date).localeCompare(String(a.date)));
      renderFilters();
      renderPosts();
      search.addEventListener('input', renderPosts);
    } catch (error) {
      list.innerHTML = '<div class="posts-error">記事を読み込めませんでした。</div>';
      console.error(error);
    }
  }
  init();
})();