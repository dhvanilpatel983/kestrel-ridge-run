// flight/controls.js
// Keyboard and mouse in, stick and throttle out. The keys are the pilot's, the callbacks are the
// game's: the campaign listens for gear, camera and restart toggles without knowing the keys.

const PITCH_KEYS = ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown'];

// A drag smaller than the dead zone leaves the stick centred, and past it the deflection starts from
// zero instead of jumping to the threshold: a steady hand holds a straight line without fighting it.
const applyDeadZone = (value, zone) => (Math.abs(value) < zone ? 0 : Math.sign(value) * ((Math.abs(value) - zone) / (1 - zone)));

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.actions = {};
    this.throttle = 0.62;
    this.mouseRoll = 0;
    this.mousePitch = 0;
    this.mouseSensitivity = 12;
    this.deadZone = 0.06;
    this.dragging = false;
    this.usesMouse = false;

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
      this.mouseRoll = 0;
      this.mousePitch = 0;
    });

    canvas.addEventListener('mousedown', (event) => {
      this.dragging = true;
      this.usesMouse = true;
      canvas.style.cursor = 'crosshair';
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      canvas.style.cursor = 'default';
      this.mouseRoll = 0;
      this.mousePitch = 0;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.dragging) return;
      this.mouseRoll = Math.max(-1, Math.min(1, event.movementX / this.mouseSensitivity));
      this.mousePitch = Math.max(-1, Math.min(1, -event.movementY / this.mouseSensitivity));
    });
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.throttle = Math.max(0, Math.min(1, this.throttle - Math.sign(event.deltaY) * 0.08));
      },
      { passive: false },
    );
  }

  onKeyDown(event) {
    const code = event.code;
    if (PITCH_KEYS.includes(code) || code === 'Space' || code === 'ArrowLeft' || code === 'ArrowRight') event.preventDefault();
    if (this.keys.has(code)) return;
    this.keys.add(code);
    const fire = (name) => {
      const handler = this.actions[name];
      if (handler) handler();
    };
    if (code === 'KeyG') fire('gear');
    if (code === 'KeyC') fire('camera');
    if (code === 'KeyP') fire('pause');
    if (code === 'KeyR') fire('restart');
    if (code === 'KeyM') fire('mute');
    if (code === 'KeyH') fire('help');
    if (code === 'Enter') fire('start');
    if (code === 'KeyZ' || code === 'Comma') this.throttle = Math.max(0, this.throttle - 0.08);
    if (code === 'KeyX' || code === 'Period') this.throttle = Math.min(1, this.throttle + 0.08);
    if (code === 'Digit1') this.throttle = 0;
    if (code === 'Digit2') this.throttle = 0.5;
    if (code === 'Digit3') this.throttle = 1;
  }

  on(name, handler) {
    this.actions[name] = handler;
  }

  held(...codes) {
    for (let i = 0; i < codes.length; i += 1) if (this.keys.has(codes[i])) return true;
    return false;
  }

  // The stick position and throttle this frame.
  read() {
    let pitch = 0;
    let roll = 0;
    let yaw = 0;
    if (this.held('KeyW', 'ArrowUp')) pitch += 1;
    if (this.held('KeyS', 'ArrowDown')) pitch -= 1;
    if (this.held('KeyA', 'ArrowLeft')) roll -= 1;
    if (this.held('KeyD', 'ArrowRight')) roll += 1;
    if (this.held('KeyQ')) yaw -= 1;
    if (this.held('KeyE')) yaw += 1;
    if (this.held('ShiftLeft', 'ShiftRight')) this.throttle = Math.min(1, this.throttle + 0.9 / 60);
    if (this.held('ControlLeft', 'ControlRight')) this.throttle = Math.max(0, this.throttle - 0.9 / 60);
    if (this.dragging) {
      roll += applyDeadZone(this.mouseRoll, this.deadZone);
      pitch += applyDeadZone(this.mousePitch, this.deadZone);
    }
    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      yaw: Math.max(-1, Math.min(1, yaw)),
      throttle: this.throttle,
    };
  }
}
