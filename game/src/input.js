// EMBERWOK — input.js
// Keyboard + mouse input for the 1280x720 canvas. Produces the input object
// the world consumes each frame:
//
//   { act, actHeld, select, serve, tea, pause, restart, mute, confirm,
//     discard, click: {x, y} | null, dt }
//
// Discrete flags (act, select, serve, tea, pause, restart, mute, confirm,
// discard, click) fire once and are cleared by consume(), which main.js calls
// after every world step. actHeld stays true while Space is held down, so the
// world can auto-repeat work. Mouse clicks are scaled from the canvas's
// on-screen size to the 1280x720 logical size.
//
// Key map: 1-4 select station, Space act, S/Enter serve, T tea, X discard,
// P pause, R restart, M mute, Enter confirm.

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

function freshInput() {
  return {
    act: false,
    actHeld: false,
    select: null,
    serve: false,
    tea: false,
    pause: false,
    restart: false,
    mute: false,
    confirm: false,
    discard: false,
    click: null,
    dt: 0,
  };
}

export function createInput(canvas) {
  const input = freshInput();
  const heldKeys = new Set();
  let attached = false;

  function scaleEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_W;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_H;
    return { x, y };
  }

  function onKeyDown(e) {
    // Never hijack browser shortcuts (Ctrl+R, Cmd+M, ...).
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Ignore repeats for discrete actions; holding Space still sets actHeld.
    const repeat = e.repeat;
    switch (e.code) {
      case 'Digit1': if (!repeat) input.select = 'chop'; break;
      case 'Digit2': if (!repeat) input.select = 'wok'; break;
      case 'Digit3': if (!repeat) input.select = 'steam'; break;
      case 'Digit4': if (!repeat) input.select = 'plate'; break;
      case 'Space':
        e.preventDefault();
        input.actHeld = true;
        if (!repeat) input.act = true;
        break;
      case 'KeyS':
        if (!repeat) input.serve = true;
        break;
      case 'Enter':
        if (!repeat) { input.serve = true; input.confirm = true; }
        break;
      case 'KeyT':
        if (!repeat) input.tea = true;
        break;
      case 'KeyX':
        if (!repeat) input.discard = true;
        break;
      case 'KeyP':
        if (!repeat) input.pause = true;
        break;
      case 'KeyR':
        if (!repeat) input.restart = true;
        break;
      case 'KeyM':
        if (!repeat) input.mute = true;
        break;
      default:
        return;
    }
    heldKeys.add(e.code);
  }

  function onKeyUp(e) {
    heldKeys.delete(e.code);
    if (e.code === 'Space') input.actHeld = false;
  }

  function onBlur() {
    // A lost window must not leave Space "held" forever.
    heldKeys.clear();
    input.actHeld = false;
  }

  function onMouseDown(e) {
    const p = scaleEvent(e);
    if (p) input.click = p;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function attach() {
    if (attached) return;
    attached = true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('contextmenu', onContextMenu);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
    heldKeys.clear();
    input.actHeld = false;
  }

  // Clear every discrete (one-shot) flag after the world has consumed the
  // frame's input. actHeld is deliberately left alone: it tracks the physical
  // key state, not a one-shot event.
  function consume() {
    input.act = false;
    input.select = null;
    input.serve = false;
    input.tea = false;
    input.pause = false;
    input.restart = false;
    input.mute = false;
    input.confirm = false;
    input.discard = false;
    input.click = null;
    input.dt = 0;
  }

  attach();
  return { input, attach, detach, consume };
}
