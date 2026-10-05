import { nextTradingDate } from './calendar.mjs';
export const DAILY_KIND = 'jp_stocks_daily_v1';
export const postKey = date => `jp-stocks-${date}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (value, digits = 2) => value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = value => `${value > 0 ? '+' : ''}${number(value)}`;
const dateLabel = date => { const [y, m, d] = date.split('-').map(Number); return `${y}年${m}月${d}日`; };
const timeLabel = value => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(11, 16);
export function nextStockLink(post, posts) {
  if (post.marketDaily?.kind !== DAILY_KIND || !post.marketDaily.sessions?.close) return '';
  const next = nextTradingDate(post.date);
  const matches = p => {
    const title = String(p.title).normalize('NFKC');
    if (p.marketReviewDate) return p.marketReviewDate === post.date && /(?:明日|日(?:に)?)狙う株/.test(title);
    if (/明日狙う株/.test(title)) return p.date === post.date;
    const dated = title.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:に)?狙う株/);
    if (!dated || !next || p.date < post.date || p.date > next) return false;
    const [year, month, day] = next.split('-').map(Number);
    return (!dated[1] || Number(dated[1]) === year) && Number(dated[2]) === month && Number(dated[3]) === day;
  };
  const candidates = posts.filter(p => p.category === '株' && p.id !== post.id && p.marketDaily?.kind !== DAILY_KIND
    && matches(p) && (!p.status || p.status === 'published')
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(p.slug || p.id || ''));
  const target = candidates.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  return target ? `<h3>明日狙う株</h3><p><a href="/blog/article.html?slug=${encodeURIComponent(target.slug || target.id)}">今日の値動きを踏まえて、明日狙う株はこちら →</a></p>`
    : '<h3>明日狙う株</h3><p>この日の相場を踏まえた「明日狙う株」は、公開後にここへリンクを表示します。</p>';
}
const moveLabel = q => ({up:'上昇',down:'下落',flat:'小動き'}[q.direction]);
function newsOverview(s) {
  const n=s.indices.nikkei,t=s.indices.topix;
  const end=s.phase==='morning'?'前場':'大引け';
  if (n?.completed && t?.completed) return n.direction===t.direction ? `報道で確認できた${end}は、日経平均とTOPIXがともに${moveLabel(n)}。` : `報道で確認できた${end}は、日経平均とTOPIXの動きが分かれました。`;
  const names=[['日経平均',n],['TOPIX',t]].filter(([,q])=>q).map(([name,q])=>`${name}は${moveLabel(q)}と報じられています${q.completed?'':'（取引時間中の報道）'}`);
  return names.length ? names.join('。')+'。' : '当日の業種・銘柄のニュースを確認できました。指数全体の動きは確認できていません。';
}
function evidenceLink(s,f) {
  const source=s.sources.find(q=>q.url===f.evidence);
  return source ? ` <br><a href="${esc(source.url)}">出典：${esc(source.name)} ${timeLabel(source.publishedAt)}</a>` : '';
}
function newsIndex(s) {
  const rows=[['日経平均',s.indices.nikkei],['TOPIX',s.indices.topix]].filter(([,q])=>q);
  if (!rows.length) return '';
  return `<table><thead><tr><th>指数</th><th>報道で確認できた動き</th></tr></thead><tbody>${rows.map(([name,q])=>`<tr><th>${name}</th><td><span class="stock-${q.direction==='up'?'rise':q.direction==='down'?'fall':'flat'}">${moveLabel(q)}${q.change?`（前日比${q.change.value>0?'+':''}${number(q.change.value)}${esc(q.change.unit)}）`:''}</span>${q.completed?'': '<br>取引時間中の報道'}${evidenceLink(s,q)}</td></tr>`).join('')}</tbody></table><p><small>数値を確認できない項目は表示していません。取引時間中の報道は前場・大引けの確定値を示しません。</small></p>`;
}
function newsFacts(s,facts) {
  return `<ul>${facts.map(f=>`<li>${esc(f.name)}：${moveLabel(f)}と報じられています${f.completed?'':'（取引時間中の報道）'}。${evidenceLink(s,f)}</li>`).join('')}</ul>`;
}
function newsPoints(s,morning) {
  const first=morning?'後場の終了時に、日経平均とTOPIXの方向がそろっているかを確認。':'次の営業日は、日経平均とTOPIXの寄り付きからの動きを確認。';
  const theme=s.topics[0];
  return `<ul><li>${first}</li>${theme?`<li>報道に出た${esc(theme.name)}の動きが続くかを確認。</li>`:''}</ul>`;
}
export function newsComparison(morning,close) {
  if (!morning || morning.mode!=='news') return '前場の報道を保存できていないため、前場との比較はできません。';
  const result=[];
  for (const [key,name] of [['nikkei','日経平均'],['topix','TOPIX']]) {
    const m=morning.indices[key],c=close.indices[key];
    if (!m?.completed || !c?.completed) continue;
    if (m.direction !== c.direction) result.push(`${name}は、前場の${moveLabel(m)}から大引けの${moveLabel(c)}へ変わりました。`);
    else if (m.change && c.change && m.change.unit===c.change.unit && m.direction!=='flat') {
      const wider=Math.abs(c.change.value)>Math.abs(m.change.value),equal=c.change.value===m.change.value;
      result.push(`${name}は${moveLabel(c)}が続き、報道で確認した前日比の${c.direction==='up'?'上げ幅':'下げ幅'}は${equal?'変わりませんでした':wider?'広がりました':'縮まりました'}。`);
    } else result.push(`${name}は、前場も大引けも${moveLabel(c)}と報じられています。値幅の変化は確認できていません。`);
  }
  return result.join('') || '両時間帯の終了時点を確認できる報道がそろわないため、流れが変わったかは判断していません。';
}
function newsSection(s) {
  let html=`<p>${esc(newsOverview(s))}</p>`;
  const strong=s.topics.filter(t=>t.direction==='up'),weak=s.topics.filter(t=>t.direction==='down');
  if (strong.length) html+=`<h3>強かったところ</h3>${newsFacts(s,strong.slice(0,3))}`;
  if (weak.length) html+=`<h3>弱かったところ</h3>${newsFacts(s,weak.slice(0,3))}`;
  if (s.stocks.length) html+=`<h3>${s.phase==='morning'?'前場で目立った銘柄':'今日の目立った銘柄'}</h3>${newsFacts(s,s.stocks.slice(0,5))}<p><small>取得ニュースで値動きを確認できた銘柄です。市場全体のランキングではありません。</small></p>`;
  return html;
}
export function buildPost(date,sessions) {
  const {morning,close}=sessions,latest=close||morning;
  let html=`<p><strong>${morning?`${timeLabel(morning.fetchedAt)} 前場更新`:'前場の報道は未取得'}</strong><br>${close?`${timeLabel(close.fetchedAt)} 大引け更新`:'15:50 大引け更新予定（16:00に再確認）'}</p><h2>今日の相場をざっくり</h2><p>${esc(newsOverview(latest))}</p>${Object.keys(latest.indices).length?'<h3>今日の指数の動き</h3>'+newsIndex(latest):''}`;
  if (morning) html+=`<hr><h2>前場どうだった？</h2>${newsSection(morning)}${close?'<h3>前場に報じられた指数の動き</h3>'+newsIndex(morning):''}<h3>後場で見るポイント</h3>${newsPoints(morning,true)}`;
  else html+='<h2>前場どうだった？</h2><p>当日の前場を確認できる報道を取得できませんでした。</p>';
  if (close) {
    const hero=close.stocks[0]||close.topics[0];
    html+=`<hr><h2>大引けどうだった？</h2><p>${esc(newsOverview(close))}</p>${close.topics.length?'<h3>大引けで報じられた特徴</h3>'+newsFacts(close,close.topics.slice(0,3)):''}<h3>前場から何が変わった？</h3><p>${esc(newsComparison(morning,close))}</p>${hero?`<h3>今日の主役</h3><p>取得した報道で注目したのは${esc(hero.name)}。${moveLabel(hero)}と報じられています。${evidenceLink(close,hero)}</p>`:''}<h3>今日の相場を一言で</h3><p><strong>${esc(newsOverview(close))}</strong></p><h3>明日に向けて</h3>${nextTradingDate(date)?`<p>次の営業日：${dateLabel(nextTradingDate(date))}（通常の日程に基づく予定）</p>`:''}${newsPoints(close,false)}`;
  }
  html+='<hr><p><small>当日のニュースから確認できた事実を、ルールに沿って短く整理しています。取得できるニュースには範囲・時刻の偏りがあります。銘柄選定は「明日狙う株」で扱います。</small></p>';
  return {id:postKey(date),slug:postKey(date),title:`${dateLabel(date)}の日本株｜前場どうだった？・大引けどうだった？`,category:'株',theme:'stock',date,summary:`${dateLabel(date)}の日本株。${newsOverview(latest)}`,bodyHtml:html};
}
