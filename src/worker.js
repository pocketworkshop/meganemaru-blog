import app from './index.js';
import { handleHandshake, refreshHandshakeSchedules } from './handshake/schedule.mjs';

const TYPE = 'ske48_yesterday';
const TODAY_CACHE_SECONDS = 6 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const handshakeResponse = await handleHandshake(request, env, ctx);
    if (handshakeResponse) return handshakeResponse;
    const url = new URL(request.url);

    if (url.pathname === '/api/ske48/today') {
      return cachedToday(request, env, ctx);
    }
    if (url.pathname === '/api/ske48/archive') {
      return archiveList(request, env);
    }
    if (url.pathname === '/api/ske48/archive/day') {
      return archiveDay(request, env);
    }

    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(saveYesterday(env, ctx));
    ctx.waitUntil(refreshHandshakeSchedules(env));
  },
};

async function cachedToday(request, env, ctx) {
  if (request.method !== 'GET') return app.fetch(request, env, ctx);

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const dateKey = `${p.year}-${p.month}-${p.day}`;

  // 日付ごとの外側キャッシュ。閲覧者が増えても、通常は6時間に1回だけ
  // 既存の /api/ske48/today 処理まで到達する。
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(
    `${origin}/api/ske48/today-cache?date=${encodeURIComponent(dateKey)}&v=1`,
    { method: 'GET' }
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await app.fetch(request, env, ctx);
  if (!response.ok) return response;

  const stored = new Response(response.body, response);
  stored.headers.set('Cache-Control', `public, max-age=${TODAY_CACHE_SECONDS}`);
  ctx.waitUntil(cache.put(cacheKey, stored.clone()));
  return stored;
}

async function saveYesterday(env, ctx) {
  if (!env.DB) throw new Error('D1 binding DB is not available.');

  const request = new Request('https://meganemaru.internal/api/ske48/yesterday', {
    method: 'GET',
  });
  const response = await app.fetch(request, env, ctx);
  if (!response.ok) {
    throw new Error(`Yesterday digest failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.ok || !payload.date) {
    throw new Error('Yesterday digest payload is invalid.');
  }

  const title = `${payload.year}年${payload.month}月${payload.day}日のSKE48まとめ`;

  await env.DB.prepare(`
    INSERT INTO daily_contents
      (content_type, content_date, title, summary, content_json, status, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(content_type, content_date) DO UPDATE SET
      title=excluded.title,
      summary=excluded.summary,
      content_json=excluded.content_json,
      status='published',
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    TYPE,
    payload.date,
    title,
    payload.summary || '',
    JSON.stringify(payload)
  ).run();

  console.log('SKE48 daily digest saved to D1:', payload.date);
}

async function archiveList(request, env) {
  if (request.method !== 'GET') return json({ok:false,error:'Method Not Allowed'},405);
  if (!env.DB) return json({ok:false,error:'D1を利用できません。'},503);

  const url = new URL(request.url);
  const n = Number(url.searchParams.get('limit') || 100);
  const limit = Number.isFinite(n) ? Math.min(365, Math.max(1, Math.trunc(n))) : 100;

  try {
    const result = await env.DB.prepare(`
      SELECT content_date, title, summary, updated_at
      FROM daily_contents
      WHERE content_type=? AND status='published'
      ORDER BY content_date DESC
      LIMIT ?
    `).bind(TYPE, limit).all();

    return json({ok:true,items:result.results || []},200,{
      'Cache-Control':'public, max-age=60'
    });
  } catch (error) {
    console.error('SKE48 archive list failed:', error);
    return json({ok:false,error:'アーカイブを読み込めませんでした。'},500);
  }
}

async function archiveDay(request, env) {
  if (request.method !== 'GET') return json({ok:false,error:'Method Not Allowed'},405);
  if (!env.DB) return json({ok:false,error:'D1を利用できません。'},503);

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ok:false,error:'日付が不正です。'},400);
  }

  try {
    const row = await env.DB.prepare(`
      SELECT content_json
      FROM daily_contents
      WHERE content_type=? AND content_date=? AND status='published'
      LIMIT 1
    `).bind(TYPE, date).first();

    if (!row) return json({ok:false,error:'この日のまとめは保存されていません。'},404);

    let payload;
    try { payload = JSON.parse(row.content_json); }
    catch { return json({ok:false,error:'保存データを読み込めませんでした。'},500); }

    return json(payload,200,{'Cache-Control':'public, max-age=300'});
  } catch (error) {
    console.error('SKE48 archive day failed:', error);
    return json({ok:false,error:'この日のまとめを読み込めませんでした。'},500);
  }
}

function json(data,status=200,extraHeaders={}) {
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'X-Content-Type-Options':'nosniff',
      ...extraHeaders,
    },
  });
}
