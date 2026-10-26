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
const STATUSES = [["new","לא התקשרתי"],["noanswer","לא ענה"],["callback","לחזור אליו"],["booked","נקבעה שיחה"],["done","שיחת היכרות בוצעה"],["demo","נקבע דמו"],["won","סגר"],["notrelevant","לא רלוונטי"],["dnc","ביקש לא להתקשר"]];
const SLABEL = Object.fromEntries(STATUSES);
const PRICE = {
  "ראשית": "מחירון D-025: הקמה ₪4,900 + ₪1,490 לחודש (עד 600 דקות). רצפה ₪2,490 + ₪790. הנחה רק בתמורה למשהו.",
  "צדדית": "מחיר פיילוט D-028: הקמה ₪1,490 + ₪490 לחודש (עד 400 דקות), בתמורה להמלצה מוקלטת. בלי המלצה: ₪2,490 + ₪790."
};
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
  [["רובוט","בוט","מכונה","לא ידברו","מי מבטיח","לא יעבוד"], ["רובוט"]],
  [["ניסיתי","כבר ניסינו","לא עבד לי"], ["ניסיתי"]],
  [["אחרי העונה","לא עכשיו","בעוד חודש","בהמשך","אחרי החגים"], ["לא עכשיו","אחרי העונה"]],
  [["פרטיות","מקליטים","הקלטה"], ["פרטיות"]],
  [["תטעה","טעות"], ["תטעה"]]];

// ---------- state ----------
let DATA = [], SCRIPTS = {discovery: "", sales: ""}, user = null, isAdmin = false, selId = null, channel = null, readOnly = false;
const byId = {}, timers = new Map(), chains = new Map();
let call = null;           // {id, start, end, stages:Set, objections:Set, timer, trId, trTimer, trChain, indexed}
let live = null;           // {rec, listening, lines:[], interim, lastHit:{}}
let pendingFill = null;
const fillText = {};       // lead id -> text in the "summary with Claude" box (survives re-renders)
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
const logout = async () => { stopListening(); await sb.auth.signOut(); location.reload(); };
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
    if (timers.has(row.lead_id)) return;                 // our own unsaved typing wins locally
    byId[row.lead_id] = row.rec; renderList();
    const typing = document.activeElement && $("#detail").contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (row.lead_id === selId && !typing && !(live && live.listening)) renderDetail();
  }).subscribe(status => { if (status === "SUBSCRIBED") setSync("ok", "מסונכרן"); else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSync("err", "החיבור החי נפל. רענן את הדף"); });
}
function edit(id, mutate, debounce = 0){
  if (readOnly) return;
  const r = structuredClone(rec(id)); mutate(r);
  r.updated = new Date().toISOString(); if (r.history.length > 30) r.history = r.history.slice(-30);
  byId[id] = r; clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); flush(id); }, debounce));
  setSync("saving", "שומר…");
}
function flush(id){
  const body = JSON.parse(JSON.stringify(byId[id]));
  const p = (chains.get(id) || Promise.resolve()).then(async () => {
    const {error} = await sb.from("calls").upsert({lead_id: id, rec: body, updated_at: new Date().toISOString(), updated_by: user.id});
    if (error){ setSync("err", "השמירה נכשלה. בדוק חיבור ונסה שוב"); return; }
    if (!timers.size) setSync("ok", "נשמר ומסונכרן");
  });
  chains.set(id, p);
}

// ---------- list ----------
function buildFilters(){
  $("#fNiche").innerHTML = `<option value="">כל התחומים</option>` + [...new Set(DATA.map(l => l.niche))].map(n => `<option>${esc(n)}</option>`).join("");
  $("#fStatus").innerHTML = `<option value="">כל הסטטוסים</option>` + STATUSES.map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
}
["#q","#fSrc","#fNiche","#fScore","#fStatus","#sort"].forEach(s => $(s).addEventListener("input", renderList));
function rankKey(l){ const r = rec(l.id); let st = {callback: isDue(r) ? 0 : 4, booked: 1, demo: 1, new: 2, noanswer: 3, done: 6, won: 7, notrelevant: 8, dnc: 9}[r.status] ?? 5;
  if (l.virtual07 && (r.status === "new" || r.status === "noanswer")) st = 4.5;   // a virtual 07 line rarely reaches the owner: call these last
  if (l.noDial && ["new", "noanswer", "callback"].includes(r.status)) st = 8.5;   // held until a real number is found
  else if (l.priority && (r.status === "new" || r.status === "noanswer")) st = -1; // a hand-picked call list (e.g. "חם-27.10") goes first, in its own order
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
        <span class="mic ${listening ? "on" : ""}" id="mic"><span class="dot"></span>${listening ? "מקשיב" : "לא מקשיב"}</span>`
      : `<button type="button" class="btn primary" id="callStart">🎙 התחל שיחה והקשב</button><button type="button" class="btn sm" id="callManual">▶ מצב שיחה בלי הקשבה</button>
        <span class="note">האייפון על רמקול ליד המחשב, בחדר שקט. התמלול נשמר ביומן של העסק.</span>`}
    </div>
    ${call && !on ? `<div class="inline"><span class="note">יש שיחה פתוחה עם ${esc(DATA.find(x => x.id === call.id)?.name || "")}. שיחה חדשה כאן תסגור ותשמור אותה.</span><button type="button" class="btn sm" id="callGoto">חזור אליה</button></div>` : ""}
    ${chips}
    <div id="liveObj"></div>
    ${on && live ? `<div class="transcript" id="liveTranscript" aria-live="polite"></div>` : ""}
    <div class="msg hidden" id="liveMsg"></div>
  </section>`;
}
function renderDetail(){
  const l = DATA.find(x => x.id === selId); if (!l) return;
  const r = rec(l.id), sm = r.summary || {}, b = l.brief || {};
  const dial = dialList(l).map(([p, lbl], i) => l.noDial
    ? `<span class="dialrow"><span class="call off" aria-disabled="true">${esc(p)}</span><span class="lbl">לא לחייג</span></span>`
    : `<span class="dialrow"><a class="call ${i ? "alt" : ""}" href="${telOf(p)}" aria-label="חיוג ל-${esc(p)}">${esc(p)}</a><button type="button" class="btn sm copy" data-ph="${esc(p)}">העתק</button>${lbl ? `<span class="lbl">${lbl}</span>` : ""}</span>`).join("");
  const phoneNotes = (l.noDial ? `<div class="watch"><b>לא לחייג.</b> ${esc(l.noDialReason || "עד שנמצא מספר אמיתי.")}</div>` : "")
    + (l.phoneMismatch ? `<div class="watch"><b>המספר באתר של העסק שונה מהמספר הרשום בגוגל.</b> להתקשר קודם למספר מהאתר (נבדק ${esc(l.phoneCheckDate || "")}).</div>` : "")
    + (l.virtual07 ? `<div class="note">המספר הרשום הוא קו 07 וירטואלי. לרוב הוא מגיע למוקד או להפניה, ולא לבעל העסק, ולכן הליד בסוף התור.</div>` : "");
  const trs = (r.calls || []).filter(x => x.tr).slice(-6).reverse();
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
  const form = FORM.map(([k, label, type, opts]) => { const v = sm[k] ?? (k === "price" ? (PRICE[l.track] || "") : "");
    if (type === "radio") return `<div class="f"><span>${label}</span><span class="radios" role="radiogroup" aria-label="${label}">${opts.map((o, i) => `<label for="f-${k}-${i}"><input type="radio" id="f-${k}-${i}" name="f-${k}" value="${esc(o)}" ${v === o ? "checked" : ""}> ${esc(o)}</label>`).join("")}</span></div>`;
    if (type === "area") return `<label class="f" for="f-${k}">${label}<textarea id="f-${k}" data-f="${k}">${esc(v)}</textarea></label>`;
    if (type === "datetime") return `<label class="f" for="f-${k}">${label}<input type="datetime-local" id="f-${k}" data-f="${k}" value="${esc(v)}"></label>`;
    return `<label class="f" for="f-${k}">${label}<input type="text" id="f-${k}" data-f="${k}" value="${esc(v)}"></label>`; }).join("");
  $("#detail").innerHTML = `
    <button type="button" class="btn sm back" id="back">→ חזרה לרשימה</button>
    <div class="head"><div class="whois"><h2>${esc(l.name)}</h2>${(l.tags || []).length ? `<div class="tags">${l.tags.map(t => `<span class="tag">${esc(t)}${l.priority ? " · מקום " + l.priority + " בתור" : ""}</span>`).join("")}</div>` : ""}<div class="meta">${meta}</div><div class="meta">${esc(l.area || "אזור לא ידוע")}</div><div class="links">${links}</div></div><div class="dial">${dial || '<span class="meta">אין טלפון</span>'}</div></div>
    ${phoneNotes ? `<div class="phonenotes">${phoneNotes}</div>` : ""}
    ${liveHtml(l)}
    ${brief}${objPanel(l)}
    ${l.fit ? `<div class="fit"><b>למה מתאים לאלה:</b> ${esc(l.fit)}</div>` : ""}
    <div class="facts">${kv("מה העסק עושה", l.what)}${kv("ביקור מדידה חינם", l.free)}${kv("הבטחת זמן תגובה", l.resp)}${kv("וואטסאפ באתר", l.wa)}${kv("טופס באתר", l.form)}${kv("בעלים מפעיל", l.owner)}${kv("טלפון נוסף באתר", l.sitePhone)}${kv("הערות מהאיסוף", l.notes)}</div>
    <section class="box"><h3>סטטוס</h3>
      <div class="statuses">${STATUSES.map(([k, v]) => `<button type="button" class="btn sm" data-st="${k}" aria-pressed="${r.status === k}">${v}</button>`).join("")}</div>
      <div class="inline"><label for="f-callback" class="note">לחזור אליו / מועד:</label><input type="datetime-local" id="f-callback" value="${esc(r.callback || "")}"><span class="note">ניסיונות: ${r.attempts || 0}</span></div>
      <label for="f-notes" class="note">ההערות שלך</label><textarea id="f-notes" placeholder="מה עלה בשיחה, עם מי דיברת, מתי לחזור">${esc(r.notes || "")}</textarea>
      ${r.status === "dnc" ? `<div class="watch">ביקש לא להתקשר. מחיקה מהרשימות דורשת "מאשר הרמטית".</div>` : ""}
      ${r.history.length ? `<ul class="hist">${r.history.slice(-6).reverse().map(h => `<li>${fmtDT(h.t)}: ${esc(SLABEL[h.s] || h.s)}</li>`).join("")}</ul>` : ""}
    </section>
    <section class="box" id="fillBox"><h3>סיכום עם Claude</h3>
      <div class="note">אחרי השיחה התמלול נכנס לכאן לבד, ונשמר גם ב"תמלולי שיחות". לוחצים "העתק ל-Claude", מדביקים בצ'אט של Claude, ומעתיקים לכאן את התשובה. שום דבר לא נכנס לטופס לפני שאתה מאשר.</div>
      ${trs.length ? `<div class="trlog"><div class="note">תמלולי שיחות</div>${trs.map(x => `<details class="trd" data-tr="${esc(x.tr)}"><summary>${fmtDT(x.at)} · ${call && call.trId === x.tr ? "בשיחה עכשיו" : x.dur ? fmt(x.dur * 1000) + " דקות" : "השיחה נקטעה"}</summary><div class="trbody">טוען…</div></details>`).join("")}</div>` : ""}
      <textarea id="f-transcript" placeholder="התמלול מהשיחה (או הדבק תמלול ידני)">${esc(fillText[l.id] || "")}</textarea>
      <div class="inline"><button type="button" class="btn sm" id="copyPrompt">העתק ל-Claude</button><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">פתח את Claude</a><span class="note" id="fillMsg"></span></div>
      <textarea id="f-answer" placeholder="הדבק כאן את התשובה של Claude"></textarea>
      <div class="inline"><button type="button" class="btn sm" id="parseAnswer">מלא את הטופס מהתשובה</button></div>
      <div id="fillPreview"></div>
    </section>
    <section class="box"><h3>טופס סיכום שיחה</h3>
      <div class="price">${esc(PRICE[l.track] || "")} את המחיר אומרים רק בסוף, ורק אם עלה כאב ממשי.</div>
      <div class="form">${form}</div>
    </section>
    <details class="script"><summary>${l.track === "ראשית" ? "תסריט שיחת ההיכרות" : "תסריט שיחת המכירה"} (מלא)</summary><div class="md">${mdToHtml(scriptFor(l))}</div></details>`;
  renderTranscript(); renderLiveObj();
}
$("#detail").addEventListener("click", async e => {
  const t = e.target;
  if (t.closest("#back")){ app.classList.remove("showdetail"); return; }
  const st = t.closest("[data-st]");
  if (st && selId){ const s = st.dataset.st; edit(selId, r => { if (s === "noanswer") r.attempts = (r.attempts || 0) + 1; r.status = s; r.history.push({t: new Date().toISOString(), s}); }); renderList(); renderDetail(); return; }
  if (t.closest("#callStart")){ startCall(true); return; }
  if (t.closest("#callManual")){ startCall(false); return; }
  if (t.closest("#callEnd")){ endCall(); return; }
  if (t.closest("#callGoto") && call){ selId = call.id; renderList(); renderDetail(); return; }
  const tf = t.closest("[data-trfill]");
  if (tf && trCache[tf.dataset.trfill]){
    fillText[selId] = trText(trCache[tf.dataset.trfill]); const ta = $("#f-transcript"); if (ta) ta.value = fillText[selId];
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
  if (t.id === "f-transcript") fillText[selId] = t.value;
  else if (t.id === "f-notes") edit(selId, r => { r.notes = t.value; }, 700);
  else if (t.id === "f-callback"){ edit(selId, r => { r.callback = t.value; }); renderList(); }
  else if (t.dataset.f) edit(selId, r => { r.summary = {...(r.summary || {}), [t.dataset.f]: t.value}; }, 700);
  else if (t.type === "radio" && t.name.startsWith("f-")){ edit(selId, r => { r.summary = {...(r.summary || {}), [t.name.slice(2)]: t.value}; }); renderStats(); }
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
  renderDetail(); if (listen) startListening();
}
function endCall(){
  const c = call; if (!c) return; stopListening();
  if (live && live.interim){ live.lines.push({t: Date.now(), text: live.interim}); live.interim = ""; }
  const lines = live ? live.lines : [];
  c.end = Date.now(); clearInterval(c.timer); clearTimeout(c.trTimer); call = null; live = null;
  const keep = lines.length > 0 && !readOnly;
  const entry = {at: new Date(c.end).toISOString(), dur: Math.round((c.end - c.start) / 1000), stages: [...c.stages], objections: [...c.objections], ...(keep ? {tr: c.trId} : {})};
  edit(c.id, r => { const i = (r.calls || []).findIndex(x => x.tr && x.tr === c.trId);
    r.calls = i >= 0 ? r.calls.map((x, j) => j === i ? entry : x) : [...(r.calls || []), entry].slice(-20); });
  if (keep){
    const d = trDoc(c, lines, "final"); trCache[c.trId] = d; fillText[c.id] = trText(d);
    saveTr(c, lines, "final").then(ok => { if (!ok) setSync("err", "התמלול לא נשמר בשרת. הוא עדיין בתיבה \"סיכום עם Claude\""); });
  }
  if (c.id !== selId) return;
  renderDetail(); document.getElementById("fillBox")?.scrollIntoView({behavior: "smooth", block: "start"});
}
addEventListener("pagehide", () => stopListening());   // never leave the microphone listening behind a closed page

// ---------- transcripts ----------
// One row per call in "transcripts", apart from the lead records, so the live list stays small.
// During a call the transcript is saved every 15 seconds; the lead's call log points to it, so a call cut off by a reload is still found.
function trDoc(c, lines, status){
  const l = DATA.find(x => x.id === c.id) || {};
  const d = {lead: c.id, name: l.name || "", niche: l.niche || "", at: new Date(c.start).toISOString(), dur: Math.round(((c.end || Date.now()) - c.start) / 1000), status,
    stages: STAGES[trackKind(l)].map(([n]) => n).filter(n => c.stages.has(n)), objections: [...c.objections],
    lines: lines.map(x => ({s: Math.round((x.t - c.start) / 1000), x: x.text}))};
  while (d.lines.length > 1 && JSON.stringify(d).length > 400000){ d.lines.shift(); d.trimmed = true; }
  return d;
}
function trText(d){
  return [`שיחה עם: ${d.name}${d.niche ? " (" + d.niche + ")" : ""}`,
    `תאריך: ${new Date(d.at).toLocaleString("he-IL")} · משך: ${fmt(d.dur * 1000)}`,
    `שלבים שזוהו: ${(d.stages || []).join(", ") || "אין"}`,
    `התנגדויות שעלו: ${(d.objections || []).join(", ") || "אין"}`,
    "", "תמלול (ערוץ אחד, בלי הפרדה בין הדוברים):",
    ...(d.lines || []).map(x => `[${fmt(x.s * 1000)}] ${x.x}`)].join("\n");
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
  const d = e.target; if (!d.matches?.(".trd") || !d.open) return;
  const id = d.dataset.tr, body = d.querySelector(".trbody");
  const showTr = t => { body.innerHTML = (t.lines || []).map(x => `<div class="trline"><span class="ts">${fmt(x.s * 1000)}</span>${esc(x.x)}</div>`).join("")
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

סטטוסים אפשריים: noanswer, callback (ואז callback = המועד), booked, done, demo (ואז callback = מועד הדמו), won, notrelevant, dnc.

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
    if (f.status && f.status !== r.status){ if (f.status === "noanswer") r.attempts = (r.attempts || 0) + 1; r.status = f.status; r.history.push({t: new Date().toISOString(), s: f.status}); }
    if (f.callback) r.callback = f.callback;
    if (f.notes) r.notes = (r.notes ? r.notes + "\n" : "") + `[${new Date().toLocaleDateString("he-IL")}] ${f.notes}`; });
  pendingFill = null; renderList(); renderDetail();
}

// ---------- export / admin import ----------
$("#exportCsv").addEventListener("click", () => {
  const cols = ["מקור","ציון","שם","תחום","נישה","אזור","טלפון","מספר מהאתר","סטטוס","ניסיונות","לחזור/מועד","עודכן","הערות", ...FORM.map(f => f[1])];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = DATA.filter(l => rec(l.id).status !== "new").map(l => { const r = rec(l.id), s = r.summary || {};
    return [l.src === "g" ? "גוגל" : "פייסבוק", l.score || "", l.name, l.niche, l.track, l.area, l.phone, (l.webPhones || []).join(", "), SLABEL[r.status], r.attempts || 0, r.callback || "", r.updated || "", r.notes || "", ...FORM.map(f => s[f[0]] || "")].map(q).join(","); });
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
  sb.auth.onAuthStateChange((event, session) => { if (event === "PASSWORD_RECOVERY") showLogin(true); else if (event === "SIGNED_IN" && session && !wantsPassword && !user) start(session); });
  const {data} = await sb.auth.getSession();
  if (data.session && wantsPassword) showLogin(true);
  else if (data.session) start(data.session);
  else showLogin(false);
})();
