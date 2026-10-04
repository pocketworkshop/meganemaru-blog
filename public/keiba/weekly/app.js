import { buildWeekly, renderCards, weekLabel, jstDateKey } from './model.mjs';

const cards = document.getElementById('raceCards');
const button = document.getElementById('refreshWeekly');
const status = document.getElementById('refreshStatus');
let data = null, loading = false, lastAttempt = 0, weekTimer;
try { data = JSON.parse(document.getElementById('weeklyInitial').textContent); } catch {}

async function readJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
}
function draw(next) {
  if (!next?.week || !Array.isArray(next.races)) throw new Error('Invalid weekly race response');
  const changed = !data || JSON.stringify([data.week, data.races, data.articlesAvailable]) !== JSON.stringify([next.week, next.races, next.articlesAvailable]);
  data = next;
  if (changed || !cards.hasAttribute('data-server-rendered')) {
    cards.innerHTML = renderCards(data);
    cards.setAttribute('data-server-rendered', 'true');
  }
  document.getElementById('weekLabel').textContent = weekLabel(data.week);
  document.getElementById('raceCount').textContent = `${data.races.length} レース`;
  document.getElementById('articleNotice').textContent = data.articlesAvailable ? '公開済みの項目から記事を読めます。' : '記事の公開状況を確認できませんでした。時間をおいて更新してください。';
  clearTimeout(weekTimer);
  const wait = Date.parse(data.week.nextSwitchAt) - Date.now();
  if (wait > 0) weekTimer = setTimeout(() => { if (!document.hidden) refresh(); }, Math.min(wait + 1000, 2147483647));
}
async function refresh(manual = false) {
  if (loading) return;
  loading = true; lastAttempt = Date.now(); button.disabled = true;
  if (manual) status.textContent = '確認しています…';
  try {
    const next = await readJson('/api/keiba/weekly');
    draw(next);
    status.textContent = manual ? '最新の公開状況を確認しました。' : '';
  } catch (error) {
    status.textContent = data ? '情報を更新できませんでした。前回の表示です。時間をおいて再確認してください。' : '重賞情報を読み込めませんでした。時間をおいて再確認してください。';
    console.error(error);
  } finally { loading = false; button.disabled = false; }
}
button.hidden = false;
button.addEventListener('click', () => refresh(true));
if (data?.week) draw(data);
else {
  // 静的ファイルを直接プレビューするときも既存記事JSONで確認できる。
  // 本番ではWorkerが初期情報をHTMLへ挿入するため、この通信は発生しない。
  Promise.all([readJson('/data/jra-graded-races.json'), readJson('/data/posts.json').catch(() => null)])
    .then(([schedule, posts]) => draw(buildWeekly(schedule, posts || [], new Date(), posts !== null)))
    .catch(error => { status.textContent = '重賞情報を読み込めませんでした。再読み込みしてください。'; console.error(error); });
}
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (data?.week.today !== jstDateKey() || Date.now() - lastAttempt >= 60000)) refresh();
});
