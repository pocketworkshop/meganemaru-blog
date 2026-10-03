import { STORAGE_KEY, SCHEDULE_KEY, newState, newEvent, getEvent, validateState, validateSchedule, validateBackup,
  validateThresholds, changeQuantity, totals, congestion, MAX_QUANTITY } from './model.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = newState(), snapshots = {}, catalog = [], current = null, slotMap = new Map(), storageBlocked = false, rawState = null;
let setupStep = 0, setupFirst = false, toastTimer, networkInfo = null, busy = false;
const event = () => getEvent(state);
const dayLabel = d => `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8))}`;
const notice = (message = '') => { $('message').textContent = message; $('message').hidden = !message; };
function toast(message, failed = false) {
  clearTimeout(toastTimer); $('saved').textContent = message;
  $('saved').className = `toast visible${failed ? ' failed' : ''}`;
  toastTimer = setTimeout(() => $('saved').classList.remove('visible'), 1800);
}
function save() {
  if (storageBlocked) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); toast('✓ 保存済み'); return true; }
  catch { toast('保存できませんでした', true); notice('端末への保存に失敗しました。今の内容をバックアップで書き出してください。'); return false; }
}
function saveSnapshots() {
  try { localStorage.setItem(SCHEDULE_KEY, JSON.stringify(snapshots)); }
  catch { notice('公開スケジュールの端末保存に失敗しました。オフライン時の表示ができない場合があります。枚数は別に保存しています。'); }
}
function loadStorage() {
  try {
    rawState = localStorage.getItem(STORAGE_KEY);
    if (rawState) state = validateState(JSON.parse(rawState));
  } catch { storageBlocked = true; $('storageError').hidden = false; }
  try {
    const saved = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '{}');
    if (!saved || Array.isArray(saved) || typeof saved !== 'object') throw new Error();
    for (const [id, s] of Object.entries(saved)) { validateSchedule(s); if (id !== s.eventId) throw new Error(); }
    snapshots = saved;
  } catch { snapshots = {}; }
}
async function api(path) {
  const response = await fetch(path, { credentials: 'omit', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('公開スケジュールを読み込めません。');
  const data = await response.json(); if (!data.ok) throw new Error(data.error || '読み込みに失敗しました。'); return data;
}
function catalogOptions() {
  const all = new Map(catalog.map(e => [e.id, e]));
  for (const s of Object.values(snapshots)) if (!all.has(s.eventId)) all.set(s.eventId, { id: s.eventId, title: s.title + '（保存済み）' });
  // Keep an event even if its current source is unavailable.
  for (const id of Object.keys(state.events)) if (!all.has(id)) all.set(id, { id, title: id + '（保存データ）' });
  $('eventSelect').innerHTML = [...all.values()].map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');
  $('eventSelect').value = state.activeEventId;
  $('eventSelect').disabled = storageBlocked || busy || !all.size;
}
async function loadEvent(openSetup = true) {
  busy = true; $('eventSelect').disabled = true; $('reload').disabled = true; $('settings').disabled = true;
  const id = state.activeEventId; current = snapshots[id] || null; networkInfo = null;
  if (current) activateSchedule();
  try {
    if (!catalog.some(e => e.id === id)) throw new Error('このイベントは端末に保存された内容で表示しています。');
    const data = await api(`/api/handshake/schedule?event=${encodeURIComponent(id)}`);
    const s = validateSchedule(data.schedule);
    if (s.eventId !== id) throw new Error('イベントが一致しません。');
    current = s; snapshots[id] = s; networkInfo = data; saveSnapshots();
    notice(data.warning || '');
  } catch (error) {
    notice(current ? `${error.message} 前回のスケジュールを表示しています。` : `${error.message} 申込データは保持しています。再読込かバックアップの復元をお試しください。`);
  }
  busy = false; $('reload').disabled = false; catalogOptions(); activateSchedule();
  if (current && openSetup && !event().configured && !storageBlocked) openSettings(true);
}
function activateSchedule() {
  slotMap = new Map((current?.slots || []).map(s => [s.id, s]));
  $('settings').disabled = !current || busy || storageBlocked;
  if (current) {
    const checked = new Date(current.fetchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    $('sourceInfo').innerHTML = `公式確認：${esc(checked)}（日本時間） · <a href="${esc(current.sourceUrl)}" target="_blank" rel="noopener noreferrer">公開スケジュール</a><br>自動更新は1日1回。再読込は保存済みスケジュールを読み直します。`;
  } else $('sourceInfo').textContent = '公開スケジュールを表示できません。個人データは削除していません。';
  render();
}
function render() {
  if (!current) {
    $('tabs').hidden = true;
    $('workspace').innerHTML = `<div class="panel empty">スケジュールを取得できませんでした。<br>保存データはバックアップとして書き出せます。</div>`; return;
  }
  const e = event(), days = current.days.filter(d => e.selectedDays.includes(d.id));
  if (e.activeTab !== 'all' && !days.some(d => d.id === e.activeTab)) e.activeTab = days[0]?.id || 'all';
  $('tabs').hidden = false;
  $('tabs').innerHTML = `<button data-tab="all" aria-current="${e.activeTab === 'all'}">全体</button>` + days.map(d =>
    `<button data-tab="${esc(d.id)}" aria-current="${e.activeTab === d.id}">${dayLabel(d)}<small>${esc(d.venue)}</small></button>`).join('');
  if (e.activeTab === 'all') renderSummary();
  else renderTable(current.days.find(d => d.id === e.activeTab));
}
function metric(label, value) { return `<div class="metric"><span>${esc(label)}</span><b>${value}<small> 枚</small></b></div>`; }
function hiddenEntries() {
  const e = event();
  return Object.values(e.entries).filter(x => !e.selectedDays.includes(x.dayId) || !e.selectedMembers.includes(x.memberId));
}
function renderSummary() {
  const e = event(), t = totals(e.entries), unknown = Object.entries(e.entries).filter(([id]) => !slotMap.has(id));
  const allDays = new Map(current.days.map(d => [d.id, d]));
  const allMembers = new Map(current.members.map(m => [m.id, m]));
  for (const x of Object.values(e.entries)) {
    if (!allDays.has(x.dayId)) allDays.set(x.dayId, { id: x.dayId, date: x.date, venue: x.venue });
    if (!allMembers.has(x.memberId)) allMembers.set(x.memberId, { id: x.memberId, name: x.name });
  }
  const hidden = hiddenEntries().reduce((n, x) => n + x.quantity, 0);
  const dayRows = [...allDays.values()].sort((a, b) => a.date.localeCompare(b.date)).filter(d => e.selectedDays.includes(d.id) || totals(e.entries, x => x.dayId === d.id).quantity).map(d => {
    const dt = totals(e.entries, x => x.dayId === d.id);
    return `<div class="summary-row"><p>${esc(d.date)}<small>${esc(d.venue)} ${e.selectedDays.includes(d.id) ? '' : '<span class="hidden-tag">非表示</span>'}</small></p><b>${dt.quantity}枚<small>残り ${dt.remaining}枚</small></b></div>`;
  }).join('');
  const memberRows = [...allMembers.values()].filter(m => totals(e.entries, x => x.memberId === m.id).quantity).map(m => {
    const mt = totals(e.entries, x => x.memberId === m.id);
    return `<div class="summary-row"><p>${esc(m.name)} ${e.selectedMembers.includes(m.id) ? '' : '<span class="hidden-tag">非表示</span>'}</p><b>${mt.quantity}枚</b></div>`;
  }).join('');
  $('workspace').innerHTML = `<section class="panel"><h2>全体の予定</h2><p class="small">このイベントの全入力を集計します。非表示の日程・メンバーも含みます。</p>
    <div class="cards">${metric('合計', t.quantity)}${metric('申込予定', t.planned)}${metric('申込済み・未使用', t.applied)}${metric('使用済み', t.used)}</div>
    <div class="type-totals">${Object.entries(current.types).map(([id, type]) => `<span class="badge ${esc(id)}">${esc(type.icon)} ${esc(type.label)} ${t.byType[id] || 0}枚</span>`).join('')}</div>
    ${hidden ? `<p class="notice">非表示の予定が ${hidden}枚あります。データは残っています。</p>` : ''}
    ${!e.configured ? '<button data-open-settings class="primary">日程とメンバーを選んで始める</button>' : ''}
    ${!e.selectedDays.length || !e.selectedMembers.length ? '<p>「日程・メンバー」で管理する日とメンバーを選んでください。</p>' : ''}
    <h3>日程別</h3><div class="summary-list">${dayRows || '<p class="small">まだ予定がありません。</p>'}</div>
    <h3 style="margin-top:24px">メンバー別</h3><div class="summary-list">${memberRows || '<p class="small">＋で枚数を入れると表示されます。</p>'}</div>
    ${unknown.length ? `<details class="notice" style="margin-top:18px"><summary>最新スケジュールにない保存済み枠：${unknown.length}件</summary><p class="small">変更・欠席等の可能性があるため入力を止めています。元の枚数は集計・バックアップに残します。公式情報を確認してください。</p>${unknown.map(([, x]) => `<p>${esc(x.date)} ${esc(x.name)} ${x.number}部 · ${esc(current.types[x.type]?.label || x.type)} ${x.quantity}枚</p>`).join('')}</details>` : ''}
    </section>`;
}
function partTotals(dayId, partId) {
  const e = event(), isDay = e.mode === 'day';
  return totals(e.entries, x => x.dayId === dayId && x.partId === partId && (!isDay || !x.used));
}
function renderTable(day) {
  const e = event(), isDay = e.mode === 'day', members = current.members.filter(m => e.selectedMembers.includes(m.id));
  const cells = new Map();
  for (const s of current.slots.filter(s => s.dayId === day.id)) {
    const key = JSON.stringify([s.memberId, s.partId]);
    if (!cells.has(key)) cells.set(key, []); cells.get(key).push(s);
  }
  const dt = totals(e.entries, x => x.dayId === day.id);
  const hiddenQty = totals(e.entries, x => x.dayId === day.id && (!e.selectedMembers.includes(x.memberId) || !slotMap.has(JSON.stringify([x.dayId, x.memberId, x.partId, x.type])))).quantity;
  const header = day.parts.map(p => {
    const t = partTotals(day.id, p.id), level = congestion(t.members, t.quantity, state.thresholds);
    return `<th scope="col" class="${level}"><strong>${p.number}部</strong><small>${p.start}〜${p.end}</small><small>レーン締切 ${p.cutoff}</small><div class="part-total ${level}">${t.members}人・${t.quantity}枚 ${level === 'crowded' ? '● 混雑' : level === 'caution' ? '△ 注意' : ''}</div></th>`;
  }).join('');
  const body = members.map(m => `<tr><th scope="row" class="member">${esc(m.name)}<small>${esc(m.team)}</small></th>${day.parts.map(p => {
    const available = cells.get(JSON.stringify([m.id, p.id]));
    if (!available) return '<td class="unavailable" aria-label="参加枠なし">―</td>';
    return `<td>${available.map(s => renderSlot(s, m, p, isDay)).join('')}</td>`;
  }).join('')}</tr>`).join('');
  const footer = day.parts.map(p => {
    const t = partTotals(day.id, p.id), level = congestion(t.members, t.quantity, state.thresholds);
    return `<td class="${level}"><b>${t.members}人</b><b>${t.quantity}枚</b><span>${level === 'crowded' ? '● 混雑' : level === 'caution' ? '△ 注意' : '通常'}</span></td>`;
  }).join('');
  $('workspace').innerHTML = `<section class="panel"><div class="day-top"><div><h2>${esc(day.date)} · ${esc(day.venue)}</h2><p class="small">合計 ${dt.quantity}枚 · 未使用 ${dt.remaining}枚 · 使用済み ${dt.used}枚</p></div><div class="mode-picker"><button data-mode="plan" aria-pressed="${!isDay}">申込計画</button><button data-mode="day" aria-pressed="${isDay}">当日</button></div></div>
    <div class="legend">${Object.entries(current.types).filter(([id]) => current.slots.some(s => s.dayId === day.id && s.type === id)).map(([id, t]) => `<span class="badge ${esc(id)}">${esc(t.icon)} ${esc(t.label)}</span>`).join('')}<span>― 参加枠なし</span></div>
    ${hiddenQty ? `<p class="notice">表に出ていない予定が ${hiddenQty}枚あります。部ごとの集計には含めています。</p>` : ''}
    <p class="table-hint">↔ 表を横に動かせます。${isDay ? '集計は未使用の枠だけ。使い終わった枠にチェック。' : '集計は全入力。人数・枚数の集中を確認しましょう。'}</p>
    ${members.length ? `<div class="table-scroll ${isDay ? 'day' : ''}" tabindex="0" aria-label="メンバーと部の管理表。横と縦にスクロールできます。"><table><thead><tr><th class="member" scope="col">メンバー<br><small>${isDay ? '未使用を集計' : '全入力を集計'}</small></th>${header}</tr></thead><tbody>${body}</tbody><tfoot><tr><th class="member" scope="row">${isDay ? '残りの予定' : '部の合計'}</th>${footer}</tr></tfoot></table></div>` : '<div class="empty">管理するメンバーを設定してください。</div>'}
    <p class="small" style="margin:12px 0 0">注意：${state.thresholds.cautionMembers}人以上 または ${state.thresholds.cautionTickets}枚以上／混雑：${state.thresholds.crowdedMembers}人以上 または ${state.thresholds.crowdedTickets}枚以上。設定で変更できます。</p></section>`;
}
function renderSlot(s, member, part, isDay) {
  const x = event().entries[s.id], q = x?.quantity || 0, t = current.types[s.type];
  const label = `${member.name} ${part.number}部 ${t.label}`;
  const disabled = storageBlocked ? 'disabled' : '';
  if (isDay && !q) return `<div class="slot ${esc(s.type)}"><span class="slot-label">${esc(t.icon)} ${esc(t.label)}</span><div class="no-tickets">予定なし</div></div>`;
  return `<div class="slot ${esc(s.type)}${x?.used ? ' used' : ''}" data-slot="${esc(s.id)}"><div class="slot-label">${esc(t.icon)} ${esc(t.label)}${s.note ? ` · ${esc(s.note.replace(/^※/, ''))}` : ''}</div>
    ${isDay ? `<span class="quantity">${q}<small> 枚</small></span>` : `<div class="stepper"><button data-delta="-1" aria-label="${esc(label)}を1枚減らす" ${!q || storageBlocked ? 'disabled' : ''}>−</button><span class="quantity" aria-label="${esc(label)}の枚数">${q}</span><button data-delta="1" aria-label="${esc(label)}を1枚増やす" ${q >= MAX_QUANTITY || storageBlocked ? 'disabled' : ''}>＋</button></div>`}
    <div class="slot-actions"><button class="state-button${x?.status === 'applied' ? ' applied' : ''}" data-status aria-label="${esc(label)}の申込状態" ${!q || x?.used || storageBlocked ? 'disabled' : ''}>${x?.used ? '使用済み' : x?.status === 'applied' ? '申込済み' : '申込予定'}</button>
    <label class="used-check"><input type="checkbox" data-used aria-label="${esc(label)}を使用済みにする" ${x?.used ? 'checked' : ''} ${!q || storageBlocked ? 'disabled' : ''}>${x?.used ? '✓ 使用済み' : '使用済み'}</label></div></div>`;
}
function redrawKeepPosition(action) {
  const scroller = document.querySelector('.table-scroll');
  const pos = { left: scroller?.scrollLeft || 0, top: scroller?.scrollTop || 0, y: window.scrollY };
  const focusSlot = document.activeElement?.closest('[data-slot]')?.dataset.slot;
  const focusAction = document.activeElement?.hasAttribute('data-delta') ? `[data-delta="${document.activeElement.dataset.delta}"]`
    : document.activeElement?.hasAttribute('data-used') ? '[data-used]' : '[data-status]';
  action(); save(); render();
  const next = document.querySelector('.table-scroll');
  if (next) { next.scrollLeft = pos.left; next.scrollTop = pos.top; }
  if (focusSlot) [...document.querySelectorAll('[data-slot]')].find(n => n.dataset.slot === focusSlot)?.querySelector(focusAction)?.focus({ preventScroll: true });
  window.scrollTo({ top: pos.y });
}
$('tabs').addEventListener('click', ev => {
  const button = ev.target.closest('[data-tab]'); if (!button || storageBlocked) return;
  event().activeTab = button.dataset.tab; save(); render();
});
$('workspace').addEventListener('click', ev => {
  if (ev.target.closest('[data-open-settings]')) return openSettings(true);
  const mode = ev.target.closest('[data-mode]');
  if (mode && !storageBlocked) { event().mode = mode.dataset.mode; save(); render(); return; }
  const card = ev.target.closest('[data-slot]'); if (!card || storageBlocked) return;
  const slot = slotMap.get(card.dataset.slot); if (!slot) return;
  const delta = ev.target.closest('[data-delta]');
  if (delta) redrawKeepPosition(() => changeQuantity(event(), slot, current, Number(delta.dataset.delta)));
  if (ev.target.closest('[data-status]')) redrawKeepPosition(() => {
    const x = event().entries[slot.id]; if (x && !x.used) x.status = x.status === 'planned' ? 'applied' : 'planned';
  });
});
$('workspace').addEventListener('change', ev => {
  if (!ev.target.matches('[data-used]') || storageBlocked) return;
  const id = ev.target.closest('[data-slot]').dataset.slot, x = event().entries[id]; if (!x || !slotMap.has(id)) return;
  redrawKeepPosition(() => { x.used = ev.target.checked; if (x.used) x.status = 'applied'; });
});
$('eventSelect').addEventListener('change', async ev => {
  if (storageBlocked) return; state.activeEventId = ev.target.value; getEvent(state); save(); await loadEvent();
});
$('reload').addEventListener('click', () => loadEvent(false));
$('settings').addEventListener('click', () => openSettings(!event().configured));

function openSettings(first) {
  if (!current || storageBlocked) return;
  setupFirst = first; setupStep = first ? 0 : 1;
  $('setupTitle').textContent = first ? 'はじめの設定' : '日程・メンバーの設定';
  $('setupError').hidden = true; renderSetup(); $('setupDialog').showModal();
}
function renderSetup() {
  const e = event(); $('setupProgress').textContent = `${setupStep + 1} / 3 · ${['イベント', '参加予定の日程', '管理するメンバー'][setupStep]}`;
  $('setupBack').hidden = setupStep === 0 || (!setupFirst && setupStep === 1);
  $('setupNext').textContent = setupStep === 2 ? '管理表を開く' : '次へ';
  if (setupStep === 0) {
    $('setupBody').innerHTML = `<p>管理するイベントを選びます。</p><label class="event-label">イベント<select id="setupEvent">${$('eventSelect').innerHTML}</select></label><p class="small" style="margin-top:16px">個人データはこのブラウザだけに保存します。購入操作は行いません。</p>`;
    $('setupEvent').value = state.activeEventId;
    $('setupEvent').addEventListener('change', async ev => {
      state.activeEventId = ev.target.value; getEvent(state); save(); $('setupNext').disabled = true;
      await loadEvent(false); $('setupNext').disabled = false;
      if (current) renderSetup(); else $('setupDialog').close();
    });
  } else if (setupStep === 1) {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    $('setupBody').innerHTML = `<p>行く日だけをチェックしてください。外しても入力済みの枚数は残ります。</p>${current.days.map(d => `<label class="choice"><input type="checkbox" data-day="${esc(d.id)}" ${e.selectedDays.includes(d.id) ? 'checked' : ''}><span>${esc(d.date)} ${d.date < today ? '<small>終了した日程</small>' : ''}<small>${esc(d.venue)}</small></span></label>`).join('')}`;
  } else {
    $('setupBody').innerHTML = `<p>行く可能性のあるメンバーだけをチェックしてください。</p><input id="memberSearch" type="search" class="member-search" placeholder="メンバー名で絞り込み" aria-label="メンバー名で絞り込み"><div class="setup-members">${current.members.map(m => `<label class="choice member-choice" data-name="${esc(m.name)}"><input type="checkbox" data-member="${esc(m.id)}" ${e.selectedMembers.includes(m.id) ? 'checked' : ''}><span>${esc(m.name)}<small>${esc(m.team)}</small></span></label>`).join('')}</div><details class="thresholds"><summary>注意・混雑の目安を変更</summary><p class="small">人数または枚数のどちらかで色を変えます。</p><div class="threshold-grid">${[['cautionMembers', '注意：人数'], ['crowdedMembers', '混雑：人数'], ['cautionTickets', '注意：枚数'], ['crowdedTickets', '混雑：枚数']].map(([key, label]) => `<label>${label}<input type="number" inputmode="numeric" min="1" max="999" data-threshold="${key}" value="${state.thresholds[key]}"></label>`).join('')}</div></details>`;
    $('memberSearch').addEventListener('input', ev => {
      const q = ev.target.value.trim();
      document.querySelectorAll('.member-choice').forEach(n => { n.hidden = !n.dataset.name.includes(q); n.style.display = n.hidden ? 'none' : ''; });
    });
  }
}
$('setupBody').addEventListener('change', ev => {
  const input = ev.target, e = event();
  if (input.matches('[data-day],[data-member]')) {
    const field = input.hasAttribute('data-day') ? 'selectedDays' : 'selectedMembers';
    const id = input.dataset.day || input.dataset.member;
    e[field] = input.checked ? [...new Set([...e[field], id])] : e[field].filter(x => x !== id);
    // These selections never filter/delete saved entries.
    save(); render();
  }
  if (input.matches('[data-threshold]')) {
    try { const next = { ...state.thresholds, [input.dataset.threshold]: Number(input.value) }; validateThresholds(next); state.thresholds = next; save(); render(); $('setupError').hidden = true; }
    catch (error) { input.value = state.thresholds[input.dataset.threshold]; $('setupError').textContent = error.message; $('setupError').hidden = false; }
  }
});
$('setupBack').addEventListener('click', () => { setupStep--; $('setupError').hidden = true; renderSetup(); });
$('setupNext').addEventListener('click', () => {
  const e = event();
  if (!current) return;
  if ((setupStep === 1 && !current.days.some(d => e.selectedDays.includes(d.id))) ||
    (setupStep === 2 && !current.members.some(m => e.selectedMembers.includes(m.id)))) {
    $('setupError').textContent = setupStep === 1 ? '参加する日を1日以上選んでください。' : 'メンバーを1人以上選んでください。'; $('setupError').hidden = false; return;
  }
  $('setupError').hidden = true;
  if (setupStep < 2) { setupStep++; renderSetup(); }
  else { e.configured = true; e.activeTab = current.days.find(d => e.selectedDays.includes(d.id))?.id || 'all'; save(); $('setupDialog').close(); render(); }
});
$('closeSetup').addEventListener('click', () => $('setupDialog').close());

function download(filename, content) {
  const blob = new Blob([content], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function backup() { return { format: 'meganemaru-event-planner', version: 1, exportedAt: new Date().toISOString(), data: state, schedules: snapshots }; }
$('export').addEventListener('click', () => {
  if (!$('storageError').hidden) { download('handshake-recovery-raw.json', rawState || ''); return; }
  download(`handshake-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup(), null, 2));
});
$('import').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async ev => {
  const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('5MiB以下のバックアップを選んでください。');
    const b = validateBackup(JSON.parse(await file.text()));
    const count = Object.values(b.data.events).reduce((n, e) => n + totals(e.entries).quantity, 0);
    if (!window.confirm(`バックアップを確認しました。\n${Object.keys(b.data.events).length}イベント・合計${count}枚\n現在の全イベントの保存データを置き換えます。復元しますか？`)) return;
    // Save first: a failed write must not replace the in-memory data.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b.data));
    state = b.data; snapshots = b.schedules; storageBlocked = false; $('storageError').hidden = true;
    saveSnapshots(); catalogOptions(); toast('✓ 復元しました'); await loadEvent(false);
  } catch (error) { notice(`復元できませんでした。${error.message} 現在の枚数データは変更していません。`); }
});
$('rescue').addEventListener('click', () => download('handshake-recovery-raw.json', rawState || ''));
$('resetStorage').addEventListener('click', () => {
  if (!window.confirm('このツールの端末内データを初期化します。元のデータは書き出しましたか？')) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newState())); state = newState(); storageBlocked = false; $('storageError').hidden = true; catalogOptions(); loadEvent(); }
  catch { notice('初期化できませんでした。端末の保存設定を確認してください。'); }
});
window.addEventListener('storage', ev => {
  if (ev.key !== STORAGE_KEY) return;
  storageBlocked = true; $('eventSelect').disabled = true; $('settings').disabled = true;
  notice('別のタブで保存データが変更されました。上書きを防ぐため編集を止めました。ページを再読込してください。'); render();
});
async function start() {
  loadStorage();
  try {
    const data = await api('/api/handshake/events');
    if (!Array.isArray(data.events) || !data.events.every(e => e && /^[a-z][a-z0-9-]{1,79}$/.test(e.id) && typeof e.title === 'string')) throw new Error();
    catalog = data.events;
  } catch { catalog = [{ id: 'ske48-37th', title: 'SKE48 37thシングル「ため息未来」' }]; }
  catalogOptions(); await loadEvent();
}
start();
