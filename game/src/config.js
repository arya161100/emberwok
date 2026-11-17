// EMBERWOK — config.js
// Single source of truth for every number the game runs on.
// Builder A owns this file. Render and world both import from here so the
// numbers on screen and the numbers in the simulation can never drift apart.

export const STEP = 1 / 60;

// ---------------------------------------------------------------- dishes
// chain: the stations a dish must pass through, in order.
// fromNight: first night (1-based) the dish may be ordered.
// price: base coins paid on serve, before tip / combo / VIP multipliers.
export const DISHES = [
  {
    id: 'moon-noodles',
    name: 'Moon Noodles',
    price: 8,
    chain: ['chop', 'wok'],
    fromNight: 1,
    color: '#f2c14e',
    blurb: 'silky noodles, ember oil',
  },
  {
    id: 'cloud-dumplings',
    name: 'Cloud Dumplings',
    price: 10,
    chain: ['chop', 'steam'],
    fromNight: 1,
    color: '#e8f0ff',
    blurb: 'steamed clouds, ginger dip',
  },
  {
    id: 'ember-skewers',
    name: 'Ember Skewers',
    price: 12,
    chain: ['wok', 'steam'],
    fromNight: 2,
    color: '#ff7a3c',
    blurb: 'charred skewers, smoke glaze',
  },
  {
    id: 'golden-cinder-buns',
    name: 'Golden Cinder Buns',
    price: 14,
    chain: ['steam', 'wok'],
    fromNight: 4,
    color: '#ffd23f',
    blurb: 'golden buns, crackling crust',
  },
  {
    id: 'starfruit-tea-cake',
    name: 'Starfruit Tea Cake',
    price: 18,
    chain: ['chop', 'steam', 'wok'],
    fromNight: 6,
    color: '#b7f26d',
    blurb: 'the critic\'s favourite',
  },
];

export function dishById(id) {
  return DISHES.find((d) => d.id === id) || null;
}

export function dishesForNight(nightIndex) {
  const night = NIGHTS[nightIndex];
  if (!night) return [];
  return night.pool.map((id) => dishById(id)).filter(Boolean);
}

// Ticket rect for a seat index, derived from the seat position so tickets
// and seats can never disagree. Kept outside LAYOUT (no `this` binding).
export function ticketRectForSeat(seatIndex) {
  const s = LAYOUT.seats[seatIndex];
  return { x: s.x - 75, y: 150, w: 150, h: 90 };
}

// ---------------------------------------------------------------- nights
// customers: how many walk in this night (plus the rush-hour burst of 3,
// plus the night-7 VIP critic, who is extra).
// spawnInterval: seconds between scheduled arrivals.
// patience: max patience in seconds for a normal customer this night.
// target: coins that must be earned this night for the +1 heart / +20 bonus.
// length: night length in seconds; the timer hitting 0 stops new spawns.
// rushAt: seconds into the night when the rush-hour burst arrives.
export const NIGHTS = [
  {
    night: 1,
    customers: 6,
    spawnInterval: 12,
    pool: ['moon-noodles', 'cloud-dumplings'],
    patience: 38,
    target: 60,
    length: 105,
    rushAt: 52,
    vip: false,
  },
  {
    night: 2,
    customers: 8,
    spawnInterval: 11,
    pool: ['moon-noodles', 'cloud-dumplings', 'ember-skewers'],
    patience: 37,
    target: 85,
    length: 110,
    rushAt: 55,
    vip: false,
  },
  {
    night: 3,
    customers: 10,
    spawnInterval: 10,
    pool: ['moon-noodles', 'cloud-dumplings', 'ember-skewers'],
    patience: 36,
    target: 110,
    length: 115,
    rushAt: 57,
    vip: false,
  },
  {
    night: 4,
    customers: 12,
    spawnInterval: 9.5,
    pool: ['moon-noodles', 'cloud-dumplings', 'ember-skewers', 'golden-cinder-buns'],
    patience: 34,
    target: 140,
    length: 120,
    rushAt: 60,
    vip: false,
  },
  {
    night: 5,
    customers: 14,
    spawnInterval: 9,
    pool: ['moon-noodles', 'cloud-dumplings', 'ember-skewers', 'golden-cinder-buns'],
    patience: 33,
    target: 170,
    length: 125,
    rushAt: 62,
    vip: false,
  },
  {
    night: 6,
    customers: 16,
    spawnInterval: 8.5,
    pool: ['moon-noodles', 'cloud-dumplings', 'ember-skewers', 'golden-cinder-buns', 'starfruit-tea-cake'],
    patience: 31,
    target: 200,
    length: 130,
    rushAt: 65,
    vip: false,
  },
  {
    night: 7,
    customers: 18,
    spawnInterval: 7.5, // last spawn at 2 + 17*7.5 = 129.5s, inside the 135s night
    pool: ['moon-noodles', 'cloud-dumplings', 'ember-skewers', 'golden-cinder-buns', 'starfruit-tea-cake'],
    patience: 30,
    target: 240,
    length: 135,
    rushAt: 67,
    vip: true,
  },
];

// ---------------------------------------------------------------- upgrades
// One-time purchases, offered 3 at a time in the night-done shop.
// At most one may be bought per night.
export const UPGRADES = [
  {
    id: 'sharp-cleaver',
    name: 'Sharp Cleaver',
    cost: 30,
    desc: 'Chop 1.5x faster',
    effect: { chopSpeed: 1.5 },
  },
  {
    id: 'second-wok',
    name: 'Second Wok',
    cost: 45,
    desc: 'Wok holds 2 items',
    effect: { wokSlots: 2 },
  },
  {
    id: 'big-steamer',
    name: 'Big Steamer',
    cost: 45,
    desc: 'Steam 1.5x faster, holds 2',
    effect: { steamSpeed: 1.5, steamSlots: 2 },
  },
  {
    id: 'tea-stall',
    name: 'Tea Stall',
    cost: 25,
    desc: 'Tea cooldown 6s, +2 coins per customer soothed',
    effect: { teaCooldown: 6, teaCoins: 2 },
  },
  {
    id: 'extra-seat',
    name: 'Extra Seat',
    cost: 50,
    desc: 'A 5th seat for customers',
    effect: { seats: 5 },
  },
  {
    id: 'comfy-stools',
    name: 'Comfy Stools',
    cost: 35,
    desc: 'Patience +20% for everyone',
    effect: { patienceMult: 1.2 },
  },
];

export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}

// ---------------------------------------------------------------- stations
// workSeconds: how long one act-chunk grind takes at a station (before the
// Sharp Cleaver / Big Steamer speed-ups). burnWindow: extra seconds past
// `need` a WOK/STEAM item may sit before it burns. CHOP never burns.
export const STATIONS = {
  chop: { label: 'CHOP', workSeconds: 2.2, burnWindow: 0, color: '#7ec8e3' },
  wok: { label: 'WOK', workSeconds: 3.0, burnWindow: 1.2, color: '#ff7a3c' },
  steam: { label: 'STEAM', workSeconds: 3.5, burnWindow: 1.5, color: '#b7f26d' },
  plate: { label: 'PLATE', workSeconds: 0, burnWindow: 0, color: '#f2c14e' },
};

// ---------------------------------------------------------------- tuning
export const TUNING = {
  actChunk: 0.35, // seconds of progress added by one act (Space / click)
  teaCooldown: 12, // seconds between tea pours (6 with Tea Stall)
  teaPatienceBoost: 0.25, // +25% of max patience to every waiting customer
  comboWindow: 8, // seconds between serves to keep the combo alive
  comboStep: 0.1, // +0.1x per chained serve
  comboCap: 2.0, // combo multiplier caps at x2.0
  tipMax: 0.5, // tip up to +50% of dish price, scaled by patience left
  vipTipMult: 3, // the food critic tips x3
  perfectThreshold: 0.7, // patience >= 70% at serve time = PERFECT
  perfectBonus: 3, // flat bonus coins on a perfect serve
  heartsStart: 3,
  heartsMax: 5,
  targetBonusCoins: 20, // +20 coins when the night target is met
  vipPatience: 22, // the critic is impatient
  rushBurst: 3, // customers arriving at once during rush hour
  seatCount: 4, // seats before the Extra Seat upgrade
  maxSeats: 5,
};

// ---------------------------------------------------------------- layout
// Logical canvas is 1280x720. Render AND world import LAYOUT for hit tests,
// so a click the eye sees is a click the simulation feels.
export const LAYOUT = {
  canvas: { w: 1280, h: 720 },
  // Stations sit along the counter at the bottom of the screen.
  stations: {
    chop: { x: 60, y: 470, w: 180, h: 130 },
    wok: { x: 270, y: 470, w: 180, h: 130 },
    steam: { x: 480, y: 470, w: 180, h: 130 },
    plate: { x: 690, y: 470, w: 180, h: 130 },
  },
  // The teapot lives at the right end of the counter.
  teapot: { x: 900, y: 470, w: 120, h: 130 },
  // Trash bin for burnt items, beside the teapot.
  trash: { x: 1050, y: 500, w: 90, h: 100 },
  // Customer seats in a row across the upper half; seat 5 (index 4) is
  // unlocked by the Extra Seat upgrade.
  seats: [
    { x: 130, y: 300 },
    { x: 360, y: 300 },
    { x: 590, y: 300 },
    { x: 820, y: 300 },
    { x: 1050, y: 300 },
  ],
  // Order tickets float above each seat; clicking one starts that dish.
  // Use ticketRectForSeat(seatIndex) to get a ticket rect — it is derived
  // from LAYOUT.seats so tickets and seats can never disagree.
  // Shop cards on the NIGHT_DONE screen: three in a row.
  shopCards: [
    { x: 110, y: 210, w: 330, h: 240 },
    { x: 475, y: 210, w: 330, h: 240 },
    { x: 840, y: 210, w: 330, h: 240 },
  ],
  // Buttons (labelled exactly as SPEC requires).
  buttons: {
    start: { x: 490, y: 520, w: 300, h: 64, label: 'Press ENTER to start' },
    nextNight: { x: 490, y: 560, w: 300, h: 64, label: 'NEXT NIGHT' },
    skipShop: { x: 490, y: 640, w: 300, h: 48, label: 'SKIP SHOP' },
    tryAgain: { x: 490, y: 520, w: 300, h: 64, label: 'TRY AGAIN (R)' },
    playAgain: { x: 490, y: 520, w: 300, h: 64, label: 'PLAY AGAIN (R)' },
    resume: { x: 490, y: 520, w: 300, h: 64, label: 'RESUME (P)' },
  },
  // HUD anchor points (render reads these; world does not need them).
  hud: {
    night: { x: 24, y: 30 },
    coins: { x: 24, y: 62 },
    hearts: { x: 1080, y: 30 },
    timer: { x: 440, y: 24, w: 400, h: 18 },
    combo: { x: 1080, y: 62 },
    tea: { x: 900, y: 620 },
  },
};
