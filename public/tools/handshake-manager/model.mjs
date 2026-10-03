// Shared, pure domain logic: no network, DOM, or storage side effects.
export const STORAGE_KEY = 'meganemaru.handshake.v1';
export const SCHEDULE_KEY = 'meganemaru.handshake.schedules.v1';
export const DEFAULT_THRESHOLDS = { cautionMembers: 3, crowdedMembers: 4, cautionTickets: 6, crowdedTickets: 9 };
export const MAX_QUANTITY = 999;
const plain = v => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const string = (v, max = 160) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const integer = (v, min = 0, max = MAX_QUANTITY) => Number.isInteger(v) && v >= min && v <= max;
const assert = (v, m) => { if (!v) throw new Error(m); };
const exact = (v, fields) => { assert(plain(v) && Object.keys(v).every(k => fields.includes(k)), '未対応のデータ項目があります。'); };
const eventId = id => typeof id === 'string' && /^[a-z][a-z0-9-]{1,79}$/.test(id);
const time = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const unique = (items, key) => new Set(items.map(key)).size === items.length;
const stringArray = v => Array.isArray(v) && v.length <= 500 && v.every(x => string(x, 250)) && unique(v, x => x);
export function newState() { return { schemaVersion: 1, activeEventId: 'ske48-37th', thresholds: { ...DEFAULT_THRESHOLDS }, events: {} }; }
export function newEvent() { return { configured: false, selectedDays: [], selectedMembers: [], activeTab: 'all', mode: 'plan', entries: {} }; }
export function getEvent(state, id = state.activeEventId) { return state.events[id] ||= newEvent(); }
export function validateThresholds(v) {
  exact(v, Object.keys(DEFAULT_THRESHOLDS));
  assert(Object.keys(DEFAULT_THRESHOLDS).every(k => integer(v[k], 1, 999)) && v.cautionMembers <= v.crowdedMembers && v.cautionTickets <= v.crowdedTickets, '注意・混雑の設定が不正です。');
  return v;
}
export function validateSchedule(s) {
  assert(plain(s) && s.schemaVersion === 1 && eventId(s.eventId) && string(s.title) && string(s.sourceUrl, 500) && /^https:\/\//.test(s.sourceUrl) &&
    typeof s.fetchedAt === 'string' && Number.isFinite(Date.parse(s.fetchedAt)), 'スケジュールの形式が不正です。');
  assert(plain(s.types) && Object.keys(s.types).length > 0 && Object.keys(s.types).length <= 20, 'イベント種別が不正です。');
  for (const [id, t] of Object.entries(s.types)) assert(eventId(id) && plain(t) && string(t.label, 30) && string(t.icon, 12) && integer(t.ticketsPerVisit, 1, 99), 'イベント種別が不正です。');
  assert(Array.isArray(s.members) && s.members.length > 0 && s.members.length <= 500 && unique(s.members, m => m.id), 'メンバーが不正です。');
  for (const m of s.members) assert(plain(m) && string(m.id, 80) && string(m.name, 80) && string(m.team, 80), 'メンバーが不正です。');
  assert(Array.isArray(s.days) && s.days.length > 0 && s.days.length <= 100 && unique(s.days, d => d.id), '日程が不正です。');
  for (const d of s.days) {
    assert(plain(d) && date(d.date) && string(d.venue, 120) && d.id === `${d.date}@${d.venue}` && Array.isArray(d.parts) && d.parts.length > 0 && d.parts.length <= 30 && unique(d.parts, p => p.id), '日程が不正です。');
    for (const p of d.parts) assert(plain(p) && integer(p.number, 1, 99) && time(p.start) && time(p.end) && p.start < p.end && time(p.cutoff) && p.cutoff >= p.start && p.cutoff <= p.end && p.id === `${p.number}@${p.start}-${p.end}`, '参加部が不正です。');
  }
  assert(Array.isArray(s.slots) && s.slots.length > 0 && s.slots.length <= 50000 && unique(s.slots, x => x.id), '参加枠が不正です。');
  const dayMap = new Map(s.days.map(d => [d.id, d])), memberSet = new Set(s.members.map(m => m.id));
  for (const x of s.slots) assert(plain(x) && dayMap.get(x.dayId)?.parts.some(p => p.id === x.partId) && memberSet.has(x.memberId) && Object.hasOwn(s.types, x.type) && typeof x.note === 'string' && x.note.length <= 100 && x.id === JSON.stringify([x.dayId, x.memberId, x.partId, x.type]), '参加枠の対応が不正です。');
  return s;
}
export function validateEntry(id, e) {
  exact(e, ['quantity', 'status', 'used', 'dayId', 'memberId', 'partId', 'type', 'date', 'venue', 'name', 'number', 'start', 'end']);
  assert(integer(e.quantity, 1) && ['planned', 'applied'].includes(e.status) && typeof e.used === 'boolean' && (!e.used || e.status === 'applied') &&
    date(e.date) && string(e.venue, 120) && e.dayId === `${e.date}@${e.venue}` && string(e.memberId, 80) && string(e.name, 80) && eventId(e.type) &&
    integer(e.number, 1, 99) && time(e.start) && time(e.end) && e.start < e.end && e.partId === `${e.number}@${e.start}-${e.end}` &&
    id === JSON.stringify([e.dayId, e.memberId, e.partId, e.type]), '枚数または状態が不正です。');
}
export function validateState(v) {
  exact(v, ['schemaVersion', 'activeEventId', 'thresholds', 'events']);
  assert(v.schemaVersion === 1 && eventId(v.activeEventId), '保存形式が未対応です。');
  validateThresholds(v.thresholds);
  assert(plain(v.events) && Object.keys(v.events).length <= 50, 'イベントデータが不正です。');
  for (const [id, e] of Object.entries(v.events)) {
    assert(eventId(id), 'イベントIDが不正です。');
    exact(e, ['configured', 'selectedDays', 'selectedMembers', 'activeTab', 'mode', 'entries']);
    assert(typeof e.configured === 'boolean' && stringArray(e.selectedDays) && stringArray(e.selectedMembers) && string(e.activeTab, 250) && ['plan', 'day'].includes(e.mode) && plain(e.entries) && Object.keys(e.entries).length <= 20000, '設定の形式が不正です。');
    for (const [key, entry] of Object.entries(e.entries)) validateEntry(key, entry);
  }
  return v;
}
export function validateBackup(v) {
  exact(v, ['format', 'version', 'exportedAt', 'data', 'schedules']);
  assert(v.format === 'meganemaru-event-planner' && v.version === 1 && typeof v.exportedAt === 'string' && Number.isFinite(Date.parse(v.exportedAt)), 'このツールのバックアップではありません。');
  validateState(v.data);
  assert(plain(v.schedules) && Object.keys(v.schedules).length <= 50, '保存スケジュールが不正です。');
  for (const [id, s] of Object.entries(v.schedules)) { validateSchedule(s); assert(id === s.eventId, 'イベントIDが一致しません。'); }
  return v;
}
export function entryFor(slot, schedule, quantity = 1) {
  const day = schedule.days.find(d => d.id === slot.dayId), part = day.parts.find(p => p.id === slot.partId), member = schedule.members.find(m => m.id === slot.memberId);
  return { quantity, status: 'planned', used: false, dayId: day.id, memberId: member.id, partId: part.id, type: slot.type,
    date: day.date, venue: day.venue, name: member.name, number: part.number, start: part.start, end: part.end };
}
export function changeQuantity(event, slot, schedule, delta) {
  const current = event.entries[slot.id];
  const quantity = Math.max(0, Math.min(MAX_QUANTITY, (current?.quantity || 0) + delta));
  if (!quantity) { delete event.entries[slot.id]; return; }
  const next = entryFor(slot, schedule, quantity);
  if (current) { next.status = current.status; next.used = quantity === current.quantity ? current.used : false; }
  event.entries[slot.id] = next;
}
export function totals(entries, predicate = () => true) {
  const out = { quantity: 0, planned: 0, applied: 0, used: 0, remaining: 0, members: 0, byType: {} }, people = new Set();
  for (const e of Object.values(entries).filter(predicate)) {
    out.quantity += e.quantity; people.add(e.memberId);
    out.byType[e.type] = (out.byType[e.type] || 0) + e.quantity;
    if (e.used) out.used += e.quantity;
    else { out.remaining += e.quantity; out[e.status] += e.quantity; }
  }
  out.members = people.size;
  return out;
}
export function congestion(members, tickets, thresholds) {
  return members >= thresholds.crowdedMembers || tickets >= thresholds.crowdedTickets ? 'crowded'
    : members >= thresholds.cautionMembers || tickets >= thresholds.cautionTickets ? 'caution' : 'normal';
}
