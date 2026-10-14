// 画面遷移と Firestore 同期（ログインなし）
import { Game, drawBurgerCard, drawIngredient } from './game.js';
import { firebaseConfig } from './firebase-config.js';

const FB_VER = '10.12.2';
const COUNTDOWN_MS = 10000;
const role = document.body.dataset.role === 'master' ? 'master' : 'player';
const room = (new URLSearchParams(location.search).get('room') || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'main';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const configured = !!(firebaseConfig && firebaseConfig.apiKey && !/^YOUR_/.test(firebaseConfig.apiKey));
const game = new Game($('game'));

let net = null; // { fs, db }
let offset = 0;
const serverNow = () => Date.now() + offset;

let duration = loadDuration();
let playedSession = null;
let session = null;    // { sessionId, startAt, duration, local, docRef }
let lastResult = null;
let countRAF = 0;
let lastRoom = null;
let wakeLock = null;

// ---------- 共通 ----------
function show(name) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== `screen-${name}`;
}
function setStatus(text) {
  $('net-status').textContent = text;
}
function loadDuration() {
  try {
    const v = parseInt(localStorage.getItem('burger-duration'), 10);
    if (v >= 30 && v <= 600) return v;
  } catch (_) { /* noop */ }
  return 120;
}
function renderDuration() {
  $('time-value').textContent = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
  $('time-minus').disabled = duration <= 30;
  $('time-plus').disabled = duration >= 600;
}
function changeDuration(d) {
  duration = Math.max(30, Math.min(600, duration + d));
  try { localStorage.setItem('burger-duration', String(duration)); } catch (_) { /* noop */ }
  renderDuration();
}
function goTitle() {
  session = null;
  game.toIdle();
  $('btn-play').disabled = !!(configured && !net && !initDone);
  show('title');
}

// ---------- タイトル ----------
let initDone = false;
function setupTitle() {
  const isMaster = role === 'master';
  $('master-controls').hidden = !isMaster;
  $('player-wait').hidden = isMaster;
  renderDuration();
  $('time-minus').onclick = () => changeDuration(-30);
  $('time-plus').onclick = () => changeDuration(30);
  $('btn-play').onclick = onMasterPlay;
  $('btn-practice').onclick = startPractice;
  $('btn-back').onclick = goTitle;
  $('btn-reveal').onclick = onReveal;
  setupGallerySwipe();
}
function setPlayerWaiting(mode) {
  const wait = $('wait-text');
  wait.classList.toggle('is-waiting', mode === 'online');
  wait.textContent = mode === 'online' ? 'マスターの開始を待っています'
    : mode === 'connecting' ? '接続中…'
    : 'サーバーに接続できません';
}

// ---------- 練習 ----------
function startPractice() {
  game.startPractice();
  show('none');
  startTutorial();
}
game.onBack = () => {
  endTutorial();
  goTitle();
};

// ---------- チュートリアル ----------
const STEPS = [
  { area: 'order', title: 'オーダー伝票', text: '作るバーガーの絵。下から順に同じ具材を積む' },
  { area: 'shelf', title: '具材置き', text: '具材をドラッグしてトレイのバンズの上へ。使った具材は上から補充' },
  { area: 'burger', title: '完成', text: '最後にトップバンズをのせて少し待つと完成' },
  { area: null, title: '捨てる', text: 'いらない具材は画面の外へ放り投げると消える' },
  { area: 'tray', title: '作り直し', text: 'トレイを左右にスワイプして画面の外へ出すと作り直し' },
  { area: 'back', title: 'もどる', text: '練習はいつでもここからメニューへ。本番は時間内のスコアの合計で勝負' },
];
let tutStep = -1;
function startTutorial() {
  tutStep = 0;
  renderTutorial();
  show('tutorial');
}
function endTutorial() {
  tutStep = -1;
  if (!$('screen-tutorial').hidden) show('none');
}
function renderTutorial() {
  const st = STEPS[tutStep];
  $('tut-step').textContent = `${tutStep + 1} / ${STEPS.length}`;
  $('tut-title').textContent = st.title;
  $('tut-text').textContent = st.text;
  $('tut-next').textContent = tutStep === STEPS.length - 1 ? 'はじめる' : 'つぎへ';
  const ring = $('tut-ring');
  const card = $('tut-card');
  const areas = game.getAreas();
  const a = st.area ? areas[st.area] : null;
  if (a) {
    ring.hidden = false;
    Object.assign(ring.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    $('screen-tutorial').classList.remove('is-full');
    const center = a.top + a.height / 2;
    card.classList.toggle('at-top', center > innerHeight * 0.5);
  } else {
    ring.hidden = true;
    $('screen-tutorial').classList.add('is-full');
    card.classList.remove('at-top');
  }
}
$('tut-next').onclick = () => {
  if (tutStep < STEPS.length - 1) {
    tutStep += 1;
    renderTutorial();
  } else endTutorial();
};
$('tut-skip').onclick = endTutorial;
addEventListener('resize', () => { if (tutStep >= 0) renderTutorial(); });

// ---------- 本番 ----------
function onMasterPlay() {
  $('btn-play').disabled = true;
  const s = { sessionId: rid(), startAt: Math.round(serverNow() + COUNTDOWN_MS + 300), duration };
  if (net) {
    const { fs, db } = net;
    fs.setDoc(fs.doc(db, 'rooms', room), { ...s, updatedAt: fs.serverTimestamp() }).catch((err) => {
      setStatus(`開始の送信に失敗: ${err.code || err.message}`);
    });
  } else {
    s.local = true;
  }
  joinSession(s);
}

function joinSession(s) {
  playedSession = s.sessionId;
  session = s;
  lastResult = null;
  tutStep = -1;
  cancelAnimationFrame(countRAF);
  game.cancelInput();
  game.prepare(s.duration * 1000);
  if (net && !s.local) {
    const { fs, db } = net;
    s.docRef = fs.doc(fs.collection(db, 'rooms', room, 'sessions', s.sessionId, 'players'));
  }
  requestWakeLock();
  show('count');
  let lastShown = '';
  const tick = () => {
    if (session !== s) return;
    const left = s.startAt - serverNow();
    if (left > 0) {
      const n = String(Math.ceil(left / 1000));
      if (n !== lastShown) {
        setCount(n);
        lastShown = n;
      }
      countRAF = requestAnimationFrame(tick);
      return;
    }
    const remain = s.startAt + s.duration * 1000 - serverNow();
    if (remain <= 1500) {
      goTitle();
      return;
    }
    setCount('スタート！');
    game.start(remain);
    pushProgress(false);
    setTimeout(() => {
      if (session === s && game.state === 'playing') show('none');
    }, 700);
  };
  tick();
}

function setCount(text) {
  const el = $('count-num');
  el.textContent = text;
  el.classList.toggle('is-go', text.length > 2);
  if (!reduceMotion) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
}

function pushProgress(done) {
  if (!net || !session || !session.docRef) return;
  const { fs } = net;
  fs.setDoc(session.docRef, { score: Math.round(game.total), burgers: game.count, done, updatedAt: fs.serverTimestamp() })
    .catch((err) => console.warn('score write failed', err));
}

game.onBurger = () => pushProgress(false);
game.onEnd = (res) => {
  pushProgress(true);
  releaseWakeLock();
  showResult(res);
};

// ---------- 結果 ----------
function showResult(res) {
  lastResult = res;
  $('my-score').textContent = fmt(res.score);
  $('my-count').textContent = `${res.count}個`;
  buildGallery(game.history || []);
  $('team-block').hidden = true;
  $('team-wait').hidden = false;
  $('team-wait').textContent = role === 'master' ? '準備ができたら結果発表' : '結果発表を待っています';
  $('team-wait').classList.toggle('is-waiting', role !== 'master');
  $('btn-reveal').hidden = role !== 'master';
  $('btn-reveal').disabled = true;
  setTimeout(() => { $('btn-reveal').disabled = false; }, 1500);
  $('btn-back').hidden = true;
  $('next-hint').hidden = true;
  show('result');
  if (lastRoom && lastRoom.revealSession && lastRoom.revealSession === playedSession) {
    revealTotal(lastRoom.total || 0, lastRoom.players || 0);
  }
}

// つくったバーガーを古い順に横並びで表示
function buildGallery(history) {
  const box = $('gallery');
  box.textContent = '';
  if (!history.length) {
    const p = document.createElement('p');
    p.className = 'gallery-empty';
    p.textContent = '完成したバーガーはなし';
    box.append(p);
    return;
  }
  const W = 150;
  const H = 210;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  history.forEach((entry, i) => {
    const fig = document.createElement('figure');
    const cv = document.createElement('canvas');
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    drawBurgerCard(ctx, entry, W, H);
    const cap = document.createElement('figcaption');
    const n = document.createElement('span');
    n.textContent = `${i + 1}個目`;
    const sc = document.createElement('strong');
    sc.textContent = `${fmt(entry.score)}点`;
    cap.append(n, sc);
    fig.append(cv, cap);
    box.append(fig);
  });
  box.scrollLeft = 0;
  requestAnimationFrame(() => { $('gallery-hint').hidden = box.scrollWidth <= box.clientWidth + 2; });
}

// 結果画面のどこを横スワイプしても一覧が動く（スクロールバーなし）
function galleryStops() {
  const box = $('gallery');
  const figs = [...box.querySelectorAll('figure')];
  if (!figs.length) return [0];
  const pad = figs[0].offsetLeft;
  const max = box.scrollWidth - box.clientWidth;
  const stops = figs.map((f) => Math.min(max, f.offsetLeft - pad));
  return [...new Set(stops)];
}
function snapGallery(target) {
  const box = $('gallery');
  const stops = galleryStops();
  let best = stops[0];
  for (const s of stops) if (Math.abs(s - target) < Math.abs(best - target)) best = s;
  box.scrollTo({ left: best, behavior: reduceMotion ? 'auto' : 'smooth' });
}
function setupGallerySwipe() {
  const scr = $('screen-result');
  const box = $('gallery');
  let drag = null;
  scr.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: box.scrollLeft, axis: null, hist: [{ x: e.clientX, t: e.timeStamp }] };
  });
  scr.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'x') {
        try { scr.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      }
    }
    if (drag.axis !== 'x') return;
    box.scrollLeft = drag.start - dx;
    drag.hist.push({ x: e.clientX, t: e.timeStamp });
    if (drag.hist.length > 6) drag.hist.shift();
    e.preventDefault();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.axis === 'x') {
      const h = drag.hist;
      const a = h[0];
      const b = h[h.length - 1];
      const dt = b.t - a.t;
      const v = dt > 0 && e.timeStamp - b.t < 100 ? (b.x - a.x) / dt : 0; // px/ms
      snapGallery(box.scrollLeft - v * 260);
    }
    drag = null;
  };
  scr.addEventListener('pointerup', end);
  scr.addEventListener('pointercancel', end);
  // トラックパッドの横スクロール
  let wheelTimer = 0;
  scr.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    box.scrollLeft += e.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => snapGallery(box.scrollLeft), 140);
  }, { passive: true });
  // キーボード
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const stops = galleryStops();
    const cur = stops.reduce((bi, s, i) => (Math.abs(s - box.scrollLeft) < Math.abs(stops[bi] - box.scrollLeft) ? i : bi), 0);
    const next = Math.max(0, Math.min(stops.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    snapGallery(stops[next]);
    e.preventDefault();
  });
}

async function onReveal() {
  const s = session;
  if (!s) return;
  $('btn-reveal').disabled = true;
  if (!net || s.local) {
    revealTotal(lastResult ? lastResult.score : 0, 1);
    return;
  }
  const { fs, db } = net;
  try {
    const snap = await fs.getDocs(fs.collection(db, 'rooms', room, 'sessions', s.sessionId, 'players'));
    let total = 0;
    let n = 0;
    snap.forEach((d) => {
      total += Number(d.data().score) || 0;
      n += 1;
    });
    await fs.updateDoc(fs.doc(db, 'rooms', room), { revealSession: s.sessionId, total, players: n, updatedAt: fs.serverTimestamp() });
  } catch (err) {
    $('btn-reveal').disabled = false;
    $('team-wait').textContent = `結果発表に失敗: ${err.code || err.message}`;
  }
}

let teamAnim = 0;
// スコア → バーガー何個分（小数点以下切り捨て）
const burgersFromScore = (score, players) => Math.floor(score / 1000 / 1.5 / Math.max(1, players));

function countUp(el, target, ms, done) {
  if (reduceMotion) {
    el.textContent = fmt(target);
    if (done) done();
    return;
  }
  const t0 = performance.now();
  const run = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(Math.round(target * e));
    if (k < 1) teamAnim = requestAnimationFrame(run);
    else if (done) done();
  };
  teamAnim = requestAnimationFrame(run);
}

function drawEquivIcon() {
  const cv = $('equiv-icon');
  const size = cv.clientWidth || 48;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = size * dpr;
  cv.height = size * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const k = size / 48;
  ctx.translate(size / 2, size * 0.5);
  ctx.scale(k, k);
  ctx.save(); ctx.translate(0, -8); drawIngredient(ctx, 'topBun', 44, 18); ctx.restore();
  ctx.save(); ctx.translate(0, 3); drawIngredient(ctx, 'lettuce', 46, 6); ctx.restore();
  ctx.save(); ctx.translate(0, 8); drawIngredient(ctx, 'patty', 42, 8); ctx.restore();
  ctx.save(); ctx.translate(0, 16); drawIngredient(ctx, 'bottomBun', 42, 10); ctx.restore();
}

function revealTotal(total, players) {
  if ($('screen-result').hidden || !$('team-block').hidden) return;
  $('team-wait').hidden = true;
  $('btn-reveal').hidden = true;
  $('team-block').hidden = false;
  $('equiv').hidden = true;
  $('team-meta').textContent = `参加 ${players}人`;
  $('btn-back').hidden = false;
  $('next-hint').hidden = role === 'master' || !net;
  cancelAnimationFrame(teamAnim);
  const equiv = burgersFromScore(total);
  countUp($('team-score'), total, 1800, () => {
    // スコアが出そろってから「バーガー何個分」を表示
    const box = $('equiv');
    box.hidden = false;
    drawEquivIcon();
    if (!reduceMotion) {
      box.classList.remove('pop-in');
      void box.offsetWidth;
      box.classList.add('pop-in');
    }
    setTimeout(() => countUp($('equiv-count'), equiv, 900), reduceMotion ? 0 : 250);
  });
}

// ---------- 画面スリープ防止 ----------
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (_) { /* noop */ }
}
function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

// ---------- Firebase ----------
async function initNet() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
  const [appMod, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);

  // サーバー時刻との差を測る（全員の開始タイミングを揃えるため）
  const cref = fs.doc(fs.collection(db, 'rooms', room, 'clocks'));
  const t0 = Date.now();
  await fs.setDoc(cref, { t: fs.serverTimestamp() });
  const snap = await fs.getDocFromServer(cref);
  const t1 = Date.now();
  offset = snap.data().t.toMillis() - (t0 + t1) / 2;
  fs.deleteDoc(cref).catch(() => {});

  return { fs, db };
}

function listenRoom() {
  const { fs, db } = net;
  fs.onSnapshot(fs.doc(db, 'rooms', room), (snap) => {
    const d = snap.data();
    lastRoom = d || null;
    if (!d || !d.sessionId) return;
    // 結果発表
    if (d.revealSession && d.revealSession === playedSession && d.revealSession === d.sessionId) {
      revealTotal(d.total || 0, d.players || 0);
    }
    // 新しいゲーム（練習中・結果画面でも強制的にカウントダウン）
    if (d.sessionId !== playedSession && serverNow() < d.startAt + d.duration * 1000 - 3000) {
      joinSession({ sessionId: d.sessionId, startAt: d.startAt, duration: d.duration });
    }
  }, (err) => setStatus(`ルームを読み込めません: ${err.code || err.message}`));
}

async function boot() {
  setupTitle();
  show('title');
  if (!configured) {
    initDone = true;
    setPlayerWaiting('offline');
    setStatus('Firebase未設定（js/firebase-config.js を設定）');
    return;
  }
  setPlayerWaiting('connecting');
  setStatus('接続中…');
  $('btn-play').disabled = true;
  try {
    net = await initNet();
    setPlayerWaiting('online');
    setStatus(`ルーム ${room}`);
    listenRoom();
  } catch (err) {
    console.error(err);
    net = null;
    setPlayerWaiting('offline');
    setStatus(`接続エラー: ${err.code || err.message}`);
  }
  initDone = true;
  $('btn-play').disabled = false;
}

boot();
