/* Live camera (AR) measuring for pages that are not the Painting/Tiling estimators.
   ArLite.init(function(res, ctx){...}) once; ArLite.measure({kind:'line'|'area', title, ctx, fields:true}).
   res: {len} for a line, {area, perimeter, sides} for an area, or {cancel:true,msg}. Opens the same Chrome AR page and returns through shopmate://ar. */
(function () {
  "use strict";
  const URL_AR = "https://falahjoon-prog.github.io/Shopmate/app/ar/measure.html", N = () => window.GPNative;
  const can = () => !!(N() && N().openUrl && N().takeAr && /Android/i.test(navigator.userAgent)) || !!(window.LiveCam && LiveCam.ok());
  let handler = null;
  const snap = () => { const o = {}; document.querySelectorAll("input[id],select[id],textarea[id]").forEach(e => { if (e.type !== "file") o[e.id] = e.type === "checkbox" ? e.checked : e.value; }); return o; };
  function measure(o) {
    if (window.LiveCam && LiveCam.ok()) { LiveCam.run({ kind: o.kind, title: o.title }, r => { if (handler) handler(r, o.ctx); }); return; }
    if (!can()) { alert("Live camera measuring needs the ShopMate Android app."); return; }
    try {
      localStorage.setItem("sm_measure", JSON.stringify({ ctx: o.ctx, fields: o.fields ? snap() : null, lar: 1 }));
      localStorage.setItem("sm_ar_page", location.pathname.split("/www/").pop() || location.pathname);
    } catch (e) { }
    N().openUrl(URL_AR + "?m=" + (o.kind === "line" ? "line" : "poly") + "&s=floor&t=" + encodeURIComponent(o.title || "Measure"));
  }
  function back() {
    let raw = ""; try { raw = N() && N().takeAr ? N().takeAr() : ""; } catch (e) { }
    if (!raw) return;
    let st = null, d = null; try { st = JSON.parse(localStorage.getItem("sm_measure") || "null"); d = JSON.parse(raw); } catch (e) { }
    if (!st || !st.lar) return;
    try { localStorage.removeItem("sm_measure"); localStorage.removeItem("sm_ar_page"); } catch (e) { }
    if (st.fields) Object.keys(st.fields).forEach(id => { const e = document.getElementById(id); if (e) { if (e.type === "checkbox") e.checked = !!st.fields[id]; else e.value = st.fields[id]; } });
    if (handler && d) handler(d, st.ctx);
  }
  window.onArMeasure = back;
  window.ArLite = { can, measure, init(h) { handler = h; setTimeout(back, 0); } };
})();
