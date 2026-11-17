// EMBERWOK — world.js
// The whole game simulation: screens, nights, customers, stations, serving,
// tea, combos, upgrades, hearts. Pure logic — no canvas, no audio, no DOM.
// Deterministic: the only randomness comes from the seeded RNG. Given the
// same seed and the same input sequence, step() replays the exact same game.
// Render only ever reads world.state; it never mutates it.

import { NIGHTS, UPGRADES, STATIONS, TUNING, LAYOUT, dishById, upgradeById, ticketRectForSeat } from './config.js';
import { RNG } from './random.js';

// ---------------------------------------------------------------- screens
export const SCREEN_TITLE = 'TITLE';
export const SCREEN_PLAY = 'PLAY';
export const SCREEN_PAUSED = 'PAUSED';
export const SCREEN_NIGHT_DONE = 'NIGHT_DONE';
export const SCREEN_GAME_OVER = 'GAME_OVER';
export const SCREEN_RESULTS = 'RESULTS';

// ------------------------------------------------------- events (for audio)
export const EVENTS = {
  SERVE: 'serve',
  PERFECT: 'perfect',
  WALKAWAY: 'walkaway',
  BURNT: 'burnt',
  RUSH: 'rush',
  VIP: 'vip',
  TARGET: 'target',
  NIGHT_DONE: 'nightDone',
  GAME_OVER: 'gameOver',
  COIN: 'coin',
  CLICK: 'click',
  TEA: 'tea',
  CHOP: 'chop',
  SIZZLE: 'sizzle',
};

// Station names, in the order keys 1-4 select them.
export const STATION_ORDER = ['chop', 'wok', 'steam', 'plate'];

function pointInRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class EmberWokWorld {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this._customerId = 0;
    this._comboTimer = 0; // seconds since the last serve
    this._holdAcc = 0; // auto-repeat accumulator while act is held
    this._nightSnapshot = null; // coins/hearts/etc at night start (restart)
    this._spawnedRegular = 0;
    this._rushSpawned = 0; // of TUNING.rushBurst; rush is done at 3
    this._rushDone = false;
    this._vipDone = false;
    this._nextSpawnAt = 2;
    this._spawnRetryAt = 0;
    this._vipRetryAt = 0;
    this.state = this._freshState();
  }

  // ------------------------------------------------------------ state init
  _freshState() {
    return {
      screen: SCREEN_TITLE,
      night: 0, // 0-based; night 1 is index 0
      nightTime: 0,
      nightLength: NIGHTS[0].length,
      coins: 0, // spendable balance
      totalEarned: 0, // all coins ever earned (results screen)
      target: NIGHTS[0].target,
      hearts: TUNING.heartsStart,
      combo: 0, // chained serves (1 = single serve, no bonus yet)
      bestCombo: 0,
      served: 0,
      walkaways: 0,
      burntCount: 0,
      perfectServes: 0,
      customers: [],
      stations: this._emptyStations([]),
      plate: { item: null },
      tea: { cooldown: 0 },
      selected: 'chop',
      shop: { offered: [], bought: null, closed: false },
      message: { text: '', t: 0 },
      event: null, // last event this step, for audio (cleared each step)
      muted: false,
      upgrades: [], // owned upgrade ids
      nightEarned: 0, // coins earned this night (night-done screen)
      nightServed: 0,
      nightTips: 0,
      stats: {
        nightsCleared: 0,
        totalTips: 0,
        dishesCooked: 0,
        teasPoured: 0,
        upgradesBought: 0,
      },
    };
  }

  // owned: upgrade ids to size the station slots from. Defaults to the
  // state's upgrades — but _freshState() passes [] explicitly, because
  // this.state does not exist yet while the constructor builds it.
  _emptyStations(owned) {
    const has = (id) => (owned || this.state.upgrades).indexOf(id) !== -1;
    return {
      chop: { slots: [null] },
      wok: { slots: new Array(has('second-wok') ? 2 : 1).fill(null) },
      steam: { slots: new Array(has('big-steamer') ? 2 : 1).fill(null) },
    };
  }

  // ------------------------------------------------------- upgrade helpers
  hasUpgrade(id) {
    return this.state.upgrades.indexOf(id) !== -1;
  }

  wokSlots() {
    return this.hasUpgrade('second-wok') ? 2 : 1;
  }

  steamSlots() {
    return this.hasUpgrade('big-steamer') ? 2 : 1;
  }

  seatCount() {
    return this.hasUpgrade('extra-seat') ? TUNING.maxSeats : TUNING.seatCount;
  }

  chopSpeed() {
    return this.hasUpgrade('sharp-cleaver') ? 1.5 : 1;
  }

  steamSpeed() {
    return this.hasUpgrade('big-steamer') ? 1.5 : 1;
  }

  patienceMult() {
    return this.hasUpgrade('comfy-stools') ? 1.2 : 1;
  }

  teaCooldownMax() {
    return this.hasUpgrade('tea-stall') ? 6 : TUNING.teaCooldown;
  }

  comboMult() {
    if (this.state.combo <= 1) return 1;
    return Math.min(1 + (this.state.combo - 1) * TUNING.comboStep, TUNING.comboCap);
  }

  // Seconds of work one step of a dish needs at a station, after upgrades.
  workNeed(station) {
    const base = STATIONS[station].workSeconds;
    if (station === 'chop') return base / this.chopSpeed();
    if (station === 'steam') return base / this.steamSpeed();
    return base;
  }

  // ------------------------------------------------------------- messaging
  setMessage(text, dur = 2.5) {
    this.state.message = { text, t: dur };
  }

  setEvent(name) {
    this.state.event = name;
  }

  // ------------------------------------------------------------ game flow
  startGame() {
    this.rng = new RNG(this.seed);
    this._customerId = 0;
    const muted = this.state.muted;
    this.state = this._freshState();
    this.state.muted = muted;
    this.startNight(0);
  }

  startNight(n) {
    const s = this.state;
    const nightDef = NIGHTS[n];
    s.night = n;
    s.nightTime = 0;
    s.nightLength = nightDef.length;
    s.target = nightDef.target;
    s.customers = [];
    s.stations = this._emptyStations();
    s.plate = { item: null };
    s.tea = { cooldown: 0 };
    s.selected = 'chop';
    s.combo = 0;
    s.nightEarned = 0;
    s.nightServed = 0;
    s.nightTips = 0;
    s.shop = { offered: this._rollShop(), bought: null, closed: false };
    s.message = { text: '', t: 0 };
    s.screen = SCREEN_PLAY;
    // Spawn bookkeeping.
    this._spawnedRegular = 0;
    this._rushSpawned = 0;
    this._rushDone = false;
    this._vipDone = !nightDef.vip;
    this._nextSpawnAt = 2;
    this._spawnRetryAt = 0;
    this._vipRetryAt = 0;
    this._comboTimer = 0;
    this._holdAcc = 0;
    // Snapshot for restartNight(): a restart rewinds to this moment.
    this._nightSnapshot = {
      coins: s.coins,
      totalEarned: s.totalEarned,
      hearts: s.hearts,
      served: s.served,
      perfectServes: s.perfectServes,
      walkaways: s.walkaways,
      burntCount: s.burntCount,
      bestCombo: s.bestCombo,
      nightTips: s.stats.totalTips,
    };
    if (n > 0) this.setMessage(`Night ${n + 1} — target ${nightDef.target} coins!`, 3);
  }

  restartNight() {
    const snap = this._nightSnapshot;
    if (!snap) return;
    const s = this.state;
    s.coins = snap.coins;
    s.totalEarned = snap.totalEarned;
    s.hearts = snap.hearts;
    s.served = snap.served;
    s.perfectServes = snap.perfectServes;
    s.walkaways = snap.walkaways;
    s.burntCount = snap.burntCount;
    s.bestCombo = snap.bestCombo;
    s.stats.totalTips = snap.nightTips;
    this.startNight(s.night);
    this.setMessage('Night restarted', 2);
  }

  toResults() {
    this.state.screen = SCREEN_RESULTS;
    this.setEvent(EVENTS.NIGHT_DONE);
  }

  nextNight() {
    const s = this.state;
    if (s.screen !== SCREEN_NIGHT_DONE) return;
    if (s.night >= NIGHTS.length - 1) {
      this.toResults();
      return;
    }
    this.startNight(s.night + 1);
  }

  // Roll 3 distinct upgrades the player does not own yet (fewer if the
  // pool runs out late in the game).
  _rollShop() {
    const owned = this.state.upgrades;
    const pool = UPGRADES.filter((u) => owned.indexOf(u.id) === -1);
    const shuffled = this.rng.shuffle(pool);
    return shuffled.slice(0, 3).map((u) => u.id);
  }

  // --------------------------------------------------------------- spawning
  _freeSeat() {
    const taken = new Set();
    for (const c of this.state.customers) {
      if (c.state === 'waiting') taken.add(c.seat);
    }
    for (let i = 0; i < this.seatCount(); i += 1) {
      if (!taken.has(i)) return i;
    }
    return -1;
  }

  _spawnCustomer(dishId, vip) {
    const s = this.state;
    const nightDef = NIGHTS[s.night];
    const seat = this._freeSeat();
    if (seat === -1) return false; // no seat: caller retries later
    const maxPatience = vip
      ? TUNING.vipPatience
      : nightDef.patience * this.patienceMult();
    this._customerId += 1;
    s.customers.push({
      id: this._customerId,
      seat,
      dishId,
      patience: maxPatience,
      maxPatience,
      state: 'waiting',
      vip: !!vip,
      arrivedAt: s.nightTime,
      cooking: false,
    });
    return true;
  }

  _spawnRegular() {
    const nightDef = NIGHTS[this.state.night];
    const dishId = this.rng.pick(nightDef.pool);
    if (this._spawnCustomer(dishId, false)) this._spawnedRegular += 1;
  }

  _allSpawned() {
    const nightDef = NIGHTS[this.state.night];
    return (
      this._spawnedRegular >= nightDef.customers &&
      this._rushDone &&
      this._vipDone
    );
  }

  // ------------------------------------------------------------- dish flow
  // The item currently cooking for a customer, if any.
  _itemForCustomer(customerId) {
    for (const name of ['chop', 'wok', 'steam']) {
      for (const item of this.state.stations[name].slots) {
        if (item && item.customerId === customerId) return item;
      }
    }
    if (this.state.plate.item && this.state.plate.item.customerId === customerId) {
      return this.state.plate.item;
    }
    return null;
  }

  _freeSlotIndex(station) {
    const slots = this.state.stations[station].slots;
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i] === null) return i;
    }
    return -1;
  }

  startOrder(customerId) {
    const s = this.state;
    if (s.screen !== SCREEN_PLAY) return;
    const customer = s.customers.find((c) => c.id === customerId);
    if (!customer || customer.state !== 'waiting') return;
    if (customer.cooking || this._itemForCustomer(customerId)) {
      this.setMessage('Already cooking that dish!', 1.5);
      return;
    }
    const dish = dishById(customer.dishId);
    if (!dish) return;
    const firstStation = dish.chain[0];
    const slot = this._freeSlotIndex(firstStation);
    if (slot === -1) {
      this.setMessage(`${STATIONS[firstStation].label} is busy!`, 1.5);
      this.setEvent(EVENTS.CLICK);
      return;
    }
    const item = {
      dishId: dish.id,
      customerId,
      stepIndex: 0,
      progress: 0,
      need: this.workNeed(firstStation),
      waitTime: 0,
      burnt: false,
    };
    s.stations[firstStation].slots[slot] = item;
    customer.cooking = true;
    this.setEvent(EVENTS.CLICK);
  }

  // Move a finished item onward: next station if a slot is free, the plate
  // if it was the last step, otherwise it waits where it is.
  _tryAdvance(stationName, slotIndex) {
    const s = this.state;
    let item = s.stations[stationName].slots[slotIndex];
    if (!item || item.burnt || item.progress < item.need) return;
    const dish = dishById(item.dishId);
    if (!dish) return;
    if (item.stepIndex + 1 < dish.chain.length) {
      const nextStation = dish.chain[item.stepIndex + 1];
      const slot = this._freeSlotIndex(nextStation);
      if (slot === -1) return; // waits here until a slot frees
      s.stations[stationName].slots[slotIndex] = null;
      item.stepIndex += 1;
      item.progress = 0;
      item.need = this.workNeed(nextStation);
      item.waitTime = 0;
      s.stations[nextStation].slots[slot] = item;
    } else if (s.plate.item === null) {
      s.stations[stationName].slots[slotIndex] = null;
      s.plate.item = item;
      item.waitTime = 0;
    }
    // Else the plate is full: the dish waits at this station.
  }

  _tryAdvanceAll() {
    for (const name of ['chop', 'wok', 'steam']) {
      const slots = this.state.stations[name].slots;
      for (let i = 0; i < slots.length; i += 1) this._tryAdvance(name, i);
    }
  }

  selectStation(name) {
    if (STATION_ORDER.indexOf(name) === -1) return;
    this.state.selected = name;
    this.setEvent(EVENTS.CLICK);
  }

  workSelected() {
    const s = this.state;
    if (s.screen !== SCREEN_PLAY) return;
    const name = s.selected;
    if (name === 'plate') return; // the plate is served, not worked
    const station = s.stations[name];
    // Work the most urgent item in the station: the one closest to done,
    // so a tap never wastes progress on a fresh item while another waits.
    let best = -1;
    let bestLeft = Infinity;
    for (let i = 0; i < station.slots.length; i += 1) {
      const item = station.slots[i];
      if (!item || item.burnt) continue;
      const left = item.need - item.progress;
      if (left < bestLeft) {
        bestLeft = left;
        best = i;
      }
    }
    if (best === -1) {
      const hasBurnt = station.slots.some((it) => it && it.burnt);
      this.setMessage(
        hasBurnt ? 'Burnt! Press X to toss it.' : 'Nothing to work here.',
        1.2,
      );
      return;
    }
    const item = station.slots[best];
    if (item.progress >= item.need) {
      // Already done: try to move it on instead of overworking it.
      this._tryAdvance(name, best);
      return;
    }
    item.progress = Math.min(item.need, item.progress + TUNING.actChunk);
    this.setEvent(name === 'chop' ? EVENTS.CHOP : EVENTS.SIZZLE);
    if (item.progress >= item.need) this._tryAdvance(name, best);
  }

  servePlate() {
    const s = this.state;
    if (s.screen !== SCREEN_PLAY) return;
    const item = s.plate.item;
    if (!item) {
      this.setMessage('The plate is empty.', 1.2);
      return;
    }
    // Oldest waiting customer whose dish matches (lowest arrivedAt).
    let target = null;
    for (const c of s.customers) {
      if (c.state === 'waiting' && c.dishId === item.dishId) {
        if (!target || c.arrivedAt < target.arrivedAt) target = c;
      }
    }
    if (!target) {
      this.setMessage('Nobody ordered this — press X to toss it.', 2);
      return;
    }
    const dish = dishById(item.dishId);
    const patienceFrac = clamp(target.patience / target.maxPatience, 0, 1);
    let tip = Math.round(dish.price * TUNING.tipMax * patienceFrac);
    if (target.vip) tip *= TUNING.vipTipMult;
    // Combo: a serve within the window chains; otherwise the chain restarts.
    if (this._comboTimer <= TUNING.comboWindow && s.combo > 0) {
      s.combo += 1;
    } else {
      s.combo = 1;
    }
    this._comboTimer = 0;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
    const mult = this.comboMult();
    let earned = Math.round((dish.price + tip) * mult);
    const perfect = patienceFrac >= TUNING.perfectThreshold;
    if (perfect) {
      earned += TUNING.perfectBonus;
      s.perfectServes += 1;
    }
    s.coins += earned;
    s.totalEarned += earned;
    s.nightEarned += earned;
    s.nightTips += tip;
    s.stats.totalTips += tip;
    s.served += 1;
    s.nightServed += 1;
    s.stats.dishesCooked += 1;
    target.state = 'served';
    target.cooking = false;
    s.plate.item = null;
    if (perfect) {
      this.setMessage(`PERFECT! +${earned} coins`, 2);
      this.setEvent(EVENTS.PERFECT);
    } else if (s.combo >= 2) {
      this.setMessage(`Served! +${earned} coins (combo x${mult.toFixed(1)})`, 2);
      this.setEvent(EVENTS.SERVE);
    } else {
      this.setMessage(`Served! +${earned} coins`, 2);
      this.setEvent(EVENTS.SERVE);
    }
    // A freed plate may unblock a dish waiting at its last station.
    this._tryAdvanceAll();
  }

  pourTea() {
    const s = this.state;
    if (s.screen !== SCREEN_PLAY) return;
    if (s.tea.cooldown > 0) {
      this.setMessage(`Tea is brewing… (${Math.ceil(s.tea.cooldown)}s)`, 1.2);
      return;
    }
    const waiting = s.customers.filter((c) => c.state === 'waiting');
    if (waiting.length === 0) {
      this.setMessage('No customers to soothe.', 1.2);
      return;
    }
    s.tea.cooldown = this.teaCooldownMax();
    let soothed = 0;
    for (const c of waiting) {
      c.patience = Math.min(
        c.maxPatience,
        c.patience + c.maxPatience * TUNING.teaPatienceBoost,
      );
      soothed += 1;
    }
    if (this.hasUpgrade('tea-stall')) {
      const bonus = soothed * 2;
      s.coins += bonus;
      s.totalEarned += bonus;
      s.nightEarned += bonus;
    }
    s.stats.teasPoured += 1;
    this.setMessage(
      `Tea poured! +25% patience for ${soothed} customer${soothed > 1 ? 's' : ''}`,
      2,
    );
    this.setEvent(EVENTS.TEA);
  }

  discardBurnt() {
    const s = this.state;
    if (s.screen !== SCREEN_PLAY) return;
    // Tossing the plate's dish (when the plate is selected) is the escape
    // hatch for a dish nobody ordered any more — the plate must never block.
    if (s.selected === 'plate' && s.plate.item) {
      s.plate.item = null;
      s.combo = 0;
      this._comboTimer = 0;
      this.setMessage('Dish tossed.', 1.5);
      this.setEvent(EVENTS.CLICK);
      return;
    }
    // Burnt item in the selected station first, then anywhere.
    const order = [s.selected, 'chop', 'wok', 'steam'].filter(
      (n, i, arr) => n !== 'plate' && arr.indexOf(n) === i,
    );
    for (const name of order) {
      const slots = s.stations[name].slots;
      for (let i = 0; i < slots.length; i += 1) {
        if (slots[i] && slots[i].burnt) {
          slots[i] = null;
          s.burntCount += 1;
          s.combo = 0;
          this._comboTimer = 0;
          this.setMessage('Burnt dish tossed. Start it again!', 2);
          this.setEvent(EVENTS.BURNT);
          this._tryAdvanceAll();
          return;
        }
      }
    }
    this.setMessage('Nothing burnt to toss.', 1.2);
  }

  // ------------------------------------------------------------ shop / meta
  buyUpgrade(id) {
    const s = this.state;
    if (s.screen !== SCREEN_NIGHT_DONE) return;
    if (s.shop.closed) return;
    if (s.shop.offered.indexOf(id) === -1) return;
    const up = upgradeById(id);
    if (!up) return;
    if (s.coins < up.cost) {
      this.setMessage(`Need ${up.cost} coins for ${up.name}.`, 2);
      return;
    }
    s.coins -= up.cost;
    s.upgrades.push(id);
    s.shop.bought = id;
    s.shop.closed = true;
    s.stats.upgradesBought += 1;
    this.setMessage(`${up.name} bought!`, 2);
    this.setEvent(EVENTS.COIN);
  }

  skipShop() {
    const s = this.state;
    if (s.screen !== SCREEN_NIGHT_DONE) return;
    s.shop.closed = true;
    this.setMessage('Saved your coins for later.', 1.5);
    this.setEvent(EVENTS.CLICK);
  }

  // ------------------------------------------------------------- per-frame
  step(dt, input) {
    const s = this.state;
    const frameDt = dt || (input && input.dt) || 1 / 60;
    s.event = null; // fresh event slot for this frame
    const inp = input || {};

    if (inp.mute) {
      s.muted = !s.muted;
    }

    // ---- discrete actions, by screen ------------------------------------
    if (s.screen === SCREEN_TITLE) {
      if (inp.confirm) this.startGame();
      else if (inp.click && pointInRect(inp.click.x, inp.click.y, LAYOUT.buttons.start)) {
        this.startGame();
      }
      return;
    }

    if (s.screen === SCREEN_PAUSED) {
      if (inp.pause || inp.confirm) s.screen = SCREEN_PLAY;
      else if (inp.restart) this.restartNight();
      else if (inp.click && pointInRect(inp.click.x, inp.click.y, LAYOUT.buttons.resume)) {
        s.screen = SCREEN_PLAY;
      }
      return;
    }

    if (s.screen === SCREEN_NIGHT_DONE) {
      if (inp.click) {
        const { x, y } = inp.click;
        let handled = false;
        if (!s.shop.closed) {
          for (let i = 0; i < s.shop.offered.length; i += 1) {
            if (pointInRect(x, y, LAYOUT.shopCards[i])) {
              this.buyUpgrade(s.shop.offered[i]);
              handled = true;
              break;
            }
          }
        }
        if (!handled && pointInRect(x, y, LAYOUT.buttons.nextNight)) this.nextNight();
        else if (!handled && pointInRect(x, y, LAYOUT.buttons.skipShop)) this.skipShop();
      } else if (inp.confirm) {
        this.nextNight();
      }
      return;
    }

    if (s.screen === SCREEN_GAME_OVER) {
      if (inp.restart || inp.confirm) this.startGame();
      else if (inp.click && pointInRect(inp.click.x, inp.click.y, LAYOUT.buttons.tryAgain)) {
        this.startGame();
      }
      return;
    }

    if (s.screen === SCREEN_RESULTS) {
      if (inp.restart || inp.confirm) this.startGame();
      else if (inp.click && pointInRect(inp.click.x, inp.click.y, LAYOUT.buttons.playAgain)) {
        this.startGame();
      }
      return;
    }

    // ---- PLAY ------------------------------------------------------------
    if (inp.pause) {
      s.screen = SCREEN_PAUSED;
      return;
    }
    if (inp.restart) {
      this.restartNight();
      return;
    }
    if (inp.select) this.selectStation(inp.select);
    if (inp.serve) this.servePlate();
    if (inp.tea) this.pourTea();
    if (inp.discard) this.discardBurnt();
    if (inp.act) {
      this.workSelected();
    } else if (inp.actHeld) {
      // Hold-to-work auto-repeats at a fixed rate (one chunk per 0.12s),
      // never once per frame: a frame-rate chunk would cook in a blink.
      this._holdAcc += frameDt;
      while (this._holdAcc >= 0.12) {
        this._holdAcc -= 0.12;
        this.workSelected();
      }
    } else {
      this._holdAcc = 0;
    }
    if (inp.click) this._handleClick(inp.click.x, inp.click.y);

    // ---- simulation ------------------------------------------------------
    const nightDef = NIGHTS[s.night];
    s.nightTime += frameDt;

    // Spawns: regular schedule, then the rush-hour burst, then the VIP.
    if (!this._allSpawned()) {
      if (s.nightTime >= this._spawnRetryAt && this._spawnedRegular < nightDef.customers) {
        if (s.nightTime >= this._nextSpawnAt) {
          const before = this._spawnedRegular;
          this._spawnRegular();
          if (this._spawnedRegular === before) {
            // No free seat: try again in a second, keep the schedule.
            this._spawnRetryAt = s.nightTime + 1;
          } else {
            this._nextSpawnAt = s.nightTime + nightDef.spawnInterval;
          }
        }
      }
      if (!this._rushDone && s.nightTime >= nightDef.rushAt) {
        // Rush hour: 3 customers at once. If a seat is full, the rest
        // keep trying every frame until they get in — the burst is never
        // silently dropped, and never double-counted as regular spawns.
        if (this._rushSpawned === 0) {
          this.setMessage('RUSH HOUR!', 3);
          this.setEvent(EVENTS.RUSH);
        }
        while (this._rushSpawned < TUNING.rushBurst) {
          if (!this._spawnCustomer(this.rng.pick(nightDef.pool), false)) break;
          this._rushSpawned += 1;
        }
        if (this._rushSpawned >= TUNING.rushBurst) this._rushDone = true;
      }
      if (nightDef.vip && !this._vipDone && s.nightTime >= nightDef.length * 0.5) {
        if (s.nightTime >= this._vipRetryAt) {
          if (this._spawnCustomer('starfruit-tea-cake', true)) {
            this._vipDone = true;
            this.setMessage('A FOOD CRITIC has arrived!', 3);
            this.setEvent(EVENTS.VIP);
          } else {
            this._vipRetryAt = s.nightTime + 1;
          }
        }
      }
    }

    // Patience drains; at 0 the customer walks away.
    for (const c of s.customers) {
      if (c.state !== 'waiting') continue;
      c.patience -= frameDt;
      if (c.patience <= 0) {
        c.patience = 0;
        c.state = 'left';
        c.cooking = false;
        s.walkaways += 1;
        s.combo = 0;
        this._comboTimer = 0;
        this._orphanCleanup(c);
        this.setMessage('A customer stormed out! -1 heart', 2.5);
        this.setEvent(EVENTS.WALKAWAY);
        s.hearts -= 1;
        if (s.hearts <= 0) {
          s.hearts = 0;
          s.screen = SCREEN_GAME_OVER;
          this.setEvent(EVENTS.GAME_OVER);
          return;
        }
      }
    }

    // Burn timers: a finished WOK/STEAM item that cannot move on burns
    // once it has waited past its burn window. CHOP never burns.
    for (const name of ['wok', 'steam']) {
      const slots = s.stations[name].slots;
      for (let i = 0; i < slots.length; i += 1) {
        const item = slots[i];
        if (!item || item.burnt) continue;
        if (item.progress >= item.need) {
          item.waitTime += frameDt;
          if (item.waitTime > STATIONS[name].burnWindow) {
            item.burnt = true;
            this.setMessage('It BURNT! Press X to toss it.', 2.5);
            this.setEvent(EVENTS.BURNT);
          }
        }
      }
    }

    // Finished items try to move on whenever a slot frees.
    this._tryAdvanceAll();

    // Tea cooldown ticks down.
    if (s.tea.cooldown > 0) s.tea.cooldown = Math.max(0, s.tea.cooldown - frameDt);

    // Combo window: too long between serves and the chain breaks.
    this._comboTimer += frameDt;
    if (s.combo > 0 && this._comboTimer > TUNING.comboWindow) {
      s.combo = 0;
    }

    // Floating message fades.
    if (s.message.t > 0) s.message.t = Math.max(0, s.message.t - frameDt);

    // Night end: every scheduled customer has arrived and every one of
    // them is served or gone. (The timer only stops new spawns; a night
    // that is fully resolved ends early instead of idling.)
    if (this._allSpawned()) {
      const anyWaiting = s.customers.some((c) => c.state === 'waiting');
      if (!anyWaiting) this._endNight();
    }
  }

  // When a customer walks away, their in-progress dish is orphaned. If
  // another waiting customer ordered the same dish and has none cooking
  // yet, hand the item to them; otherwise toss it so it can never block
  // a station or the plate.
  _orphanCleanup(leaver) {
    const s = this.state;
    const other = s.customers.find(
      (c) => c.state === 'waiting' && c.dishId === leaver.dishId && c.id !== leaver.id,
    );
    const handOver = other && !this._itemForCustomer(other.id);
    for (const name of ['chop', 'wok', 'steam']) {
      const slots = s.stations[name].slots;
      for (let i = 0; i < slots.length; i += 1) {
        const item = slots[i];
        if (item && item.customerId === leaver.id) {
          if (handOver) {
            item.customerId = other.id;
            other.cooking = true;
          } else {
            slots[i] = null;
          }
        }
      }
    }
    if (s.plate.item && s.plate.item.customerId === leaver.id) {
      if (handOver) {
        s.plate.item.customerId = other.id;
        other.cooking = true;
      } else {
        s.plate.item = null;
      }
    }
  }

  _endNight() {
    const s = this.state;
    const metTarget = s.nightEarned >= s.target;
    if (metTarget) {
      s.hearts = Math.min(TUNING.heartsMax, s.hearts + 1);
      s.coins += TUNING.targetBonusCoins;
      s.totalEarned += TUNING.targetBonusCoins;
      s.nightEarned += TUNING.targetBonusCoins;
      this.setEvent(EVENTS.TARGET);
    }
    s.stats.nightsCleared += 1;
    if (s.night >= NIGHTS.length - 1) {
      this.toResults();
      return;
    }
    s.screen = SCREEN_NIGHT_DONE;
    this.setEvent(EVENTS.NIGHT_DONE);
  }

  // ------------------------------------------------------------- click map
  _handleClick(x, y) {
    const s = this.state;
    // Tickets first: clicking a customer's ticket starts their dish.
    for (const c of s.customers) {
      if (c.state !== 'waiting') continue;
      if (pointInRect(x, y, ticketRectForSeat(c.seat))) {
        this.startOrder(c.id);
        return;
      }
    }
    // Stations: first click selects, clicking the selected one works it.
    for (const name of ['chop', 'wok', 'steam']) {
      if (pointInRect(x, y, LAYOUT.stations[name])) {
        if (s.selected === name) this.workSelected();
        else this.selectStation(name);
        return;
      }
    }
    if (pointInRect(x, y, LAYOUT.stations.plate)) {
      if (s.selected === 'plate') this.servePlate();
      else this.selectStation('plate');
      return;
    }
    if (pointInRect(x, y, LAYOUT.teapot)) {
      this.pourTea();
      return;
    }
    if (pointInRect(x, y, LAYOUT.trash)) {
      this.discardBurnt();
      return;
    }
  }
}
