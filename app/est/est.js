/* Shared helpers for the Painting and Tiling estimators: views + back button, sheets, box buttons, icons, toast, PDF. */
(function () {
  "use strict";
  const ICO = {
    back: "M15 6l-6 6 6 6", close: "M6 6l12 12M18 6L6 18", plus: "M12 5v14M5 12h14", gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z",
    cam: "M4 8h3l2-2.5h6L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", ar: "M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M12 8l4 2v4l-4 2-4-2v-4z",
    photo: "M4 5h16v14H4zM4 15l4.5-4 4 3.5 3-2.5L20 15M15.5 9.5h.01", pen: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4", dots: "M12 5.5h.01M12 12h.01M12 18.5h.01",
    undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3", check: "M5 12.5l4.5 4.5L19 7.5", ai: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
    share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
    trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13", doc: "M6.5 3.5h11v17h-11zM9 8h6M9 11.5h6M9 15h3.5", plan: "M4 4h16v16H4zM4 12h8v8M12 4v4"
  };
  const ico = k => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICO[k] + '"/></svg>';
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number.isFinite(Number(n)) ? Number(n) : 0);
  const fmt = (n, d) => Number(n || 0).toLocaleString("en-AU", { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: d == null ? 0 : d });
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  /* views: <section class="view" data-view="x">; go() remembers the way back for the phone's back button */
  let stack = [], cur = null;
  function show(name) {
    document.querySelectorAll(".view").forEach(v => { v.hidden = v.dataset.view !== name; });
    cur = name; window.scrollTo(0, 0); document.dispatchEvent(new CustomEvent("est-view", { detail: name }));
  }
  function go(name, replace) { if (cur && cur !== name && !replace) stack.push(cur); show(name); }
  function back() { const s = document.querySelector(".sheet"); if (s) { closeSheet(); return true; } const p = stack.pop(); if (p == null) return false; show(p); return true; }
  function home(name) { stack = []; show(name); }

  /* bottom sheets */
  function sheet(html, cls) {
    closeSheet();
    const bg = document.createElement("div"); bg.className = "scrim"; bg.addEventListener("click", closeSheet);
    const s = document.createElement("div"); s.className = "sheet " + (cls || ""); s.innerHTML = '<div class="grab"></div>' + html;
    document.body.append(bg, s); return s;
  }
  function closeSheet() { document.querySelectorAll(".scrim,.sheet").forEach(n => n.remove()); }
  function menu(items) { // items: [label, fn, danger]
    const s = sheet('<div class="menu">' + items.map((m, i) => '<button class="mi' + (m[2] ? " danger" : "") + '" data-mi="' + i + '">' + esc(m[0]) + "</button>").join("") + "</div>");
    s.addEventListener("click", e => { const b = e.target.closest("[data-mi]"); if (!b) return; closeSheet(); items[+b.dataset.mi][1](); });
  }
  /* box buttons: [[value,label]], current value, attribute name */
  function box(items, val, attr, cls) {
    return '<div class="box ' + (cls || "") + '" role="group">' + items.map(([v, l]) => '<button type="button" data-' + attr + '="' + esc(v) + '" aria-pressed="' + (String(v) === String(val)) + '">' + esc(l) + "</button>").join("") + "</div>";
  }
  /* one long rounded box with a titled row per setting: group([["Job", html], ...]) */
  function group(rows) { return '<div class="card sc">' + rows.filter(Boolean).map(r => '<div class="sr">' + (r[0] ? '<div class="sl">' + r[0] + "</div>" : "") + r[1] + "</div>").join("") + "</div>"; }
  const seg = (items, val, attr) => box(items, val, attr, "seg");
  function steps(names, on, attr) {
    return '<nav class="steps">' + names.map((n, i) => '<button type="button" data-' + attr + '="' + i + '" class="' + (i === on ? "on" : i < on ? "done" : "") + '"><span>' + (i < on ? "✓" : i + 1) + "</span>" + esc(n) + "</button>").join("") + "</nav>";
  }
  function toast(t) { let el = document.getElementById("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600); }
  function ask(title, msg, okLabel, fn, danger) {
    const s = sheet("<h3>" + esc(title) + '</h3><p class="sub">' + esc(msg) + '</p><div class="row end"><button class="btn" data-x>Cancel</button><button class="btn pri" data-ok style="' + (danger ? "background:#A50E0E;border-color:#A50E0E" : "") + '">' + esc(okLabel) + "</button></div>");
    s.querySelector("[data-x]").onclick = closeSheet; s.querySelector("[data-ok]").onclick = () => { closeSheet(); fn(); };
  }

  /* the phone (GPNative): nat("method", {..}) answers through window.onNative(id, json) */
  const cbs = {}; let cbn = 0;
  function nat(method, payload) {
    return new Promise(res => {
      const N = window.GPNative; if (!N || !N[method]) return res({ ok: false, error: "This only works in the ShopMate AI app." });
      const id = "en" + (++cbn) + "_" + Date.now(); cbs[id] = res;
      try { N[method](id, JSON.stringify(payload || {})); } catch (e) { delete cbs[id]; res({ ok: false, error: String(e) }); }
    });
  }
  /* PDF: the phone makes a real PDF and opens the share sheet; in a browser it prints */
  function pdf(html, filename) {
    if (window.GPNative && window.GPNative.sharePdfHtml) { nat("sharePdfHtml", { html: html, filename: filename }).then(r => { if (!r.ok) toast(r.error || "Couldn't make the PDF"); }); return; }
    const f = document.createElement("iframe"); f.style.cssText = "position:fixed;width:0;height:0;border:0"; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.print(); } catch (e) { } setTimeout(() => f.remove(), 4000); }, 300);
  }
  function share(name, content, mime) {
    const N = window.GPNative;
    if (N && N.shareFile) { try { N.shareFile("es" + Date.now(), JSON.stringify({ filename: name, content: content, mime: mime, subject: name })); return; } catch (e) { } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /* the business on the main app (name / phone / email / ABN for quotes) */
  function biz() {
    try { const d = JSON.parse(localStorage.getItem("gp-invoices-v1") || "null"), L = (d && d.settings && d.settings.businesses) || []; return L.find(x => x.id === d.activeBiz) || L[0] || {}; } catch (e) { return {}; }
  }

  window.onBack = back;
  window.onNative = function (id, json) { const f = cbs[id]; if (!f) return; delete cbs[id]; let r; try { r = JSON.parse(json); } catch (e) { r = { ok: false, error: "No answer from the phone" }; } f(r); };
  /* time away from the app: the main screen uses it to decide whether to ask for the PIN on the way back */
  window.onAppPause = function () { try { sessionStorage.setItem("smPaused", String(Date.now())); } catch (e) { } };
  window.onAppResume = function () { try { const p = Number(sessionStorage.getItem("smPaused") || 0); if (p) { sessionStorage.setItem("smAway", String(Math.max(Number(sessionStorage.getItem("smAway") || 0), Date.now() - p))); sessionStorage.removeItem("smPaused"); } } catch (e) { } };
  /* number boxes: tapping selects the old number so typing replaces it */
  document.addEventListener("focusin", e => { const t = e.target; if (t && t.tagName === "INPUT" && t.type === "number") setTimeout(() => { try { t.select(); } catch (x) { } }, 0); });

  window.EST = { ico, esc, money, fmt, num, go, back, home, show, sheet, closeSheet, menu, box, steps, toast, ask, nat, pdf, share, biz, group, seg, get view() { return cur; } };
})();
