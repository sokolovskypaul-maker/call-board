"use strict";
// ui.js: the chamal, polished (10.11.2026). Loads after app.js and only adds to what is there:
//  - the tabs get a sliding pill;
//  - the header shows the four numbers that matter, the rest behind "עוד", and the numbers roll when they change;
//  - the list's filters and secondary buttons sit behind one "סינון" button, and Cmd/Ctrl+K opens a quick search;
//  - during a call the mic dot becomes a voice orb that follows the sound, and a new line to say enters softly;
//  - after a call the fields the board filled by itself appear one by one.
// Every part is wrapped on its own: if one fails, the board keeps working exactly as before.
// It reads app.js's globals (DATA, call, selId, rec, SLABEL, esc) and never writes to them.
(() => {
  const $ = s => document.querySelector(s);
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const safe = (name, f) => { try { return f(); } catch (e) { console.warn("ui." + name + ":", e); } };
  const curCall = () => (typeof call !== "undefined" ? call : null);

  // ---------- the tabs: a pill that slides to the open screen ----------
  function tabs(){
    const nav = $(".views"); if (!nav) return;
    const ind = document.createElement("span"); ind.className = "views-ind"; ind.setAttribute("aria-hidden", "true");
    nav.prepend(ind); nav.classList.add("has-ind");
    const place = anim => { const b = nav.querySelector('[aria-current="page"]');
      if (!b || !b.offsetWidth){ ind.style.opacity = "0"; return; }
      if (!anim || RM.matches) ind.style.transition = "none";
      ind.style.opacity = "1"; ind.style.width = b.offsetWidth + "px"; ind.style.transform = `translateX(${b.offsetLeft}px)`;
      if (!anim || RM.matches){ void ind.offsetWidth; ind.style.transition = ""; } };
    let first = true;
    new MutationObserver(() => { place(!first); first = false; }).observe(nav, {subtree: true, attributes: true, attributeFilter: ["aria-current"]});
    new ResizeObserver(() => place(false)).observe(nav);
    if (document.fonts) document.fonts.ready.then(() => place(false));
    place(false);
  }

  // ---------- the header's numbers: four that matter, "עוד" for the rest, and they roll when they change ----------
  const KEY = ["חיוגים היום", "לחזור עכשיו", "נקבעו להמשך", "סגרו"];
  function stats(){
    const el = $("#stats"); if (!el) return;
    const more = document.createElement("button"); more.type = "button"; more.className = "btn sm stats-more";
    more.setAttribute("aria-controls", "stats"); more.setAttribute("aria-expanded", "false"); el.after(more);
    const label = () => { const n = el.querySelectorAll(".stat:not(.key)").length, all = el.classList.contains("all");
      more.textContent = all ? "פחות" : `עוד ${n}`; more.hidden = !n; more.setAttribute("aria-expanded", String(all)); };
    more.addEventListener("click", () => { el.classList.toggle("all"); label(); });
    el.addEventListener("click", () => { if (matchMedia("(max-width:860px)").matches){ el.classList.toggle("all"); label(); } });   // on a phone the strip itself opens
    const seen = new Map();
    const decorate = () => {
      let first = true;
      for (const s of el.querySelectorAll(".stat")){
        const k = ((s.querySelector("span") || {}).textContent || "").trim(), b = s.querySelector("b"); if (!b) continue;
        const key = KEY.includes(k); s.classList.toggle("key", key); s.classList.toggle("kfirst", key && first); if (key) first = false;
        const m = b.textContent.match(/^(\d+)\s*·\s*(.+)$/);   // "5 · דיברתי 2": the number big, the rest small beside it
        if (m){ b.textContent = m[1]; const sm = document.createElement("small"); sm.className = "sub2"; sm.textContent = m[2]; b.after(sm); }
        if (!/^\d+$/.test(b.textContent)){ seen.delete(k); continue; }
        const n = +b.textContent, was = seen.get(k); seen.set(k, n);
        if (was !== undefined && was !== n && !RM.matches) roll(b, was, n);
      }
      label();
    };
    new MutationObserver(decorate).observe(el, {childList: true}); decorate();
  }
  function roll(b, from, to){
    const t0 = performance.now(), D = 650;
    const step = now => { if (!b.isConnected) return; const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
      b.textContent = String(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------- the list's tools: search first, the filters behind one button ----------
  const FILTERS = {fSrc: "", fNiche: "", fScore: "0", fStatus: ""};
  function filters(){
    const tools = $(".listtools"), q = $("#q"); if (!tools || !q) return;
    const wrap = document.createElement("span"); wrap.className = "qwrap"; q.before(wrap); wrap.append(q);
    const kbd = document.createElement("kbd"); kbd.className = "qkbd"; kbd.title = "חיפוש מהיר";
    kbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"; wrap.append(kbd);
    kbd.addEventListener("click", () => palette.open());
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn filt"; btn.id = "filtBtn";
    btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "fpanel");
    btn.innerHTML = `<span>סינון</span><b class="fcount" hidden></b>`; wrap.after(btn);
    const panel = document.createElement("div"); panel.className = "fpanel"; panel.id = "fpanel";
    const g1 = document.createElement("div"); g1.className = "fgroup";
    ["#fSrc", "#fNiche", "#fScore", "#fStatus", "#sort"].forEach(s => { const e = $(s); if (e) g1.append(e); });
    const g2 = document.createElement("div"); g2.className = "fgroup";
    ["#callsDiary", "#logsSummary", "#exportCsv", "#importLabel", "#importFile"].forEach(s => { const e = $(s); if (e) g2.append(e); });
    panel.append(g1, g2); tools.append(panel);
    const count = () => { const n = Object.entries(FILTERS).filter(([id, d]) => { const e = document.getElementById(id); return e && e.value !== d; }).length;
      const c = btn.querySelector(".fcount"); c.textContent = String(n); c.hidden = !n; btn.classList.toggle("on", n > 0); };
    btn.addEventListener("click", () => { const on = tools.classList.toggle("fopen"); btn.setAttribute("aria-expanded", String(on)); });
    Object.keys(FILTERS).forEach(id => { const e = document.getElementById(id); if (e) e.addEventListener("input", count); });
    count();
  }

  // ---------- the quick search: Cmd/Ctrl+K, any lead or screen, by keyboard ----------
  const NAV = [["home", "בית"], ["leads", "לידים"], ["diary", "יומן שיחות"], ["logs", "סיכום רישומים"]];
  const palette = (() => {
    let el = null, input = null, listEl = null, items = [], idx = 0;
    const norm = s => String(s || "").toLowerCase().replace(/[-\s]/g, "");
    function build(){
      el = document.createElement("div"); el.className = "cmdk"; el.hidden = true;
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "חיפוש מהיר");
      el.innerHTML = `<div class="cmdk-back" data-x></div><div class="cmdk-box"><div class="cmdk-in"><span class="cmdk-ic" aria-hidden="true"></span>`
        + `<input type="text" id="cmdkQ" placeholder="עסק, תחום, עיר או טלפון" autocomplete="off" spellcheck="false" aria-controls="cmdkList" aria-label="חיפוש מהיר"><kbd>Esc</kbd></div>`
        + `<div class="cmdk-list" id="cmdkList" role="listbox"></div>`
        + `<div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> בחירה</span><span><kbd>Enter</kbd> פתיחה</span><span><kbd>Esc</kbd> סגירה</span></div></div>`;
      document.body.append(el); input = el.querySelector("input"); listEl = el.querySelector(".cmdk-list");
      el.addEventListener("click", e => { if (e.target.closest("[data-x]")) return close(); const o = e.target.closest("[data-i]"); if (o) pick(+o.dataset.i); });
      el.addEventListener("mousemove", e => { const o = e.target.closest("[data-i]"); if (o && +o.dataset.i !== idx){ idx = +o.dataset.i; mark(false); } });
      input.addEventListener("input", () => { idx = 0; draw(); });
      input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown"){ e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); mark(true); }
        else if (e.key === "ArrowUp"){ e.preventDefault(); idx = Math.max(0, idx - 1); mark(true); }
        else if (e.key === "Enter"){ e.preventDefault(); pick(idx); }
        else if (e.key === "Escape"){ e.preventDefault(); close(); } });
    }
    function draw(){
      const q = norm(input.value), data = typeof DATA !== "undefined" ? DATA : [];
      const leads = data.filter(l => !q || norm([l.name, l.niche, l.area, l.phone, (l.tags || []).join(" "), l.brief && l.brief.owner].join(" ")).includes(q)).slice(0, 8);
      const navs = NAV.filter(([, n]) => !q || norm(n).includes(q));
      items = [...leads.map(l => ({lead: l})), ...navs.map(([v, n]) => ({v, n}))];
      const st = l => { try { const r = rec(l.id); return [r.status, SLABEL[r.status] || ""]; } catch { return ["", ""]; } };
      let i = 0, h = "";
      if (leads.length) h += `<div class="cmdk-g">לידים</div>` + leads.map(l => { const [s, sl] = st(l);
        return `<div class="cmdk-o" role="option" data-i="${i++}"><span class="cmdk-nm">${esc(l.name)}</span><span class="cmdk-sub">${esc([l.niche, l.area].filter(Boolean).join(" · "))}</span>${sl ? `<span class="pill st-${esc(s)}">${esc(sl)}</span>` : "<span></span>"}</div>`; }).join("");
      if (navs.length) h += `<div class="cmdk-g">מעבר למסך</div>` + navs.map(([, n]) => `<div class="cmdk-o" role="option" data-i="${i++}"><span class="cmdk-nm">${esc(n)}</span><span class="cmdk-sub"></span><span></span></div>`).join("");
      listEl.innerHTML = h || `<div class="cmdk-empty">לא מצאתי. נסה שם אחר, עיר או חלק מהטלפון.</div>`;
      mark(false);
    }
    function mark(scroll){ listEl.querySelectorAll(".cmdk-o").forEach(o => { const on = +o.dataset.i === idx; o.classList.toggle("on", on); o.setAttribute("aria-selected", String(on)); if (on && scroll) o.scrollIntoView({block: "nearest"}); }); }
    function pick(i){ const it = items[i]; if (!it) return; close();
      if (it.lead) return openLead(it.lead.id);
      const b = document.querySelector(`.views [data-view="${it.v}"]`); if (b) b.click(); }
    function open(){ const mv = $("#mainView"); if (!mv || mv.classList.contains("hidden")) return;
      if (!el) build(); el.hidden = false; input.value = ""; idx = 0; draw();
      requestAnimationFrame(() => { el.classList.add("in"); input.focus(); }); }
    function close(){ if (!el || el.hidden) return; el.classList.remove("in"); el.hidden = true; }
    return {open, close, toggle: () => (el && !el.hidden ? close() : open())};
  })();
  // Opens a lead the way a click on its row does. A lead hidden by the search or the filters brings them back to "all" first.
  function openLead(id){
    const find = () => [...document.querySelectorAll("#list .row")].find(r => r.dataset.id === id);
    let row = find();
    if (!row){ const q = $("#q"); if (q) q.value = "";
      Object.entries(FILTERS).forEach(([k, d]) => { const e = document.getElementById(k); if (e) e.value = d; });
      ["#q", ...Object.keys(FILTERS).map(k => "#" + k)].forEach(s => { const e = $(s); if (e) e.dispatchEvent(new Event("input", {bubbles: true})); });
      row = find(); }
    if (row){ row.click(); row.scrollIntoView({block: "nearest"}); }
  }
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.code === "KeyK" || e.key === "k" || e.key === "K")){ e.preventDefault(); palette.toggle(); }
  });

  // ---------- the voice orb: follows the microphone's level during a call (and every line the transcript hears) ----------
  function orb(){
    const root = document.documentElement; let running = false, lvl = 0, pulse = 0, buf = null;
    const frame = () => {
      const c = curCall();
      if (!c){ running = false; lvl = 0; pulse = 0; root.style.setProperty("--vox", "0"); return; }
      let a = 0; const an = c.meter && c.meter.an;
      if (an && an.getFloatTimeDomainData){ if (!buf || buf.length !== an.fftSize) buf = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(buf); let s = 0, n = 0; for (let i = 0; i < buf.length; i += 4){ s += buf[i] * buf[i]; n++; }
        a = Math.min(1, Math.sqrt(s / n) * 9); }
      pulse *= 0.94; const target = Math.max(a, pulse);
      lvl += (target - lvl) * (target > lvl ? 0.35 : 0.1);
      root.style.setProperty("--vox", lvl.toFixed(3)); requestAnimationFrame(frame);
    };
    setInterval(() => { if (!running && curCall()){ running = true; requestAnimationFrame(frame); } }, 400);
    return {kick(v){ pulse = Math.max(pulse, v); }};
  }

  // ---------- the card: a new line to say enters softly; after a call the filled fields appear one by one ----------
  function card(o){
    const d = $("#detail"); if (!d) return;
    let lastSay = "", revealKey = "", revealT0 = 0;
    const check = () => {
      const now = $("#sayNow");
      if (now){ const t = now.textContent;
        if (t && t !== lastSay){ lastSay = t; if (!RM.matches){ now.classList.remove("sw"); void now.offsetWidth; now.classList.add("sw"); } } }
      else lastSay = "";
      // the reveal runs once per fill, by the clock: a card drawn again in the middle of it continues from the same moment
      const kb = $("#knownBox"); if (!kb || !kb.querySelector(".donecard") || RM.matches) return;
      let a = null; try { a = rec(selId).lastAuto; } catch {}
      if (!a || !a.at) return;
      const key = selId + "|" + a.at;
      if (key !== revealKey && Date.now() - new Date(a.at).getTime() < 8000){ revealKey = key; revealT0 = Date.now(); }
      const t = Date.now() - revealT0;
      if (key === revealKey && t < 2600 && !kb.classList.contains("reveal")){
        kb.classList.add("reveal"); kb.style.setProperty("--t0", `-${t}ms`);
        kb.querySelectorAll(".kv.auto").forEach((x, i) => x.style.setProperty("--i", String(i))); }
    };
    new MutationObserver(muts => {
      for (const m of muts){ const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (t && t.closest && t.closest("#liveTranscript")){ o.kick(0.55 + Math.random() * 0.4); break; } }
      check();
    }).observe(d, {childList: true, subtree: true, characterData: true});
    check();
  }

  safe("tabs", tabs); safe("stats", stats); safe("filters", filters);
  const o = safe("orb", orb) || {kick(){}};
  safe("card", () => card(o));
})();
