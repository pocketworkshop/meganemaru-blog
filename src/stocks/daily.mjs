import { STOCK_CRONS, jstDate, calendarState } from './calendar.mjs';
import { fetchMarketNews, mergeNews } from './news.mjs';
import { DAILY_KIND, postKey, buildPost } from './render.mjs';
import { authorize, CmsError, cleanHtml } from '../cms/security.js';
import { legacyPosts } from '../cms/cms.js';
const statement = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const readExtra = row => JSON.parse(row?.extra_json || '{}');
function ownership(row, extra) {
  return extra.marketDaily?.kind === DAILY_KIND && extra.marketDaily.generatedVersion === row.version && row.status === 'published';
}
export async function storeSnapshot(env, snapshot, legacy = []) {
  const date = snapshot.date, key = postKey(date), phase = snapshot.phase;
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await statement(env, 'SELECT * FROM cms_posts WHERE id=? OR slug=? LIMIT 1', key, key).first();
    const extra = readExtra(row);
    if (row && !ownership(row, extra)) return { state: 'manual_override', date, phase };
    snapshot = mergeNews(extra.marketDaily?.sessions?.[phase], snapshot);
    if (row && extra.marketDaily.sessions?.[phase]?.fingerprint === snapshot.fingerprint) return { state: 'already_saved', date, phase };
    if (!row) {
      const tombstone = await statement(env, 'SELECT key FROM cms_keys WHERE key=?', key).first();
      if (tombstone || legacy.some(p => p.id === key || p.slug === key)) return { state: 'key_reserved', date, phase };
    }
    const sessions = { ...(extra.marketDaily?.sessions || {}), [phase]: snapshot };
    const post = buildPost(date, sessions), stamp = snapshot.fetchedAt, token = crypto.randomUUID(), version = row ? row.version + 1 : 1;
    const nextExtra = { ...extra, marketDaily: { kind: DAILY_KIND, date, sessions, generatedVersion: version } };
    const batch = row ? [statement(env, `UPDATE cms_posts SET title=?,category=?,date=?,summary=?,theme=?,body_html=?,extra_json=?,updated_at=?,mutation_token=?,version=version+1 WHERE id=? AND version=? AND status='published'`, post.title, post.category, post.date, post.summary, post.theme, cleanHtml(post.bodyHtml), JSON.stringify(nextExtra), stamp, token, row.id, row.version),
      statement(env, `INSERT INTO cms_meta(key,value) SELECT 'stock_daily_concurrent_guard',NULL WHERE NOT EXISTS(SELECT 1 FROM cms_posts WHERE id=? AND version=? AND mutation_token=?)`, row.id, version, token)]
      : [statement(env, `INSERT INTO cms_posts(id,slug,title,category,date,summary,theme,body_html,extra_json,status,created_at,updated_at,mutation_token) VALUES(?,?,?,?,?,?,?,?,?,'published',?,?,?)`, key, key, post.title, post.category, post.date, post.summary, post.theme, cleanHtml(post.bodyHtml), JSON.stringify(nextExtra), stamp, stamp, token),
        statement(env, 'INSERT INTO cms_keys(key,post_id) VALUES(?,?)', key, key)];
    try { await env.DB.batch(batch); return { state: 'saved', date, phase, warnings: snapshot.warnings, postKey: key }; }
    catch (error) { if (!/UNIQUE|NOT NULL|CHECK/.test(String(error)) || attempt === 2) throw error; }
  }
  throw new Error('concurrent_update');
}
async function logRun(env, result, now) {
  const value = { ...result, at: now.toISOString() };
  console.log('stock_daily', JSON.stringify(value));
  if (env.DB && result.phase && result.state !== 'disabled') {
    try { await statement(env, `INSERT INTO cms_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, `stock_daily:last:${result.phase}`, JSON.stringify(value)).run(); }
    catch { console.error('stock_daily_status_write_failed'); }
  }
  return value;
}
export async function runStockCron(controller, env, options = {}) {
  const phase = STOCK_CRONS[controller.cron];
  if (!phase) return { state: 'unrelated_cron' };
  const now = options.now || new Date();
  const date = jstDate(controller.scheduledTime);
  const result = async value => logRun(env, { date, phase, ...value }, now);
  if (env.STOCK_DAILY_ENABLED !== 'true') return result({ state: 'disabled' });
  // A late/replayed invocation must never label another day's reports with this date.
  const age = now.getTime() - Number(controller.scheduledTime);
  if (jstDate(now) !== date || age < -60000 || age > 40 * 60000) return result({ state: 'stale_invocation' });
  const calendar = calendarState(date);
  if (calendar === 'closed') return result({ state: 'closed_calendar' });
  if (calendar === 'unknown') return result({ state: 'calendar_unverified' });
  if (!env.DB) return result({ state: 'database_missing' });
  try {
    const key = postKey(date), row = await statement(env, 'SELECT * FROM cms_posts WHERE id=? OR slug=? LIMIT 1', key, key).first();
    if (row) {
      const extra = readExtra(row);
      if (!ownership(row, extra)) return result({ state: 'manual_override' });
    } else if (await statement(env, 'SELECT key FROM cms_keys WHERE key=?', key).first()) return result({ state: 'key_reserved' });
    const snapshot = await fetchMarketNews(date, phase, now, options.fetcher || fetch);
    if (!snapshot) return result({ state: 'no_current_news' });
    const legacy = row ? [] : await legacyPosts(new Request('https://meganemaru.internal/data/posts.json'), env);
    return result(await storeSnapshot(env, snapshot, legacy));
  } catch (error) {
    const reason = String(error?.message || '').match(/^(news_[a-z0-9_]+)$/)?.[0] || 'fetch_or_storage_failed';
    // No response bodies, request URLs, credentials or raw data are logged.
    return result({ state: 'failed', reason });
  }
}
export async function handleStockStatus(request, env) {
  if (new URL(request.url).pathname !== '/api/admin/stock-daily/status') return null;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  try {
    await authorize(request, env);
    if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
    const runs = {};
    if (env.DB) for (const phase of ['morning', 'close']) {
      const row = await statement(env, 'SELECT value FROM cms_meta WHERE key=?', `stock_daily:last:${phase}`).first();
      runs[phase] = row ? JSON.parse(row.value) : null;
    }
    return json({ enabled: env.STOCK_DAILY_ENABLED === 'true', source: 'Bing News RSS', calendarYears: [2026, 2027], runs });
  } catch (error) { return json({ error: error instanceof CmsError ? error.message : '状態を取得できませんでした。' }, error instanceof CmsError ? error.status : 503); }
}
