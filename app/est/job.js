/* ShopMate AI - after the quote, shared by the Painting and Tiling estimators:
   before / after photos (after photos are cleaned up automatically, effects can be changed), follow-ups with phone reminders,
   accepted / declined, variations, and quote -> invoice in the main app. */
(function () {
  "use strict";
  const E = window.EST, esc = E.esc, money = E.money, num = E.num, ico = E.ico, DAY = 864e5;
  const uid = p => (p || "x") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dstr = t => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const days = t => Math.floor((Date.now() - new Date(t)) / DAY), ago = t => { const d = days(t); return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; };
  let A = null;   // the estimator: { trade, job(), save(), render(), name(j), total(j), gstAdd(j), rooms(j), lines(j), reopen(id) }

  /* ---------- photo store: IndexedDB (photos are too big for the estimate list) ---------- */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("shopmate-photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("p", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("p", mode), q = fn(t.objectStore("p")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); }
  const getP = id => tx("readonly", s => s.get(id)), putP = p => tx("readwrite", s => s.put(p)), delP = id => tx("readwrite", s => s.delete(id));
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  async function shrink(src, max, q) { const im = await loadImg(src), s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q || 0.86); }
  async function takePhoto() {
    if (window.GPNative && window.GPNative.pickCam) { const r = await E.nat("pickCam", {}); if (!r.ok) { if (r.error && r.error !== "Cancelled") E.toast(r.error); return null; } return r.dataUrl; }
    return new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.setAttribute("capture", "environment"); i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => shrink(rd.result, 1400).then(res, () => res(null)); rd.readAsDataURL(f); }; i.click(); });
  }

  /* ---------- the after-photo clean-up ---------- */
  // key, name, automatic strength (0-100), two-way (-50..50, off by default)
  const FX = [["light", "Light", 60], ["wb", "Colour balance", 70], ["shadows", "Shadows", 40], ["vivid", "Colour", 25], ["clean", "Clean up", 35], ["sharp", "Sharpen", 40], ["bright", "Brightness", 0, 1], ["warm", "Warmth", 0, 1]];
  const AUTO = () => Object.fromEntries(FX.map(f => [f[0], f[2]])), NONE = () => Object.fromEntries(FX.map(f => [f[0], 0]));
  function enhance(im, fx, maxSide) {
    const s = Math.min(1, (maxSide || 1400) / Math.max(im.width, im.height)), w = Math.round(im.width * s), h = Math.round(im.height * s);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(im, 0, 0, w, h);
    const f = k => num(fx[k]) / 100; if (FX.every(x => !num(fx[x[0]]))) return c;
    const img = g.getImageData(0, 0, w, h), d = img.data, n = w * h;
    // 1. look at the picture: channel histograms and averages
    const H = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)], st = Math.max(1, Math.floor(n / 80000)), sum = [0, 0, 0]; let cnt = 0;
    for (let i = 0; i < n; i += st) { const o = i * 4; for (let k = 0; k < 3; k++) { H[k][d[o + k]]++; sum[k] += d[o + k]; } cnt++; }
    const pct = (hh, p) => { let a = 0; const t = p * cnt; for (let i = 0; i < 256; i++) { a += hh[i]; if (a >= t) return i; } return 255; };
    // 2. colour balance (grey world, held within sensible limits) + warmth
    const avg = (sum[0] + sum[1] + sum[2]) / 3, wb = f("wb"), wm = f("warm");
    const gain = sum.map(x => 1 + wb * (Math.min(1.3, Math.max(0.78, avg / Math.max(1, x))) - 1)); gain[0] *= 1 + wm * 0.14; gain[2] *= 1 - wm * 0.14;
    // 3. light: stretch the darkest / brightest 0.5 % to black / white (same for all channels so colours stay true), then lift the middle to a bright "after" level
    const L = f("light"), lo = Math.min(...[0, 1, 2].map(k => pct(H[k], 0.005) * gain[k])), hi = Math.max(...[0, 1, 2].map(k => pct(H[k], 0.995) * gain[k]));
    const lo2 = L * Math.min(lo, 60), hi2 = 255 + L * (Math.max(hi, 160) - 255);
    const hl = new Uint32Array(256); for (let i = 0; i < n; i += st) { const o = i * 4; let y = 0; for (let k = 0; k < 3; k++) y += [0.299, 0.587, 0.114][k] * Math.min(255, Math.max(0, (d[o + k] * gain[k] - lo2) * 255 / (hi2 - lo2))); hl[Math.min(255, y | 0)]++; }
    const med = Math.max(1, pct(hl, 0.5)) / 255, gam = 1 + L * (Math.min(1.6, Math.max(0.62, Math.log(0.47) / Math.log(med))) - 1);
    const S = f("shadows"), B = f("bright");
    const lut = [0, 1, 2].map(k => { const t = new Uint8ClampedArray(256); for (let x = 0; x < 256; x++) { let v = Math.min(1, Math.max(0, (x * gain[k] - lo2) / (hi2 - lo2))); v = Math.pow(v, gam); v += S * 1.05 * v * (1 - v) * (1 - v); v = B >= 0 ? v + B * 0.5 * v * (1 - v) * 2 : v * (1 + B * 0.5); t[x] = Math.round(Math.min(1, Math.max(0, v)) * 255); } return t; });
    const V = f("vivid");
    for (let i = 0; i < n; i++) {
      const o = i * 4; let r = lut[0][d[o]], gg = lut[1][d[o + 1]], b = lut[2][d[o + 2]];
      if (V) { const y = 0.299 * r + 0.587 * gg + 0.114 * b, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, k = 1 + V * 0.7 * (1 - sat); r = y + (r - y) * k; gg = y + (gg - y) * k; b = y + (b - y) * k; }
      d[o] = r; d[o + 1] = gg; d[o + 2] = b;
    }
    // 4. clean up (smooth flat surfaces, keep edges) and sharpen (edges only), from one 3x3 blur
    const C = f("clean"), K = f("sharp");
    if (C || K) {
      const src = new Uint8ClampedArray(d), tmp = new Float32Array(n * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1); for (let k = 0; k < 3; k++) tmp[(y * w + x) * 3 + k] = (src[(y * w + x0) * 4 + k] + src[(y * w + x) * 4 + k] + src[(y * w + x1) * 4 + k]) / 3; }
      for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1); for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4; let dif = 0; const bl = [0, 0, 0];
        for (let k = 0; k < 3; k++) { bl[k] = (tmp[(y0 * w + x) * 3 + k] + tmp[i * 3 + k] + tmp[(y1 * w + x) * 3 + k]) / 3; dif += Math.abs(src[o + k] - bl[k]); }
        const flat = Math.max(0, 1 - dif / 36), edge = Math.min(1, dif / 18);
        for (let k = 0; k < 3; k++) { const p = src[o + k], q = bl[k]; d[o + k] = p + (q - p) * C * 0.9 * flat + (p - q) * K * 1.6 * edge; }
      } }
    }
    g.putImageData(img, 0, 0); return c;
  }

  /* ---------- photos view: Before | After ---------- */
  let tab = "before", ctx = null;
  const meta = j => (j.photos = j.photos || []), byKind = (j, k) => meta(j).filter(p => p.kind === k);
  function ensureView() {
    if (document.querySelector('[data-view="photos"]')) return;
    const s = document.createElement("section"); s.className = "view"; s.dataset.view = "photos"; s.id = "vPhotos"; s.hidden = true; document.body.appendChild(s);
  }
  function openPhotos(t) { tab = t || tab; ensureView(); E.go("photos"); renderPhotos(); }
  function thumb(p, extra) { return '<button class="ph" data-phv="' + esc(p.id) + '"><img data-th="' + esc(p.id) + '" alt="">' + (p.room ? "<span>" + esc(p.room) + "</span>" : "") + (extra || "") + "</button>"; }
  function fillThumbs(root) { root.querySelectorAll("img[data-th]").forEach(async im => { try { const r = await getP(im.dataset.th); if (r) im.src = r.th || r.out || r.orig; } catch (e) { } }); }
  function renderPhotos() {
    const j = A.job(); if (!j) return; const B = byKind(j, "before"), F = byKind(j, "after"), el = document.getElementById("vPhotos");
    let h = '<header class="eh"><button class="ib" data-go="back" aria-label="Back">' + ico("back") + '</button><div class="tt"><b>Photos</b><small>' + esc(A.name(j) || A.trade) + "</small></div>" +
      (F.some(p => p.pair) ? '<button class="ib" data-phshare aria-label="Share before and after">' + ico("share") + "</button>" : "") + '</header><div class="eb">' +
      E.box([["before", "Before (" + B.length + ")"], ["after", "After (" + F.length + ")"]], tab, "phtab") + '<div style="height:12px"></div>';
    if (tab === "before") {
      h += '<p class="hint">At the site visit: the walls, ceilings and damage as they are now. They show on your quote.</p>' +
        (B.length ? '<div class="phg">' + B.map(p => thumb(p)).join("") + "</div>" : "") + '<button class="btn pri big" data-phtake="before" style="margin-top:12px">' + ico("cam") + "Take a before photo</button>";
    } else {
      h += '<p class="hint">Stand where the before photo was taken. Each after photo is cleaned up automatically (light, colour, shadows) - tap it to change the effects.</p>';
      if (B.length) h += B.map(b => { const a = F.find(p => p.pair === b.id); return '<div class="pair">' + thumb(b, '<em>Before</em>') + (a ? thumb(a, '<em>After</em>') : '<button class="ph empty" data-phtake="after" data-pair="' + esc(b.id) + '">' + ico("cam") + "Take the after</button>") + "</div>"; }).join("");
      const extra = F.filter(p => !p.pair || !B.some(b => b.id === p.pair));
      if (extra.length) h += '<div class="lab">Other after photos</div><div class="phg">' + extra.map(p => thumb(p)).join("") + "</div>";
      h += '<button class="btn' + (B.length ? "" : " pri big") + '" data-phtake="after" style="margin-top:12px">' + ico("cam") + (B.length ? "Another after photo" : "Take an after photo") + "</button>";
      if (F.some(p => p.pair)) h += '<button class="add" data-phpdf>' + ico("doc") + "Before &amp; after PDF for the customer</button>";
    }
    el.innerHTML = h + "</div>"; fillThumbs(el);
  }
  async function addPhoto(kind, pair) {
    const j = A.job(), url = await takePhoto(); if (!url) return;
    E.toast(kind === "after" ? "Cleaning up the photo…" : "Saving…");
    try {
      const im = await loadImg(url), fx = kind === "after" ? AUTO() : NONE(), out = kind === "after" ? enhance(im, fx).toDataURL("image/jpeg", 0.88) : null;
      const before = pair && meta(j).find(p => p.id === pair), id = uid("ph");
      const rec = { id, job: j.id, kind, pair: pair || null, room: before ? before.room : "", at: new Date().toISOString(), orig: url, out, fx, th: await shrink(out || url, 320, 0.8) };
      await putP(rec); meta(j).push({ id, kind, pair: rec.pair, room: rec.room, at: rec.at }); A.save(j); renderPhotos();
      if (kind === "after") editor(id); else viewer(id);
    } catch (e) { E.toast("Couldn't save that photo - the phone may be out of space"); }
  }
  /* a before photo: room name, delete */
  async function viewer(id) {
    const j = A.job(), m = meta(j).find(p => p.id === id), r = await getP(id); if (!m || !r) return;
    if (m.kind === "after") return editor(id);
    const rooms = A.rooms(j);
    const s = E.sheet('<img class="phbig" src="' + r.orig + '" alt=""><div class="fg"><label class="f w"><span>Room or area</span><input id="phR" list="phRl" value="' + esc(m.room || "") + '" placeholder="e.g. Living room"><datalist id="phRl">' + rooms.map(x => "<option>" + esc(x) + "</option>").join("") + "</datalist></label></div>" +
      '<div class="row end"><button class="btn danger" data-phdel>' + ico("trash") + 'Delete</button><button class="btn pri" data-phok>Done</button></div>');
    s.querySelector("[data-phok]").onclick = async () => { m.room = s.querySelector("#phR").value.trim(); r.room = m.room; await putP(r); meta(j).filter(p => p.pair === id).forEach(p => p.room = m.room); A.save(j); E.closeSheet(); renderPhotos(); };
    s.querySelector("[data-phdel]").onclick = () => delPhoto(id);
  }
  function delPhoto(id) {
    const j = A.job();
    E.ask("Delete this photo?", "It will be removed from this phone.", "Delete", async () => { try { await delP(id); } catch (e) { } j.photos = meta(j).filter(p => p.id !== id); meta(j).forEach(p => { if (p.pair === id) p.pair = null; }); A.save(j); E.closeSheet(); closeEditor(); renderPhotos(); }, true);
  }
  /* the after-photo editor: effects on / off with a strength slider, hold to see the photo as taken */
  let ED = null;
  function closeEditor() { const o = document.querySelector(".phed"); if (o) o.remove(); ED = null; }
  async function editor(id) {
    const j = A.job(), m = meta(j).find(p => p.id === id), r = await getP(id); if (!m || !r) return;
    const im = await loadImg(r.orig); closeEditor();
    ED = { id, r, im, fx: { ...AUTO(), ...(r.fx || {}) }, sel: "light" };
    const o = document.createElement("div"); o.className = "phed"; document.body.appendChild(o);
    o.innerHTML = '<header class="eh"><button class="ib" data-edx aria-label="Close">' + ico("close") + '</button><div class="tt"><b>After photo</b><small>' + esc(m.room || "Cleaned up automatically") + '</small></div><button class="ib" data-eddel aria-label="Delete">' + ico("trash") + "</button></header>" +
      '<div class="phc"><canvas></canvas><img class="orig" src="' + r.orig + '" alt="" hidden></div>' +
      '<div class="phtools"><div class="chips"></div><div class="sl"><span id="edL"></span><input type="range" id="edS"></div>' +
      '<div class="row"><button class="btn" data-edhold>Hold to compare</button><button class="btn" data-edauto>Auto</button><button class="btn" data-ednone>No effects</button></div>' +
      '<div class="row"><button class="btn pri" data-edok>' + ico("check") + "Save</button></div></div>";
    o.addEventListener("click", edClick);
    const hold = o.querySelector("[data-edhold]"), og = o.querySelector(".orig"), cv = o.querySelector("canvas");
    const show = on => { og.hidden = !on; cv.hidden = on; };
    hold.addEventListener("pointerdown", () => show(true)); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => hold.addEventListener(ev, () => show(false)));
    o.querySelector("#edS").addEventListener("input", e => { const f = FX.find(x => x[0] === ED.sel); ED.fx[ED.sel] = num(e.target.value); edLabel(); clearTimeout(ED.t); ED.t = setTimeout(edDraw, 60); });
    edChips(); edDraw();
  }
  function edChips() {
    const o = document.querySelector(".phed"); if (!o) return;
    o.querySelector(".chips").innerHTML = FX.map(f => '<button data-edfx="' + f[0] + '" class="chip' + (num(ED.fx[f[0]]) ? " on" : "") + (ED.sel === f[0] ? " sel" : "") + '">' + esc(f[1]) + "</button>").join("");
    const f = FX.find(x => x[0] === ED.sel), sl = o.querySelector("#edS"); sl.min = f[3] ? -50 : 0; sl.max = f[3] ? 50 : 100; sl.value = num(ED.fx[f[0]]); edLabel();
  }
  function edLabel() { const f = FX.find(x => x[0] === ED.sel), v = num(ED.fx[f[0]]); document.getElementById("edL").textContent = f[1] + " · " + (v ? (f[3] && v > 0 ? "+" : "") + v : "off"); }
  function edDraw() {
    if (!ED) return; const o = document.querySelector(".phed"), cv = o.querySelector("canvas"), src = enhance(ED.im, ED.fx, 900);
    cv.width = src.width; cv.height = src.height; cv.getContext("2d").drawImage(src, 0, 0);
  }
  async function edClick(e) {
    const t = e.target.closest("button"); if (!t || !ED) return; const d = t.dataset;
    if (d.edfx) { const f = FX.find(x => x[0] === d.edfx); if (ED.sel === d.edfx) ED.fx[f[0]] = num(ED.fx[f[0]]) ? 0 : (f[2] || (f[3] ? 20 : 50)); else { ED.sel = d.edfx; if (!num(ED.fx[f[0]])) ED.fx[f[0]] = f[2] || (f[3] ? 20 : 50); } edChips(); edDraw(); return; }
    if (d.edauto != null) { ED.fx = AUTO(); edChips(); edDraw(); return; }
    if (d.ednone != null) { ED.fx = NONE(); edChips(); edDraw(); return; }
    if (d.edx != null) { closeEditor(); renderPhotos(); return; }
    if (d.eddel != null) { delPhoto(ED.id); return; }
    if (d.edok != null) {
      E.toast("Saving…"); const r = ED.r, out = enhance(ED.im, ED.fx).toDataURL("image/jpeg", 0.88);
      r.fx = ED.fx; r.out = out; r.th = await shrink(out, 320, 0.8); try { await putP(r); } catch (x) { E.toast("Couldn't save - the phone may be out of space"); return; }
      closeEditor(); renderPhotos(); E.toast("Saved");
    }
  }
  /* before & after for the customer: one picture per pair (share) or a PDF of them all */
  async function pairs(j) { const out = []; for (const b of byKind(j, "before")) { const a = byKind(j, "after").find(p => p.pair === b.id); if (!a) continue; const rb = await getP(b.id), ra = await getP(a.id); if (rb && ra) out.push({ room: b.room, before: rb.orig, after: ra.out || ra.orig }); } return out; }
  async function collage(p) {
    const [a, b] = await Promise.all([loadImg(p.before), loadImg(p.after)]), H = 900, wa = Math.round(a.width * H / a.height), wb = Math.round(b.width * H / b.height), biz = E.biz();
    const c = document.createElement("canvas"); c.width = wa + wb + 12; c.height = H + 70; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(a, 0, 0, wa, H); g.drawImage(b, wa + 12, 0, wb, H);
    g.font = "bold 34px Arial"; [["BEFORE", 0, wa], ["AFTER", wa + 12, wb]].forEach(([t, x, w]) => { g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(x + 16, 16, g.measureText(t).width + 28, 52); g.fillStyle = "#fff"; g.fillText(t, x + 30, 54); });
    g.fillStyle = "#202124"; g.font = "28px Arial"; g.fillText([biz.name, p.room].filter(Boolean).join(" · "), 16, H + 46);
    return c.toDataURL("image/jpeg", 0.88);
  }
  async function shareBA() {
    const j = A.job(), P = await pairs(j); if (!P.length) return E.toast("Take an after photo for a before photo first");
    const go = async p => { const url = await collage(p), name = ((A.name(j) || A.trade) + " - before and after" + (p.room ? " - " + p.room : "")).replace(/[\\/:*?"<>|]/g, "") + ".jpg";
      if (window.GPNative && window.GPNative.shareImage) { const r = await E.nat("shareImage", { dataUrl: url, filename: name, text: "" }); if (!r.ok) E.toast(r.error || "Couldn't share"); }
      else { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); } };
    if (P.length === 1) return go(P[0]);
    E.menu(P.map((p, i) => [p.room || "Photo " + (i + 1), () => go(p)]).concat([["All of them (PDF)", baPdf]]));
  }
  async function baPdf() {
    const j = A.job(), P = await pairs(j), b = E.biz(); if (!P.length) return E.toast("Take an after photo for a before photo first");
    E.pdf('<!doctype html><html><head><meta charset="utf-8"><style>body{font:13px Arial,sans-serif;color:#202124;margin:28px}h1{font-size:22px;color:#1A73E8;margin:0}.p{page-break-inside:avoid;margin-top:18px}.p b{display:block;margin-bottom:6px}.r{display:flex;gap:8px}.r div{flex:1}.r img{width:100%;border-radius:6px}.r small{display:block;color:#5F6368;margin-top:2px}</style></head><body><h1>Before &amp; after</h1><div>' + esc([A.name(j), j.address, b.name].filter(Boolean).join(" · ")) + "</div>" +
      P.map(p => '<div class="p">' + (p.room ? "<b>" + esc(p.room) + "</b>" : "") + '<div class="r"><div><img src="' + p.before + '"><small>Before</small></div><div><img src="' + p.after + '"><small>After</small></div></div></div>').join("") + "</body></html>", ((A.name(j) || A.trade) + " - before and after").replace(/[\\/:*?"<>|]/g, "") + ".pdf");
  }
  /* before photos for the quote (small, at most 6) */
  async function quotePhotos(j) { const out = []; for (const p of byKind(j, "before").slice(0, 6)) { const r = await getP(p.id); if (r) out.push({ room: p.room, src: await shrink(r.orig, 700, 0.75) }); } return out; }
  async function removeJob(j) { for (const p of meta(j)) { try { await delP(p.id); } catch (e) { } } }

  /* ---------- the job after the quote ---------- */
  const firstName = n => String(n || "").trim().split(/\s+/)[0] || "there";
  const varSum = j => (j.vars || []).reduce((s, v) => s + num(v.amount), 0);
  const withGst = (j, ex) => A.gstAdd(j) ? ex * 1.1 : ex;
  function card(j) {
    const st = j.status || "draft"; if (st === "draft") return photoLine(j);
    const B = (l, a, pri) => '<button class="btn' + (pri ? " pri" : "") + '" data-jx="' + a + '">' + l + "</button>";
    let h = '<div class="card jcard"><div class="jst ' + st + '">';
    if (st === "quoted") { const fu = j.followups || [], d = days(j.quotedAt || j.updatedAt); h += "<b>Quote sent " + dstr(j.quotedAt || j.updatedAt) + "</b><small>" + ago(j.quotedAt || j.updatedAt) + (fu.length ? " · followed up " + fu.length + "×, last " + ago(fu[fu.length - 1]) : d >= 3 ? " · no reply yet - time to follow up" : " · waiting for a reply") + "</small></div><div class=\"row\">" + B("Follow up", "fu", d >= 3) + B("Accepted", "acc") + B("Declined", "dec") + "</div>"; }
    else if (st === "accepted") h += "<b>Accepted " + dstr(j.acceptedAt) + "</b><small>Add any extra work as a variation, take the after photos, then make the invoice.</small></div>";
    else if (st === "invoiced") h += "<b>Invoice made " + dstr(j.invoicedAt) + "</b><small>Find it under Invoices in ShopMate.</small></div>";
    else if (st === "declined") h += "<b>Declined " + dstr(j.declinedAt) + "</b><small>Kept for your records.</small></div><div class=\"row\">" + B("Reopen the quote", "reopen") + "</div>";
    if (st === "accepted" || st === "invoiced") {
      const V = j.vars || [], q = A.total(j);
      h += '<div class="lab">Variations (extra work)</div>' + (V.length ? '<div class="p0">' + V.map(v => '<button class="li" data-jvar="' + esc(v.id) + '"><span class="g">' + esc(v.name) + "<small>" + dstr(v.at) + "</small></span><b>" + money(v.amount) + "</b></button>").join("") + "</div>" : "") +
        '<button class="add" data-jx="var">' + ico("plus") + "Add a variation</button>" +
        '<div class="kv"><span>Quote</span><b>' + money(q) + "</b></div>" + (V.length ? '<div class="kv"><span>Variations' + (A.gstAdd(j) ? " (+GST)" : "") + "</span><b>" + money(withGst(j, varSum(j))) + '</b></div><div class="kv"><span><b>Job total</b></span><b>' + money(q + withGst(j, varSum(j))) + "</b></div>" : "") +
        '<div class="row">' + B("After photos", "after") + B(st === "invoiced" ? "Make invoice again" : "Make invoice", "inv", st === "accepted") + "</div>";
    }
    return h + "</div>" + photoLine(j);
  }
  function photoLine(j) { const b = byKind(j, "before").length, a = byKind(j, "after").length; return '<button class="add" data-jx="photos">' + ico("photo") + "Photos · " + b + " before · " + a + " after</button>"; }
  const ids = j => ["fu3_" + j.id, "fu7_" + j.id];
  function cancelReminders(j) { if (window.GPNative && window.GPNative.cancel) E.nat("cancel", { ids: ids(j) }); }
  /* call when the quote goes out: status, date, and two phone reminders (3 and 7 days, 9 am) if there is no answer */
  function quoteSent(j) {
    if (j.status === "accepted" || j.status === "invoiced") return;
    const first = j.status !== "quoted"; j.status = "quoted"; if (first || !j.quotedAt) j.quotedAt = new Date().toISOString();
    if (window.GPNative && window.GPNative.notifyAt) {
      const at = n => { const d = new Date(j.quotedAt); d.setDate(d.getDate() + n); d.setHours(9, 0, 0, 0); return d.getTime(); };
      E.nat("notifyAt", { items: [3, 7].map((n, i) => ({ id: ids(j)[i], when: at(n), title: "Follow up: " + (A.name(j) || A.trade + " quote"), text: (j.customer ? j.customer + " hasn't" : "The customer hasn't") + " answered your quote yet. Tap to send a friendly reminder." })) });
    }
  }
  function followUp(j) {
    const b = E.biz(), d = days(j.quotedAt || j.updatedAt), late = (j.followups || []).length > 0 || d >= 7, tot = money(A.total(j));
    const msg = late ? "Hi " + firstName(j.customer) + ", following up on the " + A.trade.toLowerCase() + " quote for " + (A.name(j) || "your job") + " (" + tot + "). I can lock in a start date if you'd like to go ahead - just let me know either way. Thanks, " + (b.name || "")
      : "Hi " + firstName(j.customer) + ", just checking you got the " + A.trade.toLowerCase() + " quote for " + (A.name(j) || "your job") + " (" + tot + "). Happy to answer any questions or change anything. Thanks, " + (b.name || "");
    const s = E.sheet('<h3>Follow up</h3><p class="sub">' + esc(j.customer || "Customer") + " · quote sent " + ago(j.quotedAt || j.updatedAt) + '</p><div class="fg"><label class="f w"><span>Message</span><textarea id="fuT" rows="6">' + esc(msg.trim()) + '</textarea></label><label class="f"><span>Mobile</span><input id="fuP" type="tel" value="' + esc(j.phone || "") + '"></label><label class="f"><span>Email</span><input id="fuE" type="email" value="' + esc(j.email || "") + '"></label></div>' +
      '<div class="row end"><button class="btn" data-fu="copy">Copy</button><button class="btn" data-fu="mail">Email</button><button class="btn pri" data-fu="sms">Text message</button></div>');
    s.addEventListener("click", e => {
      const t = e.target.closest("[data-fu]"); if (!t) return; const how = t.dataset.fu, txt = s.querySelector("#fuT").value, ph = s.querySelector("#fuP").value.trim(), em = s.querySelector("#fuE").value.trim();
      j.phone = ph; j.email = em;
      if (how === "sms") { if (!ph) return E.toast("Add the customer's mobile"); if (window.GPNative && window.GPNative.openSms) window.GPNative.openSms(ph, txt); else location.href = "sms:" + ph + "?body=" + encodeURIComponent(txt); }
      else if (how === "mail") { if (!em) return E.toast("Add the customer's email"); const u = "mailto:" + em + "?subject=" + encodeURIComponent(A.trade + " quote - " + (A.name(j) || "")) + "&body=" + encodeURIComponent(txt); if (window.GPNative && window.GPNative.openUrl) window.GPNative.openUrl(u); else location.href = u; }
      else { if (window.GPNative && window.GPNative.copyText) window.GPNative.copyText(txt); else if (navigator.clipboard) navigator.clipboard.writeText(txt); E.toast("Copied"); }
      (j.followups = j.followups || []).push(new Date().toISOString()); A.save(j); E.closeSheet(); A.render();
    });
  }
  function varSheet(j, id) {
    const V = (j.vars = j.vars || []), v = V.find(x => x.id === id);
    const s = E.sheet("<h3>" + (v ? "Variation" : "Add a variation") + '</h3><p class="sub">Extra work the customer asked for after accepting. It goes on the invoice.</p><div class="fg"><label class="f w"><span>What was added</span><input id="vN" value="' + esc(v ? v.name : "") + '" placeholder="e.g. Paint the laundry ceiling"></label><label class="f"><span>Price ex GST ($)</span><input id="vA" type="number" inputmode="decimal" step="0.01" value="' + esc(v ? v.amount : "") + '"></label></div>' +
      '<div class="row end">' + (v ? '<button class="btn danger" data-vdel>' + ico("trash") + "Delete</button>" : "") + '<button class="btn pri" data-vok>' + (v ? "Save" : "Add") + "</button></div>");
    s.addEventListener("click", e => {
      if (e.target.closest("[data-vdel]")) { j.vars = V.filter(x => x !== v); A.save(j); E.closeSheet(); A.render(); return; }
      if (!e.target.closest("[data-vok]")) return; const n = s.querySelector("#vN").value.trim(), a = num(s.querySelector("#vA").value);
      if (!n) return E.toast("Say what was added"); if (!(a > 0)) return E.toast("Enter the price");
      if (v) { v.name = n; v.amount = a; } else V.push({ id: uid("v"), name: n, amount: a, at: new Date().toISOString() });
      A.save(j); E.closeSheet(); A.render();
    });
  }
  /* quote -> invoice: the main app opens a new invoice with these lines (prices ex GST) to check and send */
  function invoice(j) {
    const L = A.lines(j).concat((j.vars || []).map(v => ({ name: "Variation: " + v.name, qty: 1, ex: num(v.amount) })));
    if (!L.length) return E.toast("Nothing to invoice yet");
    const gst = A.gstAdd(j) || j.gstMode === "included";
    try { localStorage.setItem("sm_inv_handoff", JSON.stringify({ from: A.trade, estId: j.id, customer: { name: j.customer || "", phone: j.phone || "", email: j.email || "", address: j.address || "" }, note: A.trade + " - " + (A.name(j) || "") + (j.address ? ", " + j.address : ""), lines: L.map(l => ({ name: l.name, qty: num(l.qty) || 1, price: Math.round(num(l.ex) / (num(l.qty) || 1) * 100) / 100, gst: gst })) })); }
    catch (e) { return E.toast("Couldn't hand the invoice over - storage is full"); }
    cancelReminders(j); j.status = "invoiced"; j.invoicedAt = new Date().toISOString(); A.save(j);
    location.href = "../index.html";
  }
  /* home: quotes waiting for an answer */
  function waiting(list) {
    const q = list.filter(x => x.status === "quoted").sort((a, b) => String(a.quotedAt || a.updatedAt).localeCompare(String(b.quotedAt || b.updatedAt))); if (!q.length) return "";
    return '<div class="lab">Waiting for an answer</div>' + q.map(x => { const fu = x.followups || [], last = fu[fu.length - 1], d = days(last || x.quotedAt || x.updatedAt); return '<div class="jr" data-open="' + esc(x.id) + '"><div class="g"><b>' + esc(A.name(x) || A.trade) + "</b><small>" + esc([x.customer, "sent " + ago(x.quotedAt || x.updatedAt), last ? "followed up " + ago(last) : ""].filter(Boolean).join(" · ")) + "</small></div>" + (d >= 3 ? '<button class="btn sm' + (d >= 7 ? " pri" : "") + '" data-jfu="' + esc(x.id) + '">Follow up</button>' : '<span class="pill blue">' + money(A.total(x)) + "</span>") + "</div>"; }).join("");
  }
  /* customers from the main app, to fill the phone / email / address */
  function customers() { try { const d = JSON.parse(localStorage.getItem("gp-invoices-v1") || "null"); return ((d && d.customers) || []).filter(c => c && c.name && !c.sample); } catch (e) { return []; } }
  const custList = () => '<datalist id="custL">' + customers().map(c => "<option>" + esc(c.name) + "</option>").join("") + "</datalist>";
  function custFill(j) { const c = customers().find(x => x.name.toLowerCase() === String(j.customer || "").trim().toLowerCase()); if (!c) return false; let ch = false; [["phone", "phone"], ["email", "email"], ["address", "address"]].forEach(([a, b]) => { if (!j[a] && c[b]) { j[a] = c[b]; ch = true; } }); return ch; }

  function handle(t, j) {
    const d = t.dataset;
    if (d.jx) {
      const a = d.jx;
      if (a === "photos") openPhotos("before"); else if (a === "after") openPhotos("after"); else if (a === "fu") followUp(j); else if (a === "var") varSheet(j);
      else if (a === "inv") { if (j.status === "invoiced") E.ask("Make the invoice again?", "An invoice was already made from this quote.", "Make another", () => invoice(j)); else invoice(j); }
      else if (a === "acc") { cancelReminders(j); j.status = "accepted"; j.acceptedAt = new Date().toISOString(); A.save(j); A.render(); E.toast("Marked as accepted"); }
      else if (a === "dec") E.ask("Mark as declined?", "The follow-up reminders stop. You can reopen it later.", "Declined", () => { cancelReminders(j); j.status = "declined"; j.declinedAt = new Date().toISOString(); A.save(j); A.render(); });
      else if (a === "reopen") { j.status = "quoted"; quoteSent(j); A.save(j); A.render(); }
      return true;
    }
    if (d.jvar) { varSheet(j, d.jvar); return true; }
    if (d.phtab) { tab = d.phtab; renderPhotos(); return true; }
    if (d.phtake) { addPhoto(d.phtake, d.pair); return true; }
    if (d.phv) { viewer(d.phv); return true; }
    if (d.phshare != null) { shareBA(); return true; }
    if (d.phpdf != null) { baPdf(); return true; }
    return false;
  }
  function init(adapter) {
    A = adapter; ensureView();
    const pb = window.onBack; window.onBack = function () { if (document.querySelector(".phed")) { closeEditor(); renderPhotos(); return true; } return pb.apply(this, arguments); };
    document.addEventListener("est-view", e => { if (e.detail === "photos") renderPhotos(); }); }
  window.JOB = { init, card, handle, quoteSent, followUp, waiting, invoice, quotePhotos, removeJob, custList, custFill, openPhotos, cancelReminders, _t: { enhance, AUTO } };
})();
