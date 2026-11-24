#!/usr/bin/env node
// Render an HTML/canvas animation to MP4 (or PNG frames), no editing software.
// The page must expose window.renderAt(t) (draws the frame at t seconds) and window.ready = true.
//
//   node render.cjs --style 2 --out neon.mp4                 one style, one seamless 6 s loop
//   node render.cjs --style all --out-dir out/               all 20 styles, one file each
//   node render.cjs --reel --out reel.mp4                    the 24 s 20-style showcase reel
//   node render.cjs --page my-anim.html --seconds 8 --out x.mp4   any page that follows the same contract
//   options: --width 1080 (height = width*16/9)  --fps 30  --seconds N  --frames-only (PNG frames, no ffmpeg)
//            --still 2.5 (one PNG at t = 2.5 s)
// Needs: Playwright with Chromium (require('playwright')) and ffmpeg on PATH.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const page = path.resolve(opt('page', path.join(__dirname, 'styles.html')));
const width = parseInt(opt('width', 1080), 10), fps = parseInt(opt('fps', 30), 10);
const reel = opt('reel', false), style = opt('style', null), still = opt('still', null);
const framesOnly = opt('frames-only', false);

function ffmpeg(out) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg exit ' + c)) : res()));
  return { write: b => new Promise(r => ff.stdin.write(b) ? r() : ff.stdin.once('drain', r)), end: () => { ff.stdin.end(); return done; } };
}

async function renderOne(browser, query, out, secondsOverride) {
  const p = await browser.newPage({ viewport: { width, height: Math.round(width * 16 / 9) } });
  const url = pathToFileURL(page).href + '?' + new URLSearchParams({ render: '1', w: String(width), ...query });
  p.on('pageerror', e => console.error('page error:', e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.ready === true);
  const grab = async t => Buffer.from((await p.evaluate(t => { window.renderAt(t); return document.querySelector('canvas').toDataURL('image/png'); }, t)).split(',')[1], 'base64');
  if (still !== null) { fs.writeFileSync(out, await grab(parseFloat(still))); await p.close(); return; }
  const seconds = parseFloat(secondsOverride || opt('seconds', 0)) || await p.evaluate(() => window.loopSeconds || 6);
  const n = Math.round(seconds * fps);
  if (framesOnly) {
    fs.mkdirSync(out, { recursive: true });
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(out, String(i).padStart(5, '0') + '.png'), await grab(i / fps));
  } else {
    const ff = ffmpeg(out);
    for (let i = 0; i < n; i++) await ff.write(await grab(i / fps));
    await ff.end();
  }
  await p.close();
  console.log('wrote', out, `(${n || 1} frames)`);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ext = still !== null ? '.png' : framesOnly ? '' : '.mp4';
    if (reel) await renderOne(browser, { reel: '1' }, opt('out', 'reel' + ext));
    else if (style === 'all') {
      const dir = opt('out-dir', 'out'); fs.mkdirSync(dir, { recursive: true });
      const p = await browser.newPage(); await p.goto(pathToFileURL(page).href + '?render=1&style=1&w=64');
      const list = await p.evaluate(() => window.STYLES); await p.close();
      for (const st of list) await renderOne(browser, { style: String(st.n) }, path.join(dir, String(st.n).padStart(2, '0') + '-' + st.id + ext));
    } else await renderOne(browser, style ? { style: String(style) } : {}, opt('out', 'animation' + ext));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
