// Renders index.html to an MP4: steps render(t) frame by frame in headless Chromium, then ffmpeg encodes.
// Usage: node render.cjs <out.mp4> [framesDir] [fps]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const out = path.resolve(process.argv[2] || "ella_launch.mp4");
const frames = path.resolve(process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), "ella-frames-")));
const fps = +process.argv[4] || 30;
(async () => {
  fs.mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "index.html"));
  const info = await page.evaluate(() => window.ready);
  console.log(JSON.stringify(info));
  if (info.missing.length) console.log("WARNING: fonts not loaded:", info.missing.join(", "));
  const n = Math.round(info.duration * fps), stage = await page.$("#stage");
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    await stage.screenshot({ path: path.join(frames, String(i).padStart(4, "0") + ".jpg"), type: "jpeg", quality: 95 });
  }
  await browser.close();
  execFileSync("ffmpeg", ["-y", "-v", "error", "-framerate", String(fps), "-i", path.join(frames, "%04d.jpg"),
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log("wrote", out, n, "frames");
})().catch(e => { console.error(e); process.exit(1); });
