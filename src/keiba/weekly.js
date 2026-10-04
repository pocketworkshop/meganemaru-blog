import { publicPosts } from '../cms/cms.js';
import { buildWeekly, renderCards, weekLabel, escapeHtml } from '../../public/keiba/weekly/model.mjs';

async function weeklyData(request, env) {
  const asset = await env.ASSETS.fetch(new Request(new URL('/data/jra-graded-races.json', request.url)));
  if (!asset.ok) throw new Error('Annual graded-race data could not be loaded');
  const schedule = await asset.json();
  let posts = [], available = true;
  try { posts = await publicPosts(request, env); }
  catch (error) { available = false; console.error('Weekly race articles unavailable:', String(error)); }
  return buildWeekly(schedule, posts, new Date(), available);
}

export async function handleWeeklyRaces(request, env) {
  const path = new URL(request.url).pathname;
  const page = ['/keiba/weekly/', '/keiba/weekly/index.html'].includes(path);
  const api = path === '/api/keiba/weekly';
  if (path === '/keiba/weekly') return Response.redirect(new URL('/keiba/weekly/', request.url), 308);
  if (!page && !api) return null;
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  try {
    const data = await weeklyData(request, env);
    if (api) return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    const template = await env.ASSETS.fetch(new Request(new URL('/keiba/weekly/index.html', request.url)));
    if (!template.ok) throw new Error('Weekly page template could not be loaded');
    const canonical = new URL('/keiba/weekly/', request.url).href;
    const note = data.articlesAvailable ? '公開済みの項目から記事を読めます。' : '記事の公開状況を確認できませんでした。時間をおいて更新してください。';
    const initial = JSON.stringify(data).replaceAll('<', '\\u003c');
    const rewritten = new HTMLRewriter()
      .on('link[rel="canonical"]', { element: e => e.setAttribute('href', canonical) })
      .on('meta[property="og:url"]', { element: e => e.setAttribute('content', canonical) })
      .on('meta[property="og:image"], meta[name="twitter:image"]', { element: e => e.setAttribute('content', new URL('/assets/mascot.png', request.url).href) })
      .on('#weekLabel', { element: e => e.setInnerContent(escapeHtml(weekLabel(data.week)), { html: true }) })
      .on('#raceCount', { element: e => e.setInnerContent(`${data.races.length} レース`) })
      .on('#raceCards', { element: e => { e.setAttribute('data-server-rendered', 'true'); e.setInnerContent(renderCards(data), { html: true }); } })
      .on('#articleNotice', { element: e => e.setInnerContent(note) })
      .on('#weeklyInitial', { element: e => e.setInnerContent(initial, { html: true }) })
      .transform(template);
    return new Response(request.method === 'HEAD' ? null : rewritten.body, { headers: { ...rewritten.headers, ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('Weekly race page unavailable:', String(error));
    if (api) return new Response(JSON.stringify({ error: '重賞情報を取得できませんでした。' }), { status: 503, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    return new Response(request.method === 'HEAD' ? null : '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>今週の重賞 | めがねまるのブログ</title><link rel="stylesheet" href="/styles.css"><main class="shell blog-hero"><h1>今週の重賞</h1><p>重賞情報を取得できませんでした。時間をおいて再読み込みしてください。</p><a href="/blog/?category=競馬">競馬の記事一覧へ</a></main></html>', { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
