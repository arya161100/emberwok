// EMBERWOK — render.js
// Draws the whole night-market scene from world.state + config. Pure: it never
// mutates the world. Every position comes from LAYOUT (config.js) — the same
// rects the world uses for hit tests — with a local fallback only if a key
// is missing, so a click the eye sees is a click the simulation feels.
//
// Screen strings (must match world.state.screen exactly):
export const SCREEN_TITLE = 'TITLE';
export const SCREEN_PLAY = 'PLAY';
export const SCREEN_PAUSED = 'PAUSED';
export const SCREEN_NIGHT_DONE = 'NIGHT_DONE';
export const SCREEN_GAME_OVER = 'GAME_OVER';
export const SCREEN_RESULTS = 'RESULTS';

import {
  DISHES, LAYOUT, STATIONS, UPGRADES, TUNING,
  dishById, upgradeById, ticketRectForSeat,
} from './config.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const FONT = "'Trebuchet MS', 'Verdana', 'Segoe UI', sans-serif";

// Render-local frame counter (NOT world state): drives blinking and light
// flicker even on screens where world time does not advance, e.g. TITLE.
let frame = 0;

// Deterministic pseudo-random from an integer (no Math.random in render).
function hash01(n) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (Math.imul(x, 2246822519)) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function dishOf(id) {
  if (id == null) return { id, name: '?', price: 0, chain: [], color: '#f4a259' };
  const d = typeof dishById === 'function' ? dishById(id) : null;
  if (d) return d;
  if (Array.isArray(DISHES)) {
    const found = DISHES.find((x) => x && (x.id === id || x.key === id || x.name === id));
    if (found) return found;
  } else if (DISHES && typeof DISHES === 'object') {
    if (DISHES[id]) return DISHES[id];
  }
  return { id, name: String(id), price: 0, chain: [], color: '#f4a259' };
}

function dishName(id) {
  return dishOf(id).name ?? String(id);
}

function dishPrice(id) {
  const p = dishOf(id).price;
  return typeof p === 'number' ? p : 0;
}

function upgradeOf(id) {
  if (id == null) return { id, name: String(id), cost: 0, desc: '' };
  const u = typeof upgradeById === 'function' ? upgradeById(id) : null;
  if (u) return u;
  if (Array.isArray(UPGRADES)) {
    const found = UPGRADES.find((x) => x && (x.id === id || x.key === id));
    if (found) return found;
  } else if (UPGRADES && typeof UPGRADES === 'object') {
    if (UPGRADES[id]) return UPGRADES[id];
  }
  return { id, name: String(id), cost: 0, desc: '' };
}

function stationLabel(key) {
  if (STATIONS && STATIONS[key]) {
    const s = STATIONS[key];
    if (typeof s === 'string') return s;
    return s.label || s.name || key.toUpperCase();
  }
  return key.toUpperCase();
}

// LAYOUT readers with fallbacks (canvas is 1280x720).
function stationRect(key) {
  const fallback = {
    chop: { x: 60, y: 470, w: 180, h: 130 },
    wok: { x: 270, y: 470, w: 180, h: 130 },
    steam: { x: 480, y: 470, w: 180, h: 130 },
    plate: { x: 690, y: 470, w: 180, h: 130 },
  }[key] || { x: 60, y: 470, w: 180, h: 130 };
  const r = LAYOUT && LAYOUT.stations && LAYOUT.stations[key];
  return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : fallback;
}

function teapotRect() {
  const r = LAYOUT && LAYOUT.teapot;
  return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : { x: 900, y: 470, w: 120, h: 130 };
}

function trashRect() {
  const r = LAYOUT && LAYOUT.trash;
  return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : { x: 1050, y: 500, w: 90, h: 100 };
}

function seatPos(i) {
  const seats = LAYOUT && LAYOUT.seats;
  if (Array.isArray(seats) && seats[i]) return { x: seats[i].x, y: seats[i].y };
  return { x: 130 + i * 230, y: 300 };
}

function ticketRect(i) {
  if (typeof ticketRectForSeat === 'function') {
    try {
      const t = ticketRectForSeat(i);
      if (t) return { x: t.x, y: t.y, w: t.w, h: t.h };
    } catch { /* fall through */ }
  }
  const s = seatPos(i);
  return { x: s.x - 75, y: 150, w: 150, h: 90 };
}

function shopCardRect(i) {
  const cards = LAYOUT && LAYOUT.shopCards;
  if (Array.isArray(cards) && cards[i]) {
    const c = cards[i];
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return { x: 110 + i * 365, y: 210, w: 330, h: 240 };
}

function buttonRect(name) {
  const fallback = {
    start: { x: 490, y: 520, w: 300, h: 64 },
    nextNight: { x: 490, y: 560, w: 300, h: 64 },
    skipShop: { x: 490, y: 640, w: 300, h: 48 },
    tryAgain: { x: 490, y: 520, w: 300, h: 64 },
    playAgain: { x: 490, y: 520, w: 300, h: 64 },
    resume: { x: 490, y: 520, w: 300, h: 64 },
  }[name] || { x: 490, y: 520, w: 300, h: 64 };
  const b = LAYOUT && LAYOUT.buttons && LAYOUT.buttons[name];
  return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : fallback;
}

function hudAnchor(name, fallback) {
  const h = LAYOUT && LAYOUT.hud && LAYOUT.hud[name];
  return h || fallback;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function text(ctx, s, x, y, size, color, align = 'center', weight = 'bold') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(s), x, y);
}

function textShadow(ctx, s, x, y, size, color, align = 'center', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 7);
  ctx.strokeStyle = 'rgba(20, 8, 32, 0.9)';
  ctx.strokeText(String(s), x, y);
  ctx.fillStyle = color;
  ctx.fillText(String(s), x, y);
}

function progressBar(ctx, x, y, w, h, frac, fill, bg = 'rgba(0,0,0,0.55)') {
  const f = Math.max(0, Math.min(1, frac || 0));
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (f > 0) {
    rr(ctx, x + 1, y + 1, Math.max(h - 2, (w - 2) * f), h - 2, (h - 2) / 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, h / 2);
  ctx.stroke();
}

function coinIcon(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffc93c';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#b97e1e';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8a91c';
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, 'C', x, y + 1, Math.round(r * 1.1), '#8a5a00');
}

function heartIcon(ctx, x, y, size, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-11, -4, -6, -12, 0, -5);
  ctx.bezierCurveTo(6, -12, 11, -4, 0, 6);
  ctx.closePath();
  ctx.fillStyle = filled ? '#ff4d6d' : 'rgba(255,255,255,0.18)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = filled ? '#c9184a' : 'rgba(255,255,255,0.4)';
  ctx.stroke();
  ctx.restore();
}

// Small dark pill behind a hint line, so it reads over fire / steam.
function hintPill(ctx, s, cx, y, size = 12, color = '#ffd166') {
  ctx.font = `bold ${size}px ${FONT}`;
  const w = ctx.measureText(s).width + 18;
  rr(ctx, cx - w / 2, y - size / 2 - 4, w, size + 8, (size + 8) / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  text(ctx, s, cx, y, size, color);
}

// ---------------------------------------------------------------------------
// Background: night market sky, stalls, lanterns, string lights
// ---------------------------------------------------------------------------

function drawBackground(ctx) {
  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0, '#171233');
  sky.addColorStop(0.45, '#2a1b4d');
  sky.addColorStop(0.75, '#4a2350');
  sky.addColorStop(1, '#1c1030');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1280, 720);

  // Stars (deterministic positions).
  for (let i = 0; i < 90; i++) {
    const x = hash01(i * 3 + 1) * 1280;
    const y = hash01(i * 3 + 2) * 300;
    const r = 0.6 + hash01(i * 3 + 3) * 1.6;
    ctx.globalAlpha = 0.35 + hash01(i * 7 + 5) * 0.6;
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Moon, low on the right so it never hides behind the HUD bar.
  ctx.beginPath();
  ctx.arc(1150, 132, 32, 0, Math.PI * 2);
  ctx.fillStyle = '#ffeec2';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1138, 124, 26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(23,18,51,0.55)';
  ctx.fill();

  // Distant stall rooftops (silhouette row).
  ctx.fillStyle = '#241640';
  for (let i = 0; i < 6; i++) {
    const x = i * 220 - 20;
    ctx.beginPath();
    ctx.moveTo(x, 118);
    ctx.lineTo(x + 110, 78);
    ctx.lineTo(x + 220, 118);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + 8, 118, 204, 26);
  }

  // String lights across the top (bulbs sit on the sagging wire below).
  for (let row = 0; row < 2; row++) {
    const yBase = 104 + row * 26;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yBase - 18);
    ctx.quadraticCurveTo(640, yBase + 26, 1280, yBase - 18);
    ctx.stroke();
    const colors = ['#ffd166', '#ff6b6b', '#7bd389', '#4cc9f0', '#ff9f1c'];
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      // Point on the quadratic wire: y = yBase - 18 + 88 * t * (1 - t).
      const x = t * 1280;
      const y = yBase - 18 + 88 * t * (1 - t);
      const glow = 0.75 + 0.25 * Math.sin(frame * 0.05 + i);
      ctx.globalAlpha = glow;
      ctx.beginPath();
      ctx.arc(x, y + 6, 5, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y + 6, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Ground / market floor.
  const floor = ctx.createLinearGradient(0, 340, 0, 720);
  floor.addColorStop(0, '#3a2340');
  floor.addColorStop(1, '#241428');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 340, 1280, 380);

  // Paper lanterns hanging at the sides.
  drawLantern(ctx, 52, 230, 30, '#ff5d5d');
  drawLantern(ctx, 1228, 230, 30, '#ff9f1c');
  drawLantern(ctx, 52, 320, 22, '#ff9f1c');
  drawLantern(ctx, 1228, 320, 22, '#ff5d5d');
}

function drawLantern(ctx, x, y, r, color) {
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - r - 26);
  ctx.lineTo(x, y - r);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.78, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,20,20,0.7)';
  ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.78 * (1 - Math.abs(i) * 0.12), r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffd166';
  ctx.fillRect(x - 6, y - r - 4, 12, 5);
  ctx.fillRect(x - 6, y + r - 1, 12, 5);
  // Warm glow.
  const g = ctx.createRadialGradient(x, y, 4, x, y, r * 2.4);
  g.addColorStop(0, 'rgba(255,180,80,0.28)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Customers, tickets, patience
// ---------------------------------------------------------------------------

const SKIN = ['#f2c89b', '#e8b07d', '#c98d5f', '#8d5a3b', '#f7d7b0'];
const SHIRT = ['#4cc9f0', '#ff6b6b', '#7bd389', '#ffd166', '#b5179e', '#f72585'];

function drawCustomers(ctx, state) {
  const customers = state.customers || [];
  for (const c of customers) {
    if (!c || c.state === 'served' || c.state === 'left') continue;
    const seat = seatPos(c.seat || 0);
    const idx = c.seat || 0;
    const skin = SKIN[(c.id || 0) % SKIN.length];
    const shirt = c.vip ? '#ffd166' : SHIRT[(c.id || 0) % SHIRT.length];

    // Stool + table shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(seat.x, seat.y + 62, 52, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    ctx.fillStyle = shirt;
    rr(ctx, seat.x - 30, seat.y + 6, 60, 52, 14);
    ctx.fill();
    // Head.
    ctx.beginPath();
    ctx.arc(seat.x, seat.y - 16, 24, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    // Hair.
    ctx.beginPath();
    ctx.arc(seat.x, seat.y - 24, 24, Math.PI, 0);
    ctx.fillStyle = c.vip ? '#fff3c4' : ['#2b2b2b', '#5b3a1e', '#7a4a21', '#111111'][(c.id || 0) % 4];
    ctx.fill();
    ctx.fillRect(seat.x - 24, seat.y - 26, 48, 8);
    // Eyes (impatient squint when patience is low).
    const low = c.patience < (c.maxPatience || 1) * 0.35;
    ctx.fillStyle = '#1a1a1a';
    if (low) {
      ctx.fillRect(seat.x - 14, seat.y - 16, 10, 2);
      ctx.fillRect(seat.x + 4, seat.y - 16, 10, 2);
    } else {
      ctx.beginPath(); ctx.arc(seat.x - 9, seat.y - 16, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(seat.x + 9, seat.y - 16, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // VIP crown.
    if (c.vip) {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(seat.x - 16, seat.y - 40);
      ctx.lineTo(seat.x - 10, seat.y - 54);
      ctx.lineTo(seat.x - 4, seat.y - 42);
      ctx.lineTo(seat.x + 4, seat.y - 54);
      ctx.lineTo(seat.x + 10, seat.y - 42);
      ctx.lineTo(seat.x + 16, seat.y - 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Ticket above the seat.
    drawTicket(ctx, c, idx);
  }
}

function drawTicket(ctx, c, seatIndex) {
  const r = ticketRect(seatIndex);
  const vip = !!c.vip;
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(vip ? -0.02 : ((c.id || 0) % 3 - 1) * 0.015);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
  rr(ctx, r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = vip ? '#fff3c4' : '#fff8e7';
  ctx.fill();
  ctx.lineWidth = vip ? 3 : 2;
  ctx.strokeStyle = vip ? '#d4a017' : '#c9a227';
  ctx.stroke();
  // Dish name — big enough to read at 768x432.
  text(ctx, dishName(c.dishId), r.x + r.w / 2, r.y + 26, 20, '#3a2317');
  if (vip) text(ctx, '★ FOOD CRITIC ★', r.x + r.w / 2, r.y + 48, 12, '#b8860b');
  else text(ctx, `${dishPrice(c.dishId)} coins`, r.x + r.w / 2, r.y + 48, 13, '#7a5a1e');
  // Patience bar.
  const frac = c.maxPatience ? c.patience / c.maxPatience : 0;
  const barColor = frac > 0.5 ? '#43aa5b' : frac > 0.25 ? '#ff9f1c' : '#e5383b';
  progressBar(ctx, r.x + 10, r.y + r.h - 16, r.w - 20, 9, frac, barColor, 'rgba(0,0,0,0.25)');
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stations, plate, teapot, trash
// ---------------------------------------------------------------------------

// Dish icon drawn from the dish's own color + chain (config.js).
function drawDishIcon(ctx, dishId, x, y, r) {
  const d = dishOf(dishId);
  const chain = d.chain || d.steps || [];
  const main = d.color || '#f4a259';
  const id = String(dishId || '').toLowerCase();
  // Bowl.
  ctx.beginPath();
  ctx.arc(x, y + r * 0.25, r, 0, Math.PI);
  ctx.fillStyle = main;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + r * 0.25, r, 0, Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Food on top, by dish.
  ctx.fillStyle = '#fff3d6';
  if (id.includes('skewer')) {
    ctx.strokeStyle = '#8d5a2b';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.2); ctx.lineTo(x + r, y - r * 0.2); ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(x + i * r * 0.55, y - r * 0.2, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#ff7a3c'; ctx.fill();
    }
  } else if (id.includes('bun')) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(x + i * r * 0.5, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe9a8'; ctx.fill();
    }
  } else if (id.includes('cake') || chain.length >= 3) {
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.15, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - r * 0.4, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath(); ctx.arc(x, y - r * 0.55, r * 0.12, 0, Math.PI * 2); ctx.fill();
  } else {
    // Noodles / dumplings: three soft mounds.
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + (i - 1) * r * 0.5, y - r * 0.2, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = id.includes('dumpling') ? '#fdf0d5' : '#f7c548';
      ctx.fill();
    }
  }
}

function drawStation(ctx, state, key) {
  const r = stationRect(key);
  const st = (state.stations && state.stations[key]) || { slots: [] };
  const slots = st.slots || [];
  const selected = state.selected === key;

  // Counter block.
  rr(ctx, r.x, r.y, r.w, r.h, 14);
  const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  grad.addColorStop(0, selected ? '#5b3a1e' : '#4a2c17');
  grad.addColorStop(1, '#33200f');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeStyle = selected ? '#ffd166' : 'rgba(255,209,102,0.35)';
  ctx.stroke();

  // Label + key hint.
  const keyHint = { chop: '[1]', wok: '[2]', steam: '[3]', plate: '[4]' }[key] || '';
  text(ctx, `${stationLabel(key)} ${keyHint}`, r.x + r.w / 2, r.y + 16, 17, '#ffe8b3');

  // Fire / steam decoration along the bottom edge (behind the slots).
  if (key === 'wok') drawWokFire(ctx, r);
  if (key === 'steam') drawSteamPuffs(ctx, r, state);

  // Slots: sized to fit the rect (one tall slot, or two compact ones).
  const slotW = r.w - 24;
  const slotAreaTop = r.y + 28;
  const slotAreaH = r.h - 28 - 24;
  const gap = 4;
  const slotH = slots.length > 1
    ? Math.floor((slotAreaH - gap) / 2)
    : Math.min(64, slotAreaH);
  const totalH = slots.length * slotH + (slots.length - 1) * gap;
  let sy = slotAreaTop + Math.max(0, (slotAreaH - totalH) / 2);
  const compact = slots.length > 1;
  slots.forEach((item) => {
    const sx = r.x + 12;
    rr(ctx, sx, sy, slotW, slotH, 8);
    ctx.fillStyle = item ? 'rgba(255,240,200,0.16)' : 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (item) {
      const cy = sy + slotH / 2;
      if (item.burnt) {
        drawDishIcon(ctx, item.dishId, sx + (compact ? 16 : 24), cy, compact ? 11 : 16);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(sx + (compact ? 16 : 24), cy, compact ? 13 : 18, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        ctx.globalAlpha = 1;
        text(ctx, compact ? 'BURNT! X to toss' : 'BURNT! press X to toss',
          sx + (compact ? 34 : 46), cy, compact ? 11 : 14, '#ff6b6b', 'left');
      } else {
        drawDishIcon(ctx, item.dishId, sx + (compact ? 15 : 22), cy, compact ? 11 : 15);
        const nameSize = compact ? 11 : 13;
        text(ctx, dishName(item.dishId), sx + (compact ? 30 : 42), sy + (compact ? 11 : 16),
          nameSize, '#fff3d6', 'left');
        const need = item.need || 1;
        const frac = Math.min(1, (item.progress || 0) / need);
        const barColor = key === 'chop' ? '#7bd389' : key === 'wok' ? '#ff7b2f' : '#4cc9f0';
        progressBar(ctx, sx + (compact ? 30 : 42), sy + (compact ? 20 : 30),
          slotW - (compact ? 40 : 54), compact ? 7 : 10, frac, barColor);
        if (!compact) {
          const stepLabel = item.stepIndex != null ? `step ${item.stepIndex + 1}` : '';
          text(ctx, stepLabel, sx + 42, sy + 50, 11, '#d8c9a8', 'left');
        }
        // Burn warning: red "!" when a wok/steam item is about to burn.
        if ((key === 'wok' || key === 'steam') && frac >= 0.85) {
          ctx.beginPath();
          ctx.arc(sx + slotW - 12, sy + 11, 9, 0, Math.PI * 2);
          ctx.fillStyle = '#e5383b';
          ctx.fill();
          text(ctx, '!', sx + slotW - 12, sy + 12, 13, '#ffffff');
        }
      }
    } else {
      text(ctx, 'empty', sx + slotW / 2, sy + slotH / 2, 13, 'rgba(255,255,255,0.35)');
    }
    sy += slotH + gap;
  });

  // Selected hint as a pill over the bottom edge.
  if (selected) hintPill(ctx, 'SPACE to work', r.x + r.w / 2, r.y + r.h - 11, 11);
}

function drawWokFire(ctx, r) {
  // Warm glow + small flames licking the bottom corners, clear of the slot
  // and of the centred SPACE hint pill.
  const cy = r.y + r.h - 6;
  const g = ctx.createRadialGradient(r.x + r.w / 2, cy, 4, r.x + r.w / 2, cy, 52);
  g.addColorStop(0, 'rgba(255,140,40,0.4)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y + r.h - 40, r.w, 40);
  ctx.fillStyle = '#ff7b2f';
  for (const fx of [r.x + 20, r.x + r.w - 20]) {
    ctx.beginPath();
    ctx.moveTo(fx - 9, cy + 4);
    ctx.quadraticCurveTo(fx, cy - 18, fx + 9, cy + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffd166';
  for (const fx of [r.x + 20, r.x + r.w - 20]) {
    ctx.beginPath();
    ctx.moveTo(fx - 5, cy + 4);
    ctx.quadraticCurveTo(fx, cy - 8, fx + 5, cy + 4);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSteamPuffs(ctx, r, state) {
  const t = (state.nightTime || 0) * 1.4;
  const cx = r.x + 26;
  const cy = r.y + r.h - 8;
  // Steamer basket in the bottom-left corner.
  ctx.fillStyle = '#b08954';
  rr(ctx, cx - 18, cy - 14, 36, 14, 5);
  ctx.fill();
  ctx.strokeStyle = '#7a5a2e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Rising steam.
  for (let i = 0; i < 3; i++) {
    const ph = (t + i * 0.8) % 2;
    const alpha = 0.45 * (1 - ph / 2);
    const x = cx + Math.sin(t * 1.3 + i * 1.9) * 6;
    const y = cy - 18 - ph * 16;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, 5 + ph * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e8f4ff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlate(ctx, state) {
  const r = stationRect('plate');
  const selected = state.selected === 'plate';
  rr(ctx, r.x, r.y, r.w, r.h, 14);
  const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  grad.addColorStop(0, selected ? '#5b3a1e' : '#4a2c17');
  grad.addColorStop(1, '#33200f');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = selected ? 4 : 2;
  ctx.strokeStyle = selected ? '#ffd166' : 'rgba(255,209,102,0.35)';
  ctx.stroke();
  text(ctx, 'PLATE [4]', r.x + r.w / 2, r.y + 16, 17, '#ffe8b3');

  const item = state.plate && state.plate.item;
  const cx = r.x + r.w / 2;
  // Serving plate.
  ctx.beginPath();
  ctx.ellipse(cx, r.y + 84, 58, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f0e1';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (item) {
    drawDishIcon(ctx, item.dishId, cx, r.y + 56, 24);
    text(ctx, dishName(item.dishId), cx, r.y + 36, 13, '#fff3d6');
    hintPill(ctx, 'S / ENTER to serve!', cx, r.y + r.h - 11, 11, '#7bd389');
  } else {
    text(ctx, 'empty', cx, r.y + 62, 14, 'rgba(255,255,255,0.4)');
  }
}

function drawTeapot(ctx, state, world) {
  const r = teapotRect();
  const tea = state.tea || { cooldown: 0 };
  const ready = (tea.cooldown || 0) <= 0;
  const maxCd = (world && typeof world.teaCooldownMax === 'function')
    ? world.teaCooldownMax()
    : (TUNING.teaCooldown || 12);
  rr(ctx, r.x, r.y, r.w, r.h, 14);
  const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  grad.addColorStop(0, ready ? '#1f4d3a' : '#3a3a3a');
  grad.addColorStop(1, '#1c2b24');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ready ? '#7bd389' : 'rgba(255,255,255,0.25)';
  ctx.stroke();
  text(ctx, 'TEA [T]', r.x + r.w / 2, r.y + 16, 16, '#d8ffe8');

  const cx = r.x + r.w / 2;
  const cy = r.y + 68;
  // Teapot body.
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 34, 23, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7fb069';
  ctx.fill();
  ctx.strokeStyle = '#4a7a3a';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Spout + handle + lid.
  ctx.beginPath();
  ctx.moveTo(cx + 28, cy - 2);
  ctx.quadraticCurveTo(cx + 48, cy - 10, cx + 44, cy - 22);
  ctx.quadraticCurveTo(cx + 34, cy - 14, cx + 27, cy - 10);
  ctx.closePath();
  ctx.fillStyle = '#7fb069';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - 34, cy + 4, 11, Math.PI * 0.5, Math.PI * 1.5);
  ctx.strokeStyle = '#4a7a3a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy - 15, 15, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5d8a4a';
  ctx.fill();
  // Steam when ready.
  if (ready) {
    const t = (state.nightTime || 0) * 1.6;
    for (let i = 0; i < 3; i++) {
      const ph = (t + i * 0.8) % 2;
      ctx.globalAlpha = 0.45 * (1 - ph / 2);
      ctx.beginPath();
      ctx.arc(cx + Math.sin(t + i * 2) * 5, cy - 26 - ph * 12, 4 + ph * 2, 0, Math.PI * 2);
      ctx.fillStyle = '#e8f4ff';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    text(ctx, 'soothe all +25%', cx, r.y + r.h - 12, 11, '#b8f0c8');
  } else {
    const cd = Math.ceil(tea.cooldown || 0);
    progressBar(ctx, r.x + 14, r.y + r.h - 26, r.w - 28, 10,
      1 - (tea.cooldown || 0) / maxCd, '#7bd389');
    text(ctx, `brewing… ${cd}s`, cx, r.y + r.h - 38, 12, '#e8e8e8');
  }
}

function drawTrash(ctx) {
  const r = trashRect();
  // Bin body.
  ctx.beginPath();
  ctx.moveTo(r.x + 12, r.y + 22);
  ctx.lineTo(r.x + r.w - 12, r.y + 22);
  ctx.lineTo(r.x + r.w - 20, r.y + r.h - 26);
  ctx.lineTo(r.x + 20, r.y + r.h - 26);
  ctx.closePath();
  ctx.fillStyle = '#3d3d4d';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#55556a';
  ctx.fillRect(r.x + 6, r.y + 14, r.w - 12, 8);
  text(ctx, '✕', r.x + r.w / 2, r.y + 52, 22, '#ff9f9f');
  text(ctx, 'TRASH [X]', r.x + r.w / 2, r.y + r.h - 12, 11, '#c9c9d8');
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function drawHUD(ctx, state) {
  // Top bar (84 tall: two rows — night/coins/timer/hearts on top, coins row
  // and combo below, matching LAYOUT.hud anchors).
  ctx.fillStyle = 'rgba(12, 8, 26, 0.85)';
  ctx.fillRect(0, 0, 1280, 84);
  ctx.fillStyle = 'rgba(255,209,102,0.25)';
  ctx.fillRect(0, 84, 1280, 2);

  const nightA = hudAnchor('night', { x: 24, y: 30 });
  text(ctx, `NIGHT ${(state.night || 0) + 1} / 7`, nightA.x, nightA.y, 22, '#ffd166', 'left');
  const coinsA = hudAnchor('coins', { x: 24, y: 62 });
  coinIcon(ctx, coinsA.x + 12, coinsA.y, 11);
  text(ctx, `${state.coins || 0}`, coinsA.x + 30, coinsA.y, 20, '#ffe8b3', 'left');
  text(ctx, `/ target ${state.target || 0}`, coinsA.x + 92, coinsA.y, 15, '#c9b48a', 'left');

  // Night timer bar (remaining time) from LAYOUT.hud.timer.
  const timerA = hudAnchor('timer', { x: 440, y: 24, w: 400, h: 18 });
  const remain = Math.max(0, (state.nightLength || 0) - (state.nightTime || 0));
  const frac = state.nightLength ? remain / state.nightLength : 0;
  progressBar(ctx, timerA.x, timerA.y, timerA.w, timerA.h, frac,
    frac > 0.25 ? '#4cc9f0' : '#ff6b6b', 'rgba(0,0,0,0.5)');
  text(ctx, `${Math.ceil(remain)}s left`, timerA.x + timerA.w + 10, timerA.y + timerA.h / 2,
    14, '#e8e8e8', 'left');

  // Hearts from LAYOUT.hud.hearts.
  const heartsA = hudAnchor('hearts', { x: 1080, y: 30 });
  for (let i = 0; i < 5; i++) {
    heartIcon(ctx, heartsA.x + i * 30, heartsA.y, 22, i < (state.hearts || 0));
  }
  // Combo from LAYOUT.hud.combo.
  const comboA = hudAnchor('combo', { x: 1080, y: 62 });
  if ((state.combo || 0) > 1) {
    const step = (TUNING.comboStep != null ? TUNING.comboStep : 0.1);
    const cap = (TUNING.comboCap != null ? TUNING.comboCap : 2.0);
    const mult = Math.min(1 + (state.combo - 1) * step, cap).toFixed(1);
    text(ctx, `COMBO x${state.combo}  (x${mult} coins)`, comboA.x + 90, comboA.y, 18, '#ff9f1c');
  } else if ((state.combo || 0) === 1) {
    text(ctx, 'COMBO x1', comboA.x + 90, comboA.y, 16, '#c9b48a');
  }
}

function drawMessage(ctx, state) {
  const msg = state.message;
  if (!msg || !msg.text) return;
  // message.t counts DOWN from its duration; fade in the last 0.6s.
  const t = msg.t || 0;
  if (t <= 0) return;
  const alpha = t < 0.6 ? Math.max(0, t / 0.6) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const isPerfect = /PERFECT/i.test(msg.text);
  const size = isPerfect ? 44 : 26;
  const y = isPerfect ? 400 : 412;
  textShadow(ctx, msg.text, 640, y, size, isPerfect ? '#ffd166' : '#ffffff');
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function dimOverlay(ctx, alpha = 0.72) {
  ctx.fillStyle = `rgba(10, 6, 24, ${alpha})`;
  ctx.fillRect(0, 0, 1280, 720);
}

function panel(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = 'rgba(24, 14, 44, 0.94)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffd166';
  ctx.stroke();
}

function drawButton(ctx, rect, label, enabled = true) {
  rr(ctx, rect.x, rect.y, rect.w, rect.h, 12);
  ctx.fillStyle = enabled ? '#ff7b2f' : '#555';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = enabled ? '#ffd166' : '#888';
  ctx.stroke();
  text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 22, '#ffffff');
}

function drawTitle(ctx, state) {
  drawBackground(ctx);
  // Big fire glow behind the title.
  const cx = 640;
  ctx.save();
  const g = ctx.createRadialGradient(cx, 300, 10, cx, 300, 220);
  g.addColorStop(0, 'rgba(255,140,40,0.35)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, 300, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  textShadow(ctx, 'EMBERWOK', cx, 150, 96, '#ffb347');
  textShadow(ctx, 'a night-market wok stall', cx, 222, 26, '#ffd166');
  text(ctx, 'Cook every order through CHOP → WOK → STEAM.', cx, 292, 22, '#ffffff');
  text(ctx, 'Serve before patience runs out. 7 nights. 1 food critic.', cx, 324, 22, '#ffffff');

  panel(ctx, 340, 368, 600, 132);
  text(ctx, 'HOW TO PLAY', 640, 392, 20, '#ffd166');
  text(ctx, 'Click a ticket to start a dish · SPACE works the station', 640, 422, 18, '#ffffff');
  text(ctx, 'S / ENTER serves the plate · T pours tea · X tosses burnt food', 640, 450, 18, '#ffffff');
  text(ctx, '1–4 pick a station · P pauses · R restarts the night · M mutes', 640, 478, 18, '#ffffff');

  // Start button (the world's title click target) — pulses gently.
  const startBtn = buttonRect('start');
  ctx.save();
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(frame * 0.06);
  drawButton(ctx, startBtn, 'Press ENTER to start');
  ctx.restore();
  text(ctx, 'Best with sound on — all music is synthesized live.', cx, 640, 15, '#8f86b8');
}

function drawPaused(ctx, state) {
  drawPlayScene(ctx, state);
  dimOverlay(ctx, 0.68);
  panel(ctx, 390, 170, 500, 330);
  text(ctx, 'PAUSED', 640, 220, 48, '#ffd166');
  text(ctx, 'Take a breath, chef.', 640, 272, 20, '#ffffff');
  text(ctx, 'SPACE work · S serve · T tea · X toss burnt', 640, 320, 18, '#e8e8e8');
  text(ctx, '1–4 pick a station · R restart night · M mute', 640, 350, 18, '#e8e8e8');
  drawButton(ctx, buttonRect('resume'), 'RESUME (P)');
  text(ctx, 'P or ENTER to resume', 640, 612, 16, '#8f86b8');
}

function drawNightDone(ctx, state) {
  drawBackground(ctx);
  dimOverlay(ctx, 0.45);
  textShadow(ctx, `NIGHT ${(state.night || 0) + 1} COMPLETE!`, 640, 66, 48, '#ffd166');
  const nightEarned = state.nightEarned || 0;
  const served = state.nightServed || 0;
  const tips = state.nightTips || 0;
  text(ctx, `Earned ${nightEarned} coins · ${served} dishes served · ${tips} coins in tips`, 640, 118, 22, '#ffffff');
  text(ctx, `Balance: ${state.coins || 0} coins · Hearts: ${state.hearts || 0}`, 640, 150, 20, '#ffe8b3');

  // Shop: 3 upgrade cards.
  text(ctx, '— UPGRADE SHOP —  pick one, or skip —', 640, 186, 22, '#7bd389');
  const offered = (state.shop && state.shop.offered) || [];
  const bought = state.shop && state.shop.bought;
  for (let i = 0; i < 3; i++) {
    const r = shopCardRect(i);
    const up = upgradeOf(offered[i]);
    const isBought = bought && offered[i] && bought === offered[i];
    const afford = (state.coins || 0) >= (up.cost || 0);
    rr(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = isBought ? 'rgba(123,211,137,0.25)' : 'rgba(30,20,52,0.95)';
    ctx.fill();
    ctx.lineWidth = isBought ? 4 : 2;
    ctx.strokeStyle = isBought ? '#7bd389' : afford ? '#ffd166' : 'rgba(255,255,255,0.25)';
    ctx.stroke();
    if (up) {
      text(ctx, up.name || `Upgrade ${i + 1}`, r.x + r.w / 2, r.y + 38, 22, '#ffffff');
      text(ctx, up.desc || '', r.x + r.w / 2, r.y + 86, 16, '#d8c9a8');
      coinIcon(ctx, r.x + r.w / 2 - 34, r.y + 132, 11);
      text(ctx, `${up.cost || 0}`, r.x + r.w / 2 - 14, r.y + 133, 20, afford ? '#ffd166' : '#ff6b6b', 'left');
      if (isBought) {
        text(ctx, '✓ BOUGHT', r.x + r.w / 2, r.y + 178, 20, '#7bd389');
      } else if (!afford) {
        text(ctx, 'not enough coins', r.x + r.w / 2, r.y + 178, 16, '#ff9f9f');
      } else {
        text(ctx, 'click the card to buy', r.x + r.w / 2, r.y + 178, 15, '#8f86b8');
      }
    }
  }

  drawButton(ctx, buttonRect('nextNight'), 'NEXT NIGHT');
  drawButton(ctx, buttonRect('skipShop'), 'SKIP SHOP');
}

function drawGameOver(ctx, state) {
  drawBackground(ctx);
  dimOverlay(ctx, 0.66);
  textShadow(ctx, 'GAME OVER', 640, 220, 84, '#ff6b6b');
  text(ctx, 'The stall went dark — no hearts left.', 640, 300, 24, '#ffffff');
  const cleared = (state.stats && state.stats.nightsCleared != null)
    ? state.stats.nightsCleared : (state.night || 0);
  text(ctx, `You cleared ${cleared} night(s) · earned ${state.totalEarned || 0} coins · served ${state.served || 0} dishes`, 640, 344, 20, '#ffe8b3');
  drawButton(ctx, buttonRect('tryAgain'), 'TRY AGAIN (R)');
  text(ctx, 'Press R to restart from night 1', 640, 620, 18, '#8f86b8');
}

function drawResults(ctx, state) {
  drawBackground(ctx);
  dimOverlay(ctx, 0.45);
  textShadow(ctx, '7 NIGHTS — YOU DID IT!', 640, 92, 48, '#ffd166');
  text(ctx, 'The food critic loved it. Emberwok is the talk of the market!', 640, 148, 22, '#ffffff');

  const stats = state.stats || {};
  const rows = [
    ['Total earned', `${state.totalEarned || 0} coins`],
    ['Dishes served', `${state.served || 0}`],
    ['Best combo', `x${state.bestCombo || 0}`],
    ['Perfect serves', `${state.perfectServes || 0}`],
    ['Walkaways', `${state.walkaways || 0}`],
    ['Burnt dishes', `${state.burntCount || 0}`],
    ['Nights cleared', `${stats.nightsCleared != null ? stats.nightsCleared : 7} / 7`],
  ];
  panel(ctx, 390, 186, 500, 330);
  let y = 228;
  for (const [label, value] of rows) {
    text(ctx, label, 430, y, 22, '#d8c9a8', 'left');
    text(ctx, value, 850, y, 22, '#ffffff', 'right');
    y += 42;
  }
  drawButton(ctx, buttonRect('playAgain'), 'PLAY AGAIN (R)');
  text(ctx, 'Press R to run the stall again', 640, 620, 18, '#8f86b8');
}

// ---------------------------------------------------------------------------
// Play scene (shared by PLAY and PAUSED)
// ---------------------------------------------------------------------------

function drawPlayScene(ctx, state, world) {
  drawBackground(ctx);
  drawCustomers(ctx, state);
  // Serving counter: a wooden band between the seats and the stations.
  ctx.fillStyle = '#2c1a10';
  ctx.fillRect(0, 438, 1280, 18);
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(0, 438, 1280, 7);
  drawStation(ctx, state, 'chop');
  drawStation(ctx, state, 'wok');
  drawStation(ctx, state, 'steam');
  drawPlate(ctx, state);
  drawTeapot(ctx, state, world);
  drawTrash(ctx);
  drawHUD(ctx, state);
  drawMessage(ctx, state);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function drawWorld(ctx, world) {
  const state = (world && world.state) || {};
  const screen = state.screen || SCREEN_TITLE;
  frame += 1;
  ctx.save();
  // Clear.
  ctx.fillStyle = '#171233';
  ctx.fillRect(0, 0, 1280, 720);
  if (screen === SCREEN_TITLE) {
    drawTitle(ctx, state);
  } else if (screen === SCREEN_PLAY) {
    drawPlayScene(ctx, state, world);
  } else if (screen === SCREEN_PAUSED) {
    drawPaused(ctx, state);
  } else if (screen === SCREEN_NIGHT_DONE) {
    drawNightDone(ctx, state);
  } else if (screen === SCREEN_GAME_OVER) {
    drawGameOver(ctx, state);
  } else if (screen === SCREEN_RESULTS) {
    drawResults(ctx, state);
  } else {
    drawPlayScene(ctx, state, world);
  }
  ctx.restore();
}
