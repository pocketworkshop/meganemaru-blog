// Public schedule only. Never follow links, execute remote JS, or use cookies.
export const EVENTS = [{
  id: 'ske48-37th', title: 'SKE48 37thシングル「ため息未来」',
  sourceUrl: 'https://shop.mu-mo.net/st/special/ske48_37thsg/list.html?jsiteid=mumo',
  snapshotPath: '/tools/handshake-manager/ske48-37th.json',
  teams: ['チームS', 'チームKⅡ', 'チームE', '研究生'],
}];
export const TYPES = {
  handshake: { label: '握手', icon: '🤝', ticketsPerVisit: 1 },
  talk: { label: 'トーク', icon: '💬', ticketsPerVisit: 1 },
  photo: { label: '撮影', icon: '📷', ticketsPerVisit: 3 },
};
const PREFIX = 'handshake:schedule:v1:';
const clean = s => s.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&(?:nbsp|#160);/g, ' ').replace(/&raquo;/g, '»').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&').trim();
const fail = message => { throw new Error(message); };
const matches = (s, re) => [...s.matchAll(re)].map(m => m[1]);
const timeMinutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function parseSchedule(html, event = EVENTS[0], fetchedAt = new Date().toISOString()) {
  // Strict adapter for the actually inspected mu-mo tabs1..4 / list1..4 format.
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const days = new Map(), members = new Map(), slots = new Map();
  for (let team = 1; team <= event.teams.length; team++) {
    const ul = source.match(new RegExp(`<ul\\b[^>]*\\bid=["']tabs${team}["'][^>]*>([\\s\\S]*?)</ul>`, 'i'))?.[1];
    if (!ul) fail(`tabs${team}が見つかりません。`);
    const labels = matches(ul, /<li\b[^>]*>([\s\S]*?)<\/li>/gi);
    const blocks = matches(source, new RegExp(`<div\\b[^>]*\\bclass=["']list${team}(?:\\s+disnon)?["'][^>]*>([\\s\\S]*?)</div>`, 'gi'));
    if (!labels.length || blocks.length !== labels.length) fail(`チーム${team}の日程と表の数が一致しません。`);
    labels.forEach((label, index) => {
      const lines = clean(label).split('\n').map(x => x.trim()).filter(Boolean);
      const date = lines[0]?.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const venue = lines[1];
      const kind = lines[2];
      const type = kind === '（握手会）' ? 'handshake' : kind === '（現地でトーク会）' ? 'talk'
        : kind === '（現地で2ショット撮影会）' ? 'photo' : null;
      if (!date || !venue || !type) fail('日程・会場・イベント種別を読めません。');
      const dateKey = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
      if (new Date(`${dateKey}T00:00:00Z`).toISOString().slice(0, 10) !== dateKey) fail('日付が不正です。');
      const dayId = `${dateKey}@${venue}`;
      const note = lines.slice(3).join(' ');
      if (!days.has(dayId)) days.set(dayId, { id: dayId, date: dateKey, venue, parts: [] });
      const day = days.get(dayId);
      const tables = matches(blocks[index], /<table\b[^>]*>([\s\S]*?)<\/table>/gi);
      if (tables.length !== 2) fail('部の時間表とメンバー表を識別できません。');
      const headers = matches(tables[0], /<th\b[^>]*>([\s\S]*?)<\/th>/gi);
      if (!headers.length) fail('部の時間がありません。');
      const parts = new Map();
      headers.forEach(header => {
        const text = clean(header).replace(/\s/g, '');
        const m = text.match(/^(\d+)部(\d{2}:\d{2})[～〜~－-](\d{2}:\d{2})レーン締切\/(\d{2}:\d{2})$/);
        if (!m) fail('部の時間形式が変更されています。');
        const [, number, start, end, cutoff] = m;
        if (![start, end, cutoff].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) ||
          timeMinutes(start) >= timeMinutes(end) || timeMinutes(cutoff) < timeMinutes(start) || timeMinutes(cutoff) > timeMinutes(end)) fail('部の時間が不正です。');
        const part = { id: `${number}@${start}-${end}`, number: Number(number), start, end, cutoff };
        if (parts.has(Number(number))) fail('部番号が重複しています。');
        parts.set(Number(number), part);
        const prior = day.parts.find(p => p.id === part.id);
        if (prior && prior.cutoff !== cutoff) fail('同じ部の締切が一致しません。');
        if (!prior) day.parts.push(part);
      });
      const rows = matches(tables[1], /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
      if (!rows.length) fail('メンバー表が空です。');
      const seenMembers = new Set();
      rows.forEach(row => {
        const names = matches(row, /<th\b[^>]*>([\s\S]*?)<\/th>/gi);
        const cells = matches(row, /<td\b[^>]*>([\s\S]*?)<\/td>/gi);
        const name = clean(names[0] || '');
        if (names.length !== 1 || !name || name.length > 80 || !cells.length || seenMembers.has(name)) fail('メンバー行を読めません。');
        seenMembers.add(name);
        const memberId = name;
        const prior = members.get(memberId);
        if (prior && prior.team !== event.teams[team - 1]) fail('メンバーの所属が重複しています。');
        members.set(memberId, { id: memberId, name, team: event.teams[team - 1] });
        cells.forEach(cell => {
          const text = clean(cell);
          if (!text) return; // Absence is not a zero-quantity slot.
          const m = text.match(/^(\d+)部$/);
          const part = m && parts.get(Number(m[1]));
          if (!part) fail('参加部に未対応の表記があります。');
          const id = JSON.stringify([dayId, memberId, part.id, type]);
          if (slots.has(id)) fail('参加枠が重複しています。');
          slots.set(id, { id, dayId, memberId, partId: part.id, type, note });
        });
      });
    });
  }
  if (!slots.size) fail('参加枠がありません。');
  return {
    schemaVersion: 1, eventId: event.id, title: event.title, sourceUrl: event.sourceUrl, fetchedAt,
    types: TYPES, members: [...members.values()],
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue))
      .map(d => ({ ...d, parts: d.parts.sort((a, b) => a.start.localeCompare(b.start) || a.number - b.number) })),
    slots: [...slots.values()],
  };
}

function json(data, status = 200, ttl = 300) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': status === 200 ? `public, max-age=${ttl}` : 'no-store',
  } });
}
export async function handleHandshake(request, env, ctx) {
  const url = new URL(request.url);
  if (!['/api/handshake/events', '/api/handshake/schedule'].includes(url.pathname)) return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'Method Not Allowed' }, 405);
  if (url.pathname.endsWith('/events')) return json({ ok: true, events: EVENTS.map(({ teams, ...e }) => e) });
  const event = EVENTS.find(e => e.id === (url.searchParams.get('event') || EVENTS[0].id));
  if (!event) return json({ ok: false, error: '未対応のイベントです。' }, 404);
  const cacheKey = new Request(`${url.origin}/api/handshake/schedule?event=${event.id}&v=1`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;
  try {
    let schedule = null, status = null;
    if (env.CMS_IMAGES) {
      [schedule, status] = await Promise.all([
        env.CMS_IMAGES.get(PREFIX + event.id, 'json'),
        env.CMS_IMAGES.get(PREFIX + event.id + ':status', 'json'),
      ]);
    }
    const cacheSource = schedule ? 'kv' : 'bundled';
    if (!schedule) {
      const response = await env.ASSETS.fetch(new Request(new URL(event.snapshotPath, request.url)));
      if (!response.ok) throw new Error('公開スケジュールを読み込めません。');
      schedule = await response.json();
    }
    if (schedule?.schemaVersion !== 1 || schedule.eventId !== event.id || !schedule.slots?.length) throw new Error('保存スケジュールが不正です。');
    const stale = Date.now() - Date.parse(schedule.fetchedAt) > 48 * 3600 * 1000;
    const response = json({ ok: true, schedule, cacheSource, stale,
      lastAttemptAt: status?.attemptedAt || null,
      warning: status?.ok === false ? '公開スケジュールの更新に失敗しました。前回確認できた内容を表示しています。'
        : stale ? '公開スケジュールの確認から48時間以上経過しています。公式ページも確認してください。' : null,
    });
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('Handshake schedule read failed:', String(error?.message || error));
    return json({ ok: false, error: '公開スケジュールを取得できません。端末の申込データは保持しています。' }, 503);
  }
}

// Refresh only from the existing daily Cron; public requests never fetch mu-mo.
// Isolate this task from the existing SKE48 digest task.
export async function refreshHandshakeSchedules(env) {
  if (!env.CMS_IMAGES) { console.error('Handshake cache: CMS_IMAGES binding unavailable.'); return; }
  for (const event of EVENTS) {
    const attemptedAt = new Date().toISOString();
    try {
      const previous = await env.CMS_IMAGES.get(PREFIX + event.id + ':status', 'json');
      if (previous && Date.now() - Date.parse(previous.attemptedAt) < 23 * 3600 * 1000) continue;
      // Mark before fetch: repeated delivery does not normally refetch the source.
      await env.CMS_IMAGES.put(PREFIX + event.id + ':status', JSON.stringify({ attemptedAt, ok: false }));
      const response = await fetch(event.sourceUrl, {
        redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('公開HTMLが想定サイズを超えています。');
      const html = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
      const schedule = parseSchedule(html, event, attemptedAt);
      await env.CMS_IMAGES.put(PREFIX + event.id, JSON.stringify(schedule));
      await env.CMS_IMAGES.put(PREFIX + event.id + ':status', JSON.stringify({ attemptedAt, ok: true }));
    } catch (error) {
      // Leave the last known-good cache untouched. No fabricated participation.
      console.error('Handshake public schedule refresh failed:', event.id, String(error?.message || error));
    }
  }
}
