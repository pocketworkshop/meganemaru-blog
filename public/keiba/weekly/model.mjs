// Workerとブラウザで共用。外部通信・ローカル時刻への依存は持たない。
const DAY = 86400000;
export const ROLES = [
  { id: 'pedigree', label: '血統', terms: ['血統担当', '血統分析', '血統の見解'] },
  { id: 'course', label: 'コース・過去走', terms: ['コース過去走', 'コース担当', '過去走担当', 'コース分析'] },
  { id: 'lap', label: 'ラップ', terms: ['ラップ適性', 'ラップ担当', 'ラップ分析'] },
  { id: 'training', label: '調教', terms: ['調教担当', '調教分析', '追い切り分析'] },
  { id: 'final', label: '最終予想', terms: ['統括担当', '最終予想'] },
  { id: 'review', label: '反省会', terms: ['AI予想チーム反省会', '反省会担当', 'レース後反省会'] },
];
export const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s・･、。:：/／\-‐–—_【】\[\]（）()「」『』]/g, '');
export const jstDateKey = (now = new Date()) => new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const addDays = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const weekday = key => new Date(`${key}T00:00:00Z`).getUTCDay();

export function getWeek(schedule, now = new Date()) {
  const today = jstDateKey(now);
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  // 年初の月曜開催など、重賞がない月曜も年間の開催日データで延長する。
  const extensions = new Set([...(schedule.extendedMondays || []), ...schedule.races.filter(r => weekday(r.date) === 1).map(r => r.date)]);
  const anchor = today === monday && extensions.has(today) ? addDays(monday, -7) : monday;
  const start = extensions.has(anchor) ? addDays(anchor, 1) : anchor;
  const nextMonday = addDays(anchor, 7);
  const end = extensions.has(nextMonday) ? nextMonday : addDays(anchor, 6);
  const years = [...new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))])];
  return { today, start, end, extended: end === nextMonday, endHoliday: schedule.races.some(r => r.date === end && r.holiday),
    nextSwitchAt: `${addDays(end, 1)}T00:00:00+09:00`,
    missingYears: years.filter(y => !(schedule.availableYears || []).includes(y)) };
}

function published(post) {
  return post?.category === '競馬' && (!post.status || post.status === 'published') && Boolean(post.slug || post.id);
}
function articleUrl(post) {
  return `/blog/article.html?slug=${encodeURIComponent(post.slug || post.id)}`;
}
function withinEdition(post, race) {
  const day = String(post.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return false;
  if (day < addDays(race.date, -30) || day > addDays(race.date, 14)) return false;
  const years = [...String(post.title || '').normalize('NFKC').matchAll(/(?:19|20)\d{2}(?=年|[\s【】\[\]（）()｜|]|$)/g)].map(m => m[0]);
  return !years.length || years.every(y => y === race.date.slice(0, 4));
}
function automaticMatch(post, race, allRaces, role) {
  if (!withinEdition(post, race)) return false;
  // 補足文・概要・本文で他担当に触れていても判定材料にはしない。
  const heading = normalize(String(post.title || '').split(/[｜|]/)[0]);
  const roleMatches = ROLES.filter(r => r.terms.some(term => heading.includes(normalize(term))));
  if (roleMatches.length !== 1 || roleMatches[0].id !== role.id) return false;
  const matches = [];
  for (const r of allRaces) for (const name of [r.name, ...(r.aliases || [])]) {
    const needle = normalize(name);
    if (!needle) continue;
    let at = heading.indexOf(needle);
    while (at !== -1) {
      matches.push({ id: r.id, start: at, end: at + needle.length });
      at = heading.indexOf(needle, at + needle.length);
    }
  }
  // 長い別レース名の内部にある短い名称だけを除外。複数レースの記事はリンクしない。
  const standalone = matches.filter(m => !matches.some(other => other.id !== m.id && other.start <= m.start && other.end >= m.end && other.end - other.start > m.end - m.start));
  const ids = new Set(standalone.map(m => m.id));
  return ids.size === 1 && ids.has(race.id);
}

export function buildWeekly(schedule, posts, now = new Date(), articlesAvailable = true) {
  const week = getWeek(schedule, now);
  const visible = (Array.isArray(posts) ? posts : []).filter(published).sort((a, b) =>
    String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date)) || String(b.slug || b.id).localeCompare(String(a.slug || a.id)));
  const races = schedule.races.filter(r => r.date >= week.start && r.date <= week.end).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map(race => {
    const editionRaces = schedule.races.filter(r => r.date.slice(0, 4) === race.date.slice(0, 4));
    const articles = ROLES.map(role => {
      // 任意の補助指定も「現在公開されている記事」の存在を必ず確認する。
      const manual = race.articleSlugs?.[role.id];
      const post = articlesAvailable && visible.find(p => manual
        ? p.slug === manual || p.id === manual
        : automaticMatch(p, race, editionRaces, role));
      return { role: role.id, label: role.label, status: !articlesAvailable ? 'unknown' : post ? 'published' : 'unpublished',
        ...(post ? { url: articleUrl(post), title: String(post.title || '') } : {}) };
    });
    return { id: race.id, name: race.name, grade: race.grade, date: race.date, holiday: Boolean(race.holiday), venue: race.venue, surface: race.surface, distance: race.distance, articles };
  });
  return { week, races, articlesAvailable, verifiedAt: schedule.verifiedAt, checkedAt: new Date(now).toISOString() };
}

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function displayDate(key, holiday = false) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}月${d}日（${'日月火水木金土'[weekday(key)]}${holiday ? '・祝' : ''}）`;
}
export function weekLabel(week) {
  return `${week.start.slice(0, 4)}年 ${displayDate(week.start)}〜${displayDate(week.end, week.endHoliday)}`;
}
export function renderCards(data) {
  if (!data.races.length) return `<div class="wr-empty panel"><h2>${data.week.missingYears.length ? '重賞日程は準備中です' : '今週のJRA重賞はありません'}</h2><p>${data.week.missingYears.length ? `${data.week.missingYears.join('・')}年の日程が未登録です。最新情報はJRA公式サイトをご確認ください。` : '次の開催週に自動で切り替わります。'}</p><a href="https://www.jra.go.jp/keiba/calendar/" target="_blank" rel="noopener noreferrer">JRAの開催日程を確認 ↗</a></div>`;
  return data.races.map(race => {
    const count = race.articles.filter(a => a.status === 'published').length;
    return `<article class="wr-card panel"><header class="wr-card-head"><span class="wr-grade${race.grade === 'GⅠ' || race.grade === 'J・GⅠ' ? ' wr-grade-gi' : ''}">${escapeHtml(race.grade)}</span><h2>${escapeHtml(race.name)}</h2><time datetime="${escapeHtml(race.date)}">${displayDate(race.date, race.holiday)}</time><p class="wr-course">${escapeHtml(race.venue)}・${escapeHtml(race.surface)}${Number(race.distance).toLocaleString('ja-JP')}m</p></header><div class="wr-team"><h3>AI予想チーム</h3><span>${data.articlesAvailable ? `${count} / 6 公開` : '確認できません'}</span></div><ul class="wr-articles">${race.articles.map(a => {
      const content = `<span class="wr-role">${escapeHtml(a.label)}</span><span class="wr-status"><span aria-hidden="true">${a.status === 'published' ? '✅' : a.status === 'unknown' ? '—' : '⏳'}</span> ${a.status === 'published' ? '公開済み' : a.status === 'unknown' ? '確認できません' : '未公開'}</span>`;
      return `<li>${a.status === 'published' ? `<a class="wr-article wr-published" href="${escapeHtml(a.url)}" aria-label="${escapeHtml(race.name)}：${escapeHtml(a.label)}の記事を読む" title="${escapeHtml(a.title)}">${content}<span class="wr-arrow" aria-hidden="true">›</span></a>` : `<div class="wr-article wr-${a.status}">${content}<span class="wr-arrow" aria-hidden="true"></span></div>`}</li>`;
    }).join('')}</ul></article>`;
  }).join('');
}
