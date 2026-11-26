// tools/shoot.mjs
// Takes this game's screenshots: launches headless Chrome, opens each pose from shots.json on the
// local static server and writes a 1280x720 JPEG of the canvas. Node only, no dependencies.
//   node tools/shoot.mjs --base http://127.0.0.1:8137 --out screenshots

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const here = fileURLToPath(new URL('..', import.meta.url));
const base = argValue('--base', 'http://127.0.0.1:8137');
const outDir = resolve(here, argValue('--out', 'screenshots'));
const port = Number(argValue('--port', '9333'));
const chromePath = argValue('--chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

mkdirSync(outDir, { recursive: true });
const profile = join(tmpdir(), `kestrel-shots-${Date.now()}`);

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--force-device-scale-factor=1',
  'about:blank',
]);
chrome.on('error', (error) => {
  console.error('chrome failed to start:', error.message);
  process.exit(1);
});

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function findPageTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // Chrome is still booting.
    }
    await wait(250);
  }
  throw new Error('no page target appeared');
}

function connect(url) {
  return new Promise((done, fail) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener('open', () =>
      done({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej }));
        },
        close: () => socket.close(),
      }),
    );
    socket.addEventListener('error', (event) => fail(new Error(`socket error: ${event.message ?? 'unknown'}`)));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(message.error.message));
        else res(message.result);
      }
    });
  });
}

const page = await findPageTarget();
const client = await connect(page.webSocketDebuggerUrl);

await client.send('Page.enable');
await client.send('Runtime.enable');
await client.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
});

for (const shot of shots) {
  const url = `${base}/${shot.query ?? ''}`;
  await client.send('Page.navigate', { url });
  await wait(700);
  // Wait for the game to announce its first frame.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await client.send('Runtime.evaluate', {
      expression: 'Boolean(window.__shotReady)',
      returnByValue: true,
    });
    if (ready.result?.value) break;
    await wait(150);
  }
  await wait(350);
  const capture = await client.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: shot.quality ?? 86,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 },
  });
  const bytes = Buffer.from(capture.data, 'base64');
  const file = join(outDir, shot.name);
  writeFileSync(file, bytes);
  console.log(`${shot.name}: ${(bytes.length / 1024).toFixed(0)} KiB`);
  if (bytes.length > 262144) console.warn(`  ! ${shot.name} is over the 256 KiB screenshot cap`);
}

client.close();
chrome.kill();
await wait(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  // Windows may still hold a lock on the profile; harmless.
}
