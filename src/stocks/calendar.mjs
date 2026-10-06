// JPX cash-market calendar, checked 2026-10-05. Derivatives holiday trading is unrelated.
// https://www.jpx.co.jp/corporate/about-jpx/calendar/index.html
const holidays = {
  2026: '01-01 01-02 01-03 01-12 02-11 02-23 03-20 04-29 05-03 05-04 05-05 05-06 07-20 08-11 09-21 09-22 09-23 10-12 11-03 11-23 12-31',
  2027: '01-01 01-02 01-03 01-11 02-11 02-23 03-21 03-22 04-29 05-03 05-04 05-05 07-19 08-11 09-20 09-23 10-11 11-03 11-23 12-31',
};
export function jstDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_time');
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function calendarState(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('invalid_date');
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return 'closed';
  const list = holidays[Number(date.slice(0, 4))];
  if (!list) return 'unknown';
  return list.split(' ').includes(date.slice(5)) ? 'closed' : 'candidate';
}
export function nextTradingDate(date) {
  const cursor = new Date(`${date}T00:00:00Z`);
  for (let i = 0; i < 14; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const key = cursor.toISOString().slice(0, 10), state = calendarState(key);
    if (state === 'unknown') return null;
    if (state === 'candidate') return key;
  }
  return null;
}
export const STOCK_CRONS = Object.freeze({
  '40,50 2 * * MON-FRI': 'morning', // JST 11:40, 11:50
  '5 3 * * MON-FRI': 'morning', // JST 12:05 late-news retry
  '50 6 * * MON-FRI': 'close', // JST 15:50
  '0 7 * * MON-FRI': 'close', // JST 16:00 retry
});
