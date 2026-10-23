// Keyboard, pointer and touch controls are isolated from scene construction.
export function resetControls(S) {
  S.keys = {}; S.joy.x = S.joy.y = 0; S.up = S.down = S.boost = 0; S.cam.drag = false;
}
export function bindControls({S, canvas, $, actions}) {
  const {closeBoardView, initialsKey, legUpKey, startRace, toggleYear, toggleMode, cycleTime, startTour, showHelp, openBoardView, resetCar} = actions;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
addEventListener('keydown', (e) => {
  if (e.target?.matches?.('input, textarea, select, [contenteditable=true]')) return;
  if (!$('boardView').hidden) { if (['Escape', 'Enter', 'KeyB'].includes(e.code)) { e.preventDefault(); closeBoardView(); } return; }
  if (!$('raceEnd').hidden) { initialsKey(e); return; }
  if (!$('legUp').hidden) { legUpKey(e); return; }
  S.keys[e.code] = true;
  if (S.mode === 'intro' || e.repeat) return;
  if (e.code === 'KeyG' && !S.race) startRace();
  if (e.code === 'KeyY') toggleYear();
  if (e.code === 'KeyF') toggleMode();
  if (e.code === 'KeyN') cycleTime();
  if (e.code === 'KeyT') startTour();
  if (e.code === 'KeyH') showHelp();
  if (e.code === 'KeyB') openBoardView();
  if (e.code === 'KeyR') resetCar();
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { S.keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && e.target !== canvas) return; S.cam.drag = true; S.cam.lx = e.clientX; S.cam.ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!S.cam.drag) return;
  const dx = e.clientX - S.cam.lx, dy = e.clientY - S.cam.ly; S.cam.lx = e.clientX; S.cam.ly = e.clientY;
  if (S.mode === 'drone') { S.drone.yaw -= dx * 0.004; S.drone.pitch = clamp(S.drone.pitch - dy * 0.004, -1.45, 0.4); }
  else { S.cam.yaw -= dx * 0.006; S.cam.pitch = clamp(S.cam.pitch + dy * 0.004, 0.05, 1.3); S.cam.userYawT = 2.5; }
});
canvas.addEventListener('pointerup', () => { S.cam.drag = false; });
canvas.addEventListener('wheel', (e) => { S.cam.dist = clamp(S.cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 7, 90); if (S.mode === 'drone') S.drone.pos.y = clamp(S.drone.pos.y * (1 + Math.sign(e.deltaY) * 0.1), 8, 3000); }, { passive: true });
// joystick
(() => {
  const stick = $('stick'), knob = $('knob'); let id = null, cx = 0, cy = 0;
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; S.joy.x = S.joy.y = 0; knob.style.transform = ''; };
  addEventListener('blur', end);
  document.addEventListener('visibilitychange', () => { if (document.hidden) end(); });
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  function move(e) { let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } S.joy.x = dx / m; S.joy.y = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; }
  const hold = (el, key) => { el.addEventListener('pointerdown', () => S[key] = 1); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => S[key] = 0); };
  hold($('tUp'), 'up'); hold($('tDown'), 'down'); hold($('tBoost'), 'boost');
})();
  addEventListener('blur', () => resetControls(S));
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetControls(S); });
}
