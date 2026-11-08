(() => {
  const overlay = document.getElementById('touch-controls');
  const pad = document.getElementById('touch-pad');
  const stick = document.getElementById('touch-stick');
  const primary = document.getElementById('touch-primary');
  const interact = document.getElementById('touch-interact');
  const goal = document.getElementById('touch-goal');
  const vehicle = document.getElementById('touch-vehicle');
  const extras = document.getElementById('touch-extra');
  const more = overlay.querySelector('[data-touch=more]');
  const canvas = document.getElementById('canvas');
  const bridge = window.LagoonFiles;
  let axisPointer = null;
  let primaryPointer = null;
  let mode = '';
  const send = (action, ...args) => bridge.notify('touch', action, ...args);
  const putStick = (x, y) => { stick.style.transform = `translate(${x}px,${y}px)`; };
  const detect = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches
    || new URLSearchParams(location.search).get('touch') === '1';
  bridge.touchDevice = detect;
  bridge.touchHeight = () => window.innerHeight;

  function hideExtras() {
    extras.hidden = true;
    more.setAttribute('aria-expanded', 'false');
  }

  bridge.resetTouch = () => {
    const oldAxis = axisPointer;
    const oldPrimary = primaryPointer;
    axisPointer = primaryPointer = null;
    putStick(0, 0);
    primary.classList.remove('held');
    if (oldAxis !== null && pad.hasPointerCapture(oldAxis)) pad.releasePointerCapture(oldAxis);
    if (oldPrimary !== null && primary.hasPointerCapture(oldPrimary)) primary.releasePointerCapture(oldPrimary);
    hideExtras();
  };

  bridge.showTouch = (next, time, hint, door, heading, title, summary) => {
    document.body.classList.toggle('touch-game', bridge.active && detect());
    if (next !== mode) {
      if (!next || mode) bridge.resetTouch();
      mode = next;
    }
    overlay.hidden = !mode;
    if (!mode) return;
    primary.textContent = mode === 'basket' ? '按住投篮' : mode === 'drive' ? '按住刹车' : '按住短跑';
    primary.setAttribute('aria-label', primary.textContent);
    vehicle.textContent = mode === 'drive' ? '下车／船' : '上车／船';
    document.getElementById('touch-time').textContent = time;
    document.getElementById('touch-hint').textContent = hint;
    interact.classList.toggle('ready', Boolean(door));
    interact.textContent = door ? '互动 · ' + door : '互动';
    goal.hidden = !title;
    document.getElementById('touch-goal-heading').textContent = heading;
    document.getElementById('touch-goal-title').textContent = title;
    document.getElementById('touch-goal-detail').textContent = summary;
  };

  function steer(event) {
    if (event.pointerId !== axisPointer) return;
    const rect = pad.getBoundingClientRect();
    const radius = rect.width * .32;
    const dx = (event.clientX - rect.left - rect.width / 2) / radius;
    const dy = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(dx, dy);
    const strength = Math.max(0, (Math.min(1, length) - .12) / .88);
    const x = length ? dx / length * strength : 0;
    const y = length ? dy / length * strength : 0;
    putStick(x * radius, y * radius);
    send('move', x, y);
  }
  pad.addEventListener('pointerdown', event => {
    if (axisPointer !== null || event.button !== 0) return;
    event.preventDefault();
    axisPointer = event.pointerId;
    pad.setPointerCapture(axisPointer);
    steer(event);
  });
  pad.addEventListener('pointermove', steer);
  function stopSteering(event) {
    if (event.pointerId !== axisPointer) return;
    axisPointer = null;
    putStick(0, 0);
    send('move', 0, 0);
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(name, stopSteering);

  primary.addEventListener('pointerdown', event => {
    if (primaryPointer !== null || event.button !== 0) return;
    event.preventDefault();
    primaryPointer = event.pointerId;
    primary.setPointerCapture(primaryPointer);
    primary.classList.add('held');
    send('primary', 'press');
  });
  function stopPrimary(event) {
    if (event.pointerId !== primaryPointer) return;
    primaryPointer = null;
    primary.classList.remove('held');
    send('primary', event.type === 'pointerup' ? 'release' : 'cancel');
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) primary.addEventListener(name, stopPrimary);
  overlay.addEventListener('click', event => {
    const button = event.target.closest('[data-touch]');
    if (!button) return;
    const action = button.dataset.touch;
    if (action === 'more') {
      extras.hidden = !extras.hidden;
      button.setAttribute('aria-expanded', String(!extras.hidden));
      return;
    }
    if (action === 'primary' && event.detail !== 0) return;
    hideExtras();
    if (action === 'primary') {
      send('primary', 'press');
      send('primary', 'release');
    } else {
      send(action);
    }
    canvas.focus();
  });
  function reset() {
    bridge.resetTouch();
    send('cancel');
  }
  window.addEventListener('resize', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
