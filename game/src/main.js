// EMBERWOK — main.js
// Boot: canvas setup, world + input + audio wiring, fixed-timestep loop.
//
//   ?seed=N     — world seed (default 1).
//   ?shot=name  — screenshot mode: stageShot(name, world), draw ONE frame,
//                 set window.__shotReady = true, and do NOT run the loop.
//                 (start | play | perfect | end)
//
// Otherwise the game runs on requestAnimationFrame with a fixed STEP=1/60
// accumulator. All screen transitions live in the world; main only draws,
// plays the sound for the world's per-step event, and syncs mute/music.

import { EmberWokWorld, EVENTS } from './world.js';
import { drawWorld } from './render.js';
import { createInput } from './input.js';
import { SoundBank } from './audio.js';
import { stageShot } from './shots.js';
import { STEP } from './config.js';

const canvas = document.getElementById('game');
if (!canvas) throw new Error('EMBERWOK: no <canvas id="game"> found');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('EMBERWOK: canvas 2d context unavailable');

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '1', 10);
const seed = Number.isFinite(seedParam) ? seedParam : 1;
const shotName = params.get('shot');

const world = new EmberWokWorld(seed);
const sounds = new SoundBank();
const input = createInput(canvas);

// For debugging / screenshots.
window.__emberwok = { world };

// ---------------------------------------------------------------------------
// Audio: one sound per world event, music across the night.
// ---------------------------------------------------------------------------

function playEventSound(ev) {
  switch (ev) {
    case EVENTS.CHOP: sounds.chop(); break;
    case EVENTS.SIZZLE: sounds.sizzle(); break;
    case EVENTS.SERVE: sounds.serve(); break;
    case EVENTS.PERFECT: sounds.perfect(); break;
    case EVENTS.WALKAWAY: sounds.walkaway(); break;
    case EVENTS.BURNT: sounds.sizzle(); break;
    case EVENTS.RUSH: sounds.rush(); break;
    case EVENTS.VIP: sounds.ding(); break;
    case EVENTS.TARGET: sounds.coin(); break;
    case EVENTS.NIGHT_DONE: sounds.nightDone(); break;
    case EVENTS.GAME_OVER: sounds.gameOver(); break;
    case EVENTS.COIN: sounds.coin(); break;
    case EVENTS.CLICK: sounds.click(); break;
    case EVENTS.TEA: sounds.ding(); break;
    default: break;
  }
}

let prevScreen = world.state.screen;
let prevMuted = !!world.state.muted;

function afterStep() {
  const s = world.state;
  // Mute is toggled by the world (M key); mirror it into the SoundBank.
  if (!!s.muted !== prevMuted) {
    prevMuted = !!s.muted;
    sounds.toggleMute();
  }
  // Music starts when a night starts, stops at game over / results.
  if (prevScreen !== 'PLAY' && s.screen === 'PLAY') {
    sounds.ensure();
    sounds.startMusic();
  } else if (s.screen === 'GAME_OVER' || s.screen === 'RESULTS') {
    sounds.stopMusic();
  }
  if (s.event) playEventSound(s.event);
  prevScreen = s.screen;
}

function stepOnce() {
  input.input.dt = STEP;
  world.step(STEP, input.input);
  afterStep();
  input.consume();
}

// The AudioContext may only start from a user gesture: warm it on the first
// keypress / click as well as on the first night start.
function warmAudio() {
  sounds.ensure();
}
window.addEventListener('keydown', warmAudio, { once: true });
window.addEventListener('mousedown', warmAudio, { once: true });

// ---------------------------------------------------------------------------
// Screenshot mode (?shot=name): stage, draw one frame, stop.
// ---------------------------------------------------------------------------

if (shotName) {
  let info = null;
  try {
    info = stageShot(shotName, world);
  } catch (err) {
    window.__shotError = String(err && err.message ? err.message : err);
    console.error('[emberwok] stageShot failed:', err);
  }
  window.__shotInfo = info;
  window.__emberwok.shot = shotName;
  drawWorld(ctx, world);
  window.__shotReady = true;
} else {
  // -------------------------------------------------------------------------
  // Live loop.
  // -------------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25; // tab was hidden: don't spiral
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      stepOnce();
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0; // drop backlog rather than spiral
    drawWorld(ctx, world);
  }

  drawWorld(ctx, world);
  requestAnimationFrame(frame);
}
