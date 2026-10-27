"use strict";
const CFG = window.APP_CONFIG || {};
const AUTH_HASH = location.hash;  // read before the client consumes the URL
const $ = s => document.querySelector(s);
const app = $("#app");
const EMPTY_DETAIL = $("#detail").innerHTML;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const show = (id) => ["#authView", "#noAccess", "#mainView"].forEach(s => $(s).classList.toggle("hidden", s !== id));
const sb = window.supabase.createClient(CFG.url, CFG.key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});

// ---------- constants ----------
const STATUSES = [["new","לא התקשרתי"],["noanswer","לא ענה"],["voicemail","השארתי הודעה"],["callback","לחזור אליו"],["booked","נקבעה שיחה"],["done","שיחת היכרות בוצעה"],["demo","נקבע דמו"],["won","סגר"],["notrelevant","לא רלוונטי"],["dnc","ביקש לא להתקשר"]];
const SLABEL = Object.fromEntries(STATUSES);
// Every price we quote is before VAT (Israeli VAT, 18% since 2025). Prices follow cold-call-short-v3:
// type B = repairs and service calls (D-028), type A = projects (D-034). Since 27.10 garages, barbers and taxis are type B
// too; car lots, real estate and moving companies stay type A.
const VAT = 0.18;
const ils = n => "₪" + Math.round(n).toLocaleString("he-IL");
const withVat = n => `${ils(n)} פלוס מע"מ (${ils(n * (1 + VAT))} כולל מע"מ)`;
const PRICES = {
  B: {monthly: 790, pilot: 490, text: `סוג ב׳ (D-028): ₪2,490 הקמה ו-₪790 לחודש, פלוס מע"מ. פיילוט ל-5 הראשונים: ₪1,490 הקמה ו-₪490 לחודש, פלוס מע"מ, בתמורה להמלצה מוקלטת.`},
  A: {monthly: 1490, setup: 2990, text: `סוג א׳ (D-034): ₪2,990 הקמה פלוס מע"מ, כולל החודש הראשון. מהחודש השני ₪1,490 לחודש פלוס מע"מ. לקוח מייסד ₪1,190, הרצפה ₪2,490 ו-₪790, פלוס מע"מ.`}};
const kindOf = l => (rec(l.id).summary || {}).calc_type || (/מנעול|חשמל|מוסכ|מספר|מוני/.test(l.niche || "") || /תיקון/.test(l.name || "") ? "B" : "A");
const FORM = [
  ["staff","עובדים / מי עונה לטלפון","text"],["visits","ביקורי מדידה (או קריאות) בשבוע","text"],
  ["close","אחוז סגירה אחרי ביקור","text"],["deal","עסקה ממוצעת (₪)","text"],
  ["sources","מקורות לידים + עלות לליד","area"],["missed","שיחות שלא נענו בשבוע האחרון, ומאיפה הנתון","text"],
  ["calc","חישוב: כמה זה עולה לו בחודש (₪)","text"],
  ["story","סיפור אמיתי על ליד שאבד","area"],["tried","מה ניסה עד היום, וכמה עלה","area"],
  ["calendar","איפה הוא רושם ביקורים","text"],["decider","מי מחליט איתו (לבד / שותף / בת זוג)","text"],
  ["goal","מה הוא רוצה להשיג, במילים שלו","text"],["price","מחיר שהוצג","text"],
  ["reaction","תגובה למחיר","radio",["יקר","סביר","זול","לא הוצג"]],
  ["objection","ההתנגדות העיקרית, במילים שלו","text"],
  ["demo","מחויבות לדמו","radio",["כן, נקבע מועד","\"תשלח לי משהו\"","לא"]],
  ["demoDate","מועד הדמו","datetime"],["quote","ציטוט אחד מילה במילה","area"],
  ["pain","ציון כאב 0–3 (0 = אין בעיה, 3 = מפסיד לידים וכבר ניסה לפתור)","radio",["0","1","2","3"]],
  ["feedback","משוב: מה עבד ומה לא, בתסריט או בעוזר","area"]];
const STAGES = {
  discovery: [["פתיחה",["תופס אותך","זמן טוב","שמי פול","מדבר פול"]],["תיאום ציפיות",["מקובל","המטרה של השיחה","כמה שאלות"]],["היכרות",["כמה זמן אתה","כמה שנים","לבד או עם","באיזה אזור"]],["בירור צרכים",["מי עונה","כמה פניות","ביקורי מדידה","אחוז סגירה","עסקה ממוצעת","משלם על לידים","מידרג"]],["שאלות פער",["פעם האחרונה","לא יכולת לענות","מתחרה","פספסת","לא ענית"]],["מה ניסית",["ניסית","מה היית עושה אחרת"]],["כאב ולמה",["כמה זה עולה לך","חצי שנה","דווקא עכשיו","משפיע עליך"]],["כסף ומי מחליט",["מחליט לבד","עם עוד מישהו","כמה אתה משלם היום"]],["שיקוף",["הבנתי נכון","לוודא שהבנתי"]],["מעבר והצגה",["עוזרת דיגיטלית","יש פה התאמה"]],["וידוא וקביעת דמו",["במילים שלך","דמו","איך אתה ביום","מחר ב"]]],
  sales: [["פתיחה",["תופס אותך","זמן טוב","חצי דקה","מדבר פול"]],["תיאום ציפיות",["מקובל","שתיים שלוש שאלות","שאלות על מה קורה"]],["היכרות וכאב",["כמה זמן אתה","באמצע עבודה","מה קורה עם השיחה","מצא מישהו אחר"]],["חישוב חי",["כמה שיחות בשבוע","כמה הולכות","כמה שווה","בחודש שהולכים"]],["מי מחליט",["מחליט לבד","יש עוד מישהו","אשתך"]],["שיקוף",["הבנתי נכון","שאני אוודא"]],["מה זה אלה",["מזכירה AI","קוראים לה אלה","בשם העסק שלך"]],["4 פרטים ודמו",["20 דקות","4 פרטים","ארבעה פרטים","לינק בוואטסאפ"]],["הצעה וסגירה",["מחיר פיילוט","איך נוח לך לשלם","החודש עליי","המלצה של 30"]]]
};
const MUST = {discovery: ["כאב ולמה","כסף ומי מחליט","שיקוף","וידוא וקביעת דמו"], sales: ["חישוב חי","מי מחליט","שיקוף","4 פרטים ודמו"]};
const OBJ = [
  [["לא מעוניין","לא רלוונטי","תוריד אותי","אל תתקשר"], ["לא מעוניין"]],
  [["אני עסוק","עסוק עכשיו","תחזור אליי","באמצע עבודה","לא יכול לדבר"], ["עסוק"]],
  [["תשלח לי","שלח לי","בוואטסאפ","כמה זה עולה","מה המחיר","כמה עולה"], ["וואטסאפ","כמה זה עולה"]],
  [["מזכירה","אשתי עונה","יש לי מוקד","מוקד","מישהו עונה לי"], ["מזכירה"]],
  [["יקר","הרבה כסף","אין לי תקציב","לא שווה את"], ["יקר"]],
  [["אין לי זמן","אין זמן לזה","אין לי כוח"], ["אין לי זמן"]],
  [["לחשוב על זה","אני אחשוב","צריך לחשוב"], ["לחשוב"]],
  [["להתייעץ","לדבר עם אשתי","עם השותף","השותף שלי"], ["להתייעץ"]],
  // before the robot group, so "יש לי בוט" (he already has one) gets the answer about the system he has, not the one about robots
  [["יש לי מערכת","כבר יש לי","יש לי בוט","יש לי מענה","מענה קולי"], ["כבר יש לי מערכת"]],
  [["רובוט","בוט","מכונה","לא ידברו","מי מבטיח","לא יעבוד"], ["רובוט"]],
  [["ניסיתי","כבר ניסינו","לא עבד לי"], ["ניסיתי"]],
  [["אחרי העונה","לא עכשיו","בעוד חודש","בהמשך","אחרי החגים"], ["לא עכשיו","אחרי העונה"]],
  [["פרטיות","מקליטים","הקלטה"], ["פרטיות"]],
  [["תטעה","טעות"], ["תטעה"]],
  // Facebook leads offer (Ofek, round 8): the blocks live in the sales and short scripts
  [["פייסבוק","תגובות","מסנג'ר","פרטים בפרטי"], ["פייסבוק"]],
  [["קבוצות","בקבוצה","לסרוק"], ["קבוצות"]]];

// ---------- state ----------
let DATA = [], SCRIPTS = {discovery: "", sales: ""}, user = null, isAdmin = false, selId = null, channel = null, readOnly = false;
const byId = {}, timers = new Map(), chains = new Map();
const pendingKeys = new Map();   // lead id -> fields edited since the last save
const inflight = new Map();      // lead id -> saves on their way to the server
const fieldState = new Map();    // lead id -> {field: "saving" | "saved" | "error"}, shown as "נשמר ✓" beside each field
let call = null;           // {id, start, end, stages:Set, objections:Set, timer, trId, trTimer, trChain, indexed}
let live = null;           // {rec, listening, lines:[], interim, lastHit:{}}
let pendingFill = null;
const trCache = {};        // transcript id -> loaded transcript
const blank = () => ({status: "new", attempts: 0, notes: "", callback: "", summary: {}, history: []});
const rec = id => byId[id] || blank();
const trackKind = l => l.track === "ראשית" ? "discovery" : "sales";
const scriptFor = l => l.track === "ראשית" ? SCRIPTS.discovery : SCRIPTS.sales;
const norm = s => String(s).replace(/[״"'׳.,!?]/g, " ").replace(/\s+/g, " ").trim();
const has = (t, k) => k.length <= 4 ? new RegExp("(^| )[והבלמשכ]?" + k + "( |$)").test(t) : t.includes(k);
const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const fmtDT = s => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString("he-IL", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}); };
function setSync(kind, text){ $("#sync").className = "sync " + kind; $("#syncText").textContent = text; }
function telOf(p){ let d = String(p).replace(/\D/g, ""); if (!d) return ""; if (d.startsWith("1800")) return "tel:" + d; if (d.startsWith("972")) d = d.slice(3); else if (d.startsWith("0")) d = d.slice(1); return "tel:+972" + d; }
const phonesOf = l => String(l.phone || "").split(/,\s*/).map(s => s.trim()).filter(Boolean);
// Numbers to dial, in order. The number on the business website always comes before the one listed on Google.
function dialList(l){
  const web = l.webPhones || [];
  const listed = phonesOf(l).map(p => [p, web.length ? "רשום בגוגל" : ""]);
  const all = [...web.map(p => [p, "מספר מהאתר"]), ...listed];
  const seen = new Set(); return all.filter(([p]) => { const d = p.replace(/\D/g, ""); return d && !seen.has(d) && seen.add(d); });
}
const isDue = r => r.status === "callback" && r.callback && new Date(r.callback) <= new Date();

// ---------- auth ----------
function authMsg(text, ok){ const m = $("#authMsg"); m.textContent = text || ""; m.classList.toggle("hidden", !text); m.classList.toggle("ok", !!ok); }
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); authMsg("");
  const {error} = await sb.auth.signInWithPassword({email: $("#loginEmail").value.trim(), password: $("#loginPass").value});
  if (error) authMsg(error.message.includes("Invalid login") ? "המייל או הסיסמה לא נכונים." : error.message.includes("Email not confirmed") ? "צריך קודם לאשר את המייל (נשלח אליך קישור)." : "הכניסה לא הצליחה. נסה שוב.");
});
$("#forgotBtn").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim(); if (!email){ authMsg("כתוב קודם את המייל שלך."); return; }
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
  authMsg(error ? "השליחה לא הצליחה. נסה שוב בעוד דקה." : "אם המייל רשום אצלנו, נשלח אליו קישור לבחירת סיסמה חדשה.", !error);
});
$("#setPassForm").addEventListener("submit", async e => {
  e.preventDefault();
  const {error} = await sb.auth.updateUser({password: $("#newPass").value});
  if (error){ authMsg("הסיסמה לא נשמרה: " + (error.message.includes("weak") ? "היא חלשה מדי." : "נסה שוב.")); return; }
  history.replaceState(null, "", location.pathname);
  const {data} = await sb.auth.getSession(); if (data.session) start(data.session);
});
let loggingOut = false, loginLost = false;
const logout = async () => { loggingOut = true; stopListening(); await sb.auth.signOut(); location.reload(); };
$("#logout").addEventListener("click", logout); $("#logout2").addEventListener("click", logout);
function showLogin(setPass){
  show("#authView"); $("#loginForm").classList.toggle("hidden", !!setPass); $("#setPassForm").classList.toggle("hidden", !setPass);
}

// ---------- data ----------
async function start(session){
  user = session.user;
  const mem = await sb.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (mem.error || !mem.data){ show("#noAccess"); return; }
  isAdmin = mem.data.role === "admin";
  show("#mainView"); $("#whoami").textContent = user.email; $("#importLabel").classList.toggle("hidden", !isAdmin);
  setSync("saving", "טוען…");
  const [cfg, leads, calls] = await Promise.all([
    sb.from("config").select("key,value"),
    sb.from("leads").select("id,data").limit(5000),
    sb.from("calls").select("lead_id,rec").limit(5000)]);
  if (cfg.error || leads.error || calls.error){ setSync("err", "הטעינה נכשלה. רענן את הדף"); return; }
  const scripts = (cfg.data || []).find(r => r.key === "scripts"); if (scripts) SCRIPTS = scripts.value;
  DATA = (leads.data || []).map(r => ({...r.data, id: r.id})).sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const r of calls.data || []) byId[r.lead_id] = r.rec;
  buildFilters(); renderList();
  if (!DATA.length) $("#detail").innerHTML = `<div class="empty"><b>אין עדיין לידים</b>${isAdmin ? "לחץ \"ייבוא נתונים (מנהל)\" ובחר את קובץ הנתונים." : "פול עוד לא ייבא את הלידים."}</div>`;
  else if (DATA.some(l => l.id === selId)) renderDetail();
  else { selId = null; $("#detail").innerHTML = EMPTY_DETAIL; }
  subscribe(); setSync("ok", "מסונכרן");
}
function subscribe(){
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("calls-live").on("postgres_changes", {event: "*", schema: "public", table: "calls"}, payload => {
    const row = payload.new && payload.new.lead_id ? payload.new : null; if (!row) return;
    if (timers.has(row.lead_id) || inflight.get(row.lead_id)) return;   // our own unsaved typing wins locally
    const mine = byId[row.lead_id];                                    // an echo of an older save must not undo newer typing
    if (mine && mine.updated && row.rec && row.rec.updated && mine.updated > row.rec.updated) return;
    byId[row.lead_id] = row.rec; renderList();
    const typing = document.activeElement && $("#detail").contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (summaryOpen) renderLogSummary();
    else if (row.lead_id === selId && !typing && !(live && live.listening)) renderDetail();
  }).subscribe(status => { if (status === "SUBSCRIBED") setSync("ok", "מסונכרן"); else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSync("err", "החיבור החי נפל. רענן את הדף"); });
}
// Every change goes to the server about half a second after the last keystroke, at once when a field loses focus,
// and when the page is hidden or closed. `key` names the field, so its "נשמר ✓" mark can follow the save.
function edit(id, mutate, debounce = 0, key = ""){
  if (readOnly) return;
  const r = structuredClone(rec(id)); r.history = r.history || []; r.summary = r.summary || {}; mutate(r);
  r.updated = new Date().toISOString(); if (r.history.length > 30) r.history = r.history.slice(-30);
  byId[id] = r; clearTimeout(timers.get(id));
  if (key){ if (!pendingKeys.has(id)) pendingKeys.set(id, new Set()); pendingKeys.get(id).add(key); markField(id, key, "saving"); }
  timers.set(id, setTimeout(() => { timers.delete(id); flush(id); }, debounce));
  setSync("saving", "שומר…");
}
function flushNow(id){ if (!timers.has(id)) return; clearTimeout(timers.get(id)); timers.delete(id); flush(id); }
function flushAll(){ for (const id of [...timers.keys()]) flushNow(id); }
const busy = () => timers.size > 0 || [...inflight.values()].some(Boolean);
function flush(id, attempt = 0){
  const body = JSON.parse(JSON.stringify(byId[id])), keys = [...(pendingKeys.get(id) || [])]; pendingKeys.delete(id);
  inflight.set(id, (inflight.get(id) || 0) + 1);
  // The query builder is only "thenable" (no .catch), so it is awaited inside try rather than chained.
  const save = async () => { try { return await sb.from("calls").upsert({lead_id: id, rec: body, updated_at: new Date().toISOString(), updated_by: user.id}); } catch (e){ return {error: e}; } };
  const p = (chains.get(id) || Promise.resolve()).then(async () => {
    let res = await save();
    if (res.error && /jwt|token|401|auth/i.test(String(res.error.message) + res.error.code)){ try { await sb.auth.refreshSession(); } catch {} res = await save(); }
    inflight.set(id, inflight.get(id) - 1);
    if (res.error){
      if (!pendingKeys.has(id)) pendingKeys.set(id, new Set());
      for (const k of keys){ pendingKeys.get(id).add(k); markField(id, k, "error"); }
      setSync("err", "השמירה נכשלה. מנסה שוב…");
      if (!timers.has(id)) timers.set(id, setTimeout(() => { timers.delete(id); flush(id, attempt + 1); }, Math.min(30000, 2000 * 2 ** attempt)));
      return;
    }
    for (const k of keys) markField(id, k, "saved");
    if (!busy()) setSync("ok", "נשמר ומסונכרן");
  });
  chains.set(id, p.catch(() => {}));
}
const FIELD_TEXT = {saving: "שומר…", saved: "נשמר ✓", error: "לא נשמר, מנסה שוב"};
function markField(id, key, state){
  if (!fieldState.has(id)) fieldState.set(id, {});
  fieldState.get(id)[key] = state;
  if (id !== selId) return;
  document.querySelectorAll(`#detail [data-sv="${CSS.escape(key)}"]`).forEach(el => { el.textContent = FIELD_TEXT[state]; el.className = "sv " + state; });
}
const sv = (l, key) => { const s = (fieldState.get(l.id) || {})[key]; return `<span class="sv ${s || ""}" data-sv="${esc(key)}">${s ? FIELD_TEXT[s] : ""}</span>`; };
$("#detail").addEventListener("focusout", () => { if (selId) flushNow(selId); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
addEventListener("pagehide", flushAll);
addEventListener("beforeunload", e => { if (busy()){ flushAll(); e.preventDefault(); e.returnValue = ""; } });

// ---------- list ----------
function buildFilters(){
  $("#fNiche").innerHTML = `<option value="">כל התחומים</option>` + [...new Set(DATA.map(l => l.niche))].map(n => `<option>${esc(n)}</option>`).join("");
  $("#fStatus").innerHTML = `<option value="">כל הסטטוסים</option>` + STATUSES.map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
}
["#q","#fSrc","#fNiche","#fScore","#fStatus","#sort"].forEach(s => $(s).addEventListener("input", renderList));
function rankKey(l){ const r = rec(l.id); let st = {callback: isDue(r) ? 0 : 4, booked: 1, demo: 1, new: 2, noanswer: 3, voicemail: 3, done: 6, won: 7, notrelevant: 8, dnc: 9}[r.status] ?? 5;
  const open = ["new", "noanswer", "voicemail"].includes(r.status);
  if (l.virtual07 && open) st = 4.5;   // a virtual 07 line rarely reaches the owner: call these last
  if (l.noDial && (open || r.status === "callback")) st = 8.5;   // held until a real number is found
  else if (l.priority && open) st = -1; // a hand-picked call list (e.g. "חם-27.10") goes first, in its own order
  return [st, l.priority || 999, l.src === "g" ? 0 : 1, -(l.score || 0), r.attempts || 0, l.order || 0]; }
function cmp(a, b){ for (let i = 0; i < a.length; i++){ if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }
function filtered(){
  const q = $("#q").value.trim().toLowerCase().replace(/-/g, ""), src = $("#fSrc").value, ni = $("#fNiche").value, ms = +$("#fScore").value, fs = $("#fStatus").value;
  const out = DATA.filter(l => { const r = rec(l.id);
    if (src && l.src !== src) return false; if (ni && l.niche !== ni) return false;
    if (ms && !(l.src === "g" && l.score >= ms)) return false; if (fs && r.status !== fs) return false;
    if (q){ const hay = (l.name + " " + l.area + " " + l.phone + " " + (l.webPhones || []).join(" ") + " " + (l.tags || []).join(" ") + " " + l.niche + " " + (l.what || "") + " " + (l.brief?.owner || "")).toLowerCase().replace(/-/g, ""); if (!hay.includes(q)) return false; }
    return true; });
  const s = $("#sort").value;
  if (s === "next") out.sort((a, b) => cmp(rankKey(a), rankKey(b)));
  else if (s === "score") out.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.order || 0) - (b.order || 0));
  else out.sort((a, b) => (rec(b.id).updated || "").localeCompare(rec(a.id).updated || ""));
  return out;
}
function renderStats(){
  const recs = DATA.map(l => [l, rec(l.id)]);
  const touched = recs.filter(([, r]) => r.status !== "new").length;
  const mainDone = recs.filter(([l, r]) => r.status === "done" && l.track === "ראשית");
  const pain = mainDone.filter(([, r]) => +((r.summary || {}).pain) >= 2).length;
  const demo = mainDone.filter(([, r]) => ((r.summary || {}).demo || "").startsWith("כן")).length;
  const due = recs.filter(([, r]) => isDue(r)).length, booked = recs.filter(([, r]) => r.status === "booked").length;
  const demos = recs.filter(([, r]) => r.status === "demo").length, won = recs.filter(([, r]) => r.status === "won").length;
  const stat = (k, v, alert) => `<div class="stat"><span>${k}</span><b class="${alert ? "alert" : ""}">${v}</b></div>`;
  const nLogs = DATA.reduce((a, l) => a + (rec(l.id).logs || []).length, 0), lsBtn = $("#logsSummary"); if (lsBtn) lsBtn.textContent = "סיכום רישומים" + (nLogs ? ` (${nLogs})` : "");
  $("#stats").innerHTML = stat("לידים", DATA.length) + stat("טופלו", touched) + stat("לחזור עכשיו", due, due > 0) + stat("נקבעו שיחות", booked) + stat("דמו", demos) + stat("סגרו", won) + stat("היכרות (ראשית)", mainDone.length + "/10") + stat("כאב 2–3", pain) + stat("קבעו דמו (ראשית)", demo);
  const el = $("#rule"), n = mainDone.length; el.className = "rule";
  if (n < 10) el.textContent = `כלל ההחלטה אחרי 10 שיחות היכרות בנישה הראשית: ממשיכים אם לפחות 6 עם כאב 2–3 וגם לפחות 3 קבעו דמו. עד עכשיו ${n} שיחות, ${pain} עם כאב, ${demo} קבעו דמו.`;
  else if (pain >= 6 && demo >= 3){ el.classList.add("go"); el.textContent = `ממשיכים לנישה: ${pain} מתוך ${n} עם כאב 2–3, ו-${demo} קבעו דמו.`; }
  else if (pain >= 4 && demo < 3){ el.classList.add("pivot"); el.textContent = `צריך לשנות זווית: יש כאב (${pain} מתוך ${n}) אבל רק ${demo} קבעו דמו.`; }
  else if (pain < 4){ el.classList.add("side"); el.textContent = `לעבור לפיילוט הצדדי: רק ${pain} מתוך ${n} עם כאב 2–3.`; }
  else el.textContent = `${pain} מתוך ${n} עם כאב, ${demo} קבעו דמו. תוצאה באמצע: להחליט עם פול.`;
}
function renderList(){
  const items = filtered();
  $("#list").innerHTML = items.length ? items.map(l => { const r = rec(l.id);
    const badge = l.src === "g" ? `<span class="sc s${l.score}" title="ציון התאמה ${l.score}">${l.score}</span>` : `<span class="sc fb" title="פייסבוק">FB</span>`;
    const when = isDue(r) ? ` · <span class="due">לחזור עכשיו</span>` : (["callback", "booked", "demo"].includes(r.status) && r.callback ? ` · ${fmtDT(r.callback)}` : "");
    const tagPills = (l.tags || []).map(t => `<span class="tag">${esc(t)}${l.priority ? " · " + l.priority : ""}</span> `).join("");
    const flags = (l.noDial ? ` · <span class="flag">לא לחייג</span>` : "") + (l.phoneMismatch ? ` · <span class="flag">מספר מהאתר</span>` : "") + (l.virtual07 ? ` · <span class="flag dim">07</span>` : "");
    return `<button type="button" role="listitem" class="row ${l.id === selId ? "sel" : ""}" data-id="${esc(l.id)}">${badge}<span style="min-width:0"><span class="nm">${esc(l.name)}</span><span class="sub">${tagPills}${esc(l.niche)}${l.brief?.owner ? " · " + esc(l.brief.owner) : ""} · ${esc(l.area || "אזור לא ידוע")}${flags}${when}</span></span><span class="pill st-${r.status}">${SLABEL[r.status] || ""}${r.attempts ? ` ×${r.attempts}` : ""}</span></button>`;
  }).join("") : (DATA.length ? `<div class="empty"><b>אין תוצאות</b>נסה לנקות את החיפוש או את הסינון.</div>` : "");
  renderStats();
}
$("#list").addEventListener("click", e => {
  const row = e.target.closest(".row"); if (!row) return;
  if (live && live.listening && row.dataset.id !== selId){ setSync("err", "יש הקשבה פעילה. סיים את השיחה לפני שעוברים לעסק אחר"); return; }
  selId = row.dataset.id; renderList(); renderDetail(); app.classList.add("showdetail");
  $("#detail").scrollTop = 0; if (matchMedia("(max-width:860px)").matches) window.scrollTo(0, 0);
});

// ---------- detail ----------
function mdToHtml(md){
  let html = "", inList = false; const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
  for (const raw of String(md || "").split("\n")){ const line = raw.replace(/\s+$/, ""); const li = line.match(/^\s*(?:[-*]|\d+[א-ת]?\.)\s+(.*)$/);
    if (li){ if (!inList){ html += "<ul>"; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inList){ html += "</ul>"; inList = false; }
    if (line.startsWith("### ")) html += `<h3>${inline(line.slice(4))}</h3>`; else if (line.startsWith("## ")) html += `<h2>${inline(line.slice(3))}</h2>`;
    else if (line.startsWith(">")) html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`;
    else if (line.startsWith("|")){ if (!/^\|[-| ]+\|$/.test(line)) html += `<p>${inline(line.replace(/^\||\|$/g, "").split("|").map(s => s.trim()).join(" · "))}</p>`; }
    else if (line.trim()) html += `<p>${inline(line)}</p>`; }
  return html + (inList ? "</ul>" : "");
}
function objBlocks(l){ const m = String(scriptFor(l) || "").match(/## [^\n]*טיפול בהתנגדויות[^\n]*\n([\s\S]*?)(?=\n## |$)/); if (!m) return [];
  return m[1].split(/\n### /).slice(1).map(p => { const nl = p.indexOf("\n"); return {title: p.slice(0, nl).trim(), body: p.slice(nl + 1)}; }); }
function objPanel(l){ const parts = objBlocks(l); if (!parts.length) return "";
  return `<div class="objs"><div class="objs-h">התנגדות? פתח את התשובה</div>${parts.map((o, i) => `<details class="obj-d" id="obj-${i}"><summary>${esc(o.title)}</summary><div class="md">${mdToHtml(o.body)}</div></details>`).join("")}</div>`; }
const kv = (k, v) => v ? `<div class="kv"><div class="k">${k}</div>${esc(v)}</div>` : "";
function liveHtml(l){
  const on = call && call.id === l.id, listening = on && live && live.listening;
  const kind = trackKind(l), late = on && (Date.now() - call.start) > 4 * 60000;
  const chips = on ? `<div class="stages" id="stageChips">${STAGES[kind].map(([n]) => `<button type="button" class="stagechip ${call.stages.has(n) ? "done" : (late && MUST[kind].includes(n) ? "miss" : "")}" data-stage="${esc(n)}">${call.stages.has(n) ? "✓ " : ""}${esc(n)}</button>`).join("")}</div>` : "";
  return `<section class="callbar ${on ? "on" : ""}" id="callbar">
    <div class="inline">
      ${on ? `<button type="button" class="btn rec" id="callEnd">⏹ סיים שיחה</button><span class="calltime" id="callTime">${fmt(Date.now() - call.start)}</span>
        <button type="button" class="btn sm" id="listenToggle">${listening ? "⏸ עצור הקשבה" : "🎙 הקשב"}</button>
        <span class="mic ${listening ? "on" : ""}" id="mic"><span class="dot"></span>${listening ? "מקשיב" : "לא מקשיב"}</span>
        <span class="recbadge ${call.recording ? "on" : ""}" id="recBadge">${recBadgeText()}</span>`
      : `<button type="button" class="btn primary" id="callStart">🎙 התחל שיחה והקשב</button><button type="button" class="btn sm" id="callManual">▶ מצב שיחה בלי הקשבה</button>
        <span class="note">האייפון על רמקול ליד המחשב, בחדר שקט. השיחה מוקלטת, וההקלטה והתמלול נשמרים בכרטיס. <b>לומר לצד השני שהשיחה מוקלטת.</b></span>`}
    </div>
    ${PAID_ENGINE ? `<label class="sugsw" for="suggestToggle"><input type="checkbox" id="suggestToggle" ${suggestOn ? "checked" : ""}> 💡 הצעות חיות: "מה להגיד עכשיו"<span class="note">כל רבע דקה, הדקה האחרונה נשלחת ל-OpenAI (תמלול) ול-Claude (הצעה). בלי מספרי טלפון.</span></label>` : ""}
    ${call && !on ? `<div class="inline"><span class="note">יש שיחה פתוחה עם ${esc(DATA.find(x => x.id === call.id)?.name || "")}. שיחה חדשה כאן תסגור ותשמור אותה.</span><button type="button" class="btn sm" id="callGoto">חזור אליה</button></div>` : ""}
    ${on ? `<div class="suggest" id="suggestBox" aria-live="polite" hidden></div>` : ""}
    ${chips}
    <div id="liveObj"></div>
    ${on && live ? `<div class="transcript" id="liveTranscript" aria-live="polite"></div>` : ""}
    <div class="msg hidden" id="liveMsg"></div>
  </section>`;
}
function renderDetail(){
  const l = DATA.find(x => x.id === selId); if (!l) return; summaryOpen = false;
  const r = rec(l.id), sm = r.summary || {}, b = l.brief || {};
  const dial = dialList(l).map(([p, lbl], i) => l.noDial
    ? `<span class="dialrow"><span class="call off" aria-disabled="true">${esc(p)}</span><span class="lbl">לא לחייג</span></span>`
    : `<span class="dialrow"><a class="call ${i ? "alt" : ""}" href="${telOf(p)}" aria-label="חיוג ל-${esc(p)}">${esc(p)}</a><button type="button" class="btn sm copy" data-ph="${esc(p)}">העתק</button>${lbl ? `<span class="lbl">${lbl}</span>` : ""}</span>`).join("");
  const phoneNotes = (l.noDial ? `<div class="watch"><b>לא לחייג.</b> ${esc(l.noDialReason || "עד שנמצא מספר אמיתי.")}</div>` : "")
    + (l.phoneMismatch ? `<div class="watch"><b>המספר באתר של העסק שונה מהמספר הרשום בגוגל.</b> להתקשר קודם למספר מהאתר (נבדק ${esc(l.phoneCheckDate || "")}).</div>` : "")
    + (l.phoneCheckNote ? `<div class="note">${esc(l.phoneCheckNote)}</div>` : "")
    + (l.virtual07 ? `<div class="note">המספר הרשום הוא קו 07 וירטואלי. לרוב הוא מגיע למוקד או להפניה, ולא לבעל העסק, ולכן הליד בסוף התור.</div>` : "");
  const trs = (r.calls || []).filter(x => x.tr).slice(-6).reverse(), recs = (r.calls || []).filter(x => x.audio).slice(-6).reverse();
  const links = [l.website && `<a href="${esc(l.website)}" target="_blank" rel="noopener noreferrer">אתר העסק</a>`, l.maps && `<a href="${esc(l.maps)}" target="_blank" rel="noopener noreferrer">גוגל מפס</a>`,
    l.post && `<a href="${esc(l.post)}" target="_blank" rel="noopener noreferrer">הפוסט בפייסבוק</a>`, l.groupUrl && `<a href="${esc(l.groupUrl)}" target="_blank" rel="noopener noreferrer">הקבוצה: ${esc(l.group)}</a>`].filter(Boolean).join("");
  const meta = l.src === "g" ? `ציון התאמה ${esc(l.score)} · ${esc(l.niche)} (נישה ${esc(l.track)}) · ${l.rating ? `גוגל ${esc(l.rating)} מתוך ${esc(l.reviews)} ביקורות` : "בלי דירוג בגוגל"}` : `פייסבוק · נישה ${esc(l.track)} · פורסם ${esc(l.date)}`;
  const li = (k, v) => v ? `<div class="bk"><div class="k">${k}</div><div>${esc(v)}</div></div>` : "";
  const brief = (b.opener || b.gap1) ? `<div class="brief"><h3><span>תדריך 30 שניות · ${l.track === "ראשית" ? "שיחת היכרות" : "שיחת מכירה"}</span>${b.owner ? `<span>לבקש את: ${esc(b.owner)}</span>` : ""}</h3><div class="in">
      ${b.opener ? `<p class="opener">"${esc(b.opener)}"</p>` : ""}${li("היכרות", b.rapport)}
      ${(b.gap1 || b.gap2) ? `<div class="bk"><div class="k">שאלות שחושפות פער</div><ol class="qs">${[b.gap1, b.gap2].filter(Boolean).map(q => `<li>${esc(q)}</li>`).join("")}</ol></div>` : ""}
      ${li("שאלת כאב", b.pain)}${li("משפט מעבר (רק אם עלה כאב)", b.bridge)}
      ${b.obj ? `<div class="bk obj"><div class="k">ההתנגדות הצפויה</div><div><b>"${esc(b.obj)}"</b></div>${b.objReply ? `<div>${esc(b.objReply)}</div>` : ""}</div>` : ""}
      ${b.watch ? `<div class="watch"><b>לשים לב:</b> ${esc(b.watch)}</div>` : ""}</div></div>` : "";
  const hc = l.hotCard;   // a day's call list card: opener detail, hook, likely objection, WhatsApp line
  const hotBox = hc ? `<div class="brief hot"><h3><span>כרטיס ${esc((l.tags || [])[0] || "חם")}</span>${l.priority ? `<span>מקום ${l.priority} בתור</span>` : ""}</h3><div class="in">
      ${li("פרט מהאתר לפתיחה", hc.detail)}${hc.hook ? `<p class="opener">"${esc(hc.hook)}"</p>` : ""}
      ${hc.obj ? `<div class="bk obj"><div class="k">ההתנגדות הצפויה, והתשובה מהתסריט</div><div><b>"${esc(hc.obj)}"</b></div><div>${esc(hc.ans || "")}</div></div>` : ""}
      ${hc.wa ? `<div class="bk"><div class="k">לוואטסאפ, רק אחרי "כן" בשיחה${hc.general ? " · דמו כללי" : ""}</div><div class="inline"><span class="wa">${esc(hc.wa)}</span><button type="button" class="btn sm copy" data-ph="${esc(hc.wa)}">העתק</button></div></div>` : ""}</div></div>` : "";
  const P = PRICES[kindOf(l)];
  const form = FORM.map(([k, label, type, opts]) => { const v = sm[k] ?? (k === "price" ? P.text : ""), mark = sv(l, "s:" + k);
    if (type === "radio") return `<div class="f"><span>${label} ${mark}</span><span class="radios" role="radiogroup" aria-label="${label}">${opts.map((o, i) => `<label for="f-${k}-${i}"><input type="radio" id="f-${k}-${i}" name="f-${k}" value="${esc(o)}" ${v === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}</span></div>`;
    if (type === "area") return `<label class="f" for="f-${k}">${label} ${mark}<textarea id="f-${k}" data-f="${k}">${esc(v)}</textarea></label>`;
    if (type === "datetime") return `<label class="f" for="f-${k}">${label} ${mark}<input type="datetime-local" id="f-${k}" data-f="${k}" value="${esc(v)}"></label>`;
    return `<label class="f" for="f-${k}">${label} ${mark}<input type="text" id="f-${k}" data-f="${k}" value="${esc(v)}"></label>`; }).join("");
  const scriptBoxes = (SCRIPTS.short ? `<details class="script"><summary>התסריט הקצר (גרסה 3), עם מחשבון</summary>${calcHtml(l)}<div class="md">${mdToHtml(SCRIPTS.short)}</div></details>` : "")
    + `<details class="script"><summary>${l.track === "ראשית" ? "תסריט שיחת ההיכרות" : "תסריט שיחת המכירה"} (מלא), עם מחשבון</summary>${calcHtml(l)}<div class="md">${mdToHtml(scriptFor(l))}</div></details>`;
  $("#detail").innerHTML = `
    <button type="button" class="btn sm back" id="back">→ חזרה לרשימה</button>
    <div class="head"><div class="whois"><h2>${esc(l.name)}</h2>${(l.tags || []).length ? `<div class="tags">${l.tags.map(t => `<span class="tag">${esc(t)}${l.priority ? " · מקום " + l.priority + " בתור" : ""}</span>`).join("")}</div>` : ""}<div class="meta">${meta}</div><div class="meta">${esc(l.area || "אזור לא ידוע")}</div><div class="links">${links}</div></div><div class="dial">${dial || '<span class="meta">אין טלפון</span>'}</div></div>
    ${phoneNotes ? `<div class="phonenotes">${phoneNotes}</div>` : ""}
    ${liveHtml(l)}
    ${hotBox}${brief}${objPanel(l)}
    ${l.fit ? `<div class="fit"><b>למה מתאים לאלה:</b> ${esc(l.fit)}</div>` : ""}
    <div class="facts">${kv("מה העסק עושה", l.what)}${kv("ביקור מדידה חינם", l.free)}${kv("הבטחת זמן תגובה", l.resp)}${kv("וואטסאפ באתר", l.wa)}${kv("טופס באתר", l.form)}${kv("בעלים מפעיל", l.owner)}${kv("טלפון נוסף באתר", l.sitePhone)}${kv("הערות מהאיסוף", l.notes)}</div>
    <section class="box"><h3>סטטוס</h3>
      <div class="statuses">${STATUSES.map(([k, v]) => `<button type="button" class="btn sm" data-st="${k}" aria-pressed="${r.status === k}">${v}</button>`).join("")}</div>
      <div class="inline"><label for="f-callback" class="note">לחזור אליו / מועד:</label><input type="datetime-local" id="f-callback" value="${esc(r.callback || "")}">${sv(l, "callback")}<span class="note">ניסיונות: ${r.attempts || 0}</span></div>
      <label for="f-notes" class="note">ההערות שלך ${sv(l, "notes")}</label><textarea id="f-notes" placeholder="מה עלה בשיחה, עם מי דיברת, מתי לחזור">${esc(r.notes || "")}</textarea>
      ${r.status === "dnc" ? `<div class="watch">ביקש לא להתקשר. מחיקה מהרשימות דורשת "מאשר הרמטית".</div>` : ""}
      ${(r.history || []).length ? `<ul class="hist">${r.history.slice(-6).reverse().map(h => `<li>${fmtDT(h.t)}: ${esc(SLABEL[h.s] || h.s)}</li>`).join("")}</ul>` : ""}
    </section>
    <section class="box"><h3>מחשבון: כמה הוא מפסיד בחודש</h3>${calcHtml(l)}</section>
    <section class="box" id="fillBox"><h3>מה היה בשיחה, וסיכום עם Claude</h3>
      <div class="note">כאן כותבים מה היה בשיחה, ונשמר אוטומטית. אחרי שיחה במצב הקשבה, התמלול נכנס לכאן לבד, ונשמר גם ב"תמלולי שיחות". לסיכום: "העתק ל-Claude", מדביקים בצ'אט של Claude, ומעתיקים לכאן את התשובה. שום דבר לא נכנס לטופס לפני שאתה מאשר.</div>
      ${recWarn[l.id] ? `<div class="msg">${esc(recWarn[l.id])}</div>` : ""}
      ${recs.length ? `<div class="trlog"><div class="note">הקלטות שיחה</div>${recs.map(x => recRow(audioMeta(r, x.audio.path))).join("")}</div>` : ""}
      ${trs.length ? `<div class="trlog"><div class="note">תמלולי שיחות</div>${trs.map(x => `<details class="trd" data-tr="${esc(x.tr)}"><summary>${fmtDT(x.at)} · ${call && call.trId === x.tr ? "בשיחה עכשיו" : x.dur ? fmt(x.dur * 1000) + " דקות" : "השיחה נקטעה"}</summary><div class="trbody">טוען…</div></details>`).join("")}</div>` : ""}
      <label for="f-transcript" class="note">מה היה בשיחה / תמלול ${sv(l, "callText")}</label>
      <textarea id="f-transcript" placeholder="מה היה בשיחה, במילים שלך, או התמלול">${esc(r.callText || "")}</textarea>
      <div class="inline"><button type="button" class="btn sm" id="copyPrompt">העתק ל-Claude</button><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">פתח את Claude</a><span class="note" id="fillMsg"></span></div>
      <label for="f-answer" class="note">התשובה של Claude ${sv(l, "claudeAnswer")}</label>
      <textarea id="f-answer" placeholder="הדבק כאן את התשובה של Claude">${esc(r.claudeAnswer || "")}</textarea>
      <div class="inline"><button type="button" class="btn sm" id="parseAnswer">מלא את הטופס מהתשובה</button></div>
      <div id="fillPreview"></div>
    </section>
    <section class="box" id="logBox"><h3>רישום אחרי שיחה</h3>${logHtml(l)}</section>
    <section class="box"><h3>טופס סיכום שיחה</h3>
      <div class="price">${esc(P.text)} את המחיר אומרים רק בסוף, ורק אם עלה כאב ממשי.</div>
      <div class="form">${form}</div>
    </section>
    ${scriptBoxes}`;
  renderTranscript(); renderLiveObj(); renderSuggest();
}
// ---------- post-call log: Ofek's six-line template (round 7) ----------
// Each call is its own dated entry in rec.logs, so a new one never overwrites an earlier one.
// The entry being written lives in rec.logDraft and is saved while typing, like every other field.
// Ofek's letters run opposite to the calculator's (his א = repairs), so the form shows words instead.
const LOG_ROWS = [
  [["attempt", "ניסיון", "radio", ["1", "2", "3"]], ["kind", "סוג", "radio", ["תיקונים", "פרויקטים"]], ["vm", "הודעה בתא הקולי", "radio", ["אין", "גרסה א (תיקונים)", "גרסה ב (פרויקטים)"]]],
  [["passed20", "הפתיחה: עבר 20 שניות?", "radio", ["כן", "לא"]], ["cutAt", "אם לא: באיזה משפט נחתך, ומה אמר", "text"]],
  [["today", "מה קורה היום כשהוא לא עונה (במילים שלו)", "text"], ["missed", "שיחות שמפספס בשבוע", "number"], ["job", "שווי עבודה (רק מה שהוא אמר)", "text"]],
  [["obj", "ההתנגדות הראשונה (במילים שלו)", "text"], ["reply", "מה עניתי", "text"], ["reaction", "איך הגיב", "text"]],
  [["demoSent", "דמו: נשלח?", "radio", ["כן", "לא"]], ["demoHeard", "שמע על הקו?", "radio", ["כן", "לא"]], ["quote", "מה אמר עליה (ציטוט)", "text"]],
  [["nextAt", "הצעד הבא: יום ושעה", "datetime"], ["closed", "או: למה נסגר", "text"], ["change", "מה הייתי משנה בתסריט (משפט אחד)", "text"]]];
const LOG_FIELDS = LOG_ROWS.flat();
let summaryOpen = false;
function logDefaults(l){ const s = rec(l.id).summary || {}; return {kind: kindOf(l) === "B" ? "תיקונים" : "פרויקטים", missed: s.calc_missed || "", job: +s.calc_deal ? ils(+s.calc_deal) : ""}; }
const logDraftOf = l => ({...logDefaults(l), ...(rec(l.id).logDraft || {})});
function logHtml(l){
  const d = logDraftOf(l), logs = (rec(l.id).logs || []).slice().reverse();
  const field = ([k, label, type, opts]) => { const v = d[k] ?? "", mark = sv(l, "log:" + k);
    if (type === "radio") return `<div class="f"><span>${label} ${mark}</span><span class="radios" role="radiogroup" aria-label="${label}">${opts.map((o, i) => `<label for="log-${k}-${i}"><input type="radio" id="log-${k}-${i}" name="log-${k}" value="${esc(o)}" ${v === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}</span></div>`;
    const input = type === "datetime" ? `<input type="datetime-local" id="log-${k}" data-log="${k}" value="${esc(v)}">`
      : type === "number" ? `<input type="number" inputmode="numeric" min="0" id="log-${k}" data-log="${k}" value="${esc(v)}">`
      : `<input type="text" id="log-${k}" data-log="${k}" value="${esc(v)}">`;
    return `<label class="f" for="log-${k}">${label} ${mark}${input}</label>`; };
  const line = x => `${fmtDT(x.at)} · ניסיון ${esc(x.attempt || "?")}${x.kind ? " · " + esc(x.kind) : ""}${x.passed20 ? " · 20 שניות: " + esc(x.passed20) : ""}${x.demoHeard === "כן" ? " · שמע דמו" : ""}${x.nextAt ? " · המשך " + fmtDT(x.nextAt) : x.closed ? " · נסגר" : ""}`;
  return `<div class="note">שש שורות, דקה אחרי כל שיחה. כל שיחה נשמרת כרישום נפרד עם תאריך, והטיוטה נשמרת בזמן שכותבים.</div>
    ${LOG_ROWS.map((row, i) => `<div class="logrow"><span class="lognum">${i + 1}</span><div class="form">${row.map(field).join("")}</div></div>`).join("")}
    ${d.audio ? `<div class="logrow"><span class="lognum">🎧</span><div><div class="note">ההקלטה של השיחה מצורפת לרישום ${sv(l, "audio")}</div>${recRow(audioMeta(rec(l.id), d.audio))}</div></div>` : ""}
    <div class="inline"><button type="button" class="btn sm primary" id="logSave">שמור רישום לשיחה הזו</button>${sv(l, "logSaved")}<span class="note" id="logMsg"></span></div>
    ${logs.length ? `<div class="loglist"><div class="note">רישומים קודמים (${logs.length})</div>${logs.map(x => `<details class="trd"><summary>${line(x)}</summary><div class="trbody">${LOG_FIELDS.filter(([k]) => x[k]).map(([k, label]) => `<div><span class="k">${label}:</span> ${esc(k === "nextAt" ? fmtDT(x[k]) : x[k])}</div>`).join("")}${x.status ? `<div><span class="k">סטטוס בלוח:</span> ${esc(SLABEL[x.status] || x.status)}</div>` : ""}${x.audio ? recRow(audioMeta(rec(l.id), x.audio)) : ""}</div></details>`).join("")}</div>` : ""}`;
}
function saveLog(){
  const l = DATA.find(x => x.id === selId); if (!l) return;
  const d = logDraftOf(l), defs = logDefaults(l);
  if (!LOG_FIELDS.some(([k]) => String(d[k] ?? "").trim() && d[k] !== defs[k])){ $("#logMsg").textContent = "הרישום ריק. ממלאים לפחות שורה אחת."; return; }
  const entry = {id: Date.now().toString(36), at: new Date().toISOString(), by: user.email, status: rec(l.id).status,
    ...Object.fromEntries(LOG_FIELDS.map(([k]) => [k, String(d[k] ?? "").trim()]).filter(([, v]) => v)), ...(d.audio ? {audio: d.audio} : {})};
  edit(l.id, r => { r.logs = [...(r.logs || []), entry].slice(-60); r.logDraft = {}; }, 0, "logSaved");
  renderDetail(); renderStats();
  document.getElementById("logBox")?.scrollIntoView({block: "nearest"});
}
// After ten entries the summary answers Ofek's three questions; before that it shows the counts so far.
const normText = s => String(s || "").replace(/[״"'׳.,!?…]/g, " ").replace(/\s+/g, " ").trim();
function topCounts(items, n = 5){
  const m = new Map();
  for (const t of items){ const k = normText(t); if (!k) continue; const e = m.get(k) || {text: String(t).trim(), n: 0}; e.n++; m.set(k, e); }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, n);
}
function renderLogSummary(){
  summaryOpen = true;
  const logs = DATA.flatMap(l => (rec(l.id).logs || []).map(x => ({...x, lead: l}))), n = logs.length;
  const cut = logs.filter(x => x.passed20 === "לא"), passed = logs.filter(x => x.passed20 === "כן");
  const heard = logs.filter(x => x.demoHeard === "כן"), notHeard = logs.filter(x => x.demoHeard !== "כן");
  const rate = arr => arr.length ? `${arr.filter(x => x.nextAt).length} מתוך ${arr.length} (${Math.round(100 * arr.filter(x => x.nextAt).length / arr.length)}%)` : "אין עדיין";
  const counted = (arr, empty) => arr.length ? `<ol class="qs">${arr.map(x => `<li>${esc(x.text)} <b>×${x.n}</b></li>`).join("")}</ol>` : `<div class="note">${empty}</div>`;
  const changes = logs.filter(x => x.change).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  $("#detail").innerHTML = `
    <button type="button" class="btn sm" id="summaryClose">→ חזרה</button>
    <h2>סיכום רישומים אחרי שיחה</h2>
    <div class="meta">${n} רישומים ב-${new Set(logs.map(x => x.lead.id)).size} לידים${n < 10 ? ` · עוד ${10 - n} רישומים עד סיכום מלא. בינתיים זו ספירה בסיסית.` : ""}</div>
    <div class="facts">${kv("עברו את 20 השניות", `${passed.length} מתוך ${passed.length + cut.length}`)}${kv("קבעו המשך עם יום ושעה", `${logs.filter(x => x.nextAt).length} מתוך ${n}`)}${kv("דמו נשלח", `${logs.filter(x => x.demoSent === "כן").length} מתוך ${n}`)}${kv("הודעה בתא: גרסה א / גרסה ב", `${logs.filter(x => (x.vm || "").startsWith("גרסה א")).length} / ${logs.filter(x => (x.vm || "").startsWith("גרסה ב")).length}`)}</div>
    <section class="box"><h3>איפה מנתקים: המשפט שבו השיחה נחתכה</h3>${counted(topCounts(cut.map(x => x.cutAt)), "עוד אין רישום של שיחה שנחתכה לפני 20 שניות.")}</section>
    <section class="box"><h3>ההתנגדויות שחוזרות</h3>${counted(topCounts(logs.map(x => x.obj)), "עוד אין התנגדויות רשומות.")}</section>
    <section class="box"><h3>מי ששמע את הדמו על הקו, קבע המשך יותר?</h3>
      <div>שמעו על הקו: קבעו המשך ${rate(heard)}.</div><div>לא שמעו: קבעו המשך ${rate(notHeard)}.</div>
      ${n < 10 ? `<div class="note">עם פחות מ-10 רישומים זה עוד לא אומר הרבה.</div>` : ""}</section>
    <section class="box"><h3>מה הייתי משנה בתסריט (האחרונים)</h3>${changes.length ? `<ul class="qs">${changes.map(x => `<li>${esc(x.change)} <span class="note">· ${esc(x.lead.name)}, ${fmtDT(x.at)}</span></li>`).join("")}</ul>` : `<div class="note">עוד אין הצעות.</div>`}</section>`;
}
$("#logsSummary")?.addEventListener("click", () => { renderLogSummary(); app.classList.add("showdetail"); $("#detail").scrollTop = 0; });

// ---------- calculator: missed calls a week × average job × close rate = what he loses a month ----------
// The same inputs appear in the card and inside each script; all copies stay in step and save to the lead's summary.
const WEEKS = 4.33;
function calcNumsOf(s){ const m = +s.calc_missed, d = +s.calc_deal, c = +s.calc_close; return {m, d, c, ok: m > 0 && d > 0 && c > 0, loss: m * WEEKS * (c / 100) * d}; }
const calcNums = l => calcNumsOf(rec(l.id).summary || {});
function calcHtml(l){
  const s = rec(l.id).summary || {}, kind = kindOf(l);
  const inp = (k, label, ph) => `<label class="f">${label} ${sv(l, "s:" + k)}<input type="number" inputmode="decimal" min="0" class="calc-in" data-k="${k}" value="${esc(s[k] ?? "")}" placeholder="${ph}"></label>`;
  return `<div class="calc"><div class="calcgrid">${inp("calc_missed", "שיחות שהוא מפספס בשבוע", "למשל 5")}${inp("calc_deal", "שווי עבודה ממוצעת (₪)", "למשל 450")}${inp("calc_close", "אחוז סגירה (%)", "למשל 30")}
    <label class="f">סוג העסק ${sv(l, "s:calc_type")}<select class="calc-in" data-k="calc_type"><option value="B" ${kind === "B" ? "selected" : ""}>ב׳: תיקון או קריאת שירות</option><option value="A" ${kind === "A" ? "selected" : ""}>א׳: פרויקט</option></select></label></div>
    <div class="calcout">${calcOut(l)}</div></div>`;
}
function calcOut(l){
  const {m, d, c, ok, loss} = calcNums(l), kind = kindOf(l), P = PRICES[kind];
  const price = kind === "B" ? `${withVat(P.monthly)} לחודש. בפיילוט: ${withVat(P.pilot)}` : `${withVat(P.monthly)} לחודש, מהחודש השני. ההקמה ${ils(P.setup)} פלוס מע"מ, כולל החודש הראשון`;
  if (!ok) return `<div class="note">ממלאים את שלושת המספרים בזמן השיחה, והחשבון מופיע כאן. מחיר אלה: ${esc(price)}.</div>`;
  const ratio = loss / (P.monthly * (1 + VAT));
  return `<div class="loss"><b>הוא מפסיד בערך ${ils(loss)} בחודש</b> <span class="note">(${m} שיחות בשבוע × ${WEEKS} שבועות × ${c}% סגירה × ${ils(d)})</span></div>
    <div>מחיר אלה: ${esc(price)}. ${ratio >= 1 ? `ההפסד שלו גדול פי ${ratio.toFixed(1)} מהמחיר החודשי, כולל מע"מ.` : "ההפסד שלו קטן מהמחיר החודשי. לפי התסריט אומרים את זה ביושר: אצלו זה פחות בוער."}</div>
    <div class="say">לשיחה: "אז גם אם רק ${c}% מהשיחות האלה היו הופכות לעבודה, זה ${ils(loss)} בחודש שהולכים למתחרה. נכון?"</div>`;
}
function refreshCalc(l, except){
  const s = rec(l.id).summary || {};
  document.querySelectorAll("#detail .calc-in").forEach(el => { if (el !== except && s[el.dataset.k] !== undefined) el.value = s[el.dataset.k]; });
  document.querySelectorAll("#detail .calcout").forEach(o => o.innerHTML = calcOut(l));
  const f = $("#f-calc"); if (f && f !== document.activeElement) f.value = s.calc || "";
}
$("#detail").addEventListener("click", async e => {
  const t = e.target;
  if (t.closest("#back")){ app.classList.remove("showdetail"); return; }
  const st = t.closest("[data-st]");
  if (st && selId){ const s = st.dataset.st; edit(selId, r => { if (s === "noanswer" || s === "voicemail") r.attempts = (r.attempts || 0) + 1; r.status = s; r.history.push({t: new Date().toISOString(), s}); }); renderList(); renderDetail(); return; }
  if (t.closest("#callStart")){ startCall(true); return; }
  if (t.closest("#callManual")){ startCall(false); return; }
  if (t.closest("#callEnd")){ endCall(); return; }
  const pl = t.closest("[data-play]");
  if (pl){ const au = pl.parentElement.querySelector("audio"), url = await signedUrl(pl.dataset.play); if (!url){ pl.textContent = "לא נמצא"; return; } au.hidden = false; au.src = url; au.play().catch(() => {}); return; }
  const dl = t.closest("[data-dl]");
  if (dl){ const url = await signedUrl(dl.dataset.dl, true); if (!url){ dl.textContent = "לא נמצא"; return; } const a = document.createElement("a"); a.href = url; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); return; }
  const stt = t.closest("[data-stt]");
  if (stt && selId && !stt.disabled){ transcribeRecording(selId, stt); return; }
  if (t.closest("#logSave")){ saveLog(); return; }
  if (t.closest("#summaryClose")){ summaryOpen = false; if (selId) renderDetail(); else $("#detail").innerHTML = EMPTY_DETAIL; app.classList.toggle("showdetail", !!selId); return; }
  if (t.closest("#callGoto") && call){ selId = call.id; renderList(); renderDetail(); return; }
  const tf = t.closest("[data-trfill]");
  if (tf && trCache[tf.dataset.trfill]){
    const text = trText(trCache[tf.dataset.trfill]); edit(selId, r => { r.callText = text; }, 0, "callText");
    const ta = $("#f-transcript"); if (ta) ta.value = text;
    $("#fillBox")?.scrollIntoView({behavior: "smooth", block: "start"}); return;
  }
  if (t.closest("#listenToggle")){ live && live.listening ? stopListening() : startListening(); renderDetail(); return; }
  const sc = t.closest("[data-stage]"); if (sc && call){ const n = sc.dataset.stage; call.stages.has(n) ? call.stages.delete(n) : call.stages.add(n); refreshChips(); return; }
  if (t.closest("#objClose")){ $("#liveObj").innerHTML = ""; return; }
  if (t.closest("#copyPrompt")){ copyPrompt(); return; }
  if (t.closest("#parseAnswer")){ parseAnswer(); return; }
  if (t.closest("#fillApply")){ applyFill(); return; }
  if (t.closest("#fillCancel")){ pendingFill = null; $("#fillPreview").innerHTML = ""; return; }
  const cp = t.closest(".copy");
  if (cp){ const done = ok => { cp.textContent = ok ? "הועתק" : "סמן והעתק"; setTimeout(() => cp.textContent = "העתק", 1600); };
    try { await navigator.clipboard.writeText(cp.dataset.ph); done(true); } catch { done(false); } }
});
$("#detail").addEventListener("input", e => {
  const t = e.target; if (!selId) return;
  if (t.id === "suggestToggle") setSuggest(t.checked);
  else if (t.id === "f-transcript") edit(selId, r => { r.callText = t.value; }, 600, "callText");
  else if (t.id === "f-answer") edit(selId, r => { r.claudeAnswer = t.value; }, 600, "claudeAnswer");
  else if (t.id === "f-notes") edit(selId, r => { r.notes = t.value; }, 600, "notes");
  else if (t.id === "f-callback"){ edit(selId, r => { r.callback = t.value; }, 0, "callback"); renderList(); }
  else if (t.classList.contains("calc-in")){
    const l = DATA.find(x => x.id === selId), k = t.dataset.k;
    edit(selId, r => { r.summary[k] = t.value; const n = calcNumsOf(r.summary); if (n.ok) r.summary.calc = `${ils(n.loss)} בחודש (${n.m} שיחות בשבוע × ${n.c}% סגירה × ${ils(n.d)})`; }, k === "calc_type" ? 0 : 600, "s:" + k);
    if (l) refreshCalc(l, t);
  }
  else if (t.dataset.log) edit(selId, r => { r.logDraft = {...(r.logDraft || {}), [t.dataset.log]: t.value}; }, 600, "log:" + t.dataset.log);
  else if (t.type === "radio" && t.name.startsWith("log-")) edit(selId, r => { r.logDraft = {...(r.logDraft || {}), [t.name.slice(4)]: t.value}; }, 0, "log:" + t.name.slice(4));
  else if (t.dataset.f) edit(selId, r => { r.summary = {...(r.summary || {}), [t.dataset.f]: t.value}; }, 600, "s:" + t.dataset.f);
  else if (t.type === "radio" && t.name.startsWith("f-")){ edit(selId, r => { r.summary = {...(r.summary || {}), [t.name.slice(2)]: t.value}; }, 0, "s:" + t.name.slice(2)); renderStats(); }
});

// ---------- live call: timer, stages, listening ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function liveMsg(text){ const m = $("#liveMsg"); if (!m) return; m.textContent = text || ""; m.classList.toggle("hidden", !text); }
function startCall(listen){
  if (call) endCall();                        // a call left open on another lead is closed and saved first
  const now = Date.now();
  call = {id: selId, start: now, stages: new Set(), objections: new Set(), trId: selId + "__" + now,
    timer: setInterval(() => { const el = $("#callTime"); if (el && call) el.textContent = fmt(Date.now() - call.start); if (call && (Date.now() - call.start) > 4 * 60000) refreshChips(); }, 1000)};
  live = {listening: false, lines: [], interim: "", lastHit: {}, rec: null};
  renderDetail(); if (listen){ startListening(); startRecording(call); }
}
function endCall(){
  const c = call; if (!c) return; stopListening(); const chP = stopChunks(c), recP = stopRecording(c);
  if (live && live.interim){ live.lines.push({t: Date.now(), text: live.interim}); live.interim = ""; }
  const lines = live ? live.lines : [];
  c.end = Date.now(); clearInterval(c.timer); clearTimeout(c.trTimer); call = null; live = null;
  const keep = (lines.length > 0 || !!c.chunks) && !readOnly;
  const entry = {at: new Date(c.end).toISOString(), dur: Math.round((c.end - c.start) / 1000), stages: [...c.stages], objections: [...c.objections], ...(keep ? {tr: c.trId} : {})};
  const d = keep ? trDoc(c, lines, "final") : null; if (d) trCache[c.trId] = d;
  c.chromeText = d && lines.length ? trText(d) : "";
  edit(c.id, r => { const i = (r.calls || []).findIndex(x => x.tr && x.tr === c.trId);
    r.calls = i >= 0 ? r.calls.map((x, j) => j === i ? entry : x) : [...(r.calls || []), entry].slice(-20);
    if (c.chromeText) r.callText = c.chromeText; }, 0, c.chromeText ? "callText" : "");
  c.entryAt = entry.at; recP.then(blob => { if (blob) uploadRecording(c, blob); });
  chP.then(ch => { if (ch) finishChunks(c, ch); });
  if (keep && lines.length) saveTr(c, lines, "final").then(ok => { if (!ok) setSync("err", "התמלול לא נשמר בטבלת התמלולים. הוא שמור בכרטיס, בתיבה \"מה היה בשיחה\""); });
  if (c.id !== selId) return;
  renderDetail(); document.getElementById("fillBox")?.scrollIntoView({behavior: "smooth", block: "start"});
}
addEventListener("pagehide", () => stopListening());   // never leave the microphone listening behind a closed page

// ---------- call recording ----------
// While listening, a MediaRecorder keeps the call's audio as well. At the end of the call the file goes to the private
// "recordings" bucket, in a folder per lead, and its path is kept on the call entry and on the post-call log draft.
// If the upload fails, the file is downloaded to this computer instead, so a recording is never lost.
const REC_TEXT = {starting: "מתחיל להקליט…", on: "● מקליט · לומר לצד השני שהשיחה מוקלטת", denied: "ההקלטה לא פועלת: Chrome לא קיבל גישה למיקרופון", unsupported: "הדפדפן הזה לא מקליט. פותחים ב-Chrome"};
const recWarn = {};   // lead id -> why the last recording is on this computer and not on the server
const recBadgeText = () => call ? (REC_TEXT[call.recording ? "on" : call.recState] || "") : "";
function renderRecBadge(){ const b = $("#recBadge"); if (b && call){ b.textContent = recBadgeText(); b.classList.toggle("on", !!call.recording); } }
async function startRecording(c){
  if (!c) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){ c.recState = "unsupported"; renderRecBadge(); return; }
  c.recState = "starting"; renderRecBadge();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: true}}); }
  catch { c.recState = "denied"; renderRecBadge(); return; }
  if (call !== c){ stream.getTracks().forEach(t => t.stop()); return; }   // the call ended while Chrome was asking
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t)) || "";
  const mr = new MediaRecorder(stream, {...(mime ? {mimeType: mime} : {}), audioBitsPerSecond: 32000});   // about 1.2 MB for 5 minutes
  const chunks = []; mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.start(1000);
  c.recording = {mr, stream, chunks, mime: mr.mimeType || mime || "audio/webm"}; c.recState = "on"; renderRecBadge();
  startChunks(c);
}
function stopRecording(c){
  const r = c && c.recording; if (!r) return Promise.resolve(null);
  c.recording = null;
  return new Promise(res => {
    const done = () => { r.stream.getTracks().forEach(t => t.stop()); res(r.chunks.length ? new Blob(r.chunks, {type: r.mime}) : null); };
    if (r.mr.state === "inactive") done(); else { r.mr.onstop = done; try { r.mr.stop(); } catch { done(); } }
  });
}
function downloadBlob(blob, name){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function uploadRecording(c, blob){
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const stamp = new Date(c.start).toISOString().replace(/[:.]/g, "-"), path = `${c.id}/${stamp}.${ext}`;
  const audio = {path, bytes: blob.size, type: blob.type, dur: Math.round((c.end - c.start) / 1000), at: new Date(c.start).toISOString()};
  setSync("saving", "מעלה את ההקלטה…");
  let error = null;
  try { ({error} = await sb.storage.from("recordings").upload(path, blob, {contentType: blob.type, upsert: false})); } catch (e){ error = e; }
  if (error){
    const name = (DATA.find(x => x.id === c.id)?.name || "שיחה").replace(/[\\/:*?"<>|]/g, " ").slice(0, 40);
    downloadBlob(blob, `${name} ${stamp}.${ext}`);
    recWarn[c.id] = `ההקלטה של השיחה מ-${fmtDT(audio.at)} לא נשמרה בשרת, ולכן הורדה למחשב (תיקיית ההורדות): ${name} ${stamp}.${ext}`;
    (chains.get(c.id) || Promise.resolve()).then(() => setSync("err", "ההקלטה לא נשמרה בשרת, ולכן הורדה למחשב"));
    if (c.id === selId && !summaryOpen) renderDetail(); return;
  }
  edit(c.id, r => { r.calls = (r.calls || []).map(x => x.at === c.entryAt ? {...x, audio} : x); r.logDraft = {...(r.logDraft || {}), audio: path}; }, 0, "audio");
  if (c.id === selId && !summaryOpen) renderDetail();
}
// A recording's accurate transcript: "atr" points to its row in "transcripts". A call whose transcript was made live
// (the suggestions switch was on) already has one, so its row offers no button.
const audioMeta = (r, path) => { const x = (r.calls || []).find(x => x.audio && x.audio.path === path); return x ? {...x.audio, liveAudio: !!x.liveAudio} : {path}; };
const recRow = a => `<div class="recrow"><span>${a.at ? fmtDT(a.at) : "הקלטה"}${a.dur ? " · " + fmt(a.dur * 1000) : ""}</span><button type="button" class="btn sm" data-play="${esc(a.path)}">▶ נגן</button><button type="button" class="btn sm" data-dl="${esc(a.path)}">הורד</button>`
  + (a.atr ? "" : a.liveAudio ? `<span class="note">תומלל בזמן השיחה ✓</span>` : PAID_ENGINE ? `<button type="button" class="btn sm" data-stt="${esc(a.path)}">תמלל מההקלטה</button>` : "")
  + `<audio controls preload="none" hidden></audio>`
  + (a.atr ? `<details class="trd" data-tr="${esc(a.atr)}"><summary>תומלל ✓ · תמלול מדויק מההקלטה</summary><div class="trbody">טוען…</div></details>` : "") + `</div>`;
async function signedUrl(path, download){
  try { const {data, error} = await sb.storage.from("recordings").createSignedUrl(path, 3600, download ? {download: path.split("/").pop()} : undefined); return error ? null : data.signedUrl; } catch { return null; }
}

// ---------- transcripts ----------
// One row per call in "transcripts", apart from the lead records, so the live list stays small.
// During a call the transcript is saved every 15 seconds; the lead's call log points to it, so a call cut off by a reload is still found.
function trDoc(c, lines, status){
  const l = DATA.find(x => x.id === c.id) || {};
  const d = {lead: c.id, name: l.name || "", niche: l.niche || "", at: new Date(c.start).toISOString(), dur: Math.round(((c.end || Date.now()) - c.start) / 1000), status,
    stages: STAGES[trackKind(l)].map(([n]) => n).filter(n => c.stages.has(n)), objections: [...c.objections],
    lines: lines.map(x => ({s: Math.round((x.t - c.start) / 1000), x: x.text})), ...chunkDoc(c)};
  while (d.lines.length > 1 && JSON.stringify(d).length > 400000){ d.lines.shift(); d.trimmed = true; }
  return d;
}
// The accurate transcript from the recording (OpenAI) wins over Chrome's live text when the call has one.
const trLine = x => x.s == null ? x.x : `[${fmt(x.s * 1000)}] ${x.x}`;
function trText(d){
  const accurate = (d.audio || []).length ? d.audio : d.source === "audio" ? d.lines : null;
  return [`שיחה עם: ${d.name}${d.niche ? " (" + d.niche + ")" : ""}`,
    `תאריך: ${d.at ? new Date(d.at).toLocaleString("he-IL") : "לא ידוע"} · משך: ${fmt((d.dur || 0) * 1000)}`,
    `שלבים שזוהו: ${(d.stages || []).join(", ") || "אין"}`,
    `התנגדויות שעלו: ${(d.objections || []).join(", ") || "אין"}`,
    "", accurate ? "תמלול מדויק מההקלטה (ערוץ אחד, בלי הפרדה בין הדוברים):" : "תמלול (ערוץ אחד, בלי הפרדה בין הדוברים):",
    ...(accurate || d.lines || []).map(trLine)].join("\n");
}
function queueTrSave(){
  const c = call; if (!c || readOnly || c.trTimer) return;
  c.trTimer = setTimeout(() => { c.trTimer = null; if (call === c && live) saveTr(c, live.lines, "live"); }, 15000);
}
function saveTr(c, lines, status){
  if (readOnly || !lines.length) return Promise.resolve(false);
  const doc = trDoc(c, lines, status);
  c.trChain = (c.trChain || Promise.resolve(true)).then(async () => {
    const {error} = await sb.from("transcripts").upsert({id: c.trId, lead_id: c.id, data: doc, updated_at: new Date().toISOString(), updated_by: user.id});
    if (error) return false;
    if (status === "live" && !c.indexed && call === c){ c.indexed = true;
      edit(c.id, r => { r.calls = [...(r.calls || []), {at: new Date(c.start).toISOString(), dur: 0, stages: [], tr: c.trId}].slice(-20); }); }
    return true;
  }).catch(() => false);
  return c.trChain;
}
$("#detail").addEventListener("toggle", async e => {
  const d = e.target; if (!d.matches?.(".trd[data-tr]") || !d.open) return;   // the post-call log's entries are .trd too, with nothing to load
  const id = d.dataset.tr, body = d.querySelector(".trbody");
  const row = x => `<div class="trline">${x.s == null ? "" : `<span class="ts">${fmt(x.s * 1000)}</span>`}${esc(x.x)}</div>`;
  const showTr = t => { const accurate = (t.audio || []).length;
    body.innerHTML = (accurate ? `<div class="note">תמלול מדויק מההקלטה</div>` + t.audio.map(row).join("") : (t.lines || []).map(row).join(""))
    + ((t.sugg || []).length ? `<div class="note">הצעות "מה להגיד עכשיו" שהופיעו בשיחה</div>` + t.sugg.map(x => `<div class="trline"><span class="ts">${fmt(x.s * 1000)}</span>${x.tag ? `<span class="sgtag">${esc(x.tag)}</span>` : ""}${esc(x.say)}</div>`).join("") : "")
    + `<div class="inline"><button type="button" class="btn sm" data-trfill="${esc(id)}">העבר ל"סיכום עם Claude"</button></div>`; };
  if (trCache[id] && !(call && call.trId === id)){ showTr(trCache[id]); return; }
  const {data, error} = await sb.from("transcripts").select("data").eq("id", id).maybeSingle();
  if (error){ body.textContent = "טעינת התמלול נכשלה. סגור ופתח שוב."; return; }
  if (!data){ body.textContent = "התמלול לא נמצא בשרת."; return; }
  trCache[id] = data.data; showTr(trCache[id]);
}, true);
function startListening(){
  if (!SR){ liveMsg("הדפדפן הזה לא תומך בתמלול. פתח את האתר ב-Google Chrome."); return; }
  if (!live) return; live.listening = true;
  const r = new SR(); r.lang = "he-IL"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1; live.rec = r;
  r.onresult = ev => { if (!live) return; live.interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++){ const res = ev.results[i], txt = res[0].transcript.trim(); if (!txt) continue;
      if (res.isFinal){ live.lines.push({t: Date.now(), text: txt}); detect(txt); queueTrSave(); } else live.interim += (live.interim ? " " : "") + txt; }
    if (live.interim) detect(live.interim); renderTranscript(); };
  r.onerror = ev => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed"){ liveMsg("Chrome לא קיבל גישה למיקרופון. לחץ על סמל המנעול ליד הכתובת ואשר מיקרופון."); stopListening(); renderDetail(); }
    else if (ev.error === "audio-capture"){ liveMsg("לא נמצא מיקרופון."); stopListening(); renderDetail(); }
    else if (ev.error === "network") liveMsg("אין חיבור לשירות התמלול. מנסה שוב…"); };
  r.onend = () => { if (live && live.listening) setTimeout(() => { try { r.start(); } catch {} }, 250); };
  try { r.start(); } catch {}
}
function stopListening(){ if (!live) return; live.listening = false; try { live.rec && live.rec.stop(); } catch {} }
function detect(text){
  const l = call && DATA.find(x => x.id === call.id); if (!l) return; const t = norm(text);
  for (const [n, kws] of STAGES[trackKind(l)]) if (!call.stages.has(n) && kws.some(k => has(t, k))){ call.stages.add(n); refreshChips(); }
  const blocks = objBlocks(l);
  for (const [kws, frags] of OBJ){ const kw = kws.find(k => has(t, k)); if (!kw) continue;
    const o = blocks.find(b => frags.some(f => b.title.includes(f))); if (!o) continue;
    if (live.lastHit[o.title] && Date.now() - live.lastHit[o.title] < 25000) continue;
    live.lastHit[o.title] = Date.now(); call.objections.add(o.title); live.current = {o, kw}; renderLiveObj(); break; }
}
function renderLiveObj(){ const box = $("#liveObj"); if (!box) return; const c = live && live.current; if (!c || !call){ box.innerHTML = ""; return; }
  box.innerHTML = `<div class="objlive"><div class="t"><span>${esc(c.o.title)}</span><button type="button" class="btn sm" id="objClose" aria-label="סגור">✕</button></div><div class="heard">שמעתי: "${esc(c.kw)}"</div><div class="md">${mdToHtml(c.o.body)}</div></div>`; }
function refreshChips(){ const l = DATA.find(x => x.id === selId); const box = $("#stageChips"); if (!l || !box || !call) return;
  const kind = trackKind(l), late = (Date.now() - call.start) > 4 * 60000;
  box.querySelectorAll(".stagechip").forEach(b => { const n = b.dataset.stage, d = call.stages.has(n); b.classList.toggle("done", d); b.classList.toggle("miss", !d && late && MUST[kind].includes(n)); b.textContent = (d ? "✓ " : "") + n; }); }
function renderTranscript(){ const box = $("#liveTranscript"); if (!box || !live) return;
  box.innerHTML = live.lines.slice(-40).map(x => `<div><span class="ts">${fmt(x.t - (call ? call.start : x.t))}</span>${esc(x.text)}</div>`).join("") + (live.interim ? `<div class="interim">${esc(live.interim)}</div>` : "");
  box.scrollTop = box.scrollHeight; }

// ---------- "what to say now" and accurate transcripts (server functions "live" and "transcribe") ----------
// With the switch on, a recorded call is also cut into separate 15-second files. Each goes to "live", which transcribes it
// (OpenAI) and sends the last minute to Claude for one line to say now. A silent stretch is not sent, a suggestion is asked
// only when the previous answer is back, and one that arrives more than 10 seconds late is dropped. The pieces together are
// the call's accurate transcript. The switch is off by default and remembered on this computer. The keys live only on the server.
// Off since 27.10: Paul decided everything must be free, and these two functions run on paid engines (OpenAI, Claude).
// While off, the switch and the "transcribe the recording" button are not shown and nothing is sent. The code stays for
// a free engine (Whisper on the Mac, see transcription-plan.md).
const PAID_ENGINE = false;
const CHUNK_MS = 15000, LATE_MS = 10000, QUIET_RMS = 0.004;
let suggestOn = PAID_ENGINE && (() => { try { return localStorage.getItem("liveSuggest") === "1"; } catch { return false; } })();
const KEY_TEXT = {OPENAI_API_KEY: "המפתח של OpenAI עוד לא הודבק בשרת, ולכן אין תמלול מדויק", ANTHROPIC_API_KEY: "המפתח של Anthropic עוד לא הודבק בשרת, ולכן אין הצעות"};
// The functions check that the login is still alive on the server (the database only checks the token), so a login
// ended elsewhere, for example by a password change, shows up here first.
const RELOGIN = "הכניסה ללוח פגה בשרת. צריך לרענן את הדף ולהתחבר מחדש.";
async function callFn(name, body, ms){
  const {data} = await sb.auth.getSession(), token = data.session && data.session.access_token;
  if (!token) return {error: "auth"};
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms), form = body instanceof FormData;
  try {
    const res = await fetch(`${CFG.url}/functions/v1/${name}`, {method: "POST", signal: ctl.signal, body: form ? body : JSON.stringify(body),
      headers: {Authorization: "Bearer " + token, apikey: CFG.key, ...(form ? {} : {"Content-Type": "application/json"})}});
    const out = await res.json().catch(() => ({}));
    return res.ok ? out : {...out, error: out.error || "http_" + res.status};
  } catch (e){ return {error: e && e.name === "AbortError" ? "timeout" : "network"}; }
  finally { clearTimeout(timer); }
}
function setSuggest(on){
  suggestOn = on; try { localStorage.setItem("liveSuggest", on ? "1" : "0"); } catch {}
  if (call){ if (on) startChunks(call); else stopChunks(call); }
  renderSuggest();
}
function startChunks(c){
  if (!PAID_ENGINE || !suggestOn || !c || !c.recording || readOnly || call !== c) return;
  let ch = c.chunks; if (ch && !ch.stopped) return;
  if (!ch) ch = c.chunks = {texts: [], items: [], pending: new Set(), busy: false, mode: "audio", msg: ""};
  const r = c.recording; ch.stopped = false; ch.peak = 1;
  try {   // a level meter, so a silent stretch is not sent (and not billed)
    const ac = new AudioContext(), an = ac.createAnalyser(), buf = new Float32Array(1024); an.fftSize = 1024;
    ac.createMediaStreamSource(r.stream).connect(an); ch.ac = ac; ch.peak = 0;
    ac.resume().catch(() => {});
    ch.meter = setInterval(() => { if (ac.state !== "running"){ ch.peak = 1; return; }   // a meter Chrome would not start must not silence the call
      an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; ch.peak = Math.max(ch.peak, Math.sqrt(s / buf.length)); }, 250);
  } catch {}
  const next = () => {
    if (call !== c || c.chunks !== ch || ch.stopped || !c.recording) return;
    const parts = [], t0 = Date.now(), mr = new MediaRecorder(r.stream, {mimeType: r.mime, audioBitsPerSecond: 32000});
    mr.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    mr.onstop = () => { const loud = ch.peak, last = ch.stopped; ch.peak = ch.ac ? 0 : 1; if (!last) next();
      if (parts.length && loud >= QUIET_RMS) sendChunk(c, ch, new Blob(parts, {type: r.mime}), t0, last); };
    ch.mr = mr; mr.start(); ch.timer = setTimeout(() => { try { mr.stop(); } catch {} }, CHUNK_MS);
  };
  next(); renderSuggest();
}
// Stops cutting pieces; the last few seconds still go out (transcribed, no suggestion). Resolves once every answer is back.
function stopChunks(c){
  const ch = c && c.chunks; if (!ch || ch.stopped) return Promise.resolve(ch || null);
  ch.stopped = true; clearTimeout(ch.timer); clearInterval(ch.meter);
  const stopped = new Promise(res => { const mr = ch.mr; if (!mr || mr.state === "inactive") return res();
    const done = mr.onstop; mr.onstop = () => { done && done(); res(); }; try { mr.stop(); } catch { res(); } });
  return stopped.then(() => { try { ch.ac && ch.ac.close(); } catch {} ch.ac = null; return Promise.allSettled([...ch.pending]); }).then(() => ch);
}
async function sendChunk(c, ch, blob, t0, final){
  const l = DATA.find(x => x.id === c.id) || {}, mode = ch.mode, sent = Date.now();
  const prev = ch.texts.filter(x => x.t < t0 && x.t >= t0 - 46000).sort((a, b) => a.t - b.t).map(x => x.text).join(" ");
  const fd = new FormData(); fd.append("lead", c.id); fd.append("kind", kindOf(l)); fd.append("prev", prev);
  const asking = !final && !ch.busy;
  if (!asking) fd.append(final ? "final" : "nosuggest", "1");
  if (mode === "text"){   // no OpenAI key: Claude gets Chrome's live text of the last minute instead
    const lines = (live && live.lines || []).filter(x => x.t >= sent - 60000), last = lines.length ? lines[lines.length - 1].t : 0;
    if (!asking || last <= (ch.lastText || 0)) return;
    ch.lastText = last; fd.append("text", lines.map(x => x.text).join(" "));
  } else fd.append("audio", blob, "chunk." + (blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"));
  if (asking) ch.busy = true;
  const p = callFn("live", fd, 25000); ch.pending.add(p);
  const res = await p; ch.pending.delete(p); if (asking) ch.busy = false;
  if (mode === "audio" && res.text) ch.texts.push({t: t0, text: res.text});
  if (res.error === "missing_key"){ if (res.key === "OPENAI_API_KEY") ch.mode = "text"; ch.msg = KEY_TEXT[res.key] + (res.key === "OPENAI_API_KEY" ? ". ההצעות יעבדו מהתמלול של Chrome." : "."); }
  else if (res.error === "auth" || res.error === "not_member") ch.msg = RELOGIN;
  else if (res.error && !final) ch.msg = "השרת לא ענה הפעם. ממשיך לנסות כל רבע דקה.";
  else if (!res.error) ch.msg = "";
  if (res.say && !final && Date.now() - sent <= LATE_MS) ch.items.push({t: sent, s: Math.round((sent - c.start) / 1000), say: res.say, tag: res.tag || ""});
  if (call === c) renderSuggest();
}
const chunkDoc = c => c.chunks ? {audio: c.chunks.texts.slice().sort((a, b) => a.t - b.t).map(x => ({s: Math.round((x.t - c.start) / 1000), x: x.text})),
  sugg: c.chunks.items.map(({s, say, tag}) => ({s, say, tag}))} : {};
// After the call: the pieces become the accurate transcript, kept with the call's transcript row. The text in the card
// is replaced only if nobody changed it since the call ended.
function finishChunks(c, ch){
  const extra = chunkDoc(c); if (!extra.audio.length && !extra.sugg.length) return;
  const d = {...(trCache[c.trId] || trDoc(c, [], "final")), ...extra, status: "final"}; trCache[c.trId] = d;
  c.trChain = (c.trChain || Promise.resolve(true)).then(async () => {
    let error = null;
    try { ({error} = await sb.from("transcripts").upsert({id: c.trId, lead_id: c.id, data: d, updated_at: new Date().toISOString(), updated_by: user.id})); } catch (e){ error = e; }
    const text = extra.audio.length ? trText(d) : "";
    if (error) setSync("err", text ? "התמלול המדויק לא נשמר בטבלת התמלולים. הוא נשמר בכרטיס, בתיבה \"מה היה בשיחה\"" : "ההצעות מהשיחה לא נשמרו בשרת");
    edit(c.id, r => { r.calls = (r.calls || []).map(x => x.tr === c.trId ? {...x, liveAudio: extra.audio.length > 0} : x);
      if (!text) return;
      if (!r.callText || r.callText === c.chromeText) r.callText = text;          // untouched since the call: the accurate text replaces it
      else if (error) r.callText += "\n\n" + text; }, 0, text ? "callText" : "");  // edited, and the row did not save: kept below the edits
    if (c.id === selId && !summaryOpen && !call){ const ta = $("#f-transcript"); if (ta && ta !== document.activeElement) ta.value = rec(c.id).callText || ""; }
    return !error;
  });
}
function renderSuggest(){
  const box = $("#suggestBox"); if (!box) return;
  if (!suggestOn || !call){ box.hidden = true; box.innerHTML = ""; return; }
  const ch = call.chunks, items = ch ? ch.items.slice(-3).reverse() : [];
  box.hidden = false;
  box.innerHTML = `<div class="sg-h">מה להגיד עכשיו</div>`
    + (items.length ? items.map((x, i) => `<div class="sg ${i ? "old" : ""}">${x.tag ? `<span class="sgtag">${esc(x.tag)}</span>` : ""}${esc(x.say)}</div>`).join("")
      : `<div class="note">${call.recording ? "ההצעה הראשונה תגיע אחרי רבע הדקה הראשונה של דיבור." : "ההצעות עובדות רק כשהשיחה מוקלטת, במצב הקשבה."}</div>`)
    + (ch && ch.msg ? `<div class="msg">${esc(ch.msg)}</div>` : "");
}
async function transcribeRecording(id, btn){
  const path = btn.dataset.stt, a = audioMeta(rec(id), path);
  btn.disabled = true; btn.textContent = "מתמלל…";
  const res = await callFn("transcribe", {path, at: a.at, dur: a.dur}, 150000);
  if (!res.id){ btn.disabled = false;
    btn.textContent = res.error === "missing_key" ? "המפתח של OpenAI עוד לא הודבק בשרת" : res.error === "auth" || res.error === "not_member" ? RELOGIN
      : res.detail === "too_long" ? "ההקלטה ארוכה מדי לתמלול אחד" : "התמלול נכשל. נסה שוב"; return; }
  delete trCache[res.id];
  edit(id, r => { r.calls = (r.calls || []).map(x => x.audio && x.audio.path === path ? {...x, audio: {...x.audio, atr: res.id}} : x); });
  if (id === selId && !summaryOpen) renderDetail();
}

// ---------- summary with Claude (copy / paste) ----------
const KIND_LABEL = l => l.track === "ראשית" ? "שיחת היכרות (לא מוכרים לפני שעלה כאב, היעד: דמו ביום ושעה)" : "שיחת מכירה (היעד: 4 פרטים לדמו, ובשיחת המשך: סגירה)";
function localNow(){ const d = new Date(), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
async function copyPrompt(){
  const l = DATA.find(x => x.id === selId); const tr = ($("#f-transcript")?.value || "").trim(); if (!l) return;
  if (tr.length < 40){ $("#fillMsg").textContent = "אין עדיין תמלול. הקשב לשיחה, או הדבק תמלול."; return; }
  const fields = FORM.filter(f => f[0] !== "price" && f[0] !== "feedback").map(([k, label, , opts]) => `- ${k}: ${label}${opts ? " (בחר בדיוק אחת מ: " + opts.join(" | ") + ")" : ""}`).join("\n");
  const prompt = `אתה ממלא טופס סיכום של שיחת מכירה טלפונית בעברית, מתוך תמלול.
התמלול הוא ערוץ אחד בלי הפרדה בין הדוברים: איש המכירות ובעל העסק. ייתכנו שגיאות זיהוי דיבור.
השתמש רק במה שנאמר בתמלול. אל תנחש ואל תמציא. שדה שלא עלה בשיחה, אל תכלול בכלל.
הליד: ${l.name} · תחום: ${l.niche} · אזור: ${l.area || "לא ידוע"} · סוג השיחה: ${KIND_LABEL(l)}
התאריך והשעה עכשיו: ${localNow()}

השדות:
${fields}

סטטוסים אפשריים: noanswer, voicemail (השאיר הודעה בתא הקולי), callback (ואז callback = המועד), booked, done, demo (ואז callback = מועד הדמו), won, notrelevant, dnc.

החזר רק JSON בצורה הזו, בלי טקסט נוסף:
{"summary": {"<key>": "<ערך קצר בעברית>"}, "status": "<אחד מהסטטוסים>", "callback": "YYYY-MM-DDTHH:MM או מחרוזת ריקה", "notes": "2–4 שורות קצרות: מה חשוב לזכור לשיחה הבאה"}

התמלול:
"""
${tr.slice(-40000)}
"""`;
  try { await navigator.clipboard.writeText(prompt); $("#fillMsg").textContent = "הועתק. הדבק בצ'אט של Claude, והחזר לכאן את התשובה."; }
  catch { $("#fillMsg").textContent = "ההעתקה לא עבדה. סמן את התמלול והעתק ידנית."; }
}
function parseAnswer(){
  const raw = ($("#f-answer")?.value || "").trim(); const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  let res = null; try { res = JSON.parse(raw.slice(a, b + 1)); } catch {}
  if (!res){ $("#fillPreview").innerHTML = `<div class="msg">לא הצלחתי לקרוא את התשובה. ודא שהעתקת את כל ה-JSON.</div>`; return; }
  const sm = {}, valid = new Set(FORM.map(f => f[0]));
  for (const [k, v] of Object.entries(res.summary || {})){ if (!valid.has(k) || v == null || String(v).trim() === "") continue;
    const f = FORM.find(x => x[0] === k); if (f[2] === "radio" && !f[3].includes(String(v))) continue; sm[k] = String(v).slice(0, 600); }
  const st = STATUSES.some(([k]) => k === res.status) ? res.status : "";
  const cb = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(res.callback || "") ? res.callback : "";
  const notes = String(res.notes || "").slice(0, 800);
  pendingFill = {summary: sm, status: st, callback: cb, notes};
  const rows = Object.entries(sm).map(([k, v]) => kv(FORM.find(f => f[0] === k)[1], v)).join("");
  $("#fillPreview").innerHTML = `<div class="facts">${st ? kv("סטטוס מוצע", SLABEL[st]) : ""}${cb ? kv("מועד", fmtDT(cb)) : ""}${notes ? kv("הערות לשיחה הבאה", notes) : ""}${rows}</div>
    <div class="inline" style="margin-top:8px"><button type="button" class="btn sm primary" id="fillApply">החל על הטופס</button><button type="button" class="btn sm" id="fillCancel">בטל</button></div>`;
}
function applyFill(){
  if (!pendingFill || !selId) return; const f = pendingFill;
  edit(selId, r => { r.summary = {...(r.summary || {}), ...f.summary};
    if (f.status && f.status !== r.status){ if (f.status === "noanswer" || f.status === "voicemail") r.attempts = (r.attempts || 0) + 1; r.status = f.status; r.history.push({t: new Date().toISOString(), s: f.status}); }
    if (f.callback) r.callback = f.callback;
    if (f.notes) r.notes = (r.notes ? r.notes + "\n" : "") + `[${new Date().toLocaleDateString("he-IL")}] ${f.notes}`; });
  pendingFill = null; renderList(); renderDetail();
}

// ---------- export / admin import ----------
$("#exportCsv").addEventListener("click", () => {
  const cols = ["מקור","ציון","שם","תחום","נישה","אזור","טלפון","מספר מהאתר","סטטוס","ניסיונות","לחזור/מועד","עודכן","הערות","מה היה בשיחה", ...FORM.map(f => f[1])];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = DATA.filter(l => rec(l.id).status !== "new").map(l => { const r = rec(l.id), s = r.summary || {};
    return [l.src === "g" ? "גוגל" : "פייסבוק", l.score || "", l.name, l.niche, l.track, l.area, l.phone, (l.webPhones || []).join(", "), SLABEL[r.status], r.attempts || 0, r.callback || "", r.updated || "", r.notes || "", r.callText || "", ...FORM.map(f => s[f[0]] || "")].map(q).join(","); });
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + [cols.map(q).join(","), ...rows].join("\n")], {type: "text/csv"}));
  a.download = `call-log-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
});
$("#importFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f || !isAdmin) return;
  let bundle; try { bundle = JSON.parse(await f.text()); } catch { setSync("err", "הקובץ לא תקין"); return; }
  setSync("saving", "מייבא…");
  if (bundle.scripts){ const {error} = await sb.from("config").upsert({key: "scripts", value: bundle.scripts, updated_at: new Date().toISOString()}); if (error){ setSync("err", "ייבוא התסריטים נכשל"); return; } }
  const leads = (bundle.leads || []).map(l => ({id: String(l.id), data: l, updated_at: new Date().toISOString()}));
  for (let i = 0; i < leads.length; i += 100){ const {error} = await sb.from("leads").upsert(leads.slice(i, i + 100)); if (error){ setSync("err", "ייבוא הלידים נעצר: " + error.message); return; } setSync("saving", `מייבא לידים ${Math.min(i + 100, leads.length)}/${leads.length}…`); }
  const calls = Object.entries(bundle.calls || {}).map(([id, r]) => ({lead_id: id, rec: r, updated_at: new Date().toISOString(), updated_by: user.id}));
  for (let i = 0; i < calls.length; i += 100){ const {error} = await sb.from("calls").upsert(calls.slice(i, i + 100)); if (error){ setSync("err", "ייבוא הסימונים נעצר"); return; } }
  setSync("ok", `יובאו ${leads.length} לידים ו-${calls.length} סימונים`);
  const {data} = await sb.auth.getSession(); if (data.session) start(data.session);
});

// ---------- boot ----------
(async () => {
  if (!CFG.url || !CFG.key){ show("#authView"); authMsg("האתר עוד לא חובר לשרת (config.js)."); return; }
  const wantsPassword = /type=(invite|recovery)/.test(AUTH_HASH);
  // A login that ends while the board is open (its time ran out, or a password change elsewhere ended it) must not leave
  // saves failing quietly: the login form comes back, unsaved edits stay in this page, and they go out right after logging in.
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") showLogin(true);
    else if (event === "SIGNED_IN" && session && !wantsPassword && !user) start(session);
    else if (event === "SIGNED_IN" && session && user && loginLost){
      if (session.user.id !== user.id){ location.reload(); return; }
      loginLost = false; authMsg(""); show("#mainView"); flushAll(); if (busy()) setSync("saving", "מחובר שוב. שומר את מה שחיכה…");
    }
    else if (event === "SIGNED_OUT" && user && !loggingOut){
      loginLost = true; showLogin(false); authMsg("הכניסה ללוח פגה. מתחברים שוב כאן, בלי לרענן את הדף, ומה שלא נשמר יישמר מיד אחרי הכניסה.");
    }
  });
  const {data} = await sb.auth.getSession();
  if (data.session && wantsPassword) showLogin(true);
  else if (data.session) start(data.session);
  else showLogin(false);
})();
