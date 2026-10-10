/* ShopMate AI on iPhone (and any web browser).
   Gives the app screens the same window.GPNative bridge they use on Android and Windows,
   built from what a browser can do: file pickers, the share sheet, PDFs drawn in the page,
   Google AI and your Google link called directly. */
(function () {
  "use strict";
  if (window.GPNative) return;
  const BUILD = "92";
  const UA = navigator.userAgent || "";
  const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ANDROID = /Android/.test(UA);
  const STANDALONE = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const HERE = location.href.split("#")[0];
  const SITE = new URL("../", HERE).href; // the download page sits one folder up from the app

  /* ---------- small helpers ---------- */
  const ok = o => Object.assign({ ok: true }, o || {});
  const err = m => ({ ok: false, error: String(m) });
  const SK = "shopmate-web";
  const store = {
    all() { try { return JSON.parse(localStorage.getItem(SK) || "{}") || {}; } catch (e) { return {}; } },
    get(k, d) { const v = this.all()[k]; return v === undefined ? d : v; },
    set(k, v) { const s = this.all(); s[k] = v; try { localStorage.setItem(SK, JSON.stringify(s)); } catch (e) { } }
  };
  const cleanName = n => String(n || "file").replace(/[\\/:*?"<>|]+/g, "").trim() || "file";
  const b64ToBytes = b => { const s = atob(String(b || "").replace(/^data:[^,]*,/, "")); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const mimeOfDataUrl = d => (/^data:([^;,]+)/.exec(d || "") || [])[1] || "image/jpeg";
  const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("Couldn't load part of the app. Check your internet and try again.")); }; document.head.appendChild(s); }));
  }

  /* ---------- small IndexedDB store for pictures (ads) ---------- */
  function idb(op, key, val) {
    return new Promise((res) => {
      let rq; try { rq = indexedDB.open("shopmate-web", 1); } catch (e) { return res(null); }
      rq.onupgradeneeded = () => rq.result.createObjectStore("files");
      rq.onerror = () => res(null);
      rq.onsuccess = () => {
        const db = rq.result, tx = db.transaction("files", op === "get" ? "readonly" : "readwrite"), st = tx.objectStore("files");
        const r = op === "get" ? st.get(key) : op === "put" ? st.put(val, key) : st.delete(key);
        r.onsuccess = () => res(op === "get" ? r.result : true); r.onerror = () => res(null);
        tx.oncomplete = () => db.close();
      };
    });
  }

  /* ---------- a tap when the phone insists on one ----------
     iPhone only opens the camera, the share sheet or Messages straight after a tap.
     When the work took a moment (making a PDF, asking Google), we show one button to finish. */
  function hasTap() { const u = navigator.userActivation; return u ? !!u.isActive : true; }
  function withTap(title, label, fn, force) {
    if (!force && hasTap()) { try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); } }
    return new Promise((res, rej) => {
      const box = document.createElement("div");
      box.className = "gpw-tap";
      box.innerHTML = '<div class="gpw-card"><b></b><div class="gpw-btns"><button type="button" class="gpw-no">Cancel</button><button type="button" class="gpw-yes"></button></div></div>';
      box.querySelector("b").textContent = title; box.querySelector(".gpw-yes").textContent = label;
      document.body.appendChild(box);
      box.querySelector(".gpw-no").onclick = () => { box.remove(); res(null); };
      box.querySelector(".gpw-yes").onclick = () => { box.remove(); try { res(fn()); } catch (e) { rej(e); } };
    });
  }

  /* ---------- choosing files and photos ---------- */
  function pickFiles(opts) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = opts.accept || "*/*"; if (opts.multiple) inp.multiple = true; if (opts.capture) inp.setAttribute("capture", "environment");
    inp.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0";
    document.body.appendChild(inp);
    return new Promise(res => {
      let done = false;
      const fin = v => { if (done) return; done = true; setTimeout(() => inp.remove(), 0); res(v); };
      inp.addEventListener("change", () => fin(inp.files && inp.files.length ? Array.from(inp.files) : null));
      inp.addEventListener("cancel", () => fin(null));
      withTap(opts.title || "Choose a file", opts.button || "Choose", () => inp.click()).then(v => { if (v === null) fin(null); }, () => fin(null));
    });
  }
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That picture couldn't be opened")); i.src = src; }); }
  async function imageData(file, max, jpeg) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url), w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const x = c.getContext("2d"); if (jpeg) { x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(img, 0, 0, c.width, c.height);
      return jpeg ? c.toDataURL("image/jpeg", 0.85) : c.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  }
  const isPdf = f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name || "");
  let lastDoc = null, imports = []; // what the AI reads with attachDoc: { b64, mime }
  async function docOf(file) {
    if (isPdf(file)) return { b64: await blobToB64(file), mime: "application/pdf" };
    const d = await imageData(file, 2000, true); return { b64: d.split(",")[1], mime: "image/jpeg" };
  }

  /* ---------- handing files over: share sheet (Save to Files, Print, WhatsApp, Mail…) or a download ---------- */
  function download(file) {
    const a = document.createElement("a"), u = URL.createObjectURL(file);
    a.href = u; a.download = file.name; a.rel = "noopener"; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 60000);
  }
  async function deliver(files, o) {
    o = o || {};
    const data = { files };
    if (o.title) data.title = o.title;
    if (o.text) data.text = o.text;
    const can = navigator.share && navigator.canShare && (() => { try { return navigator.canShare({ files }); } catch (e) { return false; } })();
    if (!can) { files.forEach(download); return ok({ downloaded: true }); }
    const go = () => { if (o.copy) { try { navigator.clipboard.writeText(o.copy); } catch (e) { } } return navigator.share(data); };
    try {
      const r = await withTap(o.ready || "Your file is ready", o.button || "Share", go);
      return r === null ? ok({ cancelled: true }) : ok();
    } catch (e) {
      if (e && e.name === "AbortError") return ok({ cancelled: true });
      if (e && e.name === "NotAllowedError") {
        try { const r = await withTap(o.ready || "Your file is ready", o.button || "Share", go, true); return r === null ? ok({ cancelled: true }) : ok(); }
        catch (e2) { if (e2 && e2.name === "AbortError") return ok({ cancelled: true }); }
      }
      files.forEach(download); return ok({ downloaded: true });
    }
  }
  function openScheme(url, title, label) {
    // tel:, sms:, mailto: and WhatsApp links: open them in the right app
    const go = () => { if (/^https?:/i.test(url)) { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; } else location.href = url; };
    return withTap(title || "Ready", label || "Open", go);
  }
  function smsUrl(phone, body) {
    const p = String(phone || "").replace(/[^\d+,]/g, "");
    return "sms:" + p + (IOS ? "&" : "?") + "body=" + encodeURIComponent(String(body || ""));
  }

  /* ---------- PDFs: draw the page, then cut it into A4 sheets ---------- */
  async function pdfLibs() { await loadScript("vendor/html2canvas.min.js"); await loadScript("vendor/jspdf.umd.min.js"); }
  async function htmlToPdf(html, landscape, paper) {
    await pdfLibs();
    const P = paper === "letter" ? [215.9, 279.4] : [210, 297], pw = landscape ? P[1] : P[0], ph = landscape ? P[0] : P[1];
    const mm = (/@page\s*\{[^}]*margin\s*:\s*([\d.]+)mm/i.exec(html) || [])[1], M = mm ? parseFloat(mm) : 0;
    const PX = 96 / 25.4, cw = Math.round((pw - 2 * M) * PX), pageH = Math.floor((ph - 2 * M) * PX);
    const fr = document.createElement("iframe");
    fr.setAttribute("aria-hidden", "true");
    fr.style.cssText = "position:fixed;left:-20000px;top:0;width:" + cw + "px;height:" + pageH + "px;border:0;background:#fff";
    document.body.appendChild(fr);
    try {
      await new Promise(res => { fr.onload = res; fr.srcdoc = String(html).replace(/<head>/i, '<head><style>html,body{background:#fff!important}</style>'); });
      const doc = fr.contentDocument;
      try { await doc.fonts.ready; } catch (e) { }
      await Promise.all(Array.from(doc.images).map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      let total = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
      fr.style.height = total + "px"; await sleep(30);
      total = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1);
      // where a page may end: never through a table row, line of text, picture or a box that wants to stay whole
      const atoms = [], forced = new Set();
      const sy = fr.contentWindow.scrollY || 0;
      doc.body.querySelectorAll("*").forEach(el => {
        const r = el.getBoundingClientRect(); if (!r.height) return;
        const top = r.top + sy, bot = r.bottom + sy, cs = fr.contentWindow.getComputedStyle(el), tag = el.tagName;
        if (/^(page|always)$/.test(cs.breakBefore) || cs.pageBreakBefore === "always") forced.add(Math.round(top));
        if (/^(page|always)$/.test(cs.breakAfter) || cs.pageBreakAfter === "always") forced.add(Math.round(bot));
        const atomic = /^(TR|LI|P|H1|H2|H3|H4|H5|IMG|SVG|CANVAS|SPAN|B|LABEL)$/.test(tag) || cs.breakInside === "avoid" || cs.pageBreakInside === "avoid" || !el.firstElementChild;
        if (atomic && bot - top < pageH * 0.9) atoms.push([top, bot]);
      });
      const inside = y => atoms.some(a => a[0] < y - 0.5 && a[1] > y + 0.5);
      const cands = Array.from(new Set(atoms.flatMap(a => [Math.round(a[0]), Math.round(a[1])]))).sort((a, b) => b - a);
      const forcedList = Array.from(forced).filter(y => y > 0 && y < total).sort((a, b) => a - b);
      const slices = []; let y0 = 0;
      while (y0 < total - 2) {
        let y1 = Math.min(total, y0 + pageH);
        const f = forcedList.find(y => y > y0 + 4 && y <= y1);
        if (f) y1 = f;
        else if (y1 < total) { const c = cands.find(y => y <= y1 && y > y0 + pageH * 0.4 && !inside(y)); if (c) y1 = c; }
        slices.push([y0, y1]); y0 = y1;
        if (slices.length > 300) break;
      }
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: paper === "letter" ? "letter" : "a4", compress: true });
      const scale = Math.min(2, Math.sqrt(12e6 / (cw * pageH)));
      for (let i = 0; i < slices.length; i++) {
        const [a, b] = slices[i];
        const c = await window.html2canvas(doc.documentElement, { scale, x: 0, y: a, width: cw, height: b - a, windowWidth: cw, windowHeight: total, scrollX: 0, scrollY: 0, backgroundColor: "#ffffff", useCORS: true, logging: false });
        if (i) pdf.addPage();
        pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", M, M, pw - 2 * M, (b - a) / PX, undefined, "FAST");
        c.width = c.height = 0;
      }
      return pdf.output("blob");
    } finally { fr.remove(); }
  }
  const invoicePdf = model => htmlToPdf(window.ShopPdf.modelHtml(model || {}), false, "a4");

  /* ---------- your Google link (the owner's Apps Script) ---------- */
  async function google(req, body) {
    const url = ((req.link || {}).url || "").trim();
    if (!url.startsWith("https://script.google.com/")) throw new Error("The Google link isn't set up. Paste your Web app link in Settings → Google link.");
    body.key = (req.link || {}).key || "";
    let r;
    try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow" }); }
    catch (e) { throw new Error("Couldn't reach your Google link. Check your internet and try again."); }
    const t = (await r.text()).trim();
    if (!t.startsWith("{")) throw new Error("Google didn't answer properly (code " + r.status + "). Check the script is deployed as a Web app that runs as you, with access for Anyone.");
    return JSON.parse(t);
  }

  /* ---------- Google AI (Gemini) ---------- */
  const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
  let aiAbort = null;
  const aiOut = (id, t, done) => { if (window.onAiChunk) window.onAiChunk(id, t, done); };
  async function aiAskCloud(id, req) {
    const send = (t, done) => aiOut(id, t, done);
    const key = store.get("gkey", "");
    if (!key) return send("[[ERR]]Add your free Google AI key first", true);
    const body = { contents: [], generationConfig: { temperature: req.temperature == null ? 0.4 : req.temperature } };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    (req.history || []).forEach((h, i) => body.contents.push({ role: i % 2 === 0 ? "user" : "model", parts: [{ text: String(h) }] }));
    const parts = [];
    if (req.attachDoc && lastDoc) parts.push({ inline_data: { mime_type: lastDoc.mime, data: lastDoc.b64 } });
    parts.push({ text: req.text || "" });
    body.contents.push({ role: "user", parts });
    if (req.json) body.generationConfig.responseMimeType = "application/json";
    const start = store.get("gmodel", MODELS[0]), order = [start].concat(MODELS.filter(m => m !== start));
    let lastErr = "", limited = false, prevPass = 0, busyAny = false;
    const gone = new Set(), tries = [];
    for (let pass = 0; pass < 3; pass++) order.forEach(m => tries.push([m, pass]));
    for (const [m, pass] of tries) {
      if (pass !== prevPass) { if (!busyAny) break; busyAny = false; prevPass = pass; await sleep(pass * 5000); }
      if (gone.has(m)) continue;
      aiAbort = new AbortController();
      let r;
      try {
        r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":streamGenerateContent?alt=sse", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: aiAbort.signal });
      } catch (e) { if (e.name === "AbortError") return send("", true); return send("[[ERR]]No connection to Google AI. Check your internet.", true); }
      if (r.status !== 200) {
        let msg = ""; try { msg = ((await r.json()).error || {}).message || ""; } catch (e) { }
        if (/API key|API_KEY/.test(msg) || r.status === 401 || r.status === 403) return send("[[ERR]]Google didn't accept the AI key. Check it in the ✨ Ask AI screen.", true);
        if (r.status === 404 || /not found|is not supported/.test(msg)) { gone.add(m); lastErr = "Google AI model " + m + " isn't available"; continue; }
        if (r.status === 429) { limited = true; busyAny = true; continue; }
        if (r.status >= 500) { busyAny = true; lastErr = "Google's AI is very busy right now. Wait a minute and try again."; continue; }
        return send("[[ERR]]Google AI error " + r.status + (msg ? ": " + msg : ""), true);
      }
      let any = false, buf = "";
      try {
        const reader = r.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim(); if (!data) continue;
            const o = JSON.parse(data), c = (o.candidates || [])[0];
            if (!c) { if (o.promptFeedback && o.promptFeedback.blockReason) return send("[[ERR]]Google AI declined to answer that.", true); continue; }
            ((c.content || {}).parts || []).forEach(p => { if (!p.thought && p.text) { any = true; send(p.text, false); } });
          }
        }
      } catch (e) { if (e.name === "AbortError") return send("", true); return send("[[ERR]]The answer was cut off. Try again.", true); }
      if (!any) return send("[[ERR]]Google AI sent an empty answer. Try asking again.", true);
      if (m !== start && gone.has(start)) store.set("gmodel", m);
      return send("", true);
    }
    if (limited && !/busy/.test(lastErr)) lastErr = "The free Google AI limit is used up for now. Try again in a minute (or tomorrow if it's the daily limit).";
    send("[[ERR]]" + (lastErr || "Google AI didn't answer"), true);
  }

  /* ---------- Facebook & Instagram ---------- */
  const FB = "https://graph.facebook.com/";
  function fbError(j) {
    const e = (j || {}).error; if (!e) return "Facebook didn't accept it";
    if (e.code === 190) return "The Facebook Page token has expired or isn't valid. Connect the Page again.";
    if (e.code === 200 || e.code === 10) return "That token can't post to the Page. It needs the pages_manage_posts permission and must be a Page token. (" + e.message + ")";
    return e.message || "Facebook error";
  }
  async function fbPhoto(page, token, dataUrl, fields) {
    const fd = new FormData();
    fd.append("access_token", token);
    Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
    fd.append("source", new Blob([b64ToBytes(dataUrl)], { type: "image/jpeg" }), "ad.jpg");
    return (await fetch(FB + encodeURIComponent(page) + "/photos", { method: "POST", body: fd })).json();
  }
  const fbForm = async (url, params) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() })).json();

  /* ---------- reminders: shown while the app is open (an iPhone web app can't wake itself up) ---------- */
  const timers = {};
  function showNote(n) {
    const title = n.title || "Reminder", body = n.text || "";
    const inPage = () => { try { if (window.toast) window.toast("⏰ " + title + (body ? ": " + body : "")); } catch (e) { } };
    try {
      if (window.Notification && Notification.permission === "granted" && navigator.serviceWorker) {
        navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.showNotification(title, { body, icon: "icons/icon-192.png" }); else inPage(); }, inPage);
        if (document.visibilityState === "visible") inPage();
        return;
      }
    } catch (e) { }
    inPage();
  }
  function armNote(id, n) {
    clearTimeout(timers[id]);
    const wait = n.when - Date.now();
    if (wait < -60000 || wait > 2147000000) return;
    timers[id] = setTimeout(() => { showNote(n); const all = store.get("notes", {}); delete all[id]; store.set("notes", all); }, Math.max(0, wait));
  }
  function restoreNotes() { const all = store.get("notes", {}); Object.entries(all).forEach(([id, n]) => { if (n.when < Date.now() - 3600e3) delete all[id]; else armNote(id, n); }); store.set("notes", all); }

  /* ---------- the bridge ---------- */
  const H = {
    async askPermissions() {
      try { if (window.Notification && Notification.permission === "default" && STANDALONE) await Notification.requestPermission(); } catch (e) { }
      return ok();
    },
    async setBars(r) {
      let m = document.querySelector('meta[name="theme-color"]');
      if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
      if (r.status) m.content = r.status;
      return ok();
    },
    ping: r => google(r, { action: "ping" }),
    backup: r => google(r, { action: "backup", data: r.data || "" }),
    restore: r => google(r, { action: "restore" }),
    async gcall(r) { return google(r, Object.assign({}, r.body || {})); },
    async send(r) {
      const res = ok(), hasLink = /^https:\/\/script\.google\.com\//.test(((r.link || {}).url || "").trim());
      let fileUrl = "";
      if (hasLink) {
        let g;
        try {
          const pdf = await invoicePdf(r.pdf);
          g = await google(r, { action: "send", pdf: await blobToB64(pdf), filename: r.filename || "Invoice.pdf", fromName: r.fromName || "", replyTo: r.replyTo || "", shareLink: !!(r.sms && r.smsLink !== false), folder: r.folder || "", to: (r.email || {}).to || "", subject: (r.email || {}).subject || "", body: (r.email || {}).body || "" });
        } catch (e) { g = err(e.message); }
        if (g.ok) { fileUrl = g.fileUrl || ""; res.drive = ok(); if (r.email) res.email = ok(); }
        else { res.drive = err(g.error || "Google didn't answer"); if (r.email) res.email = err(g.error || "Google didn't answer"); }
      } else { res.drive = err("Google link not set up"); if (r.email) res.email = err("Set up the Google link in Settings to send emails from the app."); }
      res.fileUrl = fileUrl;
      if (r.sms) {
        const text = String(r.sms.text || "").split("\n").filter(l => !l.includes("{link}") || fileUrl).map(l => l.replace("{link}", fileUrl)).join("\n").trim();
        const done = await openScheme(smsUrl(r.sms.phone, text), "Your text is ready", "Open Messages");
        res.sms = done === null ? err("Cancelled") : ok({ manual: true });
      }
      return res;
    },
    async share(r) {
      const pdf = await invoicePdf(r.pdf), name = cleanName(r.filename || "Invoice.pdf");
      return deliver([new File([pdf], name, { type: "application/pdf" })], { title: name, text: r.text || "", ready: "Your PDF is ready", button: "Share PDF" });
    },
    async print(r) {
      const pdf = await htmlToPdf(r.html || "", r.landscape, r.paper), name = cleanName((r.name || "ShopMate") + ".pdf");
      return deliver([new File([pdf], name, { type: "application/pdf" })], { title: name, ready: "Ready to print. In the next screen choose Print (or Save to Files).", button: "Print / save" });
    },
    async schedule(r) {
      const res = ok();
      if (r.sms) res.sms = err("Text reminders can only be scheduled from an Android phone. On iPhone, use email reminders.");
      if (r.email) {
        if (!/^https:\/\/script\.google\.com\//.test(((r.link || {}).url || "").trim())) res.email = err("Set up the Google link in Settings to schedule emails.");
        else {
          let g;
          try { const pdf = await invoicePdf(r.pdf); g = await google(r, { action: "schedule", id: r.id, when: new Date(r.when).toISOString(), to: r.email.to || "", subject: r.email.subject || "", body: r.email.body || "", fromName: r.fromName || "", replyTo: r.replyTo || "", pdf: await blobToB64(pdf), filename: r.filename || "Invoice.pdf", folder: r.folder || "" }); }
          catch (e) { g = err(e.message); }
          res.email = g.ok ? ok() : err(g.error || "Google didn't answer");
        }
      }
      return res;
    },
    async status(r) {
      const res = ok({ sms: {} });
      if ((r.emailIds || []).length && ((r.link || {}).url || "")) { try { const g = await google(r, { action: "status", ids: r.emailIds }); if (g.ok) res.email = g.items; } catch (e) { } }
      return res;
    },
    async cancel(r) {
      const ids = r.ids || [], all = store.get("notes", {});
      ids.forEach(id => { clearTimeout(timers[id]); delete all[id]; }); store.set("notes", all);
      const res = ok();
      if (ids.length && ((r.link || {}).url || "")) { try { res.email = await google(r, { action: "cancel", ids }); } catch (e) { res.email = err(e.message); } }
      return res;
    },
    async notifyAt(r) { const all = store.get("notes", {}); (r.items || []).forEach(it => { all[it.id] = { when: Number(it.when), title: it.title || "Reminder", text: it.text || "" }; armNote(it.id, all[it.id]); }); store.set("notes", all); return ok({ exact: true }); },
    broadcast: async () => err("Group texts send automatically from an Android phone. On iPhone, send the group by email instead."),
    scheduleMany: async () => err("Group texts can only be scheduled from an Android phone."),
    async pickImage() { const f = await pickFiles({ accept: "image/*", title: "Choose a picture" }); return f ? ok({ dataUrl: await imageData(f[0], 360, false) }) : err("Cancelled"); },
    async pickPhoto() { const f = await pickFiles({ accept: "image/*", title: "Choose a photo" }); return f ? ok({ dataUrl: await imageData(f[0], 1600, true) }) : err("Cancelled"); },
    async pickCam() { const f = await pickFiles({ accept: "image/*", capture: true, title: "Take a photo", button: "Open camera" }); return f ? ok({ dataUrl: await imageData(f[0], 1600, true) }) : err("Cancelled"); },
    async pickText() {
      const f = await pickFiles({ accept: ".csv,.json,.txt,.tsv,text/plain,text/csv,application/json", title: "Choose a file" });
      if (!f) return err("Cancelled");
      return ok({ text: await f[0].text(), name: f[0].name });
    },
    async scanDoc() {
      const f = await pickFiles({ accept: "image/*,application/pdf,.pdf", title: "Choose the invoice photo or PDF", button: "Choose" });
      if (!f) return err("Cancelled");
      lastDoc = await docOf(f[0]);
      return ok({ kind: lastDoc.mime === "application/pdf" ? "pdf" : "image", text: "", desktop: true });
    },
    async pickDocs() {
      const f = await pickFiles({ accept: "image/*,application/pdf,.pdf", multiple: true, title: "Choose the invoices (photos or PDFs)", button: "Choose" });
      if (!f) return err("Cancelled");
      imports = f.slice(0, 200);
      return ok({ files: imports.map(x => ({ name: x.name || "file", kind: isPdf(x) ? "pdf" : "image" })) });
    },
    async useImport(r) { const x = imports[r.i]; if (!x) return err("That file is no longer available"); lastDoc = await docOf(x); return ok(); },
    async useDoc(r) { lastDoc = { b64: String(r.dataUrl || "").split(",")[1] || "", mime: mimeOfDataUrl(r.dataUrl) }; return ok(); },
    async shareFile(r) {
      const name = cleanName(r.filename || "file.txt"), type = r.mime || (r.b64 ? "application/octet-stream" : "text/plain");
      const file = new File([r.b64 ? b64ToBytes(r.b64) : String(r.content || "")], name, { type });
      return deliver([file], { title: name });
    },
    async openFile(r) { return H.shareFile(r); },
    async shareImage(r) {
      const name = cleanName(r.filename || "ad.jpg");
      const file = new File([b64ToBytes(r.dataUrl || "")], name, { type: mimeOfDataUrl(r.dataUrl) });
      return deliver([file], { text: r.text || "", copy: r.text || "", ready: r.text ? "Your picture is ready. The caption is copied too, paste it if the app drops it." : "Your picture is ready", button: "Share" });
    },
    async adFile(r) {
      const k = "ad:" + cleanName(r.name || "ad");
      if (r.op === "save") await idb("put", k, r.dataUrl || "");
      else if (r.op === "load") return ok({ dataUrl: (await idb("get", k)) || "" });
      else if (r.op === "delete") await idb("del", k);
      else if (r.op === "gallery") { const name = cleanName(r.title || "ShopMate ad") + ".jpg"; return deliver([new File([b64ToBytes(r.dataUrl || "")], name, { type: "image/jpeg" })], { ready: "Save the picture: choose Save Image in the next screen.", button: "Save" }); }
      return ok();
    },
    async fbConnect(r) {
      const page = String(r.pageId || "").trim(), token = String(r.token || "").trim();
      const j = await (await fetch(FB + encodeURIComponent(page) + "?fields=name,instagram_business_account%7Bid,username%7D&access_token=" + encodeURIComponent(token))).json();
      if (j.error || !j.name) return err(fbError(j));
      const ig = j.instagram_business_account || {};
      store.set("fb", { page: j.id || page, token, name: j.name, ig: ig.id || "", igUser: ig.username || "" });
      return ok({ pageName: j.name, igUser: ig.username || "" });
    },
    async fbForget() { store.set("fb", {}); return ok(); },
    async fbPost(r) {
      const f = store.get("fb", {}); if (!f.page || !f.token) return err("Connect your Facebook Page first");
      const j = await fbPhoto(f.page, f.token, r.dataUrl, Object.assign({ caption: r.caption || "" }, r.at > 0 ? { published: "false", scheduled_publish_time: r.at } : {}));
      return j.error ? err(fbError(j)) : ok({ id: j.post_id || j.id });
    },
    async igPost(r) {
      const f = store.get("fb", {}); if (!f.ig) return err("No Instagram business account is linked to your Facebook Page.");
      const up = await fbPhoto(f.page, f.token, r.dataUrl, { published: "false" }); if (up.error) return err(fbError(up));
      const ph = await (await fetch(FB + up.id + "?fields=images&access_token=" + encodeURIComponent(f.token))).json();
      const src = ((ph.images || [])[0] || {}).source; if (!src) return err("Couldn't prepare the picture for Instagram");
      const media = await fbForm(FB + f.ig + "/media", { image_url: src, caption: r.caption || "", access_token: f.token }); if (media.error) return err(fbError(media));
      let pub = null;
      for (let i = 0; i < 6; i++) { pub = await fbForm(FB + f.ig + "/media_publish", { creation_id: media.id, access_token: f.token }); if (!pub.error) break; await sleep(2500); }
      return !pub || pub.error ? err(pub ? fbError(pub) : "Instagram didn't answer") : ok({ id: pub.id });
    },
    async aiSetKey(r) { store.set("gkey", String(r.key || "").trim()); return ok(); },
    aiDownload: async () => err("The offline AI is only on Android phones. On iPhone, use the free Google AI."),
    aiDelete: async () => ok(),
    aiLoad: async () => err("The offline AI is only on Android phones."),
    async unlock(r) {
      if (!r.device) return err("cancelled");
      const yes = window.confirm("Open ShopMate AI without the PIN?\n\nOnly do this if you're the owner. Then set a new PIN in Settings → PIN & fingerprint.");
      return yes ? ok() : err("cancelled");
    },
    async shareApp() {
      const text = "Here's ShopMate AI. Open this link on your phone or computer and it shows the right version for it:";
      if (navigator.share) {
        try { const r = await withTap("Share ShopMate AI", "Share", () => navigator.share({ title: "ShopMate AI", text, url: SITE })); return r === null ? ok({ cancelled: true }) : ok(); }
        catch (e) { if (e && e.name === "AbortError") return ok({ cancelled: true }); }
      }
      try { await navigator.clipboard.writeText(text + " " + SITE); return ok({ copied: true }); } catch (e) { return err("Couldn't share. The link is " + SITE); }
    },
    async factoryReset() {
      Object.keys(timers).forEach(id => clearTimeout(timers[id]));
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) { }
      try { indexedDB.deleteDatabase("shopmate-web"); } catch (e) { }
      setTimeout(() => location.reload(), 250);
      return ok();
    }
  };

  const reply = (id, o) => { if (window.onNative) window.onNative(id, JSON.stringify(o)); };
  const bridge = {
    info: () => JSON.stringify({ native: true, web: true, ios: IOS, android: ANDROID, standalone: STANDALONE, canSms: false, exactAlarms: true, bio: false, site: SITE, version: "1.0." + BUILD + (IOS ? " (iPhone)" : " (web)") }),
    aiStatus: () => JSON.stringify({ ok: true, state: "none", model: "", desktop: true }),
    aiCloudInfo: () => JSON.stringify({ ok: true, hasKey: !!store.get("gkey", ""), model: store.get("gmodel", MODELS[0]) }),
    fbInfo: () => { const f = store.get("fb", {}); return JSON.stringify({ ok: true, connected: !!(f.page && f.token), pageId: f.page || "", pageName: f.name || "", igId: f.ig || "", igUser: f.igUser || "" }); },
    takeShared: () => "",
    openUrl: u => { openScheme(String(u || ""), "Ready", "Open"); },
    copyText: t => { try { navigator.clipboard.writeText(String(t || "")).catch(() => fallbackCopy(t)); } catch (e) { fallbackCopy(t); } },
    openSms: (phone, body) => { openScheme(smsUrl(phone, body), "Your text is ready", "Open Messages"); },
    emailGroup: j => { let r = {}; try { r = JSON.parse(j || "{}"); } catch (e) { } openScheme("mailto:?bcc=" + encodeURIComponent((r.bcc || []).join(",")) + "&subject=" + encodeURIComponent(r.subject || "") + "&body=" + encodeURIComponent(r.body || ""), "Your email is ready", "Open Mail"); },
    aiStop: () => { if (aiAbort) aiAbort.abort(); },
    openAlarmSettings: () => { }
  };
  function fallbackCopy(t) {
    const ta = document.createElement("textarea"); ta.value = String(t || ""); ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { } ta.remove();
  }
  Object.keys(H).concat(["aiAskCloud", "aiAsk"]).forEach(m => {
    bridge[m] = (id, json) => {
      let r = {}; try { r = JSON.parse(json || "{}"); } catch (e) { }
      if (m === "aiAskCloud") { aiAskCloud(id, r).catch(e => aiOut(id, "[[ERR]]" + (e.message || e), true)); return; }
      if (m === "aiAsk") { setTimeout(() => aiOut(id, "[[ERR]]The offline AI is only on Android phones. Switch to the free Google AI.", true), 0); return; }
      Promise.resolve().then(() => H[m](r)).then(v => reply(id, v || ok()), e => reply(id, err(e && e.message || e)));
    };
  });
  window.GPNative = bridge;

  /* ---------- the page around the app ---------- */
  // Back: swipe back / browser back / Esc go back a step inside the app instead of leaving it.
  try {
    history.replaceState({ gp: 0 }, ""); history.pushState({ gp: 1 }, "");
    window.addEventListener("popstate", () => {
      let handled = false; try { handled = !!(window.onBack && window.onBack()); } catch (e) { }
      if (handled) history.pushState({ gp: 1 }, ""); else history.back();
    });
  } catch (e) { }
  window.addEventListener("keydown", e => { if (e.key === "Escape" && !document.querySelector(".pk-back") && window.onBack && window.onBack()) e.preventDefault(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { if (window.onAppResume) window.onAppResume(); }
    else if (window.onAppPause) window.onAppPause();
  });

  const css = '.gpw-tap{position:fixed;inset:0;z-index:100000;background:rgba(16,18,26,.5);display:flex;align-items:flex-end;justify-content:center;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}' +
    '.gpw-card{background:var(--surface,#fff);color:var(--ink,#1B2230);border-radius:18px;padding:18px;width:100%;max-width:440px;box-sizing:border-box;font:16px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)}' +
    '.gpw-card b{display:block;margin-bottom:14px}.gpw-btns{display:flex;gap:10px}.gpw-btns button{flex:1;min-height:48px;border-radius:12px;border:1px solid var(--line,#ddd);background:var(--surface,#fff);color:inherit;font:inherit;font-weight:700}' +
    '.gpw-btns .gpw-yes{background:var(--gold,#E3A21A);border-color:transparent;color:#1B2230}' +
    '.gpw-inst{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9000;background:#1B2230;color:#fff;border-radius:16px;padding:14px 44px 14px 14px;font:15px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:520px;margin:0 auto}' +
    '.gpw-inst b{color:#F5C451}.gpw-inst button{position:absolute;top:6px;right:6px;width:36px;height:36px;border:0;background:transparent;color:#fff;font-size:20px}' +
    'body.web input,body.web textarea,body.web select{font-size:max(16px,1em)}';
  function decorate() {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    document.body.classList.add("web"); if (IOS) document.body.classList.add("web-ios");
    // On iPhone the app must be added to the Home Screen: Safari and the Home Screen app keep separate data.
    let dismissed = false; try { dismissed = sessionStorage.getItem("gpw-inst") === "1"; } catch (e) { }
    if (IOS && !STANDALONE && !dismissed && /index\.html$|\/$/.test(location.pathname)) {
      const d = document.createElement("div"); d.className = "gpw-inst";
      d.innerHTML = '<b>Install ShopMate on your iPhone:</b> tap the Share button <span aria-hidden="true">⎋</span> at the bottom of Safari, then <b>Add to Home Screen</b>. Open it from the new icon, because what you type here in Safari stays in Safari.<button type="button" aria-label="Close">✕</button>';
      d.querySelector("span").textContent = "\u{1F4E4}";
      d.querySelector("button").onclick = () => { d.remove(); try { sessionStorage.setItem("gpw-inst", "1"); } catch (e) { } };
      document.body.appendChild(d);
    }
    restoreNotes();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
  }
  if (document.body) decorate(); else document.addEventListener("DOMContentLoaded", decorate);
})();
