/* Live camera measuring for iPhone / iPad (Safari has no AR). Uses the camera view plus the phone's tilt sensors:
   with the phone's height above the floor known, a point on the floor is found from the angle the camera looks down.
   Stand in one spot and turn on the spot. LiveCam.ok(); LiveCam.run({kind:'poly'|'line', title}, cb) -> cb({sides,area,perimeter,pts}|{len}|{cancel:true,msg}). */
(function () {
  "use strict";
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ok = () => !!(ios() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.DeviceOrientationEvent);
  const rad = Math.PI / 180;
  function dirOf(a, b, g) { // where the back camera looks: world x = east, y = north, z = up
    const ca = Math.cos(a * rad), sa = Math.sin(a * rad), sb = Math.sin(b * rad), cb = Math.cos(b * rad), sg = Math.sin(g * rad), cg = Math.cos(g * rad);
    return [-(ca * sg + sa * sb * cg), -(sa * sg - ca * sb * cg), -(cb * cg)];
  }
  function floorPoint(d, h) { if (d[2] > -0.03) return null; const t = h / -d[2]; return [d[0] * t, d[1] * t]; }
  function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(s / 2); }
  const sidesOf = p => p.map((a, i) => { const q = p[(i + 1) % p.length]; return Math.hypot(a[0] - q[0], a[1] - q[1]); });
  const heightOf = (base, top, h) => { const bp = floorPoint(base, h); if (!bp) return null; const D = Math.hypot(bp[0], bp[1]), hz = Math.hypot(top[0], top[1]); return h + D * (top[2] / (hz || 1e-6)); };

  function run(o, cb) {
    const line = o.kind === "line"; let stream = null, pts = [], rays = [], recent = [], H = 1.5, mapX = null, done = false;
    try { H = parseFloat(localStorage.getItem("sm_phone_h")) || 1.5; } catch (e) { }
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000;color:#fff;font:15px -apple-system,system-ui,sans-serif;display:flex;flex-direction:column";
    root.innerHTML = '<video playsinline muted autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>' +
      '<div style="position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000"></div>' +
      '<div style="position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;background:#ffd25a;border-radius:50%"></div>' +
      '<div style="position:relative;padding:max(12px,env(safe-area-inset-top)) 14px 10px;background:linear-gradient(#000c,#0000)"><b id="lcT"></b><div id="lcI" style="margin-top:4px;opacity:.92"></div></div>' +
      '<canvas id="lcM" width="240" height="240" style="position:absolute;right:10px;top:96px;width:110px;height:110px;background:#0008;border-radius:10px"></canvas>' +
      '<div style="margin-top:auto;position:relative;padding:10px 14px max(14px,env(safe-area-inset-bottom));background:linear-gradient(#0000,#000c)">' +
      '<div id="lcS" style="margin-bottom:8px;min-height:20px"></div>' +
      '<div style="display:flex;gap:8px"><button id="lcU" style="flex:0 0 auto;padding:12px 14px;border-radius:12px;border:0;background:#fff3;color:#fff">Undo</button>' +
      '<button id="lcA" style="flex:1;padding:14px;border-radius:12px;border:0;background:#2F9BD6;color:#fff;font-weight:600;font-size:16px"></button>' +
      '<button id="lcD" style="flex:0 0 auto;padding:12px 14px;border-radius:12px;border:0;background:#1FA97E;color:#fff;font-weight:600">Done</button>' +
      '<button id="lcX" style="flex:0 0 auto;padding:12px 14px;border-radius:12px;border:0;background:#fff3;color:#fff">Cancel</button></div></div>';
    document.body.appendChild(root);
    const $ = id => root.querySelector("#" + id), video = root.querySelector("video");
    $("lcT").textContent = (o.title || "Live camera") + " · phone camera";
    function finish(r) { if (done) return; done = true; window.removeEventListener("deviceorientation", onOri); try { stream && stream.getTracks().forEach(t => t.stop()); } catch (e) { } root.remove(); cb(r); }
    function onOri(e) { if (e.alpha == null || e.beta == null) return; recent.push(dirOf(e.alpha, e.beta, e.gamma || 0)); if (recent.length > 8) recent.shift(); }
    const avg = () => { if (!recent.length) return null; const s = [0, 0, 0]; recent.forEach(v => { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }); const n = Math.hypot(s[0], s[1], s[2]) || 1; return [s[0] / n, s[1] / n, s[2] / n]; };
    function map() {
      const c = $("lcM"), g = c.getContext("2d"); g.clearRect(0, 0, 240, 240); if (pts.length < 1) return;
      const xs = pts.map(p => p[0]).concat(0), ys = pts.map(p => p[1]).concat(0), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), sc = 200 / Math.max(x1 - x0, y1 - y0, 1);
      const P = p => [20 + (p[0] - x0) * sc, 220 - (p[1] - y0) * sc];
      g.strokeStyle = "#ffd25a"; g.lineWidth = 3; g.beginPath(); pts.forEach((p, i) => { const q = P(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); if (!line && pts.length > 2) g.closePath(); g.stroke();
      g.fillStyle = "#fff"; const me = P([0, 0]); g.beginPath(); g.arc(me[0], me[1], 5, 0, 7); g.fill();
    }
    function status() {
      if (line) { $("lcA").textContent = rays.length ? "Mark the TOP of the wall" : "Mark the BASE of the wall"; $("lcS").textContent = rays.length >= 2 ? "Height " + heightOf(rays[0], rays[1], H).toFixed(2) + " m" : "Phone height " + H.toFixed(2) + " m"; $("lcD").style.display = rays.length >= 2 ? "" : "none"; }
      else { const n = pts.length; $("lcA").textContent = "Add corner " + (n + 1); const s = n > 1 ? sidesOf(pts.length > 2 ? pts : pts.concat([pts[0]])) : []; $("lcS").textContent = n < 3 ? (n ? n + " corner" + (n > 1 ? "s" : "") + " · phone height " + H.toFixed(2) + " m" : "Phone height " + H.toFixed(2) + " m") : n + " corners · " + area(pts).toFixed(2) + " m²"; $("lcD").style.display = n >= 3 ? "" : "none"; }
      map();
    }
    $("lcI").innerHTML = line ? "Stand a few metres from the wall. Aim the circle at where the wall meets the floor, tap, then aim at the top edge and tap."
      : "Stand in one spot and turn on the spot. Aim the circle at each floor corner (where the wall meets the floor) and tap. Don't step while measuring.";
    const hrow = document.createElement("div"); hrow.style.cssText = "margin-top:8px"; hrow.innerHTML = 'Phone height above the floor (m): <input type="number" step="0.05" min="0.5" max="2.2" value="' + H + '" style="width:70px;padding:5px;border-radius:8px;border:0;font-size:16px">';
    $("lcI").appendChild(hrow); hrow.querySelector("input").onchange = e => { const v = parseFloat(e.target.value); if (v >= 0.5 && v <= 2.2) { H = v; try { localStorage.setItem("sm_phone_h", String(v)); } catch (x) { } pts = []; rays = []; status(); } };
    $("lcA").onclick = () => {
      const d = avg(); if (!d) return alert("The tilt sensor is not giving readings yet. Move the phone a little and try again.");
      if (line) {
        if (!rays.length) { if (!floorPoint(d, H)) return alert("Aim lower, at the floor where the wall starts."); rays.push(d); pts = [[0, 0]]; }
        else if (rays.length === 1) { rays.push(d); const hh = heightOf(rays[0], d, H); if (!(hh > 0.2 && hh < 30)) { rays.pop(); return alert("That doesn't look right. Aim at the top edge of the wall."); } }
      } else { const p = floorPoint(d, H); if (!p) return alert("Aim lower, at the floor corner."); pts.push(p); }
      status();
    };
    $("lcU").onclick = () => { if (line) { rays.pop(); pts = rays.length ? [[0, 0]] : []; } else pts.pop(); status(); };
    $("lcD").onclick = () => {
      if (line) { if (rays.length < 2) return; finish({ len: Math.round(heightOf(rays[0], rays[1], H) * 100) / 100 }); }
      else { if (pts.length < 3) return; const sd = sidesOf(pts), r = x => Math.round(x * 100) / 100; finish({ sides: sd.map(r), area: r(area(pts)), perimeter: r(sd.reduce((a, b) => a + b, 0)), pts: pts.map(p => [r(p[0]), r(p[1])]) }); }
    };
    $("lcX").onclick = () => finish({ cancel: true });
    status();
    (async () => {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") { const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") return finish({ cancel: true, msg: "Motion access was not allowed. Allow it in Safari settings to measure with the camera." }); }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        video.srcObject = stream; video.play && video.play().catch(() => { });
        window.addEventListener("deviceorientation", onOri);
      } catch (e) { finish({ cancel: true, msg: "Could not open the camera. Allow camera access for this site in Safari settings." }); }
    })();
  }
  window.LiveCam = { ok, run, _t: { dirOf, floorPoint, heightOf, area } };
})();
