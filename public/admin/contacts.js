const list = document.getElementById('contactList');
const statusBox = document.getElementById('contactAdminStatus');
const badge = document.getElementById('unreadBadge');
const showAll = document.getElementById('showAll');
const showUnread = document.getElementById('showUnread');
let unreadOnly = false;

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('X-CMS-Request', '1');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '処理に失敗しました。');
  return data;
}

function formatDate(value) {
  try { return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(`${String(value).replace(' ', 'T')}Z`)); }
  catch { return value || ''; }
}

function makeButton(text, onClick, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

function render(messages) {
  list.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'notice';
    empty.textContent = unreadOnly ? '未読のお問い合わせはありません。' : 'お問い合わせはまだありません。';
    list.append(empty);
    return;
  }
  for (const item of messages) {
    const card = document.createElement('article');
    card.className = `contact-message ${item.status === 'unread' ? 'unread' : ''}`;
    const head = document.createElement('div');
    head.className = 'contact-message-head';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = item.subject;
    const meta = document.createElement('div');
    meta.className = 'contact-meta';
    const name = item.name || '名前未入力';
    meta.textContent = `${name} / ${item.email} / ${formatDate(item.created_at)}`;
    titleWrap.append(title, meta);
    const state = document.createElement('span');
    state.className = 'contact-state';
    state.textContent = item.status === 'unread' ? '未読' : '既読';
    head.append(titleWrap, state);
    const body = document.createElement('div');
    body.className = 'contact-body';
    body.textContent = item.message;
    const actions = document.createElement('div');
    actions.className = 'contact-message-actions';
    const reply = document.createElement('a');
    reply.href = `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Re: ${item.subject}`)}`;
    reply.textContent = 'メールで返信';
    actions.append(reply);
    if (item.status === 'unread') actions.append(makeButton('既読にする', () => setStatus(item.id, 'read')));
    else actions.append(makeButton('未読に戻す', () => setStatus(item.id, 'unread')));
    actions.append(makeButton('削除', () => removeMessage(item.id), 'danger'));
    card.append(head, body, actions);
    list.append(card);
  }
}

async function load() {
  statusBox.textContent = '読み込み中…';
  try {
    const data = await api(`/api/admin/contacts${unreadOnly ? '?unread=1' : ''}`);
    badge.textContent = `${data.unreadCount || 0}件未読`;
    render(data.messages || []);
    statusBox.textContent = 'お問い合わせを読み込みました。';
  } catch (error) {
    statusBox.textContent = error.message;
  }
}

async function setStatus(id, action) {
  try {
    await api(`/api/admin/contacts/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
    await load();
  } catch (error) { alert(error.message); }
}

async function removeMessage(id) {
  if (!confirm('このお問い合わせを削除しますか？')) return;
  try {
    await api(`/api/admin/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load();
  } catch (error) { alert(error.message); }
}

showAll.addEventListener('click', () => { unreadOnly = false; showAll.classList.add('active'); showUnread.classList.remove('active'); load(); });
showUnread.addEventListener('click', () => { unreadOnly = true; showUnread.classList.add('active'); showAll.classList.remove('active'); load(); });
load();
