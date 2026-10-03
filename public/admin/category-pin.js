(() => {
  const PIN_THEME = '__category_pinned__';
  const nativeFetch = window.fetch.bind(window);
  let pinBox = null;

  function ensurePinBox() {
    if (pinBox) return pinBox;
    const summary = document.getElementById('summary');
    if (!summary) return null;
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;';
    label.innerHTML = '<input id="categoryPinned" type="checkbox" style="width:auto;margin-top:3px"><span><strong>カテゴリ上部に固定</strong><small style="display:block;margin-top:3px;color:#666">このカテゴリーの記事一覧で常に先頭へ表示します。固定できる記事は各カテゴリー1件です。</small></span>';
    const summaryLabel = summary.closest('label');
    summaryLabel.insertAdjacentElement('afterend', label);
    pinBox = document.getElementById('categoryPinned');
    pinBox.addEventListener('change', () => {
      const saveState = document.getElementById('saveState');
      if (saveState) saveState.textContent = '未保存';
    });
    return pinBox;
  }

  function setPin(value) {
    const box = ensurePinBox();
    if (box) box.checked = !!value;
  }

  async function unpinOthers(savedPost) {
    if (!savedPost || savedPost.theme !== PIN_THEME) return;
    const response = await nativeFetch('/api/admin/posts', {credentials:'same-origin', cache:'no-store'});
    if (!response.ok) return;
    const data = await response.json();
    const others = (data.posts || []).filter(post =>
      post.id !== savedPost.id &&
      post.category === savedPost.category &&
      post.theme === PIN_THEME
    );
    for (const post of others) {
      await nativeFetch(`/api/admin/posts/${encodeURIComponent(post.id)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {'Content-Type':'application/json','X-CMS-Request':'1'},
        body: JSON.stringify({
          title: post.title,
          slug: post.slug,
          category: post.category,
          date: post.date,
          summary: post.summary || '',
          bodyHtml: post.bodyHtml || '<p></p>',
          theme: '',
          version: post.version,
          status: post.status === 'published' ? 'published' : 'draft'
        })
      });
    }
  }

  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || 'GET').toUpperCase();
    let nextInit = init;

    if (/^\/api\/admin\/posts(?:\/[^/]+)?$/.test(url) && ['POST','PUT'].includes(method) && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        const box = ensurePinBox();
        body.theme = box?.checked ? PIN_THEME : '';
        nextInit = {...init, body: JSON.stringify(body)};
      } catch {}
    }

    const response = await nativeFetch(input, nextInit);

    if (response.ok && method === 'GET' && /^\/api\/admin\/posts\/[^/]+$/.test(url)) {
      response.clone().json().then(data => setTimeout(() => setPin(data.post?.theme === PIN_THEME), 0)).catch(() => {});
    }

    if (response.ok && ['POST','PUT'].includes(method) && /^\/api\/admin\/posts(?:\/[^/]+)?$/.test(url)) {
      response.clone().json().then(data => unpinOthers(data.post)).catch(() => {});
    }

    return response;
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensurePinBox();
    document.getElementById('newPost')?.addEventListener('click', () => setTimeout(() => setPin(false), 0));
  });
})();
