"use strict";
// The pop-up tip during a call: one sentence Paul can say back, picked from what the other side just said.
// Free and local, like engine.js: plain rules, no server and no AI service.
// The script drives the big "מה להגיד עכשיו" box, and an objection takes it over. The tip answers what falls outside both:
// a question ("איך זה עובד?"), a detail about the business ("יש לי ספרים"), interest, and the numbers he gave.
// The sentences are sales content, so they live in the database (config "tips", read after login), not in this public file.
// Here is only how a rule is matched:
//   {rules: [{id, when: ["phrase", ...], not: [...], step: "regex on the step's label", say, then}],
//    facts: {both: {A, B}, missed, deal}}
// A phrase matches the way the script's objections do (Engine.has): a short word stands alone, a long one may sit inside a phrase.
// "facts" turns the numbers heard into the sum to say aloud: {missed} calls a week, a job of {deal}, {month} a month.
// Loaded in the page as window.Tips, and in Node by the tests (module.exports).
(function (root){
const E = root.Engine || (typeof require !== "undefined" ? require("./engine.js") : null);
const REPEAT_MS = 90000;   // the same tip does not come back for a minute and a half
const ils = n => "₪" + Math.round(n).toLocaleString("he-IL");

function rules(value){
  const v = value && typeof value === "object" ? value : {};
  const list = (Array.isArray(v.rules) ? v.rules : []).filter(r => r && r.id && r.say).map(r => {
    let stepRe = null; try { stepRe = r.step ? new RegExp(r.step) : null; } catch {}
    return {id: String(r.id), say: String(r.say), then: r.then ? String(r.then) : "", stepRe,
      kws: (r.when || []).map(E.norm).filter(Boolean), nots: (r.not || []).map(E.norm).filter(Boolean)};
  }).filter(r => r.kws.length);
  return {list, facts: v.facts && typeof v.facts === "object" ? v.facts : {}};
}

// The sum, once per new pair of numbers: both known -> the sum; only one known -> the question for the other.
function fromFacts(T, f, seen, kind){
  f = f || {}; const F = T.facts, key = [f.missed || "", f.deal || ""].join("|");
  if (!f.missed && !f.deal || key === seen) return null;
  const both = F.both && (typeof F.both === "string" ? F.both : F.both[kind] || F.both.B || F.both.A);
  const text = f.missed && f.deal ? both : f.missed ? F.missed : F.deal;
  if (!text) return null;
  const month = kind === "B" ? f.deal * 4 : f.deal;
  const fill = s => String(s || "").replace(/\{missed\}/g, f.missed || "").replace(/\{deal\}/g, f.deal ? ils(f.deal) : "").replace(/\{month\}/g, f.deal ? ils(month) : "");
  const heard = [f.missed && `${f.missed} שיחות בשבוע`, f.deal && `עבודה ${ils(f.deal)}`].filter(Boolean).join(" · ");
  return {id: "facts:" + key, key, kw: heard, say: fill(text), then: ""};
}

// ctx: {now, shown: {id: time}, step: the label of the step on screen, facts, factsSeen, kind: "A" | "B"}
function pick(T, text, ctx){
  if (!T || !T.list) return null;
  const now = ctx.now || Date.now(), shown = ctx.shown || {};
  const sum = fromFacts(T, ctx.facts, ctx.factsSeen, ctx.kind);
  if (sum) return sum;
  const t = E.norm(text); if (!t) return null;
  let best = null;
  for (const r of T.list){
    if (now - (shown[r.id] || 0) < REPEAT_MS) continue;
    if (r.stepRe && !r.stepRe.test(ctx.step || "")) continue;
    if (r.nots.some(k => E.has(t, k))) continue;
    for (const k of r.kws) if (E.has(t, k) && (!best || k.length > best.kw.length)) best = {r, kw: k};
  }
  return best ? {id: best.r.id, kw: best.kw, say: best.r.say, then: best.r.then} : null;
}

const Tips = {rules, pick, fromFacts, REPEAT_MS};
root.Tips = Tips;
if (typeof module !== "undefined" && module.exports) module.exports = Tips;
})(typeof window !== "undefined" ? window : globalThis);
