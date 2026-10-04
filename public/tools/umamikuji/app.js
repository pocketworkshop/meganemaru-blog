import { draw, EFFECTS } from './model.mjs';

const $ = id => document.getElementById(id);
const stage = $('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let phase = 'idle';
let current = null;
let timers = [];
let soundEnabled = false;
let audio = null;
let voices = [];

// 外部音源を使わない、小音量のWeb Audio合成SE。
function stopSound() {
  for (const voice of voices) { try { voice.stop(); } catch {} }
  voices = [];
}
function openAudio() {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* 無音でも遊べる */ }
}
function tone(frequency, delay = 0, duration = .1, wave = 'sine', volume = .035) {
  if (!soundEnabled || !audio || audio.state !== 'running') return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const at = audio.currentTime + delay;
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + .012);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain); gain.connect(audio.destination);
    voices.push(osc);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); voices = voices.filter(item => item !== osc); };
    osc.start(at); osc.stop(at + duration + .02);
  } catch { /* 音声エラーは表示を止めない */ }
}
function effectSound(result) {
  stopSound();
  if (!soundEnabled) return;
  // 軽い二拍の蹄音。死兆星の直前は無音になるよう、短いSEだけを予約。
  tone(105, 0, .07, 'triangle', .035); tone(78, .15, .08, 'triangle', .03);
  tone(105, .3, .07, 'triangle', .03);
  if (['hint','shooting','gold','rainbow'].includes(result.effect)) {
    tone(880, .7, .13); tone(1320, .84, .17);
    if (['gold','rainbow'].includes(result.effect)) { tone(1568, 1.15, .22); tone(2093, 1.35, .3); }
  } else if (['dark','red','death'].includes(result.effect)) {
    tone(140, .6, .5, 'triangle', .018); tone(85, 1.15, .5, 'sine', .025);
    if (result.effect === 'death') tone(1568, 1.55, .1, 'sine', .025);
  }
}
function resultSound(result) {
  stopSound();
  if (result.fortune === 'daikichi') [523,659,784,1047].forEach((f,i) => tone(f,i*.1,.2));
  else { tone(result.fortune === 'daikyo' ? 130 : 523,0,.22,'triangle'); tone(result.fortune === 'daikyo' ? 98 : 784,.13,.22,'triangle'); }
}
function later(callback, ms) { timers.push(window.setTimeout(callback, ms)); }
function clearTimers() { timers.forEach(clearTimeout); timers = []; }
function setPhase(value) { phase = value; stage.dataset.phase = value; }
function caption(value) { $('effectCaption').textContent = value; $('stageCaption').textContent = value; $('effectStatus').textContent = value; }

function start() {
  if (phase === 'drawing' || phase === 'reveal') return;
  clearTimers();
  // 全項目とバリエーションをここで確定。スキップ・音声設定・シェアは抽選しない。
  current = draw();
  openAudio();
  $('draw').disabled = true; $('again').disabled = true;
  $('startScreen').hidden = true; $('resultScreen').hidden = true; $('drawingScreen').hidden = false;
  $('shareFallback').hidden = true; $('shareStatus').textContent = ''; $('share').disabled = false;
  stage.dataset.effect = current.effect; stage.dataset.fortune = current.fortune;
  stage.dataset.shooting = current.shooting; stage.dataset.horse = current.horse;
  $('revealLabel').textContent = current.label;
  // 同じ演出が続いてもCSSアニメーションを最初から再生する。
  stage.dataset.phase = 'idle'; void stage.offsetWidth;
  setPhase('drawing'); caption('おみくじを振っています…');
  $('effectLevel').textContent = '期待度 ★☆☆☆☆';
  // 再抽選ボタンが画面の下にあっても、演出をヘッダーの下へ戻す。
  stage.scrollIntoView({ block: 'start', behavior: 'instant' });
  $('skip').focus({ preventScroll: true });
  effectSound(current);
  const short = reducedMotion.matches;
  later(() => {
    const effect = EFFECTS[current.effect];
    caption(effect.label);
    $('effectLevel').textContent = effect.ominous ? `不吉な気配 Lv.${effect.level}` : `期待度 ${'★'.repeat(effect.level + 1)}${'☆'.repeat(4 - effect.level)}`;
  }, short ? 120 : 500);
  later(reveal, short ? 500 : 2500);
  later(finish, short ? 800 : 3500);
}
function reveal() {
  if (phase !== 'drawing') return;
  setPhase('reveal'); caption('本日の運勢は…'); resultSound(current);
}
function rating(id, value) {
  const target = $(id);
  target.textContent = '★'.repeat(value) + '☆'.repeat(5 - value);
  target.setAttribute('aria-label', `5段階中${value}`);
}
function finish() {
  if (!current || !['drawing','reveal'].includes(phase)) return;
  clearTimers(); stopSound();
  setPhase('complete');
  $('drawingScreen').hidden = true;
  $('resultScreen').dataset.fortune = current.fortune;
  $('resultTitle').textContent = current.label;
  $('resultNote').textContent = current.fortune === 'daikyo' ? '大凶を引いた話も、今日のお土産。' : current.fortune === 'kyo' ? 'ひと息つくのも、立派な作戦。' : '今日も、自分のペースで楽しもう。';
  rating('battle',current.battle); rating('axis',current.axis); rating('outsider',current.outsider);
  $('number').textContent = current.number;
  $('color').textContent = current.color; $('colorSwatch').style.backgroundColor = current.colorHex;
  $('ticket').textContent = current.ticket;
  $('ticketNote').textContent = current.ticket === '見' ? '馬券を買わずに観戦' : '買い方のヒントもお遊びです';
  $('message').textContent = current.message;
  $('stageCaption').textContent = '今日も、競馬を楽しもう。';
  $('effectStatus').textContent = `本日の運勢は${current.label}。ラッキー馬番は${current.number}番。`;
  $('resultScreen').hidden = false;
  $('draw').disabled = false; $('again').disabled = false;
  $('resultTitle').focus({ preventScroll: true });
}
function shareText() {
  const url = new URL(location.href); url.search = ''; url.hash = '';
  return `今日の馬券おみくじは【${current.label}】🐴\nラッキー馬番は${current.number}番！\n#うまみくじ\n${url.href}`;
}
async function share() {
  if (!current || phase !== 'complete' || $('share').disabled) return;
  const text = shareText();
  $('share').disabled = true; $('shareStatus').textContent = '';
  try {
    if (navigator.share) {
      try { await navigator.share({ title: 'うまみくじ｜今日の馬券おみくじ', text }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); $('shareStatus').textContent = '結果とページURLをコピーしました。'; return; }
      catch { /* 権限拒否なら選択コピーへ */ }
    }
    $('shareText').value = text; $('shareFallback').hidden = false;
    $('shareText').focus({ preventScroll: true }); $('shareText').select();
    $('shareStatus').textContent = '共有用テキストを選択しました。コピーしてお使いください。';
  } finally { $('share').disabled = false; }
}
$('draw').addEventListener('click', start);
$('again').addEventListener('click', start);
$('skip').addEventListener('click', finish);
$('share').addEventListener('click', share);
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  $('sound').textContent = soundEnabled ? '🔊 音声 ON' : '🔇 音声 OFF';
  if (soundEnabled) openAudio(); else stopSound();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopSound(); if (['drawing','reveal'].includes(phase)) finish(); }
});
window.addEventListener('pagehide', () => { clearTimers(); stopSound(); });
$('draw').disabled = false;
