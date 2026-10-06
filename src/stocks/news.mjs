// Free RSS discovery for the stock daily summary. No article-body scraping.
import { jstDate } from './calendar.mjs';

const HOSTS = [
  'nikkei.com','jiji.com','reuters.com','bloomberg.com','nhk.or.jp','web.nhk',
  'asahi.com','mainichi.jp','yomiuri.co.jp','sankei.com','47news.jp',
  'kyodonews.jp','news.tv-asahi.co.jp','news.ntv.co.jp','newsdig.tbs.co.jp',
  'news.tbs.co.jp','fnn.jp','quickmoneyworld.jp',
  'minkabu.jp','kabutan.jp','traders.co.jp','fisco.jp','finance.yahoo.co.jp'
];

const SECTORS = [
  '半導体関連','半導体株','銀行株','銀行','自動車株','自動車','電力株',
  '医薬品株','小売株','食品株','鉄鋼株','不動産株','海運株',
  '非鉄金属株','電線株','AI関連株'
];

const COMPANIES = [
  '東京エレクトロン','アドバンテスト','ソフトバンクグループ','信越化学',
  'トヨタ自動車','三菱UFJ','ソニーグループ','任天堂','レーザーテック',
  'ディスコ','三井住友FG','日立製作所','フジクラ'
];

const decode = text =>
  String(text || '')
    .replace(/&(?:amp|lt|gt|quot|apos);/g, s => ({
      '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"
    }[s]))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const c = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '';
    });

const tag = (xml, name) => {
  const raw =
    String(xml).match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
  return decode(
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]*>/g, '')
  ).trim();
};

export function newsUrl(raw) {
  try {
    let u = new URL(raw);

    if (/(^|\.)bing\.com$/.test(u.hostname) && u.pathname === '/news/apiclick.aspx') {
      const direct = u.searchParams.get('url');
      if (!direct) return null;
      u = new URL(direct);
    }

    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      !HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
    ) {
      return null;
    }

    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

export function parseRss(xml) {
  if (
    typeof xml !== 'string' ||
    !/<rss\b/i.test(xml) ||
    !/<channel\b/i.test(xml) ||
    !/<\/rss>/i.test(xml)
  ) {
    throw new Error('news_invalid_rss');
  }

  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .slice(0, 50)
    .map(m => {
      const url = newsUrl(tag(m[1], 'link'));
      const at = Date.parse(tag(m[1], 'pubDate'));
      return {
        title: tag(m[1], 'title').normalize('NFKC').slice(0, 400),
        url,
        publishedAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
        source:
          tag(m[1], 'News:Source').slice(0, 80) ||
          tag(m[1], 'source').slice(0, 80) ||
          (url ? new URL(url).hostname : ''),
      };
    })
    .filter(n => n.url && n.publishedAt && n.title);
}

const signal = clause => {
  if (
    /予想|見通し|見込み|可能性|だろう|なるか|期待|狙う|先物|寄り付き|寄付|ADR|海外市場|米国市場|[?？]/.test(clause)
  ) {
    return null;
  }

  const up = /上昇|続伸|反発|値上がり|円高|ポイント高|%高|買われ|堅調/.test(clause);
  const down = /下落|続落|反落|値下がり|円安|ポイント安|%安|売られ|軟調/.test(clause);

  if (up && down) return null;
  if (up) return 'up';
  if (down) return 'down';
  return /横ばい|小動き/.test(clause) ? 'flat' : null;
};

function subjectClause(title, subject) {
  const i = title.indexOf(subject);
  if (i < 0) return null;

  if (
    /(?:米|米国|米国の|欧州|欧州の|中国|中国の|韓国|韓国の|台湾|台湾の|海外の)$/.test(
      title.slice(0, i)
    )
  ) {
    return null;
  }

  // 「日経平均6日前引け＝続伸、134円高」のような一般的な見出しを拾うため、
  // ＝ と = では切らない。
  const text = title
    .slice(i + subject.length)
    .split(/[、。,;；｜|]/)[0]
    .slice(0, 90);

  const boundary = text.search(
    /日経平均|TOPIX|米国|米株|NY|ダウ|ナスダック|東京エレクトロン|半導体|銀行株/
  );

  return boundary >= 0 ? text.slice(0, boundary) : text;
}

function extractChange(clause) {
  const explicit = clause.match(
    /前(?:営業)?日比\s*([0-9,]+(?:\.\d+)?)\s*(円|ポイント|%)\s*(高|安|上昇|下落)/
  );
  if (explicit) {
    return {
      value:
        Number(explicit[1].replaceAll(',', '')) *
        (/安|下落/.test(explicit[3]) ? -1 : 1),
      unit: explicit[2],
    };
  }

  const compact = clause.match(
    /([0-9,]+(?:\.\d+)?)\s*(円|ポイント|%)\s*(高|安)(?!値)/
  );
  if (compact) {
    return {
      value:
        Number(compact[1].replaceAll(',', '')) *
        (compact[3] === '安' ? -1 : 1),
      unit: compact[2],
    };
  }

  return null;
}

export function extractFacts(item, phase) {
  const title = item.title;
  const completed =
    phase === 'morning'
      ? /前引け|前場終値|前場終了/.test(title)
      : /大引け|終値|取引終了|引け後|東京株式.*引け/.test(title);

  const indices = {};

  for (const [key, variants] of [
    ['nikkei', ['日経平均株価', '日経平均']],
    ['topix', ['TOPIX', '東証株価指数']],
  ]) {
    const subject = variants.find(s => title.includes(s));
    if (!subject) continue;

    const clause = subjectClause(title, subject);
    if (!clause || /^(?:連動|型|先物|採用|構成|算出|新規)/.test(clause)) continue;

    const move = signal(clause);
    if (!move) continue;

    indices[key] = {
      direction: move,
      change: extractChange(clause),
      completed: completed && !/一時|場中|途中/.test(clause),
      evidence: item.url,
    };
  }

  const topics = [];
  const stocks = [];

  for (const name of SECTORS) {
    const clause = subjectClause(title, name);
    if (clause === null) continue;
    const move = signal(clause);
    if (
      move &&
      !topics.some(t => t.name.startsWith(name) || name.startsWith(t.name))
    ) {
      topics.push({
        name,
        direction: move,
        completed: completed && !/一時|場中|途中/.test(clause),
        evidence: item.url,
      });
    }
  }

  for (const name of COMPANIES) {
    const clause = subjectClause(title, name);
    if (clause === null) continue;
    const move = signal(clause);
    if (move) {
      stocks.push({
        name,
        direction: move,
        completed: completed && !/一時|場中|途中/.test(clause),
        evidence: item.url,
      });
    }
  }

  return { indices, topics, stocks, completed };
}

function headlineDayMatches(title, date) {
  const [, m, d] = date.split('-').map(Number);

  for (const match of title.matchAll(
    /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日|(\d{1,2})\/(\d{1,2})(?!\d)/g
  )) {
    if (match[1] && Number(match[1]) !== Number(date.slice(0, 4))) return false;
    if (
      Number(match[2] || match[4]) !== m ||
      Number(match[3] || match[5]) !== d
    ) {
      return false;
    }
  }

  // Bing News RSS の pubDate は実際の配信時刻と大きくずれることがある。
  // 見出しに「6日前引け」「6日大引け」のような日付が明記されている場合は、
  // その日付を優先して前日記事の混入を防ぐ。
  for (const match of title.matchAll(
    /(?:日経平均|TOPIX|東証株価指数|東京株式|東証)?\s*(\d{1,2})日(?:前引け|大引け|終値|前場|後場|引け)/g
  )) {
    if (Number(match[1]) !== d) return false;
  }

  return true;
}

export function analyzeNews(items, { date, phase, now }) {
  // Bing News RSS の pubDate は記事の実際の公開時刻と数時間〜半日ずれることがある。
  // そのため時刻で 09:00-12:15 / 12:30-16:30 に切るのはやめ、
  // JSTの日付 + 見出しの「前引け / 大引け」等で当日の市況記事を判定する。

  const seen = new Set();
  const accepted = [];

  for (const item of items.sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  )) {
    const t = item.title;

    if (
      jstDate(item.publishedAt) !== date ||
      seen.has(item.url) ||
      !headlineDayMatches(t, date)
    ) {
      continue;
    }

    if (
      !/日経平均|TOPIX|東証株価指数|東京株式|東京株式市場|日本株|東証|半導体株|銀行株/.test(t)
    ) {
      continue;
    }

    if (
      /見通し|予想|週間|先週|前週|昨日|前日(?:の|は)|振り返|デイトレ|先物|寄前|寄り付き|寄付|注目すべき|なるか[?？]?|狙う株|米国株式市場|ニューヨーク株/.test(t)
    ) {
      continue;
    }

    const phaseCompleted =
      phase === 'morning'
        ? /前引け|前場終値|前場終了|前場.*引け/.test(t)
        : /大引け|終値|取引終了|引け後|東京株式.*引け/.test(t);

    if (!phaseCompleted) continue;

    const facts = extractFacts(item, phase);

    if (
      !Object.keys(facts.indices).length &&
      !facts.topics.length &&
      !facts.stocks.length
    ) {
      continue;
    }

    seen.add(item.url);
    accepted.push({ ...item, ...facts });

    if (accepted.length >= 10) break;
  }

  if (!accepted.length) return null;

  const indices = {};
  const topics = [];
  const stocks = [];

  const choose = candidates => {
    if (!candidates.length) return null;
    const completed = candidates.filter(c => c.fact.completed);
    const list = completed.length ? completed : candidates;
    const newest = list[0];
    const simultaneous = list.filter(c => c.publishedAt === newest.publishedAt);

    return simultaneous.some(c => c.fact.direction !== newest.fact.direction)
      ? null
      : newest.fact;
  };

  for (const key of ['nikkei', 'topix']) {
    const fact = choose(
      accepted
        .filter(n => n.indices[key])
        .map(n => ({
          publishedAt: n.publishedAt,
          fact: n.indices[key],
        }))
    );
    if (fact) indices[key] = fact;
  }

  for (const field of ['topics', 'stocks']) {
    const names = new Set(
      accepted.flatMap(n => n[field].map(f => f.name))
    );

    for (const name of names) {
      const list = accepted.flatMap(n =>
        n[field]
          .filter(f => f.name === name)
          .map(f => ({
            publishedAt: n.publishedAt,
            fact: f,
          }))
      );

      const fact = choose(list);
      if (fact) (field === 'topics' ? topics : stocks).push(fact);
    }
  }

  if (!Object.keys(indices).length && !topics.length && !stocks.length) {
    return null;
  }

  const evidence = new Set(
    [...Object.values(indices), ...topics, ...stocks].map(f => f.evidence)
  );

  const sources = accepted
    .filter(n => evidence.has(n.url))
    .map(({ url, source, publishedAt }) => ({
      url,
      name: source,
      publishedAt,
    }));

  if (!sources.length) return null;

  const fingerprint = JSON.stringify({
    indices,
    topics,
    stocks,
    sources,
  });

  return {
    mode: 'news',
    date,
    phase,
    fetchedAt: now.toISOString(),
    asOf: sources[0].publishedAt,
    indices,
    topics,
    stocks,
    sources,
    fingerprint,
    warnings: [],
    coverage:
      '取得できた当日の報道の範囲。市場全体の網羅やリアルタイムの株価提供ではありません。',
  };
}

export function rssUrls(phase) {
  const terms =
    phase === 'morning'
      ? ['日経平均 前引け', 'TOPIX 前引け', '東京株式 前場']
      : ['日経平均 大引け', 'TOPIX 大引け', '東京株式 大引け'];

  return terms.map(
    q =>
      `https://www.bing.com/news/search?q=${encodeURIComponent(q)}` +
      `&qft=interval%3d%227%22%2bsortbydate%3d%221%22` +
      `&format=RSS&setlang=ja-jp&cc=JP`
  );
}

export async function fetchMarketNews(date, phase, now, fetcher = fetch) {
  const results = await Promise.allSettled(
    rssUrls(phase).map(async url => {
      const response = await fetcher(url, {
        headers: {
          Accept:
            'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9',
          'User-Agent':
            'Mozilla/5.0 (compatible; MeganemaruBlog/1.0; +https://meganemaru-blog.pwtools.workers.dev/)',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error('news_http_failure');
      }

      const xml = await response.text();

      if (new TextEncoder().encode(xml).byteLength > 250000) {
        throw new Error('news_too_large');
      }

      return parseRss(xml);
    })
  );

  const ok = results.filter(r => r.status === 'fulfilled');

  if (!ok.length) {
    throw new Error('news_fetch_failed');
  }

  const snapshot = analyzeNews(
    ok.flatMap(r => r.value),
    { date, phase, now }
  );

  if (snapshot && ok.length !== results.length) {
    snapshot.warnings.push('一部のニュース検索を取得できませんでした');
  }

  return snapshot;
}

export function mergeNews(previous, current) {
  if (!previous || previous.mode !== 'news') return current;

  const prefer = (old, next) =>
    old?.completed && next && !next.completed
      ? old
      : next || old;

  const indices = {};

  for (const k of ['nikkei', 'topix']) {
    const f = prefer(
      previous.indices[k],
      current.indices[k]
    );
    if (f) indices[k] = f;
  }

  const merge = field =>
    [
      ...new Set([
        ...previous[field],
        ...current[field],
      ].map(f => f.name)),
    ].map(name =>
      prefer(
        previous[field].find(f => f.name === name),
        current[field].find(f => f.name === name)
      )
    );

  const topics = merge('topics');
  const stocks = merge('stocks');

  const used = new Set(
    [...Object.values(indices), ...topics, ...stocks].map(f => f.evidence)
  );

  const sources = [
    ...current.sources,
    ...previous.sources,
  ]
    .filter(
      (s, i, a) =>
        used.has(s.url) &&
        a.findIndex(t => t.url === s.url) === i
    )
    .sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt)
    );

  if (!sources.length) return current;

  return {
    ...current,
    indices,
    topics,
    stocks,
    sources,
    asOf: sources[0].publishedAt,
    fingerprint: JSON.stringify({
      indices,
      topics,
      stocks,
      sources,
    }),
  };
}
