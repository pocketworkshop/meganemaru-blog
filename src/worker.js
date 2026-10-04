import app from './index.js';
import { publicPosts } from './cms/cms.js';
import { handleHandshake, refreshHandshakeSchedules } from './handshake/schedule.mjs';
import { handleContact } from './contact.js';

const TYPE = 'ske48_yesterday';
const TODAY_CACHE_SECONDS = 6 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const contactResponse = await handleContact(request, env);
    if (contactResponse) return contactResponse;
    const handshakeResponse = await handleHandshake(request, env, ctx);
    if (handshakeResponse) return handshakeResponse;
    const url = new URL(request.url);

    if (url.pathname === '/robots.txt') {
      return robotsTxt(request);
    }
    if (url.pathname === '/sitemap.xml') {
      return sitemapXml(request, env);
    }
    if (url.pathname === '/api/ske48/today') {
      return cachedToday(request, env, ctx);
    }
    if (url.pathname === '/api/ske48/today-news') {
      return cachedTodayNews(request, ctx);
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

function robotsTxt(request) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const origin = new URL(request.url).origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function sitemapXml(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const origin = new URL(request.url).origin;
  const staticUrls = [
    `${origin}/`,
    `${origin}/blog/`,
    `${origin}/about/`,
    `${origin}/privacy/`,
    `${origin}/terms/`,
    `${origin}/contact/`,
    `${origin}/ske48/`,
    `${origin}/tools/conversation-report/`,
    `${origin}/tools/handshake-manager/`,
    `${origin}/tools/umamikuji/`,
  ];

  const posts = await publicPosts(request, env);
  const articleUrls = posts.map(post => ({
    loc: `${origin}/blog/article.html?slug=${encodeURIComponent(post.slug || post.id)}`,
    lastmod: normalizeLastmod(post.updatedAt || post.date),
  }));

  const rows = [
    ...staticUrls.map(loc => ({ loc })),
    ...articleUrls,
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows.map(({ loc, lastmod }) => [
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : '',
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(request.method === 'HEAD' ? null : xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeLastmod(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function cachedToday(request, env, ctx) {
  if (request.method !== 'GET') return app.fetch(request, env, ctx);

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const dateKey = `${p.year}-${p.month}-${p.day}`;

  // 日付ごとの外側キャッシュ。v=2 で旧キャッシュを無効化。
  const origin = new URL(request.url).origin;
  const cacheKey = new Request(
    `${origin}/api/ske48/today-cache?date=${encodeURIComponent(dateKey)}&v=2`,
    { method: 'GET' }
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await app.fetch(request, env, ctx);
  if (!response.ok) return response;

  // src/index.js が返す予定一覧に、公式スケジュール詳細URLを補完する。
  // 公式サイトへの追加アクセスも外側6時間キャッシュの更新時だけ。
  const enriched = await enrichTodayScheduleUrls(response);
  const stored = new Response(enriched.body, enriched);
  stored.headers.set('Cache-Control', `public, max-age=${TODAY_CACHE_SECONDS}`);
  ctx.waitUntil(cache.put(cacheKey, stored.clone()));
  return stored;
}

async function enrichTodayScheduleUrls(response) {
  try {
    const payload = await response.clone().json();
    if (!payload?.ok || !Array.isArray(payload.items) || !payload.items.length || !payload.sourceUrl) {
      return response;
    }

    const official = await fetch(payload.sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      },
    });
    if (!official.ok) return response;

    const html = await official.text();
    const links = extractScheduleDetailLinks(html, payload.sourceUrl);
    if (!links.length) return response;

    payload.items = payload.items.map(item => {
      const title = normalizeForMatch(item.title);
      if (!title) return item;

      const match = links.find(link => {
        const text = normalizeForMatch(link.text);
        return text === title || text.includes(title) || title.includes(text);
      });

      return match ? { ...item, url: match.url } : item;
    });

    payload.linkParserVersion = 1;

    const headers = new Headers(response.headers);
    return new Response(JSON.stringify(payload, null, 2), {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error('SKE48 schedule detail URL enrichment failed:', error);
    return response;
  }
}

function extractScheduleDetailLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = pattern.exec(String(html))) !== null) {
    try {
      const url = new URL(decodeHtml(match[2]), baseUrl);
      if (url.origin !== 'https://ske48.co.jp') continue;
      if (!/^\/schedule\/detail\/\d+\/?$/.test(url.pathname)) continue;

      const text = htmlToText(match[3]);
      if (!text) continue;

      links.push({
        text,
        url: `${url.origin}${url.pathname.replace(/\/$/, '')}`,
      });
    } catch {
      // 不正なURLは無視。
    }
  }

  return links;
}

function htmlToText(value) {
  return normalizeSpace(
    decodeHtml(
      String(value)
        .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

function normalizeForMatch(value) {
  return normalizeSpace(value)
    .replace(/[「」『』【】（）()[\]<>〈〉《》"'’“”!?！？・:：,，.。]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '')
    .replace(/&([a-zA-Z]+);/g, (all, name) => named[name] ?? all)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}


async function cachedTodayNews(request, ctx) {
  if (request.method !== 'GET') return json({ok:false,error:'Method Not Allowed'},405);

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const dateKey = `${p.year}-${p.month}-${p.day}`;
  const dottedDate = `${p.year}.${p.month}.${p.day}`;

  const origin = new URL(request.url).origin;
  const cacheKey = new Request(
    `${origin}/api/ske48/today-news-cache?date=${encodeURIComponent(dateKey)}&v=1`,
    { method: 'GET' }
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const result = await fetchTodayOfficialNews(dottedDate);
    const response = json({
      ok: true,
      date: dateKey,
      items: result.items,
      sourceUrl: result.sourceUrl,
      fetchedAt: new Date().toISOString()
    }, 200, {'Cache-Control': `public, max-age=${TODAY_CACHE_SECONDS}`});

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('SKE48 today news failed:', error);
    return json({ok:false,error:'今日の公式ニュースを取得できませんでした。'},502);
  }
}

async function fetchTodayOfficialNews(dottedDate) {
  const sourceUrl = 'https://ske48.co.jp/news/29/';
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`official news HTTP ${response.status}`);

  const html = await response.text();
  const items = [];
  const liPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let li;

  while ((li = liPattern.exec(html)) !== null) {
    const block = li[1];
    if (!block.includes(dottedDate)) continue;

    const anchor = block.match(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;

    let url;
    try { url = new URL(decodeHtml(anchor[2]), sourceUrl); }
    catch { continue; }
    if (url.origin !== 'https://ske48.co.jp' || !url.pathname.startsWith('/news/detail/')) continue;

    const titleMatch = block.match(/<p\b[^>]*class\s*=\s*(["'])[^"']*\btit\b[^"']*\1[^>]*>([\s\S]*?)<\/p>/i);
    const catMatch = block.match(/<[^>]*class\s*=\s*(["'])[^"']*\bcat\b[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i);

    const title = htmlToText(titleMatch ? titleMatch[2] : anchor[3]);
    const category = htmlToText(catMatch ? catMatch[2] : '') || '公式ニュース';
    if (!title) continue;

    items.push({
      category,
      title,
      url: `${url.origin}${url.pathname}${url.search}`
    });
  }

  const seen = new Set();
  return {
    sourceUrl,
    items: items.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
  };
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
