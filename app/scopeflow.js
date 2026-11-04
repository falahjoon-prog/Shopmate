/* ShopMate AI - shared "Scope -> Design -> AI check -> Confirm -> Markup" flow for the Painting, Tiling and Electrical estimators.
   Mount with <div id="scopeFlow" data-trade="painting|tiling|electrical"></div>. */
(function () {
  "use strict";
  const COLORS = ["#d2452b", "#1a7f5a", "#2b6cd2", "#b8860b", "#8e44ad", "#00838f", "#c2185b", "#5d4037"];
  const TRADES = {
    painting: {
      name: "Painting", manual: { label: "Measure on site instead", href: "" }, notesIds: [],
      types: [["room", "Room (outline inside the walls)", "poly", "m2", "R"], ["extwall", "Exterior wall run", "line", "lm", "h"], ["ext", "Exterior surface", "poly", "m2", ""], ["stair_item", "Stairs (one point per flight)", "pt", "no", ""], ["balustrade_item", "Balustrade", "line", "lm", "h"], ["handrail_item", "Handrail", "line", "lm", ""], ["fence_item", "Fence", "line", "lm", "hs"], ["deck_item", "Deck", "poly", "m2", ""], ["pergola_item", "Pergola (plan)", "poly", "m2", ""], ["post_item", "Post / column", "pt", "no", ""], ["roof_area", "Roof (plan outline)", "poly", "m2", "p"], ["other", "Other item", "pt", "no", ""]]
    },
    tiling: {
      name: "Tiling", manual: { label: "Enter measurements by hand", href: "" }, notesIds: ["notes"],
      types: [["room", "Room / area (outline inside the walls)", "poly", "m2", "R"], ["movement_joints", "Movement joint", "line", "lm", ""], ["splashback", "Splashback", "line", "lm", ""], ["border_feature_strip", "Border / feature strip", "line", "lm", ""], ["niche_count", "Niche", "pt", "no", ""], ["falls_drains", "Floor waste / drain", "pt", "no", ""], ["object", "Shower tray / bath (comes off the floor)", "pt", "no", "dx"]]
    },
    electrical: {
      name: "Electrical", manual: { label: "Count the points by hand", href: "" }, notesIds: ["scopeText"],
      types: [["el_gpo_double", "Double power point (GPO)", "pt", "no", ""], ["el_gpo_single", "Single power point", "pt", "no", ""], ["el_gpo_wp", "Weatherproof power point", "pt", "no", ""], ["el_data", "Data point", "pt", "no", ""], ["el_tv", "TV point", "pt", "no", ""], ["el_appliance", "Appliance circuit (cooktop / oven / HWS)", "pt", "no", ""], ["el_ac", "A/C isolator", "pt", "no", ""], ["el_ev", "EV charger", "pt", "no", ""], ["el_downlight", "Downlight", "pt", "no", ""], ["el_light", "Light point (batten / oyster / pendant)", "pt", "no", ""], ["el_ext_light", "External light", "pt", "no", ""], ["el_emergency", "Emergency / exit light", "pt", "no", ""], ["el_switch", "Switch", "pt", "no", ""], ["el_smoke", "Smoke alarm", "pt", "no", ""], ["el_exhaust", "Exhaust fan", "pt", "no", ""], ["el_ceiling_fan", "Ceiling fan", "pt", "no", ""], ["el_board", "Switchboard", "pt", "no", ""], ["el_cable", "Cable run (TPS)", "line", "lm", ""], ["el_submain", "Sub-main", "line", "lm", ""], ["el_conduit", "Conduit", "line", "lm", ""], ["el_tray", "Cable tray", "line", "lm", ""], ["el_trench", "Trenching", "line", "lm", ""]]
    }
  };
  const mount = document.getElementById("scopeFlow");
  if (!mount) return;
  const trade = mount.dataset.trade in TRADES ? mount.dataset.trade : "painting";
  const T = TRADES[trade], LS = "sf-" + trade, TXT = mount.dataset.textid || "sfScopeText";
  const typeInfo = id => T.types.find(t => t[0] === id) || T.types[T.types.length - 1];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let S = { rooms: [], scopeText: "", scopeNames: [], scope: null, chat: [], confirmed: false, marks: [], mpp: null, mppNote: "", mode: "", fixes: [], qs: {}, pageNo: 0 };
  try { Object.assign(S, JSON.parse(localStorage.getItem(LS) || "{}")); } catch (e) { }
  // not saved: pictures and busy state
  const V = { opId: 0, sub: "", t0: 0, fx: { f: 0, cyc: 0, run: false, last: 0 }, links: {}, scopePages: [], scopePrev: [], draw: null, busy: "", err: "", tool: "", pts: [], addType: T.types[0][0], zoom: 100, sel: -1, calPts: [], hint: "", out: "", note: "" };
  const save = () => { syncSheet(); try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } };
  /* tiling: each marked page of the drawing set is kept as its own sheet (marks + scale), so the take-off covers the whole set */
  function syncSheet() {
    if (trade !== "tiling" || !V.draw) return;
    if (V.all) S.run = { tried: V.tried || {}, log: V.scanLog || [], scan: V.scan || 0, t0: V.runT0 || Date.now() }; else delete S.run;
    const sh = S.sheets || (S.sheets = {}), p = V.draw.page, old = sh[p] || {}, ix = V.draw.index && V.draw.index[p];
    S.curPage = p;
    if (V.draw.key) S.dk = { key: V.draw.key, name: V.draw.name, count: V.draw.count, page: p, ptW: V.draw.ptW || 0, index: V.draw.index || null };
    if (S.marks.length) sh[p] = { marks: S.marks, mpp: S.mpp, mppNote: S.mppNote, W: V.draw.W, H: V.draw.H, title: ix ? ix.title : old.title || "", type: ix ? ix.type : old.type || "" };
    else delete sh[p];
  }

  /* ---------- native bridge ---------- */
  const cbs = {}, aiCbs = {}; let seq = 0;
  function hooks() {
    if (window.onNative && window.onNative.__sf) return;
    const prev = window.onNative;
    const h = (id, json) => { const f = cbs[id]; if (f) { delete cbs[id]; let v; try { v = JSON.parse(json); } catch (e) { v = { ok: false, error: "Bad answer" }; } f(v); } else if (prev) prev(id, json); };
    h.__sf = true; window.onNative = h;
    const prevAi = window.onAiChunk;
    const a = (id, text, done) => { const f = aiCbs[id]; if (f) { if (text) f.chunk(text); if (done) { delete aiCbs[id]; f.done(); } } else if (prevAi) prevAi(id, text, done); };
    a.__sf = true; window.onAiChunk = a;
  }
  function nat(method, obj) {
    hooks();
    return new Promise(res => {
      if (!window.GPNative || !window.GPNative[method]) { res({ ok: false, error: "This needs the ShopMate AI app on your phone." }); return; }
      const id = "sf" + (++seq); cbs[id] = res;
      try { window.GPNative[method](id, JSON.stringify(obj || {})); } catch (e) { delete cbs[id]; res({ ok: false, error: String(e) }); }
    });
  }
  function aiReady() {
    try { const c = JSON.parse(window.GPNative.aiCloudInfo()); return c.hasKey ? "" : "Add your AI key in ShopMate settings first - the drawing check needs the cloud AI."; }
    catch (e) { return "The AI works in the ShopMate AI app on your phone."; }
  }
  async function ai(system, text, img, wantJson) {
    const bad = aiReady(); if (bad) return { ok: false, error: bad };
    hooks();
    const slot = img ? "s" + (++seq) : "";
    if (img) { const u = await nat("useDoc", { dataUrl: img, slot: slot }); if (!u.ok) return { ok: false, error: u.error || "Couldn't pass the picture to the AI" }; }
    return new Promise(res => {
      const id = "sfa" + (++seq); let full = "", err = "";
      aiCbs[id] = { chunk: t => { if (t.startsWith("[[ERR]]")) err = t.slice(7); else full += t; }, done: () => res(err ? { ok: false, error: err } : { ok: true, text: full }) };
      try { window.GPNative.aiAskCloud(id, JSON.stringify({ system, history: [], text, temperature: 0.1, attachDoc: !!img, docSlot: slot, json: !!wantJson })); }
      catch (e) { delete aiCbs[id]; res({ ok: false, error: String(e) }); }
    });
  }
  function parseJson(t) {
    t = String(t || ""); const a = t.indexOf("{"); if (a < 0) return null;
    try { const b = t.lastIndexOf("}"); if (b > a) return JSON.parse(t.slice(a, b + 1)); } catch (e) { }
    try {   // an answer cut off part-way: close the open string / brackets and keep what was complete
      let x = t.slice(a), st = [], inS = false, esc = false;
      for (const c of x) { if (inS) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inS = false; } else if (c === '"') inS = true; else if (c === "{" || c === "[") st.push(c === "{" ? "}" : "]"); else if (c === "}" || c === "]") st.pop(); }
      if (inS) x += '"'; x = x.replace(/[,:\s]+$/, ""); if (/"[^"]*"\s*:?$/.test(x) && /:$/.test(x)) x += "null";
      return JSON.parse(x + st.reverse().join(""));
    } catch (e) { return null; }
  }

  /* ---------- files ---------- */
  const readUrl = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("Can't read " + f.name)); r.readAsDataURL(f); });
  const readTxt = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error("Can't read " + f.name)); r.readAsText(f); });
  function shrink(src, max, q) {
    return new Promise((ok, no) => {
      const im = new Image();
      im.onload = () => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k)); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); ok({ src: c.toDataURL("image/jpeg", q || 0.82), W: c.width, H: c.height }); };
      im.onerror = () => no(new Error("Can't open that picture")); im.src = src;
    });
  }
  async function readDocx(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
    let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Not a Word .docx file");
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      if (new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)) === "word/document.xml") {
        const st = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = buf.subarray(st, st + cs);
        const xml = method === 0 ? new TextDecoder().decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
        return xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
      }
      p += 46 + nl + el + cl;
    }
    throw new Error("Couldn't find the text in that Word file");
  }
  const isPdf = f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
  const newKey = () => Math.random().toString(36).slice(2, 12);
  async function sendPdf(key, f) {   // piece by piece: a 95 MB drawing must not be loaded into the page in one go
    const CH = 3 * 1024 * 1024; let idx = 0;
    for (let off = 0; off < f.size || off === 0; off += CH, idx++) {
      const b = new Uint8Array(await f.slice(off, off + CH).arrayBuffer()); let bin = "";
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      const r = await nat("pdfChunk", { key: key, idx: idx, b64: btoa(bin) });
      if (!r.ok) throw new Error(r.error || "Couldn't pass the PDF to the app");
    }
  }
  async function pdfPage(key, page, max, dataUrl) {
    const r = await nat("renderPdf", { key, page, maxDim: max, dataUrl: dataUrl || "" });
    if (!r.ok) throw new Error(r.error || "Couldn't open that PDF");
    return r;
  }

  /* ---------- step 1: scope ---------- */
  async function addScope(files) {
    V.err = ""; V.note = ""; const op = begin("Opening the scope files", "Reading each page of your files");
    render();
    try {
      for (const f of files) {
        if (S.scopeNames.indexOf(f.name) >= 0) { V.note = f.name + " is already attached - skipped."; continue; }
        S.scopeNames.push(f.name);
        if (/\.(txt|md|rtf|csv)$/i.test(f.name) || /^text\//.test(f.type)) { S.scopeText += (S.scopeText ? "\n\n" : "") + (await readTxt(f)).replace(/\\par\b|\{\\[^}]*\}|\\[a-z]+-?\d* ?/g, f.name.match(/\.rtf$/i) ? " " : "$&"); }
        else if (/\.docx$/i.test(f.name)) { S.scopeText += (S.scopeText ? "\n\n" : "") + await readDocx(f); }
        else if (/\.doc$/i.test(f.name)) { throw new Error(f.name + ": old .doc files can't be read - save it as .docx or PDF."); }
        else if (isPdf(f)) {
          const key = newKey(); await sendPdf(key, f); let first = await pdfPage(key, 0, 1600);
          const n = first.count;
          for (let i = 0; i < n; i++) { const r = i ? await pdfPage(key, i, 1600) : first; V.scopePages.push(r.dataUrl); V.scopePrev.push({ src: r.dataUrl, name: f.name + (first.count > 1 ? " p" + (i + 1) : "") }); }
        } else if (/^image\//.test(f.type)) {
          const im = await shrink(await readUrl(f), 1600); V.scopePages.push(im.src); V.scopePrev.push({ src: im.src, name: f.name });
        } else throw new Error(f.name + ": this file type can't be opened.");
      }
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; S.confirmed = false; save(); render();
  }

  /* ---------- prompts ---------- */
  const rulesText = () => String((window.SF_RULES || {})[trade] || "").slice(0, 20000);
  const fixesText = () => S.fixes.length ? "\nCorrections the user made before (learn from them):\n" + S.fixes.slice(-12).map(f => "- " + f).join("\n") : "";
  /* ---- Tiling knowledge and measurement rules, ported from the desktop TilingAI ---- */
  const TCATS = { floor_tile: "General floor", wet_area_floor: "Wet-area floor", wall_tile: "Wall tile", skirting_border: "Skirting", border_feature_strip: "Border / feature strip", splashback: "Splashback", waterproofing: "Waterproofing", falls_drains: "Falls / floor waste", movement_joints: "Movement joints", niche_count: "Niche (count)", niche_tiling: "Niche tiling", external_paving: "External paving" };
  const ROOM_CATS = ["floor_tile", "wet_area_floor", "wall_tile", "external_paving", "skirting_border", "border_feature_strip", "waterproofing"];
  const WET_CATS = ["wet_area_floor", "waterproofing", "falls_drains", "wall_tile"];
  const WET_RE = /bath|ensuite|en-suite|\bens\b|servery|\bwc\b|w\.c|toilet|shower|laundry|powder|amenit|ablution|\bpwd\b|\bdda\b|accessible|ambulant|wet\s*area|\bwir\b|steam|sauna|pool|spa\b|cleaner|utility|mud\s*room/i;
  const DRY_RE = /bed|living|lounge|dining|family|hall|corridor|entry|foyer|lobby|study|office|store|storage|garage|walk.?in|wardrobe|robe|stair|lift|plant|riser|comms|meeting|reception|retail|kitchen|pantry|balcony|terrace|deck|void|shaft|duct|cupboard|linen/i;
  const wetness = n => WET_RE.test(n || "") ? "wet" : DRY_RE.test(n || "") ? "dry" : "unknown";
  /* ---- Electrical items, colours and rules, ported from the desktop ElectricalAI (EL_ITEMS, order list) ---- */
  const ECN = {}, ECOL = {}, ECODE = {};
  T.types.forEach(t => { ECN[t[0]] = t[1]; });
  const ECOLS = {el_gpo_double: "#E53935", el_gpo_single: "#EF6C00", el_gpo_wp: "#6D4C41", el_data: "#1E88E5", el_tv: "#3949AB", el_appliance: "#8E24AA", el_ac: "#00897B", el_ev: "#2E7D32", el_downlight: "#FDD835", el_light: "#FFB300", el_ext_light: "#FB8C00", el_emergency: "#43A047", el_switch: "#757575", el_smoke: "#D81B60", el_exhaust: "#00ACC1", el_ceiling_fan: "#26A69A", el_board: "#212121", el_cable: "#C62828", el_submain: "#4E342E", el_conduit: "#546E7A", el_tray: "#78909C", el_trench: "#795548"}, ECODES = {el_gpo_double: "GD", el_gpo_single: "GS", el_gpo_wp: "GW", el_data: "DA", el_tv: "TV", el_appliance: "AP", el_ac: "AC", el_ev: "EV", el_downlight: "DL", el_light: "LP", el_ext_light: "XL", el_emergency: "EM", el_switch: "SW", el_smoke: "SA", el_exhaust: "EX", el_ceiling_fan: "CF", el_board: "MB"};
  Object.assign(ECOL, ECOLS); Object.assign(ECODE, ECODES);
  const E_POWER = ["el_gpo_double", "el_gpo_single", "el_gpo_wp", "el_ac"], E_LIGHT = ["el_downlight", "el_light", "el_ext_light", "el_emergency", "el_switch", "el_smoke", "el_exhaust", "el_ceiling_fan"], E_DATA = ["el_data", "el_tv"];
  const colorOf = ti => trade === "electrical" && ECOL[ti[0]] ? ECOL[ti[0]] : COLORS[T.types.indexOf(ti) % COLORS.length];
  const QSD = trade === "electrical" ? { spare: 0, cableWaste: 10, drum: 100, powerM: 8, lightM: 5, dataM: 15, applM: 15, conduitLen: 4, trayLen: 3, lightMax: 20, powerMax: 10, rcbo: 1, rcdMax: 3, rcdMin: 2, uf: 0.6, mf: 0.8 } : trade === "painting" ? { doorW: 0.9, doorH: 2.1, winW: 1.2, winH: 1.2, wallH: 2.4, skirtH: 90, cornice: 90, coats: 2, wallSpread: 16, ceilSpread: 16, enamelSpread: 12, primerSpread: 14, extSpread: 14, stainSpread: 10, roofSpread: 8, waste: 10, undercoat: false } : { upstand: 150, skipSkirt: true, skirtMinH: 1.5, doorW: 0.9, doorH: 2.1, winW: 1.2, winH: 1.2 };
  /* ---- Painting categories and rules, ported from the desktop PaintingAI ---- */
  const PCN = { ceiling: "Ceilings", walls: "Walls", skirting: "Skirtings", cornice: "Cornices", architrave: "Architraves", doors: "Doors (each)", windows: "Windows (each)", extwall: "Exterior walls", ext: "Exterior surface", stair_item: "Stairs (each flight)", balustrade_item: "Balustrades", handrail_item: "Handrails", fence_item: "Fences", deck_item: "Decks", pergola_item: "Pergolas", post_item: "Posts / columns", roof_area: "Roof (sloped area)" };
  const PROOM = ["ceiling", "walls", "skirting", "cornice", "architrave", "doors", "windows"];
  const RC = trade === "painting" ? PROOM : ROOM_CATS, CN = trade === "painting" ? PCN : trade === "electrical" ? ECN : TCATS;
  const PAINT_KNOWLEDGE = `HOW PAINTING SCOPES ARE WRITTEN (Australian practice):
- Standards: AS/NZS 2311 (painting of buildings), AS 4361 (lead paint), AS/NZS 2312 (protective coatings). Brands: Dulux, Taubmans, Haymes, Wattyl, Resene.
- A normal INTERIOR system is: sealer/primer or undercoat (new work or colour change) then 2 finish coats. Walls = low-sheen acrylic, ceilings = flat white ceiling paint (mould-resistant in wet areas), doors / skirtings / architraves / windows = semi-gloss or gloss enamel. Repaint = 2 coats, usually no sealer.
- EXTERIOR: exterior acrylic on walls, eaves, fascia, gutters (if included), doors, pergolas, fences, decks (stain or oil), roofs (roof paint). Scaffold / EWP may be needed for two storeys.
- NOT PAINTED unless the scope says so: tiled surfaces, face brick, pre-finished joinery, aluminium windows, sliding glass doors, roller doors and pre-finished doors, kitchen cabinets, stainless / glass, floors. "Excluded", "by others", "not in contract" mean do NOT include.
- Door types painted: flush, panel, French, robe, cavity slider, entry and barn doors. Timber windows are painted; aluminium windows are not.
- Architraves and cornices come from the openings and ceilings - never ask the estimator to measure them again.
- "PC" / "provisional sum" are allowances. Areas often written in words: "all rooms", "as per colour schedule", "refer drawings" - if the scope points to a schedule you cannot see, say so and ask one question.
- Raked ceilings: area = plan area / cos(rake). A typical floor repeated on several levels is measured once and counted x copies.

CATEGORY MAPPING (use these keys):
- ceilings -> ceiling ; interior walls -> walls ; skirtings -> skirting ; cornices -> cornice ; architraves -> architrave
- doors (painted, counted each) -> doors ; windows (painted, counted each) -> windows
- exterior walls -> extwall ; other exterior surfaces (eaves, fascia, paving) -> ext
- stairs (each flight) -> stair_item ; balustrades -> balustrade_item ; handrails -> handrail_item ; fences -> fence_item ; decks -> deck_item ; pergolas -> pergola_item ; posts / columns -> post_item ; roof -> roof_area
- Door types: flush, panel, French, robe bi-fold, cavity slider, entry and barn doors are painted; sliding glass, roller and pre-finished doors are NOT. Timber windows are painted; aluminium windows are NOT.
`;
  const qs = k => (S.qs && S.qs[k] != null && S.qs[k] !== "" ? S.qs[k] : QSD[k]);

  const TILING_KNOWLEDGE = `HOW TILING SCOPES ARE WRITTEN (Australian practice; use this to understand the document):
- Standards: AS 3958.1 (ceramic tiling), AS 3740 (waterproofing of wet areas), AS 4586 / AS 4663 (slip resistance: P3-P5, R10-R13).
- Wet areas = bathrooms, ensuites, showers, toilets/WCs, laundries, sluice rooms, kitchens with wet requirements. They need waterproofing (membrane) and often falls to a floor waste; wall tiles usually run to a stated height (2.1 m / 2.4 m / to ceiling / to shower screen height).
- A "finishes schedule" or "room finish schedule" table lists, per room: floor / wall / skirting / ceiling finish and a code (e.g. CT1, CT-02). A separate "materials/tile schedule" gives each code's tile type, size and colour. Join the two: room -> code -> tile and size.
- Tile size is written 300x600, 600 x 600 mm, 300 x 300 etc. First number is length, second width.
- Skirting tile = tile cut into a skirting, height 100 mm unless stated. Splashback = tile above a bench/basin. Border / feature strip = a band of different tile. Niche = recessed shelf in a shower wall (count them). Trims/profiles = metal or PVC edges, transitions between floor finishes. Movement joints = expansion/control joints in large floors (typically every 4.5-6 m, and where tiles meet other finishes).
- "PC" / "prime cost" and "provisional sum" mean an allowance, not a final price - note them as assumptions.
- "Supply and install" means the tiler provides the tiles; "install only" means tiles are supplied by others. "Excluded" / "by others" / "not in contract" mean do NOT measure it.
- Areas often described in words: "all wet areas", "as per finishes schedule", "refer drawings", "generally", "typical". If the scope points to a drawing or schedule you cannot see, say so and ask - never guess.
- External tiling = balconies, terraces, paving, pool surrounds.

CATEGORY MAPPING (use these keys):
- floor tiles in wet areas -> wet_area_floor ; floor tiles elsewhere -> floor_tile
- wall tiles -> wall_tile (needs a height) ; external tiles / paving -> external_paving
- skirting tiles -> skirting_border ; border or feature strips -> border_feature_strip ; splashbacks -> splashback
- waterproofing membrane -> waterproofing ; floor wastes / falls -> falls_drains ; movement joints -> movement_joints
- niches -> niche_count (count) ; niche tiling -> niche_tiling
`;
  const T_SHAPE = '{"reply":"your short answer","summary":"2-3 sentences","categories":[{"key":"<category key>","included":true,"areas":"which rooms/areas, with page refs","tile_spec":"material/type or empty","tile_size_mm":[length,width] or null,"wall_height_m":null,"upturn_mm":null,"shower_wall_mm":null,"notes":""}],"door_size_m":[0.82,2.04] or null,"exclusions":["..."],"assumptions":["..."],"questions":["..."]}';
  /* ---------- the fixed path the external AI follows: what stage it is in, what to read, how the app calculates ---------- */
  const STAGES = ["Read the scope", "The estimator checks and confirms the scope", "Find the drawing scale", "Mark up the drawing", "The app calculates quantities and the estimate"];
  const CALC_TEXT = {
    tiling: "- Floor tile / wet-area floor = room area. Wall tile = room perimeter x wall height - doors (width x min(door height, wall height)) - windows. The confirmed scope's wall height always wins over yours.\n- Skirting = perimeter - door widths (left out when the walls are tiled 1.5 m or higher). Waterproofing = floor area + upstand (150 mm) x (perimeter - door widths). Splashback / border = length - door widths.\n- Wet-area items (wet floor, waterproofing, wall tile) only apply to wet rooms (bath, ensuite, WC, laundry, shower). One door is assumed for a room with wall tile, skirting, border or waterproofing when you give none.\n- So you must supply: a clean outline of each room INSIDE its walls, the categories the CONFIRMED SCOPE gives that room, the number of doors and windows in its walls, and sizes only if printed.",
    painting: "- Walls = room perimeter x (wall height - skirting height, or the tiled height) - openings. Ceilings = room area. Skirtings = perimeter - door widths. Cornices = perimeter. Architraves = doors (2 x height + width) + windows all round. Doors and windows are counted each.\n- Paint litres = area x coats / spread (walls 16, ceilings 16, enamel 12 m2 per litre), + waste, then tins.\n- A typical floor repeated on several levels is outlined once and counted x copies.\n- So you must supply: a clean outline of each room INSIDE its walls, the surfaces the CONFIRMED SCOPE paints in that room, the number of doors and windows in its walls, wall height only if stated, tiled height only if the walls are tiled, and the number of repeated levels.",
    electrical: "- The app counts your points per category and prices each. Cable runs measured on the drawing are used when they cover at least half the allowance; otherwise cable = an allowance per point (power 8 m, light 5 m, data 15 m, appliance 15 m) + 10% waste in 100 m drums. Conduit 4 m and tray 3 m lengths.\n- A double power-point symbol is ONE double power point. Each switch mechanism is one switch.\n- So you must supply: ONE point exactly on every symbol (centre of the symbol), the correct category from the legend, and cable / conduit / tray / trench routes only where a route is drawn."
  };
  const SCOPE_STEPS = {
    tiling: ["Read the scope from the first page to the last, in order. Note the [[PAGE n]] of everything you use.", "Find the finishes / room schedule and the tile schedule; join room -> tile code -> tile type and size.", "For EACH category key decide: included (written as supply / install / tile / waterproof) or not included (excluded, by others, NIC, not in contract).", "Write which rooms or areas each included category applies to, and the wall tile height when stated (2.1 / 2.4 m / to ceiling). For waterproofing give upturn_mm (the wall upturn) and shower_wall_mm (shower wall height) when the scope states them. If the scope or a door schedule gives the standard door size, give door_size_m [width, height] in metres (820 x 2040 -> [0.82, 2.04]), else null.", "Put anything that points to a drawing or schedule you cannot see into questions - ask at most the 3 most important.", "Do NOT measure, calculate or price anything."],
    painting: ["Read the scope from the first page to the last, in order. Note the [[PAGE n]] of everything you use.", "Find the colour / finishes schedule and the paint system (product, coats, sealer or undercoat, new work or repaint).", "For EACH category key decide: included or not included (excluded, by others, NIC, not painted - tiled walls, aluminium windows, pre-finished joinery).", "Write which rooms or areas each included category applies to and the coats / product when stated; exterior items separately.", "Put anything that points to a drawing or schedule you cannot see into questions - ask at most the 3 most important.", "Do NOT measure, calculate or price anything."],
    electrical: ["Read the scope from the first page to the last, in order. Note the [[PAGE n]] of everything you use.", "List each electrical item the scope includes and map it to a category key. Write a count in 'count' ONLY when the scope states a number.", "Decide for each key: included or not included (excluded, by others, NIC, install only / supply only).", "Note appliances needing their own circuit, supply-and-install versus install-only, and PC / provisional items as assumptions.", "Put anything that points to a drawing, legend or schedule you cannot see into questions - ask at most the 3 most important.", "Do NOT count from the drawing here and do NOT price anything."]
  };
  const SCALE_STEPS = ["Look at the title block (bottom or right edge) and any scale bar or scale note near the plan.", "Read the printed scale of THIS sheet's main plan (1:100 -> 100) and the sheet size (A0-A4) if printed.", "Otherwise pick ONE clear printed dimension line on the plan: give both end points and its real length in metres.", "If none of these is printed, return scale_ratio 0 and dimension null - never guess a scale."];
  const MARK_STEPS = {
    tiling: ["Decide what kind of sheet this is. If it is not a floor plan (legend, schedule, detail, elevation, section) return empty lists and say why in page_notes.", "Many sheets mix a PLAN view with elevations / sections / details. Trace rooms ONLY inside the plan view (seen from above: walls as thick lines, door swings, room names, floor tiles or wastes). NEVER outline an elevation or section view (a wall face seen from the side: tiles drawn up the wall, heights, fixtures in front view, view titles like ELEVATION / SECTION / ELEV A) - walls are measured from the room perimeter on the plan x the scope height, never from an elevation.", "Find each room on the plan by its printed name / number. Use only rooms that have work in the CONFIRMED SCOPE.", "Trace each room's outline INSIDE its walls with 4-12 points in order. One room = one outline; never one outline for the whole page.", "Give each room only the categories the confirmed scope allows for it (wet categories only for wet rooms).", "Count door openings and windows in each room's own walls. Give door width only when a schedule, tag or dimension shows it - otherwise 0.", "Add movement joints / floor wastes / niches only when the scope includes them and they are drawn.", "SELF-CHECK before you answer: every point is between 0 and 1; no two outlines overlap much; each name comes from the plan; every category is in the allowed list; nothing invented."],
    painting: ["Decide what kind of sheet this is. If it is not a floor plan (set-out, slab, structural, services, furniture, ceiling grid, landscape, legend, schedule, detail, elevation) return empty lists and say why in page_notes.", "Find each room on the plan by its printed name / number. Use only rooms the CONFIRMED SCOPE paints.", "Trace each room's outline INSIDE its walls with 4-12 points in order. One room = one outline; never one outline for the whole page.", "Give each room only the surfaces the confirmed scope paints there (ceiling, walls, skirting, cornice, architrave, doors, windows).", "Count door openings and windows in each room's own walls. Give door width only when printed - otherwise 0. Give wall height only when stated; tiled height only when the walls are tiled.", "If the title says the same floor repeats (LEVELS 2-4), outline it once and give the number of repeats in copies.", "SELF-CHECK before you answer: every point is between 0 and 1; no two outlines overlap much; each name comes from the plan; every category is in the allowed list; nothing invented."],
    electrical: ["Decide what kind of sheet this is. If it is not an electrical layout (power / lighting / data plan) return empty lists and say why in page_notes.", "READ THE LEGEND / SYMBOL KEY first and list what you found in 'legend'. Every symbol you count must match a legend entry.", "Go room by room across the plan and put ONE count on EVERY symbol, exactly at its centre, with the legend's category key.", "Only categories in the CONFIRMED SCOPE. A double symbol is one point; do not count the same symbol twice; do not count symbols that belong to another sheet's legend.", "Add cable / sub-main / conduit / tray / trench routes in 'linear' ONLY where a route is actually drawn.", "SELF-CHECK before you answer: every point is between 0 and 1; no two points sit on top of each other; every category is in the allowed list; nothing invented."]
  };
  function playbook(stage, steps) {
    return "FIXED WORKFLOW - the app runs it in this order and you do ONLY the stage marked HERE:\n" + STAGES.map((n, i) => (i + 1) + ". " + n + (i === stage ? "   <== YOU ARE HERE" : "")).join("\n") + "\n\nYOUR STEPS FOR THIS STAGE (do them in order, skip none, do not do other stages):\n" + steps.map((x, i) => "  " + (i + 1) + ") " + x).join("\n") + "\n\nHOW THE APP CALCULATES (you NEVER calculate or output totals - you only supply the inputs):\n" + CALC_TEXT[trade] + "\n\nHARD RULES: reply with the JSON only, exactly the shape given; use only the allowed keys; never invent rooms, points, sizes or numbers; when something is unclear or not shown leave it out (or 0 / null) and say so in notes / questions.";
  }
  /* what the app checks in the AI's markup before accepting it; a bad answer is sent back once with the list of problems */
  const ok01 = p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(x => typeof x === "number" && x >= 0 && x <= 1);
  function checkRooms(j) {
    const out = [], seen = [];
    (Array.isArray(j.rooms) ? j.rooms : []).forEach(rm => {
      const n = String(rm.name || "a room"), pts = rm.polygon;
      if (!Array.isArray(pts) || pts.length < 3 || !pts.every(ok01)) { out.push(n + ": the outline needs 3 or more [x,y] points, each between 0 and 1"); return; }
      let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
      a = Math.abs(a / 2); if (a > 0.85) out.push(n + ": the outline covers the whole page - outline only the room inside its walls"); else if (a < 0.0004) out.push(n + ": the outline is far too small");
      const bb = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
      seen.forEach(o => { const w = Math.min(bb[2], o.bb[2]) - Math.max(bb[0], o.bb[0]), h = Math.min(bb[3], o.bb[3]) - Math.max(bb[1], o.bb[1]); if (w > 0 && h > 0) { const i = w * h, u = (bb[2] - bb[0]) * (bb[3] - bb[1]) + (o.bb[2] - o.bb[0]) * (o.bb[3] - o.bb[1]) - i; if (u > 0 && i / u > 0.8) out.push(n + " and " + o.n + " are almost the same outline - one room, one outline"); } });
      seen.push({ n: n, bb: bb }); if (Number(rm.door_count) > 8) out.push(n + ": " + rm.door_count + " doors is unlikely - count only openings in this room's own walls");
    });
    return out.slice(0, 8);
  }
  function checkCounts(j) {
    const out = [], c = Array.isArray(j.counts) ? j.counts : [], l = Array.isArray(j.linear) ? j.linear : [], seen = {}; let dup = 0;
    c.forEach(x => { if (!ok01(x.point)) { out.push("a " + (x.category || "point") + " has coordinates outside 0 to 1"); return; } const k = x.category + "@" + Math.round(x.point[0] * 250) + "," + Math.round(x.point[1] * 250); if (seen[k]) dup++; seen[k] = 1; });
    if (dup) out.push(dup + " point(s) sit exactly on top of another point of the same kind - count each symbol once");
    if (c.length > 500) out.push("more than 500 points is unlikely - count real symbols only");
    l.forEach(x => { if (!Array.isArray(x.points) || x.points.length < 2 || !x.points.every(ok01)) out.push("a " + (x.category || "route") + " needs 2 or more [x,y] points between 0 and 1"); });
    return out.slice(0, 8);
  }
  async function askChecked(sys, txt, img, check) {
    let r = await ai(sys, txt, img, true); if (!r.ok) return r;
    const j = parseJson(r.text), issues = j ? check(j) : ["the answer was not valid JSON"];
    if (issues.length) {
      V.sub = "Checking the AI's answer - asking it to fix " + issues.length + " problem" + (issues.length === 1 ? "" : "s"); render();
      const r2 = await ai(sys, txt + "\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS. Fix every one and return the COMPLETE JSON again:\n- " + issues.join("\n- "), img, true);
      if (r2.ok) { const j2 = parseJson(r2.text); if (j2 && check(j2).length <= issues.length) r = r2; }
    }
    return r;
  }
  const tilingScopeSys = () => "You are the AI estimator inside ShopMate AI Tiling, software a tiling contractor uses to price tiling work from architectural drawings. You are a friendly, sharp colleague. Answer what the estimator asks in natural language, in your own words.\n\n" + TILING_KNOWLEDGE + "\nHOW TO BEHAVE:\n- Answer the latest message first, directly, in under 120 words unless they ask for detail. Do not re-list the interpretation - it is shown to them in a separate box.\n- When you quote the scope, give the page like (p12) using the [[PAGE n]] markers.\n- Never invent details the scope does not contain. If something is missing, ask ONE question.\n- If they correct you, change your understanding and say in one sentence what changed.\n\nRULES THE ESTIMATOR HAS TAUGHT YOU (always obey), plus the contractor's own measurement rules:\n" + rulesText() + fixesText() + "\n\nReply with ONLY a JSON object shaped like: " + T_SHAPE + "\nCategory keys you may use (only these):\n" + Object.keys(TCATS).map(k => "  " + k + " = " + TCATS[k]).join("\n") + "\n\n" + playbook(0, SCOPE_STEPS[trade]);
  const P_SHAPE = '{"reply":"your short answer","summary":"2-3 sentences","categories":[{"key":"<category key>","included":true,"areas":"which rooms/areas, with page refs","paint_system":"product / finish / colour if stated","coats":null,"spread_m2_per_l":null,"wall_height_m":null,"notes":""}],"exclusions":["..."],"assumptions":["..."],"questions":["..."]}';
  const paintingScopeSys = () => "You are the AI estimator inside ShopMate AI Painting, software a painting contractor uses to price painting work from architectural drawings. You are a friendly, sharp colleague. Answer what the estimator asks in natural language, in your own words.\n\n" + PAINT_KNOWLEDGE + "\nHOW TO BEHAVE:\n- Answer the latest message first, directly, in under 120 words unless they ask for detail. Do not re-list the interpretation - it is shown to them in a separate box.\n- When you quote the scope, give the page like (p12) using the [[PAGE n]] markers.\n- Never invent details the scope does not contain. If something is missing, ask ONE question.\n- If they correct you, change your understanding and say in one sentence what changed.\n- Put the paint system (coats, product, whether a sealer/undercoat is included) on each category when the scope states it.\n\nRULES FROM THE CONTRACTOR'S OWN PaintingAI SOFTWARE (always obey), plus the contractor's own measurement rules:\n" + rulesText() + fixesText() + "\n\nReply with ONLY a JSON object shaped like: " + P_SHAPE + "\nCategory keys you may use (only these):\n" + Object.keys(PCN).map(k => "  " + k + " = " + PCN[k]).join("\n") + "\n\n" + playbook(0, SCOPE_STEPS[trade]);
  const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error("Can't open that picture")); im.src = src; });
  /* a dense sheet: the whole page first (to see if there is anything for this scope), then zoomed parts so rooms and symbols are big enough to place accurately */
  async function askTiled(sys, txt, d, check) {
    const oid = V.opId, r = await askChecked(sys, txt, d.src, check); if (!r.ok) return r;
    const j = parseJson(r.text), has = o => o && ["rooms", "exterior", "linear", "counts"].some(k => Array.isArray(o[k]) && o[k].some(x => x && (x.polygon || x.points || x.point)));
    if (!j || !has(j) || !d.key) return r;
    let big; try { const hi = await pdfPage(d.key, d.page, 3200); big = await loadImg(hi.dataUrl); } catch (e) { return r; }
    const NX = 2, NY = 2, ov = 0.07, out = { rooms: [], exterior: [], linear: [], counts: [] };
    const cen = pts => [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
    const jobs = []; let partsDone = 0; V.sub = "Zooming in for accuracy: " + NX * NY + " parts at once"; render();   // the parts are read at the same time (each call has its own picture)
    for (let ty = 0; ty < NY; ty++) for (let tx = 0; tx < NX; tx++) { jobs.push((async () => {
      if (oid !== V.opId) return;

      const cx0 = tx / NX, cx1 = (tx + 1) / NX, cy0 = ty / NY, cy1 = (ty + 1) / NY, x0 = Math.max(0, cx0 - ov), x1 = Math.min(1, cx1 + ov), y0 = Math.max(0, cy0 - ov), y1 = Math.min(1, cy1 + ov);
      const cv = document.createElement("canvas"); cv.width = Math.round((x1 - x0) * big.naturalWidth); cv.height = Math.round((y1 - y0) * big.naturalHeight);
      cv.getContext("2d").drawImage(big, x0 * big.naturalWidth, y0 * big.naturalHeight, cv.width, cv.height, 0, 0, cv.width, cv.height);
      const note = "THIS IMAGE IS A ZOOMED PART of the page (columns " + Math.round(x0 * 100) + "-" + Math.round(x1 * 100) + "% across, rows " + Math.round(y0 * 100) + "-" + Math.round(y1 * 100) + "% down). Other parts are handled separately: mark only what is inside this part. Coordinates are fractions of THIS zoomed image. Sheet title block, legends and the rest of the page are not visible here.\n\n";
      const rt = await askChecked(sys, note + txt, cv.toDataURL("image/jpeg", 0.85), check); partsDone++; if (oid === V.opId) { V.sub = "Zooming in for accuracy: " + partsDone + " of " + NX * NY + " parts done"; render(); } if (!rt.ok) return;
      const jt = parseJson(rt.text); if (!jt) return;
      const map = q => [x0 + Math.max(0, Math.min(1, Number(q[0]))) * (x1 - x0), y0 + Math.max(0, Math.min(1, Number(q[1]))) * (y1 - y0)];
      const inCore = pts => { if (!pts.length) return false; const c = cen(pts); return c[0] >= cx0 - 1e-9 && (c[0] < cx1 || tx === NX - 1) && c[1] >= cy0 - 1e-9 && (c[1] < cy1 || ty === NY - 1); };
      const take = (arr, field, single, dst) => (Array.isArray(arr) ? arr : []).forEach(it => {
        if (!it) return; const raw = single ? (Array.isArray(it[field]) ? [it[field]] : []) : (Array.isArray(it[field]) ? it[field] : []);
        const pts = raw.filter(q => Array.isArray(q) && q.length >= 2).map(map); if (!pts.length || !inCore(pts)) return;
        const o = Object.assign({}, it); o[field] = single ? pts[0] : pts; dst.push(o);
      });
      take(jt.rooms, "polygon", false, out.rooms); take(jt.exterior, "points", false, out.exterior); take(jt.linear, "points", false, out.linear); take(jt.counts, "point", true, out.counts);
    })()); }
    await Promise.all(jobs); if (oid !== V.opId) return r;
    if (!out.rooms.length && !out.exterior.length && !out.linear.length && !out.counts.length) return r;   // zoomed parts found nothing: keep the whole-page answer
    if (trade === "tiling") out.rooms = joinSplitRooms(out.rooms, d);
    const merged = Object.assign({}, j, { rooms: out.rooms, exterior: out.exterior, linear: out.linear, counts: out.counts });
    if (trade === "electrical") merged.rooms = Array.isArray(j.rooms) ? j.rooms : [];
    return { ok: true, text: JSON.stringify(merged) };
  }
  const baseSys = () => "You are the ShopMate AI " + T.name + " take-off assistant for an Australian " + T.name.toLowerCase() + " contractor. Follow these permanent rules from the contractor's own " + T.name + "AI software:\n" + rulesText() + fixesText();
  const ELEC_KNOWLEDGE = `HOW ELECTRICAL SCOPES AND DRAWINGS ARE WRITTEN (Australian practice; use this to understand the documents):
- Standards: AS/NZS 3000 (the Wiring Rules), AS/NZS 3008 (cable selection), AS 3786 (smoke alarms), AS/NZS 2293 (emergency and exit lighting), AS/NZS 1680 (interior lighting), NCC Part J6 (lighting energy), and the local network's Service and Installation Rules. Work is done by a licensed electrical contractor.
- The ELECTRICAL LAYOUT (power plan, lighting plan, "E" sheets) shows each point as a symbol; the LEGEND / symbol key on the sheet says what each symbol is. Read the legend first, then count the symbols on the plan, room by room. Typical symbols: a circle with two short lines = double power point (GPO); one line = single; "WP" or "IP" = weatherproof; a small circle or "DL" = downlight; a circle with a cross = light point / batten / oyster; "S" or a switch tick = switch (count each mechanism); "D" / triangle = data; "TV" = television; "SA" / "SD" = smoke alarm; "EF" = exhaust fan; a fan symbol = ceiling fan; "EM" / "EXIT" = emergency or exit light; "MSB" / "DB" = switchboard; "AC" isolator next to an outdoor unit; "EV" = car charger.
- Appliances that need their own circuit: cooktop, oven, hot water system, A/C, pool pump, EV charger - one appliance circuit each unless the scope says otherwise.
- Cable runs are measured in metres along the route (sub-mains from the main board to each sub-board; tray and conduit where drawn). Where only points are drawn, the cable is an allowance per point.
- "Supply and install" = the electrician supplies everything; "install only" / "fit-off only" = fittings supplied by others; "by others", "excluded", "NIC" (not in contract) = do NOT count it. "PC" / "prime cost" items and "provisional sums" are allowances - note them as assumptions.
- If the scope points to a drawing, schedule or legend you cannot see, say so and ask - never guess a count. When the scope states a number ("the kitchen gets 6 double power points") put the total in "count".

CATEGORY MAPPING (use these keys):
- double power points -> el_gpo_double ; single power points -> el_gpo_single ; weatherproof power points -> el_gpo_wp
- data points -> el_data ; tv points -> el_tv ; appliance circuits (cooktop / oven / hws) -> el_appliance ; a/c isolators -> el_ac ; ev chargers -> el_ev
- downlights -> el_downlight ; light points (batten / oyster / pendant) -> el_light ; external lights -> el_ext_light ; emergency / exit lights -> el_emergency
- switches -> el_switch ; smoke alarms -> el_smoke ; exhaust fans -> el_exhaust ; ceiling fans -> el_ceiling_fan ; switchboards -> el_board
- cable runs (tps) -> el_cable ; sub-mains -> el_submain ; conduit -> el_conduit ; cable tray -> el_tray ; trenching -> el_trench
- Paint, tiles, walls, ceilings and doors are NOT used here.
`;
  const E_SHAPE = '{"reply":"your short answer","summary":"2-3 sentences","categories":[{"key":"<category key>","included":true,"areas":"which rooms/areas, with page refs","spec":"product / type if stated","count":null,"notes":""}],"exclusions":["..."],"assumptions":["..."],"questions":["..."]}';
  const electricalScopeSys = () => "You are the AI estimator inside ShopMate AI Electrical, software an electrical contractor uses to price electrical work from electrical and architectural drawings. You are a friendly, sharp colleague. Answer what the estimator asks in natural language, in your own words.\n\n" + ELEC_KNOWLEDGE + "\nHOW TO BEHAVE:\n- Answer the latest message first, directly, in under 120 words unless they ask for detail. Do not re-list the interpretation - it is shown to them in a separate box.\n- When you quote the scope, give the page like (p12) using the [[PAGE n]] markers.\n- Never invent details the scope does not contain. If something is missing, ask ONE question.\n- If they correct you, change your understanding and say in one sentence what changed.\n\nRULES FROM THE CONTRACTOR'S OWN ElectricalAI SOFTWARE (always obey):\n" + rulesText() + fixesText() + "\n\nReply with ONLY a JSON object shaped like: " + E_SHAPE + "\nCategory keys you may use (only these):\n" + Object.keys(ECN).map(k => "  " + k + " = " + ECN[k]).join("\n") + "\n\n" + playbook(0, SCOPE_STEPS[trade]);

  async function readScope(userMsg) {
    V.err = ""; const op = begin("AI is reading the scope", "");
    render();
    try {
      if (V.scopePages.length) {
        for (let i = 0; i < V.scopePages.length; i++) {
          if (op !== V.opId) return; V.busy = "AI is reading the scope"; V.sub = "Page " + (i + 1) + " of " + V.scopePages.length; render();
          const r = await ai("You transcribe documents exactly. Output plain text only.", "Transcribe all the text on this page of a scope of work, keeping headings, lists and numbers exactly. No commentary.", V.scopePages[i], false);
          if (op !== V.opId) return; if (!r.ok) throw new Error(r.error);
          S.scopeText += (S.scopeText ? "\n\n" : "") + "[[PAGE " + (++S.pageNo) + "]]\n" + r.text.trim();
        }
        V.scopePages = [];
      }
      if (!S.scopeText.trim()) throw new Error("Attach a scope file or type the scope first.");
      if (op !== V.opId) return; V.busy = "AI is working out what the scope means"; V.sub = trade === "tiling" ? "Matching rooms, tile types and wall heights" : trade === "painting" ? "Matching rooms, surfaces and paint systems" : ""; render();
      let text = "SCOPE OF WORK:\n" + S.scopeText.slice(0, 60000);
      if (userMsg) text += "\n\nCurrent understanding:\n" + JSON.stringify(S.scope) + "\n\nRecent discussion:\n" + S.chat.slice(-6).map(m => m.who + ": " + m.text).join("\n") + "\n\nThe user now says: " + userMsg + "\nUpdate the understanding to match what the user says and return the same JSON.";
      else text += "\n\nExplain what you understood so the user can check it. Do not price anything and do not invent work that is not in the scope.";
      const sysTxt = trade === "tiling" ? tilingScopeSys() : trade === "painting" ? paintingScopeSys() : electricalScopeSys();
      let r = await ai(sysTxt, text, null, true);
      if (op !== V.opId) return; if (!r.ok) throw new Error(r.error);
      let j = parseJson(r.text);
      if (!j || !Array.isArray(j.categories)) { V.sub = "Trying again with a shorter answer"; render(); r = await ai(sysTxt, text + "\n\nYour last answer was cut off or was not valid JSON. Answer again with SHORTER JSON: at most 14 categories, 'areas' under 25 words each, notes under 15 words, no long lists.", null, true); if (op !== V.opId) return; if (!r.ok) throw new Error(r.error); j = parseJson(r.text); }
      if (!j) throw new Error("The AI's answer wasn't readable (" + String(r.text || "").slice(0, 80).replace(/\s+/g, " ") + ") - press 'Let the AI read the scope' again.");
      const arr = x => Array.isArray(x) ? x.map(String) : [];
      {
        const cats = (Array.isArray(j.categories) ? j.categories : []).filter(c => c && CN[c.key]);
        S.scope = { summary: j.summary || "", categories: cats, items: cats.filter(c => c.included !== false).map(c => ({ area: CN[c.key], work: c.areas || "", detail: [c.tile_spec || c.paint_system || c.spec, c.count != null && c.count !== "" ? "count " + c.count : "", Number(c.coats) > 0 ? c.coats + " coats" : "", Array.isArray(c.tile_size_mm) && c.tile_size_mm.length > 1 ? c.tile_size_mm[0] + " x " + c.tile_size_mm[1] + " mm" : "", c.wall_height_m ? "height " + c.wall_height_m + " m" : "", c.notes].filter(Boolean).join(", ") })), exclusions: arr(j.exclusions), assumptions: arr(j.assumptions), questions: arr(j.questions), door_size_m: Array.isArray(j.door_size_m) && Number(j.door_size_m[0]) > 0 && Number(j.door_size_m[1]) > 0 ? [Number(j.door_size_m[0]), Number(j.door_size_m[1])] : null };
        if (S.scope.door_size_m) S.scope.items.push({ area: "Door size", work: S.scope.door_size_m[0] + " w x " + S.scope.door_size_m[1] + " h m", detail: "used for the opening deductions" });
      }
      S.chat.push({ who: "AI", text: j.reply || "Here is what I understood." }); S.confirmed = false;
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; save(); render();
  }

  /* ---------- step 2: drawing ---------- */
  /* ---- the 2x2 zoom cuts rooms that cross a part's edge into pieces: same room name + overlapping pieces = one room again ---- */
  function joinSplitRooms(rooms, d) {
    const nm = r => String(r.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const box = p => [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
    const used = [], res = [];
    rooms.forEach((r, i) => {
      if (used[i] || !Array.isArray(r.polygon) || r.polygon.length < 3) { if (!used[i]) res.push(r); return; }
      const g = [r]; used[i] = true; let b = box(r.polygon);
      for (let grew = true; grew;) {
        grew = false;
        rooms.forEach((o, j) => {
          if (used[j] || !Array.isArray(o.polygon) || o.polygon.length < 3) return;
          const a = nm(r), c = nm(o); if (!a || !c || (a.indexOf(c) < 0 && c.indexOf(a) < 0)) return;
          const bj = box(o.polygon); if (!(bj[0] < b[2] && bj[2] > b[0] && bj[1] < b[3] && bj[3] > b[1])) return;
          g.push(o); used[j] = true; b = [Math.min(b[0], bj[0]), Math.min(b[1], bj[1]), Math.max(b[2], bj[2]), Math.max(b[3], bj[3])]; grew = true;
        });
      }
      if (g.length === 1) { res.push(r); return; }
      const poly = unionPolys(g.map(x => x.polygon), b, d.W || 1000, d.H || 1000), base = g.slice().sort((x, y) => String(y.name || "").length - String(x.name || "").length)[0];
      const cats = []; g.forEach(x => (x.categories || []).forEach(c => { if (cats.indexOf(c) < 0) cats.push(c); }));
      const mx = f => Math.max(0, ...g.map(x => Number(x[f]) || 0));
      res.push(Object.assign({}, base, { polygon: poly || base.polygon, categories: cats, door_count: mx("door_count"), window_count: mx("window_count"), door_openings_m: mx("door_openings_m"), printed_area_m2: mx("printed_area_m2"), notes: ((base.notes || "") + " (joined from " + g.length + " zoomed parts)").trim() }));
    });
    return res;
  }
  /* union of polygons (fractions of the page) by filling them on a grid and walking the outside edge; null if it fails */
  function unionPolys(polys, b, W, H) {
    try {
      const bw = (b[2] - b[0]) * W, bh = (b[3] - b[1]) * H, cell = Math.max(bw, bh) / 320; if (!(cell > 0)) return null;
      const gw = Math.ceil(bw / cell) + 2, gh = Math.ceil(bh / cell) + 2, cv = document.createElement("canvas"); cv.width = gw; cv.height = gh;
      const c = cv.getContext("2d"), X = x => (x - b[0]) * W / cell + 1, Y = y => (y - b[1]) * H / cell + 1;
      c.fillStyle = "#000"; polys.forEach(p => { c.beginPath(); p.forEach((q, k) => k ? c.lineTo(X(q[0]), Y(q[1])) : c.moveTo(X(q[0]), Y(q[1]))); c.closePath(); c.fill(); });
      const px = c.getImageData(0, 0, gw, gh).data, on = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && px[(y * gw + x) * 4 + 3] > 127;
      const loop = traceGrid(on, gw, gh); if (!loop || loop.length < 4) return null;
      const simp = simplifyLoop(loop, 1.2); if (simp.length < 3) return null;
      return simp.map(v => [b[0] + (v[0] - 1) * cell / W, b[1] + (v[1] - 1) * cell / H]);
    } catch (e) { return null; }
  }
  /* outer boundary of the filled cells, as the corner points of the cell edges (clockwise, filled side on the right) */
  function traceGrid(on, gw, gh) {
    const nx = {}, add = (a, b2) => { (nx[a] || (nx[a] = [])).push(b2); };
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x + "," + y, (x + 1) + "," + y);
      if (!on(x + 1, y)) add((x + 1) + "," + y, (x + 1) + "," + (y + 1));
      if (!on(x, y + 1)) add((x + 1) + "," + (y + 1), x + "," + (y + 1));
      if (!on(x - 1, y)) add(x + "," + (y + 1), x + "," + y);
    }
    let best = null;
    Object.keys(nx).forEach(st => {
      if (!nx[st] || !nx[st].length) return;
      const pts = []; let cur = st, guard = 0;
      while (nx[cur] && nx[cur].length && guard++ < 1e6) { pts.push(cur.split(",").map(Number)); cur = nx[cur].shift(); if (cur === st) break; }
      if (!best || pts.length > best.length) best = pts;
    });
    return best;
  }
  function simplifyLoop(pts, eps) {
    const dp = (a, lo, hi, keep) => {
      let md = 0, mi = -1; const A = a[lo], B = a[hi], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
      for (let i = lo + 1; i < hi; i++) { const d2 = Math.abs(dy * a[i][0] - dx * a[i][1] + B[0] * A[1] - B[1] * A[0]) / L; if (d2 > md) { md = d2; mi = i; } }
      if (md > eps && mi > 0) { dp(a, lo, mi, keep); keep.push(a[mi]); dp(a, mi, hi, keep); }
    };
    let far = 0, fd = -1; pts.forEach((q, i) => { const d2 = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (d2 > fd) { fd = d2; far = i; } });
    const a1 = pts.slice(0, far + 1), a2 = pts.slice(far).concat([pts[0]]), k1 = [a1[0]], k2 = [a2[0]];
    dp(a1, 0, a1.length - 1, k1); dp(a2, 0, a2.length - 1, k2);
    return k1.concat(k2);
  }
  /* which pages need a mark-up, from the PDF's own text (title blocks + drawing register) - no AI; scanned sets fall back to the AI index */
  async function pickSheets(file, op) {
    if (!window.SFSheetPick) return;
    try {
      V.sub = "Reading the title blocks"; render();
      const base = new URL("../lib/pdfjs/", location.href).href;
      for (const f of ["pdf.classic.js", "pdf.worker.classic.js"]) if (!(f === "pdf.classic.js" ? window.pdfjsLib : window.pdfjsWorker)) await new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = base + f; sc.onload = ok; sc.onerror = () => no(new Error("couldn't load " + f)); document.head.appendChild(sc); });
      const pdfjs = window.pdfjsLib;   // ordinary scripts, reader runs on the page (no module / worker files for the phone to refuse)
      const pages = await SFSheetPick.extract(pdfjs, new Uint8Array(await file.arrayBuffer()), (n, t) => { if (op === V.opId && n % 5 === 0) { V.sub = "Reading the title blocks - page " + n + " of " + t; render(); } });
      if (op !== V.opId || !V.draw) return;
      if (!pages.some(p => p.items.length)) return;   // a scanned set: no text to read
      const r = SFSheetPick.classify(pages, SFSheetPick.scopeWords(S.scope)), idx = {};
      r.pages.forEach(o => { idx[o.page - 1] = { title: ((o.no ? o.no + " " : "") + o.title).slice(0, 70), type: o.kind === "plan" ? "floor_plan" : o.kind === "enlarged" ? "enlarged_plan" : o.kind, no: o.no, rev: o.rev || "", pick: o.pick, why: o.why, txt: 1 }; });
      V.draw.index = idx;
      const c = k => r.pages.filter(o => o.kind === k).length, n = r.pages.filter(o => o.pick).length;
      V.note = "Read the title blocks" + (r.register ? " and the drawing register" : "") + ": " + n + " page" + (n === 1 ? "" : "s") + " to mark up" + (c("data") ? ", " + c("data") + " with sizes / heights only" : "") + (c("blank") ? ", " + c("blank") + " blank" : "") + ", the rest skipped. Check the ticks under step 4.";
    } catch (e) { V.note = "Couldn't read the title blocks (" + (e.message || e) + ") - the AI will sort the pages instead."; }
  }
  async function addDrawing(file) {
    V.err = ""; const op = begin("Opening the drawing", "Reading the pages"); render();
    try {
      if (isPdf(file)) {
        const key = newKey(); await sendPdf(key, file); const r = await pdfPage(key, 0, 1800);
        V.draw = { name: file.name, key, count: r.count, page: 0, src: r.dataUrl, thumbs: [], ptW: r.ptW || 0 };
        const im = await shrink(r.dataUrl, 1800); V.draw.W = im.W; V.draw.H = im.H; V.draw.src = im.src;
        loadThumbs(key, r.count);
        if (trade === "tiling" && r.count > 1) await pickSheets(file, op);
      } else if (/^image\//.test(file.type)) {
        const im = await shrink(await readUrl(file), 1800); V.draw = { name: file.name, key: "", count: 1, page: 0, src: im.src, W: im.W, H: im.H, thumbs: [] };
      } else throw new Error("Attach the drawing as a PDF or a picture.");
      S.marks = []; S.mpp = null; S.mppNote = ""; S.mode = "attach"; V.sel = -1; S.sheets = {}; S.curPage = 0;
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; save(); render();
  }
  async function loadThumbs(key, count) {
    for (let i = 0; i < Math.min(count, 200); i++) {
      if (!V.draw || V.draw.key !== key) return;
      try { const r = await pdfPage(key, i, 150); V.draw.thumbs[i] = r.dataUrl; render(); } catch (e) { return; }
    }
  }
  async function pickPage(i) {
    if (!V.draw || !V.draw.key || i === V.draw.page) return;
    const op = begin("Opening page " + (i + 1)); render();
    try { save(); const r = await pdfPage(V.draw.key, i, 1800), im = await shrink(r.dataUrl, 1800); Object.assign(V.draw, { page: i, src: im.src, W: im.W, H: im.H, ptW: r.ptW || V.draw.ptW }); const sh = (S.sheets || {})[i]; if (sh) { S.marks = sh.marks || []; S.mpp = sh.mpp; S.mppNote = sh.mppNote || ""; } else { S.marks = []; S.mpp = null; S.mppNote = ""; } V.sel = -1; V.hint = ""; save(); }
    catch (e) { V.err = e.message; }
    if (op !== V.opId) return; V.busy = ""; render();
  }

  /* ---------- step 4: markup ---------- */
  /* the scale: a printed dimension the AI measured, else the drawing scale (1:100) on the real size of the PDF page */
  function setScale(j, d) {
    if (S.mppNote === "Set by you") return;
    const c = j.calibration;
    if (c && Array.isArray(c.p1) && Array.isArray(c.p2) && Number(c.metres) > 0) { const px = Math.hypot((c.p2[0] - c.p1[0]) * d.W, (c.p2[1] - c.p1[1]) * d.H); if (px > 5) { S.mpp = Number(c.metres) / px; S.mppNote = "AI estimate from " + (c.source || "a dimension") + " - check it"; return; } }
    const r = Number(j.scale_ratio);
    if (r >= 5 && r <= 5000 && d.ptW > 0) { S.mpp = (d.ptW / 72 * 0.0254) / d.W * r; S.mppNote = "from the drawing scale 1:" + r + " and the PDF page size - check it against a known length"; }
  }
  const SHEET = { A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297 };
  /* reads the scale from the title block (ratio + sheet size) or a printed dimension; false when stopped */
  async function readScale() {
    const d = V.draw, op = begin("Reading the scale from the title block", "Looking for the drawing scale and sheet size"); render();
    try {
      const sys = "You read architectural drawing sheets. Look at the TITLE BLOCK (usually bottom or right edge), scale bars, and printed dimensions. Reply with ONE JSON object only.";
      const shape = '{"scale_ratio":0,"sheet":"A1","scale_text":"as printed","dimension":{"p1":[x,y],"p2":[x,y],"metres":0,"text":"the printed dimension"} or null}';
      const txt = "Image " + d.W + " x " + d.H + " px (page " + (d.page + 1) + " of " + d.count + "). 1) scale_ratio = the drawing scale of THIS sheet's main plan (1:100 -> 100, 1:50 -> 50; if several, the one for the floor plan; 0 if none printed). 2) sheet = the sheet size printed in the title block or scale note (A0, A1, A2, A3 or A4), or \"\" if not printed. 3) dimension = one clear printed dimension line on the plan with both end points as fractions of the image and its real length in metres (convert mm to metres), or null. Coordinates are fractions (x right, y down).\nReturn:\n" + shape;
      const r = await ai(sys + "\n\n" + playbook(2, SCALE_STEPS), txt, d.src, true);
      if (op !== V.opId) return false;
      const j = r.ok ? parseJson(r.text) : null;
      if (j) {
        const c = j.dimension;
        if (c && Array.isArray(c.p1) && Array.isArray(c.p2) && Number(c.metres) > 0) { const px = Math.hypot((c.p2[0] - c.p1[0]) * d.W, (c.p2[1] - c.p1[1]) * d.H); if (px > 5) { S.mpp = Number(c.metres) / px; S.mppNote = "from the printed dimension " + (c.text || "") + " - check it"; } }
        const ratio = Number(j.scale_ratio), sh = SHEET[String(j.sheet || "").toUpperCase().replace(/[^A0-4]/g, "").slice(0, 2)];
        if (!S.mpp && ratio >= 5 && ratio <= 5000) {
          const longPx = Math.max(d.W, d.H), paperMm = sh || (d.ptW ? Math.max(d.ptW, d.ptH || 0) / 72 * 25.4 : 0);
          if (paperMm) { S.mpp = paperMm / longPx * ratio / 1000; S.mppNote = "title block scale 1:" + ratio + (sh ? " on " + String(j.sheet).toUpperCase() : " on the PDF page size") + " - check it"; }
        }
      }
    } catch (e) { }
    if (op !== V.opId) return false; V.busy = ""; save(); return true;
  }
  const WANT = { tiling: ["floor_plan", "finishes_plan", "enlarged_plan"], painting: ["floor_plan", "finishes_plan", "enlarged_plan", "elevation"], electrical: ["floor_plan", "ceiling_plan", "enlarged_plan", "site_plan"] };
  function nextPage() {
    const d = V.draw, tried = V.tried || {};
    if (!d.index) { const n = d.page + 1; return n < d.count && !tried[n] ? n : null; }
    const byText = Object.keys(d.index).some(i => d.index[i].txt);
    const ok = i => !tried[i] && (byText ? !!(d.index[i] && d.index[i].pick) : (!d.index[i] || (WANT[trade].indexOf(d.index[i].type) >= 0 && !d.index[i].old)));
    for (let i = d.page + 1; i < d.count; i++) if (ok(i)) return i;
    if (!V.all) for (let i = 0; i < d.page; i++) if (ok(i)) return i;
    return null;
  }
  /* sorts the whole drawing set (cover, schedules, plans, details ...) from small pictures of the pages, 12 at a time */
  async function buildIndex() {
    const d = V.draw, n = d.count, idx = {}, op = begin("Looking through the drawing set", "Sorting the " + n + " pages into plans, details and schedules"); render();
    const sys = "You sort the sheets of an architectural drawing set. Reply with ONE JSON object and nothing else.";
    try {
      for (let a = 0; a < n; a += 12) {
        if (op !== V.opId) return;
        const hi = Math.min(n, a + 12); V.sub = "Pages " + (a + 1) + " to " + hi + " of " + n; render();
        const cells = []; for (let i = a; i < hi; i++) { if (op !== V.opId) return; const r = await pdfPage(d.key, i, 520); cells.push({ i: i, im: await loadImg(r.dataUrl) }); }
        const cw = 520, ch = 390, cv = document.createElement("canvas"); cv.width = cw * 4; cv.height = ch * 3; const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height);
        cells.forEach((x, k) => { const ox = (k % 4) * cw, oy = Math.floor(k / 4) * ch, f = Math.min((cw - 8) / x.im.naturalWidth, (ch - 8) / x.im.naturalHeight); c.drawImage(x.im, ox + 4, oy + 4, x.im.naturalWidth * f, x.im.naturalHeight * f); c.strokeStyle = "#999"; c.strokeRect(ox + 1, oy + 1, cw - 2, ch - 2); c.fillStyle = "#d00"; c.font = "bold 34px sans-serif"; c.fillText("P" + (x.i + 1), ox + 8, oy + 36); });
        const txt = "This picture is a contact sheet: each cell is one sheet of the drawing set, labelled P<number> in red (the PDF page number). For EVERY labelled cell give the sheet title if you can read it (else a short description), the drawing number and revision from the title block when readable (else empty), and its type. Types: cover, schedule (drawing list, legend, notes, specification), site_plan, floor_plan (the NEW-work floor plan / general arrangement or finishes plan with rooms and room names), finishes_plan, enlarged_plan (enlarged bathroom / wet-area / toilet / kitchen plans), ceiling_plan, elevation, section, detail, other (demolition, existing, fire / evacuation, set-out, structural, services, furniture, landscape plans and anything else). Be strict: a demolition or existing-conditions plan is other.\nReturn: {\"pages\":[{\"page\":1,\"title\":\"\",\"number\":\"\",\"rev\":\"\",\"type\":\"floor_plan\"}]}";
        const r = await ai(sys, txt, cv.toDataURL("image/jpeg", 0.8), true); if (op !== V.opId) return;
        const j = r.ok ? parseJson(r.text) : null;
        (j && Array.isArray(j.pages) ? j.pages : []).forEach(p => { const i = Number(p && p.page) - 1; if (i >= a && i < hi) idx[i] = { title: String(p.title || "").slice(0, 60), type: String(p.type || "other"), no: String(p.number || "").toUpperCase().replace(/\s+/g, ""), rev: String(p.rev || "").toUpperCase().trim() }; });
      }
      const best = {}, rk = r => /^\d+$/.test(r) ? 100 + Number(r) : r ? r.charCodeAt(0) : 0;   // latest revision wins
      Object.keys(idx).forEach(i => { const x = idx[i]; if (!x.no) return; if (!(x.no in best) || rk(x.rev) > rk(idx[best[x.no]].rev)) best[x.no] = i; });
      Object.keys(idx).forEach(i => { const x = idx[i]; if (x.no && String(best[x.no]) !== String(i)) x.old = true; });
      Object.keys(S.sheets || {}).forEach(i => { if (idx[i]) { S.sheets[i].type = idx[i].type; S.sheets[i].title = idx[i].title; } });
      d.index = idx; const cnt = {}; Object.keys(idx).forEach(i => { cnt[idx[i].type] = (cnt[idx[i].type] || 0) + 1; });
      V.note = "Sorted the drawing set: " + Object.keys(cnt).map(k => cnt[k] + " " + k.replace(/_/g, " ")).join(", ") + ".";
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; V.sub = ""; render();
  }
  async function markUp(auto, all) {
    if (!auto) { V.scan = 0; V.scanLog = []; V.tried = {}; V.all = !!all; V.runT0 = V.hold && V.runT0 ? V.runT0 : Date.now(); }
    V.hold = !!V.all;
    if (V.draw) (V.tried = V.tried || {})[V.draw.page] = 1;
    if (!S.mpp && !V.all && !(await readScale())) { V.hold = false; return; }
    if (trade === "tiling") await markUpTiling(); else if (trade === "painting") await markUpPainting(); else await markUpElectrical();
    if (V.err || !V.all) { V.hold = false; render(); }
    if (trade === "tiling" && V.all && !V.err && !V.busy && S.marks.length && !S.mpp) { if (!(await readScale())) return; save(); render(); }
    if (trade === "tiling" && V.all && !V.err && !V.busy && V.draw && V.draw.key && V.draw.count > 1) {   // whole drawing set: every plan page in turn
      if (!V.draw.index) { await buildIndex(); if (V.err || !V.all) return; }
      (V.scanLog = V.scanLog || []).push("p" + (V.draw.page + 1) + (S.marks.length ? " " + S.marks.length + " mark" + (S.marks.length === 1 ? "" : "s") : " none"));
      const nxt = V.scan < 80 ? nextPage() : null;
      if (nxt == null) { V.all = false; V.hold = false; save(); V.note = "Marked up the chosen pages (" + V.scanLog.join(", ") + "). The totals below cover them all - check each page from the page strip (green = has marks)."; render(); return; }
      V.scan++; await pickPage(nxt); if (V.err) { V.hold = false; render(); return; }
      V.note = "Marking up all plan pages - done: " + V.scanLog.join(", ") + ". Now page " + (nxt + 1) + " of " + V.draw.count + ". Press Stop to end early (pages done so far are kept).";
      return markUp(true);
    }
    if (!S.marks.length && !V.err && !V.busy && V.scan < 25 && V.draw && V.draw.key) {   // nothing for this scope on this page: go to the next page that could hold it
      if (V.draw.count > 4 && !V.draw.index) { await buildIndex(); if (V.err || V.scan >= 25) return; }
      const nxt = nextPage(); if (nxt == null) { V.note = "Checked " + (V.scanLog || []).length + " page(s) and found nothing to mark for this scope. Pick the plan page yourself from the page strip, then press Mark up."; render(); return; }
      V.scan++; const was = V.draw.page + 1, hint = V.hint; (V.scanLog = V.scanLog || []).push("Page " + was + ": " + String(hint || "nothing for this scope").slice(0, 110)); await pickPage(nxt);
      if (V.err) return; const ix = V.draw.index && V.draw.index[nxt]; V.note = "Checked so far (nothing to mark): " + V.scanLog.join(" | ") + " - now trying page " + (nxt + 1) + " of " + V.draw.count + (ix ? " (" + ix.title + ")" : "") + ". Press Stop to choose a page yourself from the page strip."; return markUp(true);
    }
    if (!S.mpp && S.marks.length && !V.busy) { V.tool = "cal"; V.calPts = []; V.note = "I couldn't find the scale on this page. Tap the two ends of a dimension you know (a dimensioned wall or a scale bar), type its length in metres and press Apply - then areas and lengths will be measured."; render(); }
  }
  async function markUpElectrical() {
    V.err = ""; const op = begin("AI is marking up page " + ((V.draw && V.draw.page || 0) + 1) + (V.draw && V.draw.count > 1 ? " of " + V.draw.count : ""), "This can take a minute"); render();
    try {
      const cats = ((S.scope && S.scope.categories) || []).filter(c => c.included !== false), d = V.draw;
      const keys = (cats.length ? cats.map(c => c.key) : Object.keys(ECN)).filter(k => ECN[k]), isLm = k => typeInfo(k)[2] === "line";
      const sys = "You are the senior electrical estimator inside ShopMate AI. You study one page of an electrical layout (power / lighting / data plan) and find every point and cable run in the CONFIRMED SCOPE, so it can be counted and priced. Be conservative: never invent a point, skip anything you cannot locate, and say so in page_notes. Reply with ONE JSON object and nothing else. WORK IN THIS ORDER: (1) READ THE LEGEND / SYMBOL KEY on the sheet first - it says which symbol is which item. (2) COUNT: put one entry in 'counts' for EVERY symbol, at the symbol, with its category key. A double symbol is one double power point, not two. (3) CABLE RUNS: only where a sub-main, conduit, tray or trench route is drawn, put it in 'linear' with its points along the route. If the page is not an electrical layout (architectural plan, elevation, detail, schedule) return empty lists and explain.\n" + baseSys();
      const shape = '{"legend":[{"symbol":"description of the symbol","meaning":"what the legend says","category":"el_gpo_double"}],"linear":[{"category":"el_cable","name":"","points":[[x,y],...],"confidence":0.7}],"counts":[{"category":"el_gpo_double","name":"double power point","point":[x,y],"room":"room name as printed"}],"rooms":[{"name":"KITCHEN","area_m2":0}],"page_notes":"","scale_ratio":0,"calibration":{"p1":[x,y],"p2":[x,y],"metres":0,"source":"which printed dimension or scale bar"} or null}';
      const txt = "CONFIRMED SCOPE (JSON):\n" + JSON.stringify(cats.length ? cats : S.scope) + "\n\nPAGE " + (d.page + 1) + " of " + d.count + ". Full-size image " + d.W + " x " + d.H + " px.\n\nTASK: read the legend / symbol key, then put ONE entry in counts for EVERY electrical symbol on THIS page, at the centre of the symbol. Give the room name printed on the plan for every count (room). In rooms, list each room name with its area in m2 ONLY where the area is printed on the sheet, else 0. Counted items (category keys): " + keys.filter(k => !isLm(k)).join(", ") + ".\nCable runs, along the route, only where the route is drawn: " + keys.filter(isLm).join(", ") + ".\nCoordinates are fractions of the image (x to the right, y downward). If the page is not an electrical layout return empty lists and say why in page_notes. Give calibration only if you can read a printed dimension line or scale bar clearly. Also give scale_ratio: the number from the drawing scale written on the sheet (1:100 -> 100, 1:50 -> 50), or 0 if none is printed.\nReturn JSON only:\n" + shape;
      const r = await askTiled(sys + "\n\n" + playbook(3, MARK_STEPS[trade]), txt, d, checkCounts);
      if (op !== V.opId) return; if (!r.ok) throw new Error(r.error);
      const j = parseJson(r.text); if (!j) throw new Error("The AI's markup wasn't readable - try again.");
      const marks = [], odd = {};
      (Array.isArray(j.counts) ? j.counts : []).forEach(c => { if (keys.indexOf(c.category) < 0 || isLm(c.category)) { if (c.category) odd[c.category] = 1; return; } const mk = cleanMark({ type: c.category, label: c.name || ECN[c.category], pts: [c.point], note: c.room }, "ai"); if (mk) marks.push(mk); });
      (Array.isArray(j.linear) ? j.linear : []).forEach(l => { if (keys.indexOf(l.category) < 0 || !isLm(l.category)) { if (l.category) odd[l.category] = 1; return; } const mk = cleanMark({ type: l.category, label: l.name || ECN[l.category], pts: l.points }, "ai"); if (mk) marks.push(mk); });
      S.marks = marks; S.rooms = (Array.isArray(j.rooms) ? j.rooms : []).map(r => ({ n: String((r && r.name) || "").slice(0, 40), a: Number(r && r.area_m2) || 0 })).filter(r => r.n);
      const lg = (Array.isArray(j.legend) ? j.legend : []).filter(x => x && x.meaning).slice(0, 12).map(x => x.symbol + " = " + x.meaning).join("; ");
      V.hint = [j.page_notes, lg ? "Legend read: " + lg : "", Object.keys(odd).length ? "Ignored (not in the scope): " + Object.keys(odd).join(", ") : ""].filter(Boolean).join(" ");
      setScale(j, d);
      if (!marks.length) V.hint = V.hint || "The AI didn't find anything to mark for this scope on this page.";
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; save(); render(); if (!V.err && S.marks.length) sendToEstimate(true);
  }
  async function markUpTiling() {
    V.err = ""; const op = begin("AI is marking up page " + ((V.draw && V.draw.page || 0) + 1) + (V.draw && V.draw.count > 1 ? " of " + V.draw.count : ""), "This can take a minute"); render();
    try {
      const cats = ((S.scope && S.scope.categories) || []).filter(c => c.included !== false), d = V.draw;
      const allowed = ROOM_CATS.concat(["movement_joints", "falls_drains", "niche_count", "splashback"]), keys = (cats.length ? cats.map(c => c.key) : ROOM_CATS).filter(k => allowed.indexOf(k) >= 0);
      const sys = "You are the senior tiling estimator inside ShopMate AI. You study one page of an architectural drawing and locate every area that needs the tiling work described in the CONFIRMED SCOPE, so it can be measured. Be conservative: never invent rooms, skip anything you cannot locate, and say so in page_notes. Reply with ONE JSON object and nothing else.\n" + baseSys();
      const shape = '{"rooms":[{"name":"BATH 1","type":"bathroom","polygon":[[x,y],...],"categories":["wet_area_floor","wall_tile"],"door_count":1,"door_openings_m":0,"door_height_m":0,"window_count":0,"window_width_m":0,"window_sill_m":0,"window_head_m":0,"wall_tile_height_m":2.4,"copies":1,"printed_area_m2":0,"confidence":0.8,"notes":""}],"linear":[{"category":"movement_joints","name":"","points":[[x,y],...],"confidence":0.7}],"counts":[{"category":"falls_drains","name":"floor waste","point":[x,y]}],"page_notes":"","scale_ratio":0,"calibration":{"p1":[x,y],"p2":[x,y],"metres":0,"source":"which printed dimension or scale bar"} or null}';
      const txt = "CONFIRMED SCOPE (JSON):\n" + JSON.stringify(cats.length ? cats : S.scope) + "\n\nPAGE " + (d.page + 1) + " of " + d.count + ". Full-size image " + d.W + " x " + d.H + " px.\n\nTASK: find every room / area on THIS page that needs work listed in the scope. If the page is not a plan (legend, schedule, detail, elevation) return empty lists and explain in page_notes. If the sheet mixes a plan view with elevations / sections, outline rooms ONLY on the plan view - never an elevation or section box. Coordinates are fractions of the image (x to the right, y downward). Follow the INSIDE face of the walls with 4-12 points, in order. Skip external areas unless the scope has external paving; skip plant/service voids, risers and rooms the scope excludes. Doors: door_count is the number of door openings in the room's walls (every break in the wall line with a door leaf, a swing or a door tag, sliding doors included; cupboard doors inside the room are not door openings). door_openings_m is the total width of the room's door openings ONLY when the drawing or the scope gives it (a dimension, a door schedule, a tag with a size); otherwise 0 - never guess a door size. window_count is the number of windows in its walls (thin parallel lines in a wall). door_height_m, window_width_m, window_sill_m (floor to the bottom of the window) and window_head_m (floor to the top) come from the door / window schedule, the tags, a dimension or the scope - otherwise 0, never guessed. wall_tile_height_m only if the scope or drawing states it. copies = how many identical rooms this outline stands for (the plan says TYPICAL x 6, or this typical floor plan is used for several levels) - 1 when not stated. printed_area_m2 = the floor area printed inside the room (e.g. 5,27 sq m = 5.27), else 0. Splashbacks go in linear (category splashback, along the bench), never as a room category. Allowed category keys: " + keys.join(", ") + ". Give calibration only if you can read a printed dimension line or scale bar clearly. Also give scale_ratio: the number from the drawing scale written on the sheet (1:100 -> 100, 1:50 -> 50), or 0 if none is printed.\nReturn:\n" + shape;
      const r = await askTiled(sys + "\n\n" + playbook(3, MARK_STEPS[trade]), txt, d, checkRooms);
      if (op !== V.opId) return; if (!r.ok) throw new Error(r.error);
      const j = parseJson(r.text); if (!j) throw new Error("The AI's markup wasn't readable - try again.");
      const marks = [], dry = [];
      (Array.isArray(j.rooms) ? j.rooms : []).forEach(rm => {
        const name = String(rm.name || "Room"); let rc = (Array.isArray(rm.categories) ? rm.categories : []).filter(c => ROOM_CATS.indexOf(c) >= 0 && keys.indexOf(c) >= 0);
        if (wetness(name) === "dry") rc = rc.filter(c => WET_CATS.indexOf(c) < 0);
        if (!rc.length) { dry.push(name); return; }
        const dn = rm.door_count == null ? null : Math.max(0, Math.round(Number(rm.door_count) || 0)), tot = Number(rm.door_openings_m) || 0;
        const mk = cleanMark({ type: "room", label: name, pts: rm.polygon, cats: rc, cp: rm.copies, pa: rm.printed_area_m2, dn: dn, dw: dn > 0 && tot > 0 ? tot / dn : 0, dh: rm.door_height_m, wn: rm.window_count, ww: rm.window_width_m, ws: rm.window_sill_m, wh: rm.window_head_m, h: rm.wall_tile_height_m, note: rm.notes }, "ai"); if (mk) marks.push(mk);
      });
      (Array.isArray(j.linear) ? j.linear : []).forEach(l => { if (T.types.some(t => t[0] === l.category && t[2] === "line")) { const mk = cleanMark({ type: l.category, label: l.name || TCATS[l.category], pts: l.points }, "ai"); if (mk) marks.push(mk); } });
      (Array.isArray(j.counts) ? j.counts : []).forEach(c => { if (T.types.some(t => t[0] === c.category && t[2] === "pt")) { const mk = cleanMark({ type: c.category, label: c.name || TCATS[c.category], pts: [c.point] }, "ai"); if (mk) marks.push(mk); } });
      S.marks = marks;
      V.hint = [j.page_notes, dry.length ? "Left out (not a wet area or nothing in scope): " + dry.join(", ") : ""].filter(Boolean).join(" ");
      setScale(j, d);
      if (!marks.length) V.hint = V.hint || "The AI didn't find anything to mark for this scope on this page.";
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; save(); render(); if (!V.err && S.marks.length) sendToEstimate(true);
  }
  async function markUpPainting() {
    V.err = ""; const op = begin("AI is marking up page " + ((V.draw && V.draw.page || 0) + 1) + (V.draw && V.draw.count > 1 ? " of " + V.draw.count : ""), "This can take a minute"); render();
    try {
      const cats = ((S.scope && S.scope.categories) || []).filter(c => c.included !== false), d = V.draw;
      const EXTRA = ["extwall", "ext", "stair_item", "balustrade_item", "handrail_item", "fence_item", "deck_item", "pergola_item", "post_item", "roof_area"], inside = PROOM.filter(k => !cats.length || cats.some(c => c.key === k)), extKeys = EXTRA.filter(k => !cats.length ? k === "extwall" || k === "ext" : cats.some(c => c.key === k)), ext = extKeys.length > 0;
      const sys = "You are the senior painting estimator inside ShopMate AI. You study one page of an architectural drawing and locate every room and exterior surface that needs the painting described in the CONFIRMED SCOPE, so it can be measured. Be conservative: never invent rooms, skip anything you cannot locate, and say so in page_notes. Reply with ONE JSON object and nothing else.\n" + baseSys();
      const shape = '{"rooms":[{"name":"BED 1","polygon":[[x,y],...],"categories":["ceiling","walls"],"door_count":1,"door_openings_m":0,"door_style":"flush","window_count":1,"window_material":"aluminium","wall_height_m":2.4,"tiled_to_m":0,"copies":1,"confidence":0.8,"notes":""}],"exterior":[{"category":"extwall","name":"North wall","points":[[x,y],[x,y]],"height_m":0,"sides":2,"pitch_deg":0}],"page_notes":"","scale_ratio":0,"calibration":{"p1":[x,y],"p2":[x,y],"metres":0,"source":"which printed dimension or scale bar"} or null}';
      const txt = "CONFIRMED SCOPE (JSON):\n" + JSON.stringify(cats.length ? cats : S.scope) + "\n\nPAGE " + (d.page + 1) + " of " + d.count + ". Full-size image " + d.W + " x " + d.H + " px.\n\nTASK: find every room on THIS page that gets painting in the scope. Use FLOOR PLANS only (finishes plan, else the general arrangement); if the page is a set-out, slab, structural, services, furniture, ceiling-grid, landscape, legend, schedule, detail or elevation sheet return empty lists and explain in page_notes. If the title says the same floor repeats (LEVELS 2-4, typical floor) outline it once and put the number of repeats in copies. Coordinates are fractions of the image (x to the right, y downward). Follow the INSIDE face of the walls with 4-12 points, in order. Skip plant/service voids, risers and rooms the scope excludes. Doors: door_count is the number of door openings in the room's walls (every break in the wall line with a door leaf, a swing or a door tag; cupboard doors inside the room are not openings). door_style is the door type from the door schedule or legend (flush, panel, French, robe bi-fold, cavity slider, entry, barn, sliding glass, roller / pre-finished) or leave empty if not shown; window_material is timber or aluminium from the window schedule or legend, or leave empty if not shown. door_openings_m is the total width of the room's door openings ONLY when the drawing, a door schedule or the scope gives it; otherwise 0 - never guess a size. window_count is the number of windows in the room's walls. wall_height_m only if the scope or a section states it. tiled_to_m only if the room's walls are tiled (wet areas) - the paint starts above it. Allowed categories per room: " + inside.join(", ") + ". Exterior: " + (ext ? "mark ONLY these exterior / other items, only where the scope includes them and they are drawn: " + extKeys.join(", ") + " (extwall = line along an outside wall; ext, deck_item, pergola_item, roof_area = outlines; fence_item, balustrade_item, handrail_item = lines along them, with height_m and for fences sides; stair_item and post_item = one point each; roof_area needs pitch_deg when a pitch is printed)." : "leave empty - the scope has no exterior or other items.") + " Give calibration only if you can read a printed dimension line or scale bar clearly. Also give scale_ratio: the number from the drawing scale written on the sheet (1:100 -> 100, 1:50 -> 50), or 0 if none is printed.\nReturn:\n" + shape;
      const r = await askTiled(sys + "\n\n" + playbook(3, MARK_STEPS[trade]), txt, d, checkRooms);
      if (op !== V.opId) return; if (!r.ok) throw new Error(r.error);
      const j = parseJson(r.text); if (!j) throw new Error("The AI's markup wasn't readable - try again.");
      const marks = [], skip = [];
      (Array.isArray(j.rooms) ? j.rooms : []).forEach(rm => {
        const name = String(rm.name || "Room"), rc = (Array.isArray(rm.categories) ? rm.categories : []).filter(c => inside.indexOf(c) >= 0);
        if (!rc.length) { skip.push(name); return; }
        const dn = rm.door_count == null ? null : Math.max(0, Math.round(Number(rm.door_count) || 0)), tot = Number(rm.door_openings_m) || 0;
        const mk = cleanMark({ type: "room", label: name, pts: rm.polygon, cats: rc, dn: dn, dw: dn > 0 && tot > 0 ? tot / dn : 0, ds: rm.door_style, wm: rm.window_material, wn: rm.window_count, h: rm.wall_height_m, th: rm.tiled_to_m, cp: rm.copies, note: rm.notes }, "ai"); if (mk) marks.push(mk);
      });
      if (ext) (Array.isArray(j.exterior) ? j.exterior : []).forEach(e => { if (extKeys.indexOf(e.category) >= 0) { const pt = typeInfo(e.category)[2] === "pt", mk = cleanMark({ type: e.category, label: e.name || PCN[e.category], pts: pt ? [e.point || (e.points || [])[0]] : e.points, h: e.height_m, sd: e.sides, pitch: e.pitch_deg }, "ai"); if (mk) marks.push(mk); } });
      S.marks = marks;
      V.hint = [j.page_notes, skip.length ? "Left out (nothing in scope): " + skip.join(", ") : ""].filter(Boolean).join(" ");
      setScale(j, d);
      if (!marks.length) V.hint = V.hint || "The AI didn't find anything to mark for this scope on this page.";
    } catch (e) { V.err = e.message || String(e); }
    if (op !== V.opId) return; V.busy = ""; save(); render(); if (!V.err && S.marks.length) sendToEstimate(true);
  }
  function cleanMark(m, by) {
    if (!m || !Array.isArray(m.pts) || !m.pts.length) return null;
    const ti = T.types.find(t => t[0] === m.type) || T.types[T.types.length - 1];
    const pts = m.pts.map(p => [Math.min(1, Math.max(0, Number(p[0]) || 0)), Math.min(1, Math.max(0, Number(p[1]) || 0))]);
    const need = ti[2] === "poly" ? 3 : ti[2] === "line" ? 2 : 1;
    if (pts.length < need) return null;
    const o = { type: ti[0], label: String(m.label || ti[1]).slice(0, 40), pts: ti[2] === "pt" ? [pts[0]] : pts, qty: Number(m.qty) > 0 ? Number(m.qty) : 1, w: Number(m.w) || 0, h: Number(m.h) || 0, note: String(m.note || "").slice(0, 120), ded: m.ded !== false, by: by };
    if ((ti[4] || "").indexOf("R") >= 0) { o.th = Number(m.th) > 0 ? Number(m.th) : 0; o.ds = String(m.ds || "").slice(0, 40); o.wm = String(m.wm || "").slice(0, 40); o.cp = Number(m.cp) > 1 ? Math.round(Number(m.cp)) : 1; o.pa = Number(m.pa) > 0 ? Number(m.pa) : 0; o.dh = Number(m.dh) > 0 ? Number(m.dh) : 0; o.ws = Number(m.ws) > 0 ? Number(m.ws) : 0; o.wh = Number(m.wh) > 0 ? Number(m.wh) : 0; o.cats = (Array.isArray(m.cats) ? m.cats : []).filter(c => RC.indexOf(c) >= 0); o.dn = m.dn == null || m.dn === "" ? null : Math.max(0, Math.round(Number(m.dn) || 0)); o.dw = Number(m.dw) > 0 ? Number(m.dw) : 0; o.wn = Math.max(0, Math.round(Number(m.wn) || 0)); o.ww = Number(m.ww) > 0 ? Number(m.ww) : 0; }
    o.sd = Number(m.sd) > 0 ? Math.round(Number(m.sd)) : 0; o.pitch = Number(m.pitch) > 0 && Number(m.pitch) < 80 ? Number(m.pitch) : 0;
    return o;
  }
  const curCx = () => ({ W: V.draw ? V.draw.W : ((S.sheets || {})[S.curPage] || {}).W || 1, H: V.draw ? V.draw.H : ((S.sheets || {})[S.curPage] || {}).H || 1, mpp: S.mpp });
  function measure(m, cx) {
    cx = cx || curCx(); const ti = typeInfo(m.type), W = cx.W, H = cx.H, mpp = cx.mpp;
    if (ti[2] === "pt") return { v: m.qty || 1, u: "no" };
    if (!mpp) return { v: null, u: ti[3] };
    if (ti[2] === "line") { let l = 0; for (let i = 1; i < m.pts.length; i++) l += Math.hypot((m.pts[i][0] - m.pts[i - 1][0]) * W, (m.pts[i][1] - m.pts[i - 1][1]) * H); return { v: l * mpp, u: "lm" }; }
    let a = 0; for (let i = 0; i < m.pts.length; i++) { const p = m.pts[i], q = m.pts[(i + 1) % m.pts.length]; a += p[0] * W * q[1] * H - q[0] * W * p[1] * H; }
    return { v: Math.abs(a / 2) * mpp * mpp, u: "m2" };
  }
  const fmt = q => q.v == null ? "set scale" : (q.u === "no" ? q.v : q.v.toFixed(2)) + " " + (q.u === "no" ? "" : q.u);

  /* ---- Tiling engine: the desktop TilingAI measurement rules, room by room ---- */
  function inPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  }
  function polyPerim(m, cx) {
    cx = cx || curCx(); const W = cx.W, H = cx.H; let l = 0;
    for (let i = 0; i < m.pts.length; i++) { const p = m.pts[i], q = m.pts[(i + 1) % m.pts.length]; l += Math.hypot((q[0] - p[0]) * W, (q[1] - p[1]) * H); }
    return l * cx.mpp;
  }
  function scopeCat(key, room) {
    const hits = ((S.scope && S.scope.categories) || []).filter(c => c.key === key && c.included !== false);
    if (!hits.length) return null;
    const rl = String(room || "").toLowerCase();
    if (room && hits.length > 1) for (const c of hits) { const w = String(c.areas || "").toLowerCase().split(/[,;\/]+/).map(x => x.trim()).filter(Boolean); if (w.some(x => rl.indexOf(x) >= 0 || x.indexOf(rl) >= 0)) return c; }
    return hits.find(c => !String(c.areas || "").trim()) || hits[0];
  }
  const LIN = ["skirting_border", "border_feature_strip", "splashback", "movement_joints"];
  const rnorm = n => String(n || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  /* every marked page of the drawing set, each with its own size and scale */
  function tilingSheets() {
    const cur = V.draw ? V.draw.page : (S.curPage || 0), sh = S.sheets || {}, cs = sh[cur] || {}, ix = V.draw && V.draw.index;
    const list = [{ page: cur, marks: S.marks, cx: curCx(), type: (ix && ix[cur] ? ix[cur].type : cs.type) || "", cur: true }];
    Object.keys(sh).forEach(k => { const p = Number(k), x = sh[k]; if (p === cur || !x || !(x.marks || []).length) return; list.push({ page: p, marks: x.marks, cx: { W: x.W || 1, H: x.H || 1, mpp: x.mpp }, type: (ix && ix[p] ? ix[p].type : x.type) || "", cur: false }); });
    return list.filter(x => x.marks.length);
  }
  function tilingCalc() {
    const rows = {}, links = {}, rded = {}, R = (k, u) => rows[k] || (rows[k] = { key: k, name: TCATS[k] || k, u: u || (LIN.indexOf(k) >= 0 ? "lm" : "m2"), gross: 0, ded: 0, v: 0, n: 0, miss: false, det: "", extra: 0 });
    let assumed = 0, wpDefault = false, showerH = 0; const noH = [], warn = [], pages = [];
    const sheets = tilingSheets();
    /* a numbered room drawn on an enlarged plan is measured there, not again on the general plan */
    const enl = {}; sheets.forEach(sh => { if (sh.type === "enlarged_plan") sh.marks.forEach(m => { const k = rnorm(m.label); if (m.type === "room" && /[0-9]/.test(k)) enl[k] = sh.page + 1; }); });
    const generic = {};
    sheets.forEach(sh => {
      const cx = sh.cx, floors = []; let nRooms = 0;
      sh.marks.forEach((m, i) => {
        if (m.type !== "room") return;
        const L = t => { if (sh.cur) links[i] = t; }, key = rnorm(m.label);
        if (sh.type !== "enlarged_plan" && enl[key]) { L("measured on the enlarged plan (page " + enl[key] + ") - not counted again here"); return; }
        if (key && !/[0-9]/.test(key)) { const g = generic[key] || (generic[key] = {}); g[sh.type === "enlarged_plan" ? "e" : "f"] = sh.page + 1; }
        const q = measure(m, cx);
        if (q.v == null) { (m.cats || []).forEach(c => { const o = R(c); o.n++; o.miss = true; }); L("set the scale to measure this room"); return; }
        floors.push({ m: m }); nRooms++;
        const cp = m.cp > 1 ? Math.round(m.cp) : 1, notes = [], per = polyPerim(m, cx);
        let area = q.v;
        if (m.pa > 0) { if (Math.abs(m.pa - area) / m.pa > 0.05) warn.push((m.label || "a room") + " (p" + (sh.page + 1) + "): outline " + area.toFixed(2) + " m2 vs printed " + m.pa + " m2 - printed area used; check the outline (walls and skirting come from it)"); area = m.pa; }
        let cats = (m.cats || []).slice();
        if (wetness(m.label) === "dry") { const k = cats.length; cats = cats.filter(c => WET_CATS.indexOf(c) < 0); if (cats.length < k) notes.push("dry room - wet-area items left out"); }
        if (cats.indexOf("wet_area_floor") >= 0 && cats.indexOf("floor_tile") >= 0) { cats = cats.filter(c => c !== (wetness(m.label) === "dry" ? "wet_area_floor" : "floor_tile")); notes.push("one floor per room"); }
        const needs = cats.some(c => ["wall_tile", "skirting_border", "border_feature_strip", "waterproofing"].indexOf(c) >= 0);
        const sd = Array.isArray(S.scope && S.scope.door_size_m) ? S.scope.door_size_m.map(Number) : [];   // door size from the scope / door schedule
        const dn = m.dn == null ? (needs ? 1 : 0) : m.dn, dw = m.dw > 0 ? m.dw : sd[0] > 0 ? sd[0] : qs("doorW"), dh = m.dh > 0 ? m.dh : sd[1] > 0 ? sd[1] : qs("doorH"), dTot = dn * dw;
        const dAs = dn > 0 && (m.dn == null || !(m.dw > 0 || sd[0] > 0) || !(m.dh > 0 || sd[1] > 0));
        const wn = m.wn || 0, ww = m.ww > 0 ? m.ww : qs("winW"), wKnown = m.ws > 0 || m.wh > 0;
        const wTile = h => wKnown ? Math.max(0, Math.min(m.wh > 0 ? m.wh : (m.ws || 0) + qs("winH"), h) - (m.ws || 0)) : Math.min(qs("winH"), h);   // only the part of the window inside the tiled height
        const wAs = wn > 0 && (!(m.ww > 0) || !wKnown);
        if (dAs) assumed += dn * cp;
        if (wAs) assumed += wn * cp;
        const wcat = scopeCat("wall_tile", m.label), sh2 = wcat ? Number(wcat.wall_height_m) || 0 : 0, hgt = sh2 || m.h || 0;   // the confirmed scope always wins
        const wp = scopeCat("waterproofing", m.label), upMm = wp && Number(wp.upturn_mm) > 0 ? Number(wp.upturn_mm) : 0;
        if (wp && Number(wp.shower_wall_mm) > 0) showerH = Number(wp.shower_wall_mm);
        const dl = [], D = (nm, g, d, u) => { if (d > 0.005) dl.push(nm + " " + g.toFixed(2) + " - " + d.toFixed(2) + " openings = " + (g - d).toFixed(2) + " " + u + (cp > 1 ? " (each)" : "")); };
        cats.forEach(c => {
          const o = R(c); o.n += cp;
          if (c === "wall_tile" && hgt > 0) {
            const dA = dn * dw * Math.min(dh, hgt), wA = wn * ww * wTile(hgt);
            if (dn > 0) dl.push("Door" + (dn > 1 ? "s " + dn + " x" : ":") + " " + dw.toFixed(2) + " w x " + Math.min(dh, hgt).toFixed(2) + " h" + (dh > hgt ? " (to tile height)" : "") + " = " + dA.toFixed(2) + " m2" + (dAs ? " (assumed size)" : ""));
            if (wn > 0) dl.push("Window" + (wn > 1 ? "s " + wn + " x" : ":") + " " + ww.toFixed(2) + " w x " + wTile(hgt).toFixed(2) + " h" + (wKnown ? " (sill " + (m.ws || 0).toFixed(2) + " m, part inside the tiles)" : "") + " = " + wA.toFixed(2) + " m2" + (wAs ? " (assumed size)" : ""));
            D("wall tile", per * hgt, dA + wA, "m2");
          }
          if ((c === "skirting_border" && !(qs("skipSkirt") && cats.indexOf("wall_tile") >= 0 && hgt >= qs("skirtMinH"))) || c === "border_feature_strip") D(c === "border_feature_strip" ? "border" : "skirting", per, dTot, "lm");
          if (c === "floor_tile" || c === "wet_area_floor" || c === "external_paving") o.gross += area * cp;
          else if (c === "wall_tile") {
            if (!(hgt > 0)) { noH.push(m.label); o.miss = true; return; }
            o.gross += per * hgt * cp; o.ded += (dn * dw * Math.min(dh, hgt) + wn * ww * wTile(hgt)) * cp;
          } else if (c === "skirting_border") {
            if (qs("skipSkirt") && cats.indexOf("wall_tile") >= 0 && hgt >= qs("skirtMinH")) { o.n -= cp; notes.push("skirting left out - walls tiled to " + hgt + " m"); return; }
            o.gross += per * cp; o.ded += dTot * cp;
          } else if (c === "border_feature_strip") { o.gross += per * cp; o.ded += dTot * cp; }
          else if (c === "waterproofing") { if (!upMm) wpDefault = true; const upH = upMm || qs("upstand"), up = upH > 0 ? Math.max(0, per - dTot) * upH / 1000 : 0; o.gross += (area + up) * cp; o.extra += up * cp; }
        });
        if (sh.cur && dl.length) rded[i] = dl.join("; ");
        L(area.toFixed(2) + " m2" + (m.pa > 0 ? " (printed)" : "") + ", walls " + per.toFixed(1) + " m, " + dn + " door" + (dn === 1 ? "" : "s") + (dAs ? " (assumed)" : "") + ", " + wn + " window" + (wn === 1 ? "" : "s") + (wAs ? " (assumed)" : "") + (hgt > 0 ? ", wall height " + hgt + " m" + (sh2 ? " (scope)" : "") : "") + (cp > 1 ? ", x " + cp + " copies" : "") + (notes.length ? " - " + notes.join("; ") : ""));
      });
      sh.marks.forEach((m, i) => {
        if (m.type === "room") return;
        const L = t => { if (sh.cur) links[i] = t; };
        if (m.type === "object") {
          if (!(m.w > 0 && m.h > 0)) { L("size missing - not deducted"); return; }
          if (m.ded === false) { L("not deducted"); return; }
          const fl = floors.find(f => ((f.m.cats || []).indexOf("floor_tile") >= 0 || (f.m.cats || []).indexOf("wet_area_floor") >= 0) && inPoly(m.pts[0], f.m.pts));
          if (fl) { const fk = (fl.m.cats || []).indexOf("wet_area_floor") >= 0 ? "wet_area_floor" : "floor_tile"; R(fk).ded += m.w * m.h * (fl.m.cp > 1 ? fl.m.cp : 1); L("comes off the floor tiling of " + fl.m.label); } else L("not inside a tiled-floor room");
          return;
        }
        const q = measure(m, cx), o = R(m.type, q.u); o.n++;
        if (q.v == null) o.miss = true; else o.gross += q.v;
      });
      pages.push({ page: sh.page + 1, rooms: nRooms, marks: sh.marks.length });
    });
    Object.keys(generic).forEach(k => { const g = generic[k]; if (g.e && g.f) warn.push("'" + k + "' is on the enlarged plan (p" + g.e + ") and a general plan (p" + g.f + ") - delete one if it is the same room"); });
    if (wpDefault && rows.waterproofing) warn.push("waterproofing upturn is not in the scope - " + qs("upstand") + " mm used; confirm it");
    if (rows.waterproofing) warn.push("shower walls are not in the waterproofing (AS 3740: " + (showerH || 1800) + " mm high in showers) - add them");
    const out = Object.values(rows).filter(o => o.n > 0 || o.miss).map(o => { o.v = Math.max(0, o.gross - o.ded); o.det = o.extra ? "includes " + o.extra.toFixed(2) + " m2 upstand" : ""; return o; });
    return { rows: out, links: links, rded: rded, assumed: assumed, noH: noH, warn: warn, pages: pages.sort((a, b) => a.page - b.page) };
  }
  /* ---- Painting engine: the desktop PaintingAI take-off rules, room by room ---- */
  function paintTins(need) {
    const sizes = [15, 10, 4, 1]; if (!(need > 0)) return { txt: "", L: 0 };
    let best = null;
    for (let a = 0; a < Math.floor(need / 15) + 2; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 4; c++) {
      const rest = need - (15 * a + 10 * b + 4 * c), d = Math.max(0, Math.ceil(rest / 1 - 1e-9)); if (d > 3) continue;
      const tot = 15 * a + 10 * b + 4 * c + d, cand = [Math.round((tot - need) * 1e6) / 1e6, a + b + c + d, [a, b, c, d], tot];
      if (!best || cand[0] < best[0] || (cand[0] === best[0] && cand[1] < best[1])) best = cand;
    }
    if (!best) { const n = Math.ceil(need / 15); return { txt: n + " x 15 L", L: n * 15 }; }
    return { txt: best[2].map((n, i) => n ? n + " x " + sizes[i] + " L" : "").filter(Boolean).join(" + "), L: best[3] };
  }
  function paintingCalc() {
    const rows = {}, links = {}, R = (k, name, u) => rows[k] || (rows[k] = { key: k, name: name || PCN[k] || k, u: u || (["skirting", "cornice", "architrave"].indexOf(k) >= 0 ? "lm" : ["doors", "windows"].indexOf(k) >= 0 ? "no" : "m2"), gross: 0, ded: 0, v: 0, n: 0, miss: false, det: "", extra: 0 });
    const lit = { acrylic: 0, ceiling: 0, enamel: 0, primer: 0, exterior: 0, stain: 0, roof: 0 }; let assumed = 0, roofNoPitch = 0; const noH = []; const NOPAINT = /sliding|glass|roller|pre.?finish|aluminium|aluminum|steel|stacker|not painted/i, TIMBER = /timber|wood/i; const unpDoor = [], unpWin = [];
    const coatsOf = (key, room) => { const c = scopeCat(key, room); return Number(c && c.coats) > 0 ? Number(c.coats) : qs("coats"); };
    const spreadOf = (key, room, dflt) => { const c = scopeCat(key, room); return Number(c && c.spread_m2_per_l) > 0 ? Number(c.spread_m2_per_l) : dflt; };
    const skirtH = qs("skirtH") / 1000, corn = qs("cornice") / 1000;
    S.marks.forEach((m, i) => {
      const cp = m.cp > 1 ? m.cp : 1;
      if (m.type === "room") {
        const q = measure(m);
        if (q.v == null) { (m.cats || []).forEach(c => { const o = R(c); o.n++; o.miss = true; }); links[i] = "set the scale to measure this room"; return; }
        const area = q.v, per = polyPerim(m), cats = m.cats || [], notes = [];
        const needD = cats.some(c => ["walls", "skirting", "architrave", "doors"].indexOf(c) >= 0), dn = m.dn == null ? (needD ? 1 : 0) : m.dn, dw = m.dw > 0 ? m.dw : qs("doorW"), dh = qs("doorH"), dTot = dn * dw;
        const wn = m.wn || 0, ww = m.ww > 0 ? m.ww : qs("winW"), wh = qs("winH");
        if (dn > 0 && (m.dn == null || !(m.dw > 0))) assumed += dn;
        if (wn > 0 && !(m.ww > 0)) assumed += wn;
        const wc = scopeCat("walls", m.label), sh = wc ? Number(wc.wall_height_m) || 0 : 0, H = sh || m.h || qs("wallH");
        if (!sh && !m.h) noH.push(m.label);
        const bottom = Math.max(skirtH, m.th || 0), top = H, wallHt = Math.max(0, top - bottom), openArea = (w, h) => w * Math.max(0, Math.min(h, top) - bottom);
        cats.forEach(c => {
          const o = R(c); o.n += cp;
          if (c === "ceiling") { o.gross += area * cp; lit.ceiling += area * cp * coatsOf("ceiling", m.label) / spreadOf("ceiling", m.label, qs("ceilSpread")); }
          else if (c === "walls") {
            const g = per * wallHt * cp, d = (dn * openArea(dw, dh) + wn * openArea(ww, wh)) * cp; o.gross += g; o.ded += d;
            lit.acrylic += Math.max(0, g - d) * coatsOf("walls", m.label) / spreadOf("walls", m.label, qs("wallSpread"));
          } else if (c === "skirting") { const l = Math.max(0, per - dTot) * cp; o.gross += l; lit.enamel += l * 0.10 * coatsOf("skirting", m.label) / spreadOf("skirting", m.label, qs("enamelSpread")); }
          else if (c === "cornice") { const l = per * cp; o.gross += l; lit.ceiling += l * corn * coatsOf("cornice", m.label) / spreadOf("cornice", m.label, qs("ceilSpread")); }
          else if (c === "architrave") { const l = (dn * (2 * dh + dw) + wn * 2 * (ww + wh)) * cp; o.gross += l; lit.enamel += l * 0.07 * coatsOf("architrave", m.label) / spreadOf("architrave", m.label, qs("enamelSpread")); }
          else if (c === "doors") { if (m.ds && NOPAINT.test(m.ds)) { unpDoor.push(m.label + " (" + m.ds + ")"); } else { o.gross += dn * cp; lit.enamel += dn * cp * 0.6; } }
          else if (c === "windows") { if (m.wm && !TIMBER.test(m.wm)) { unpWin.push(m.label + " (" + m.wm + ")"); } else { o.gross += wn * cp; lit.enamel += wn * cp * 0.3; } }
        });
        if (cp > 1) notes.push("x" + cp + " levels");
        if (m.th > 0) notes.push("walls tiled to " + m.th + " m");
        links[i] = area.toFixed(2) + " m2, walls " + per.toFixed(1) + " m x " + wallHt.toFixed(2) + " m, " + dn + " door" + (dn === 1 ? "" : "s") + (dn > 0 && (m.dn == null || !(m.dw > 0)) ? " (assumed)" : "") + ", " + wn + " window" + (wn === 1 ? "" : "s") + (wn > 0 && !(m.ww > 0) ? " (assumed)" : "") + ", height " + H + " m" + (sh ? " (scope)" : m.h ? "" : " (default)") + (notes.length ? " - " + notes.join("; ") : "");
        return;
      }
      if (m.type === "extwall" || m.type === "ext") {
        const q = measure(m), o = R(m.type); o.n++;
        if (q.v == null) { o.miss = true; return; }
        const area = m.type === "extwall" ? q.v * (m.h || qs("wallH")) : q.v; o.gross += area;
        const ec = scopeCat(m.type, m.label); lit.exterior += area * (Number(ec && ec.coats) > 0 ? Number(ec.coats) : qs("coats")) / spreadOf(m.type, m.label, qs("extSpread"));
        if (m.type === "extwall") links[i] = q.v.toFixed(2) + " m x " + (m.h || qs("wallH")) + " m high" + (m.h ? "" : " (default)");
        return;
      }
      const X = { stair_item: ["no", 0], post_item: ["no", 0], balustrade_item: ["lm", 1], handrail_item: ["lm", 1], fence_item: ["lm", 1], deck_item: ["m2", 1], pergola_item: ["m2", 1], roof_area: ["m2", 1] }[m.type];
      if (X) {
        const o = R(m.type, null, X[0]); o.n++;
        if (X[0] === "no") { const n = (m.qty || 1) * cp; o.gross += n; if (m.type === "stair_item") lit.enamel += n * 6 * qs("coats") / qs("enamelSpread"); else lit.exterior += n * 2.7 * 0.4 * qs("coats") / qs("extSpread"); return; }
        const q = measure(m); if (q.v == null) { o.miss = true; return; }
        const ec = scopeCat(m.type, m.label), cts = Number(ec && ec.coats) > 0 ? Number(ec.coats) : qs("coats");
        if (m.type === "balustrade_item") { o.gross += q.v; lit.enamel += q.v * 2.0 * cts / qs("enamelSpread"); }
        else if (m.type === "handrail_item") { o.gross += q.v; lit.enamel += q.v * 0.25 * cts / qs("enamelSpread"); }
        else if (m.type === "fence_item") { const h = m.h || 1.8, sd = m.sd || 2; o.gross += q.v; o.a = (o.a || 0) + q.v * h * sd; lit.exterior += q.v * h * sd * cts / qs("extSpread"); links[i] = q.v.toFixed(1) + " m x " + h + " m x " + sd + " side" + (sd === 1 ? "" : "s"); }
        else if (m.type === "deck_item") { o.gross += q.v; lit.stain += q.v * cts / qs("stainSpread"); }
        else if (m.type === "pergola_item") { o.gross += q.v; lit.exterior += q.v * 1.5 * cts / qs("extSpread"); }
        else if (m.type === "roof_area") { const pa = m.pitch > 0 ? q.v / Math.cos(m.pitch * Math.PI / 180) : q.v; o.gross += pa; lit.roof += pa * cts / qs("roofSpread"); links[i] = q.v.toFixed(1) + " m2 plan" + (m.pitch > 0 ? " at " + m.pitch + " deg pitch" : " (no pitch given - plan area used)"); if (!(m.pitch > 0)) roofNoPitch++; }
        return;
      }
      const o = R(m.type, "Other items", "no"); o.n++; o.gross += m.qty || 1;
    });
    const out = Object.values(rows).filter(o => o.n > 0 || o.miss).map(o => { o.v = Math.max(0, o.gross - o.ded); o.det = o.ded ? o.gross.toFixed(2) + " - " + o.ded.toFixed(2) + " openings" : ""; return o; });
    const wf = 1 + qs("waste") / 100, under = qs("undercoat");
    if (under) { const a = (rows.walls ? Math.max(0, rows.walls.gross - rows.walls.ded) : 0) + (rows.ceiling ? rows.ceiling.gross : 0); lit.primer += a / qs("primerSpread"); }
    [["acrylic", "Paint - interior acrylic (walls)", "wallSpread"], ["ceiling", "Paint - ceiling paint (ceilings, cornices)", "ceilSpread"], ["enamel", "Paint - enamel (skirtings, architraves, doors, windows)", "enamelSpread"], ["primer", "Paint - sealer / undercoat", "primerSpread"], ["exterior", "Paint - exterior acrylic", "extSpread"], ["stain", "Paint - deck stain / oil", "stainSpread"], ["roof", "Paint - roof paint", "roofSpread"]].forEach(p => {
      const L = lit[p[0]]; if (!(L > 0.005)) return;
      const t = paintTins(L * wf);
      out.push({ key: "paint_" + p[0], name: p[1], u: "L", gross: L, ded: 0, v: L * wf, n: 1, miss: false, det: L.toFixed(1) + " L + " + qs("waste") + "% waste = buy " + t.txt, extra: 0 });
    });
    const warn = []; if (unpDoor.length) warn.push("doors not painted (" + unpDoor.join(", ") + ")"); if (unpWin.length) warn.push("windows not painted (" + unpWin.join(", ") + ")"); if (roofNoPitch) warn.push("roof pitch not given, plan area used - roof area will be larger");
    return { rows: out, links: links, assumed: assumed, noH: noH, warn: warn };
  }
  const ti0 = m => typeInfo(m.type);
  function electricalCalc() {
    const rows = {}, q = {}, runs = {}; const warn = [];
    S.marks.forEach(m => { const ti = typeInfo(m.type); if (ti[2] === "pt") q[m.type] = (q[m.type] || 0) + (m.qty || 1); else { const x = measure(m); const o = runs[m.type] || (runs[m.type] = { v: 0, n: 0, miss: false }); o.n++; if (x.v == null) o.miss = true; else o.v += x.v; } });
    const out = [], num = k => qs(k), w = 1 + num("cableWaste") / 100;
    T.types.forEach(t => {
      if (t[2] === "pt" && q[t[0]]) {
        const n = Math.round(q[t[0]]), need = Math.ceil(n * (1 + num("spare") / 100) - 1e-9);
        const sc = scopeCat(t[0], ""); let det = num("spare") ? "order " + need : "";
        if (sc && sc.count != null && sc.count !== "" && Number(sc.count) !== n) warn.push(t[1] + ": drawing shows " + n + " but the scope says " + sc.count);
        out.push({ key: t[0], name: t[1], u: "no", v: n, n: n, miss: false, det: det });
      } else if (t[2] === "line" && runs[t[0]] && (t[0] === "el_submain" || t[0] === "el_conduit" || t[0] === "el_tray" || t[0] === "el_trench" || t[0] === "el_cable")) {
        const r = runs[t[0]]; if (r.miss) { out.push({ key: t[0], name: t[1], u: "lm", v: 0, n: r.n, miss: true, det: "" }); return; }
        const len = t[0] === "el_conduit" ? num("conduitLen") : t[0] === "el_tray" ? num("trayLen") : 0, need = r.v * w;
        out.push({ key: t[0], name: t[1], u: "lm", v: r.v, n: r.n, miss: false, det: t[0] === "el_trench" ? "" : "+" + num("cableWaste") + "% = " + need.toFixed(0) + " m" + (len ? ", " + Math.ceil(need / len - 1e-9) + " lengths of " + len + " m" : "") });
      }
    });
    const sum = ks => ks.reduce((a, k) => a + (q[k] || 0), 0), nP = sum(E_POWER), nL = sum(E_LIGHT), nD = sum(E_DATA), nA = q.el_appliance || 0, runsM = runs.el_cable ? runs.el_cable.v : 0, allow = nP * num("powerM") + nL * num("lightM");
    const cab = (name, why, m) => { const need = m * w, drum = num("drum") || 100, d = Math.max(1, Math.ceil(need / drum - 1e-9)); out.push({ key: "el_cable_allow", name: "Cable - " + name, u: "m", v: need, n: 1, miss: false, det: why + " = " + m.toFixed(0) + " m + " + num("cableWaste") + "% = " + d + " x " + drum + " m drum" + (d > 1 ? "s" : "") }); };
    const measured = runsM > 0 && runsM >= 0.5 * allow;
    if (!measured) { if (nP) cab("TPS 2.5 mm² twin & earth (power)", nP + " power pts x " + num("powerM") + " m", nP * num("powerM")); if (nL) cab("TPS 1.5 mm² twin & earth (lighting)", nL + " light / switch / smoke pts x " + num("lightM") + " m", nL * num("lightM")); if (nP || nL) warn.push(runsM > 0 ? "only " + runsM.toFixed(0) + " m of cable runs measured, so the cable is an allowance per point" : "no cable runs measured, so the cable is an allowance per point (settings)"); }
    if (nA) cab("TPS 6 mm² twin & earth (appliances)", nA + " appliance circuits x " + num("applM") + " m", nA * num("applM"));
    if (nD) cab("Cat6 data / RG6 coax", nD + " data / TV pts x " + num("dataM") + " m", nD * num("dataM"));
    const info = [], types = { el_downlight: "l", el_light: "l", el_emergency: "l", el_smoke: "l", el_exhaust: "l", el_ceiling_fan: "l", el_ext_light: "o", el_gpo_double: "p", el_gpo_single: "p", el_gpo_wp: "p", el_appliance: "d", el_ac: "d", el_ev: "d" };
    const byRoom = {}; S.marks.forEach(m => { if (m.type in types && ti0(m)[2] === "pt") { const rn = (m.note || "").trim().toUpperCase() || "(no room)"; (byRoom[rn] = byRoom[rn] || {}); byRoom[rn][m.type] = (byRoom[rn][m.type] || 0) + (m.qty || 1); } });
    const ckt = (label, amps, max, kinds) => { const total = Object.keys(q).filter(k => kinds.indexOf(types[k]) >= 0).reduce((a, k) => a + q[k], 0); if (!total) return 0; const n = Math.ceil(total / max), per = Math.ceil(total / n); info.push(label + ": " + n + " circuit" + (n === 1 ? "" : "s") + " (" + total + " points, up to " + per + " each, " + amps + " A)"); return n; };
    let nc = ckt("Lighting", 10, num("lightMax"), ["l"]); nc += ckt("Outdoor lighting", 10, num("lightMax"), ["o"]); nc += ckt("Power", 20, num("powerMax"), ["p"]);
    ["el_appliance", "el_ac", "el_ev"].forEach(k => { if (q[k]) { nc += q[k]; info.push(({ el_appliance: "Appliance (cooktop / oven / HWS)", el_ac: "Air conditioner", el_ev: "EV charger" })[k] + ": " + q[k] + " circuit" + (q[k] === 1 ? "" : "s") + " of its own"); } });
    if (nc) {
      const rcds = num("rcbo") ? 0 : Math.max(num("rcdMin"), Math.ceil(nc / num("rcdMax")));
      info.push(nc + " circuit breakers" + (num("rcbo") ? " - an RCBO on every circuit" : " plus " + rcds + " shared RCDs (not more than " + num("rcdMax") + " circuits each)"));
      out.push({ key: "el_rcbo", name: num("rcbo") ? "Circuit breaker / RCBO" : "Circuit breaker", u: "no", v: nc, n: nc, miss: false, det: "" });
      if (rcds) out.push({ key: "el_rcd", name: "RCD (shared)", u: "no", v: rcds, n: rcds, miss: false, det: "" });
    }
    const LUX = [[/KITCHEN/, 240, "Kitchen"], [/LAUNDRY/, 240, "Laundry"], [/STUDY|OFFICE/, 320, "Study"], [/WORKSHOP|SHED/, 400, "Workshop"], [/WC|TOILET|POWDER|HALL|ENTRY|CORRIDOR|PASSAGE|STAIR|GARAGE|CARPORT/, 80, "Hall / WC / garage"], [/BED|MASTER|BATH|ENSUITE|DINING|LIVING|FAMILY|LOUNGE|RUMPUS|MEDIA/, 160, "Living / bedroom / bath"]];
    (S.rooms || []).forEach(r => { if (!(r.a > 0)) return; const lx = LUX.find(x => x[0].test(r.n.toUpperCase())); const have = (byRoom[r.n.toUpperCase()] || {}); const dl = have.el_downlight || 0; if (!lx || !dl) return; const need = Math.ceil(lx[1] * r.a / (num("uf") * num("mf") * 850) - 1e-9); if (dl < need * 0.7) warn.push(r.n + ": " + dl + " downlights counted; the lighting guide suggests about " + need + " (" + lx[1] + " lx, " + r.a + " m2) - check the count or the plan"); });
    const rooms = Object.keys(byRoom).filter(k => k !== "(no room)").sort();
    return { rows: out, links: {}, assumed: 0, noH: [], warn: warn, info: info, byRoom: rooms.map(k => k + ": " + Object.keys(byRoom[k]).map(t => byRoom[k][t] + " x " + (ECN[t] || t)).join(", ")) };
  }
  const EPRICE = { el_gpo_double: [22, 0.75], el_gpo_single: [16, 0.7], el_gpo_wp: [45, 1], el_data: [25, 0.8], el_tv: [22, 0.8], el_appliance: [90, 2.5], el_ac: [45, 1.2], el_ev: [180, 4], el_downlight: [12, 0.5], el_light: [10, 0.6], el_ext_light: [18, 0.9], el_emergency: [20, 1], el_switch: [12, 0.5], el_smoke: [20, 0.75], el_exhaust: [25, 1.5], el_ceiling_fan: [20, 1.5], el_board: [650, 8], el_cable: [3.5, 0.05], el_submain: [18, 0.15], el_conduit: [3, 0.2], el_tray: [22, 0.4], el_trench: [5, 0.5], el_cable_allow: [3.5, 0.05], el_rcbo: [55, 0.3], el_rcd: [90, 0.4] };
  function sendToEstimate(silent) {
    const rows = calc().rows.filter(o => !o.miss && o.v > 0).map(o => { const p = EPRICE[o.key] || [0, 0]; return { key: o.key, name: o.name, u: o.u, v: o.v, a: o.a || 0, det: o.det || "", mat: p[0], hrs: p[1] }; });
    if (!rows.length) { if (!silent) { V.note = "Nothing to send yet - set the scale so lengths and areas can be measured."; render(); } return; }
    let ok = false; const detail = { trade: trade, rows: rows, coats: qs("coats"), undercoat: !!qs("undercoat"), silent: !!silent, done: m => { ok = true; V.note = m; } };
    window.dispatchEvent(new CustomEvent("sf-lines", { detail: detail }));
    if (!ok) V.note = "This estimator couldn't take the lines - use 'Add these totals to the estimate notes' instead.";
    else if (silent) V.note = "Estimate updated from the mark-up - scroll down to the estimate summary. (Press 'Send to the estimate' again after you change marks.)";
    render();
  }
  const calc = () => trade === "painting" ? paintingCalc() : trade === "electrical" ? electricalCalc() : tilingCalc();
  function warnText() {
    const c = calc(), w = [];
    if (c.assumed) w.push(c.assumed + " door/window opening(s) use the default size or count - check them");
    (c.warn || []).forEach(x => w.push(x));
    if (c.noH.length) w.push(trade === "painting" ? "no wall height from the scope or drawing for: " + c.noH.join(", ") + " (default " + qs("wallH") + " m used)" : "no wall tile height in the scope for: " + c.noH.join(", ") + " (wall tile not measured)");
    (c.warn || []).forEach(x => w.push(x));
    return w.length ? "\n- CHECK: " + w.join("\n- CHECK: ") : "";
  }
  function totals() {
    return calc().rows;
  }
  function totalsText() {   // goes into the estimate notes / quote: clean quantities only, no AI wording or working
    return "Measured quantities (" + new Date().toLocaleDateString() + "):\n" + totals().filter(o => !o.miss && o.v > 0).map(o => "- " + o.name + ": " + (o.u === "no" ? o.v : o.v.toFixed(2) + " " + o.u)).join("\n") + (trade === "electrical" ? (c => (c.info.length ? "\n\nCircuits (allowance):\n" + c.info.map(x => "- " + x).join("\n") : "") + (c.byRoom.length ? "\n\nPoints by room:\n" + c.byRoom.map(x => "- " + x).join("\n") : ""))(electricalCalc()) : "");
  }
  const notesBox = () => { for (const id of T.notesIds) { const e = document.getElementById(id); if (e) return e; } return null; };
  function noteFix(text) { S.fixes.push(text); if (S.fixes.length > 30) S.fixes.shift(); }

  /* ---------- drawing taps ---------- */
  function onTap(ev) {
    const svg = ev.currentTarget, r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    if (V.tool === "cal") { V.calPts.push([x, y]); if (V.calPts.length > 2) V.calPts = [[x, y]]; render(); }
    else if (V.tool === "add") {
      const ti = typeInfo(V.addType); V.pts.push([x, y]);
      if (ti[2] === "pt") finishAdd(); else render();
    }
  }
  function finishAdd() {
    const ti = typeInfo(V.addType), need = ti[2] === "poly" ? 3 : ti[2] === "line" ? 2 : 1;
    if (V.pts.length >= need) { const m = cleanMark({ type: V.addType, label: ti[1] + " " + (S.marks.filter(x => x.type === V.addType).length + 1), pts: V.pts, cats: V.addType === "room" ? (trade === "painting" ? ["ceiling", "walls"] : ["floor_tile"]) : undefined }, "user"); if (m) { S.marks.push(m); noteFix("User added a missing " + ti[1]); } }
    V.pts = []; V.tool = ""; save(); render();
  }
  function applyCal() {
    const m = Number((document.getElementById("sfCalM") || {}).value);
    if (V.calPts.length !== 2 || !(m > 0)) { V.err = "Tap two points on the drawing, then type the real distance in metres."; render(); return; }
    const px = Math.hypot((V.calPts[1][0] - V.calPts[0][0]) * V.draw.W, (V.calPts[1][1] - V.calPts[0][1]) * V.draw.H);
    if (px < 5) { V.err = "Those points are too close together."; render(); return; }
    S.mpp = m / px; S.mppNote = "Set by you"; V.calPts = []; V.tool = ""; V.err = ""; save(); render();
  }

  /* ---------- rendering ---------- */
  function overlay() {
    const W = V.draw.W, H = V.draw.H, disp = Math.max(200, (mount.clientWidth || 360) - 34) * V.zoom / 100, k = W / disp, sw = 2.8 * k, fs = 12 * k;   // sizes follow the phone screen, not the picture
    let g = "";
    S.marks.forEach((m, i) => {
      const ti = typeInfo(m.type), c = colorOf(ti), p = m.pts.map(q => [q[0] * W, q[1] * H]), on = i === V.sel;
      const sty = 'stroke="' + c + '" stroke-width="' + (on ? sw * 2 : sw) + '"';
      if (ti[2] === "poly") g += '<polygon points="' + p.map(q => q.join(",")).join(" ") + '" ' + sty + ' fill="' + c + '" fill-opacity=".38"/>';
      else if (ti[2] === "line") g += '<polyline points="' + p.map(q => q.join(",")).join(" ") + '" ' + sty + ' fill="none"/>';
      else g += '<circle cx="' + p[0][0] + '" cy="' + p[0][1] + '" r="' + fs * 0.7 + '" fill="' + c + '" fill-opacity=".85" stroke="#fff" stroke-width="' + sw / 2 + '"/>';
      const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
      g += '<text x="' + cx + '" y="' + (cy + fs * 0.35) + '" font-size="' + fs + '" font-weight="700" text-anchor="middle" fill="' + (ti[2] === "pt" ? "#fff" : c) + '" stroke="' + (ti[2] === "pt" ? "none" : "#fff") + '" stroke-width="' + fs / 4 + '" paint-order="stroke">' + (trade === "electrical" && ti[2] === "pt" ? (ECODE[m.type] || i + 1) : i + 1) + (ti[2] === "poly" && Math.min(Math.max(...p.map(q => q[0])) - Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[1])) - Math.min(...p.map(q => q[1]))) > 70 * k ? " " + esc(m.label) : "") + "</text>";
    });
    V.pts.forEach(q => g += '<circle cx="' + q[0] * W + '" cy="' + q[1] * H + '" r="' + fs * 0.45 + '" fill="#000" stroke="#fff" stroke-width="' + sw / 2 + '"/>');
    if (V.pts.length > 1) g += '<polyline points="' + V.pts.map(q => q[0] * W + "," + q[1] * H).join(" ") + '" stroke="#000" stroke-width="' + sw + '" stroke-dasharray="' + sw * 3 + '" fill="none"/>';
    V.calPts.forEach(q => g += '<circle cx="' + q[0] * W + '" cy="' + q[1] * H + '" r="' + fs * 0.5 + '" fill="#e11" stroke="#fff" stroke-width="' + sw / 2 + '"/>');
    if (V.calPts.length === 2) g += '<line x1="' + V.calPts[0][0] * W + '" y1="' + V.calPts[0][1] * H + '" x2="' + V.calPts[1][0] * W + '" y2="' + V.calPts[1][1] * H + '" stroke="#e11" stroke-width="' + sw + '"/>';
    return '<div class="sf-view"><svg id="sfSvg" viewBox="0 0 ' + W + " " + H + '" style="width:' + V.zoom + '%" data-sf-tap="1"><image href="' + V.draw.src + '" width="' + W + '" height="' + H + '"/>' + g + "</svg></div>";
  }
  /* the marked-up sheet as one picture: the drawing, every mark in colour with its number, and a key with the quantities */
  function sheetImage() {
    return new Promise((ok, no) => {
      const d = V.draw, im = new Image();
      im.onerror = () => no(new Error("Couldn't draw the sheet")); im.onload = () => {
        const W = d.W, H = d.H, u = Math.max(W, H) / 1000, fs = 13 * u, sw = 2.4 * u, rows = S.marks.map((m, i) => { const ti = typeInfo(m.type), q = measure(m); return { i: i, m: m, ti: ti, q: q }; });
        const kcols = W > 1.2 * H ? 2 : 1, per = Math.ceil(rows.length / kcols), keyH = Math.min(per, 60) * fs * 1.7 + fs * 3.2;
        const cv = document.createElement("canvas"); cv.width = W; cv.height = Math.round(H + keyH); const c = cv.getContext("2d");
        c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, W, H);
        c.lineJoin = "round"; c.lineCap = "round"; c.textAlign = "center"; c.font = "700 " + fs + "px sans-serif";
        rows.forEach(r => {
          const col = colorOf(r.ti), p = r.m.pts.map(q => [q[0] * W, q[1] * H]); c.strokeStyle = col; c.lineWidth = sw;
          if (r.ti[2] === "poly") { c.beginPath(); p.forEach((q, k) => k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.globalAlpha = 0.22; c.fillStyle = col; c.fill(); c.globalAlpha = 1; c.stroke(); }
          else if (r.ti[2] === "line") { c.beginPath(); p.forEach((q, k) => k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.stroke(); }
          else { c.beginPath(); c.arc(p[0][0], p[0][1], fs * 0.8, 0, 6.3); c.globalAlpha = 0.9; c.fillStyle = col; c.fill(); c.globalAlpha = 1; c.strokeStyle = "#fff"; c.lineWidth = sw / 2; c.stroke(); }
          const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length, t = String(trade === "electrical" && r.ti[2] === "pt" ? (ECODE[r.m.type] || r.i + 1) : r.i + 1);
          if (r.ti[2] === "pt") { c.fillStyle = "#fff"; c.font = "700 " + fs * 0.7 + "px sans-serif"; c.fillText(t, cx, cy + fs * 0.25); c.font = "700 " + fs + "px sans-serif"; }
          else { c.lineWidth = fs / 3; c.strokeStyle = "#fff"; c.strokeText(t + (r.ti[2] === "poly" ? " " + r.m.label : ""), cx, cy + fs * 0.35); c.fillStyle = col; c.fillText(t + (r.ti[2] === "poly" ? " " + r.m.label : ""), cx, cy + fs * 0.35); }
        });
        c.textAlign = "left"; c.fillStyle = "#111"; c.font = "700 " + fs * 1.15 + "px sans-serif"; c.fillText("Mark-up key" + (S.mpp ? "" : " (scale not set - lengths and areas not measured)"), fs, H + fs * 1.8);
        c.font = fs + "px sans-serif";
        rows.slice(0, 60 * kcols).forEach((r, k) => {
          const col = Math.floor(k / per), row = k % per; if (row >= 60) return; const x = fs + col * (W / kcols), y = H + fs * 3.4 + row * fs * 1.7;
          c.fillStyle = colorOf(r.ti); c.beginPath(); c.arc(x + fs * 0.6, y - fs * 0.3, fs * 0.6, 0, 6.3); c.fill();
          c.fillStyle = "#111"; c.fillText((r.i + 1) + "  " + r.m.label + " - " + r.ti[1] + ": " + fmt(r.q) + (trade === "tiling" && V.rded && V.rded[r.i] ? "  |  " + V.rded[r.i] : ""), x + fs * 1.6, y);
        });
        ok(cv.toDataURL("image/jpeg", 0.88));
      }; im.src = d.src;
    });
  }
  function dimsHtml(m, i, ti) {
    const fl = ti[4] || "", a = ' data-mk="1" data-i="' + i + '"', num = (f, v, ph) => '<input type="number" inputmode="decimal" step="0.01" min="0"' + a + ' data-f="' + f + '" value="' + (v || "") + '" placeholder="' + ph + '">'; let h = "";
    if (fl.indexOf("R") >= 0 && trade === "painting") {
      const wc = scopeCat("walls", m.label), sh = wc ? Number(wc.wall_height_m) || 0 : 0;
      h += '<span class="sf-cats">' + PROOM.map(c => '<label class="sf-chip"><input type="checkbox"' + a + ' data-f="cat:' + c + '"' + ((m.cats || []).indexOf(c) >= 0 ? " checked" : "") + "> " + esc(PCN[c]) + "</label>").join("") + "</span>";
      h += '<label class="sf-dim">doors <input type="number" inputmode="numeric" step="1" min="0"' + a + ' data-f="dn" value="' + (m.dn == null ? "" : m.dn) + '" placeholder="1"> × ' + num("dw", m.dw, qs("doorW")) + "m</label>";
      h += '<label class="sf-dim">windows <input type="number" inputmode="numeric" step="1" min="0"' + a + ' data-f="wn" value="' + (m.wn || "") + '" placeholder="0"> × ' + num("ww", m.ww, qs("winW")) + "m</label>";
      h += '<label class="sf-dim">door type <select' + a + ' data-f="ds">' + [["", "default (painted)"], ["flush", "flush"], ["panel", "panel"], ["French", "French"], ["robe bi-fold", "robe bi-fold"], ["cavity slider", "cavity slider"], ["entry", "entry"], ["barn", "barn"], ["sliding glass", "sliding glass (not painted)"], ["roller / pre-finished", "roller / pre-finished (not painted)"]].map(o => '<option value="' + esc(o[0]) + '"' + (m.ds === o[0] || (!m.ds && !o[0]) ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
      h += '<label class="sf-dim">window frames <select' + a + ' data-f="wm">' + [["", "default (painted)"], ["timber", "timber (painted)"], ["aluminium", "aluminium (not painted)"]].map(o => '<option value="' + o[0] + '"' + ((m.wm || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
      h += '<label class="sf-dim">wall height ' + num("h", m.h, sh || qs("wallH")) + "m" + (sh ? ' <small class="muted">scope says ' + sh + "</small>" : "") + "</label>";
      h += '<label class="sf-dim">tiled to ' + num("th", m.th, "0") + "m</label>";
      h += '<label class="sf-dim">levels ' + '<input type="number" inputmode="numeric" step="1" min="1"' + a + ' data-f="cp" value="' + (m.cp > 1 ? m.cp : "") + '" placeholder="1"></label>';
    } else if (fl.indexOf("R") >= 0) {
      const wc = scopeCat("wall_tile", m.label), sh = wc ? Number(wc.wall_height_m) || 0 : 0;
      h += '<span class="sf-cats">' + ROOM_CATS.map(c => '<label class="sf-chip"><input type="checkbox"' + a + ' data-f="cat:' + c + '"' + ((m.cats || []).indexOf(c) >= 0 ? " checked" : "") + "> " + esc(TCATS[c]) + "</label>").join("") + "</span>";
      const sdz = Array.isArray(S.scope && S.scope.door_size_m) ? S.scope.door_size_m : [];
      h += '<label class="sf-dim">doors <input type="number" inputmode="numeric" step="1" min="0"' + a + ' data-f="dn" value="' + (m.dn == null ? "" : m.dn) + '" placeholder="1"> × ' + num("dw", m.dw, sdz[0] || qs("doorW")) + "w × " + num("dh", m.dh, sdz[1] || qs("doorH")) + "h m</label>";
      h += '<label class="sf-dim">windows <input type="number" inputmode="numeric" step="1" min="0"' + a + ' data-f="wn" value="' + (m.wn || "") + '" placeholder="0"> × ' + num("ww", m.ww, qs("winW")) + "w m, sill " + num("ws", m.ws, "?") + "head " + num("wh", m.wh, "?") + "m</label>";
      h += '<label class="sf-dim">wall tile height ' + num("h", m.h, sh || "?") + "m" + (sh ? ' <small class="muted">scope says ' + sh + "</small>" : "") + "</label>";
      h += '<label class="sf-dim">printed area ' + num("pa", m.pa, "0") + 'm2</label><label class="sf-dim">copies <input type="number" inputmode="numeric" step="1" min="1"' + a + ' data-f="cp" value="' + (m.cp > 1 ? m.cp : "") + '" placeholder="1"></label>';
    }
    if (fl.indexOf("h") >= 0) h += '<label class="sf-dim">height ' + num("h", m.h, m.type === "fence_item" ? 1.8 : m.type === "balustrade_item" ? 1.0 : qs("wallH")) + "m</label>";
    if (fl.indexOf("s") >= 0) h += '<label class="sf-dim">sides ' + num("sd", m.sd, 2) + "</label>";
    if (fl.indexOf("p") >= 0) h += '<label class="sf-dim">pitch ' + num("pitch", m.pitch, "0") + "deg</label>";
    if (fl.indexOf("d") >= 0) h += '<label class="sf-dim">' + num("w", m.w, "w") + " × " + num("h", m.h, "h") + "m</label>";
    if (fl.indexOf("x") >= 0) h += '<label class="sf-dim"><input type="checkbox"' + a + ' data-f="ded"' + (m.ded === false ? "" : " checked") + "> deduct</label>";
    return h ? '<span class="sf-dims">' + h + ((trade === "tiling" || trade === "painting") && V.links && V.links[i] ? '<small class="muted">' + esc(V.links[i]) + "</small>" : "") + (trade === "tiling" && V.rded && V.rded[i] ? '<small class="sf-ded">' + esc(V.rded[i]) + "</small>" : "") + "</span>" : "";
  }
  const step = (n, title, done) => '<span class="sf-n' + (done ? " ok" : "") + '">' + (done ? "✓" : n) + "</span><b>" + title + "</b>";
  const imgs = () => V.scopePrev.map((p, i) => '<img class="sf-th" data-sf="zoomimg" data-i="' + i + '" src="' + p.src + '" alt="' + esc(p.name) + '" title="' + esc(p.name) + '">').join("");

  /* ---------- waiting window: TilingAI's tile-laying picture (frame laid tile by tile, wiped, lifted) ---------- */
  const TILE_COLS = ["#1A73E8", "#12B5CB", "#8E24AA", "#F29900", "#1E8E3E", "#D93025", "#4285F4", "#A142F4", "#00ACC1", "#E37400", "#34A853", "#EA4335"];
  const TOTAL_F = 12 * 4 + 26 + 12 + 12 * 3 + 8;
  function rrect(c, x0, y0, x1, y1, r) { c.beginPath(); c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.quadraticCurveTo(x1, y0, x1, y0 + r); c.lineTo(x1, y1 - r); c.quadraticCurveTo(x1, y1, x1 - r, y1); c.lineTo(x0 + r, y1); c.quadraticCurveTo(x0, y1, x0, y1 - r); c.lineTo(x0, y0 + r); c.quadraticCurveTo(x0, y0, x0 + r, y0); c.closePath(); }
  function paintLoader(cv, f, cyc) {
    const c = cv.getContext("2d"), W = cv.width, H = cv.height, COLS = 4, ROWS = 3, n = 12, LAY = 4, CLEAN = 26, HOLD = 12, LIFT = 3;
    c.clearRect(0, 0, W, H);
    const fx0 = W * 0.14, fy0 = H * 0.08, fx1 = W * 0.86, fy1 = H * 0.86;
    rrect(c, fx0 + 3, fy0 + 5, fx1 + 3, fy1 + 5, 18); c.fillStyle = "rgba(0,0,0,.18)"; c.fill();
    rrect(c, fx0, fy0, fx1, fy1, 18); c.fillStyle = "#0F2744"; c.fill(); c.lineWidth = 2; c.strokeStyle = "#E9A21C"; c.stroke();
    const pad = 12, gap = 5, cw = (fx1 - fx0 - 2 * pad - (COLS - 1) * gap) / COLS, ch = (fy1 - fy0 - 2 * pad - (ROWS - 1) * gap) / ROWS;
    const layEnd = n * LAY, cleanEnd = layEnd + CLEAN, holdEnd = cleanEnd + HOLD, liftEnd = holdEnd + n * LIFT;
    const order = []; for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) order.push([r, r % 2 === 0 ? k : COLS - 1 - k]);
    let sx = null; if (f >= layEnd && f < cleanEnd) sx = fx0 - 20 + (fx1 - fx0 + 40) * (f - layEnd) / CLEAN;
    order.forEach((rc, i) => {
      const x = fx0 + pad + rc[1] * (cw + gap), y = fy0 + pad + rc[0] * (ch + gap); let k;
      if (f < layEnd) k = (f - i * LAY) / LAY; else if (f < holdEnd) k = 1; else if (f < liftEnd) k = 1 - (f - holdEnd - (n - 1 - i) * LIFT) / LIFT; else k = 0;
      k = Math.max(0, Math.min(1, k));
      if (k <= 0) { c.setLineDash([2, 3]); c.lineWidth = 1; c.strokeStyle = "#2A4A6E"; c.strokeRect(x, y, cw, ch); c.setLineDash([]); return; }
      const s = 0.55 + 0.45 * k, cx = x + cw / 2, cy = y + ch / 2 - (1 - k) * 10;
      rrect(c, cx - cw * s / 2, cy - ch * s / 2, cx + cw * s / 2, cy + ch * s / 2, 5); c.fillStyle = TILE_COLS[(i + cyc) % TILE_COLS.length]; c.fill();
      const clean = (f >= cleanEnd && f < liftEnd) || (sx !== null && x + cw < sx);
      if (clean) { c.strokeStyle = "#fff"; c.lineWidth = 2; c.lineCap = "round"; c.beginPath(); c.moveTo(cx - cw * s / 2 + 5, cy - ch * s / 2 + 5); c.lineTo(cx + cw * s / 2 - 8, cy - ch * s / 2 + 5); c.stroke(); }
      else if (f >= layEnd && sx !== null) { c.strokeStyle = "#CFD8DC"; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - cw * 0.3, cy + ch * 0.1); c.lineTo(cx + cw * 0.1, cy + ch * 0.25); c.stroke(); }
    });
    if (sx !== null) {
      const sy = fy0 + (fy1 - fy0) * (0.5 + 0.28 * Math.sin((f - layEnd) / 3));
      rrect(c, sx - 16, sy - 11, sx + 16, sy + 11, 7); c.fillStyle = "#FDD663"; c.fill(); c.strokeStyle = "#E8B600"; c.lineWidth = 1; c.stroke();
      [-8, 0, 8].forEach(dx => { c.beginPath(); c.arc(sx + dx, sy, 2, 0, 6.3); c.fillStyle = "#E8B600"; c.fill(); });
      c.strokeStyle = "#AECBFA"; c.lineWidth = 2; c.beginPath(); c.moveTo(sx - 22, sy - 14); c.lineTo(sx - 30, sy - 20); c.stroke();
    }
    if (f < layEnd) {
      const i = Math.min(n - 1, Math.floor(f / LAY)), x = fx0 + pad + order[i][1] * (cw + gap) + cw * 0.8, y = fy0 + pad + order[i][0] * (ch + gap) - 6 + 3 * Math.sin(f);
      c.fillStyle = "#BDC1C6"; c.strokeStyle = "#80868B"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 16, y - 4); c.lineTo(x + 12, y + 8); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = "#8D6E63"; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 14, y + 2); c.lineTo(x + 24, y - 8); c.stroke();
    }
  }
  const elapsed = () => { const t = Math.max(0, Math.round((Date.now() - V.t0) / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
  const keep = (on, msg) => { try { window.GPNative && window.GPNative.keepAlive && window.GPNative.keepAlive(on, msg || ""); } catch (e) { } };
  function begin(msg, sub) {
    keep(true, msg); V.opId++; V.holdMsg = "";
    if (V.all && V.draw) { const done = (V.scanLog || []).length, ixb = V.draw.index && Object.keys(V.draw.index).some(i => V.draw.index[i].txt), tot = V.draw.index ? Object.keys(V.draw.index).filter(i => ixb ? V.draw.index[i].pick : WANT[trade].indexOf(V.draw.index[i].type) >= 0 && !V.draw.index[i].old).length : V.draw.count; msg = "Whole drawing set - page " + (V.draw.page + 1) + " of " + V.draw.count + " (" + done + " of " + Math.max(tot, done + 1) + " plan pages done): " + msg; }
    V.busy = msg; V.sub = (sub || "") + (!V.all && V.scan > 0 && V.scanLog && V.scanLog.length ? "  Skipped: " + V.scanLog.map(x => x.slice(0, 48)).join(" / ") : ""); V.t0 = V.all && V.runT0 ? V.runT0 : Date.now(); startFx(); return V.opId;
  }
  /* the page was reloaded (Android closed it in the background): bring the drawing back from the app's cache and offer to carry on */
  async function restoreDrawing() {
    const k = S.dk; if (trade !== "tiling" || V.draw || !k || !k.key || !window.GPNative) return;
    try {
      const r = await pdfPage(k.key, k.page || 0, 1800), im = await shrink(r.dataUrl, 1800);
      V.draw = { name: k.name, key: k.key, count: k.count || r.count, page: k.page || 0, src: im.src, W: im.W, H: im.H, ptW: r.ptW || k.ptW || 0, thumbs: [], index: k.index || null };
      loadThumbs(k.key, V.draw.count);
      if (S.run) { V.resume = true; V.note = "The phone closed the page while the AI was working. Pages already marked are kept (" + ((S.run.log || []).join(", ") || "none yet") + "). Press Continue to carry on from where it stopped."; }
    } catch (e) { }
    render();
  }
  async function startAll() {
    V.hold = true; V.holdMsg = "Starting"; V.t0 = V.runT0 = Date.now(); startFx(); render();
    const d = V.draw, ix = d && d.index, byText = ix && Object.keys(ix).some(k => ix[k].txt);
    if (!ix && d && d.key && d.count > 4) { V.all = true; V.hold = true; V.runT0 = Date.now(); await buildIndex(); if (V.err || !V.all) { V.hold = false; render(); return; } return startAll(); }
    if (ix && !(byText ? ix[d.page] && ix[d.page].pick : WANT[trade].indexOf((ix[d.page] || {}).type) >= 0)) {   // don't spend a call on the page that happens to be open
      V.scan = 0; V.scanLog = []; V.tried = {}; V.all = true; V.hold = true;
      const p0 = d.page; d.page = -1; const nxt = nextPage(); d.page = p0;   // first wanted page from the front of the set
      if (nxt == null) { V.all = false; V.hold = false; V.note = "No pages are ticked for mark-up - tick them in the list under step 4."; render(); return; }
      await pickPage(nxt); if (V.err) { V.hold = false; render(); return; } return markUp(true);
    }
    return markUp(false, true);
  }
  async function resumeRun() {
    const r = S.run || {}; V.resume = false; V.all = true; V.tried = r.tried || {}; V.scanLog = r.log || []; V.scan = r.scan || 0; V.runT0 = Date.now();
    if (V.draw && !(S.sheets || {})[V.draw.page]) { markUp(true); return; }   // the page it was on when the phone closed it: do it again
    if (V.draw) V.tried[V.draw.page] = 1;
    const nxt = nextPage(); if (nxt == null) { V.all = false; save(); V.note = "All plan pages were already done."; render(); return; }
    await pickPage(nxt); if (!V.err) markUp(true);
  }
  function drawFx() {
    try {
      const cv = document.getElementById("sfLoader"); if (cv) paintLoader(cv, Math.floor(V.fx.f), V.fx.cyc);
      const el = document.getElementById("sfElapsed"); if (el) { el.textContent = elapsed(); }
    } catch (e) { }
  }
  function startFx() {
    if (V.fx.timer) return; V.fx.last = Date.now();
    V.fx.timer = setInterval(() => {
      if (!V.busy && !V.hold) { clearInterval(V.fx.timer); V.fx.timer = 0; keep(false); return; }
      const now = Date.now(); V.fx.f += (now - V.fx.last) * 0.024; V.fx.last = now;
      while (V.fx.f >= TOTAL_F) { V.fx.f -= TOTAL_F; V.fx.cyc++; }
      drawFx();
    }, 40);
  }
  const waitHtml = () => !V.busy ? '<div class="sf-wait" role="status" aria-live="polite"><div class="sf-wait-in"><canvas id="sfLoader" width="240" height="190"></canvas><div class="sf-wait-msg">' + esc(V.holdMsg || "Moving to the next page") + '</div><div class="sf-wait-time">Working for <b id="sfElapsed">' + elapsed() + '</b></div><button type="button" class="sf-stop" data-sf="stop">Stop</button></div></div>' : '<div class="sf-wait" role="status" aria-live="polite"><div class="sf-wait-in"><canvas id="sfLoader" width="240" height="190"></canvas><div class="sf-wait-msg">' + esc(V.busy) + "</div>" + (V.sub ? '<div class="sf-wait-sub">' + esc(V.sub) + "</div>" : "") + '<div class="sf-wait-time">Working for <b id="sfElapsed">' + elapsed() + '</b> - keep this screen open</div><button type="button" class="sf-stop" data-sf="stop">Stop</button></div></div>';

  function render() {
    const ext = document.getElementById(TXT); if (ext && !mount.contains(ext) && ext.value !== S.scopeText) ext.value = S.scopeText;   // S.scopeText is the one copy; typing keeps it current
    { const cc = calc(); V.links = cc.links; V.rded = cc.rded || {}; }
    const hasScope = !!(S.scopeText.trim() || V.scopePages.length), canRead = hasScope && !V.busy, sc = S.scope;
    const dr = V.draw, ready = S.confirmed && dr && !V.busy;
    let h = '<div class="sf-card">';
    h += '<div class="card-head"><div><h3>Scope &rarr; Design &rarr; AI check</h3><p>Upload the scope, let the AI read it with you and confirm it, then add the drawing so the AI can mark up the plan.</p></div><span class="number">AI</span></div>';
    if (V.busy || V.hold) h += waitHtml();
    if (V.err) h += '<div class="sf-err">' + esc(V.err) + "</div>";
    if (V.note) h += '<div class="sf-hint">' + esc(V.note) + "</div>";

    // step 1
    h += '<section class="sf-step"><div class="sf-h">' + step(1, "Scope of work", hasScope) + "</div>";
    h += '<label class="scope-drop sf-drop">＋ Attach scope (PDF, Word, text, photo)<input type="file" data-sfin="scope" accept=".pdf,.docx,.doc,.txt,.rtf,image/*" multiple hidden></label>';
    h += S.scopeNames.length ? '<p class="muted sf-names">' + esc(S.scopeNames.join(", ")) + ' <a href="#" data-sf="clearscope">clear</a></p>' : '<p class="muted">No scope attached yet.</p>';
    if (V.scopePrev.length) h += '<div class="sf-ths">' + imgs() + "</div>";
    h += '<textarea id="' + TXT + '" rows="4" placeholder="Or paste / type the scope here. Text read from your files appears here too.">' + esc(S.scopeText) + "</textarea></section>";

    // step 2 - the AI reads the scope, the estimator checks and confirms it
    h += '<section class="sf-step"><div class="sf-h">' + step(2, "AI reads the scope - you check it", S.confirmed) + "</div>";
    if (!sc) h += '<button type="button" class="sf-primary" data-sf="read"' + (canRead ? "" : " disabled") + ">Let the AI read the scope</button>";
    else {
      h += '<div class="sf-und"><h4 class="sf-h4">What the AI understood</h4><p class="sf-sum">' + esc(sc.summary) + "</p>";
      if (sc.items.length) h += "<ol>" + sc.items.map(i => "<li><b>" + esc(i.area) + ":</b> " + esc(i.work) + (i.detail ? ' <span class="muted">' + esc(i.detail) + "</span>" : "") + "</li>").join("") + "</ol>";
      if ((sc.assumptions || []).length) h += "<p><b>Assumptions:</b> " + sc.assumptions.map(esc).join("; ") + "</p>";
      if (sc.exclusions.length) h += "<p><b>Not included:</b> " + sc.exclusions.map(esc).join("; ") + "</p>";
      if (sc.questions.length) h += '<p class="sf-q"><b>AI needs to know:</b></p><ul>' + sc.questions.map(q => "<li>" + esc(q) + "</li>").join("") + "</ul>";
      h += "</div>";
      h += '<div class="sf-chatbox"><h4 class="sf-h4">Discuss it with the AI</h4><div class="sf-chat" id="sfChat">' + S.chat.slice(-20).map(m => '<div class="sf-msg ' + (m.who === "AI" ? "ai" : "me") + '"><small>' + (m.who === "AI" ? "AI" : "You") + "</small>" + esc(m.text) + "</div>").join("") + "</div>";
      if (!S.confirmed) h += '<textarea id="sfSay" rows="3" placeholder="Type here to correct the AI or ask something, e.g. \'Skirting is not included\'" autocomplete="off"></textarea><button type="button" class="sf-primary sf-send" data-sf="say"' + (V.busy ? " disabled" : "") + '>Send to the AI</button></div><button type="button" class="sf-primary sf-confirm" data-sf="confirm"' + (V.busy ? " disabled" : "") + ">✓ Scope is correct - confirm</button>";
      else h += '</div><p class="sf-ok">✓ Scope confirmed.</p><button type="button" class="btn" data-sf="unconfirm">Edit scope again</button>';
      h += ' <button type="button" class="btn" data-sf="reread"' + (V.busy ? " disabled" : "") + ">Re-read from scratch</button>";
    }
    h += "</section>";

    // step 3 - the design, only after the scope is confirmed
    if (!S.confirmed) h += '<section class="sf-step"><div class="sf-h">' + step(3, "Design / drawing", false) + '</div><p class="muted">Confirm the scope in step 2 first - then attach the drawing or record it manually.</p></section>';
    else {
    h += '<section class="sf-step"><div class="sf-h">' + step(3, "Design / drawing", !!dr || S.mode === "manual") + "</div><div class=\"sf-boxes\">";
    h += '<div class="sf-box"><h4>Attach the drawing</h4><p class="muted">PDF or picture of the plan. The AI marks it up for the confirmed scope.</p>';
    h += '<label class="scope-drop sf-drop">＋ ' + (dr ? "Change drawing" : "Attach drawing") + '<input type="file" data-sfin="draw" accept=".pdf,image/*" hidden></label>';
    if (dr) {
      h += '<p class="muted sf-names">' + esc(dr.name) + (dr.count > 1 ? " - page " + (dr.page + 1) + " of " + dr.count : "") + ' <a href="#" data-sf="cleardraw">remove</a></p>';
      if (dr.count > 1) h += '<div class="sf-ths">' + Array.from({ length: Math.min(dr.count, 200) }, (_, i) => '<button type="button" class="sf-pg' + (i === dr.page ? " on" : "") + (trade === "tiling" && S.sheets && S.sheets[i] && i !== dr.page ? " has" : "") + '" data-sf="page" data-i="' + i + '">' + (dr.thumbs[i] ? '<img src="' + dr.thumbs[i] + '" alt="">' : "") + "<span>" + (i + 1) + "</span></button>").join("") + "</div>";
      h += '<img class="sf-prev" data-sf="zoomdraw" src="' + dr.src + '" alt="Drawing preview">';
    }
    h += "</div>";
    h += '<div class="sf-box"><h4>Record manually</h4><p class="muted">No drawing, or you would rather measure it yourself in the app.</p>';
    h += T.manual.href ? '<a class="btn sf-btn" href="' + T.manual.href + '" data-sf="manual">' + esc(T.manual.label) + "</a>" : '<button type="button" class="btn sf-btn" data-sf="manual">' + esc(T.manual.label) + "</button>";
    h += (S.mode === "manual" ? '<p class="muted">Manual entry chosen - you can still attach a drawing as well.</p>' : "") + "</div></div></section>";
    }
    // step 4
    h += '<section class="sf-step"><div class="sf-h">' + step(4, "AI marks up the drawing", S.marks.length > 0) + "</div>";
    if (!S.confirmed) h += '<p class="muted">Confirm the scope first, then attach the drawing.</p>';
    else if (!dr) h += '<p class="muted">Attach a drawing in step 3 to mark it up.</p>';
    else {
      const many = trade === "tiling" && dr.count > 1, anyMk = trade === "tiling" && Object.keys(S.sheets || {}).length > 0;
      if (V.resume && S.run && !V.busy) h += '<button type="button" class="sf-primary" data-sf="resume">Continue marking up the drawing set</button>';
      const ixx = dr.index && Object.keys(dr.index).some(k => dr.index[k].txt) ? dr.index : null, nPick = ixx ? Object.keys(ixx).filter(k => ixx[k].pick).length : 0;
      if (ixx) {
        const row = k => { const x = ixx[k]; return '<label class="sf-pk' + (x.pick ? " on" : "") + '"><input type="checkbox" data-sf="pickpg" data-i="' + k + '"' + (x.pick ? " checked" : "") + '><span><b>p' + (Number(k) + 1) + "</b> " + esc(x.title || "") + '<small class="muted">' + esc(x.why || "") + "</small></span></label>"; };
        const main = Object.keys(ixx).filter(k => ixx[k].pick || ixx[k].type === "enlarged_plan" || ixx[k].type === "floor_plan" || ixx[k].type === "unknown"), rest = Object.keys(ixx).filter(k => main.indexOf(k) < 0);
        h += '<div class="sf-pks"><h4>Pages to mark up (from the title blocks)</h4>' + main.map(row).join("") + '<details><summary>Other ' + rest.length + " pages (skipped)</summary>" + rest.map(row).join("") + "</details></div>";
      }
      if (many) h += '<button type="button" class="sf-primary" data-sf="markupall"' + (ready && (!ixx || nPick) ? "" : " disabled") + ">" + (ixx ? "Mark up the " + nPick + " ticked page" + (nPick === 1 ? "" : "s") + (anyMk ? " again" : "") : anyMk ? "Mark up all plan pages again" : "Mark up all plan pages with AI") + "</button>";
      h += '<button type="button" class="' + (many ? "btn sf-btn2" : "sf-primary") + '" data-sf="markup"' + (ready ? "" : " disabled") + ">" + (many ? (S.marks.length ? "Mark up this page again" : "Mark up this page only") : S.marks.length ? "Mark up again with AI" : "Mark up the drawing with AI") + "</button>";
      h += '<div class="sf-tools"><button type="button" class="btn' + (V.tool === "cal" ? " on" : "") + '" data-sf="tool" data-t="cal">Set scale</button><select id="sfType" aria-label="Mark type">' + T.types.map(t => '<option value="' + t[0] + '"' + (t[0] === V.addType ? " selected" : "") + ">" + esc(t[1]) + "</option>").join("") + '</select><button type="button" class="btn' + (V.tool === "add" ? " on" : "") + '" data-sf="tool" data-t="add">Add mark</button><button type="button" class="btn" data-sf="zin">＋</button><button type="button" class="btn" data-sf="zout">－</button></div>';
      if (V.tool === "cal") h += '<div class="sf-row"><span class="muted">Tap two ends of a known distance, then type it:</span><input id="sfCalM" type="number" inputmode="decimal" step="0.01" placeholder="metres"><button type="button" class="btn" data-sf="calok">Apply</button></div>';
      if (V.tool === "add") { const ti = typeInfo(V.addType); h += '<div class="sf-row"><span class="muted">Tap the drawing' + (ti[2] === "pt" ? " where it goes." : " around it (" + V.pts.length + " tapped), then Finish.") + "</span>" + (ti[2] === "pt" ? "" : '<button type="button" class="btn" data-sf="finish">Finish</button>') + '<button type="button" class="btn" data-sf="canceltool">Cancel</button></div>'; }
      if (trade === "electrical") h += '<details class="sf-qs"><summary>Cable and order rules (same as ElectricalAI)</summary>' + [["spare", "Spare fittings (%)"], ["cableWaste", "Cable / conduit waste (%)"], ["drum", "Cable drum (m)"], ["powerM", "Cable per power point (m)"], ["lightM", "Cable per light / switch / smoke point (m)"], ["dataM", "Cable per data / TV point (m)"], ["applM", "Cable per appliance circuit (m)"], ["conduitLen", "Conduit length (m)"], ["trayLen", "Cable tray length (m)"], ["lightMax", "Points per lighting circuit"], ["powerMax", "Points per power circuit"], ["rcbo", "RCBO on every circuit (1 = yes, 0 = shared RCDs)"], ["rcdMax", "Circuits per shared RCD"], ["rcdMin", "Shared RCDs at least"], ["uf", "Lighting guide: utilisation factor"], ["mf", "Lighting guide: maintenance factor"]].map(r => '<label class="sf-wh">' + r[1] + ' <input type="number" step="0.01" data-qs="' + r[0] + '" value="' + qs(r[0]) + '"></label>').join("") + "</details>";
      if (trade === "painting") h += '<details class="sf-qs"><summary>Measurement and paint rules (same as PaintingAI)</summary>' + [["wallH", "Wall height if not stated (m)"], ["skirtH", "Skirting height (mm)"], ["cornice", "Cornice girth (mm)"], ["doorW", "Door width (m)"], ["doorH", "Door height (m)"], ["winW", "Window width (m)"], ["winH", "Window height (m)"], ["coats", "Finish coats"], ["wallSpread", "Wall paint spread (m2 per litre per coat)"], ["ceilSpread", "Ceiling paint spread (m2/L)"], ["enamelSpread", "Enamel spread (m2/L)"], ["primerSpread", "Sealer / undercoat spread (m2/L)"], ["extSpread", "Exterior paint spread (m2/L)"], ["stainSpread", "Deck stain spread (m2/L)"], ["roofSpread", "Roof paint spread (m2/L)"], ["waste", "Waste (%)"]].map(r => '<label class="sf-wh">' + r[1] + ' <input type="number" step="0.01" data-qs="' + r[0] + '" value="' + qs(r[0]) + '"></label>').join("") + '<label class="sf-wh"><input type="checkbox" data-qs="undercoat"' + (qs("undercoat") ? " checked" : "") + "> Add a sealer / undercoat coat (walls and ceilings)</label>" + "</details>";
      if (trade === "tiling") h += '<details class="sf-qs"><summary>Measurement rules (same as TilingAI)</summary>' + [["upstand", "Waterproofing turns up the walls (mm)"], ["doorW", "Door width (m)"], ["doorH", "Door height (m)"], ["winW", "Window width (m)"], ["winH", "Window height (m)"], ["skirtMinH", "Leave out skirting when walls are tiled at least (m)"]].map(r => '<label class="sf-wh">' + r[1] + ' <input type="number" step="0.01" data-qs="' + r[0] + '" value="' + qs(r[0]) + '"></label>').join("") + '<label class="sf-wh"><input type="checkbox" data-qs="skipSkirt"' + (qs("skipSkirt") ? " checked" : "") + "> Leave out skirting where walls are tiled</label></details>"
      h += '<p class="muted sf-scale">' + (S.mpp ? "Scale set - " + esc(S.mppNote) : "Scale not set - areas and lengths need it (counts don't).") + "</p>";
      if (V.hint) h += '<p class="sf-hint">AI note: ' + esc(V.hint) + "</p>";
      h += overlay();
      const allPg = trade === "tiling" ? tilingCalc().pages : [];
      if (S.marks.length) {
        if (trade === "electrical") { const cnt = {}; S.marks.forEach(m => { cnt[m.type] = (cnt[m.type] || 0) + 1; }); h += '<div class="sf-leg">' + T.types.filter(t => cnt[t[0]]).map(t => '<span class="sf-chip"><i class="sf-dot" style="background:' + colorOf(t) + '">' + esc(ECODE[t[0]] || "") + "</i> " + esc(t[1]) + " <b>" + cnt[t[0]] + "</b></span>").join("") + "</div><details class=\"sf-all\"><summary>All " + S.marks.length + " marks - tap one to fix or delete</summary>"; }
        else if (S.marks.length) { const cnt = {}; S.marks.forEach(m => { cnt[m.type] = (cnt[m.type] || 0) + 1; }); h += '<div class="sf-leg">' + T.types.filter(t => cnt[t[0]]).map(t => '<span class="sf-chip"><i class="sf-dot" style="background:' + colorOf(t) + '"></i> ' + esc(t[1]) + " <b>" + cnt[t[0]] + "</b></span>").join("") + "</div>"; }
        h += '<div class="sf-marks">' + S.marks.map((m, i) => { const ti = typeInfo(m.type), q = measure(m); return '<div class="sf-mk' + (i === V.sel ? " on" : "") + '" data-sf="sel" data-i="' + i + '"><span class="sf-dot" style="background:' + colorOf(ti) + '">' + (i + 1) + '</span><span class="sf-ml">' + esc(m.label) + '<small>' + esc(ti[1]) + (m.w ? " " + m.w + "×" + (m.h || "?") + " m" : "") + '</small></span><b>' + esc(fmt(q)) + '</b>' + dimsHtml(m, i, ti) + '<button type="button" class="sf-x" data-sf="del" data-i="' + i + '" aria-label="Delete mark">✕</button></div>'; }).join("") + "</div>" + (trade === "electrical" ? "</details>" : "");
      }
      if (S.marks.length || allPg.length) {
        if (allPg.length > 1 || (allPg.length === 1 && allPg[0].page !== dr.page + 1)) h += '<p class="muted sf-pages">Totals cover ' + allPg.length + ' page' + (allPg.length === 1 ? "" : "s") + ": " + allPg.map(x => "p" + x.page + " (" + x.rooms + " room" + (x.rooms === 1 ? "" : "s") + ")").join(", ") + "</p>";
        h += '<table class="sf-tot"><tbody>' + totals().map(o => "<tr><td>" + esc(o.name) + "</td><td>" + (o.miss ? o.n + " marked" : esc(o.u === "no" ? o.v : o.v.toFixed(2) + " " + o.u)) + (o.det ? '<small class="muted"> ' + esc(o.det) + "</small>" : "") + "</td></tr>").join("") + '</tbody></table>' + (warnText() ? '<p class="sf-hint">' + esc(warnText().replace(/\n- CHECK: /g, " • ").trim()) + "</p>" : "") + '<div class="sf-acts"><button type="button" class="sf-primary" data-sf="toest">Send to the estimate (prices and totals)</button><button type="button" class="btn" data-sf="sheet">View marked-up sheet</button><button type="button" class="btn" data-sf="sharesheet">Share / save marked-up sheet</button><button type="button" class="btn" data-sf="tonotes">' + (notesBox() ? "Add these totals to the estimate notes" : "Show totals to copy") + "</button></div>" + (V.out ? '<textarea readonly rows="6">' + esc(V.out) + "</textarea>" : "");
      }
    }
    h += "</section></div>";
    mount.innerHTML = h; const chat = document.getElementById("sfChat"); if (chat) chat.scrollTop = chat.scrollHeight; if (V.busy) { drawFx(); hookBack(); }
    const msg = V.err || V.note; if (msg && !V.busy && msg !== V.seen) { V.seen = msg; const el = mount.querySelector(".sf-err,.sf-hint"); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); } else if (!msg) V.seen = "";
    const svg = document.getElementById("sfSvg"); if (svg) svg.addEventListener("click", onTap);
  }

  /* ---------- events ---------- */
  mount.addEventListener("change", async ev => {
    const t = ev.target;
    if (t.matches("[data-sfin=scope]") && t.files.length) { const fs = [...t.files]; t.value = ""; await addScope(fs); if (!V.err && !S.scope && (S.scopeText.trim() || V.scopePages.length)) readScope(""); }
    else if (t.matches("[data-sfin=draw]") && t.files[0]) { const f = t.files[0]; t.value = ""; await addDrawing(f); }
    else if (t.id === "sfType") V.addType = t.value;
    else if (t.dataset.qs) { S.qs = S.qs || {}; S.qs[t.dataset.qs] = t.type === "checkbox" ? t.checked : Number(t.value); save(); render(); }
    else if (t.dataset.mk) { const m = S.marks[Number(t.dataset.i)]; if (m) { const f = t.dataset.f; if (f.indexOf("cat:") === 0) { const c = f.slice(4); m.cats = (m.cats || []).filter(x => x !== c); if (t.checked) m.cats.push(c); } else if (f === "ded") m.ded = t.checked; else if (f === "dn") m.dn = t.value === "" ? null : Math.max(0, Math.round(Number(t.value) || 0)); else if (f === "ds" || f === "wm") m[f] = t.value; else m[f] = Number(t.value) || 0; save(); render(); } }
    else if (t.id === TXT) { S.scopeText = t.value; S.confirmed = false; save(); }
  });
  mount.addEventListener("input", ev => {   // typing the scope switches the read button on straight away
    if (ev.target.id !== TXT) return; S.scopeText = ev.target.value;
    const b = mount.querySelector("[data-sf=read]"); if (b) b.disabled = !!V.busy || !(S.scopeText.trim() || V.scopePages.length);
  });
  mount.addEventListener("click", async ev => {
    if (ev.target.closest("input,label")) return;
    const el = ev.target.closest("[data-sf]"); if (!el) return;
    const a = el.dataset.sf, i = Number(el.dataset.i);
    if (a === "clearscope") { ev.preventDefault(); S.scopeText = ""; S.pageNo = 0; S.scopeNames = []; S.scope = null; S.chat = []; S.confirmed = false; V.scopePages = []; V.scopePrev = []; save(); render(); }
    else if (a === "cleardraw") { ev.preventDefault(); V.draw = null; S.marks = []; S.mpp = null; S.sheets = {}; if (S.mode === "attach") S.mode = ""; save(); render(); }
    else if (a === "zoomimg") overlayImg(V.scopePrev[i].src);
    else if (a === "zoomdraw") overlayImg(V.draw.src);
    else if (a === "page") pickPage(i);
    else if (a === "manual") { S.mode = "manual"; save(); if (!el.getAttribute("href")) { const n = mount.nextElementSibling; if (n) n.scrollIntoView({ behavior: "smooth" }); render(); } }
    else if (a === "stop") { V.scan = 99; V.hold = false; if (V.all) { V.all = false; save(); } V.opId++; V.busy = ""; V.sub = ""; V.note = "Stopped."; render(); }
    else if (a === "read" || a === "reread") { if (a === "reread") { S.scope = null; S.chat = []; } readScope(""); }
    else if (a === "say") { const inp = document.getElementById("sfSay"), msg = inp && inp.value.trim(); if (msg) { S.chat.push({ who: "You", text: msg }); readScope(msg); } }
    else if (a === "confirm") { S.confirmed = true; save(); render(); const dz = mount.querySelectorAll(".sf-step")[2]; if (dz) dz.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (a === "unconfirm") { S.confirmed = false; save(); render(); }
    else if (a === "markup") markUp();
    else if (a === "markupall") startAll();
    else if (a === "pickpg") { const x = V.draw && V.draw.index && V.draw.index[i]; if (x) { x.pick = !!el.checked; save(); render(); } }
    else if (a === "resume") resumeRun();
    else if (a === "tool") { V.tool = V.tool === el.dataset.t ? "" : el.dataset.t; V.pts = []; V.calPts = []; V.err = ""; render(); }
    else if (a === "canceltool") { V.tool = ""; V.pts = []; render(); }
    else if (a === "finish") finishAdd();
    else if (a === "calok") applyCal();
    else if (a === "zin") { V.zoom = Math.min(500, V.zoom + 50); render(); }
    else if (a === "zout") { V.zoom = Math.max(100, V.zoom - 50); render(); }
    else if (a === "sel") { if (ev.target.closest("[data-sf=del]")) return; V.sel = V.sel === i ? -1 : i; render(); }
    else if (a === "del") { const m = S.marks[i]; if (m) { if (m.by === "ai") noteFix("User deleted an AI " + typeInfo(m.type)[1] + " mark called '" + m.label + "' - it was wrong or out of scope"); S.marks.splice(i, 1); V.sel = -1; save(); render(); } }
    else if (a === "toest") sendToEstimate();
    else if (a === "sheet") { try { overlayImg(await sheetImage()); } catch (e) { V.err = e.message; render(); } }
    else if (a === "sharesheet") { try { const r = await nat("shareImage", { dataUrl: await sheetImage(), filename: T.name + " marked-up sheet.jpg", text: "" }); if (!r.ok) { V.err = r.error || "Couldn't share the picture"; render(); } } catch (e) { V.err = e.message; render(); } }
    else if (a === "tonotes") {
      const txt = totalsText(), box = notesBox();
      if (box) { box.value = (box.value ? box.value + "\n\n" : "") + txt; box.dispatchEvent(new Event("input", { bubbles: true })); el.textContent = "✓ Added to the estimate notes"; }
      else { V.out = txt; render(); }
    }
  });
  mount.addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey && ev.target.id === "sfSay") { ev.preventDefault(); const b = mount.querySelector("[data-sf=say]"); if (b) b.click(); } });
  function overlayImg(src) {
    const o = document.createElement("div"); o.className = "sf-lightbox"; o.innerHTML = '<img src="' + src + '" alt="">'; o.addEventListener("click", () => o.remove()); document.body.appendChild(o);
  }
  /* Back button: while the AI works (or a picture is open) it must not leave the page - that would cancel the run */
  function hookBack() {
    const prev = window.onBack; if (prev && prev.__sf) return;
    const h = function () {
      const lb = document.querySelector(".sf-lightbox"); if (lb) { lb.remove(); return true; }
      if (V.busy) { V.note = "Still working - use Stop to cancel. You can switch to another app; it keeps running."; render(); return true; }
      return prev ? prev.apply(this, arguments) : false;
    };
    h.__sf = true; window.onBack = h;
  }
  { const ext = document.getElementById(TXT); if (ext && !mount.contains(ext)) { if (!S.scopeText && ext.value) S.scopeText = ext.value; ext.addEventListener("input", () => { S.scopeText = ext.value; S.confirmed = false; save(); const b = mount.querySelector("[data-sf=read]"); if (b) b.disabled = !!V.busy || !(S.scopeText.trim() || V.scopePages.length); }); } }
  hookBack(); window.addEventListener("load", hookBack); setTimeout(hookBack, 1500); hooks(); render(); restoreDrawing();
})();
