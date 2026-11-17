#!/usr/bin/env python3
"""
GTA 6 Clipper — cuts a long gameplay video into vertical Reels / TikTok / Shorts.

    python3 clipper.py VIDEO_OR_YOUTUBE_URL [options]

What it does:
  1. Downloads the video (if a YouTube link was given; needs yt-dlp).
  2. Finds the "hot" moments: sudden jumps in loudness (shots, explosions,
     crashes, shouting) plus a lot of on-screen motion.
  3. Renders each moment as a 1080x1920 clip: hook title at the top,
     optional burned-in subtitles, your @handle, a progress bar,
     loudness normalized for social platforms.
  4. Writes an index.html page to review the clips, and captions.txt with
     a ready caption and hashtags for each clip.

Requirements: Python 3.9+, ffmpeg, numpy.
Optional: yt-dlp (YouTube links), faster-whisper (--subs).
"""
from __future__ import annotations

import argparse
import html
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

try:
    import numpy as np
except ImportError:  # pragma: no cover
    sys.exit("numpy is missing. Run: pip install -r requirements.txt")

BIN = 0.5  # analysis resolution, seconds
W, H = 1080, 1920

TITLES = {
    "he": [
        "לא תאמינו מה קרה פה",
        "הרגע הכי מטורף ב-GTA 6",
        "חכו לסוף...",
        "זה לא היה אמור לקרות",
        "המשטרה לא ציפתה לזה",
        "GTA 6 זה משחק אחר",
        "איך זה בכלל אפשרי?!",
        "תסתכלו מה עשיתי",
        "הכי מצחיק שראיתי במשחק",
        "רגע אחד של שקט... ואז",
        "ככה לא בורחים מהמשטרה",
        "וייס סיטי לא מוכנה לזה",
    ],
    "en": [
        "You won't believe this",
        "Craziest GTA 6 moment",
        "Wait for the end...",
        "This wasn't supposed to happen",
        "The cops didn't expect this",
        "GTA 6 is a different game",
        "How is this even possible?!",
        "Watch what I did",
        "Funniest thing in GTA 6",
        "Vice City wasn't ready",
    ],
}

HASHTAGS = ("#GTA6 #GTAVI #GTA6Gameplay #GrandTheftAuto #ViceCity #gaming "
            "#gamer #fyp #foryou #viral #reels #shorts")

PLATFORMS = {
    # name: max length in seconds
    "tiktok": 60,
    "reels": 90,
    "shorts": 60,
}


# --------------------------------------------------------------------------- utils

def log(msg: str) -> None:
    print(msg, flush=True)


def need(binary: str) -> None:
    if not shutil.which(binary):
        sys.exit(f"'{binary}' was not found. Install ffmpeg (Mac: brew install ffmpeg).")


def run(cmd: list[str], cwd: str | None = None) -> None:
    p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        tail = "\n".join(p.stderr.strip().splitlines()[-25:])
        raise RuntimeError(f"command failed:\n{' '.join(cmd)}\n---\n{tail}")


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    if out.returncode != 0:
        sys.exit(f"Can't read the video: {path}\n{out.stderr}")
    info = json.loads(out.stdout)
    v = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    a = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if v is None:
        sys.exit("There's no video stream in this file.")
    num, den = (v.get("avg_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    dur = float(info["format"].get("duration") or v.get("duration") or 0)
    return {"duration": dur, "width": int(v["width"]), "height": int(v["height"]),
            "fps": fps, "has_audio": a is not None}


def parse_time(s: str) -> float:
    """'90', '1:30', '01:02:03', '1:30.5' -> seconds"""
    parts = [float(p) for p in s.strip().split(":")]
    secs = 0.0
    for p in parts:
        secs = secs * 60 + p
    return secs


def fmt_time(t: float) -> str:
    t = int(round(t))
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", s, flags=re.UNICODE).strip("_")
    return s[:60] or "video"


def youtube_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


# --------------------------------------------------------------------------- download

def download(url: str, dest: Path, max_height: int) -> Path:
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        sys.exit("To download from YouTube, install yt-dlp: pip install yt-dlp")
    dest.mkdir(parents=True, exist_ok=True)
    log(f"⬇️  Downloading from YouTube (up to {max_height}p)...")
    tmpl = str(dest / "%(title).80s [%(id)s].%(ext)s")
    cmd = [sys.executable, "-m", "yt_dlp", "-f",
           f"bv*[height<={max_height}][ext=mp4]+ba[ext=m4a]/bv*[height<={max_height}]+ba/b[height<={max_height}]/b",
           "--merge-output-format", "mp4", "-o", tmpl, "--no-playlist",
           "--print", "after_move:filepath", "--no-simulate", "--quiet", "--no-warnings", url]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        sys.exit(f"The download failed:\n{p.stderr[-2000:]}")
    path = Path(p.stdout.strip().splitlines()[-1])
    log(f"   ✔ {path.name}")
    return path


# --------------------------------------------------------------------------- analysis

def analyze(src: str, info: dict, work: Path, audio_only: bool) -> dict:
    """Return per-bin arrays: audio dB, motion, cut flags."""
    dur = info["duration"]
    nbins = max(1, int(np.ceil(dur / BIN)))
    sr = 8000
    per_bin = int(sr * BIN)

    do_video = (not audio_only) or (not info["has_audio"])
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "error", "-i", os.path.abspath(src)]
    if info["has_audio"]:
        cmd += ["-map", "0:a:0", "-ac", "1", "-ar", str(sr), "-f", "s16le", "pipe:1"]
    if do_video:
        cmd += ["-map", "0:v:0", "-an", "-vf",
                "fps=4,scale=192:-2,select='gte(scene\\,0)',"
                "metadata=print:key=lavfi.scene_score:file=scene.txt",
                "-f", "null", "-"]

    log("🔎 Looking for the hot moments" + (" (sound + motion)..." if do_video else " (sound only)..."))
    t0 = time.time()
    proc = subprocess.Popen(cmd, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    db = np.full(nbins, -90.0)
    if info["has_audio"]:
        buf = b""
        idx = 0
        chunk_bytes = per_bin * 2 * 240  # 2 minutes at a time
        last_report = 0.0
        while True:
            data = proc.stdout.read(chunk_bytes)
            if not data:
                break
            buf += data
            usable = (len(buf) // (per_bin * 2)) * per_bin * 2
            if usable:
                a = np.frombuffer(buf[:usable], dtype="<i2").astype(np.float32).reshape(-1, per_bin)
                rms = np.sqrt(np.mean(a * a, axis=1)) / 32768.0
                vals = 20 * np.log10(np.maximum(rms, 1e-5))
                end = min(nbins, idx + len(vals))
                db[idx:end] = vals[: end - idx]
                idx += len(vals)
                buf = buf[usable:]
            pos = idx * BIN
            if dur and pos - last_report > max(60, dur / 10):
                last_report = pos
                log(f"   {int(100 * pos / dur)}%  ({fmt_time(pos)} of {fmt_time(dur)})")
    _, err = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError("analysis failed:\n" + err.decode(errors="ignore")[-1500:])

    motion = np.zeros(nbins)
    cuts = np.zeros(nbins)
    scene_file = work / "scene.txt"
    if do_video and scene_file.exists():
        cnt = np.zeros(nbins)
        t = None
        for line in scene_file.read_text(errors="ignore").splitlines():
            if line.startswith("frame:"):
                m = re.search(r"pts_time:([\d.]+)", line)
                t = float(m.group(1)) if m else None
            elif line.startswith("lavfi.scene_score=") and t is not None:
                v = float(line.split("=", 1)[1])
                b = min(nbins - 1, int(t / BIN))
                motion[b] += v
                cnt[b] += 1
                if v > 0.4:
                    cuts[b] = 1
        motion = np.where(cnt > 0, motion / np.maximum(cnt, 1), 0)
        scene_file.unlink()
    log(f"   ✔ analysis took {time.time() - t0:.0f}s")
    return {"db": db.tolist(), "motion": motion.tolist(), "cuts": cuts.tolist(), "bin": BIN,
            "duration": dur}


def rolling_median(x: np.ndarray, win: int) -> np.ndarray:
    win = max(3, win | 1)
    if len(x) < win:
        return np.full_like(x, np.median(x))
    pad = win // 2
    xp = np.pad(x, pad, mode="edge")
    view = np.lib.stride_tricks.sliding_window_view(xp, win)
    return np.median(view, axis=1)


def smooth(x: np.ndarray, win: int) -> np.ndarray:
    if win <= 1:
        return x
    k = np.ones(win) / win
    return np.convolve(x, k, mode="same")


def norm01(x: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(x, 5), np.percentile(x, 98)
    if hi - lo < 1e-9:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0, 1)


def score_curve(an: dict) -> np.ndarray:
    db = np.array(an["db"])
    motion = np.array(an["motion"])
    has_audio = db.max() > -89
    # Loudness relative to the surroundings (last/next 30 s): explosions, shots, shouting.
    local = db - rolling_median(db, int(30 / BIN))
    excite = np.clip(local, 0, None) + 0.25 * (db - np.median(db))
    a = norm01(smooth(excite, 3)) if has_audio else np.zeros_like(db)
    m = norm01(smooth(motion, 3)) if motion.any() else np.zeros_like(db)
    if has_audio and motion.any():
        s = 0.65 * a + 0.35 * m
    else:
        s = a if has_audio else m
    return smooth(s, int(2 / BIN))


def pick_moments(an: dict, count: int, min_len: float, max_len: float,
                 skip_start: float, skip_end: float, gap: float = 4.0) -> list[dict]:
    s = score_curve(an)
    cuts = np.array(an["cuts"])
    n = len(s)
    dur = an["duration"]
    Lb = max(2, int(max_len / BIN))
    if n <= Lb:
        return [{"start": 0.0, "end": dur, "score": float(s.mean()) if n else 0.0}]

    cs = np.concatenate([[0], np.cumsum(s)])
    win = (cs[Lb:] - cs[:-Lb]) / Lb  # mean score of window starting at bin i
    lo_b = int(skip_start / BIN)
    hi_b = n - Lb - int(skip_end / BIN)
    valid = np.zeros_like(win, dtype=bool)
    if hi_b > lo_b:
        valid[lo_b:hi_b + 1] = True
    else:
        valid[:] = True

    taken = np.zeros(n, dtype=bool)
    out = []
    gb = int(gap / BIN)
    preroll = 1.5
    for _ in range(count * 3):
        if len(out) >= count:
            break
        cand = np.where(valid, win, -1)
        i = int(np.argmax(cand))
        if cand[i] < 0:
            break
        ws, we = i, i + Lb
        seg = s[ws:we]
        peak = seg.max()
        # Hook: start right before the first big moment of the window.
        first_hot = ws + int(np.argmax(seg >= 0.8 * peak))
        start_b = max(0, first_hot - int(preroll / BIN))
        # Snap to a scene cut nearby, so the clip doesn't start mid-shot.
        near = np.where(cuts[max(0, start_b - 2): start_b + 3] > 0)[0]
        if len(near):
            start_b = max(0, start_b - 2) + int(near[0])
        end_b = min(n, start_b + Lb)
        # Trim a boring tail.
        seg2 = s[start_b:end_b]
        hot = np.where(seg2 >= 0.45 * peak)[0]
        if len(hot):
            end_b = min(end_b, start_b + int(hot[-1]) + int(2.0 / BIN))
        end_b = max(end_b, min(n, start_b + int(min_len / BIN)))
        if taken[start_b:end_b].any():
            valid[max(0, i - Lb): i + Lb] = False
            continue
        taken[max(0, start_b - gb): min(n, end_b + gb)] = True
        valid[max(0, start_b - Lb - gb): min(len(valid), end_b + gb)] = False
        out.append({"start": round(start_b * BIN, 2),
                    "end": round(min(dur, end_b * BIN), 2),
                    "score": round(float(s[start_b:end_b].mean()), 3),
                    "peak": round(float(peak), 3)})
    return out


# --------------------------------------------------------------------------- subtitles

def ass_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def transcribe(clip_audio_src: str, start: float, dur: float, lang: str | None,
               model_name: str, work: Path) -> list[tuple[float, float, str]]:
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log("   ⚠ --subs needs faster-whisper (pip install faster-whisper). Skipping subtitles.")
        return []
    wav = work / "subs.wav"
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
         "-i", clip_audio_src, "-vn", "-ac", "1", "-ar", "16000", str(wav)])
    global _WHISPER
    try:
        if _WHISPER is None:
            log(f"   🗣  loading the speech model ({model_name}) — slow only the first time...")
            _WHISPER = WhisperModel(model_name, device="auto", compute_type="int8")
        segs, _ = _WHISPER.transcribe(str(wav), language=lang, word_timestamps=True, vad_filter=True)
        words = []
        for seg in segs:
            for w in (seg.words or []):
                if w.word.strip():
                    words.append((w.start, w.end, w.word.strip()))
    except Exception as e:  # no internet for the model download, etc.
        log(f"   ⚠ subtitles failed ({type(e).__name__}: {str(e)[:120]}). Continuing without them.")
        return []
    finally:
        wav.unlink(missing_ok=True)
    # Short chunks of up to 3 words, TikTok style.
    chunks = []
    cur = []
    for w in words:
        cur.append(w)
        if len(cur) >= 3 or (cur and w[1] - cur[0][0] > 1.3) or w[2][-1:] in ".?!,":
            chunks.append((cur[0][0], cur[-1][1], " ".join(x[2] for x in cur)))
            cur = []
    if cur:
        chunks.append((cur[0][0], cur[-1][1], " ".join(x[2] for x in cur)))
    return chunks


_WHISPER = None


def build_ass(path: Path, dur: float, title: str, handle: str, font: str, style: str,
              subs: list[tuple[float, float, str]], title_secs: float) -> None:
    # Where the gameplay sits on screen, so text never covers the action.
    if style == "blur":       # 16:9 band in the middle (y 656..1264)
        title_mv, subs_mv = 330, 540
    elif style == "square":   # 1:1 square in the middle (y 420..1500)
        title_mv, subs_mv = 200, 300
    else:                     # full 9:16 crop
        title_mv, subs_mv = 230, 430
    hdr = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,{font},84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,4,8,70,70,{title_mv},1
Style: Subs,{font},88,&H0000D7FF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,3,2,60,60,{subs_mv},1
Style: Handle,{font},40,&H50FFFFFF,&H00FFFFFF,&H64000000,&H00000000,-1,0,0,0,100,100,1,0,1,2,0,2,40,40,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    pop = r"{\fscx55\fscy55\t(0,160,\fscx112\fscy112)\t(160,300,\fscx100\fscy100)}"
    lines = []
    if title:
        tend = dur if title_secs <= 0 else min(dur, title_secs)
        lines.append(f"Dialogue: 2,{ass_time(0)},{ass_time(tend)},Title,,0,0,0,,{pop}{ass_escape(title)}")
    if handle:
        lines.append(f"Dialogue: 1,{ass_time(0)},{ass_time(dur)},Handle,,0,0,0,,{ass_escape(handle)}")
    small_pop = r"{\fscx80\fscy80\t(0,110,\fscx106\fscy106)\t(110,200,\fscx100\fscy100)}"
    for i, (a, b, text) in enumerate(subs):
        nxt = subs[i + 1][0] if i + 1 < len(subs) else dur
        b = min(max(b, a + 0.35), nxt, dur)
        lines.append(f"Dialogue: 3,{ass_time(a)},{ass_time(b)},Subs,,0,0,0,,{small_pop}{ass_escape(text)}")
    path.write_text(hdr + "\n".join(lines) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- render

def video_filter(style: str, dur: float, ass_name: str, bar: bool, crop_x: float,
                 fps_out: float | None) -> str:
    cx = f"(iw-ow)*{crop_x:.3f}"
    if style == "full":
        chain = f"[0:v]scale=-2:{H}:flags=lanczos,crop={W}:{H}:{cx}:0,setsar=1[v0]"
    else:
        if style == "square":
            fg = f"[f]crop='min(iw,ih)':'min(iw,ih)':(iw-ow)*{crop_x:.3f}:0,scale={W}:{W}:flags=lanczos[fg]"
        else:  # blur
            fg = f"[f]scale={W}:-2:flags=lanczos[fg]"
        chain = (
            f"[0:v]split=2[b][f];"
            f"[b]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,"
            f"boxblur=8:2,eq=brightness=-0.12:saturation=1.3,scale={W}:{H},setsar=1[bg];"
            f"{fg};"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v0]"
        )
    if bar:  # yellow progress bar that slides in from the left
        chain += (f";color=c=0xFFD400:s={W}x14:r=30[bar];"
                  f"[v0][bar]overlay=x='-w+w*t/{dur:.3f}':y=H-h:eval=frame:shortest=1[v1]")
        last = "v1"
    else:
        last = "v0"
    post = [f"ass={ass_name}"]
    post.append(f"fade=t=in:st=0:d=0.15,fade=t=out:st={max(0, dur - 0.35):.3f}:d=0.35")
    if fps_out:
        post.append(f"fps={fps_out:g}")
    post.append("format=yuv420p")
    return chain + f";[{last}]" + ",".join(post) + "[vout]"


def render_clip(src: str, info: dict, clip: dict, out_path: Path, work: Path, args) -> None:
    start, end = clip["start"], clip["end"]
    dur = round(end - start, 3)
    ass_name = out_path.stem + ".ass"
    subs = []
    if args.subs and info["has_audio"]:
        subs = transcribe(os.path.abspath(src), start, dur, args.lang, args.whisper_model, work)
    build_ass(work / ass_name, dur, clip.get("title", ""), args.handle, args.font, args.style,
              subs, args.title_secs)
    fps_out = args.fps or (60 if info["fps"] > 61 else None)
    vf = video_filter(args.style, dur, ass_name, not args.no_bar, args.crop_x, fps_out)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", os.path.abspath(src),
           "-filter_complex", vf, "-map", "[vout]"]
    if info["has_audio"]:
        cmd += ["-map", "0:a:0", "-af",
                f"afade=t=in:st=0:d=0.08,afade=t=out:st={max(0, dur - 0.35):.3f}:d=0.35,"
                f"loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000",
                "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
            "-profile:v", "high", "-maxrate", "14M", "-bufsize", "28M", "-movflags", "+faststart", os.path.abspath(out_path)]
    run(cmd, cwd=str(work))
    if not args.keep_ass:
        (work / ass_name).unlink(missing_ok=True)


def thumbnail(clip_path: Path, out: Path) -> None:
    try:
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", "1.2", "-i", str(clip_path),
             "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", str(out)])
    except RuntimeError:
        pass


# --------------------------------------------------------------------------- report

def write_report(out_dir: Path, name: str, clips: list[dict], an: dict | None, yt_id: str | None) -> None:
    curve_svg = ""
    if an:
        s = score_curve(an)
        n = len(s)
        step = max(1, n // 900)
        pts = s[::step]
        wv, hv = 1000, 90
        poly = " ".join(f"{i * wv / max(1, len(pts) - 1):.1f},{hv - v * (hv - 6):.1f}" for i, v in enumerate(pts))
        rects = "".join(
            f'<rect x="{c["start"] / an["duration"] * wv:.1f}" y="0" '
            f'width="{max(2, (c["end"] - c["start"]) / an["duration"] * wv):.1f}" height="{hv}" '
            f'class="pick"><title>#{c["n"]} {fmt_time(c["start"])}</title></rect>'
            for c in clips)
        curve_svg = (f'<svg viewBox="0 0 {wv} {hv}" preserveAspectRatio="none" class="curve">{rects}'
                     f'<polyline points="{poly}" class="line"/></svg>'
                     '<p class="muted">כמה "חם" כל רגע בסרטון (קול חזק + הרבה תנועה). הבלוקים הצבעוניים הם הקליפים שנחתכו.</p>')
    cards = []
    for c in clips:
        link = (f'<a href="https://www.youtube.com/watch?v={yt_id}&t={int(c["start"])}s" target="_blank">ביוטיוב ↗</a>'
                if yt_id else "")
        cap = html.escape(c["caption"])
        cards.append(f"""
<article>
  <video src="{html.escape(c['file'])}" poster="{html.escape(c.get('thumb', ''))}" controls preload="none" playsinline></video>
  <div class="meta">
    <b>#{c['n']}</b> · <bdi dir="ltr">{fmt_time(c['start'])}–{fmt_time(c['end'])}</bdi> · {c['end'] - c['start']:.0f} שנ׳ {link}
  </div>
  <textarea readonly>{cap}</textarea>
  <button onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='הועתק ✓'">העתק כיתוב</button>
</article>""")
    page = f"""<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>קליפים · {html.escape(name)}</title>
<style>
:root {{ --bg:#0d0d12; --card:#17171f; --fg:#f2f2f5; --muted:#9a9aab; --acc:#ffd400; --pick:rgba(255,77,141,.35); }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif; padding:24px 16px 60px; }}
h1 {{ margin:0 0 4px; font-size:24px }} .muted {{ color:var(--muted); font-size:14px; margin:6px 0 20px }}
.curve {{ width:100%; height:90px; background:var(--card); border-radius:10px; direction:ltr }}
.curve .line {{ fill:none; stroke:var(--acc); stroke-width:1.5; vector-effect:non-scaling-stroke }}
.curve .pick {{ fill:var(--pick) }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px }}
article {{ background:var(--card); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:8px }}
video {{ width:100%; aspect-ratio:9/16; background:#000; border-radius:10px }}
.meta {{ font-size:14px; color:var(--muted) }} .meta b {{ color:var(--acc) }} a {{ color:var(--acc) }}
textarea {{ width:100%; height:84px; background:#0f0f15; color:var(--fg); border:1px solid #2a2a36; border-radius:8px; padding:8px; font:inherit; font-size:13px; resize:vertical; unicode-bidi:plaintext }}
button {{ background:var(--acc); color:#000; border:0; border-radius:8px; padding:8px; font-weight:700; cursor:pointer }}
</style></head><body>
<h1>🎬 {len(clips)} קליפים מ־{html.escape(name)}</h1>
<p class="muted">מסודרים מהחזק לחלש. כל קובץ מוכן להעלאה לטיקטוק, לרילס ולשורטס (1080×1920).</p>
{curve_svg}
<div class="grid">{''.join(cards)}</div>
</body></html>"""
    (out_dir / "index.html").write_text(page, encoding="utf-8")


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Cut a long GTA 6 gameplay video into vertical clips for TikTok / Reels / Shorts.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument("source", help="Video file, or a YouTube link")
    ap.add_argument("-n", "--count", type=int, default=8, help="How many clips to make")
    ap.add_argument("--platform", choices=list(PLATFORMS), default="tiktok",
                    help="Caps the clip length for the platform")
    ap.add_argument("--len", dest="max_len", type=float, default=30, help="Maximum clip length (seconds)")
    ap.add_argument("--min", dest="min_len", type=float, default=12, help="Minimum clip length (seconds)")
    ap.add_argument("--at", default="", help="Cut by hand at these times instead of auto-detect, e.g. '12:30,45:10' "
                                             "or ranges '12:30-12:58,1:02:00-1:02:40'")
    ap.add_argument("--style", choices=["blur", "square", "full"], default="blur",
                    help="blur = full frame over a blurred background (HUD stays visible); "
                         "square = 1:1 center zoom; full = 9:16 crop that fills the screen")
    ap.add_argument("--crop-x", type=float, default=0.5, help="Horizontal crop position for square/full (0=left, 1=right)")
    ap.add_argument("--title", default="", help="One title for every clip. Separate several with | and they rotate")
    ap.add_argument("--auto-title", choices=["he", "en", "none"], default="he",
                    help="Language of the automatic hook titles when no --title is given")
    ap.add_argument("--title-secs", type=float, default=0, help="Seconds to show the title (0 = whole clip)")
    ap.add_argument("--handle", default="", help="Your username on screen, e.g. @mychannel")
    ap.add_argument("--font", default="Arial", help="Text font (must support Hebrew)")
    ap.add_argument("--subs", action="store_true", help="Burn in subtitles from your commentary (needs faster-whisper)")
    ap.add_argument("--lang", default=None, help="Speech language for --subs (he / en). Default: auto-detect")
    ap.add_argument("--whisper-model", default="small", help="Speech model for --subs: tiny/base/small/medium/large-v3")
    ap.add_argument("--hashtags", default=HASHTAGS, help="Hashtags for captions.txt")
    ap.add_argument("--no-bar", action="store_true", help="No progress bar at the bottom")
    ap.add_argument("--fps", type=float, default=None, help="Output frame rate (default: source rate, up to 60)")
    ap.add_argument("--crf", type=int, default=20, help="Quality (lower = better and bigger)")
    ap.add_argument("--preset", default="veryfast", help="x264 encoding speed")
    ap.add_argument("--jobs", type=int, default=2, help="How many clips to render at the same time")
    ap.add_argument("--audio-only", action="store_true", help="Faster analysis: sound only, no motion")
    ap.add_argument("--skip-start", type=float, default=5, help="Ignore the first seconds (intro)")
    ap.add_argument("--skip-end", type=float, default=5, help="Ignore the last seconds (outro)")
    ap.add_argument("--max-height", type=int, default=1080, help="Max quality to download from YouTube")
    ap.add_argument("-o", "--out", default="out", help="Output folder")
    ap.add_argument("--analyze-only", action="store_true", help="Only print the moments, render nothing")
    ap.add_argument("--reanalyze", action="store_true", help="Ignore saved analysis and run it again")
    ap.add_argument("--keep-ass", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--seed", type=int, default=None, help=argparse.SUPPRESS)
    args = ap.parse_args()

    need("ffmpeg")
    need("ffprobe")
    args.max_len = min(args.max_len, PLATFORMS[args.platform])
    args.min_len = min(args.min_len, args.max_len)
    if args.seed is not None:
        random.seed(args.seed)

    out_root = Path(args.out)
    yt_id = None
    src = args.source
    if re.match(r"https?://", src):
        yt_id = youtube_id(src)
        src = str(download(src, out_root / "_downloads", args.max_height))
    if not os.path.exists(src):
        sys.exit(f"File not found: {src}")

    info = probe(src)
    name = Path(src).stem
    if yt_id is None:
        m = re.search(r"\[([A-Za-z0-9_-]{11})\]$", name)
        yt_id = m.group(1) if m else None
    out_dir = out_root / slugify(name)
    work = out_dir / "_work"
    work.mkdir(parents=True, exist_ok=True)
    log(f"🎮 {name}  ·  {fmt_time(info['duration'])}  ·  {info['width']}x{info['height']} @ {info['fps']:.0f}fps")

    an = None
    if args.at.strip():
        clips = []
        for part in [p for p in args.at.split(",") if p.strip()]:
            if "-" in part:
                a, b = part.split("-", 1)
                s, e = parse_time(a), parse_time(b)
            else:
                s = parse_time(part)
                e = s + args.max_len
            e = min(e, info["duration"], s + PLATFORMS[args.platform])
            clips.append({"start": max(0.0, s), "end": e, "score": None})
    else:
        cache = out_dir / "analysis.json"
        if cache.exists() and not args.reanalyze:
            an = json.loads(cache.read_text())
            if args.audio_only is False and not any(an.get("motion", [])) and info["has_audio"]:
                an = None  # cached audio-only analysis; redo with motion
        if an is None:
            an = analyze(src, info, work, args.audio_only)
            cache.write_text(json.dumps(an))
        clips = pick_moments(an, args.count, args.min_len, args.max_len, args.skip_start, args.skip_end)

    if an is not None and clips:
        best = max(c["score"] for c in clips)
        keep = [c for c in clips if c["score"] >= 0.2 * best]
        if len(keep) < len(clips):
            log(f"   (skipped {len(clips) - len(keep)} weak moments — the rest of the video is quiet)")
        clips = keep
    if not clips:
        sys.exit("No moments found. Try a shorter --len, or cut by hand with --at.")

    # Titles
    if args.title.strip():
        pool = [t.strip() for t in args.title.split("|") if t.strip()]
    elif args.auto_title != "none":
        pool = TITLES[args.auto_title][:]
        random.shuffle(pool)
    else:
        pool = [""]
    for i, c in enumerate(clips, 1):
        c["n"] = i
        c["title"] = pool[(i - 1) % len(pool)]
        c["file"] = f"clip_{i:02d}.mp4"
        c["thumb"] = f"_thumbs/clip_{i:02d}.jpg"
        c["caption"] = (f"{c['title']} 🔥" if c["title"] else "GTA 6 🔥") + "\n\n" + args.hashtags

    log(f"\n✂️  {len(clips)} moments:")
    for c in clips:
        sc = f"  score {c['score']:.2f}" if c.get("score") is not None else ""
        log(f"   #{c['n']:<2} {fmt_time(c['start']):>8} – {fmt_time(c['end']):<8} ({c['end'] - c['start']:.0f}s){sc}  “{c['title']}”")
    if args.analyze_only:
        return

    (out_dir / "_thumbs").mkdir(exist_ok=True)
    log(f"\n🎬 Rendering {len(clips)} clips ({args.style}, 1080x1920)...")
    t0 = time.time()

    def job(c):
        cw = work / f"c{c['n']:02d}"
        cw.mkdir(exist_ok=True)
        p = out_dir / c["file"]
        render_clip(src, info, c, p, cw, args)
        thumbnail(p, out_dir / c["thumb"])
        shutil.rmtree(cw, ignore_errors=True)
        log(f"   ✔ {c['file']}  ({p.stat().st_size / 1e6:.1f} MB)")
        return c

    jobs = 1 if args.subs else max(1, args.jobs)  # one speech model at a time
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        list(ex.map(job, clips))

    (out_dir / "clips.json").write_text(json.dumps(
        {"source": args.source, "video": name, "clips": clips}, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(out_dir / "captions.txt", "w", encoding="utf-8") as f:
        for c in clips:
            f.write(f"=== {c['file']}  ({fmt_time(c['start'])}–{fmt_time(c['end'])}) ===\n{c['caption']}\n\n")
    write_report(out_dir, name, clips, an, yt_id)
    shutil.rmtree(work, ignore_errors=True)
    log(f"\n✅ Done in {time.time() - t0:.0f}s →  {out_dir.resolve()}")
    log(f"   Open {out_dir / 'index.html'} to watch the clips and copy captions.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nStopped.")
    except RuntimeError as e:
        sys.exit(f"\n❌ {e}")
