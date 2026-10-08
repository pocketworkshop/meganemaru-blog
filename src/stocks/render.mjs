import { nextTradingDate } from './calendar.mjs';

export const DAILY_KIND = 'jp_stocks_daily_v1';
export const postKey = date => `jp-stocks-${date}`;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const number = (value, digits = 2) =>
  value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const smartNumber = value => number(value, Number.isInteger(value) ? 0 : 2);
const dateLabel = date => {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}年${m}月${d}日`;
};
const timeLabel = value =>
  new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(11, 16);

export function nextStockLink(post, posts) {
  if (post.marketDaily?.kind !== DAILY_KIND || !post.marketDaily.sessions?.close) return '';

  const next = nextTradingDate(post.date);

  const matches = p => {
    const title = String(p.title).normalize('NFKC');

    if (p.marketReviewDate) {
      return p.marketReviewDate === post.date && /(?:明日|日(?:に)?)狙う株/.test(title);
    }

    if (/明日狙う株/.test(title)) return p.date === post.date;

    const dated = title.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:に)?狙う株/);
    if (!dated || !next || p.date < post.date || p.date > next) return false;

    const [year, month, day] = next.split('-').map(Number);
    return (!dated[1] || Number(dated[1]) === year) &&
      Number(dated[2]) === month &&
      Number(dated[3]) === day;
  };

  const candidates = posts.filter(p =>
    p.category === '株' &&
    p.id !== post.id &&
    p.marketDaily?.kind !== DAILY_KIND &&
    matches(p) &&
    (!p.status || p.status === 'published') &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(p.slug || p.id || '')
  );

  const target = candidates.sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  )[0];

  return target
    ? `<h3>明日狙う株</h3><p><a href="/blog/article.html?slug=${encodeURIComponent(target.slug || target.id)}">今日の値動きを踏まえて、明日狙う株はこちら →</a></p>`
    : '<h3>明日狙う株</h3><p>この日の相場を踏まえた「明日狙う株」は、公開後にここへリンクを表示します。</p>';
}

const moveLabel = q => ({ up: '上昇', down: '下落', flat: '小動き' }[q.direction]);

function factNumbers(q) {
  const parts = [];

  if (q.level) parts.push(`${smartNumber(q.level.value)}${esc(q.level.unit)}`);

  if (q.change) {
    const sign = q.change.value > 0 ? '+' : '';
    let change = `前日比${sign}${smartNumber(q.change.value)}${esc(q.change.unit)}`;

    if (Number.isFinite(q.percent)) {
      change += `（${q.percent > 0 ? '+' : ''}${number(q.percent, 2)}%）`;
    }

    parts.push(change);
  }

  return parts;
}

function factSentence(name, q) {
  const nums = factNumbers(q);
  if (nums.length) return `${name}は${nums.join('、')}で${moveLabel(q)}。`;
  return `${name}は${moveLabel(q)}と報じられています${q.completed ? '' : '（取引時間中の報道）'}。`;
}

function newsOverview(s) {
  const sentences = [];
  if (s.indices.nikkei) sentences.push(factSentence('日経平均', s.indices.nikkei));
  if (s.indices.topix) sentences.push(factSentence('TOPIX', s.indices.topix));

  return sentences.length
    ? sentences.join('')
    : '当日の業種・銘柄のニュースを確認できました。指数全体の動きは確認できていません。';
}

function turnoverLabel(turnover) {
  if (!turnover) return '';
  if (turnover.trillion > 0 && turnover.oku > 0) {
    return `${turnover.trillion}兆${turnover.oku.toLocaleString('ja-JP')}億円`;
  }
  if (turnover.trillion > 0) return `${turnover.trillion}兆円`;
  return `${turnover.oku.toLocaleString('ja-JP')}億円`;
}

function marketRows(s) {
  const rows = [];

  for (const [name, q] of [['日経平均', s.indices.nikkei], ['TOPIX', s.indices.topix]]) {
    if (!q) continue;

    const cls =
      q.direction === 'up' ? 'rise' :
      q.direction === 'down' ? 'fall' : 'flat';

    const parts = [];
    if (q.level) parts.push(`<strong>${smartNumber(q.level.value)}${esc(q.level.unit)}</strong>`);
    if (q.change) {
      parts.push(
        `前日比 <span class="stock-${cls}">${q.change.value > 0 ? '+' : ''}${smartNumber(q.change.value)}${esc(q.change.unit)}${Number.isFinite(q.percent) ? `（${q.percent > 0 ? '+' : ''}${number(q.percent, 2)}%）` : ''}</span>`
      );
    }
    parts.push(`<span class="stock-${cls}">${moveLabel(q)}</span>`);

    rows.push(`<tr><th>${name}</th><td>${parts.join('<br>')}</td></tr>`);
  }

  const fx = s.market?.usdJpy;
  if (fx) {
    rows.push(`<tr><th>ドル円</th><td><strong>${esc(fx.display)}</strong></td></tr>`);
  }

  const breadth = s.market?.breadth;
  if (breadth) {
    const flat = Number.isFinite(breadth.flat) ? ` / 変わらず ${breadth.flat.toLocaleString('ja-JP')}` : '';
    rows.push(
      `<tr><th>値上がり / 値下がり</th><td><strong>${breadth.up.toLocaleString('ja-JP')} / ${breadth.down.toLocaleString('ja-JP')}</strong>${flat}</td></tr>`
    );
  }

  const turnover = s.market?.turnover;
  if (turnover) {
    rows.push(`<tr><th>売買代金</th><td><strong>${turnoverLabel(turnover)}</strong></td></tr>`);
  }

  if (!rows.length) return '';

  return `<table><thead><tr><th>項目</th><th>確認できた数値</th></tr></thead><tbody>${rows.join('')}</tbody></table><p><small>当日の公開情報で確認できた数値だけを表示しています。確認できない項目は無理に補完しません。</small></p>`;
}

function newsFacts(s, facts) {
  return `<ul>${facts.map(f =>
    `<li>${esc(f.name)}：${moveLabel(f)}と報じられています${f.completed ? '' : '（取引時間中の報道）'}。</li>`
  ).join('')}</ul>`;
}

function newsPoints(s, morning) {
  const first = morning
    ? '後場の終了時に、日経平均とTOPIXの方向がそろっているかを確認。'
    : '次の営業日は、日経平均とTOPIXの寄り付きからの動きを確認。';

  const points = [`<li>${first}</li>`];

  if (s.market?.usdJpy) {
    points.push('<li>ドル円が大きく円高・円安方向へ動くかも確認。</li>');
  }

  const theme = s.topics[0];
  if (theme) {
    points.push(`<li>報道に出た${esc(theme.name)}の動きが続くかを確認。</li>`);
  }

  return `<ul>${points.join('')}</ul>`;
}

export function newsComparison(morning, close) {
  if (!morning || morning.mode !== 'news') {
    return '前場の報道を保存できていないため、前場との比較はできません。';
  }

  const result = [];

  for (const [key, name] of [['nikkei', '日経平均'], ['topix', 'TOPIX']]) {
    const m = morning.indices[key];
    const c = close.indices[key];

    if (!m?.completed || !c?.completed) continue;

    if (m.direction !== c.direction) {
      result.push(`${name}は、前場の${moveLabel(m)}から大引けの${moveLabel(c)}へ変わりました。`);
    } else if (
      m.change &&
      c.change &&
      m.change.unit === c.change.unit &&
      m.direction !== 'flat'
    ) {
      const wider = Math.abs(c.change.value) > Math.abs(m.change.value);
      const equal = c.change.value === m.change.value;

      result.push(
        `${name}は${moveLabel(c)}が続き、前日比の${c.direction === 'up' ? '上げ幅' : '下げ幅'}は${equal ? '変わりませんでした' : wider ? '広がりました' : '縮まりました'}。`
      );
    } else {
      result.push(`${name}は、前場も大引けも${moveLabel(c)}でした。値幅の変化は確認できていません。`);
    }
  }

  return result.join('') ||
    '両時間帯の終了時点を確認できる情報がそろわないため、流れが変わったかは判断していません。';
}

function newsSection(s) {
  let html = `<p>${esc(newsOverview(s))}</p>`;

  const strong = s.topics.filter(t => t.direction === 'up');
  const weak = s.topics.filter(t => t.direction === 'down');

  if (strong.length) html += `<h3>強かったところ</h3>${newsFacts(s, strong.slice(0, 3))}`;
  if (weak.length) html += `<h3>弱かったところ</h3>${newsFacts(s, weak.slice(0, 3))}`;

  if (s.stocks.length) {
    html += `<h3>${s.phase === 'morning' ? '前場で目立った銘柄' : '今日の目立った銘柄'}</h3>${newsFacts(s, s.stocks.slice(0, 5))}<p><small>取得ニュースで値動きを確認できた銘柄です。市場全体のランキングではありません。</small></p>`;
  }

  return html;
}

export function buildPost(date, sessions) {
  const { morning, close } = sessions;
  const latest = close || morning;

  let html =
    `<p><strong>${morning ? `${timeLabel(morning.fetchedAt)} 前場更新` : '前場の報道は未取得'}</strong><br>` +
    `${close ? `${timeLabel(close.fetchedAt)} 大引け更新` : '15:50 大引け更新予定（16:00に再確認）'}</p>` +
    `<h2>今日の相場をざっくり</h2>` +
    `<p>${esc(newsOverview(latest))}</p>` +
    `<h3>主要データ</h3>${marketRows(latest)}`;

  if (morning) {
    html +=
      `<hr><h2>前場どうだった？</h2>` +
      `${newsSection(morning)}` +
      `<h3>前場の主要データ</h3>${marketRows(morning)}` +
      `<h3>後場で見るポイント</h3>${newsPoints(morning, true)}`;
  } else {
    html += '<h2>前場どうだった？</h2><p>当日の前場を確認できる報道を取得できませんでした。</p>';
  }

  if (close) {
    const hero = close.stocks[0] || close.topics[0];

    html +=
      `<hr><h2>大引けどうだった？</h2>` +
      `${newsSection(close)}` +
      `<h3>大引けの主要データ</h3>${marketRows(close)}` +
      `<h3>前場から何が変わった？</h3><p>${esc(newsComparison(morning, close))}</p>` +
      `${hero ? `<h3>今日の主役</h3><p>取得した報道で注目したのは${esc(hero.name)}。${moveLabel(hero)}と報じられています。</p>` : ''}` +
      `<h3>今日の相場を一言で</h3><p><strong>${esc(newsOverview(close))}</strong></p>` +
      `<h3>明日に向けて</h3>` +
      `${nextTradingDate(date) ? `<p>次の営業日：${dateLabel(nextTradingDate(date))}（通常の日程に基づく予定）</p>` : ''}` +
      `${newsPoints(close, false)}`;
  }

  html +=
    '<hr><p><small>当日の公開情報をもとに短く整理しています。取得できる情報には範囲の偏りがあります。銘柄選定は「明日狙う株」で扱います。</small></p>';

  return {
    id: postKey(date),
    slug: postKey(date),
    title: `${dateLabel(date)}の日本株｜前場どうだった？・大引けどうだった？`,
    category: '株',
    theme: 'stock',
    date,
    summary: `${dateLabel(date)}の日本株。${newsOverview(latest)}`,
    bodyHtml: html,
  };
}
