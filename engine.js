"use strict";
// The board's free "brain". No server and no AI service: everything here runs in the page.
// - Reads a call script (markdown) into steps, each with the lines to say, and into objection answers.
// - Follows the live transcript: which line Paul just said, which objection the other side raised.
// - After the call, fills the summary from what was said: numbers, times, objections, quotes and the status.
// It fills only what it actually recognises; anything it did not hear stays empty.
// Loaded in the page as window.Engine, and in Node by the tests (module.exports).
(function (root){

// ---------- text ----------
const norm = s => String(s ?? "").replace(/([%₪])/g, " $1 ").replace(/[״"'׳`.,!?;:()[\]{}…–—*_>|/\\]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(("את של על זה זו זאת אני אתה הוא היא לא כן מה אם גם או יש אין עם כל רק אז כי עוד כמה איך לי לך לו לה שלך שלי שלו אבל הם הן אנחנו " +
  "היה היתה הייתי הזה הזאת אותו אותך אותי פה שם כבר ככה טוב בסדר אוקיי אוקי נו רגע יאללה סבבה ממש פשוט בערך איזה איזו אחד אחת שאני שאתה שזה " +
  "מי מתי למה לפני אחרי עכשיו היום אצלך אצלי אתם להגיד אגיד אומר תגיד יודע שאתה שהוא שהיא כאילו").split(" "));
// One leading prefix letter (ו, ה, ב, ל, מ, ש, כ) is dropped twice at most, the same way on both sides, so "השיחות" meets "שיחות".
const stem = w => { for (let n = 0; n < 2 && w.length >= 4 && /^[והבלמשכ]/.test(w); n++) w = w.slice(1); return w; };
const toks = s => norm(s).split(" ").filter(Boolean);
const keyToks = s => toks(s).filter(w => w.length >= 2 && !STOP.has(w)).map(stem).filter(w => w.length >= 2);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A short keyword must stand as its own word (a prefix letter is allowed); a long one may sit inside a phrase.
const has = (t, k) => k.length <= 4 ? new RegExp("(^| )[והבלמשכ]?" + reEsc(k) + "( |$)").test(t) : t.includes(k);
const clip = (s, n = 220) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// ---------- scripts ----------
// A step is a "##" section, or each "###" part of one when its parts have lines to say (the short script's "צעד 1..5").
// Lines to say are the ">" quotes. A quote under "**סוג א׳:**" or "**סוג ב׳:**" belongs to that kind of business only.
const SKIP = /לפני שמחייגים|טופס סיכום|כלל ההחלטה|משפטי|רישום אחרי|אחרי כל שיחה|לא אומרים|פנייה בוואטסאפ|כרטיס ההצעה|חוזר אליך|^השיטה/;
const OBJSEC = /התנגדויות/;
function parseSections(md){
  const top = []; let h2 = null, h3 = null;
  for (const line of String(md || "").split("\n")){
    let m;
    if ((m = line.match(/^## (.*)/))){ h2 = {title: m[1].trim(), lines: [], kids: []}; h3 = null; top.push(h2); }
    else if ((m = line.match(/^### (.*)/)) && h2){ h3 = {title: m[1].trim(), lines: []}; h2.kids.push(h3); }
    else if (h3) h3.lines.push(line); else if (h2) h2.lines.push(line);
  }
  return top;
}
const plain = t => String(t).replace(/\*\*/g, "").replace(/["“”„]/g, "").trim();
function label(title){
  let t = plain(title).replace(/^\d+[א-ת]?\.\s*/, "").replace(/^[א-ת]\d?\.\s+/, "").replace(/^צעד \d+:\s*/, "");
  t = t.replace(/\s*\(.*?\)/g, "").replace(/\.\s.*$/, "").trim();
  const c = t.indexOf(": "); if (c > 0) t = /^רק אם|CTA/.test(t) ? t.slice(c + 2) : t.slice(0, c);
  return t.length > 26 ? t.slice(0, t.lastIndexOf(" ", 24)) + "…" : t;
}
const unquote = s => String(s).replace(/\*\*/g, "").replace(/^\s*["“”„]+|["“”]+\s*$/g, "").replace(/\s+/g, " ").trim();
function splitSay(s){
  const out = [];
  for (const p of String(s).replace(/\*\*/g, "").split(/["”]\s*(?:\.\.\.|…)\s*["“]/).map(unquote).filter(Boolean)){
    if (p.length <= 150){ out.push(p); continue; }
    let cur = "";
    for (const sen of p.split(/(?<=[.?!])\s+/)){ if (cur && (cur + " " + sen).length > 150){ out.push(cur); cur = sen; } else cur = cur ? cur + " " + sen : sen; }
    if (cur) out.push(cur);
  }
  return out;
}
function sayLines(lines, kind){
  const out = []; let variant = null;
  for (const raw of lines){
    const line = raw.trim(); if (!line) continue;
    const v = line.match(/^\*\*\s*סוג\s*([אב])/);
    if (v){ variant = v[1] === "ב" ? "B" : "A"; continue; }
    if (line.startsWith(">")){ if (!(variant && kind && variant !== kind)) out.push(...splitSay(line.replace(/^>\s?/, ""))); continue; }
    // a question in a numbered list: 1. "מי עונה לטלפון של העסק?" (a note after it is dropped). Indented lines are branches, not lines to say.
    const q = /^\d+\.\s/.test(raw) && line.replace(/^\d+\.\s+/, "").replace(/\*\*/g, "").match(/^["“].*["”]/);
    if (q){ out.push(...splitSay(q[0])); continue; }
    variant = null;
  }
  return out;
}
const chunk = text => ({text, kt: keyToks(text).slice(0, 10)});
// What the other side says → the objection blocks whose title holds the fragment ([fragment, [keywords]]). The title's own
// phrases count too. The lists are the team's sales method, so they are not in this public code: configure() sets them
// from the playbook, which the board reads from the database after login (config, key "playbook").
let OBJ_KW = [];
const GENERIC = new Set(["אחר כך", "מי זה", "מאוחר יותר", "עסוק"]);   // too common in any talk to count alone
// Questions he asks are answered from the script too, but they are not "the main objection" in the summary.
const QUESTION = /כמה זה עולה|וואטסאפ|מאיפה|מי זה|עוקץ/;
function mkObj(title, md, say, then){
  const t = norm(title), kws = new Set();
  for (const [frag, list] of OBJ_KW) if (t.includes(norm(frag))) list.forEach(k => kws.add(norm(k)));
  for (const p of plain(title).replace(/\(.*?\)/g, "").split(/[/?]/)){ const n = norm(p); if (n && n.split(" ").length <= 4 && !GENERIC.has(n)) kws.add(n); }
  const nm = plain(title).match(/^([^:]{2,20}):\s/);   // "הובלות: ..." belongs to one niche only
  return {title: plain(title).replace(/\s*\(.*?\)\s*/g, " ").trim(), md, say, then, kws: [...kws], niche: nm ? nm[1].trim() : "", ...chunk(say)};
}
// A table cell may hold both kinds: **ב׳:** "…" **א׳:** "…" **ואז:** "…"
function tableSay(cell, kind){
  const parts = cell.split(/\*\*\s*(ב׳|א׳|ב'|א'|ואז)\s*:\s*\*\*/);
  if (parts.length === 1) return {say: unquote(cell), then: ""};
  const by = {}; for (let i = 1; i < parts.length; i += 2) by[parts[i][0]] = unquote(parts[i + 1]);
  return {say: (kind === "A" ? by["א"] : by["ב"]) || by["ב"] || by["א"] || unquote(parts[0]), then: by["ו"] || ""};
}
function objFrom(sec, kind){
  const out = [];
  for (const k of sec.kids){ if (/^השיטה/.test(plain(k.title))) continue;
    const say = sayLines(k.lines, kind), quoted = k.lines.find(x => /^\s*["“]/.test(x));   // a plain quoted line is the answer too
    out.push(mkObj(k.title, k.lines.join("\n"), say[0] || (quoted ? unquote(quoted) : ""), "")); }
  for (const line of sec.lines){
    if (!line.startsWith("|") || /^\|[-\s|:]+\|?$/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    if (cells.length < 2 || /הוא אומר/.test(cells[0])) continue;
    const {say, then} = tableSay(cells[1], kind), next = [then, unquote(cells[2] || "")].filter(Boolean).join(" · ");
    out.push(mkObj(cells[0], `> ${say}${next ? `\n\n**ואז:** ${next}` : ""}`, say, next));
  }
  return out;
}
function mkStep(title, lines, says, group){ return {label: label(title), title: plain(title), group, md: lines.join("\n"), chunks: says.map(chunk)}; }
function parseScript(md, kind){
  const steps = [], objections = [];
  for (const s of parseSections(md)){
    const t = plain(s.title);
    if (OBJSEC.test(t)){ objections.push(...objFrom(s, kind)); continue; }
    if (SKIP.test(t)) continue;
    const own = sayLines(s.lines, kind);
    const kids = s.kids.filter(k => !SKIP.test(plain(k.title))).map(k => ({...k, says: sayLines(k.lines, kind)}));
    if (kids.some(k => k.says.length)){
      if (own.length) steps.push(mkStep(s.title, s.lines, own, ""));
      for (const k of kids) if (k.says.length) steps.push(mkStep(k.title, k.lines, k.says, label(s.title)));
    } else if (own.length) steps.push(mkStep(s.title, [...s.lines, ...s.kids.flatMap(k => ["### " + k.title, ...k.lines])], own, ""));
  }
  // A step belongs to the first call ("main"), to the follow-up call after the demo ("follow"), or is a backup to use by hand ("aside").
  // Following the call moves on only within the same flow.
  for (const s of steps) s.flow = /המשך/.test(s.group || s.title) || /ההצעה והסגירה/.test(s.title) ? "follow" : /נשימה אחת|^אמון/.test(s.label) ? "aside" : "main";
  steps.forEach((s, i) => s.id = i); objections.forEach((o, i) => o.id = i);
  return {steps, objections};
}

// ---------- the niche scripts (Ofek, 27.10) ----------
// The sales script holds a section "תסריטים לפי תחום": a fixed opening and closing for all, and per niche "**הוק:** \"…\"",
// "**ההצעה:** \"…\"", "**שאלת סינון:** \"…\"" (a line starting with a quote is a line to say), plus notes such as
// "**הכאב:**" or "**לא להבטיח:**" that go with the line before them. Each niche also has an objection "### הובלות: …".
const NICHES = [/הובל/, /מוסכ/, /מספר|ברבר/, /מוני/, /מגרש/, /תיווך/];
const nicheRe = niche => NICHES.find(re => re.test(niche || "")) || null;
const sameNiche = (a, b) => { const re = nicheRe(b); return !!re && re.test(a || ""); };
function nicheScript(md, niche, kind){
  const re = nicheRe(niche); if (!re) return null;
  const sec = parseSections(md).find(s => /לפי תחום/.test(plain(s.title))); if (!sec) return null;
  const part = sec.kids.find(k => re.test(plain(k.title))); if (!part) return null;
  const group = label(part.title), steps = [];
  const fixed = word => { const i = sec.lines.findIndex(x => new RegExp("^\\*\\*" + word).test(x.trim())); if (i < 0) return null;
    const q = sec.lines.slice(i + 1).find(x => x.trim()); return q && q.trim().startsWith(">") ? mkStep(word, [q], splitSay(q.trim().replace(/^>\s?/, "")), group) : null; };
  const open = fixed("פתיחה"), close = fixed("סגירה");
  if (open) steps.push(open);
  let last = null;
  for (const raw of part.lines){
    const m = raw.trim().match(/^\*\*([^*]+?):\*\*\s*(.*)$/);
    if (m && /^["“]/.test(m[2])){ last = mkStep(m[1], [raw], splitSay(m[2]), group); steps.push(last); }
    else if (raw.trim() && last) last.md += "\n\n" + raw;
  }
  if (close) steps.push(close);
  if (!steps.length) return null;
  const objections = parseScript(md, kind).objections.filter(o => !o.niche || re.test(o.niche));
  steps.forEach((s, i) => { s.id = i; s.flow = "main"; }); objections.forEach((o, i) => o.id = i);
  return {steps, objections};
}

// ---------- following the call ----------
// How many of a line's first key words were heard. A line counts as said when about half of them were.
function said(c, heard){
  const kt = c.kt; if (!kt.length) return false;
  const hits = kt.filter(t => heard.has(t)).length;
  return hits >= (kt.length <= 2 ? kt.length : Math.max(3, Math.ceil(0.45 * kt.length)));
}
// A line Paul read from the script (most of a script line's key words in it). Such lines are not "the other side's words".
// Phrases from Paul's own pitch (from the playbook): a line with one of them is his, not the other side's.
let PAUL = null;
function isPaul(text, model){
  if (PAUL && PAUL.test(norm(text))) return true;
  const kt = new Set(keyToks(text)); if (kt.size < 3) return false;
  for (const c of allChunks(model)){ if (c.kt.length < 3) continue; const hits = c.kt.filter(t => kt.has(t)).length; if (hits / c.kt.length >= 0.6 && hits >= 3) return true; }
  return false;
}
const allChunks = m => m ? [...m.steps.flatMap(s => s.chunks), ...m.objections.filter(o => o.say).map(o => o)] : [];
function findObjection(text, model){
  const t = norm(text); let best = null;
  for (const o of (model && model.objections) || []) for (const k of o.kws) if (k && has(t, k) && (!best || k.length > best.kw.length)) best = {o, kw: k};
  return best;
}
const BYE = /(^| )(ביי|באי|ביביי|ביי ביי|להתראות|להשתמע|יום טוב|ערב טוב|לילה טוב|שבוע טוב|שבת שלום|חג שמח)( |$)/;
const isBye = text => BYE.test(norm(text));

// ---------- numbers ----------
const UNITS = {אחת: 1, אחד: 1, שתיים: 2, שתים: 2, שניים: 2, שנים: 2, שתי: 2, שני: 2, שלוש: 3, שלושה: 3, שלושת: 3, ארבע: 4, ארבעה: 4, ארבעת: 4, חמש: 5, חמישה: 5, חמשת: 5,
  שש: 6, שישה: 6, ששת: 6, שבע: 7, שבעה: 7, שבעת: 7, שמונה: 8, שמונת: 8, תשע: 9, תשעה: 9, תשעת: 9, עשר: 10, עשרה: 10, עשרת: 10};
const TENS = {עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90, מאה: 100, מאתיים: 200};
// Tokens for number reading: "1,500" stays one token, "2.5" keeps its point (as ·), "ב-10" becomes "ב 10".
const ntoks = s => norm(String(s ?? "").replace(/(\d)[,'](?=\d{3}(?!\d))/g, "$1").replace(/(\d)\.(\d)/g, "$1·$2")).split(" ").filter(Boolean);
const digitVal = w => { const m = w.match(/^[והבלמש]?(\d+(?:·\d+)?)$/); return m ? parseFloat(m[1].replace("·", ".")) : null; };
const wordVal = w => UNITS[w] ?? TENS[w] ?? (w === "אלף" ? 1000 : w === "אלפיים" ? 2000 : null);
function readNum(t, i){
  let total = 0, cur = 0, j = i;
  const d = digitVal(t[i]);
  if (d != null) cur = d;
  else { const w = wordVal(t[i]); if (w == null) return null;
    if ((t[i] === "שני" || t[i] === "שתי") && /^ב?יום$/.test(t[i - 1] || "")) return null;   // "יום שני" is Monday
    if (w >= 1000) total = w; else cur = w; }
  for (j = i + 1; j < t.length; j++){
    const raw = t[j], and = raw.length > 2 && raw[0] === "ו", w = and ? raw.slice(1) : raw;
    if (w === "אלף" || w === "אלפים"){ total += (cur || 1) * 1000; cur = 0; continue; }
    if (w === "אלפיים" && !cur){ total += 2000; continue; }
    if (w === "מאות" && cur && cur < 10){ cur *= 100; continue; }
    if (and && w === "חצי"){ if (cur) cur += 0.5; else total += total ? 500 : 0; j++; break; }
    const v = UNITS[w] ?? TENS[w];
    if (v != null && (and || ((w === "עשר" || w === "עשרה") && cur > 0 && cur < 10))){ cur += v; continue; }
    break;
  }
  return {v: total + cur, i, end: j};
}
function numbersIn(t){
  const out = [];
  for (let i = 0; i < t.length; i++){ const n = readNum(t, i); if (!n) continue; out.push(n); i = n.end - 1; }
  // "3 4 שיחות" or "שלוש ארבע שיחות": a range keeps its upper end
  return out.filter((n, k) => !(out[k + 1] && out[k + 1].i === n.end && out[k + 1].v > n.v && out[k + 1].v <= n.v * 3 + 2));
}
const near = (t, a, b, re) => t.slice(Math.max(0, a), Math.max(0, b)).some(w => re.test(w));
let PRICE_WORDS = new Set();   // our own prices (from the playbook), said by Paul: never his deal value
const RE = {
  calls: /^[והב]?ה?(שיחות|שיחה|פניות|פנייה|לקוחות|טלפונים|פעמים|צלצולים|לידים|הודעות)$/,
  week: /^[ולב]?(שבוע|לשבוע)$/, day: /^[ולב]?(יום)$/, month: /^[ולב]?(חודש)$/,
  miss: /פספס|מפספס|נופל|נופלות|מחזיר|חוזר|הולכות|הולכים|לא עונה|עונה|מתחרה|תופס|מפסיד/,
  dur: /^(שניות|דקות|דקה|שעות|שעה|שנים|שנה|חודשים|ימים|אחוז|אחוזים|%)$/,
  money: /^(שקל|שקלים|שח|₪|ש״ח)$/,
  deal: /עבודה|עסקה|עסקאות|פרויקט|תיקון|קריאה|ביקור|ממוצע|שווה|עולה|מרוויח|הזמנה|פרגולה|מטבח|חלון|תריס|דלת|התקנה|עמלה|דירה|נכס|מכירה|טיפול|תספורת|נסיעה/,
  adCost: /^[ל]?(ליד|פנייה|קליק)$|פרסום|קמפיין|מודעות/,
  pct: /^(אחוז|אחוזים|%)$/, close: /סוגר|סגירה|נסגר|נסגרות|סוגרים|הופכ|מתוך|מצליח|יוצא/,
  visits: /^[ב]?(ביקור|ביקורים|מדידות|מדידה|קריאות|עבודות|פגישות|הצעות)$/};
function facts(text){
  const t = ntoks(text), nums = numbersIn(t), out = {};
  let best = {missed: 0, deal: 0, close: 0, visits: 0};
  for (const n of nums){
    const a = n.i, e = n.end, nx = t.slice(e, e + 3), v = n.v;
    if (nx[0] && RE.dur.test(nx[0]) && !RE.pct.test(nx[0])) continue;
    // calls he misses: "5 שיחות בשבוע", "2 ביום" (×5 work days), "20 בחודש" (÷4.33)
    const noun = nx.slice(0, 2).some(w => RE.calls.test(w)), per = t.slice(e, e + 6);
    const wk = per.some(w => RE.week.test(w)), dy = per.some(w => RE.day.test(w)), mo = per.some(w => RE.month.test(w));
    if (v > 0 && v <= 200 && (noun || wk) && (wk || dy || mo)){
      const miss = near(t, a - 10, e + 6, RE.miss), visit = nx.slice(0, 2).some(w => RE.visits.test(w));
      const weekly = Math.round(dy && !wk ? v * 5 : mo && !wk ? v / 4.33 : v) || 1;
      if (visit){ if (!best.visits){ out.visits = weekly; best.visits = 1; } continue; }
      const score = 1 + (noun ? 1 : 0) + (miss ? 2 : 0);
      if (score > best.missed){ out.missed = weekly; best.missed = score; }
      continue;
    }
    // close rate: "30 אחוז", "אחד מתוך שלושה"
    if (nx[0] && RE.pct.test(nx[0]) && v > 0 && v <= 100 && !near(t, a - 3, a, /מעמ|מע״מ/)){
      const score = near(t, a - 8, e + 6, RE.close) ? 2 : 1;
      if (score > best.close){ out.close = v; best.close = score; }
      continue;
    }
    if (nx[0] === "מתוך" && nx[1]){ const of = readNum(t, e + 1); if (of && of.v > v && near(t, a - 8, e + 8, RE.close)){ if (2 > best.close){ out.close = Math.round(100 * v / of.v); best.close = 2; } continue; } }
    // the value of an average job: "450 שקל", "₪3000", "15 אלף", with job words around it
    const money = RE.money.test(t[e] || "") || RE.money.test(t[a - 1] || "") || /אלף|אלפים|אלפיים/.test(t.slice(a, e).join(" "));
    if (money && v >= 50 && v <= 2000000 && !PRICE_WORDS.has(v)){
      if (t.slice(e, e + 4).some(w => RE.month.test(w)) || near(t, e, e + 3, RE.adCost)) continue;   // a monthly sum or a cost per lead
      const score = 1 + (near(t, a - 8, e + 6, RE.deal) ? 2 : 0);
      if (score > best.deal){ out.deal = v; best.deal = score; }
    }
  }
  for (const [w, v] of [["חצי", 50], ["שליש", 33], ["רבע", 25]]){
    const k = t.findIndex((x, i) => stem(x) === w && near(t, i - 6, i + 6, RE.close));
    if (k >= 0 && !best.close){ out.close = v; best.close = 1; }
  }
  return out;
}
// Cost per lead: "40 שקל לליד"
function leadCost(text){
  const t = ntoks(text);
  for (const n of numbersIn(t)){ const nx = t.slice(n.end, n.end + 3); if (nx.some(w => RE.money.test(w)) && nx.some(w => /^[ל]?(ליד|פנייה|קליק)$/.test(w))) return n.v; }
  return 0;
}

// ---------- dates and times ----------
const WEEKDAYS = {ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5};
const HOURW = {אחת: 1, שתיים: 2, שתים: 2, שלוש: 3, ארבע: 4, חמש: 5, שש: 6, שבע: 7, שמונה: 8, תשע: 9, עשר: 10};
const dtoks = s => String(s ?? "").replace(/[״"'׳`,!?;()…–—]/g, " ").replace(/-/g, " ").replace(/\.(?!\d)/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
function timeAt(t, i){   // → {h, m, end} or null
  let w = t[i], h = null, m = 0, j = i + 1, mark = /^ב/.test(w) || /^(ב|בשעה|שעה)$/.test(t[i - 1] || "");
  let d = w.match(/^(?:ב|בשעה)?(\d{1,2})(?::(\d{2}))?$/);
  if (d){ h = +d[1]; m = d[2] ? +d[2] : 0; if (!mark && !d[2] && !/^(בבוקר|בערב|בצהריים|אחהצ|אחה״צ|בלילה)$/.test(t[j] || "")) return null; }
  else {
    const base = w.replace(/^ב/, ""); if (!(base in HOURW) || !mark) return null;
    h = HOURW[base];
    if (/^עשרה?$/.test(t[j] || "") && h <= 2){ h += 10; j++; }   // "באחת עשרה", "בשתיים עשרה"
  }
  if (h > 23 || m > 59) return null;
  if (t[j] === "וחצי"){ m = 30; j++; } else if (t[j] === "ורבע"){ m = 15; j++; } else if (t[j] === "פחות" && t[j + 1] === "רבע"){ h -= 1; m = 45; j += 2; }
  let part = "";
  if (/^(בבוקר)$/.test(t[j] || "")){ part = "am"; j++; }
  else if (/^(בערב|בלילה|אחהצ|אחה״צ)$/.test(t[j] || "") || (t[j] === "אחרי" && t[j + 1] === "הצהריים")){ part = "pm"; j++; }
  else if (t[j] === "בצהריים"){ part = "noon"; j++; }
  return {h, m, part, end: j};
}
// "שעה וחצי", "חצי שעה", "רבע שעה", "שעתיים", "10 דקות", "3 ימים", "שבוע" from token j on → {day, end} or null
function spanAt(t, j){
  const x = t[j] || "", y = t[j + 1] || "", half = y === "וחצי";
  if (x === "שבוע") return {day: {rel: 7}, end: j + 1}; if (x === "שבועיים") return {day: {rel: 14}, end: j + 1}; if (x === "יומיים") return {day: {rel: 2}, end: j + 1};
  if (x === "שעה") return {day: {mins: half ? 90 : 60}, end: j + (half ? 2 : 1)}; if (x === "שעתיים") return {day: {mins: half ? 150 : 120}, end: j + (half ? 2 : 1)};
  if (x === "חצי" && y === "שעה") return {day: {mins: 30}, end: j + 2}; if (x === "רבע" && y === "שעה") return {day: {mins: 15}, end: j + 2};
  const n = readNum(ntoks(x + " " + y), 0);
  if (n && /^(דקות|דקה)$/.test(y)) return {day: {mins: n.v}, end: j + 2}; if (n && /^(שעות|שעה)$/.test(y)) return {day: {mins: n.v * 60}, end: j + 2};
  if (n && /^(ימים|יום)$/.test(y)) return {day: {rel: n.v}, end: j + 2};
  return null;
}
function dayAt(t, i){   // → {day: {rel} | {wd}, end} or null
  const w = t[i];
  if (w === "היום" || w === "הערב"){
    if (/^(כל|עד|של|לאורך)$/.test(t[i - 1] || "")) return null;   // "עונה לשיחות כל היום" is not a time
    return {day: w === "הערב" ? {rel: 0, pm: true} : {rel: 0}, end: i + 1}; }
  if (w === "מחר" || w === "ומחר") return {day: {rel: 1}, end: i + 1};
  if (w === "מחרתיים") return {day: {rel: 2}, end: i + 1};
  if (/^ב?שבוע$/.test(w) && t[i + 1] === "הבא") return {day: {rel: 7}, end: i + 2};
  if (/^(בעוד|עוד|תוך|ותוך|אחרי)$/.test(w)) return spanAt(t, i + 1);   // "עוד חצי שעה", "בעוד 10 דקות", "תוך שעה"
  if (i === 0 && /^(חצי|רבע)$/.test(w) && t[1] === "שעה") return spanAt(t, 0);   // the whole answer: "חצי שעה, נסיים הובלה"
  const p = w.match(/^(?:ב|ה|וב)?(ראשון|שני|שלישי|רביעי|חמישי|שישי)$/);
  if (p && (w !== p[1] || /^ב?יום$/.test(t[i - 1] || ""))) return {day: {wd: WEEKDAYS[p[1]]}, end: i + 1};
  return null;
}
const pad = n => String(n).padStart(2, "0");
const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function whenIn(text){
  const t = dtoks(text), out = [];
  for (let i = 0; i < t.length; i++){
    const d = dayAt(t, i), tm = d ? null : timeAt(t, i);
    if (!d && !tm) continue;
    const x = {day: d && d.day, time: tm}; let j = (d || tm).end;
    for (let k = j; k < Math.min(t.length, j + 3); k++){   // the other half within a few words: "מחר בשמונה", "בשש ביום שלישי"
      if (!x.time){ const tt = timeAt(t, k); if (tt){ x.time = tt; j = tt.end; break; } }
      if (!x.day){ const dd = dayAt(t, k); if (dd){ x.day = dd.day; j = dd.end; break; } }
    }
    out.push(x); i = j - 1;
  }
  return out;
}
function resolveWhen(x, now){
  const d = new Date(now); d.setSeconds(0, 0);
  if (x.day && x.day.mins != null){ d.setMinutes(d.getMinutes() + x.day.mins); return d; }
  let h = 10, m = 0;
  if (x.time){ h = x.time.h; m = x.time.m;
    if (x.time.part === "pm" || (x.day && x.day.pm)){ if (h < 12) h += 12; }
    else if (x.time.part === "noon"){ if (h < 6) h += 12; }
    else if (x.time.part !== "am" && h >= 1 && h <= 7) h += 12;   // "בשש" in business talk is six in the evening
  }
  if (x.day && x.day.rel != null) d.setDate(d.getDate() + x.day.rel);
  else if (x.day && x.day.wd != null) d.setDate(d.getDate() + (((x.day.wd - d.getDay() + 7) % 7) || 7));
  d.setHours(h, m);
  if (!x.day && d <= new Date(now.getTime() + 10 * 60000)) d.setDate(d.getDate() + 1);   // a time already past today means tomorrow
  if (x.day && x.day.rel === 0 && !x.time) d.setTime(Math.max(now.getTime() + 3600000, d.getTime()));
  return d;
}
// The agreed time: the last time the other side named (Paul's script line "היום בשש או מחר בשמונה?" only offers).
// A bare "מחר" or "בשמונה" borrows the missing half from an earlier mention, usually Paul's offer.
function agreedWhen(lines, now, model){
  const all = [];
  for (const ln of lines){ const paul = isPaul(ln.x, model); for (const x of whenIn(ln.x)) all.push({...x, paul}); }
  const own = all.filter(x => !x.paul); if (!own.length) return "";
  const pick = {...own[own.length - 1]};
  if (!pick.time || !pick.day){
    for (let k = all.indexOf(own[own.length - 1]) - 1; k >= 0; k--){ const y = all[k];
      if (!pick.time && y.time && (!pick.day || !y.day || JSON.stringify(y.day) === JSON.stringify(pick.day))){ pick.time = y.time; if (!pick.day) pick.day = y.day; break; }
      if (!pick.day && y.day && y.time && pick.time && y.time.h === pick.time.h){ pick.day = y.day; break; } }
  }
  const d = resolveWhen(pick, now);
  return d > now ? localISO(d) : "";
}

// ---------- after the call: the summary ----------
const SIGNALS = {
  vm: /השאר הודעה|השאירו הודעה|תא הקולי|לתא קולי|לאחר הצליל|אחרי הצליל|המנוי אינו זמין|אינו זמין כרגע|המספר אליו חייגת|לא ניתן להשיג/,
  dnc: /תוריד אותי|תמחק אותי|אל תתקשר|אל תתקשרו|אל תחזור אליי|לא להתקשר אליי|תוציא אותי מהרשימה/,
  no: /לא מעוניין|לא רלוונטי|לא צריך את זה|לא מתאים לי|אין צורך/,
  demo: /דמו|קישור|לינק|תשמע אותה|לשמוע אותה|תדבר איתה|שולח לך|אשלח לך|בוואטסאפ/,
  back: /תחזור|תתקשר|נדבר|אחזור|חזור אליי|תצלצל|אתקשר/,
  sendMe: /תשלח לי|שלח לי|תשלח הודעה|תשלח פרטים/,
  demoSent: /שלחתי לך|שלחתי עכשיו|הנה שלחתי|קיבלת את הקישור|קיבלת את הלינק/,
  demoHeard: /שמעתי אותה|דיברתי איתה|היא ענתה לי|היא עונה יפה/,
  today: /חוזר אליהם|מחזיר|חוזר אחר כך|אשתי עונה|נכנס לתא|תא קולי|משאירים הודעה|לא עונה|הולך למתחרה|מוצא מישהו אחר|עונה אחר כך/,
  pain: /מפסיד|הפסדתי|בורח|בורחים|הולך למתחרה|הלכו למתחרה|מתסכל|מעצבן|נשרף|איבדתי|פספסתי|חבל לי|כואב|לא מספיק לענות|לא מצליח לענות/,
  story: /פעם האחרונה|פעם אחת|היה לי לקוח|הלך למתחרה|מצא מישהו אחר|פספסתי עבודה|איבדתי עבודה|לקוח שהלך/,
  goal: /אני רוצה|הייתי רוצה|המטרה שלי|חשוב לי|אני צריך ש|אני מחפש/,
  tried: /ניסיתי|כבר ניסינו|עבדתי עם|היה לי בוט|היה לי מוקד|שילמתי ל/,
  noPain: /הכל מסודר|אני עונה לכל|אין לי בעיה|לא מפספס|אין בעיה כזאת/};
const DECIDER = [[/מחליט לבד|אני מחליט|רק אני מחליט|ההחלטה שלי|אני הבוס/, "לבד"], [/עם אשתי|אשתי|בת הזוג|אשתו/, "עם בת הזוג"], [/השותף|שותף|השותפה/, "עם שותף"]];
const STAFF = [[/אני לבד|עובד לבד|רק אני|לבד בעסק/, "לבד"], [/אשתי עונה|אשתי עוזרת/, "אשתי עונה"], [/יש לי מזכירה|המזכירה שלי|המזכירה עונה/, "יש מזכירה"], [/יש לי מוקד|המוקד שלי|המוקד עונה/, "מוקד מענה"]];
const CALENDAR = [[/יומן גוגל|גוגל קלנדר|יומן של גוגל|גוגל יומן/, "יומן גוגל"], [/מחברת|פנקס|על דף/, "מחברת"], [/אקסל/, "אקסל"], [/בראש שלי|זוכר בראש/, "בראש"], [/ביומן|יומן בטלפון/, "יומן בטלפון"]];
const SOURCES = [[/גוגל/, "גוגל"], [/פייסבוק/, "פייסבוק"], [/אינסטגרם/, "אינסטגרם"], [/מידרג/, "מידרג"], [/יד 2|יד שתיים/, "יד 2"], [/המלצות|מפה לאוזן|פה לאוזן|חברים מביאים/, "המלצות"],
  [/טיקטוק/, "טיקטוק"], [/איזי/, "איזי"], [/דפי זהב/, "דפי זהב"], [/קבוצות/, "קבוצות בפייסבוק"]];
const SOURCE_CTX = /לקוחות מגיעים|מגיעים אליי|מגיעים אלי|מקבל|לידים|פונים|מביא|מפרסם|משלם|דרך|מ גוגל|מגוגל|מפייסבוק/;
const firstMatch = (lines, re) => lines.find(l => re.test(norm(l.x)));
const pickAll = (text, list) => [...new Set(list.filter(([re]) => re.test(text)).map(([, v]) => v))];
const fmtILS = n => "₪" + Math.round(n).toLocaleString("he-IL");
// lines: [{s: seconds from start, x: text}]; kind: "A" | "B"; objections: titles detected live; dur: seconds; prevLogs: earlier entries
function extract({lines = [], model = null, kind = "B", objections = [], dur = 0, now = new Date(), prevLogs = 0} = {}){
  const text = norm(lines.map(l => l.x).join(" ")), words = text ? text.split(" ").length : 0;
  const his = lines.filter(l => !isPaul(l.x, model)), hisText = norm(his.map(l => l.x).join(" "));   // lines that are probably the other side, or Paul off-script
  const f = facts(lines.map(l => l.x).join(" . "));
  const sm = {}, calc = {}, log = {}, why = {};
  const put = (k, v, line) => { if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return; sm[k] = String(v); if (line) why[k] = line.x; };
  // numbers
  if (f.missed){ calc.calc_missed = String(f.missed); put("missed", `${f.missed} בשבוע (לפי מה שנאמר בשיחה)`); log.missed = String(f.missed); }
  if (f.deal){ calc.calc_deal = String(f.deal); put("deal", fmtILS(f.deal)); log.job = fmtILS(f.deal); }
  if (f.close){ calc.calc_close = String(f.close); put("close", f.close + "%"); }
  if (f.visits) put("visits", `${f.visits} בשבוע`);
  if (f.missed && f.deal && f.close) put("calc", `${fmtILS(f.missed * 4.33 * (f.close / 100) * f.deal)} בחודש (${f.missed} שיחות בשבוע × ${f.close}% סגירה × ${fmtILS(f.deal)})`);
  // words that describe the business
  const staff = pickAll(hisText, STAFF), emp = text.match(/(\d+) עובדים/); if (emp) staff.unshift(emp[1] + " עובדים"); if (staff.length) put("staff", staff.join(", "));
  const decLine = firstMatch(lines, /מחליט|להתייעץ|לבדוק עם|לדבר עם/);
  if (decLine){ const v = pickAll(norm(decLine.x), DECIDER); if (v.length) put("decider", v.join(", "), decLine); }
  const cal = pickAll(hisText, CALENDAR); if (cal.length) put("calendar", cal[0]);
  const srcText = lines.filter(l => SOURCE_CTX.test(norm(l.x)) && !/מצאתי את העסק|ראיתי את האתר|המספר מגוגל/.test(norm(l.x))).map(l => norm(l.x)).join(" ");
  const src = pickAll(srcText, SOURCES), cost = leadCost(srcText); if (src.length || cost) put("sources", src.join(", ") + (cost ? `${src.length ? ", " : ""}${fmtILS(cost)} לליד` : ""));
  // his words
  const say = (re, k) => { const l = his.find(x => re.test(norm(x.x))); if (l) put(k, clip(l.x), l); return l; };
  say(SIGNALS.story, "story"); say(SIGNALS.tried, "tried"); say(SIGNALS.goal, "goal");
  const quote = his.map(l => ({l, n: (norm(l.x).match(new RegExp(SIGNALS.pain.source, "g")) || []).length})).filter(x => x.n).sort((a, b) => b.n - a.n)[0];
  if (quote) put("quote", clip(quote.l.x), quote.l);
  // objections: the first one heard, in his words
  const objLines = his.map(l => ({l, o: findObjection(l.x, model)})).filter(x => x.o);
  const main = objLines.filter(x => !QUESTION.test(x.o.o.title)).pop() || objLines[0];   // the last real objection is the one that held him back
  if (main){ put("objection", clip(main.l.x), main.l); log.obj = clip(objLines[0].l.x); }
  else if (objections.length){ put("objection", objections[0]); log.obj = objections[0]; }
  // the price and how he took it
  const rawToks = ntoks(lines.map(l => l.x).join(" ")), prices = numbersIn(rawToks).filter(n => PRICE_WORDS.has(n.v)), priceNum = prices[0];
  if (priceNum){ put("price", [...new Set(prices.map(n => fmtILS(n.v)))].slice(0, 3).join(" · "));
    const after = rawToks.slice(prices[prices.length - 1].end, prices[prices.length - 1].end + 40).join(" ");
    const r = /יקר|הרבה כסף|לא שווה/.test(after) ? "יקר" : /סביר|זה בסדר|לא נורא|הוגן|שווה את זה|זה כלום/.test(after) ? "סביר" : /זול/.test(after) ? "זול" : "";
    if (r){ put("reaction", r); log.reaction = r; } }
  // what happened: the status, the agreed time, the demo
  const when = agreedWhen(lines, now, model);
  const heardFrom = re => his.some(l => re.test(norm(l.x)));
  let status = "";
  if (words < 4) status = "noanswer";
  else if (SIGNALS.vm.test(text) && words < 80) status = "voicemail";
  else if (heardFrom(SIGNALS.dnc)) status = "dnc";
  else if (when && SIGNALS.demo.test(text)) status = "demo";
  else if (when) status = "callback";
  else if (heardFrom(SIGNALS.no) && !SIGNALS.demo.test(text)) status = "notrelevant";
  else if (heardFrom(SIGNALS.back) && dur < 90) status = "callback";
  else if (words >= 10 || dur >= 60) status = "done";   // a short real exchange is still a conversation
  else status = "noanswer";
  if (status === "noanswer" || status === "voicemail"){ for (const k of Object.keys(sm)) delete sm[k]; for (const k of Object.keys(calc)) delete calc[k]; for (const k of Object.keys(log)) delete log[k]; }
  if (status === "demo"){ put("demo", "כן, נקבע מועד"); put("demoDate", when); }
  else if (heardFrom(SIGNALS.sendMe) && !when) put("demo", "\"תשלח לי משהו\"");
  // the pain score, only when it is clear: 0 = said there is no problem, 2 = misses calls and told about it, 3 = and already tried to fix it
  if (heardFrom(SIGNALS.noPain) && !f.missed) put("pain", "0");
  else if (f.missed && sm.tried) put("pain", "3");
  else if (f.missed && (sm.story || sm.quote)) put("pain", "2");
  // Ofek's post-call log
  const lastS = lines.length ? lines[lines.length - 1].s : 0;
  log.attempt = String(Math.min(3, prevLogs + 1));
  log.kind = kind === "B" ? "תיקונים" : "פרויקטים";
  if (status === "voicemail") log.vm = kind === "B" ? "גרסה א (תיקונים)" : "גרסה ב (פרויקטים)";
  if (words >= 4 && status !== "voicemail"){ log.passed20 = lastS >= 20 || words >= 45 ? "כן" : "לא"; if (log.passed20 === "לא") log.cutAt = clip(lines[lines.length - 1].x, 160); }
  const td = his.find(l => SIGNALS.today.test(norm(l.x))); if (td) log.today = clip(td.x, 200);
  if (SIGNALS.demoSent.test(text)) log.demoSent = "כן";
  if (SIGNALS.demoHeard.test(hisText)) log.demoHeard = "כן";
  if (sm.quote) log.quote = sm.quote;
  if (when && ["demo", "callback"].includes(status)) log.nextAt = when;
  if (["notrelevant", "dnc"].includes(status)) log.closed = status === "dnc" ? "ביקש לא להתקשר" : clip((objLines[0] && objLines[0].l.x) || "לא מעוניין", 160);
  return {summary: sm, calc, status, callback: ["demo", "callback"].includes(status) ? when : "", log, why, facts: f, words};
}

// The playbook's engine part: {objKw: [[fragment, [keywords]]], priceWords: [numbers], paul: [phrases]}.
function configure(p = {}){
  OBJ_KW = Array.isArray(p.objKw) ? p.objKw : [];
  PRICE_WORDS = new Set((p.priceWords || []).map(Number));
  PAUL = (p.paul || []).length ? new RegExp(p.paul.map(x => reEsc(norm(x))).join("|")) : null;
}

const Engine = {configure, norm, keyToks, has, parseScript, nicheScript, nicheRe, sameNiche, said, isPaul, findObjection, isBye, facts, whenIn, resolveWhen, agreedWhen, extract, localISO, numbersIn, ntoks};
root.Engine = Engine;
if (typeof module !== "undefined" && module.exports) module.exports = Engine;
})(typeof window !== "undefined" ? window : globalThis);
