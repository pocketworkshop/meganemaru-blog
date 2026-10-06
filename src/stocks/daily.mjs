import { STOCK_CRONS, jstDate, calendarState } from './calendar.mjs';
import { fetchMarketNews, mergeNews, rssUrls, parseRss, analyzeNews } from './news.mjs';
import { DAILY_KIND, postKey, buildPost } from './render.mjs';
import { authorize, CmsError, cleanHtml } from '../cms/security.js';
import { legacyPosts } from '../cms/cms.js';

const statement = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const readExtra = row => JSON.parse(row?.extra_json || '{}');

function ownership(row, extra) {
  return extra.marketDaily?.kind === DAILY_KIND &&
    extra.marketDaily.generatedVersion === row.version &&
    row.status === 'published';
}

export async function storeSnapshot(env, snapshot, legacy = []) {
  const date = snapshot.date, key = postKey(date), phase = snapshot.phase;

  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await statement(
      env,
      'SELECT * FROM cms_posts WHERE id=? OR slug=? LIMIT 1',
      key,
      key
    ).first();

    const extra = readExtra(row);

    if (row && !ownership(row, extra)) {
      return { state: 'manual_override', date, phase };
    }

    snapshot = mergeNews(extra.marketDaily?.sessions?.[phase], snapshot);

    if (
      row &&
      extra.marketDaily.sessions?.[phase]?.fingerprint === snapshot.fingerprint
    ) {
      return { state: 'already_saved', date, phase };
    }

    if (!row) {
      const tombstone = await statement(
        env,
        'SELECT key FROM cms_keys WHERE key=?',
        key
      ).first();

      if (tombstone || legacy.some(p => p.id === key || p.slug === key)) {
        return { state: 'key_reserved', date, phase };
      }
    }

    const sessions = {
      ...(extra.marketDaily?.sessions || {}),
      [phase]: snapshot,
    };

    const post = buildPost(date, sessions);
    const stamp = snapshot.fetchedAt;
    const token = crypto.randomUUID();
    const version = row ? row.version + 1 : 1;

    const nextExtra = {
      ...extra,
      marketDaily: {
        kind: DAILY_KIND,
        date,
        sessions,
        generatedVersion: version,
      },
    };

    const batch = row
      ? [
          statement(
            env,
            `UPDATE cms_posts
             SET title=?,category=?,date=?,summary=?,theme=?,body_html=?,
                 extra_json=?,updated_at=?,mutation_token=?,version=version+1
             WHERE id=? AND version=? AND status='published'`,
            post.title,
            post.category,
            post.date,
            post.summary,
            post.theme,
            cleanHtml(post.bodyHtml),
            JSON.stringify(nextExtra),
            stamp,
            token,
            row.id,
            row.version
          ),
          statement(
            env,
            `INSERT INTO cms_meta(key,value)
             SELECT 'stock_daily_concurrent_guard',NULL
             WHERE NOT EXISTS(
               SELECT 1 FROM cms_posts
               WHERE id=? AND version=? AND mutation_token=?
             )`,
            row.id,
            version,
            token
          ),
        ]
      : [
          statement(
            env,
            `INSERT INTO cms_posts(
               id,slug,title,category,date,summary,theme,body_html,extra_json,
               status,created_at,updated_at,mutation_token
             ) VALUES(?,?,?,?,?,?,?,?,?,'published',?,?,?)`,
            key,
            key,
            post.title,
            post.category,
            post.date,
            post.summary,
            post.theme,
            cleanHtml(post.bodyHtml),
            JSON.stringify(nextExtra),
            stamp,
            stamp,
            token
          ),
          statement(
            env,
            'INSERT INTO cms_keys(key,post_id) VALUES(?,?)',
            key,
            key
          ),
        ];

    try {
      await env.DB.batch(batch);
      return {
        state: 'saved',
        date,
        phase,
        warnings: snapshot.warnings,
        postKey: key,
      };
    } catch (error) {
      if (!/UNIQUE|NOT NULL|CHECK/.test(String(error)) || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error('concurrent_update');
}

async function logRun(env, result, now) {
  const value = { ...result, at: now.toISOString() };
  console.log('stock_daily', JSON.stringify(value));

  if (env.DB && result.phase && result.state !== 'disabled') {
    try {
      await statement(
        env,
        `INSERT INTO cms_meta(key,value)
         VALUES(?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        `stock_daily:last:${result.phase}`,
        JSON.stringify(value)
      ).run();
    } catch {
      console.error('stock_daily_status_write_failed');
    }
  }

  return value;
}

export async function runStockCron(controller, env, options = {}) {
  const phase = STOCK_CRONS[controller.cron];
  if (!phase) return { state: 'unrelated_cron' };

  const now = options.now || new Date();
  const date = jstDate(controller.scheduledTime);
  const result = async value => logRun(env, { date, phase, ...value }, now);

  if (env.STOCK_DAILY_ENABLED !== 'true') {
    return result({ state: 'disabled' });
  }

  const age = now.getTime() - Number(controller.scheduledTime);
  if (
    jstDate(now) !== date ||
    age < -60000 ||
    age > 40 * 60000
  ) {
    return result({ state: 'stale_invocation' });
  }

  const calendar = calendarState(date);

  if (calendar === 'closed') {
    return result({ state: 'closed_calendar' });
  }

  if (calendar === 'unknown') {
    return result({ state: 'calendar_unverified' });
  }

  if (!env.DB) {
    return result({ state: 'database_missing' });
  }

  try {
    const key = postKey(date);
    const row = await statement(
      env,
      'SELECT * FROM cms_posts WHERE id=? OR slug=? LIMIT 1',
      key,
      key
    ).first();

    if (row) {
      const extra = readExtra(row);
      if (!ownership(row, extra)) {
        return result({ state: 'manual_override' });
      }
    } else if (
      await statement(
        env,
        'SELECT key FROM cms_keys WHERE key=?',
        key
      ).first()
    ) {
      return result({ state: 'key_reserved' });
    }

    const snapshot = await fetchMarketNews(
      date,
      phase,
      now,
      options.fetcher || fetch
    );

    if (!snapshot) {
      return result({ state: 'no_current_news' });
    }

    const legacy = row
      ? []
      : await legacyPosts(
          new Request('https://meganemaru.internal/data/posts.json'),
          env
        );

    return result(await storeSnapshot(env, snapshot, legacy));
  } catch (error) {
    const reason =
      String(error?.message || '').match(/^(news_[a-z0-9_]+)$/)?.[0] ||
      'fetch_or_storage_failed';

    return result({ state: 'failed', reason });
  }
}

async function debugStockNews(request) {
  const url = new URL(request.url);
  const phase = url.searchParams.get('phase') === 'close' ? 'close' : 'morning';
  const now = new Date();
  const date = url.searchParams.get('date') || jstDate(now);

  const feeds = [];
  const allItems = [];

  for (const feedUrl of rssUrls(phase)) {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          Accept:
            'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (compatible; MeganemaruBlog/1.0; +https://meganemaru-blog.pwtools.workers.dev/)',
        },
        signal: AbortSignal.timeout(8000),
      });

      const xml = response.ok ? await response.text() : '';
      let items = [];
      let parseError = '';

      if (response.ok) {
        try {
          items = parseRss(xml);
        } catch (error) {
          parseError = String(error?.message || error);
        }
      }

      allItems.push(...items);

      feeds.push({
        ok: response.ok,
        status: response.status,
        finalUrl: response.url,
        contentType: response.headers.get('Content-Type') || '',
        parsedItems: items.length,
        parseError,
        items: items.slice(0, 12).map(item => ({
          title: item.title,
          publishedAt: item.publishedAt,
          jstDate: jstDate(item.publishedAt),
          source: item.source,
          host: (() => {
            try { return new URL(item.url).hostname; }
            catch { return ''; }
          })(),
          url: item.url,
        })),
      });
    } catch (error) {
      feeds.push({
        ok: false,
        error: String(error?.message || error),
        parsedItems: 0,
        items: [],
      });
    }
  }

  let snapshot = null;
  let analyzeError = '';

  try {
    snapshot = analyzeNews(allItems, { date, phase, now });
  } catch (error) {
    analyzeError = String(error?.message || error);
  }

  return {
    date,
    phase,
    now: now.toISOString(),
    feedCount: feeds.length,
    totalParsedItems: allItems.length,
    analyzed: Boolean(snapshot),
    analyzeError,
    snapshot,
    feeds,
  };
}

export async function handleStockStatus(request, env) {
  const pathname = new URL(request.url).pathname;

  if (
    pathname !== '/api/admin/stock-daily/status' &&
    pathname !== '/api/admin/stock-daily/debug'
  ) {
    return null;
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });

  try {
    await authorize(request, env);

    if (request.method !== 'GET') {
      return json({ error: 'Method Not Allowed' }, 405);
    }

    if (pathname === '/api/admin/stock-daily/debug') {
      return json(await debugStockNews(request));
    }

    const runs = {};

    if (env.DB) {
      for (const phase of ['morning', 'close']) {
        const row = await statement(
          env,
          'SELECT value FROM cms_meta WHERE key=?',
          `stock_daily:last:${phase}`
        ).first();

        runs[phase] = row ? JSON.parse(row.value) : null;
      }
    }

    return json({
      enabled: env.STOCK_DAILY_ENABLED === 'true',
      source: 'Bing News RSS',
      calendarYears: [2026, 2027],
      runs,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof CmsError
            ? error.message
            : '状態を取得できませんでした。',
      },
      error instanceof CmsError ? error.status : 503
    );
  }
}
