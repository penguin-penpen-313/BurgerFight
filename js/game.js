// つみつみバーガー ゲーム本体（物理・入力・採点・描画）
const { Engine, Bodies, Body, Composite, Query } = window.Matter;

const STEP = 1000 / 60;
const W = 400;
const INK = '#3A2213';
const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
const DISPLAY = '"Dela Gothic One", "Hiragino Sans", sans-serif';
const TRAY_W = 184;
const TRAY_H = 12;

// 衝突カテゴリ
const CAT_ITEM = 0x0001;   // 自由に動く具材
const CAT_STATIC = 0x0002; // テーブル・棚・トレイ
const CAT_SHELF = 0x0004;  // 具材置きに並んでいる具材

export const ING = {
  bottomBun: { name: 'バンズ', short: 'バンズ', w: 112, h: 24, color: '#E9A54B' },
  topBun:    { name: 'トップバンズ', short: 'バンズ', w: 114, h: 36, color: '#E9A54B' },
  patty:     { name: 'パティ', short: 'パティ', w: 104, h: 20, color: '#5E331A' },
  cheese:    { name: 'チーズ', short: 'チーズ', w: 110, h: 10, color: '#FFC83A' },
  egg:       { name: 'たまご', short: 'たまご', w: 100, h: 12, color: '#FFB31A' },
  bacon:     { name: 'ベーコン', short: 'ベーコン', w: 112, h: 10, color: '#C9473B' },
  tomato:    { name: 'トマト', short: 'トマト', w: 98, h: 12, color: '#E2402F' },
  lettuce:   { name: 'レタス', short: 'レタス', w: 118, h: 12, color: '#78C043' },
  onion:     { name: 'オニオン', short: 'オニオン', w: 98, h: 10, color: '#C59AD6' },
  sauce:     { name: 'ソース', short: 'ソース', w: 100, h: 10, color: '#EE7A1E' },
};
const INNER = ['patty', 'cheese', 'egg', 'bacon', 'tomato', 'lettuce', 'onion', 'sauce'];
const SHELF = [
  ['topBun', 'patty', 'cheese'],
  ['egg', 'bacon', 'tomato'],
  ['lettuce', 'onion', 'sauce'],
];

// ---------- 小物 ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clamp01 = (v) => clamp(v, 0, 1);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function normAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
function readSafe() {
  const el = document.getElementById('safe-probe');
  if (!el) return { top: 0, bottom: 0 };
  const cs = getComputedStyle(el);
  return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
}
function rrect(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
function outline(ctx, lw = 2) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ---------- 具材の絵（中心原点・回転なし） ----------
const SEEDS = [[-0.3, 0.05], [-0.16, -0.28], [0.02, -0.08], [0.18, -0.3], [0.31, 0.02], [-0.02, -0.4], [0.12, 0.12], [-0.17, 0.12]];
const DRAW = {
  bottomBun(ctx, w, h) {
    rrect(ctx, -w / 2, -h / 2, w, h, [5, 5, h * 0.62, h * 0.62]);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#F3BC6C');
    g.addColorStop(1, '#C5742B');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#FAE6BE';
    rrect(ctx, -w / 2 + 4, -h / 2 + 2.5, w - 8, Math.max(2, h * 0.2), 2);
    ctx.fill();
  },
  topBun(ctx, w, h) {
    const yb = h / 2 - 3;
    const yc = (-h / 2 - 0.25 * yb) / 0.75;
    ctx.beginPath();
    ctx.moveTo(-w / 2, yb);
    ctx.bezierCurveTo(-w / 2, yc, w / 2, yc, w / 2, yb);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - 5, h / 2);
    ctx.lineTo(-w / 2 + 5, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, yb);
    ctx.closePath();
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.35, 2, 0, 0, w * 0.62);
    g.addColorStop(0, '#F8CC80');
    g.addColorStop(0.55, '#E39A43');
    g.addColorStop(1, '#B9682A');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#FFF3D6';
    for (const [sx, sy] of SEEDS) {
      ctx.beginPath();
      ctx.ellipse(sx * w, sy * h, Math.max(1.2, w * 0.022), Math.max(0.8, w * 0.012), sx * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  patty(ctx, w, h) {
    rrect(ctx, -w / 2, -h / 2, w, h, Math.min(8, h / 2));
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#7E4726');
    g.addColorStop(1, '#4A2713');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    ctx.strokeStyle = 'rgba(32,14,4,0.55)';
    ctx.lineWidth = Math.max(1, h * 0.09);
    ctx.lineCap = 'round';
    for (let i = -3; i <= 3; i++) {
      const x = i * w * 0.12;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.03, -h * 0.22);
      ctx.lineTo(x + w * 0.03, h * 0.08);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,180,0.25)';
    rrect(ctx, -w / 2 + 6, -h / 2 + 2, w - 12, Math.max(1.5, h * 0.12), 2);
    ctx.fill();
  },
  cheese(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(w * 0.36, h / 2);
    ctx.lineTo(w * 0.3, h / 2 + h * 0.9);
    ctx.lineTo(w * 0.23, h / 2);
    ctx.lineTo(-w * 0.08, h / 2);
    ctx.lineTo(-w * 0.15, h / 2 + h * 1.2);
    ctx.lineTo(-w * 0.22, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = '#FFC83A';
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#FFE38A';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 2, w - 8, Math.max(1.5, h * 0.22));
  },
  egg(ctx, w, h) {
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFDF2';
    ctx.fill();
    outline(ctx);
    ctx.beginPath();
    ctx.ellipse(w * 0.08, -h * 0.05, w * 0.2, h / 2 + 1.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFB31A';
    ctx.fill();
    outline(ctx, 1.6);
    ctx.beginPath();
    ctx.ellipse(w * 0.03, -h * 0.18, w * 0.05, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
  },
  bacon(ctx, w, h) {
    const k = 13 / w;
    const amp = h * 0.24;
    const n = 28;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + (w * i) / n;
      const y = -h / 2 + Math.sin(x * k) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const x = -w / 2 + (w * i) / n;
      ctx.lineTo(x, h / 2 + Math.sin(x * k) * amp);
    }
    ctx.closePath();
    ctx.fillStyle = '#C9473B';
    ctx.fill();
    outline(ctx);
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const x = -w / 2 + (w * i) / n;
      const y = Math.sin(x * k) * amp - h * 0.05;
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#F7CDB9';
    ctx.lineWidth = Math.max(1.2, h * 0.24);
    ctx.lineCap = 'round';
    ctx.stroke();
  },
  tomato(ctx, w, h) {
    rrect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = '#E2402F';
    ctx.fill();
    outline(ctx);
    rrect(ctx, -w / 2 + 6, -h / 2 + h * 0.25, w - 12, h * 0.5, h * 0.25);
    ctx.fillStyle = '#F57A63';
    ctx.fill();
    ctx.fillStyle = '#FCE38A';
    for (const sx of [-0.27, -0.09, 0.09, 0.27]) {
      ctx.beginPath();
      ctx.ellipse(sx * w, 0, Math.max(1, w * 0.025), Math.max(0.7, h * 0.13), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  lettuce(ctx, w, h) {
    const n = 8;
    const seg = w / n;
    ctx.beginPath();
    ctx.moveTo(-w / 2, h * 0.1);
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + i * seg;
      ctx.quadraticCurveTo(x0 + seg / 2, -h / 2 - h * 0.45, x0 + seg, -h / 2 + h * 0.15);
    }
    ctx.lineTo(w / 2, h / 2 - h * 0.1);
    for (let i = n - 1; i >= 0; i--) {
      const x0 = -w / 2 + i * seg;
      ctx.quadraticCurveTo(x0 + seg / 2, h / 2 + h * 0.4, x0, h / 2 - h * 0.05);
    }
    ctx.closePath();
    ctx.fillStyle = '#78C043';
    ctx.fill();
    outline(ctx);
    ctx.strokeStyle = '#B9E383';
    ctx.lineWidth = Math.max(1, h * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, h * 0.05);
    ctx.quadraticCurveTo(0, -h * 0.2, w * 0.4, h * 0.05);
    ctx.stroke();
  },
  onion(ctx, w, h) {
    rrect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = '#F4E8F7';
    ctx.fill();
    outline(ctx);
    rrect(ctx, -w / 2 + 4, -h / 2 + h * 0.25, w - 8, h * 0.5, h * 0.25);
    ctx.strokeStyle = '#A867C2';
    ctx.lineWidth = Math.max(1, h * 0.15);
    ctx.stroke();
  },
  sauce(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + h / 2, -h / 2);
    ctx.lineTo(w / 2 - h / 2, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, 0);
    ctx.quadraticCurveTo(w / 2, h / 2, w * 0.38, h / 2);
    ctx.lineTo(w * 0.2, h / 2);
    ctx.quadraticCurveTo(w * 0.2, h * 1.6, w * 0.14, h * 1.6);
    ctx.quadraticCurveTo(w * 0.08, h * 1.6, w * 0.08, h / 2);
    ctx.lineTo(-w * 0.18, h / 2);
    ctx.quadraticCurveTo(-w * 0.18, h * 1.25, -w * 0.23, h * 1.25);
    ctx.quadraticCurveTo(-w * 0.28, h * 1.25, -w * 0.28, h / 2);
    ctx.lineTo(-w * 0.38, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, 0);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + h / 2, -h / 2);
    ctx.closePath();
    ctx.fillStyle = '#EE7A1E';
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    rrect(ctx, -w * 0.3, -h * 0.25, w * 0.22, Math.max(1.2, h * 0.2), 1);
    ctx.fill();
  },
};
export function drawIngredient(ctx, type, w, h) {
  ctx.save();
  DRAW[type](ctx, w, h);
  ctx.restore();
}

// ---------- ゲーム ----------
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onBurger = null;
    this.onEnd = null;
    this.onBack = null;

    this.layout();
    this.engine = Engine.create({ positionIterations: 20, velocityIterations: 16 });
    this.engine.gravity.y = 1;
    this.world = this.engine.world;

    this.items = [];
    this.ghosts = [];
    this.popups = [];
    this.timers = [];
    this.time = 0;
    this.state = 'idle'; // idle | ready | playing | over
    this.trayMode = 'idle'; // idle | drag | coast | hold | exit | enter
    this.trayVx = 0;
    this.carry = null;
    this.drag = null;
    this.trayDrag = null;
    this.pointer = null;
    this.total = 0;
    this.count = 0;
    this.recipe = null;
    this.orderNo = 0;
    this.stableT = 0;
    this.stableRef = null;
    this.completing = false;
    this.bottomBun = null;
    this.endAt = 0;
    this.duration = 0;

    this.buildStatics();
    this.bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.resetBoard();

    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ----- レイアウト -----
  layout() {
    const safe = readSafe();
    const vh = innerHeight - safe.top - safe.bottom;
    this.H = Math.round(clamp((W * vh) / innerWidth, 680, 900));
    const H = this.H;
    this.tableY = H - 206;
    this.trayY = this.tableY - TRAY_H / 2;
    this.trayTop = this.tableY - TRAY_H;
    this.trayHomeX = 262;
    this.ledges = [H - 150, H - 92, H - 34];
    this.slots = [];
    SHELF.forEach((row, r) =>
      row.forEach((type, c) => {
        this.slots.push({ type, x: 68 + c * 132, y: this.ledges[r] - ING[type].h / 2, ledge: this.ledges[r], item: null, pending: false });
      })
    );
  }

  resize() {
    const safe = readSafe();
    const vw = innerWidth;
    const vh = innerHeight;
    const avH = vh - safe.top - safe.bottom;
    this.dpr = Math.min(devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(vw * this.dpr);
    this.canvas.height = Math.round(vh * this.dpr);
    this.canvas.style.width = vw + 'px';
    this.canvas.style.height = vh + 'px';
    this.scale = Math.min(vw / W, avH / this.H);
    this.offX = (vw - W * this.scale) / 2;
    this.offY = safe.top + (avH - this.H * this.scale) / 2;
  }

  buildStatics() {
    const opt = { isStatic: true, friction: 1, frictionStatic: 2, restitution: 0, collisionFilter: { category: CAT_STATIC } };
    this.table = Bodies.rectangle(W / 2, this.tableY + 7, 1600, 14, opt);
    this.ledgeBodies = this.ledges.map((y) => Bodies.rectangle(W / 2, y + 3, 1600, 6, opt));
    this.floor = Bodies.rectangle(W / 2, this.H + 30, 1600, 60, opt);
    this.tray = Bodies.rectangle(this.trayHomeX, this.trayY, TRAY_W, TRAY_H, { ...opt, label: 'tray', chamfer: { radius: 3 } });
    this.statics = [this.table, ...this.ledgeBodies, this.floor, this.tray];
    Composite.add(this.world, this.statics);
  }

  // ----- 外部API -----
  prepare(durationMs = 0) {
    this.state = 'ready';
    this.duration = durationMs;
    this.total = 0;
    this.count = 0;
    this.orderNo = 1;
    this.recipe = this.makeRecipe();
    this.nextRecipe = false;
    this.resetBoard();
  }
  start(ms) {
    this.state = 'playing';
    this.duration = ms;
    this.endAt = performance.now() + ms;
    this.burgerStart = this.time;
  }
  startPractice() {
    this.state = 'practice';
    this.total = 0;
    this.count = 0;
    this.orderNo = 1;
    this.duration = 0;
    this.recipe = this.makeRecipe();
    this.nextRecipe = false;
    this.resetBoard();
    this.burgerStart = this.time;
  }
  // チュートリアル用：画面上の各エリア（CSS px）
  getAreas() {
    const r = (x, y, w, h) => ({ left: this.offX + x * this.scale, top: this.offY + y * this.scale, width: w * this.scale, height: h * this.scale });
    const o = this.orderRect || { x: 12, y: 62, w: 132, h: 300 };
    const tx = this.trayHomeX;
    return {
      order: r(o.x - 4, o.y - 12, o.w + 8, o.h + 22),
      shelf: r(4, this.tableY + 16, W - 8, this.H - this.tableY - 20),
      burger: r(tx - 100, this.trayTop - 190, 200, 210),
      tray: r(tx - TRAY_W / 2 - 8, this.trayTop - 40, TRAY_W + 16, 62),
      back: r(6, 6, 120, 48),
    };
  }
  toIdle() {
    this.state = 'idle';
    this.recipe = null;
    this.resetBoard();
  }
  remaining() {
    if (this.state === 'playing') return Math.max(0, this.endAt - performance.now());
    if (this.state === 'ready') return this.duration;
    return 0;
  }

  makeRecipe() {
    const base = 2 + Math.floor(this.count / 2);
    const n = Math.min(7, base + (Math.random() < 0.35 ? 1 : 0));
    const inner = [];
    const counts = {};
    let guard = 0;
    while (inner.length < n && guard++ < 500) {
      const t = pick(INNER);
      if ((counts[t] || 0) >= 2) continue;
      if (inner[inner.length - 1] === t) continue;
      counts[t] = (counts[t] || 0) + 1;
      inner.push(t);
    }
    return inner; // 下→上
  }

  // ----- 盤面 -----
  resetBoard() {
    for (const b of [...this.items]) this.removeItem(b, false);
    this.ghosts = [];
    this.timers = [];
    this.popups = [];
    this.drag = null;
    this.trayDrag = null;
    this.pointer = null;
    this.carry = null;
    this.trayMode = 'idle';
    this.trayVx = 0;
    this.completing = false;
    this.stableT = 0;
    this.bottomBun = null;
    Body.setPosition(this.tray, { x: this.trayHomeX, y: this.trayY });
    this.slots.forEach((s, i) => {
      s.item = null;
      s.pending = false;
      this.respawnSlot(i, 70 * i);
    });
    this.spawnBottomBun(400);
  }

  maskFor(b) {
    return b.slotIdx != null ? CAT_ITEM | CAT_STATIC : CAT_ITEM | CAT_STATIC | CAT_SHELF;
  }

  addItem(type, x, y, slotIdx = null) {
    const d = ING[type];
    const b = Bodies.rectangle(x, y, d.w, d.h, {
      chamfer: { radius: Math.min(d.h / 2 - 0.5, 6) },
      friction: 0.9,
      frictionStatic: 1.6,
      frictionAir: 0.015,
      restitution: 0,
      density: type === 'patty' ? 0.003 : 0.0018,
      slop: 0.05,
    });
    Body.setInertia(b, b.inertia * 3); // 回転しにくくして積みを安定させる
    b.ingType = type;
    b.slotIdx = slotIdx;
    b.locked = false;
    b.collisionFilter.category = slotIdx != null ? CAT_SHELF : CAT_ITEM;
    b.collisionFilter.mask = this.maskFor(b);
    this.items.push(b);
    Composite.add(this.world, b);
    return b;
  }

  removeItem(b, respawn = true) {
    const i = this.items.indexOf(b);
    if (i < 0) return;
    this.items.splice(i, 1);
    Composite.remove(this.world, b);
    if (this.drag && this.drag.body === b) this.drag = null;
    if (b.slotIdx != null) {
      const s = this.slots[b.slotIdx];
      if (s.item === b) {
        s.item = null;
        if (respawn) this.respawnSlot(b.slotIdx);
      }
    }
    if (b === this.bottomBun) {
      this.bottomBun = null;
      if (respawn && !this.completing && ['idle', 'drag', 'coast'].includes(this.trayMode)) this.spawnBottomBun(200);
    }
  }

  detach(b) {
    if (b.slotIdx == null) return;
    const idx = b.slotIdx;
    const s = this.slots[idx];
    b.slotIdx = null;
    b.collisionFilter.category = CAT_ITEM;
    if (!(this.drag && this.drag.body === b)) b.collisionFilter.mask = this.maskFor(b);
    if (s.item === b) {
      s.item = null;
      this.respawnSlot(idx);
    }
  }

  respawnSlot(i, delay = 250) {
    const s = this.slots[i];
    if (s.pending) return;
    s.pending = true;
    this.ghosts.push({ type: s.type, x: s.x, y: -50, vy: 0, restY: s.y, slot: i, at: this.time + delay });
  }

  spawnBottomBun(delay = 0) {
    if (this.ghosts.some((g) => g.isBottom)) return;
    this.ghosts.push({
      type: 'bottomBun', x: this.tray.position.x, y: -50, vy: 0,
      restY: this.trayTop - ING.bottomBun.h / 2, slot: null, isBottom: true, followTray: true, at: this.time + delay,
    });
  }

  after(ms, fn) {
    this.timers.push({ at: this.time + ms, fn });
  }

  // ----- 入力 -----
  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.offX) / this.scale, y: (e.clientY - r.top - this.offY) / this.scale };
  }
  pickItem(px, py) {
    let best = null;
    let bestScore = Infinity;
    for (const b of this.items) {
      if (b.locked) continue;
      const d = ING[b.ingType];
      const c = Math.cos(-b.angle);
      const s = Math.sin(-b.angle);
      const dx = px - b.position.x;
      const dy = py - b.position.y;
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) <= d.w / 2 + 4 && Math.abs(ly) <= d.h / 2 + 9) {
        const score = Math.max(0, Math.abs(ly) - d.h / 2) * 10 + Math.abs(ly) * 0.1;
        if (score <= bestScore) {
          bestScore = score;
          best = b;
        }
      }
    }
    return best;
  }
  hitTray(p) {
    return Math.abs(p.x - this.tray.position.x) <= TRAY_W / 2 + 8 && p.y >= this.trayTop - 8 && p.y <= this.tableY + 30;
  }
  onDown(e) {
    if (this.pointer || (this.state !== 'playing' && this.state !== 'practice')) return;
    const p = this.toWorld(e);
    if (this.state === 'practice' && p.x >= 6 && p.x <= 126 && p.y >= 4 && p.y <= 56) {
      e.preventDefault();
      if (this.onBack) this.onBack();
      return;
    }
    const trayFirst = p.y >= this.trayTop + 1 && this.hitTray(p);
    const b = trayFirst ? null : this.pickItem(p.x, p.y);
    if (b) {
      this.drag = { body: b, ox: b.position.x - p.x, oy: b.position.y - p.y };
      b.collisionFilter.mask = 0; // ドラッグ中は何にも当たらない
      const i = this.items.indexOf(b);
      this.items.splice(i, 1);
      this.items.push(b);
    } else if (['idle', 'coast'].includes(this.trayMode) && this.hitTray(p)) {
      this.trayDrag = { ox: this.tray.position.x - p.x };
      this.trayTargetX = this.tray.position.x;
      this.trayMode = 'drag';
      this.carry = this.burgerGroup();
    } else {
      return;
    }
    this.pointer = { id: e.pointerId, x: p.x, y: p.y, hist: [{ x: p.x, y: p.y, t: performance.now() }] };
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    e.preventDefault();
  }
  onMove(e) {
    if (!this.pointer || e.pointerId !== this.pointer.id) return;
    const p = this.toWorld(e);
    const now = performance.now();
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.hist.push({ x: p.x, y: p.y, t: now });
    while (this.pointer.hist.length > 2 && now - this.pointer.hist[0].t > 200) this.pointer.hist.shift();
    if (this.trayDrag) this.trayTargetX = p.x + this.trayDrag.ox;
  }
  releaseVelocity() {
    const h = this.pointer.hist;
    const now = performance.now();
    const last = h[h.length - 1];
    if (now - last.t > 90) return { x: 0, y: 0 };
    let first = h[0];
    for (const s of h) {
      if (last.t - s.t <= 110) { first = s; break; }
    }
    const dt = last.t - first.t;
    if (dt < 8) return { x: 0, y: 0 };
    return { x: ((last.x - first.x) / dt) * STEP, y: ((last.y - first.y) / dt) * STEP };
  }
  onUp(e) {
    if (!this.pointer || e.pointerId !== this.pointer.id) return;
    const v = this.releaseVelocity();
    if (this.drag) this.releaseBody(v);
    if (this.trayDrag) {
      this.trayDrag = null;
      if (this.trayMode === 'drag') {
        this.trayMode = 'coast';
        this.trayVx = clamp(v.x, -60, 60);
      }
    }
    this.pointer = null;
  }
  releaseBody(v) {
    const b = this.drag.body;
    this.drag = null;
    if (!this.items.includes(b)) return;
    Body.setVelocity(b, { x: clamp(v.x, -50, 50), y: clamp(v.y, -50, 50) });
    Body.setAngularVelocity(b, 0);
    if (b.slotIdx != null) {
      const s = this.slots[b.slotIdx];
      if (Math.hypot(b.position.x - s.x, b.position.y - s.y) > 45) this.detach(b);
    }
    this.liftClear(b);
  }
  // 離した位置で何かに重なっていたら、重ならない高さまで持ち上げる（＝上に乗る）
  liftClear(b) {
    const others = this.statics.concat(this.items.filter((o) => o !== b && (b.slotIdx == null || o.slotIdx == null)));
    let n = 0;
    while (n < 200 && Query.collides(b, others).length) {
      Body.translate(b, { x: 0, y: -3 });
      n++;
    }
    b.collisionFilter.mask = this.maskFor(b);
  }
  cancelInput() {
    if (this.drag) this.releaseBody({ x: 0, y: 0 });
    if (this.trayDrag) {
      this.trayDrag = null;
      this.trayMode = 'coast';
      this.trayVx = 0;
    }
    this.pointer = null;
  }

  // ----- バーガー判定 -----
  burgerGroup() {
    const adj = new Map();
    const link = (a, b) => {
      if (!adj.has(a.id)) adj.set(a.id, []);
      adj.get(a.id).push(b);
    };
    for (const p of this.engine.pairs.list) {
      if (!p.isActive || p.isSensor) continue;
      if (Math.abs(p.collision.normal.y) < 0.5) continue;
      const a = p.bodyA.parent;
      const b = p.bodyB.parent;
      link(a, b);
      link(b, a);
    }
    const dragB = this.drag && this.drag.body;
    const out = [];
    const seen = new Set([this.tray.id]);
    const queue = [this.tray];
    while (queue.length) {
      const n = queue.shift();
      for (const m of adj.get(n.id) || []) {
        if (seen.has(m.id) || !m.ingType || m === dragB) continue;
        if (n === this.tray) {
          if (m.position.y >= n.position.y || Math.abs(m.position.x - n.position.x) > TRAY_W / 2 + 10) continue;
        } else if (m.position.y >= n.position.y - 1) continue;
        seen.add(m.id);
        out.push(m);
        queue.push(m);
      }
    }
    return out;
  }

  checkComplete() {
    if (this.trayMode !== 'idle' || this.completing) {
      this.stableT = 0;
      return;
    }
    const g = this.burgerGroup();
    const tops = g.filter((b) => b.ingType === 'topBun');
    if (!tops.length) {
      this.stableT = 0;
      return;
    }
    const top = tops.reduce((a, b) => (a.position.y < b.position.y ? a : b));
    if (g.some((b) => b.position.y < top.position.y - 1)) {
      this.stableT = 0;
      return;
    }
    // トップバンズがほぼ動かない状態が続いたら完成
    const ref = this.stableRef;
    const calm = g.every((b) => b.speed < 0.8);
    if (!calm || !ref || ref.body !== top || Math.hypot(top.position.x - ref.x, top.position.y - ref.y) > 2.5 || Math.abs(top.angle - ref.a) > 0.05) {
      this.stableRef = { body: top, x: top.position.x, y: top.position.y, a: top.angle };
      this.stableT = 0;
      return;
    }
    this.stableT += STEP;
    if (this.stableT >= 500) this.complete(g, top);
  }

  scoreBurger(g) {
    const sorted = g.slice().sort((a, b) => b.position.y - a.position.y); // 下→上
    const types = sorted.map((b) => b.ingType);
    const inner = types.slice();
    let hasBottom = false;
    if (inner[0] === 'bottomBun') {
      hasBottom = true;
      inner.shift();
    }
    if (inner[inner.length - 1] === 'topBun') inner.pop();
    const rec = this.recipe;
    let r = lcs(rec, inner) / Math.max(rec.length, inner.length, 1);
    if (!hasBottom) r *= 0.5;
    const refX = hasBottom ? sorted[0].position.x : this.tray.position.x;
    const rest = sorted.slice(1);
    const meanOff = rest.length ? rest.reduce((s, b) => s + Math.abs(b.position.x - refX), 0) / rest.length : 0;
    const meanAng = sorted.reduce((s, b) => s + Math.abs(normAngle(b.angle)), 0) / sorted.length;
    const neat = clamp01(1 - meanOff / 30) * clamp01(1 - meanAng / 0.35);
    // 順番 500点 + きれいさ 500点（きれいさは順番の一致度に比例）
    const score = Math.round(r * (500 + 500 * neat));
    return { score, order: r, neat };
  }

  complete(g, top) {
    this.completing = true;
    this.stableT = 0;
    const res = this.scoreBurger(g);
    const practice = this.state === 'practice';
    this.count += 1;
    if (practice) {
      const sub = res.order >= 0.999 ? 'オーダー通り！' : '順番をチェック';
      this.popups.push({ text: '完成！', sub, x: clamp(top.position.x, 90, W - 90), y: top.position.y - 40, t: 0 });
    } else {
      this.total += res.score;
      let label = 'ざんねん…';
      if (res.score >= 950) label = 'パーフェクト！';
      else if (res.score >= 800) label = 'グレート！';
      else if (res.score >= 600) label = 'グッド！';
      else if (res.score > 0) label = 'おしい！';
      this.popups.push({ text: `+${res.score}`, sub: label, x: clamp(top.position.x, 90, W - 90), y: top.position.y - 40, t: 0 });
    }
    for (const b of g) b.locked = true;
    this.carry = g.slice();
    this.trayMode = 'hold';
    this.nextRecipe = true;
    if (!practice && this.onBurger) this.onBurger({ ...res, total: this.total, count: this.count });
    this.after(550, () => {
      if (this.trayMode === 'hold') {
        this.trayMode = 'exit';
        this.trayVx = 0;
      }
    });
  }

  trayGone(dir) {
    if (this.carry) for (const b of this.carry) this.removeItem(b, false);
    this.carry = null;
    this.ghosts = this.ghosts.filter((gh) => !gh.isBottom);
    this.bottomBun = null;
    this.trayVx = 0;
    if (!this.nextRecipe) {
      this.popups.push({ text: 'つくり直し', sub: '', x: W / 2 + 40, y: this.trayTop - 80, t: 0, small: true });
    }
    Body.setPosition(this.tray, { x: dir > 0 ? -TRAY_W : W + TRAY_W, y: this.trayY });
    this.trayMode = 'enter';
  }

  onTrayArrived() {
    if (this.nextRecipe) {
      this.recipe = this.makeRecipe();
      this.orderNo += 1;
      this.nextRecipe = false;
    }
    this.completing = false;
    this.spawnBottomBun(0);
    this.burgerStart = this.time;
  }

  // ----- 更新 -----
  frame(t) {
    const dt = Math.min(100, t - this.last);
    this.last = t;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 5) {
      this.step();
      this.acc -= STEP;
      n++;
    }
    if (n === 5) this.acc = 0;
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  step() {
    this.time += STEP;
    this.updateGhosts();
    this.updateTray();
    this.updateDrag();
    Engine.update(this.engine, STEP);
    this.damp();
    this.cleanup();
    if (this.state === 'playing' || this.state === 'practice') this.checkComplete();
    if (this.state === 'playing' && performance.now() >= this.endAt) this.finish();
    for (const p of this.popups) p.t += STEP;
    this.popups = this.popups.filter((p) => p.t < 1600);
    const due = this.timers.filter((tm) => tm.at <= this.time);
    this.timers = this.timers.filter((tm) => tm.at > this.time);
    for (const tm of due) tm.fn();
  }

  finish() {
    this.cancelInput();
    this.state = 'over';
    if (this.onEnd) this.onEnd({ score: this.total, count: this.count });
  }

  updateGhosts() {
    const keep = [];
    for (const g of this.ghosts) {
      if (this.time < g.at) { keep.push(g); continue; }
      if (g.followTray) g.x = this.tray.position.x;
      g.vy = Math.min(g.vy + 0.9, 20);
      g.y += g.vy;
      const lift = g.slot != null ? 3 : 14; // 棚は上の天板に重ならないよう低い位置で実体化
      if (g.y >= g.restY - lift) {
        const b = this.addItem(g.type, g.x, g.restY - lift, g.slot);
        Body.setVelocity(b, { x: 0, y: Math.min(g.vy, 5) });
        if (g.slot != null) {
          const s = this.slots[g.slot];
          s.item = b;
          s.pending = false;
        }
        if (g.isBottom) this.bottomBun = b;
      } else keep.push(g);
    }
    this.ghosts = keep;
  }

  updateTray() {
    const t = this.tray;
    let dx = 0;
    switch (this.trayMode) {
      case 'drag':
        dx = this.trayTargetX - t.position.x;
        break;
      case 'coast':
        dx = this.trayVx;
        this.trayVx *= 0.93;
        if (Math.abs(this.trayVx) < 0.08) {
          this.trayVx = 0;
          this.trayMode = 'idle';
          this.carry = null;
        }
        break;
      case 'exit':
        this.trayVx = Math.min(this.trayVx + 1.1, 26);
        dx = this.trayVx;
        break;
      case 'enter': {
        const d = this.trayHomeX - t.position.x;
        dx = Math.abs(d) < 0.6 ? d : d * 0.16;
        if (Math.abs(d) < 0.6) {
          this.trayMode = 'idle';
          Body.setPosition(t, { x: this.trayHomeX, y: this.trayY });
          this.onTrayArrived();
          dx = 0;
        }
        break;
      }
      default:
        break;
    }
    if (dx) {
      Body.setPosition(t, { x: t.position.x + dx, y: this.trayY });
      if (this.carry) {
        for (const b of this.carry) if (this.items.includes(b)) Body.translate(b, { x: dx, y: 0 });
      }
      if (this.trayMode === 'drag' || this.trayMode === 'coast') {
        const set = new Set(this.carry || []);
        for (const b of this.burgerGroup()) set.add(b);
        this.carry = [...set];
      }
    }
    if (['coast', 'exit'].includes(this.trayMode)) {
      const x = t.position.x;
      if (x - TRAY_W / 2 > W + 10) this.trayGone(1);
      else if (x + TRAY_W / 2 < -10) this.trayGone(-1);
    }
  }

  // ほぼ止まっている具材の細かい振動を減衰させる
  damp() {
    const dragB = this.drag && this.drag.body;
    for (const b of this.items) {
      if (b === dragB) continue;
      if (b.speed < 0.8) Body.setVelocity(b, { x: b.velocity.x * 0.85, y: b.velocity.y * 0.85 });
      if (Math.abs(b.angularVelocity) < 0.03) Body.setAngularVelocity(b, b.angularVelocity * 0.7);
    }
  }

  updateDrag() {
    if (!this.drag || !this.pointer) return;
    const b = this.drag.body;
    if (!this.items.includes(b)) { this.drag = null; return; }
    const tx = this.pointer.x + this.drag.ox;
    const ty = this.pointer.y + this.drag.oy;
    Body.setVelocity(b, {
      x: clamp((tx - b.position.x) * 0.5, -45, 45),
      y: clamp((ty - b.position.y) * 0.5, -45, 45),
    });
    Body.setAngularVelocity(b, -normAngle(b.angle) * 0.2);
  }

  cleanup() {
    const carrying = this.carry && ['coast', 'exit', 'hold', 'drag'].includes(this.trayMode) ? new Set(this.carry) : null;
    const dragB = this.drag && this.drag.body;
    for (const b of [...this.items]) {
      if (b === dragB) continue;
      // 具材置きから弾き出された具材は補充
      if (b.slotIdx != null) {
        const s = this.slots[b.slotIdx];
        if (Math.hypot(b.position.x - s.x, b.position.y - s.y) > 60) this.detach(b);
      }
      if (carrying && carrying.has(b)) continue;
      const { x, y } = b.position;
      if (x < -90 || x > W + 90 || y > this.H + 90 || y < -700) this.removeItem(b, true);
    }
  }

  // ----- 描画 -----
  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#86CDBE';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, this.dpr * this.offX, this.dpr * this.offY);

    this.drawBackground(ctx);
    this.drawOrder(ctx);
    this.drawTray(ctx);
    const dragB = this.drag && this.drag.body;
    for (const b of this.items) if (b !== dragB) this.drawBody(ctx, b);
    for (const g of this.ghosts) {
      if (this.time < g.at) continue;
      const d = ING[g.type];
      ctx.save();
      ctx.translate(g.x, g.y);
      drawIngredient(ctx, g.type, d.w, d.h);
      ctx.restore();
    }
    if (dragB) {
      ctx.save();
      ctx.shadowColor = 'rgba(58,34,19,0.35)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 10;
      this.drawBody(ctx, dragB);
      ctx.restore();
    }
    if (this.state !== 'idle') this.drawHUD(ctx);
    this.drawPopups(ctx);
  }

  drawBody(ctx, b) {
    const d = ING[b.ingType];
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    drawIngredient(ctx, b.ingType, d.w, d.h);
    ctx.restore();
  }

  drawBackground(ctx) {
    const L = -this.offX / this.scale - 2;
    const R = W + this.offX / this.scale + 2;
    const top = -this.offY / this.scale - 2;
    const bottom = this.H + (this.canvas.height / this.dpr) / this.scale;
    // 壁タイル
    ctx.fillStyle = '#86CDBE';
    ctx.fillRect(L, top, R - L, this.tableY - top);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1.5;
    const th = 26;
    const tw = 52;
    const startRow = Math.floor(top / th);
    for (let r = startRow; r * th < this.tableY; r++) {
      const y = r * th;
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(R, y);
      ctx.stroke();
      const off = ((r % 2) + 2) % 2 ? tw / 2 : 0;
      for (let x = Math.floor(L / tw) * tw - off; x < R; x += tw) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, Math.min(y + th, this.tableY));
        ctx.stroke();
      }
    }
    // 天板
    ctx.fillStyle = '#DDA568';
    ctx.fillRect(L, this.tableY, R - L, 14);
    ctx.fillStyle = '#B9793F';
    ctx.fillRect(L, this.tableY + 10, R - L, 4);
    ctx.fillStyle = INK;
    ctx.fillRect(L, this.tableY - 1, R - L, 2);
    // 具材置き
    ctx.fillStyle = '#8A5530';
    ctx.fillRect(L, this.tableY + 14, R - L, bottom - this.tableY);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(L, this.tableY + 14, R - L, 8);
    for (const y of this.ledges) {
      ctx.fillStyle = '#C98D51';
      ctx.fillRect(L, y, R - L, 6);
      ctx.fillStyle = '#5E3A1E';
      ctx.fillRect(L, y + 6, R - L, 2);
    }
    ctx.fillStyle = '#F6E3C6';
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const s of this.slots) ctx.fillText(ING[s.type].name, s.x, s.ledge + 22);
  }

  drawTray(ctx) {
    const x = this.tray.position.x;
    const top = this.trayTop;
    ctx.save();
    rrect(ctx, x - TRAY_W / 2, top, TRAY_W, TRAY_H + 1, 5);
    ctx.fillStyle = '#D93A2B';
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#F2715C';
    rrect(ctx, x - TRAY_W / 2 + 4, top + 2, TRAY_W - 8, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(58,34,19,0.55)';
    rrect(ctx, x - TRAY_W / 2 + 8, top + 6, 16, 3.5, 1.5);
    ctx.fill();
    rrect(ctx, x + TRAY_W / 2 - 24, top + 6, 16, 3.5, 1.5);
    ctx.fill();
    ctx.restore();
  }

  drawOrder(ctx) {
    if (!this.recipe || this.state === 'idle') return;
    const layers = ['bottomBun', ...this.recipe, 'topBun'];
    const s = 0.8;
    const gap = 3;
    const hh = layers.map((t) => Math.max(ING[t].h * s, 8));
    const picH = hh.reduce((a, b) => a + b, 0) + gap * (layers.length - 1);
    const lineH = 14;
    const w = 132;
    const h = 34 + picH + 14 + layers.length * lineH + 10;
    const x = 12;
    const y = 62;
    this.orderRect = { x, y, w, h };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.015);
    // 伝票
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    const teeth = 11;
    for (let i = 1; i <= teeth; i++) {
      const tx = w - (w * i) / teeth;
      ctx.lineTo(tx + w / teeth / 2, h + 5);
      ctx.lineTo(tx, h);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFFDF7';
    ctx.fill();
    outline(ctx);
    // クリップ
    ctx.fillStyle = '#F7C23B';
    rrect(ctx, w / 2 - 22, -9, 44, 15, 4);
    ctx.fill();
    outline(ctx);
    // 見出し
    ctx.fillStyle = INK;
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`オーダー ${this.orderNo}`, 10, 25);
    // 絵
    let cy = 32 + picH;
    layers.forEach((t, i) => {
      const d = ING[t];
      ctx.save();
      ctx.translate(w / 2, cy - hh[i] / 2);
      drawIngredient(ctx, t, d.w * s, d.h * s);
      ctx.restore();
      cy -= hh[i] + gap;
    });
    // 名前（上→下）
    ctx.strokeStyle = 'rgba(58,34,19,0.3)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 40 + picH);
    ctx.lineTo(w - 8, 40 + picH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `800 11px ${FONT}`;
    let ly = 44 + picH + 11;
    for (let i = layers.length - 1; i >= 0; i--) {
      const d = ING[layers[i]];
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(16, ly - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(d.short, 26, ly);
      ly += lineH;
    }
    ctx.restore();
  }

  drawHUD(ctx) {
    if (this.state === 'practice') {
      rrect(ctx, 10, 10, 112, 40, 20);
      ctx.fillStyle = '#FFFDF7';
      ctx.fill();
      outline(ctx, 2.5);
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `20px ${DISPLAY}`;
      ctx.fillText('‹ もどる', 66, 31);
      rrect(ctx, 220, 10, 170, 40, 20);
      ctx.fillStyle = '#F7C23B';
      ctx.fill();
      outline(ctx, 2.5);
      ctx.fillStyle = INK;
      ctx.font = `20px ${DISPLAY}`;
      ctx.fillText('練習モード', 305, 31);
      return;
    }
    const ms = this.remaining();
    const sec = Math.ceil(ms / 1000);
    const mm = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    const low = this.state === 'playing' && sec <= 10;
    ctx.textBaseline = 'middle';
    // タイマー
    rrect(ctx, 10, 10, 124, 40, 20);
    ctx.fillStyle = low ? '#D93A2B' : '#F7C23B';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.fillStyle = low ? '#FFFDF7' : INK;
    const timeLeft = this.drawLabel(ctx, 'のこり', 22);
    this.fitText(ctx, `${mm}:${ss}`, timeLeft + 6, 124, 24);
    // 個数
    rrect(ctx, 142, 10, 70, 40, 20);
    ctx.fillStyle = '#FFFDF7';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.save();
    ctx.translate(162, 30);
    drawIngredient(ctx, 'topBun', 24, 11);
    ctx.translate(0, 7);
    drawIngredient(ctx, 'bottomBun', 23, 7);
    ctx.restore();
    ctx.fillStyle = INK;
    this.fitText(ctx, String(this.count), 178, 202, 22);
    // スコア
    rrect(ctx, 220, 10, 170, 40, 20);
    ctx.fillStyle = '#FFFDF7';
    ctx.fill();
    outline(ctx, 2.5);
    ctx.fillStyle = INK;
    const scoreLeft = this.drawLabel(ctx, 'スコア', 233);
    this.fitText(ctx, this.total.toLocaleString('ja-JP'), scoreLeft + 6, 378, 22);
  }

  // 小さいラベルを描き、右端のx座標を返す
  drawLabel(ctx, text, x) {
    ctx.textAlign = 'left';
    ctx.font = `800 11px ${FONT}`;
    ctx.fillText(text, x, 31);
    return x + ctx.measureText(text).width;
  }

  // left〜right の幅に収まるよう縮小しつつ右寄せで描く
  fitText(ctx, text, left, right, size) {
    const maxW = right - left;
    ctx.font = `${size}px ${DISPLAY}`;
    let w = ctx.measureText(text).width;
    let fs = size;
    if (w > maxW) {
      fs = Math.max(10, Math.floor((size * maxW) / w));
      ctx.font = `${fs}px ${DISPLAY}`;
    }
    ctx.textAlign = 'right';
    ctx.fillText(text, right, 31);
  }

  drawPopups(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      const a = p.t < 1200 ? 1 : 1 - (p.t - 1200) / 400;
      const rise = p.t * 0.03;
      const pop = p.t < 160 ? 0.6 + (p.t / 160) * 0.4 : 1;
      ctx.globalAlpha = clamp01(a);
      ctx.save();
      ctx.translate(p.x, p.y - rise);
      ctx.scale(pop, pop);
      ctx.font = `${p.small ? 22 : 34}px ${DISPLAY}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.small ? '#FFFDF7' : '#F7C23B';
      ctx.fillText(p.text, 0, 0);
      if (p.sub) {
        ctx.font = `18px ${DISPLAY}`;
        ctx.lineWidth = 5;
        ctx.strokeText(p.sub, 0, 32);
        ctx.fillStyle = '#FFFDF7';
        ctx.fillText(p.sub, 0, 32);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
