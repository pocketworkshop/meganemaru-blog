import { authorize, requireMutation, readJson, fail, CmsError, secureResponse } from './cms/security.js';

let schemaReady = false;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) fail(503, 'お問い合わせ保存用D1を利用できません。');
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TEXT
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created
    ON contact_messages(status, created_at DESC)
  `).run();
  schemaReady = true;
}

function cleanText(value, max) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (text.length > max) fail(400, `入力が長すぎます（最大${max}文字）。`);
  return text;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function rateLimit(request, env) {
  if (!env.CMS_IMAGES) return;
  const ip = (request.headers.get('CF-Connecting-IP') || '').trim();
  if (!ip) return;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`contact:${ip}`));
  const key = `contact-rate:${[...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')}`;
  const existing = await env.CMS_IMAGES.get(key);
  if (existing) fail(429, '短時間に連続送信されています。1分ほど空けてからもう一度お試しください。');
  return async () => {
    try { await env.CMS_IMAGES.put(key, '1', { expirationTtl: 60 }); } catch {}
  };
}

async function submitContact(request, env) {
  if (request.method !== 'POST') fail(405, 'Method Not Allowed');
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin) fail(403, '送信元を確認できませんでした。');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') fail(403, '別サイトから送信できません。');

  const data = await readJson(request);
  if (cleanText(data.website, 200)) return json({ ok: true }, 201); // honeypot

  const name = cleanText(data.name, 80);
  const email = cleanText(data.email, 254).toLowerCase();
  const subject = cleanText(data.subject, 160);
  const message = cleanText(data.message, 5000);
  if (!validEmail(email)) fail(400, 'メールアドレスを確認してください。');
  if (!subject) fail(400, '件名を入力してください。');
  if (!message) fail(400, 'お問い合わせ内容を入力してください。');

  await ensureSchema(env);
  const markRate = await rateLimit(request, env);
  await env.DB.prepare(`
    INSERT INTO contact_messages (id, name, email, subject, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'unread', CURRENT_TIMESTAMP)
  `).bind(crypto.randomUUID(), name, email, subject, message).run();
  await markRate?.();
  return json({ ok: true }, 201);
}

async function adminContacts(request, env) {
  await authorize(request, env);
  if (!['GET', 'HEAD'].includes(request.method)) requireMutation(request);
  await ensureSchema(env);
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/admin/contacts' && ['GET', 'HEAD'].includes(request.method)) {
    const unreadOnly = url.searchParams.get('unread') === '1';
    const requested = Number(url.searchParams.get('limit') || 200);
    const limit = Number.isFinite(requested) ? Math.min(500, Math.max(1, Math.trunc(requested))) : 200;
    const where = unreadOnly ? "WHERE status='unread'" : '';
    const rows = await env.DB.prepare(`
      SELECT id, name, email, subject, message, status, created_at, read_at
      FROM contact_messages
      ${where}
      ORDER BY CASE status WHEN 'unread' THEN 0 ELSE 1 END, created_at DESC
      LIMIT ?
    `).bind(limit).all();
    const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM contact_messages WHERE status='unread'").first();
    const response = json({ messages: rows.results || [], unreadCount: Number(unread?.count || 0) });
    if (request.method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });
    return response;
  }

  const match = path.match(/^\/api\/admin\/contacts\/([^/]+)(?:\/(read|unread))?$/);
  if (!match) fail(404, 'お問い合わせAPIが見つかりません。');
  const id = match[1];
  const action = match[2] || '';

  if (request.method === 'POST' && action === 'read') {
    const result = await env.DB.prepare("UPDATE contact_messages SET status='read', read_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    if (!result.meta.changes) fail(404, 'お問い合わせが見つかりません。');
    return json({ ok: true });
  }
  if (request.method === 'POST' && action === 'unread') {
    const result = await env.DB.prepare("UPDATE contact_messages SET status='unread', read_at=NULL WHERE id=?").bind(id).run();
    if (!result.meta.changes) fail(404, 'お問い合わせが見つかりません。');
    return json({ ok: true });
  }
  if (request.method === 'DELETE' && !action) {
    const result = await env.DB.prepare('DELETE FROM contact_messages WHERE id=?').bind(id).run();
    if (!result.meta.changes) fail(404, 'お問い合わせが見つかりません。');
    return json({ ok: true });
  }
  fail(405, 'Method Not Allowed');
}

export async function handleContact(request, env) {
  const path = new URL(request.url).pathname;
  if (path !== '/api/contact' && !path.startsWith('/api/admin/contacts')) return null;
  const admin = path.startsWith('/api/admin/contacts');
  try {
    const response = admin ? await adminContacts(request, env) : await submitContact(request, env);
    return admin ? secureResponse(response, true) : response;
  } catch (error) {
    if (!(error instanceof CmsError)) console.error('Contact failure', error);
    const status = error instanceof CmsError ? error.status : 503;
    const message = error instanceof CmsError ? error.message : 'お問い合わせの処理に失敗しました。';
    const response = json({ error: message }, status);
    return admin ? secureResponse(response, true) : response;
  }
}
