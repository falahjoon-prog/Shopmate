/* ShopMate AI - Painting estimator (new look): Job -> Rooms -> Paint -> Price. Everything saves on the phone as you go. */
(function () {
  "use strict";
  const E = window.EST, esc = E.esc, money = E.money, fmt = E.fmt, num = E.num, ico = E.ico, $ = id => document.getElementById(id);
  const KEY = "shopmate.painting.v1", CUR = "shopmate.painting.current.v2";
  const STEPS = ["Job", "Rooms", "Paint", "Price"];
  const COND = [[1, "Good"], [1.15, "Average"], [1.35, "Poor"]];
  const WET = [[0, "Not tiled"], [0.15, "Tiled skirting"], [1.2, "Half tiled"], [2.1, "Tiled to 2.1 m"], [9, "Fully tiled"]];
  /* ---------- PaintingAI pricing (same rules and defaults as the desktop PaintingAI) ---------- */
  // paint classes: key, name, $ per litre, coverage m² per litre
  const CLS = [["acrylic", "Interior acrylic", 22, 16], ["ceiling", "Ceiling paint", 18, 16], ["enamel", "Enamel (doors, trims)", 32, 12], ["primer", "Sealer / undercoat", 18, 14], ["exterior", "Exterior acrylic", 26, 14], ["roof", "Roof paint", 24, 8], ["epoxy", "Floor coating / epoxy", 45, 6], ["stain", "Stain / deck oil", 30, 10]];
  // item: name, unit, basis (m2 / lm: production = per hour per coat, paint = m² of surface per unit; each: hours each and litres each, all coats), production, paint per unit, paint class, my rate ($ per unit)
  const K = {
    walls: ["Walls - inside", "m²", "m2", 25, 1, "acrylic", 18], ceiling: ["Ceilings", "m²", "m2", 18, 1, "ceiling", 16], wetceil: ["Wet-area ceilings", "m²", "m2", 15, 1, "ceiling", 20],
    feature: ["Feature walls", "m²", "m2", 15, 1, "acrylic", 22], skirting: ["Skirtings", "m", "lm", 12, 0.10, "enamel", 8], architrave: ["Architraves", "m", "lm", 12, 0.07, "enamel", 8],
    cornice: ["Cornices", "m", "lm", 15, 0.09, "ceiling", 6], doors: ["Doors - inside", "each", "each", 1.5, 0.6, "enamel", 120], extdoors: ["Doors - outside", "each", "each", 2, 0.6, "enamel", 160],
    windows: ["Windows (timber)", "each", "each", 1, 0.3, "enamel", 70], extwall: ["Walls - outside", "m²", "m2", 12, 1, "exterior", 25], ext: ["Render, cladding & soffits", "m²", "m2", 10, 1, "exterior", 25],
    roof_eaves: ["Eaves linings", "m²", "m2", 10, 1, "exterior", 25], roof_area: ["Roof", "m²", "m2", 20, 1, "roof", 22], roof_gutter: ["Gutters", "m", "lm", 8, 0.30, "exterior", 12],
    roof_fascia: ["Fascias", "m", "lm", 8, 0.25, "exterior", 12], roof_barge: ["Barge boards", "m", "lm", 6, 0.25, "exterior", 12], roof_downpipe: ["Downpipes", "m", "lm", 5, 0.30, "exterior", 12],
    fence_item: ["Fences", "m²", "m2", 15, 1, "exterior", 18], deck_item: ["Decks", "m²", "m2", 20, 1, "stain", 25], pergola_item: ["Pergolas", "m²", "m2", 6, 1.5, "exterior", 30],
    post_item: ["Posts / columns", "each", "each", 0.5, 0.2, "exterior", 30], balustrade_item: ["Balustrades", "m", "lm", 3, 2.0, "enamel", 45], handrail_item: ["Handrails", "m", "lm", 8, 0.25, "enamel", 18],
    stair_item: ["Stairs (per flight)", "each", "each", 6, 1.0, "enamel", 450], floor_coating: ["Floor coating / epoxy", "m²", "m2", 18, 1, "epoxy", 35], prep: ["Sealer / undercoat", "m²", "m2", 30, 1, "primer", 6]
  };
  const DOORS = { "FLUSH": 1.5, "PANEL": 2, "FRENCH / GLAZED (PAIR)": 3, "ROBE BI-FOLD": 2, "CAVITY SLIDER": 1.5, "ENTRY (SOLID)": 2, "BARN / FEATURE": 2.5, "GARAGE - PANEL LIFT": 3 };
  const LOADS = { "REPAINT": 20, "TWO STOREY": 15, "SCAFFOLD / EWP": 25, "OCCUPIED": 10 };
  /* coverage by brand (m² per litre: walls, ceilings, exterior, enamel, roof, floor, stain) - desktop PaintingAI "Coverage by brand" */
  const BRANDS = { "DULUX": [16, 16, 14, 12, 8, 6, 10], "TAUBMANS": [16, 14, 14, 12, 8, 6, 10], "HAYMES": [16, 16, 14, 12, 8, 6, 10], "WATTYL": [14, 14, 12, 12, 8, 6, 10], "BRITISH PAINTS": [14, 14, 12, 12, 8, 6, 10], "RESENE": [14, 14, 12, 12, 8, 6, 10],
    "INTERGRAIN": [12, 12, 12, 12, 8, 6, 10], "CABOT'S": [12, 12, 12, 12, 8, 6, 10], "SIKKENS": [12, 12, 12, 12, 8, 6, 8], "BERGER": [14, 14, 12, 12, 8, 6, 10], "SOLVER": [14, 14, 12, 12, 8, 6, 10] };
  const BCLS = ["acrylic", "ceiling", "exterior", "enamel", "roof", "epoxy", "stain"];
  /* colour schedule: each item belongs to one paint group (anything outside not listed is "Outside") */
  const CG = { walls: "Walls", feature: "Feature walls", ceiling: "Ceilings", cornice: "Ceilings", wetceil: "Wet-area ceilings", skirting: "Doors & trims", architrave: "Doors & trims", doors: "Doors & trims", extdoors: "Doors & trims", windows: "Doors & trims",
    balustrade_item: "Doors & trims", handrail_item: "Doors & trims", stair_item: "Doors & trims", roof_area: "Roof", deck_item: "Decks", floor_coating: "Floors", prep: "Sealer / undercoat" };
  const grp = k => CG[k] || "Outside", FIN = ["Flat", "Matt", "Low sheen", "Satin", "Semi-gloss", "Gloss"];
  const tc = s => String(s || "").toLowerCase().replace(/(^|[\s\-/])\w/g, c => c.toUpperCase());
  const obj = f => Object.fromEntries(Object.keys(K).map(k => [k, f(K[k])]));
  const PR0 = () => ({ labour: 60, waste: 10, overhead: 10, profit: 20, profitType: "margin", crew: 4, hpd: 9, price: Object.fromEntries(CLS.map(c => [c[0], c[2]])), cover: Object.fromEntries(CLS.map(c => [c[0], c[3]])),
    prod: obj(k => k[3]), my: obj(k => k[6]), door: { ...DOORS }, load: { ...LOADS }, op: { dw: 0.82, dh: 2.04, ww: 1.2, wh: 1.2, sk: 0.1 }, supplier: { name: "", phone: "", email: "" } });
  function mergePr(x) { const p = PR0(); if (!x || typeof x !== "object") return p; Object.keys(p).forEach(k => { if (p[k] && typeof p[k] === "object") Object.assign(p[k], x[k] || {}); else if (x[k] != null) p[k] = x[k]; }); return p; }
  const cap = s => String(s).charAt(0) + String(s).slice(1).toLowerCase();
  let data = { settings: PR0(), estimates: [] }, J = null, step = 0;

  /* ---------- storage ---------- */
  function load() {
    try {
      const x = JSON.parse(localStorage.getItem(KEY) || "null"); if (!x || typeof x !== "object") return;
      const o = x.settings || {};
      if (o.wallRate != null && !o.prod) { const p = PR0(); p.labour = num(o.labourRate) || 60; p.waste = num(o.wastage); p.overhead = num(o.overhead); p.profit = num(o.profit); p.my.walls = num(o.wallRate) || p.my.walls; p.my.ceiling = num(o.ceilingRate) || p.my.ceiling; data.settings = p; }
      else data.settings = mergePr(o);
      data.estimates = Array.isArray(x.estimates) ? x.estimates : [];
    } catch (e) { }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { E.toast("Could not save on this phone - storage is full"); return false; } }
  const uid = () => "est_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const line = (key, qty, x) => ({ id: uid(), key, qty, ...(x || {}) });
  function blank() {
    return { id: uid(), name: "", customer: "", address: "", audience: "contractor", scope: "interior", how: "site", rooms: [], lines: [], phone: "", email: "", brand: "", colours: {}, quotePhotos: true, vars: [], followups: [], photos: [],
      coats: 2, primer: false, condition: 1.15, jobType: "NEW WORK", access: "SINGLE STOREY", occupied: false, doorStyle: "FLUSH",
      inc: { walls: true, ceiling: true, skirting: true, architrave: true, doors: true, windows: false, cornice: false },
      pricing: "cost", gstMode: "add", quoteFormat: "simple", status: "draft", createdAt: new Date().toISOString(), pr: JSON.parse(JSON.stringify(data.settings)), allow: { trims: 0, prep: 0, other: 0 } };
  }
  /* saved estimates from the old screens keep working */
  function fromSaved(r) {
    const j = { ...blank(), ...JSON.parse(JSON.stringify(r)) };
    if (!r.pr) {
      const o = r.rates || r.settingsSnapshot || {}, p = j.pr, pp = o.profitPercent != null ? o.profitPercent : o.profit;
      if (o.labourRate) p.labour = num(o.labourRate); if (o.overhead != null) p.overhead = num(o.overhead); if (pp != null) p.profit = num(pp); if (o.profitType) p.profitType = o.profitType;
      if (o.wallRate) p.my.walls = num(o.wallRate); if (o.ceilingRate) p.my.ceiling = num(o.ceilingRate); if (r.wastage != null) p.waste = num(r.wastage);
      j.allow = { trims: num(o.trimRate), prep: num(o.prepRate), other: num(o.otherCosts) }; j.pricing = r.pricing === "unit" ? "unit" : "cost";
    } else j.pr = mergePr(r.pr);
    const mode = r.areaMode || (r.mode === "detailed" || (r.rooms && r.rooms.length) ? "rooms" : "total");
    if (!Array.isArray(r.lines)) {
      j.lines = []; const a = r.areas || {}, w = num(r.quickWall || a.wall), c = num(r.quickCeiling || a.ceiling);
      if (mode === "total") { if (w) j.lines.push(line("walls", w)); if (c) j.lines.push(line("ceiling", c)); }
    }
    ["rates", "quickWall", "quickCeiling", "settingsSnapshot", "wastage", "areaMode"].forEach(k => delete j[k]);
    j.primer = !!r.primer; j.inc = r.inc ? { ...blank().inc, ...r.inc } : { walls: true, ceiling: true };   // old estimates priced walls + ceilings only (trims were an allowance) j.allow = { trims: 0, prep: 0, other: 0, ...(j.allow || {}) };
    j.rooms = (j.rooms || []).map(x => ({ id: x.id || uid(), ...x }));
    return j;
  }
  function hasContent(j) { return !!(j.name || j.customer || j.rooms.length || j.lines.length); }
  /* the job is saved into the list on every change, so nothing is lost when the phone switches apps */
  function save(quiet) {
    if (!J) return;
    try { localStorage.setItem(CUR, JSON.stringify({ id: J.id, step })); } catch (e) { }
    if (!hasContent(J)) return;
    const r = calc(J, true), rec = { ...JSON.parse(JSON.stringify(J)), ...(r || {}), updatedAt: new Date().toISOString() };
    if (!rec.name) rec.name = "Painting estimate";
    const i = data.estimates.findIndex(x => x.id === J.id); if (i >= 0) data.estimates[i] = rec; else data.estimates.unshift(rec);
    persist(); if (!quiet) E.toast("Saved");
  }

  /* ---------- take-off (PaintingAI rules) ---------- */
  // walls = length x (height - skirting or tiled height) - the openings; skirting = length - door widths; ceiling = room area;
  // architraves = doors x (2 x height + width) + windows all round; wet rooms: paint above the tiles only, no skirting, wet-area ceiling
  function roomAreas(r, j) {
    const op = (j && j.pr ? j.pr.op : (J && J.pr ? J.pr.op : data.settings.op)), pd = r.planData;
    const per = pd ? num(pd.perimeter) : 2 * (num(r.length) + num(r.width)), floor = pd ? num(pd.area) : num(r.length) * num(r.width);
    const H = num(r.height), tile = num(r.wet), bottom = tile > 0 ? tile : num(op.sk), dn = num(r.dn), wn = num(r.wn), dw = num(op.dw), dh = num(op.dh), ww = num(op.ww), wh = num(op.wh);
    const off = h => Math.max(0, Math.min(h, H) - bottom), open = dn * dw * off(dh) + wn * ww * off(wh);
    return { floor, perimeter: per, wall: Math.max(0, per * Math.max(0, H - bottom) - open - num(r.deductions)), ceiling: r.ceiling && num(r.ceiling.area) > 0 ? num(r.ceiling.area) : floor,
      skirt: tile > 0 ? 0 : Math.max(0, per - dn * dw), arch: dn * (2 * dh + dw) + wn * 2 * (ww + wh), dn, wn, wet: tile > 0 };
  }
  function effQty(l) { return l.key === "fence_item" ? (num(l.area) > 0 ? num(l.area) : num(l.qty) * (num(l.h) || 1.8) * (num(l.sides) || 2)) : l.key === "roof_area" && num(l.pitch) > 0 ? num(l.qty) / Math.cos(num(l.pitch) * Math.PI / 180) : num(l.qty); }
  function allLines(j) {
    // measured on site: the rooms count; AI: the AI items count; items you added yourself always count
    const ai = j.how === "ai", out = [], inc = j.inc || {};
    if (!ai) j.rooms.forEach(r => {
      const a = roomAreas(r, j), cf = num(r.condition) || 1; if (!(a.floor > 0)) return;
      const add = (k, q, x) => { if (q > 0) out.push({ key: k, q, cf, room: r.name, ...(x || {}) }); };
      if (inc.ceiling) add(a.wet ? "wetceil" : "ceiling", a.ceiling); if (inc.walls) add("walls", a.wall); if (inc.skirting) add("skirting", a.skirt);
      if (inc.architrave) add("architrave", a.arch); if (inc.cornice) add("cornice", a.perimeter); if (inc.doors) add("doors", a.dn, { style: j.doorStyle || "FLUSH" }); if (inc.windows) add("windows", a.wn);
    });
    const cf = out.length ? 1 : num(j.condition) || 1;
    (j.lines || []).forEach(l => { if ((l.src === "ai" || l.ai) && !ai) return; const q = effQty(l); if (q > 0 && K[l.key]) out.push({ ...l, q, cf }); });
    if (j.primer) { const q = out.filter(l => ["walls", "ceiling", "wetceil", "feature", "extwall", "ext"].indexOf(l.key) >= 0).reduce((s, l) => s + l.q, 0); if (q > 0) out.push({ key: "prep", q, cf: 1 }); }
    return out;
  }
  function areas(j) {
    const L = allLines(j), s = ks => L.filter(l => ks.indexOf(l.key) >= 0).reduce((a, l) => a + l.q, 0), wall = s(["walls", "extwall", "feature"]), ceiling = s(["ceiling", "wetceil"]);
    return { wall, ceiling, total: wall + ceiling + s(["ext", "roof_eaves", "roof_area", "fence_item", "deck_item", "pergola_item", "floor_coating"]) };
  }
  function tins(need) {
    const sz = [15, 10, 4, 1]; let best = null; if (!(need > 0)) return "";
    for (let a = 0; a < Math.floor(need / 15) + 2; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 4; c++) {
      const d = Math.max(0, Math.ceil(need - 15 * a - 10 * b - 4 * c - 1e-9)); if (d > 3) continue;
      const tot = 15 * a + 10 * b + 4 * c + d, cand = [tot - need, a + b + c + d, [a, b, c, d]]; if (!best || cand[0] < best[0] - 1e-9 || (Math.abs(cand[0] - best[0]) < 1e-9 && cand[1] < best[1])) best = cand;
    }
    return best[2].map((n, i) => n ? n + " × " + sz[i] + " L" : "").filter(Boolean).join(" + ");
  }
  const spec = (j, g) => { const c = (j.colours || {})[g] || {}; return [tc(c.brand || j.brand), c.colour, c.finish].filter(Boolean).join(" · "); };
  /* ---------- pricing: labour + paint (PaintingAI) or my rate per item ---------- */
  function calc(j, quiet) {
    const L = allLines(j), p = j.pr; if (!L.length) return null;
    const loadPct = (j.jobType === "REPAINT" ? num(p.load["REPAINT"]) : 0) + (j.access !== "SINGLE STOREY" ? num(p.load[j.access]) : 0) + (j.occupied ? num(p.load["OCCUPIED"]) : 0), load = 1 + loadPct / 100;
    const coats = num(j.coats) || 2, wf = 1 + num(p.waste) / 100, lit = {}, litG = {}, by = {};
    let hours = 0, labour = 0, paint = 0, unit = 0;
    L.forEach(l => {
      const k = K[l.key], cls = k[5], c = l.key === "prep" ? 1 : coats, door = l.key === "doors" || l.key === "extdoors";
      let h, li;
      if (k[2] === "each") { h = door ? num(p.door[l.style]) || num(p.prod[l.key]) || k[3] : num(p.prod[l.key]) || k[3]; li = k[4]; }
      else { h = c / (num(p.prod[l.key]) || k[3]); li = k[4] * c / (num(p.cover[cls]) || CLS.find(x => x[0] === cls)[3]); }
      h *= l.q * load * (l.cf || 1); li *= l.q;
      const lab = h * num(p.labour), mat = li * num(p.price[cls]) * wf, id = l.key + (door ? "|" + l.style : "");
      const o = by[id] || (by[id] = { key: l.key, name: k[0] + (door && l.style ? " (" + cap(l.style) + ")" : ""), qty: 0, unit: k[1], cost: 0, mine: 0 });
      o.qty += l.q; o.cost += lab + mat; o.mine += l.q * num(p.my[l.key]);
      hours += h; labour += lab; paint += mat; unit += l.q * num(p.my[l.key]); lit[cls] = (lit[cls] || 0) + li; litG[grp(l.key)] = (litG[grp(l.key)] || 0) + li;
    });
    const A = j.allow || {}, allow = [["Doors / trims allowance", num(A.trims)], ["Preparation allowance", num(A.prep)], ["Other direct costs", num(A.other)]].filter(x => x[1] > 0), allowSum = allow.reduce((s, x) => s + x[1], 0);
    const cost = j.pricing !== "unit"; let exTax, direct = labour + paint + allowSum, ohc = 0, margin = 0;
    if (cost) {
      const oh = num(p.overhead) / 100, pf = num(p.profit) / 100; if (p.profitType === "margin" && pf >= 1) { if (!quiet) E.toast("Margin must be under 100%"); return null; }
      ohc = direct * oh; const base = direct + ohc; exTax = p.profitType === "margin" ? base / (1 - pf) : base * (1 + pf); margin = exTax - base;
    } else exTax = unit + allowSum;
    // overheads and margin are spread over the lines, so an itemised quote adds up and does not show your margin
    const f = cost && direct > 0 ? exTax / direct : 1;
    const rows = Object.values(by).map(o => { const amt = (cost ? o.cost : o.mine) * f; return { key: o.key, name: o.name, qty: o.qty, unit: o.unit, rate: o.qty ? amt / o.qty : 0, amount: amt }; }).filter(x => x.amount > 0 || x.qty > 0)
      .concat(allow.map(x => ({ name: x[0], qty: 1, unit: "allowance", rate: x[1] * f, amount: x[1] * f })));
    let subtotal = exTax, gst = 0, total = exTax;
    if (j.gstMode === "add") { gst = exTax * 0.1; total = exTax + gst; } else if (j.gstMode === "included") { gst = exTax / 11; subtotal = exTax - gst; }
    const a = areas(j), crew = Math.max(1, num(p.crew) || 1), hpd = num(p.hpd) || 8;
    return { areas: a, rows, materialLitres: Object.values(lit).reduce((s, x) => s + x, 0) * wf, labourHours: hours, labour, paint, overheads: ohc, margin, loadPct, days: hours / (crew * hpd), crew,
      paintList: Object.keys(litG).filter(g => litG[g] > 0.005).map(g => ({ name: g, spec: spec(j, g), L: litG[g] * wf, tins: tins(litG[g] * wf) })), subtotal, gst, total, mode: j.how !== "ai" && j.rooms.length ? "detailed" : "quick",
      assumptions: j.how === "ai" || !j.rooms.length ? "Quantities entered as totals or from the AI mark-up; check measurements and surface condition before issuing a fixed quote." : "Room sizes, doors and windows as measured; check site conditions before issuing a fixed quote." };
  }
  /* ---------- home / saved / settings ---------- */
  const hdr = (title, sub, left, right) => '<header class="eh">' + left + '<div class="tt"><b>' + esc(title) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" + (right || "") + "</header>";
  const backTo = v => '<button class="ib" data-go="' + v + '" aria-label="Back">' + ico("back") + "</button>";
  function stat(r) { return ({ quoted: ["Quoted", "blue"], accepted: ["Accepted", "ok"], invoiced: ["Invoiced", "ok"], declined: ["Declined", ""] })[r.status] || ["Draft", ""]; }
  function jobRow(r) {
    const s = stat(r), n = (r.rooms || []).length;
    return '<div class="jr" data-open="' + esc(r.id) + '"><div class="g"><b>' + esc(r.name || "Painting estimate") + "</b><small>" + esc([r.customer, n ? n + " room" + (n === 1 ? "" : "s") : "", r.areas && r.areas.total ? fmt(r.areas.total, 0) + " m²" : "", new Date(r.updatedAt || r.createdAt || Date.now()).toLocaleDateString("en-AU", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")) +
      '</small></div><span class="pill ' + s[1] + '">' + esc(s[0]) + '</span><button class="ib" data-jmenu="' + esc(r.id) + '" aria-label="More">' + ico("dots") + "</button></div>";
  }
  function renderHome() {
    const b = E.biz(), list = data.estimates.slice().sort((a, c) => String(c.updatedAt || c.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    $("vHome").innerHTML = hdr("Painting estimator", b.name || "", '<a class="ib" href="../index.html" aria-label="Back to ShopMate">' + ico("back") + "</a>", '<button class="ib" data-go="settings" aria-label="Rates and settings">' + ico("gear") + "</button>") +
      '<div class="eb"><div class="row" style="margin:4px 0 12px"><button class="btn pri big" data-new>' + ico("plus") + "New estimate</button></div>" +
      '<div class="box"><button data-go="saved">Saved estimates</button><button data-go="settings">Rates &amp; settings</button></div>' + JOB.waiting(list) +
      '<div class="lab">Recent estimates</div>' + (list.length ? list.slice(0, 5).map(jobRow).join("") : '<div class="empty">No estimates yet. Tap New estimate to start.</div>') + "</div>";
  }
  function renderSaved() {
    const list = data.estimates.slice().sort((a, c) => String(c.updatedAt || c.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    $("vSaved").innerHTML = hdr("Saved estimates", list.length + " estimate" + (list.length === 1 ? "" : "s"), backTo("back")) + '<div class="eb">' + (list.length ? list.map(jobRow).join("") : '<div class="empty">No saved estimates yet.</div>') + "</div>";
  }
  const inp = (attr, lab, v, step) => '<label class="f"><span>' + lab + '</span><input ' + attr + ' type="number" inputmode="decimal" step="' + (step || "0.01") + '" value="' + esc(v == null ? "" : v) + '"></label>';
  /* the rate tables (desktop PaintingAI: Tools > Paint > Pricing) - used for your defaults and for one job */
  function ratesForm(p, which) {
    const f = (path, lab, v) => inp('data-rp="' + esc(path) + '"', lab, v), keys = Object.keys(K);
    let h = "";
    if (which !== "unit") {
      h += '<div class="lab">Paint: price and coverage</div><div class="fg">' + CLS.map(c => f("price." + c[0], c[1] + " ($/L)", p.price[c[0]]) + f("cover." + c[0], "Coverage (m²/L)", p.cover[c[0]])).join("") + "</div>";
      h += '<div class="lab">Production (one painter)</div><p class="hint">m² or metres an hour for one coat; for doors, windows, stairs and posts: hours each, all coats.</p><div class="fg">' + keys.map(k => f("prod." + k, K[k][0] + (K[k][2] === "each" ? " (h each)" : K[k][2] === "lm" ? " (m/h)" : " (m²/h)"), p.prod[k])).join("") + "</div>";
      h += '<div class="lab">Door hours (each, all coats)</div><div class="fg">' + Object.keys(p.door).map(d => f("door." + d, cap(d), p.door[d])).join("") + "</div>";
      h += '<div class="lab">Loadings (% on labour)</div><div class="fg">' + Object.keys(p.load).map(d => f("load." + d, cap(d), p.load[d])).join("") + "</div>";
    }
    if (which !== "cost") h += '<div class="lab">My rate per item (ex GST)</div><div class="fg">' + keys.map(k => f("my." + k, K[k][0] + " ($/" + (K[k][1] === "each" ? "each" : K[k][1]) + ")", p.my[k])).join("") + "</div>";
    return h;
  }
  function readRates(root, p) {
    let bad = false;
    root.querySelectorAll("[data-rp]").forEach(i => { const s = i.dataset.rp, d = s.indexOf("."), g = s.slice(0, d), k = s.slice(d + 1), v = Math.max(0, num(i.value)); if ((g === "prod" || g === "cover") && !(v > 0)) { bad = true; return; } p[g][k] = v; });
    root.querySelectorAll("[data-sp]").forEach(i => { p[i.dataset.sp] = Math.max(0, num(i.value)); });
    root.querySelectorAll("[data-sop]").forEach(i => { p.op[i.dataset.sop] = Math.max(0, num(i.value)); });
    if (bad) E.toast("Production and coverage must be more than 0 - those were kept");
  }
  function renderSettings() {
    const s = data.settings, sp = (k, l) => inp('data-sp="' + k + '"', l, s[k]), so = (k, l) => inp('data-sop="' + k + '"', l, s.op[k]);
    $("vSettings").innerHTML = hdr("Rates & settings", "Used for new estimates", backTo("back")) + '<div class="eb"><div class="fg">' + sp("labour", "Labour ($/hour)") + sp("waste", "Paint wastage (%)") + sp("overhead", "Overheads (%)") + sp("profit", "Target margin (%)") + sp("crew", "Painters in the crew") + sp("hpd", "Hours a day") + "</div>" +
      '<div class="lab">Doors, windows and skirtings</div><div class="fg">' + so("dw", "Door width (m)") + so("dh", "Door height (m)") + so("ww", "Window width (m)") + so("wh", "Window height (m)") + so("sk", "Skirting height (m)") + "</div>" +
      ratesForm(s, "all") + '<p class="hint">Saved estimates keep their own rates.</p><div class="row" style="margin-top:14px"><button class="btn" data-setreset>Restore defaults</button><button class="btn pri" data-setsave>Save settings</button></div></div>';
  }
  /* ---------- the estimate ---------- */
  function startNew() { J = blank(); step = 0; save(true); E.go("est"); renderEst(); }
  function openJob(id) { const r = data.estimates.find(x => x.id === id); if (!r) return; J = fromSaved(r); step = r.status === "draft" ? (J.rooms.length || J.lines.length ? 1 : 0) : 3; save(true); E.go("est"); renderEst(); }
  function renderEst() {
    $("estHead").innerHTML = (step > 0 ? '<button class="ib" data-prev aria-label="Back one step">' + ico("back") : '<button class="ib" data-go="back" aria-label="Close">' + ico("close")) + '</button><div class="tt"><b>' + (data.estimates.some(x => x.id === J.id) ? "Estimate" : "New estimate") + "</b><small>" + esc(J.name || "Painting") + "</small></div>";
    $("estSteps").innerHTML = E.steps(STEPS, step, "step");
    $("aiWrap").hidden = !(step === 0 && J.how === "ai");
    $("stepBody").innerHTML = [stepJob, stepRooms, stepPaint, stepPrice][step]();
    renderBar();
  }
  function renderBar() {
    const a = areas(J), r = step === 3 ? calc(J, true) : null;
    const t = step === 3 ? ["Total" + (J.gstMode === "add" ? " (GST incl.)" : J.gstMode === "included" ? " (GST incl.)" : ""), money(r ? r.total : 0)] : step === 0 ? null : ["Paintable area", fmt(a.total, 1) + " m²"];
    const btns = step === 0 ? ['<button class="btn" data-savedraft>Save draft</button>', '<button class="btn pri" data-next>Next</button>']
      : step === 3 ? ['<button class="btn" data-more>' + ico("dots") + "More</button>", '<button class="btn pri" data-quote>' + (J.status && J.status !== "draft" ? "Quote PDF" : "Make quote") + "</button>"]
      : ['<button class="btn" data-prev>Back</button>', '<button class="btn pri" data-next>Next: ' + STEPS[step + 1] + "</button>"];
    $("estBar").innerHTML = (t ? '<div class="bt"><span>' + t[0] + "</span><b>" + t[1] + "</b></div>" : "") + '<div class="row">' + btns.join("") + "</div>";
  }
  const fld = (label, key, type, ph, w) => '<label class="f' + (w ? " w" : "") + '"><span>' + label + '</span><input data-j="' + key + '" ' + (type === "n" ? 'type="number" inputmode="decimal" step="0.01"' : 'type="text"') + ' value="' + esc(J[key] || (type === "n" ? "" : "")) + '" placeholder="' + esc(ph || "") + '"></label>';
  const opt = (k, ic, t, s, tag) => '<button class="opt" data-how="' + k + '" aria-pressed="' + (J.how === k) + '"><span class="oi">' + ico(ic) + "</span><span><b>" + t + (tag ? ' <span class="pill blue">' + tag + "</span>" : "") + "</b><small>" + s + "</small></span></button>";
  function stepJob() {
    const tf = (l, k, type, ph, extra) => '<label class="f"><span>' + l + '</span><input data-j="' + k + '" type="' + type + '" value="' + esc(J[k] || "") + '" placeholder="' + esc(ph) + '"' + (extra || "") + "></label>";
    return '<div class="stack">' + fld("Job name", "name", "t", "e.g. Smith St repaint") + tf("Customer", "customer", "text", "Name - or pick from your customers", ' list="custL" autocomplete="off"') + JOB.custList() +
      '<div class="fg">' + tf("Mobile", "phone", "tel", "For follow-ups") + tf("Email", "email", "email", "") + "</div>" + fld("Address", "address", "t", "Street, suburb") + "</div>" +
      '<button class="add" data-jx="photos" style="margin-top:12px">' + ico("photo") + "Before photos" + ((J.photos || []).length ? " · " + J.photos.filter(p => p.kind === "before").length : "") + "</button>" +
      '<div class="lab">Scope</div>' + E.box([["interior", "Interior"], ["exterior", "Exterior"], ["both", "Inside + outside"]], J.scope, "scope", "c3") +
      '<div class="lab">How do you want to measure?</div>' +
      opt("ai", "ai", "AI from scope + drawings", "Upload the scope of work and the plans. AI reads them, you check and confirm, then AI marks up the drawing and fills in the areas.", "AI") +
      opt("site", "cam", "Measure on site", "Measure each room's floor and ceiling with the camera, or type the sizes.");
  }
  function roomCard(r) {
    const a = roomAreas(r, J), done = a.floor > 0, m = r.planData && r.planData.method, cn = COND.find(c => c[0] === num(r.condition)), wet = WET.find(w => w[0] === num(r.wet) && w[0] > 0);
    const how = m === "ar" ? "Live camera" : m === "photo" ? "From a photo" : m === "laser-manual-entry" ? "Floor plan" : done ? "Typed sizes" : "";
    const ow = [a.dn + " door" + (a.dn === 1 ? "" : "s"), a.wn + " window" + (a.wn === 1 ? "" : "s"), wet ? wet[1].toLowerCase() : ""].filter(Boolean).join(" · ");
    return '<div class="card"><div class="rc-h"><div class="g"><b>' + esc(r.name) + "</b><small>" + esc([how, "height " + fmt(r.height, 2) + " m", cn ? cn[1] + " surface" : ""].filter(Boolean).join(" · ")) + "<br>" + esc(ow) + "</small></div>" +
      '<span class="pill ' + (done ? "ok" : "warn") + '">' + (done ? "Measured" : "Not measured") + '</span><button class="ib" data-redit="' + esc(r.id) + '" aria-label="Edit room">' + ico("dots") + "</button></div>" +
      '<div class="cells"><div><small>Floor</small><b>' + (done ? fmt(a.floor, 1) + " m²" : "—") + "</b></div><div><small>Ceiling</small><b>" + (done ? fmt(a.ceiling, 1) + " m²" : "—") + "</b></div><div><small>Walls</small><b>" + (done ? fmt(a.wall, 1) + " m²" : "—") + "</b></div></div>" +
      '<div class="row"><button class="btn' + (done ? "" : " pri") + '" data-rmeasure="' + esc(r.id) + '">' + ico("cam") + 'Measure</button><button class="btn" data-rtype="' + esc(r.id) + '">' + ico("pen") + "Doors &amp; sizes</button></div></div>";
  }
  function lineRow(l) {
    const k = K[l.key]; if (!k) return "";
    const ex = l.key === "fence_item" ? (num(l.area) > 0 ? fmt(l.qty, 1) + " m long, " + fmt(l.area, 1) + " m² painted" : fmt(l.qty, 1) + " m × " + fmt(num(l.h) || 1.8, 1) + " m high × " + (num(l.sides) || 2) + " side" + ((num(l.sides) || 2) === 1 ? "" : "s"))
      : fmt(l.qty, 2) + " " + k[1] + (l.key === "roof_area" && num(l.pitch) > 0 ? " plan at " + l.pitch + "°" : "") + ((l.key === "doors" || l.key === "extdoors") && l.style ? " · " + cap(l.style) : "");
    return '<button class="li" data-ledit="' + esc(l.id) + '" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;padding:0;font:inherit;color:inherit"><span class="g">' + esc(k[0]) + (l.src === "ai" ? ' <span class="pill blue">AI</span>' : l.ai ? ' <span class="pill blue">AI, edited</span>' : "") + "<small>" + esc(ex) + "</small></span>" + ico("pen") + "</button>";
  }
  function stepRooms() {
    const mine = J.lines.filter(l => l.src !== "ai" && !l.ai), aiL = J.lines.filter(l => l.src === "ai" || l.ai), list = (title, L) => '<div class="lab">' + title + "</div>" + (L.length ? '<div class="card p0">' + L.map(lineRow).join("") + "</div>" : "");
    const add = '<button class="add" data-addline>' + ico("plus") + "Add an item (outside walls, roof, fences, stairs …)</button>";
    if (J.how === "ai") return (aiL.length ? list("From the AI mark-up", aiL) : '<div class="empty">Nothing from the AI yet. On the Job step, upload the scope and drawings, then send the mark-up to the estimate.</div><button class="add" data-step="0">' + ico("ai") + "Go to the AI</button>") +
      list("Items you added", mine) + add + (J.rooms.length ? '<p class="hint">' + J.rooms.length + " measured room" + (J.rooms.length === 1 ? " is" : "s are") + " not counted while you use the AI.</p>" : "");
    return J.rooms.map(roomCard).join("") + '<button class="add" data-addroom>' + ico("plus") + "Add room</button>" + list("Other items", mine) + add +
      (aiL.length ? '<p class="hint">' + aiL.length + " AI item" + (aiL.length === 1 ? " is" : "s are") + " not counted while you measure on site.</p>" : "");
  }
  function stepPaint() {
    const tg = (k, t) => '<button data-inc="' + k + '" aria-pressed="' + !!J.inc[k] + '">' + t + "</button>", op = J.pr.op, o = (k, l) => inp('data-op="' + k + '"', l, op[k]);
    const rooms = J.how !== "ai" && J.rooms.length;
    let h = E.group([["Job", E.seg([["NEW WORK", "New work"], ["REPAINT", "Repaint"]], J.jobType, "jtype")],
      ["Access", E.seg([["SINGLE STOREY", "1 storey"], ["TWO STOREY", "2 storey"], ["SCAFFOLD / EWP", "Scaffold"]], J.access, "access")],
      ["Lived in while you paint?", E.seg([["0", "No"], ["1", "Yes"]], J.occupied ? "1" : "0", "occ")],
      ["Top coats", E.seg([[1, "1 coat"], [2, "2 coats"], [3, "3 coats"]], J.coats, "coats")],
      ["Sealer / undercoat", E.seg([["0", "None"], ["1", "One coat"]], J.primer ? "1" : "0", "primer")],
      rooms ? null : ["Surface condition", E.seg(COND, J.condition, "cond")]]);
    if (rooms) h += E.group([["Painted in each room", '<div class="box c3">' + tg("walls", "Walls") + tg("ceiling", "Ceilings") + tg("skirting", "Skirtings") + tg("architrave", "Architraves") + tg("doors", "Doors") + tg("windows", "Timber windows") + tg("cornice", "Cornices") + "</div>"],
      ["Door type", '<select class="sel" data-dstyle>' + Object.keys(J.pr.door).map(d => "<option" + (d === J.doorStyle ? " selected" : "") + ' value="' + esc(d) + '">' + esc(cap(d)) + "</option>").join("") + "</select>"],
      ["Door, window and skirting sizes", '<div class="fg">' + o("dw", "Door width (m)") + o("dh", "Door height (m)") + o("ww", "Window width (m)") + o("wh", "Window height (m)") + o("sk", "Skirting height (m)") + "</div>"]]);
    const r = calc(J, true), G = r ? r.paintList.map(x => x.name) : [];
    h += E.group([["Paint brand (sets the coverage)", '<select class="sel" data-brand><option value="">Your own coverage</option>' + Object.keys(BRANDS).map(b => '<option value="' + esc(b) + '"' + (b === J.brand ? " selected" : "") + ">" + esc(tc(b)) + "</option>").join("") + "</select>"],
      ["Paint wastage", '<div class="fg">' + inp('data-pr="waste"', "Wastage (%)", J.pr.waste) + "</div>"]]);
    h += '<div class="lab">Colour schedule</div>' + (G.length ? '<div class="card p0">' + G.map(g => { const sp = spec(J, g), c = (J.colours || {})[g] || {}; return '<button class="li" data-cg="' + esc(g) + '" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;padding:0;font:inherit;color:inherit"><span class="g">' + esc(g) + "<small>" + esc(c.colour ? sp : (sp ? sp + " · " : "") + "Colour not chosen yet") + "</small></span>" + ico("pen") + "</button>"; }).join("") + "</div>" : '<div class="empty">Add rooms or items first.</div>') +
      '<p class="hint">Shows on the quote, the job sheet and the paint order. A room with its own wall colour: tap ⋯ on the room.</p>';
    return h;
  }
  function stepPrice() {
    const p = J.pr, cost = J.pricing !== "unit", al = (k, l) => inp('data-al="' + k + '"', l, J.allow[k]);
    let h = JOB.card(J) + E.group([["How do you price?", E.seg([["cost", "Labour + paint"], ["unit", "My rate per item"]], cost ? "cost" : "unit", "pricing")],
      ["Your numbers", '<div class="fg">' + (cost ? inp('data-pr="labour"', "Labour ($/hour)", p.labour) + inp('data-pr="overhead"', "Overheads (%)", p.overhead) + inp('data-pr="profit"', p.profitType === "margin" ? "Margin (%)" : "Markup (%)", p.profit) + inp('data-pr="crew"', "Painters in the crew", p.crew, "1") : "") +
        al("trims", "Extra: doors / trims ($)") + al("prep", "Extra: preparation ($)") + al("other", "Other costs ($)") + "</div>"],
      cost ? ["Profit as", E.seg([["margin", "Gross margin"], ["markup", "Markup on cost"]], p.profitType, "ptype")] : null,
      ["", '<button class="add" data-rates>' + ico("gear") + (cost ? "Production, paint prices &amp; loadings" : "My rate for each item") + "</button>"]]) +
      E.group([["GST", E.seg([["add", "Add 10%"], ["included", "Included"], ["none", "No GST"]], J.gstMode, "gst")],
      ["Quote shows", E.seg([["simple", "One total"], ["itemised", "Each line"]], J.quoteFormat, "qfmt")],
      ["Before photos on the quote", E.seg([["1", "Show"], ["0", "Don't show"]], J.quotePhotos === false ? "0" : "1", "qph")]]) +
      '<div class="lab">Estimate</div><div id="resBox">' + resultHtml() + "</div>";
    return h;
  }
  function resultHtml() {
    const r = calc(J, true);
    if (!r) return '<div class="empty">Add rooms or items first.</div>';
    const kv = (a, b) => '<div class="kv"><span>' + a + "</span><b>" + b + "</b></div>", cost = J.pricing !== "unit";
    let h = '<div class="card">' + kv("Walls", fmt(r.areas.wall, 1) + " m²") + kv("Ceilings", fmt(r.areas.ceiling, 1) + " m²") +
      kv("Labour", fmt(r.labourHours, 1) + " h · " + fmt(r.days, 1) + " day" + (Math.abs(r.days - 1) < 0.05 ? "" : "s") + " for " + r.crew + " painter" + (r.crew === 1 ? "" : "s")) + (r.loadPct ? kv("Loadings", "+" + fmt(r.loadPct, 0) + "% on labour") : "") +
      (cost ? kv("Labour cost", money(r.labour)) + kv("Paint cost", money(r.paint)) + (r.overheads ? kv("Overheads", money(r.overheads)) : "") + kv(J.pr.profitType === "margin" ? "Margin" : "Markup", money(r.margin)) : "") + "</div>";
    if (r.paintList.length) h += '<div class="lab">Paint to buy (incl. ' + fmt(J.pr.waste, 0) + '% waste)</div><div class="card p0">' + r.paintList.map(x => '<div class="li"><span class="g">' + esc(x.name) + "<small>" + esc((x.spec ? x.spec + " · " : "") + fmt(x.L, 1) + " L") + "</small></span><b>" + esc(x.tins) + "</b></div>").join("") + "</div>";
    return h + '<div class="lab">Price</div><div class="card p0">' + r.rows.map(x => '<div class="li"><span class="g">' + esc(x.name) + (x.unit !== "allowance" ? "<small>" + fmt(x.qty, x.unit === "each" ? 0 : 1) + " " + esc(x.unit) + " × " + money(x.rate) + "</small>" : "") + "</span><b>" + money(x.amount) + "</b></div>").join("") +
      '<div class="li"><span class="g">Subtotal before GST</span><b>' + money(r.subtotal) + "</b></div>" + (r.gst ? '<div class="li"><span class="g">GST</span><b>' + money(r.gst) + "</b></div>" : "") + '<div class="li"><span class="g"><b>Total</b></span><b style="font-size:18px">' + money(r.total) + "</b></div></div>";
  }
  /* this job's rate tables */
  function ratesSheet() {
    const which = J.pricing !== "unit" ? "cost" : "unit";
    const s = E.sheet('<h3>' + (which === "cost" ? "Production &amp; paint" : "My rates") + '</h3><p class="sub">For this estimate. Change your defaults under Rates &amp; settings.</p>' + ratesForm(J.pr, which) +
      '<div class="row end"><button class="btn" data-rdef>Save as my defaults too</button><button class="btn pri" data-rok>Save</button></div>');
    s.addEventListener("click", e => {
      const d = e.target.closest("[data-rok],[data-rdef]"); if (!d) return;
      readRates(s, J.pr); if (d.dataset.rdef != null) { readRates(s, data.settings); persist(); }
      E.closeSheet(); save(true); renderEst();
    });
  }
  /* an item (totals, the AI mark-up, or extras outside the rooms) */
  function lineSheet(id) {
    const old = J.lines.find(x => x.id === id), l = old || { key: "walls", qty: 0 };
    const keys = Object.keys(K).filter(k => k !== "prep");
    const s = E.sheet("<h3>" + (old ? esc(K[l.key][0]) : "Add an item") + '</h3><div class="fg"><label class="f w"><span>Item</span><select id="lsK">' + keys.map(k => '<option value="' + k + '"' + (k === l.key ? " selected" : "") + ">" + esc(K[k][0]) + "</option>").join("") + '</select></label><div id="lsF" style="display:contents"></div></div>' +
      '<div class="row end">' + (old ? '<button class="btn danger" data-ldel>' + ico("trash") + "Delete</button>" : "") + '<button class="btn pri" data-lok>' + (old ? "Save" : "Add") + "</button></div>");
    const ks = s.querySelector("#lsK"), F = s.querySelector("#lsF"), v = x => (x == null || x === 0 ? "" : x);
    function fields() {
      const k = ks.value, same = k === l.key;
      F.innerHTML = inp('id="lsQ"', k === "fence_item" ? "Length (m)" : k === "stair_item" ? "Flights" : k === "roof_area" ? "Plan area (m²)" : "Quantity (" + K[k][1] + ")", same ? v(l.qty) : "") +
        (k === "fence_item" ? inp('id="lsH"', "Height (m)", same && l.h ? l.h : 1.8) + inp('id="lsS"', "Sides painted", same && l.sides ? l.sides : 2, "1") : "") +
        (k === "roof_area" ? inp('id="lsP"', "Roof pitch (°)", same ? v(l.pitch) : "") : "") +
        (k === "doors" || k === "extdoors" ? '<label class="f w"><span>Door type</span><select id="lsD">' + Object.keys(J.pr.door).map(d => '<option value="' + esc(d) + '"' + (d === (same && l.style ? l.style : k === "doors" ? J.doorStyle || "FLUSH" : "ENTRY (SOLID)") ? " selected" : "") + ">" + esc(cap(d)) + "</option>").join("") + "</select></label>" : "");
    }
    fields(); ks.onchange = fields;
    s.addEventListener("click", e => {
      if (e.target.closest("[data-ldel]")) { J.lines = J.lines.filter(x => x !== old); E.closeSheet(); save(true); renderEst(); return; }
      if (!e.target.closest("[data-lok]")) return;
      const k = ks.value, q = num(s.querySelector("#lsQ").value), g = id => s.querySelector(id);
      if (!(q > 0)) return E.toast("Enter the quantity");
      const n = { id: old ? old.id : uid(), key: k, qty: q };
      if (old && (old.src === "ai" || old.ai)) n.ai = old.ai || old.key;   // an edited AI item: a re-send keeps this one instead of adding the AI figure again
      if (k === "fence_item") { n.h = num(g("#lsH").value) || 1.8; n.sides = num(g("#lsS").value) || 2; }
      if (k === "roof_area" && num(g("#lsP").value) > 0) { if (num(g("#lsP").value) >= 80) return E.toast("Roof pitch looks too steep"); n.pitch = num(g("#lsP").value); }
      if (g("#lsD")) n.style = g("#lsD").value;
      if (old) J.lines[J.lines.indexOf(old)] = n; else J.lines.push(n);
      E.closeSheet(); save(true); renderEst();
    });
  }

  /* room sheet (sizes / doors / windows / wet area / condition / delete) */
  function roomSheet(id) {
    const r = J.rooms.find(x => x.id === id); if (!r) return;
    const pd = r.planData, rn = (i, l, val, st) => inp('id="' + i + '"', l, val, st);
    const s = E.sheet("<h3>" + esc(r.name) + '</h3><p class="sub">' + (pd ? "Measured: " + fmt(pd.area, 2) + " m² floor, " + fmt(pd.perimeter, 2) + " m around. Typing a length and width replaces it." : "Sizes in metres") + "</p>" +
      '<div class="fg"><label class="f w"><span>Room name</span><input id="rsN" value="' + esc(r.name) + '"></label>' + rn("rsL", "Length (m)", pd ? "" : r.length || "") + rn("rsW", "Width (m)", pd ? "" : r.width || "") +
      rn("rsH", "Wall height (m)", r.height) + rn("rsC", "Ceiling if different (m²)", r.ceiling && r.ceiling.area ? Math.round(r.ceiling.area * 100) / 100 : "") +
      rn("rsDn", "Doors", num(r.dn), "1") + rn("rsWn", "Windows", num(r.wn), "1") + rn("rsD", "Other area off (m²)", r.deductions || 0, "0.1") + '<label class="f w"><span>Wall colour, if different</span><input id="rsCol" value="' + esc(r.colour || "") + '" placeholder="Same as the colour schedule"></label></div>' +
      '<p class="hint">Count each door once, in the room it opens into. Door and window sizes are on the Paint step.</p>' +
      '<div class="lab">Wall tiles</div>' + E.box(WET, num(r.wet), "rwet", "c3") +
      '<div class="lab">Surface condition</div>' + E.box(COND, r.condition, "rcond", "c3") +
      '<div class="row end"><button class="btn danger" data-rdel>' + ico("trash") + 'Delete</button><button class="btn pri" data-rok>Save</button></div>');
    let cond = num(r.condition) || 1.15, wet = num(r.wet);
    s.addEventListener("click", e => {
      const c = e.target.closest("[data-rcond]"); if (c) { cond = num(c.dataset.rcond); s.querySelectorAll("[data-rcond]").forEach(b => b.setAttribute("aria-pressed", b === c)); return; }
      const w = e.target.closest("[data-rwet]"); if (w) { wet = num(w.dataset.rwet); s.querySelectorAll("[data-rwet]").forEach(b => b.setAttribute("aria-pressed", b === w)); return; }
      if (e.target.closest("[data-rdel]")) { E.ask("Delete " + r.name + "?", "Its sizes will be removed from this estimate.", "Delete", () => { J.rooms = J.rooms.filter(x => x !== r); save(true); renderEst(); }, true); return; }
      if (e.target.closest("[data-rok]")) {
        const g = i => num(s.querySelector(i).value), L = g("#rsL"), W = g("#rsW"), H = g("#rsH"), D = g("#rsD"), C = g("#rsC");
        if (H <= 0) return E.toast("Enter the wall height");
        if (L > 0 && W > 0) { r.length = L; r.width = W; delete r.planData; }
        const per = r.planData ? num(r.planData.perimeter) : 2 * (num(r.length) + num(r.width)); if (D > per * H && per > 0) return E.toast("Area off can't be more than the wall area");
        r.name = s.querySelector("#rsN").value.trim() || r.name; r.height = H; r.deductions = D; r.condition = cond; r.wet = wet; r.colour = s.querySelector("#rsCol").value.trim(); r.dn = Math.max(0, Math.round(g("#rsDn"))); r.wn = Math.max(0, Math.round(g("#rsWn")));
        r.ceiling = C > 0 ? { area: C, method: "typed" } : null;
        E.closeSheet(); save(true); renderEst();
      }
    });
  }
  function addRoom() {
    const n = J.rooms.length + 1, last = J.rooms[J.rooms.length - 1];
    const r = { id: uid(), name: n === 1 ? "Living room" : "Room " + n, length: 0, width: 0, height: last ? last.height : 2.7, deductions: 0, condition: last ? last.condition : 1.15, dn: 1, wn: 1, wet: 0 };
    J.rooms.push(r); save(true); renderEst();
    const s = E.sheet('<h3>New room</h3><p class="sub">Give it a name, then measure it.</p><label class="f"><span>Room name</span><input id="nrN" value="' + esc(r.name) + '"></label><div class="row end"><button class="btn" data-x>Later</button><button class="btn pri" data-ok>' + ico("cam") + "Measure</button></div>");
    const nm = s.querySelector("#nrN"); setTimeout(() => { nm.focus(); nm.select(); }, 50);
    const keep = () => { r.name = nm.value.trim() || r.name; save(true); renderEst(); };
    s.querySelector("[data-x]").onclick = () => { keep(); E.closeSheet(); };
    s.querySelector("[data-ok]").onclick = () => { keep(); E.closeSheet(); measureRoom(r.id); };
  }
  function measureRoom(id) {
    const r = J.rooms.find(x => x.id === id); if (!r) return;
    Measure.open({ job: J.id, room: id }, { title: r.name, whats: ["floor", "ceiling", "both", "height"], what: "floor", height: num(r.height) || 2.7, heightLabel: "Wall height", ceiling: true });
  }
  Measure.init({
    apply(ctx, res) {
      if (!J || J.id !== ctx.job) { const rec = data.estimates.find(x => x.id === ctx.job); if (!rec) return; J = fromSaved(rec); }
      const r = J.rooms.find(x => x.id === ctx.room); if (!r) return;
      const fl = res.floor;
      if (fl) r.planData = { area: fl.area, perimeter: fl.perimeter, sides: fl.sides, points: fl.pts || [], measurementMethod: fl.method, method: fl.method, createdAt: new Date().toISOString() };
      if (res.ceiling && !res.ceiling.same) { r.ceiling = { area: res.ceiling.area, perimeter: res.ceiling.perimeter, method: res.ceiling.method }; if (!r.planData) r.planData = { area: res.ceiling.area, perimeter: res.ceiling.perimeter, sides: res.ceiling.sides, points: res.ceiling.pts || [], method: res.ceiling.method }; }
      else if (fl) r.ceiling = null;
      if (res.height) r.height = Math.round(res.height * 100) / 100;
      step = 1; J.how = "site"; save(true); if (E.view !== "est") E.go("est"); renderEst();
      E.toast(r.name + " measured");
    }
  });

  /* ---------- quote PDF ---------- */
  function quoteHtml(r, P) {
    const b = E.biz(), itemised = (r.quoteFormat || "simple") === "itemised", date = new Date(r.updatedAt || r.createdAt || Date.now()).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    const rows = itemised ? (r.rows || []).map(x => "<tr><td>" + esc(x.name) + "</td><td>" + (x.unit === "allowance" ? "" : fmt(x.qty, x.unit === "each" ? 0 : 2) + " " + esc(x.unit)) + "</td><td>" + money(x.amount) + "</td></tr>").join("") : "<tr><td>Painting works as described in the scope below</td><td></td><td>" + money(r.subtotal) + "</td></tr>";
    const rooms = (r.rooms || []).filter(x => roomAreas(x, r).floor > 0).map(x => { const a = roomAreas(x, r); return "<tr><td>" + esc(x.name) + "</td><td>" + fmt(a.wall, 1) + " m²</td><td>" + fmt(a.ceiling, 1) + " m²</td></tr>"; }).join("");
    return '<!doctype html><html><head><meta charset="utf-8"><title>Quote</title><style>body{font:13px Arial,sans-serif;color:#202124;margin:36px}header{display:flex;justify-content:space-between;border-bottom:2px solid #1A73E8;padding-bottom:14px}h1{font-size:24px;margin:0 0 4px;color:#1A73E8}h2{font-size:15px;margin:22px 0 6px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #DADCE0}th{font-size:11px;color:#5F6368;text-transform:uppercase}td:last-child,th:last-child{text-align:right}.tot{margin:16px 0 0 auto;width:280px}.tot p{display:flex;justify-content:space-between;margin:4px 0}.grand{font-size:18px;font-weight:bold;border-top:2px solid #202124;padding-top:8px}.note{margin-top:28px;color:#5F6368;font-size:11px}</style></head><body>' +
      "<header><div><h1>Painting quote</h1><b>" + esc(r.name || "Painting") + "</b><div>" + esc(r.address || "") + "</div></div><div style=\"text-align:right\"><b>" + esc(b.name || "") + "</b><div>" + esc([b.phone, b.email].filter(Boolean).join(" · ")) + "</div>" + (b.abn ? "<div>ABN " + esc(b.abn) + "</div>" : "") + "<div>" + date + "</div></div></header>" +
      "<p><b>Prepared for:</b> " + esc(r.customer || "Customer") + "</p><h2>Scope of work</h2><p>" + esc(r.scope === "both" ? "Interior and exterior painting" : r.scope === "exterior" ? "Exterior painting" : "Interior painting") + "; " + num(r.coats || 2) + " top coat(s)" + (r.primer ? " plus a primer / sealer coat" : "") + ".</p>" +
      (rooms ? "<table><thead><tr><th>Room</th><th>Walls</th><th>Ceiling</th></tr></thead><tbody>" + rooms + "</tbody></table>" : "") +
      colourRows(r) + photoGrid(P || [], "Current condition") +
      "<h2>Price</h2><table><thead><tr><th>Description</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      '<div class="tot"><p><span>Subtotal</span><b>' + money(r.subtotal) + "</b></p>" + (r.gst > 0 ? "<p><span>GST</span><b>" + money(r.gst) + "</b></p>" : "") + '<p class="grand"><span>Total</span><span>' + money(r.total) + "</span></p></div>" +
      '<p class="note">' + esc(r.assumptions || "") + " Prices are based on the measured areas and the scope above.</p></body></html>";
  }
  function colourRows(r) {
    const G = (r.paintList || []).filter(x => x.spec), rooms = (r.rooms || []).filter(x => x.colour);
    return G.length || rooms.length ? "<h2>Colour schedule</h2><table><thead><tr><th>Surface</th><th>Brand · colour · finish</th></tr></thead><tbody>" + G.map(x => "<tr><td>" + esc(x.name) + "</td><td>" + esc(x.spec) + "</td></tr>").join("") + rooms.map(x => "<tr><td>" + esc(x.name) + " - walls</td><td>" + esc(x.colour) + "</td></tr>").join("") + "</tbody></table>" : "";
  }
  const photoGrid = (P, title) => P.length ? "<h2>" + title + '</h2><div style="display:flex;flex-wrap:wrap;gap:8px">' + P.map(p => '<div style="width:calc(33% - 6px)"><img src="' + p.src + '" style="width:100%;border-radius:6px"><div style="font-size:11px;color:#5F6368">' + esc(p.room || "") + "</div></div>").join("") + "</div>" : "";
  async function makeQuote(r) {
    if (!r || r.total == null) { E.toast("Add sizes and rates first"); return; }
    const P = r.quotePhotos === false ? [] : await JOB.quotePhotos(r);
    E.pdf(quoteHtml(r, P), ((r.name || "Painting") + " - Painting quote - " + new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })).replace(/[\\/:*?"<>|]/g, "") + ".pdf");
  }

  /* colour schedule: brand, colour and finish for one group */
  function colourSheet(g) {
    const c = (J.colours = J.colours || {})[g] || {};
    const s = E.sheet("<h3>" + esc(g) + '</h3><p class="sub">Shows on the quote, the job sheet and the paint order.</p><div class="fg"><label class="f w"><span>Brand</span><select id="csB"><option value="">' + (J.brand ? "Same as the job (" + esc(tc(J.brand)) + ")" : "Not chosen") + "</option>" + Object.keys(BRANDS).map(b => '<option value="' + esc(b) + '"' + (b === c.brand ? " selected" : "") + ">" + esc(tc(b)) + "</option>").join("") + "</select></label>" +
      '<label class="f w"><span>Colour</span><input id="csC" value="' + esc(c.colour || "") + '" placeholder="e.g. Lexicon Quarter"></label><label class="f w"><span>Finish</span><select id="csF"><option value="">-</option>' + FIN.map(f => "<option" + (f === c.finish ? " selected" : "") + ">" + f + "</option>").join("") + "</select></label></div>" +
      '<div class="row end"><button class="btn pri" data-csok>Save</button></div>');
    s.querySelector("[data-csok]").onclick = () => { J.colours[g] = { brand: s.querySelector("#csB").value, colour: s.querySelector("#csC").value.trim(), finish: s.querySelector("#csF").value }; E.closeSheet(); save(true); renderEst(); };
  }
  /* the job sheet for the painters: what to paint where, colours, paint, hours, before photos */
  async function jobSheet(j) {
    const r = calc(j, true); if (!r) return E.toast("Add rooms or items first");
    const inc = j.inc || {}, P = await JOB.quotePhotos(j), what = ["walls", "ceiling", "skirting", "architrave", "doors", "windows", "cornice"].filter(k => inc[k]).map(k => K[k][0].replace(" - inside", "").toLowerCase()).join(", ");
    const rooms = j.how !== "ai" ? j.rooms.filter(x => roomAreas(x, j).floor > 0).map(x => { const a = roomAreas(x, j), wet = WET.find(w => w[0] === num(x.wet) && w[0] > 0); return "<tr><td>" + esc(x.name) + (x.colour ? "<br><small>walls: " + esc(x.colour) + "</small>" : "") + "</td><td>" + fmt(a.wall, 1) + " m²</td><td>" + fmt(a.ceiling, 1) + " m²" + (a.wet ? " (wet)" : "") + "</td><td>" + a.dn + " / " + a.wn + "</td><td>" + esc(wet ? wet[1] : "") + "</td></tr>"; }).join("") : "";
    E.pdf('<!doctype html><html><head><meta charset="utf-8"><style>body{font:13px Arial,sans-serif;color:#202124;margin:30px}h1{font-size:22px;margin:0;color:#1A73E8}h2{font-size:15px;margin:20px 0 6px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px;border-bottom:1px solid #DADCE0;vertical-align:top}th{font-size:11px;color:#5F6368;text-transform:uppercase}small{color:#5F6368}</style></head><body>' +
      "<h1>Job sheet</h1><b>" + esc(j.name || "Painting") + "</b><div>" + esc([j.address, j.customer, j.phone].filter(Boolean).join(" · ")) + "</div>" +
      "<p>" + esc(cap(j.jobType || "new work")) + " · " + esc(cap(j.access || "single storey")) + (j.occupied ? " · occupied" : "") + " · " + num(j.coats || 2) + " top coats" + (j.primer ? " + sealer" : "") + (what && rooms ? " · in each room: " + what : "") + "</p>" +
      (rooms ? "<h2>Rooms</h2><table><thead><tr><th>Room</th><th>Walls</th><th>Ceiling</th><th>Doors / windows</th><th>Tiles</th></tr></thead><tbody>" + rooms + "</tbody></table>" : "") +
      "<h2>Work</h2><table><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>" + r.rows.filter(x => x.unit !== "allowance").map(x => "<tr><td>" + esc(x.name) + "</td><td>" + fmt(x.qty, x.unit === "each" ? 0 : 1) + " " + esc(x.unit) + "</td></tr>").join("") + "</tbody></table>" +
      "<h2>Paint</h2><table><thead><tr><th>Surface</th><th>Brand · colour · finish</th><th>Buy</th></tr></thead><tbody>" + r.paintList.map(x => "<tr><td>" + esc(x.name) + "</td><td>" + esc(x.spec || "not chosen") + "</td><td>" + esc(x.tins) + " <small>(" + fmt(x.L, 1) + " L)</small></td></tr>").join("") + "</tbody></table>" +
      "<p><b>Time:</b> " + fmt(r.labourHours, 1) + " hours · about " + fmt(r.days, 1) + " days for " + r.crew + " painters</p>" + photoGrid(P, "Before photos") + "</body></html>", ((j.name || "Painting") + " - job sheet").replace(/[\\/:*?"<>|]/g, "") + ".pdf");
  }
  /* the paint order to the supplier, by text or email */
  function orderPaint(j) {
    const r = calc(j, true); if (!r || !r.paintList.length) return E.toast("Add rooms or items first");
    const sp = data.settings.supplier = data.settings.supplier || { name: "", phone: "", email: "" }, b = E.biz();
    const msg = "Hi" + (sp.name ? " " + sp.name : "") + ", paint order for " + (j.name || "a job") + (j.address ? ", " + j.address : "") + ":\n" + r.paintList.map(x => "- " + x.name + (x.spec ? " (" + x.spec + ")" : "") + ": " + x.tins).join("\n") + "\nThanks, " + (b.name || "");
    const s = E.sheet('<h3>Order the paint</h3><p class="sub">From the paint to buy, with your colour schedule. Tins are rounded up.</p><div class="fg"><label class="f w"><span>Supplier</span><input id="opN" value="' + esc(sp.name) + '" placeholder="e.g. Dulux Trade Centre Brisbane"></label><label class="f"><span>Mobile</span><input id="opP" type="tel" value="' + esc(sp.phone) + '"></label><label class="f"><span>Email</span><input id="opE" type="email" value="' + esc(sp.email) + '"></label>' +
      '<label class="f w"><span>Message</span><textarea id="opT" rows="8">' + esc(msg) + '</textarea></label></div><div class="row end"><button class="btn" data-op="copy">Copy</button><button class="btn" data-op="mail">Email</button><button class="btn pri" data-op="sms">Text message</button></div>');
    s.querySelector("#opN").addEventListener("change", e => { const t = s.querySelector("#opT"); t.value = t.value.replace(/^Hi[^,]*,/, "Hi" + (e.target.value.trim() ? " " + e.target.value.trim() : "") + ","); });
    s.addEventListener("click", e => {
      const t = e.target.closest("[data-op]"); if (!t) return; const how = t.dataset.op, txt = s.querySelector("#opT").value;
      sp.name = s.querySelector("#opN").value.trim(); sp.phone = s.querySelector("#opP").value.trim(); sp.email = s.querySelector("#opE").value.trim(); persist();
      const N = window.GPNative;
      if (how === "sms") { if (!sp.phone) return E.toast("Add the supplier's mobile"); if (N && N.openSms) N.openSms(sp.phone, txt); else location.href = "sms:" + sp.phone + "?body=" + encodeURIComponent(txt); }
      else if (how === "mail") { if (!sp.email) return E.toast("Add the supplier's email"); const u = "mailto:" + sp.email + "?subject=" + encodeURIComponent("Paint order - " + (j.name || "")) + "&body=" + encodeURIComponent(txt); if (N && N.openUrl) N.openUrl(u); else location.href = u; }
      else { if (N && N.copyText) N.copyText(txt); else if (navigator.clipboard) navigator.clipboard.writeText(txt); E.toast("Copied"); }
      E.closeSheet();
    });
  }

  /* ---------- after the quote (photos, follow-ups, variations, invoice) ---------- */
  JOB.init({
    trade: "Painting", job: () => J, name: j => j.name, rooms: j => (j.rooms || []).map(x => x.name),
    save: j => { if (!j || j === J) save(true); else persist(); }, render: () => { if (E.view === "est" && J) renderEst(); else refresh(); },
    total: j => { const r = calc(j.pr ? j : fromSaved(j), true); return r ? r.total : num(j.total); }, gstAdd: j => j.gstMode === "add",
    lines: j => { const r = calc(j, true); if (!r) return []; const inc = j.gstMode === "included" ? 1.1 : 1;
      return (j.quoteFormat === "itemised" ? r.rows.map(x => ({ name: x.name, qty: x.unit === "allowance" ? 1 : Math.round(x.qty * 100) / 100, ex: x.amount / inc })) : [{ name: "Painting works - " + (j.name || "as quoted"), qty: 1, ex: r.subtotal }]); }
  });
  /* the phone's back button goes back one step inside an estimate */
  { const pb = window.onBack; window.onBack = function () { if (E.view === "est" && J && step > 0 && !document.querySelector(".sheet,.phed")) { step--; save(true); renderEst(); window.scrollTo(0, 0); return true; } return pb.apply(this, arguments); }; }

  /* ---------- events ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest("button,[data-open],a"); if (!t) return;
    const d = t.dataset;
    if (d.go) { if (d.go === "back") { E.back(); refresh(); } else { E.go(d.go); refresh(); } return; }
    if (d.new != null) { startNew(); return; }
    if (d.jmenu) { e.stopPropagation(); const r = data.estimates.find(x => x.id === d.jmenu); if (!r) return; E.menu([["Open", () => openJob(r.id)], ["Quote PDF", () => makeQuote(r)], ["Delete", () => E.ask("Delete " + (r.name || "this estimate") + "?", "It will be removed from this phone.", "Delete", () => { JOB.removeJob(r); data.estimates = data.estimates.filter(x => x.id !== r.id); persist(); refresh(); }, true), true]]); return; }
    if (d.jfu) { const r = data.estimates.find(x => x.id === d.jfu); if (r) JOB.followUp(r); return; }
    if (d.open) { openJob(d.open); return; }
    if (d.sf === "manual") { J.how = "site"; step = 1; save(true); renderEst(); window.scrollTo(0, 0); return; }
    if (d.setsave != null) { readRates(document.getElementById("vSettings"), data.settings); persist(); E.toast("Settings saved"); E.back(); refresh(); return; }
    if (d.setreset != null) { E.ask("Restore the PaintingAI default rates?", "Your own rates will be replaced.", "Restore", () => { data.settings = PR0(); persist(); renderSettings(); }); return; }
    if (!J) return;
    if (JOB.handle(t, J)) return;
    if (d.step != null) { step = +d.step; save(true); renderEst(); window.scrollTo(0, 0); return; }
    if (d.next != null) { if (step < 3) { step++; save(true); renderEst(); window.scrollTo(0, 0); } return; }
    if (d.prev != null) { if (step > 0) { step--; save(true); renderEst(); window.scrollTo(0, 0); } return; }
    if (d.savedraft != null) { if (!hasContent(J)) { E.toast("Add a job name or a room first"); return; } save(); E.home("home"); refresh(); return; }
    if (d.quote != null) { const r = calc(J); if (!r) return E.toast("Add rooms or items first"); JOB.quoteSent(J); save(true); renderEst(); makeQuote({ ...J, ...r, updatedAt: new Date().toISOString() }); return; }
    if (d.how) { J.how = d.how; save(true); renderEst(); if (J.how === "ai") setTimeout(() => $("aiWrap").scrollIntoView({ behavior: "smooth", block: "start" }), 60); return; }
    if (d.scope) { J.scope = d.scope; save(true); renderEst(); return; }
    if (d.qph) { J.quotePhotos = d.qph === "1"; save(true); return renderEst(); }
    if (d.cg) { colourSheet(d.cg); return; }
    if (d.more != null) { E.menu([["Job sheet for the painters", () => jobSheet(J)], ["Order the paint", () => orderPaint(J)], ["Photos", () => JOB.openPhotos("before")], ["Save and close", () => { save(); E.home("home"); refresh(); }]]); return; }
    if (d.coats) { J.coats = +d.coats; save(true); renderEst(); return; }
    if (d.primer) { J.primer = d.primer === "1"; save(true); renderEst(); return; }
    if (d.cond) { J.condition = num(d.cond); save(true); renderEst(); return; }
    if (d.pricing) { J.pricing = d.pricing; save(true); renderEst(); return; }
    if (d.ptype) { J.pr.profitType = d.ptype; save(true); renderEst(); return; }
    if (d.gst) { J.gstMode = d.gst; save(true); renderEst(); return; }
    if (d.qfmt) { J.quoteFormat = d.qfmt; save(true); renderEst(); return; }
    if (d.inc) { J.inc[d.inc] = !J.inc[d.inc]; save(true); renderEst(); return; }
    if (d.jtype) { J.jobType = d.jtype; save(true); renderEst(); return; }
    if (d.access) { J.access = d.access; save(true); renderEst(); return; }
    if (d.occ) { J.occupied = d.occ === "1"; save(true); renderEst(); return; }
    if (d.addline != null) { lineSheet(null); return; }
    if (d.ledit) { lineSheet(d.ledit); return; }
    if (d.rates != null) { ratesSheet(); return; }
    if (d.addroom != null) { addRoom(); return; }
    if (d.rmeasure) { measureRoom(d.rmeasure); return; }
    if (d.rtype || d.redit) { roomSheet(d.rtype || d.redit); return; }
  });
  document.addEventListener("input", e => {
    const t = e.target, d = t.dataset; if (!J || t.closest(".sheet,.phed") || !(d.j || d.pr || d.op || d.al || d.dstyle != null || d.brand != null)) return;
    if (d.brand != null) { J.brand = t.value; const b = BRANDS[J.brand]; if (b) BCLS.forEach((c, i) => { J.pr.cover[c] = b[i]; }); save(true); renderEst(); return; }
    if (d.j) J[d.j] = t.type === "number" ? num(t.value) : t.value; else if (d.pr) J.pr[d.pr] = Math.max(0, num(t.value)); else if (d.op) J.pr.op[d.op] = Math.max(0, num(t.value)); else if (d.al) J.allow[d.al] = Math.max(0, num(t.value)); else J.doorStyle = t.value;
    if (d.j === "customer" && JOB.custFill(J)) { save(true); renderEst(); return; }
    if (d.j === "name") $("estHead").querySelector("small").textContent = J.name || "Painting";
    clearTimeout(save.t); save.t = setTimeout(() => save(true), 400);
    const rb = $("resBox"); if (rb) rb.innerHTML = resultHtml(); renderBar();
  });
  function refresh() { const v = E.view; if (v === "home") renderHome(); else if (v === "saved") renderSaved(); else if (v === "settings") renderSettings(); }
  document.addEventListener("est-view", e => { if (e.detail === "est") { if (J) renderEst(); return; } if (J) save(true); if (e.detail !== "photos") { try { localStorage.removeItem(CUR); } catch (x) { } } refresh(); });

  /* AI mark-up -> the estimate: every item the AI measured becomes a line (walls, ceilings, skirtings, doors, stairs, roofs ...) */
  const AIK = ["walls", "ceiling", "skirting", "cornice", "architrave", "doors", "windows", "extwall", "ext", "stair_item", "balustrade_item", "handrail_item", "fence_item", "deck_item", "pergola_item", "roof_area", "post_item"];
  window.addEventListener("sf-lines", e => {
    const d = e.detail, got = d.rows.filter(x => AIK.indexOf(x.key) >= 0 && x.v > 0);
    if (!got.length) { d.done("Nothing to send yet - no areas or items measured."); return; }
    if (!J) { J = blank(); }
    const mine = J.lines.filter(l => l.ai).map(l => l.ai), kept = got.filter(x => mine.indexOf(x.key) >= 0), add = got.filter(x => mine.indexOf(x.key) < 0);
    J.lines = J.lines.filter(l => l.src !== "ai").concat(add.map(x => line(x.key, Math.round(x.v * 100) / 100, x.key === "fence_item" ? { area: Math.round((x.a || 0) * 100) / 100, src: "ai" } : x.key === "doors" ? { style: J.doorStyle || "FLUSH", src: "ai" } : { src: "ai" })));
    J.how = "ai"; J.coats = d.coats || 2; J.primer = !!d.undercoat; save(true);
    d.done("Sent to the estimate: " + got.length + " item" + (got.length === 1 ? "" : "s") + " (" + got.map(x => (K[x.key] || [x.name])[0].toLowerCase()).join(", ") + "), priced with your PaintingAI rates." + (kept.length ? " Kept your own figures for " + kept.map(x => (K[x.key] || [x.name])[0].toLowerCase()).join(", ") + " (not added twice)." : ""));
    if (!d.silent) { step = 3; renderEst(); window.scrollTo(0, 0); } else renderBar();
  });


  /* ---------- start ---------- */
  load();
  let cur = null; try { cur = JSON.parse(localStorage.getItem(CUR) || "null"); } catch (e) { }
  const rec = cur && data.estimates.find(x => x.id === cur.id);
  if (rec) { J = fromSaved(rec); step = cur.step || 0; }
  E.show("home"); renderHome();
  if (J) { E.go("est"); save(true); renderEst(); }
})();
