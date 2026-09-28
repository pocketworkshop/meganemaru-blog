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
})();
