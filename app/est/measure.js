/* Camera measuring for the Painting and Tiling estimators.
   Measure.init({ apply(ctx, result) }) once, then Measure.open(ctx, opts).
   Methods: live camera (AR, Android: a WebXR page in Chrome that returns here through shopmate://ar),
   from a photo (tap the 4 corners of an A4 sheet / tile / door, then the room corners: a plane homography gives real sizes),
   or typed sizes. Result: { floor:{sides,area,perimeter,pts,method}, ceiling:{same:true}|{...}, height } */
(function () {
  "use strict";
  const E = window.EST, esc = E.esc, ico = E.ico, fmt = E.fmt, num = E.num;
  const AR_URL = "https://falahjoon-prog.github.io/Shopmate/app/ar/measure.html";
  const N = () => window.GPNative;
  const canAr = () => !!(N() && N().openUrl && N().takeAr && /Android/i.test(navigator.userAgent)) || !!(window.LiveCam && LiveCam.ok());
  const WHAT = { floor: "Floor", ceiling: "Ceiling", both: "Floor + ceiling", height: "Wall height", walls: "Walls" };
  const SURF = { floor: "floor", ceiling: "ceiling", height: "wall" };
  const ACC = { ar: "about ±1–2 cm", photo: "about ±5–10 cm", typed: "as typed" };
  const HOW = { ar: "Measured with live camera", photo: "Measured from a photo", typed: "Typed sizes" };
  const REFS = [["a4", "A4 sheet", 297, 210], ["tile", "Tile", 600, 600], ["door", "Door", 820, 2040], ["other", "Other size", 0, 0]];
  let host = null, C = null;

  /* ---------- start ---------- */
  function open(ctx, opts) {
    C = { ctx, opts: Object.assign({ whats: ["floor", "ceiling", "both", "height"], what: "floor", height: 2.7, heightLabel: "Wall height", ceiling: true }, opts || {}), res: {} };
    C.what = C.opts.what; pick();
  }
  function queueFor(w) { return w === "both" ? ["floor", "ceiling"] : w === "walls" ? ["floor"] : [w]; }
  function pick(only) { // only = measure just this surface (e.g. "Measure ceiling" from the result screen)
    const ws = only ? null : C.opts.whats;
    const opt = (k, ic, t, s, tag) => '<button class="opt" data-mhow="' + k + '"><span class="oi">' + ico(ic) + "</span><span><b>" + t + (tag ? ' <span class="pill blue">' + tag + "</span>" : "") + "</b><small>" + s + "</small></span></button>";
    const target = only || C.what, line = target === "height";
    const s = E.sheet("<h3>Measure " + esc(C.opts.title || "") + "</h3>" +
      (ws ? '<p class="sub">What do you want to measure?</p>' + E.box(ws.map(w => [w, WHAT[w]]), C.what, "mw") : '<p class="sub">' + WHAT[only] + "</p>") +
      '<div class="lab">How</div>' +
      (canAr() ? opt("ar", "ar", "Live camera (AR)", line ? "Tap the bottom of the wall, then the top." : "Point the phone at the " + (target === "ceiling" ? "ceiling" : "floor") + " and tap each corner as you walk around the room. " + (window.LiveCam && LiveCam.ok() ? "Stand in one spot and turn on the spot." : "Opens in Chrome, then comes back here."), "Best") : "") +
      opt("photo", "photo", "From a photo", line ? "Take a photo of the wall with a door or an A4 sheet on it, tap its 4 corners, then the bottom and top of the wall." : "Put an A4 sheet or a tile on the " + (target === "ceiling" ? "ceiling (or use a manhole / ceiling tile)" : "floor") + ", take one photo, tap its 4 corners, then tap each room corner. Works on every phone.") +
      opt("pen", "pen", "Type the sizes", "From a tape or laser measure."));
    s.addEventListener("click", e => {
      const w = e.target.closest("[data-mw]"); if (w) { C.what = w.dataset.mw; E.closeSheet(); pick(); return; }
      const h = e.target.closest("[data-mhow]"); if (!h) return;
      E.closeSheet(); C.queue = only ? [only] : queueFor(C.what); C.idx = 0; C.how = h.dataset.mhow; next();
    });
  }
  function next() {
    if (C.idx >= C.queue.length) { if (C.queue.indexOf("ceiling") >= 0) C.res.ceilingSet = true; result(); return; }
    const surf = C.queue[C.idx];
    if (C.how === "typed" || C.how === "pen") typed(surf);
    else if (C.how === "photo") photo(surf);
    else ar(surf);
  }
  function got(surf, r) {
    if (surf === "height") C.res.height = r.len; else C.res[surf] = r;
    C.idx++; next();
  }

  /* ---------- typed ---------- */
  function typed(surf) {
    if (surf === "height") {
      const s = E.sheet("<h3>" + esc(C.opts.heightLabel) + '</h3><p class="sub">In metres</p><label class="f"><span>Height (m)</span><input id="mzH" type="number" inputmode="decimal" step="0.01" value="' + (C.opts.height || "") + '"></label><div class="row end"><button class="btn" data-x>Cancel</button><button class="btn pri" data-ok>Use</button></div>');
      s.querySelector("[data-x]").onclick = E.closeSheet;
      s.querySelector("[data-ok]").onclick = () => { const v = num(s.querySelector("#mzH").value); if (v <= 0) return E.toast("Enter the height"); E.closeSheet(); got(surf, { len: v, method: "typed" }); };
      return;
    }
    let shape = "rect";
    const s = E.sheet("<h3>" + WHAT[surf] + " sizes</h3>" + '<p class="sub">In metres</p>' + E.box([["rect", "Rectangle"], ["other", "Other shape"]], shape, "mshape") + '<div id="mzF" style="margin-top:10px"></div><div class="row end"><button class="btn" data-x>Cancel</button><button class="btn pri" data-ok>Use</button></div>');
    const draw = () => {
      s.querySelectorAll("[data-mshape]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mshape === shape));
      s.querySelector("#mzF").innerHTML = shape === "rect" ? '<div class="fg"><label class="f"><span>Length (m)</span><input id="mzL" type="number" inputmode="decimal" step="0.01"></label><label class="f"><span>Width (m)</span><input id="mzW" type="number" inputmode="decimal" step="0.01"></label></div>'
        : '<div class="fg"><label class="f"><span>Area (m²)</span><input id="mzA" type="number" inputmode="decimal" step="0.01"></label><label class="f"><span>Perimeter (m)</span><input id="mzP" type="number" inputmode="decimal" step="0.01"></label></div><p class="hint">For an L-shaped or odd room, add up all the sides for the perimeter.</p>';
    };
    draw();
    s.addEventListener("click", e => { const b = e.target.closest("[data-mshape]"); if (b) { shape = b.dataset.mshape; draw(); } });
    s.querySelector("[data-x]").onclick = E.closeSheet;
    s.querySelector("[data-ok]").onclick = () => {
      let r;
      if (shape === "rect") { const L = num(s.querySelector("#mzL").value), W = num(s.querySelector("#mzW").value); if (L <= 0 || W <= 0) return E.toast("Enter the length and width"); r = { sides: [L, W, L, W], area: L * W, perimeter: 2 * (L + W), pts: [[0, 0], [L, 0], [L, W], [0, W]], method: "typed" }; }
      else { const A = num(s.querySelector("#mzA").value), P = num(s.querySelector("#mzP").value); if (A <= 0 || P <= 0) return E.toast("Enter the area and perimeter"); r = { sides: [], area: A, perimeter: P, method: "typed" }; }
      E.closeSheet(); got(surf, r);
    };
  }

  /* ---------- live camera (AR) ---------- */
  function ar(surf) {
    if (window.LiveCam && LiveCam.ok()) {
      LiveCam.run({ kind: surf === "height" ? "line" : "poly", title: (C.opts.title || "") + " · " + WHAT[surf] }, d => {
        if (d.cancel) { E.toast(d.msg || "Live camera measuring was cancelled"); if (d.msg) pick(); return; }
        if (surf === "height") got(surf, { len: num(d.len), method: "ar" });
        else got(surf, { sides: (d.sides || []).map(num), area: num(d.area), perimeter: num(d.perimeter), pts: d.pts || null, method: "ar" });
      }); return;
    }
    try {
      localStorage.setItem("sm_measure", JSON.stringify({ ctx: C.ctx, opts: C.opts, what: C.what, queue: C.queue, idx: C.idx, how: C.how, res: C.res }));
      localStorage.setItem("sm_ar_page", location.pathname.split("/www/").pop() || location.pathname);
    } catch (e) { }
    const q = "?m=" + (surf === "height" ? "line" : "poly") + "&s=" + SURF[surf] + "&t=" + encodeURIComponent((C.opts.title || "") + " · " + WHAT[surf]);
    N().openUrl(AR_URL + q);
  }
  function arBack() {
    let raw = ""; try { raw = N() && N().takeAr ? N().takeAr() : ""; } catch (e) { }
    if (!raw) return;
    let st = null, d = null; try { st = JSON.parse(localStorage.getItem("sm_measure") || "null"); d = JSON.parse(raw); } catch (e) { }
    try { localStorage.removeItem("sm_measure"); localStorage.removeItem("sm_ar_page"); } catch (e) { }
    if (!st || !d) return;
    C = st;
    if (d.cancel) { E.toast(d.msg || "Live camera measuring was cancelled"); if (d.msg) pick(); return; }
    const surf = C.queue[C.idx];
    if (surf === "height") got(surf, { len: num(d.len), method: "ar" });
    else got(surf, { sides: (d.sides || []).map(num), area: num(d.area), perimeter: num(d.perimeter), pts: d.pts || null, method: "ar" });
  }
  window.onArMeasure = arBack;

  /* ---------- from a photo ---------- */
  function photo(surf) {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => photoTool(surf, img, url);
      img.onerror = () => { URL.revokeObjectURL(url); E.toast("Could not open that photo"); };
      img.src = url;
    };
    inp.click();
  }
  function photoTool(surf, img, url) {
    const line = surf === "height";
    const P = { step: "ref", ref: surf === "height" ? "door" : "a4", rw: 0, rh: 0, rp: [], pts: [], closed: false, H: null, drag: null };
    { const r = REFS.find(x => x[0] === P.ref); P.rw = r[2]; P.rh = r[3]; }
    const ov = document.createElement("div"); ov.className = "mz";
    ov.innerHTML = '<div class="mz-h"><button class="mz-ib" data-a="close" aria-label="Close">' + ico("back") + "</button><b>From a photo · " + WHAT[surf] + '</b><span style="width:44px"></span></div><div class="mz-st"><canvas></canvas><canvas class="mz-loupe" width="240" height="240" hidden></canvas></div><div class="mz-p"></div>';
    document.body.appendChild(ov);
    const cv = ov.querySelector("canvas"), ctx = cv.getContext("2d"), st = ov.querySelector(".mz-st"), panel = ov.querySelector(".mz-p"), lp = ov.querySelector(".mz-loupe"), lctx = lp.getContext("2d");
    let fit = { s: 1, ox: 0, oy: 0 }, dpr = Math.min(2, window.devicePixelRatio || 1);
    const view = { z: 1, cx: img.naturalWidth / 2, cy: img.naturalHeight / 2 }, touches = new Map(); let pinch = null;
    const prevBack = window.onBack;
    window.onBack = () => { if (document.querySelector(".sheet")) return prevBack(); close(); return true; };
    function close() { ov.remove(); URL.revokeObjectURL(url); window.onBack = prevBack; window.removeEventListener("resize", layout); }
    function layout() {
      const W = st.clientWidth, Hh = st.clientHeight; cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + "px"; cv.style.height = Hh + "px";
      const s = Math.min(W / img.naturalWidth, Hh / img.naturalHeight) * view.z; fit = { s, ox: W / 2 - view.cx * s, oy: Hh / 2 - view.cy * s }; draw();
    }
    const toScr = p => [fit.ox + p[0] * fit.s, fit.oy + p[1] * fit.s];
    const toImg = (x, y) => [(x - fit.ox) / fit.s, (y - fit.oy) / fit.s];
    function solve() {
      P.H = null; if (P.rp.length !== 4 || P.rw <= 0 || P.rh <= 0) return;
      const room = P.step === "ref" || (line && P.pts.length) ? [] : P.pts, closed = P.closed || P.step === "check";
      P.H = rectify(room.length >= 3 ? room : [], closed, P.rp, P.rw / 1000, P.rh / 1000, img.naturalWidth, img.naturalHeight);
    }
    const plane = p => P.H ? P.H(p) : null;
    const dist = (a, b) => { const A = plane(a), B = plane(b); return A && B ? Math.hypot(A[0] - B[0], A[1] - B[1]) : 0; };
    function measure() {
      if (!P.H) return null;
      if (line) return P.pts.length === 2 ? { len: dist(P.pts[0], P.pts[1]) } : null;
      const n = P.pts.length; if (n < 3) return null;
      const pl = P.pts.map(plane), sides = pl.map((p, i) => { const q = pl[(i + 1) % n]; return Math.hypot(p[0] - q[0], p[1] - q[1]); });
      return { sides, perimeter: sides.reduce((a, b) => a + b, 0), area: Math.abs(shoelace(pl)), pts: pl };
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, fit.ox, fit.oy, img.naturalWidth * fit.s, img.naturalHeight * fit.s);
      // size guide
      if (P.rp.length) {
        ctx.beginPath(); P.rp.forEach((p, i) => { const s = toScr(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); if (P.rp.length === 4) ctx.closePath();
        ctx.fillStyle = "rgba(251,188,4,.25)"; if (P.rp.length === 4) ctx.fill(); ctx.strokeStyle = "#FBBC04"; ctx.lineWidth = 3; ctx.stroke();
        P.rp.forEach(p => dot(toScr(p), "#FBBC04", 7));
      }
      // room corners
      if (P.pts.length) {
        const n = P.pts.length, closed = !line && (P.closed || P.step === "check") && n >= 3;
        ctx.beginPath(); P.pts.forEach((p, i) => { const s = toScr(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); if (closed) ctx.closePath();
        if (closed) { ctx.fillStyle = "rgba(26,115,232,.18)"; ctx.fill(); }
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
        const segs = line ? (n === 2 ? [[0, 1]] : []) : P.pts.map((p, i) => [i, (i + 1) % n]).slice(0, closed ? n : n - 1);
        segs.forEach(([a, b]) => { const d = dist(P.pts[a], P.pts[b]); if (!d) return; const A = toScr(P.pts[a]), B = toScr(P.pts[b]); tag((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, fmt(d, 2) + " m"); });
        P.pts.forEach((p, i) => dot(toScr(p), "#1A73E8", i === 0 && !line && P.step === "pts" && n >= 3 ? 11 : 8));
      }
    }
    function dot(s, c, r) { ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    function tag(x, y, t) { ctx.font = "500 14px Roboto,sans-serif"; const w = ctx.measureText(t).width + 20; ctx.fillStyle = "#fff"; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 14, w, 28, 14); else ctx.rect(x - w / 2, y - 14, w, 28); ctx.fill(); ctx.fillStyle = "#202124"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, x, y + 1); }
    function loupe(x, y, p) {
      lp.hidden = false; lp.style.left = (x < st.clientWidth / 2 ? st.clientWidth - 136 : 16) + "px";
      const R = 120, span = 60 / fit.s / 2; lctx.save(); lctx.clearRect(0, 0, 240, 240); lctx.beginPath(); lctx.arc(R, R, R - 3, 0, 7); lctx.clip();
      lctx.fillStyle = "#000"; lctx.fillRect(0, 0, 240, 240);
      lctx.drawImage(img, p[0] - span, p[1] - span, 2 * span, 2 * span, 0, 0, 240, 240);
      lctx.strokeStyle = "#fff"; lctx.lineWidth = 2; lctx.beginPath(); lctx.moveTo(R - 18, R); lctx.lineTo(R + 18, R); lctx.moveTo(R, R - 18); lctx.lineTo(R, R + 18); lctx.stroke();
      lctx.restore(); lctx.beginPath(); lctx.arc(R, R, R - 3, 0, 7); lctx.lineWidth = 5; lctx.strokeStyle = "#fff"; lctx.stroke();
    }
    /* press anywhere, slide to the exact spot with the magnifier, lift to place; press a dot to move it */
    function hit(list, x, y) { let best = -1, bd = 16; list.forEach((p, i) => { const s = toScr(p), d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; best = i; } }); return best; }
    /* two fingers = zoom and move the photo; the wheel zooms on a computer */
    function zoomAt(mx, my, z) { const ip = toImg(mx, my); view.z = Math.max(1, Math.min(14, z)); const s = Math.min(st.clientWidth / img.naturalWidth, st.clientHeight / img.naturalHeight) * view.z; view.cx = ip[0] - (mx - st.clientWidth / 2) / s; view.cy = ip[1] - (my - st.clientHeight / 2) / s; layout(); }
    cv.addEventListener("wheel", e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, view.z * (e.deltaY < 0 ? 1.25 : 0.8)); }, { passive: false });
    function pinchInfo() { const t = [...touches.values()], r = cv.getBoundingClientRect(); return { mx: (t[0].x + t[1].x) / 2 - r.left, my: (t[0].y + t[1].y) / 2 - r.top, d: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1 }; }
    cv.addEventListener("pointerdown", e => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { // second finger: undo the dot the first finger just started, then zoom
        if (P.drag && P.drag.created) P[P.drag.list].splice(P.drag.i, 1);
        P.drag = null; lp.hidden = true; const pi = pinchInfo(); pinch = { ...pi, z: view.z, ip: toImg(pi.mx, pi.my) }; draw(); return;
      }
      if (touches.size > 2 || pinch) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const L = P.step === "ref" ? P.rp : P.pts;
      let i = hit(L, x, y);
      if (P.step === "pts" && !line && i === 0 && P.pts.length >= 3) { P.closed = true; setStep("check"); return; }
      if (i < 0 && P.step === "check") { i = hit(P.pts, x, y); if (i < 0) { const j = hit(P.rp, x, y); if (j >= 0) P.drag = { list: "rp", i: j }; } else P.drag = { list: "pts", i }; }
      else if (i >= 0) P.drag = { list: P.step === "ref" ? "rp" : "pts", i };
      else {
        if (P.step === "ref" && P.rp.length >= 4) return; if (P.step === "pts" && line && P.pts.length >= 2) return; if (P.step === "check") return;
        L.push(toImg(x, y)); P.drag = { list: P.step === "ref" ? "rp" : "pts", i: L.length - 1, created: true };
      }
      cv.setPointerCapture(e.pointerId); e.preventDefault(); if (P.drag) { draw(); loupe(x, y, P[P.drag.list][P.drag.i]); }
    });
    function move(x, y) { if (!P.drag) return; const d = P.drag; if (d.lx == null) { d.lx = x; d.ly = y; } const p = P[d.list][d.i]; p[0] += (x - d.lx) / fit.s / 3; p[1] += (y - d.ly) / fit.s / 3; d.lx = x; d.ly = y; draw(); loupe(x, y, p); }
    cv.addEventListener("pointermove", e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) { const pi = pinchInfo(); view.z = Math.max(1, Math.min(14, pinch.z * pi.d / pinch.d)); const s = Math.min(st.clientWidth / img.naturalWidth, st.clientHeight / img.naturalHeight) * view.z; view.cx = pinch.ip[0] - (pi.mx - st.clientWidth / 2) / s; view.cy = pinch.ip[1] - (pi.my - st.clientHeight / 2) / s; layout(); return; }
      if (!P.drag) return; const r = cv.getBoundingClientRect(); move(e.clientX - r.left, e.clientY - r.top);
    });
    const up = e => { touches.delete(e.pointerId); if (pinch) { if (!touches.size) pinch = null; return; } if (!P.drag) return; P.drag = null; lp.hidden = true; solve(); draw(); renderPanel(); };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    function setStep(s) { P.step = s; if (s !== "ref") { view.z = 1; view.cx = img.naturalWidth / 2; view.cy = img.naturalHeight / 2; } draw(); renderPanel(); }
    cv._toScr = toScr;
    function chips() {
      const c = (t, st2) => '<span class="mz-c ' + st2 + '">' + t + "</span>", o = ["ref", "pts", "check"].indexOf(P.step);
      return '<div class="mz-cs">' + c("1 Size guide" + (o > 0 ? " ✓" : ""), o > 0 ? "ok" : "on") + c("2 " + (line ? "Bottom + top" : "Room corners") + (o > 1 ? " ✓" : ""), o > 1 ? "ok" : o === 1 ? "on" : "") + c("3 Check", o === 2 ? "on" : "") + "</div>";
    }
    function renderPanel() {
      const m = measure();
      let h = chips();
      if (P.step === "ref") {
        h += '<div class="lab" style="margin-top:4px">Size guide in the photo</div>' + E.box(REFS.map(r => [r[0], r[1]]), P.ref, "mref") +
          '<div class="fg" style="margin-top:8px"><label class="f"><span>Width (mm)</span><input id="mzRw" type="number" inputmode="decimal" value="' + (P.rw || "") + '"></label><label class="f"><span>Height (mm)</span><input id="mzRh" type="number" inputmode="decimal" value="' + (P.rh || "") + '"></label></div>' +
          '<p class="hint">Pinch to zoom in on the ' + ({ a4: "A4 sheet", tile: "tile", door: "door", other: "guide" })[P.ref] + ", then tap its 4 corners (" + P.rp.length + " of 4). Press and slide to fine-tune with the magnifier.</p>" +
          '<div class="row" style="margin-top:10px"><button class="btn" data-a="undo"' + (P.rp.length ? "" : " disabled") + ">" + ico("undo") + 'Undo</button><button class="btn pri" data-a="ref-ok"' + (P.H ? "" : " disabled") + ">Next</button></div>";
      } else if (P.step === "pts") {
        h += '<p class="hint" style="margin-top:4px">' + (line ? "Tap the bottom of the wall, then the top." : "Tap each corner of the " + (surf === "ceiling" ? "ceiling" : "floor") + ", going around the room. Tap the first dot again to finish.") + "</p>" +
          (m && !line ? '<div class="kv"><span>So far</span><b>' + fmt(m.perimeter, 2) + " m around</b></div>" : "") + (m && line ? '<div class="kv"><span>Height</span><b>' + fmt(m.len, 2) + " m</b></div>" : "") +
          '<div class="row" style="margin-top:10px"><button class="btn" data-a="undo"' + (P.pts.length ? "" : " disabled") + ">" + ico("undo") + 'Undo</button><button class="btn pri" data-a="pts-ok"' + (m ? "" : " disabled") + ">" + ico("check") + "Done</button></div>";
      } else {
        h += (m ? (line ? '<div class="kv big"><span>Height</span><b>' + fmt(m.len, 2) + " m</b></div>" : '<div class="kv big"><span>Area</span><b>' + fmt(m.area, 2) + ' m²</b></div><div class="kv"><span>Perimeter</span><b>' + fmt(m.perimeter, 2) + " m</b></div>") : "") +
          '<p class="hint">Yellow = your size guide. Drag any dot to fix it. Check one side with a tape if the price depends on it.</p>' +
          '<div class="row" style="margin-top:10px"><button class="btn" data-a="retake">' + ico("cam") + 'Retake</button><button class="btn pri" data-a="use">' + ico("check") + "Use sizes</button></div>";
      }
      panel.innerHTML = h; requestAnimationFrame(layout);
    }
    panel.addEventListener("input", e => { if (e.target.id === "mzRw") P.rw = num(e.target.value); if (e.target.id === "mzRh") P.rh = num(e.target.value); solve(); draw(); const b = panel.querySelector('[data-a="ref-ok"]'); if (b) b.disabled = !P.H; });
    ov.addEventListener("click", e => {
      const r = e.target.closest("[data-mref]"); if (r) { P.ref = r.dataset.mref; const d = REFS.find(x => x[0] === P.ref); P.rw = d[2]; P.rh = d[3]; solve(); draw(); renderPanel(); return; }
      const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
      if (a === "close") close();
      else if (a === "undo") { (P.step === "ref" ? P.rp : P.pts).pop(); P.closed = false; solve(); draw(); renderPanel(); }
      else if (a === "ref-ok") setStep("pts");
      else if (a === "pts-ok") { P.closed = true; setStep("check"); }
      else if (a === "retake") { close(); photo(surf); }
      else if (a === "use") { const m = measure(); if (!m) return; close(); got(surf, line ? { len: m.len, method: "photo" } : Object.assign(m, { method: "photo" })); }
    });
    window.addEventListener("resize", layout);
    renderPanel();
  }

  /* ---------- results ---------- */
  function result() {
    const o = C.opts, R = C.res;
    if (!R.floor && !R.ceiling && R.height && C.what === "height") { finish(); return; }
    let tab = R.floor ? "floor" : "ceiling";
    const ov = document.createElement("div"); ov.className = "mres";
    document.body.appendChild(ov);
    const prevBack = window.onBack;
    window.onBack = () => { if (document.querySelector(".sheet")) return prevBack(); close(); return true; };
    function close() { ov.remove(); window.onBack = prevBack; }
    function cur() { return R[tab]; }
    function render() {
      const m = cur(), ceilSame = !R.ceiling;
      const area = m ? m.area : 0, per = m ? m.perimeter : 0;
      const mainPer = (R.floor || R.ceiling || {}).perimeter || 0, h = R.height != null ? R.height : o.height;
      let html = '<header class="eh"><button class="ib" data-a="close" aria-label="Close">' + ico("back") + '</button><div class="tt"><b>' + esc(o.title || "Measure") + "</b><small>" + (m ? HOW[m.method] || "" : "") + "</small></div></header><div class=\"eb\">";
      if (R.floor && R.ceiling) html += E.box([["floor", "Floor"], ["ceiling", "Ceiling"]], tab, "mtab");
      if (m) {
        html += '<div class="card" style="margin-top:12px"><div style="display:flex;align-items:center;gap:12px">' + mini(m) + '<div style="flex:1"><div class="kv big"><span>Area</span><b>' + fmt(area, 2) + ' m²</b></div><div class="kv"><span>Perimeter</span><b>' + fmt(per, 2) + ' m</b></div><div class="kv"><span>Accuracy</span><b style="color:var(--ok)">' + ACC[m.method] + "</b></div></div></div></div>";
        if (m.sides && m.sides.length) html += '<div class="card p0">' + m.sides.map((v, i) => '<div class="li"><span class="pill blue" style="width:28px;text-align:center">' + String.fromCharCode(65 + i) + '</span><span class="g">Side ' + String.fromCharCode(65 + i) + '</span><input class="num" type="number" inputmode="decimal" step="0.01" data-side="' + i + '" value="' + (Math.round(v * 100) / 100) + '"> m</div>').join("") + "</div>";
        html += '<div class="fg"><label class="f"><span>Area (m²)</span><input type="number" inputmode="decimal" step="0.01" data-fix="area" value="' + (Math.round(area * 100) / 100) + '"></label><label class="f"><span>Perimeter (m)</span><input type="number" inputmode="decimal" step="0.01" data-fix="perimeter" value="' + (Math.round(per * 100) / 100) + '"></label></div>';
      }
      if (o.ceiling && R.floor && !C.res.ceilingSet) html += '<div class="lab">Ceiling</div>' + E.box([["same", "Same as floor"], ["measure", "Measure ceiling"]], ceilSame ? "same" : "", "mceil");
      if (o.ceiling || C.what === "walls") html += '<div class="lab">Walls</div><div class="card"><div class="kv"><span>' + esc(o.heightLabel) + '</span><input class="num" type="number" inputmode="decimal" step="0.01" data-h value="' + (h || "") + '"> m</div>' +
        '<div class="kv"><span>Wall area (perimeter × height)</span><b data-wa>' + fmt(mainPer * (h || 0), 1) + " m²</b></div>" + '<button class="btn" data-a="mh" style="margin:6px 0 4px;width:100%">' + ico("cam") + "Measure the height</button>" + "</div></div>";
      html += '<div class="bar"><div class="bt"><span>' + esc(o.title || "") + "</span><b>" + fmt((R.floor || R.ceiling || {}).area || 0, 1) + ' m²</b></div><div class="row"><button class="btn" data-a="again">Measure again</button><button class="btn pri" data-a="use">Use these</button></div></div>';
      ov.innerHTML = html;
    }
    ov.addEventListener("input", e => {
      const t = e.target, m = cur();
      if (t.dataset.side != null && m) { m.sides[+t.dataset.side] = num(t.value); m.perimeter = m.sides.reduce((a, b) => a + b, 0); const p = ov.querySelector('[data-fix="perimeter"]'); if (p) p.value = Math.round(m.perimeter * 100) / 100; if (m.sides.length === 4 && m.method === "typed") { m.area = m.sides[0] * m.sides[1]; ov.querySelector('[data-fix="area"]').value = Math.round(m.area * 100) / 100; } }
      if (t.dataset.fix && m) m[t.dataset.fix] = num(t.value);
      if (t.dataset.h != null) R.height = num(t.value);
      const wa = ov.querySelector("[data-wa]"); if (wa) wa.textContent = fmt(((R.floor || R.ceiling || {}).perimeter || 0) * (R.height != null ? R.height : o.height || 0), 1) + " m²";
      const bt = ov.querySelector(".bt b"); if (bt) bt.textContent = fmt((R.floor || R.ceiling || {}).area || 0, 1) + " m²";
    });
    ov.addEventListener("click", e => {
      const tb = e.target.closest("[data-mtab]"); if (tb) { tab = tb.dataset.mtab; render(); return; }
      const ce = e.target.closest("[data-mceil]"); if (ce) { if (ce.dataset.mceil === "measure") { close(); pick("ceiling"); } else { delete R.ceiling; render(); } return; }
      const b = e.target.closest("[data-a]"); if (!b) return;
      if (b.dataset.a === "close") close();
      else if (b.dataset.a === "again") { close(); C.res = {}; pick(); }
      else if (b.dataset.a === "mh") { close(); pick("height"); }
      else if (b.dataset.a === "use") { close(); finish(); }
    });
    render();
  }
  function finish() {
    const R = C.res, out = { floor: R.floor || null, ceiling: R.ceiling ? R.ceiling : { same: true }, height: R.height != null ? R.height : null, what: C.what };
    if (host && host.apply) host.apply(C.ctx, out);
  }
  function mini(m) {
    let pts = m.pts;
    if (!pts || pts.length < 3) { const s = m.sides && m.sides.length === 4 ? m.sides : [1.3, 1, 1.3, 1]; pts = [[0, 0], [s[0], 0], [s[0], s[1]], [0, s[1]]]; }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1, k = Math.min(96 / w, 76 / h);
    const P = pts.map(p => [12 + (p[0] - x0) * k, 12 + (p[1] - y0) * k]);
    const lab = P.map((p, i) => { const q = P[(i + 1) % P.length]; return '<text x="' + ((p[0] + q[0]) / 2) + '" y="' + ((p[1] + q[1]) / 2 + 4) + '" font-size="10" text-anchor="middle" fill="#5F6368">' + String.fromCharCode(65 + i) + "</text>"; }).join("");
    return '<svg width="120" height="100" viewBox="0 0 120 100" style="flex:none"><polygon points="' + P.map(p => p.join(",")).join(" ") + '" fill="#E8F0FE" stroke="#1A73E8" stroke-width="2"/>' + lab + "</svg>";
  }

  /* ---------- maths ---------- */
  function shoelace(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
  /* Photo -> real sizes. The floor (or wall / ceiling) is a flat plane seen in perspective. Unknowns: the plane's tilt (2 angles)
     and the camera's focal length. They are found by making every room corner and the size guide's corners square again and the guide's
     shape right (A4 = 297 x 210); the guide then sets the scale. Room corners span the photo, so small tap errors matter little. */
  function rectify(room, closed, ref, rw, rh, iw, ih) {
    const cx = iw / 2, cy = ih / 2, f0 = 0.6 * Math.hypot(iw, ih);
    const R = room.map(p => [p[0] - cx, p[1] - cy]);
    let F = ref.map(p => [p[0] - cx, p[1] - cy]);
    { const c = F.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); F = F.sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0])); }
    const asp = Math.max(rw, rh) / Math.min(rw, rh);
    const mk = x => {
      const a = x[0], b = x[1], f = f0 * Math.exp(x[2]), n = [Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b), Math.cos(a)];
      let u = [n[1], -n[0], 0]; const l = Math.hypot(u[0], u[1]); u = l < 1e-9 ? [1, 0, 0] : [u[0] / l, u[1] / l, 0];
      const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      return p => { const r = [p[0], p[1], f], d = n[0] * r[0] + n[1] * r[1] + n[2] * r[2]; if (Math.abs(d) < 1e-9) return [1e9, 1e9]; return [(r[0] * u[0] + r[1] * u[1] + r[2] * u[2]) / d, (r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / d]; };
    };
    const cosAt = (P, i) => { const n = P.length, a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], x = [a[0] - b[0], a[1] - b[1]], y = [c[0] - b[0], c[1] - b[1]]; return (x[0] * y[0] + x[1] * y[1]) / (Math.hypot(x[0], x[1]) * Math.hypot(y[0], y[1]) + 1e-12); };
    const sides = P => P.map((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]); });
    const cost = x => {
      if (x[0] < 0.01 || x[0] > 1.55) return 1e9;
      const m = mk(x); let c = 0;
      if (R.length >= 3) { const P = R.map(m), n = P.length; for (let i = 0; i < n; i++) { if (!closed && (i === 0 || i === n - 1)) continue; const k = cosAt(P, i); c += k * k; } }
      const P = F.map(m); for (let i = 0; i < 4; i++) { const k = cosAt(P, i); c += 0.5 * k * k; }
      const s = sides(P), A = (s[0] + s[2]) / 2, B = (s[1] + s[3]) / 2; c += 0.3 * Math.pow(Math.log(Math.max(A, B) / Math.min(A, B) / asp), 2);
      return c + 0.02 * x[2] * x[2];
    };
    let best = null;
    for (let a = 0.1; a < 1.5; a += 0.2) for (let b = -Math.PI; b < Math.PI; b += Math.PI / 6) { const r = nelder(cost, [a, b, 0]); if (!best || r.f < best.f) best = r; }
    const m = mk(best.x), s = sides(F.map(m)), A = (s[0] + s[2]) / 2, B = (s[1] + s[3]) / 2;
    const k = Math.sqrt((rw * rh) / (A * B));
    return p => { const q = m([p[0] - cx, p[1] - cy]); return [q[0] * k, q[1] * k]; };
  }
  function nelder(fn, x0) {
    const n = x0.length; let S = [x0]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += i === 2 ? 0.3 : 0.15; S.push(x); } let V = S.map(fn);
    for (let it = 0; it < 200; it++) {
      const o = V.map((v, i) => i).sort((a, b) => V[a] - V[b]); S = o.map(i => S[i]); V = o.map(i => V[i]);
      const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
      const rf = c.map((v, j) => v + (v - S[n][j])), fr = fn(rf);
      if (fr < V[0]) { const ex = c.map((v, j) => v + 2 * (v - S[n][j])), fe = fn(ex); if (fe < fr) { S[n] = ex; V[n] = fe; } else { S[n] = rf; V[n] = fr; } }
      else if (fr < V[n - 1]) { S[n] = rf; V[n] = fr; }
      else { const co = c.map((v, j) => v + 0.5 * (S[n][j] - v)), fc = fn(co); if (fc < V[n]) { S[n] = co; V[n] = fc; } else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); V[i] = fn(S[i]); } }
      if (Math.abs(V[n] - V[0]) < 1e-14) break;
    }
    return { x: S[0], f: V[0] };
  }

  function init(h) { host = h; setTimeout(arBack, 0); }
  window.Measure = { init, open, _t: { rectify, shoelace } };
})();
