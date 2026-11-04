/* ShopMate AI - Tiling estimator (new look): Job -> Areas -> Extras -> Price. Saves on the phone as you go. */
(() => {
  "use strict";
  const E = window.EST, esc = E.esc, money = E.money, fmt = E.fmt, num = E.num, ico = E.ico, $ = id => document.getElementById(id);
  const STORE = "shopmate_tiling_estimator_v1", MATERIALS_KEY = "shopmate_tiling_materials_v1", CUR = "shopmate_tiling_current_v2";
  const uid = () => "tl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const STEPS = ["Job", "Areas", "Extras", "Price"];
  const SURF = ["Floor", "Wall", "External", "Feature", "Niche"];
  const KINDS = ["Skirting", "Border / feature", "Waterproofing", "Silicone / isolation joint", "Trim / transition", "Niche", "Splashback", "External paving", "Demolition / removal", "Preparation", "Exclusion / deduction", "Other"];
  const UNITS = ["m²", "lm", "each", "hour", "fixed"];
  const defaultMaterials = [
    { id: "sample-porcelain", name: "Porcelain tile (sample)", category: "Floor tile", length: 600, width: 600, price: 45, coverage: 0, pack: 0, supplier: "Replace with actual product" },
    { id: "sample-adhesive", name: "Tile adhesive (sample)", category: "Adhesive", length: 0, width: 0, price: 32, coverage: 4, pack: 20, supplier: "Coverage depends on trowel/substrate" },
    { id: "sample-grout", name: "Grout (sample)", category: "Grout", length: 0, width: 0, price: 18, coverage: 4, pack: 5, supplier: "Check product data sheet" },
    { id: "sample-silicone", name: "Sanitary silicone (sample)", category: "Silicone", length: 0, width: 0, price: 15, coverage: 10, pack: 1, supplier: "Linear metres per cartridge is product-dependent" },
    { id: "sample-waterproof", name: "Waterproofing membrane (sample)", category: "Waterproofing", length: 0, width: 0, price: 95, coverage: 8, pack: 15, supplier: "Check system requirements" }
  ];
  const read = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? JSON.parse(JSON.stringify(fb)) : v; } catch (e) { return JSON.parse(JSON.stringify(fb)); } };
  let materials = read(MATERIALS_KEY, defaultMaterials), T = null, step = 0;
  const persistMaterials = () => { try { localStorage.setItem(MATERIALS_KEY, JSON.stringify(materials)); } catch (e) { } };

  function blank() {
    return { id: uid(), jobName: "", customer: "", address: "", reference: "", notes: "", how: "site", pricingMethod: "unit", defaultWaste: 10, labourRate: "", labourProductivity: "", overhead: 0, profitMethod: "margin", profitPercent: 20, gstMode: "add", contingency: 0, quoteFormat: "itemised", tiles: [], others: [], phone: "", email: "", quotePhotos: true, vars: [], followups: [], photos: [], status: "draft", createdAt: new Date().toISOString() };
  }
  function tileDefaults() { return { id: uid(), name: "", areaMode: "area", length: 0, width: 0, height: 0, quantity: 1, area: 0, tileLength: 600, tileWidth: 600, waste: num(T ? T.defaultWaste : 10), unitPrice: "", labourRate: "", groutWidth: 3, groutDepth: 8, groutPrice: "", adhesiveCoverage: 4, adhesivePrice: "", kind: "Floor tile", surface: "Floor", notes: "" }; }
  const hasContent = t => !!(t.jobName || t.customer || t.tiles.some(x => tileArea(x) > 0 || x.name) || t.others.length);
  function save(quiet) {
    if (!T) return;
    try { localStorage.setItem(CUR, JSON.stringify({ id: T.id, step })); } catch (e) { }
    if (!hasContent(T)) return;
    const all = read(STORE, []), rec = { ...JSON.parse(JSON.stringify(T)), updatedAt: new Date().toISOString(), calculation: calculate(T) };
    const i = all.findIndex(x => x.id === rec.id); if (i >= 0) all[i] = rec; else all.unshift(rec);
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { E.toast("Could not save - phone storage is full"); return; }
    if (!quiet) E.toast("Saved");
  }

  /* ---------- maths (unchanged from the previous screens) ---------- */
  function tileArea(t) { if (t.areaMode === "room") return num(t.length) * num(t.width); if (t.areaMode === "wall") return num(t.length) * num(t.height); return num(t.area); }
  function calcTile(t, f) {
    const area = Math.max(0, tileArea(t)), waste = Math.max(0, Math.min(100, num(t.waste))) / 100, orderArea = area * (1 + waste);
    const tileM2 = (Math.max(1, num(t.tileLength)) * Math.max(1, num(t.tileWidth))) / 1e6, tileCount = tileM2 ? Math.ceil(orderArea / tileM2) : 0;
    const tileCost = orderArea * Math.max(0, num(t.unitPrice)), lr = t.labourRate === "" || t.labourRate == null ? num(f.labourRate) : num(t.labourRate), labour = area * lr;
    // grout kg/m2 = ((L+W)/(L*W)) * joint width * depth * density (1.6 kg/L, approximate - check the grout maker's calculator)
    const L = Math.max(1, num(t.tileLength)), W = Math.max(1, num(t.tileWidth)), groutKg = area * ((L + W) / (L * W)) * Math.max(0, num(t.groutWidth)) * Math.max(0, num(t.groutDepth)) * 1.6, groutCost = groutKg * Math.max(0, num(t.groutPrice));
    const adhesiveBags = num(t.adhesiveCoverage) > 0 ? Math.ceil(area / num(t.adhesiveCoverage)) : 0, adhesiveCost = adhesiveBags * Math.max(0, num(t.adhesivePrice));
    return { id: t.id, name: t.name || "Tile line", area, orderArea, tileCount, tileCost, labour, groutKg, groutCost, adhesiveBags, adhesiveCost, materials: tileCost + groutCost + adhesiveCost, subtotal: tileCost + groutCost + adhesiveCost + labour, unit: "m²", tileLength: num(t.tileLength), tileWidth: num(t.tileWidth) };
  }
  function calcOther(o) { const ded = o.kind === "Exclusion / deduction", qty = Math.max(0, num(o.quantity)), sell = qty * Math.max(0, num(o.rate)), material = Math.max(0, num(o.materialCost)), labour = Math.max(0, num(o.labourCost)); return { ...o, amount: ded ? -sell : sell, materials: material, labour, subtotal: ded ? -sell : (sell || material + labour), unit: o.unit }; }
  function calculate(f) {
    const lines = [...f.tiles.map(t => calcTile(t, f)), ...f.others.map(calcOther)];
    const material = lines.reduce((s, x) => s + x.materials, 0), labour = lines.reduce((s, x) => s + x.labour, 0);
    let base;
    if (f.pricingMethod === "unit") base = f.tiles.reduce((s, t) => { const x = calcTile(t, f); return s + x.tileCost + x.labour; }, 0) + f.others.reduce((s, o) => { const x = calcOther(o); return s + (num(o.rate) > 0 ? x.amount : x.materials + x.labour); }, 0);
    else base = material + labour;
    const overhead = base * Math.max(0, num(f.overhead)) / 100, contingency = (base + overhead) * Math.max(0, num(f.contingency)) / 100, cost = base + overhead + contingency;
    const pp = Math.max(0, Math.min(99, num(f.profitPercent))), exGST = f.profitMethod === "margin" ? cost / (1 - pp / 100) : cost * (1 + pp / 100);
    const gst = f.gstMode === "add" ? exGST * 0.1 : f.gstMode === "included" ? exGST / 11 : 0, total = f.gstMode === "add" ? exGST + gst : exGST;
    return { lines, material, labour, base, overhead, contingency, cost, profit: exGST - cost, gst, total, exGST, grand: f.gstMode === "included" ? exGST - gst : exGST };
  }

  /* ---------- home / saved / materials ---------- */
  const hdr = (title, sub, left, right) => '<header class="eh">' + left + '<div class="tt"><b>' + esc(title) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>" + (right || "") + "</header>";
  const backBtn = '<button class="ib" data-go="back" aria-label="Back">' + ico("back") + "</button>";
  const sorted = () => read(STORE, []).sort((a, c) => String(c.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  function jobRow(x) {
    const a = (x.tiles || []).reduce((s, t) => s + tileArea(t), 0), tot = x.calculation && x.calculation.total;
    return '<div class="jr" data-open="' + esc(x.id) + '"><div class="g"><b>' + esc(x.jobName || "Untitled job") + "</b><small>" + esc([x.customer, a ? fmt(a, 1) + " m²" : "", new Date(x.updatedAt || Date.now()).toLocaleDateString("en-AU", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")) +
      '</small></div><span class="pill ' + ({ quoted: "blue", accepted: "ok", invoiced: "ok" }[x.status] || "") + '">' + ({ quoted: "Quoted", accepted: "Accepted", invoiced: "Invoiced", declined: "Declined" }[x.status] || "Draft") + '</span><button class="ib" data-jmenu="' + esc(x.id) + '" aria-label="More">' + ico("dots") + "</button></div>";
  }
  function renderHome() {
    const b = E.biz(), all = sorted();
    $("vHome").innerHTML = hdr("Tiling estimator", b.name || "", '<a class="ib" href="../index.html" aria-label="Back to ShopMate">' + ico("back") + "</a>", '<button class="ib" data-go="materials" aria-label="Materials and rates">' + ico("gear") + "</button>") +
      '<div class="eb"><div class="row" style="margin:4px 0 12px"><button class="btn pri big" data-new>' + ico("plus") + "New take-off</button></div>" +
      '<div class="box"><button data-go="saved">Saved take-offs</button><button data-go="materials">Materials &amp; prices</button></div>' + JOB.waiting(all) +
      '<div class="lab">Recent take-offs</div>' + (all.length ? all.slice(0, 5).map(jobRow).join("") : '<div class="empty">No take-offs yet. Tap New take-off to start.</div>') + "</div>";
  }
  function renderSaved() {
    const all = sorted();
    $("vSaved").innerHTML = hdr("Saved take-offs", all.length + " take-off" + (all.length === 1 ? "" : "s"), backBtn, '<button class="ib" data-exportall aria-label="Back up all">' + ico("share") + "</button>") + '<div class="eb">' + (all.length ? all.map(jobRow).join("") : '<div class="empty">No saved take-offs yet.</div>') + "</div>";
  }
  function renderMaterials() {
    $("vMat").innerHTML = hdr("Materials & prices", "Your price library", backBtn) + '<div class="eb">' +
      (materials.length ? '<div class="card p0">' + materials.map(m => '<div class="li"><span class="g">' + esc(m.name) + "<small>" + esc([m.category, m.length && m.width ? m.length + "×" + m.width + " mm" : "", m.price ? money(m.price) : "Price not set", m.supplier].filter(Boolean).join(" · ")) + '</small></span><button class="ib" data-matremove="' + esc(m.id) + '" aria-label="Remove" style="border:0;background:none;color:var(--muted)">' + ico("trash") + "</button></div>").join("") + "</div>" : '<div class="empty">No materials saved.</div>') +
      '<div class="lab">Add a material</div><div class="fg"><label class="f w"><span>Name</span><input id="matName" placeholder="e.g. Porcelain floor tile"></label><label class="f w"><span>Category</span><select id="matCategory">' + ["Floor tile", "Wall tile", "Mosaic", "Adhesive", "Grout", "Waterproofing", "Silicone", "Trim", "Other"].map(c => "<option>" + c + "</option>").join("") + "</select></label>" +
      '<label class="f"><span>Tile length (mm)</span><input id="matLength" type="number" inputmode="decimal"></label><label class="f"><span>Tile width (mm)</span><input id="matWidth" type="number" inputmode="decimal"></label><label class="f"><span>Price ($/m² or unit)</span><input id="matPrice" type="number" inputmode="decimal" step="0.01"></label><label class="f"><span>Coverage</span><input id="matCoverage" type="number" inputmode="decimal" step="0.01"></label><label class="f"><span>Pack size</span><input id="matPack" type="number" inputmode="decimal"></label><label class="f"><span>Supplier / code</span><input id="matSupplier"></label></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn" data-matreset>Restore samples</button><button class="btn pri" data-matadd>Save material</button></div></div>';
  }

  /* ---------- the take-off ---------- */
  function startNew() { T = blank(); T.tiles = [{ ...tileDefaults(), name: "Floor tiles" }]; step = 0; save(true); E.go("est"); renderEst(); }
  function openJob(id) { const x = read(STORE, []).find(r => r.id === id); if (!x) return E.toast("Take-off not found"); T = { ...blank(), ...x }; step = (x.status && x.status !== "draft") || (x.calculation && x.calculation.total) ? 3 : x.tiles && x.tiles.length ? 1 : 0; save(true); E.go("est"); renderEst(); }
  function renderEst() {
    $("estHead").innerHTML = (step > 0 ? '<button class="ib" data-prev aria-label="Back one step">' + ico("back") : '<button class="ib" data-go="back" aria-label="Close">' + ico("close")) + '</button><div class="tt"><b>' + (read(STORE, []).some(x => x.id === T.id) ? "Take-off" : "New take-off") + "</b><small>" + esc(T.jobName || "Tiling") + "</small></div>";
    $("estSteps").innerHTML = E.steps(STEPS, step, "step");
    $("aiWrap").hidden = !(step === 0 && T.how === "ai");
    $("stepBody").innerHTML = [stepJob, stepAreas, stepExtras, stepPrice][step]();
    renderBar();
  }
  function renderBar() {
    const area = T.tiles.reduce((s, t) => s + tileArea(t), 0), c = step === 3 ? calculate(T) : null;
    const t = step === 0 ? null : step === 3 ? ["Total" + (T.gstMode === "none" ? "" : " (GST incl.)"), money(c.total)] : ["Tiled area", fmt(area, 1) + " m²"];
    const btns = step === 0 ? ['<button class="btn" data-savedraft>Save draft</button>', '<button class="btn pri" data-next>Next</button>']
      : step === 3 ? ['<button class="btn" data-savedraft>Save draft</button>', '<button class="btn pri" data-quote>Make quote</button>']
      : ['<button class="btn" data-prev>Back</button>', '<button class="btn pri" data-next>Next: ' + STEPS[step + 1] + "</button>"];
    $("estBar").innerHTML = (t ? '<div class="bt"><span>' + t[0] + "</span><b>" + t[1] + "</b></div>" : "") + '<div class="row">' + btns.join("") + "</div>";
  }
  const fld = (label, key, type, ph, w, id) => '<label class="f' + (w ? " w" : "") + '"><span>' + label + "</span>" + (type === "ta" ? '<textarea data-j="' + key + '"' + (id ? ' id="' + id + '"' : "") + ' rows="3" placeholder="' + esc(ph || "") + '">' + esc(T[key] || "") + "</textarea>" : '<input data-j="' + key + '" ' + (type === "n" ? 'type="number" inputmode="decimal" step="0.01"' : 'type="text"') + ' value="' + esc(T[key] == null ? "" : T[key]) + '" placeholder="' + esc(ph || "") + '">') + "</label>";
  const opt = (k, ic, t, s, tag) => '<button class="opt" data-how="' + k + '" aria-pressed="' + (T.how === k) + '"><span class="oi">' + ico(ic) + "</span><span><b>" + t + (tag ? ' <span class="pill blue">' + tag + "</span>" : "") + "</b><small>" + s + "</small></span></button>";
  const tf = (l, k, type, ph, extra) => '<label class="f"><span>' + l + '</span><input data-j="' + k + '" type="' + type + '" value="' + esc(T[k] || "") + '" placeholder="' + esc(ph) + '"' + (extra || "") + "></label>";
  function stepJob() {
    return '<div class="stack">' + fld("Job name", "jobName", "t", "e.g. Smith ensuite") + tf("Customer", "customer", "text", "Name - or pick from your customers", ' list="custL" autocomplete="off"') + JOB.custList() + '<div class="fg">' + tf("Mobile", "phone", "tel", "For follow-ups") + tf("Email", "email", "email", "") + "</div>" + fld("Site address", "address", "t", "Street, suburb") + fld("Reference", "reference", "t", "Optional") + fld("Notes", "notes", "ta", "Scope notes, assumptions, exclusions", false, "notes") + "</div>" +
      '<button class="add" data-jx="photos" style="margin-top:12px">' + ico("photo") + "Before photos" + ((T.photos || []).length ? " · " + T.photos.filter(p => p.kind === "before").length : "") + "</button>" +
      '<div class="lab">How do you want to measure?</div>' +
      opt("ai", "ai", "AI from scope + drawings", "Upload the scope of work and the plans. AI reads them, you check and confirm, then AI marks up the drawing and adds the tile lines.", "AI") +
      opt("site", "cam", "Measure on site", "Measure each floor and wall with the camera, or type the sizes.");
  }
  function lineSub(t) { return [t.tileLength && t.tileWidth ? t.tileLength + " × " + t.tileWidth : "", t.surface, t.areaMode === "wall" && t.height ? "to " + fmt(t.height, 2) + " m" : ""].filter(Boolean).join(" · "); }
  function tileCard(t) {
    const a = tileArea(t), done = a > 0;
    return '<div class="card"><div class="rc-h"><div class="g"><b>' + esc(t.name || "Tile line") + "</b><small>" + esc(lineSub(t)) + '</small></div><span class="pill ' + (done ? "ok" : "warn") + '">' + (done ? fmt(a, 1) + " m²" : "Not measured") + '</span><button class="ib" data-tedit="' + esc(t.id) + '" aria-label="Edit">' + ico("dots") + "</button></div>" +
      '<div class="row"><button class="btn' + (done ? "" : " pri") + '" data-tmeasure="' + esc(t.id) + '">' + ico("cam") + 'Measure</button><button class="btn" data-tedit="' + esc(t.id) + '">' + ico("pen") + "Type sizes</button></div></div>";
  }
  function stepAreas() { return '<p class="hint" style="margin:0 0 10px">Each tile type and size is its own line.</p>' + T.tiles.map(tileCard).join("") + '<button class="add" data-addtile>' + ico("plus") + "Add area</button>"; }
  function stepExtras() {
    return '<p class="hint" style="margin:0 0 10px">Skirting, waterproofing, joints, niches and other work outside the tile area.</p>' +
      (T.others.length ? '<div class="card p0">' + T.others.map(o => { const x = calcOther(o); return '<div class="li" data-oedit="' + esc(o.id) + '"><span class="g">' + esc(o.name) + "<small>" + fmt(o.quantity) + " " + esc(o.unit) + " · " + esc(o.kind) + "</small></span><b>" + money(x.subtotal) + "</b></div>"; }).join("") + "</div>" : "") +
      '<button class="add" data-addother>' + ico("plus") + "Add scope line</button>";
  }
  function stepPrice() {
    const pf = (l, k) => '<label class="f"><span>' + l + '</span><input data-j="' + k + '" type="number" inputmode="decimal" step="0.01" value="' + esc(T[k]) + '"></label>';
    return JOB.card(T) + '<div class="lab" style="margin-top:4px">How do you price?</div>' + E.box([["unit", "Unit rates"], ["cost", "Cost build-up"]], T.pricingMethod, "pricing") +
      '<div class="fg" style="margin-top:8px">' + pf("Labour rate ($/m²)", "labourRate") + pf("Hours per 10 m²", "labourProductivity") + pf("Overheads (%)", "overhead") + pf("Contingency (%)", "contingency") + pf(T.profitMethod === "margin" ? "Margin (%)" : "Markup (%)", "profitPercent") + pf("Default wastage (%)", "defaultWaste") + "</div>" +
      '<div style="height:8px"></div>' + E.box([["margin", "Gross margin"], ["markup", "Markup on cost"]], T.profitMethod, "pmethod") +
      '<div class="lab">GST</div>' + E.box([["add", "Add 10% GST"], ["included", "GST included"], ["none", "No GST"]], T.gstMode, "gst", "c3") +
      '<div class="lab">Before photos on the quote</div>' + E.box([["1", "With photos"], ["0", "No photos"]], T.quotePhotos === false ? "0" : "1", "qph") +
      '<div class="lab">Quote shows</div>' + E.box([["itemised", "Each line"], ["simple", "One total"]], T.quoteFormat, "qfmt") +
      '<div id="resBox">' + resultHtml() + "</div>";
  }
  function resultHtml() {
    const c = calculate(T);
    const mat = c.lines.filter(l => l.area !== undefined && l.area > 0).map(l => '<div class="li"><span class="g">' + esc(l.name) + "<small>" + fmt(l.orderArea, 1) + " m² incl. waste · " + l.tileCount + " tiles · " + fmt(l.groutKg, 1) + " kg grout · " + l.adhesiveBags + " adhesive bags</small></span><b>" + money(l.subtotal) + "</b></div>").join("") +
      c.lines.filter(l => l.area === undefined).map(l => '<div class="li"><span class="g">' + esc(l.name) + "<small>" + fmt(l.quantity) + " " + esc(l.unit) + "</small></span><b>" + money(l.subtotal) + "</b></div>").join("");
    return '<div class="lab">Materials &amp; lines</div>' + (mat ? '<div class="card p0">' + mat + "</div>" : '<div class="empty">Measure an area or add a line first.</div>') +
      '<div class="card"><div class="kv"><span>Materials</span><b>' + money(c.material) + '</b></div><div class="kv"><span>Labour</span><b>' + money(c.labour) + "</b></div>" + (c.overhead ? '<div class="kv"><span>Overheads</span><b>' + money(c.overhead) + "</b></div>" : "") + (c.contingency ? '<div class="kv"><span>Contingency</span><b>' + money(c.contingency) + "</b></div>" : "") +
      '<div class="kv"><span>' + (T.profitMethod === "margin" ? "Margin" : "Markup") + " " + fmt(T.profitPercent, 1) + '%</span><b>' + money(c.profit) + "</b></div>" + (c.gst ? '<div class="kv"><span>GST</span><b>' + money(c.gst) + "</b></div>" : "") + '<div class="kv big"><span>Total</span><b>' + money(c.total) + "</b></div></div>";
  }

  /* line sheets */
  function tileSheet(id) {
    const t = T.tiles.find(x => x.id === id); if (!t) return;
    const n = (l, k, st) => '<label class="f"><span>' + l + '</span><input data-tk="' + k + '" type="number" inputmode="decimal" step="' + (st || "0.01") + '" value="' + esc(t[k] === 0 || t[k] === "" ? (k === "waste" ? 0 : "") : t[k]) + '"></label>';
    const s = E.sheet("<h3>" + esc(t.name || "Tile line") + '</h3><p class="sub">Sizes in metres, tiles in mm</p>' +
      '<div class="fg"><label class="f w"><span>Name / tile type</span><input data-tk="name" value="' + esc(t.name) + '" placeholder="e.g. Bathroom floor"></label></div>' +
      '<div class="lab">Surface</div><div id="tsS">' + E.box(SURF.slice(0, 4).map(x => [x, x]), t.surface, "tsurf") + "</div>" +
      '<div class="lab">Measure as</div><div id="tsM">' + E.box([["area", "Area (m²)"], ["room", "Length × width"], ["wall", "Length × height"]], t.areaMode, "tmode", "c3") + "</div>" +
      '<div class="fg" style="margin-top:8px" id="tsF"></div>' +
      '<div class="lab">Tile</div><div class="fg">' + n("Tile length (mm)", "tileLength", "1") + n("Tile width (mm)", "tileWidth", "1") + n("Wastage (%)", "waste", "0.5") + n("Tile price ($/m²)", "unitPrice") + n("Labour ($/m², blank = default)", "labourRate") + "</div>" +
      '<div class="lab">Grout &amp; adhesive</div><div class="fg">' + n("Grout joint (mm)", "groutWidth", "0.5") + n("Grout depth (mm)", "groutDepth", "0.5") + n("Grout price ($/kg)", "groutPrice") + n("Adhesive m² per bag", "adhesiveCoverage", "0.1") + n("Adhesive price ($/bag)", "adhesivePrice") + "</div>" +
      '<div class="fg" style="margin-top:8px"><label class="f w"><span>Notes</span><input data-tk="notes" value="' + esc(t.notes) + '" placeholder="Set-out, cuts, substrate"></label></div>' +
      '<div class="row end"><button class="btn danger" data-tdel>' + ico("trash") + 'Delete</button><button class="btn pri" data-tok>Done</button></div>');
    const dims = () => { s.querySelector("#tsF").innerHTML = t.areaMode === "area" ? n("Area (m²)", "area") : t.areaMode === "room" ? n("Length (m)", "length") + n("Width (m)", "width") : n("Length / perimeter (m)", "length") + n("Height (m)", "height"); };
    dims();
    s.addEventListener("input", e => { const k = e.target.dataset.tk; if (!k) return; t[k] = k === "name" || k === "notes" ? e.target.value : (k === "labourRate" || k === "unitPrice" || k === "groutPrice" || k === "adhesivePrice") && e.target.value === "" ? "" : num(e.target.value); if (k === "name") s.querySelector("h3").textContent = t.name || "Tile line"; });
    s.addEventListener("click", e => {
      const sf = e.target.closest("[data-tsurf]"); if (sf) { t.surface = sf.dataset.tsurf; t.kind = t.surface === "Wall" ? "Wall tile" : "Floor tile"; s.querySelectorAll("[data-tsurf]").forEach(b => b.setAttribute("aria-pressed", b === sf)); return; }
      const md = e.target.closest("[data-tmode]"); if (md) { t.areaMode = md.dataset.tmode; s.querySelectorAll("[data-tmode]").forEach(b => b.setAttribute("aria-pressed", b === md)); dims(); return; }
      if (e.target.closest("[data-tdel]")) { E.ask("Delete " + (t.name || "this line") + "?", "It will be removed from the take-off.", "Delete", () => { T.tiles = T.tiles.filter(x => x !== t); save(true); renderEst(); }, true); return; }
      if (e.target.closest("[data-tok]")) { E.closeSheet(); save(true); renderEst(); }
    });
  }
  function otherSheet(id) {
    let o = T.others.find(x => x.id === id), isNew = false;
    if (!o) { o = { id: uid(), name: "Skirting", kind: "Skirting", unit: "lm", quantity: 0, rate: "", materialCost: "", labourCost: "", notes: "" }; isNew = true; }
    const n = (l, k) => '<label class="f"><span>' + l + '</span><input data-ok2="' + k + '" type="number" inputmode="decimal" step="0.01" value="' + esc(o[k]) + '"></label>';
    const s = E.sheet("<h3>" + (isNew ? "New scope line" : esc(o.name)) + "</h3>" +
      '<div class="fg" style="margin-top:10px"><label class="f w"><span>Description</span><input data-ok2="name" value="' + esc(o.name) + '"></label><label class="f w"><span>Category</span><select data-ok2="kind">' + KINDS.map(k => "<option" + (o.kind === k ? " selected" : "") + ">" + k + "</option>").join("") + "</select></label></div>" +
      '<div class="lab">Unit</div>' + E.box(UNITS.slice(0, 3).map(u => [u, u]), o.unit, "ounit", "c3") +
      '<div class="fg" style="margin-top:8px">' + n("Quantity", "quantity") + n("Sell rate ($/unit)", "rate") + n("Material cost ($)", "materialCost") + n("Labour cost ($)", "labourCost") + "</div>" +
      '<div class="row end">' + (isNew ? '<button class="btn" data-x>Cancel</button>' : '<button class="btn danger" data-odel>' + ico("trash") + "Delete</button>") + '<button class="btn pri" data-ook>' + (isNew ? "Add" : "Done") + "</button></div>");
    s.addEventListener("input", e => { const k = e.target.dataset.ok2; if (!k) return; o[k] = k === "name" || k === "kind" ? e.target.value : e.target.value === "" ? "" : num(e.target.value); });
    s.addEventListener("change", e => { if (e.target.dataset.ok2 === "kind") { o.kind = e.target.value; if (!o.name || KINDS.indexOf(o.name) >= 0) { o.name = o.kind; s.querySelector('[data-ok2="name"]').value = o.name; } } });
    s.addEventListener("click", e => {
      const u = e.target.closest("[data-ounit]"); if (u) { o.unit = u.dataset.ounit; s.querySelectorAll("[data-ounit]").forEach(b => b.setAttribute("aria-pressed", b === u)); return; }
      if (e.target.closest("[data-x]")) { E.closeSheet(); return; }
      if (e.target.closest("[data-odel]")) { T.others = T.others.filter(x => x !== o); E.closeSheet(); save(true); renderEst(); return; }
      if (e.target.closest("[data-ook]")) { if (isNew) T.others.push(o); E.closeSheet(); save(true); renderEst(); }
    });
  }
  function measureLine(id) {
    const t = T.tiles.find(x => x.id === id); if (!t) return;
    Measure.open({ job: T.id, line: id }, { title: t.name || "Tile line", whats: ["floor", "walls"], what: t.surface === "Wall" ? "walls" : "floor", height: num(t.height) || 2.1, heightLabel: "Tiled height", ceiling: false });
  }
  Measure.init({
    apply(ctx, res) {
      if (!T || T.id !== ctx.job) { const x = read(STORE, []).find(r => r.id === ctx.job); if (!x) return; T = { ...blank(), ...x }; }
      const t = T.tiles.find(x => x.id === ctx.line); if (!t || !res.floor) return;
      if (res.what === "walls") { t.areaMode = "wall"; t.length = Math.round(res.floor.perimeter * 100) / 100; t.height = Math.round((res.height || t.height || 2.1) * 100) / 100; t.surface = "Wall"; t.kind = "Wall tile"; }
      else { t.areaMode = "area"; t.area = Math.round(res.floor.area * 100) / 100; }
      t.measured = res.floor.method; step = 1; save(true); if (E.view !== "est") E.go("est"); renderEst(); E.toast((t.name || "Area") + " measured");
    }
  });

  /* ---------- quote / exports ---------- */
  function fileBase() { return ((T.jobName || "").trim() || "Tiling") + " - Tiling quote - " + new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
  function quoteHtml(P) {
    const c = calculate(T), b = E.biz(), item = T.quoteFormat !== "simple";
    const rows = item ? c.lines.map(l => "<tr><td>" + esc(l.name) + (l.area !== undefined ? "<br><small>" + fmt(l.orderArea, 1) + " m² incl. waste · " + l.tileCount + " tiles · " + fmt(l.groutKg, 1) + " kg grout · " + l.adhesiveBags + " adhesive bags</small>" : "") + "</td><td>" + fmt(l.area !== undefined ? l.area : l.quantity, 2) + " " + esc(l.unit) + "</td><td>" + money(l.subtotal) + "</td></tr>").join("") : "<tr><td>Tiling works as described</td><td></td><td>" + money(c.exGST - (T.gstMode === "included" ? c.gst : 0)) + "</td></tr>";
    return '<!doctype html><html><head><meta charset="utf-8"><title>Quote</title><style>body{font:13px Arial,sans-serif;color:#202124;margin:36px}header{display:flex;justify-content:space-between;border-bottom:2px solid #1A73E8;padding-bottom:14px}h1{font-size:24px;margin:0 0 4px;color:#1A73E8}h2{font-size:15px;margin:22px 0 6px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #DADCE0;vertical-align:top}small{color:#5F6368}th{font-size:11px;color:#5F6368;text-transform:uppercase}td:last-child,th:last-child{text-align:right}.tot{margin:16px 0 0 auto;width:280px}.tot p{display:flex;justify-content:space-between;margin:4px 0}.grand{font-size:18px;font-weight:bold;border-top:2px solid #202124;padding-top:8px}.note{margin-top:28px;color:#5F6368;font-size:11px}</style></head><body>' +
      "<header><div><h1>Tiling quote</h1><b>" + esc(T.jobName || "Tiling") + "</b><div>" + esc(T.address || "") + "</div></div><div style=\"text-align:right\"><b>" + esc(b.name || "") + "</b><div>" + esc([b.phone, b.email].filter(Boolean).join(" · ")) + "</div>" + (b.abn ? "<div>ABN " + esc(b.abn) + "</div>" : "") + "<div>" + new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) + "</div></div></header>" +
      "<p><b>Prepared for:</b> " + esc(T.customer || "Customer") + (T.reference ? " · Ref " + esc(T.reference) : "") + "</p>" + (T.notes ? "<h2>Scope</h2><p>" + esc(T.notes).replace(/\n/g, "<br>") + "</p>" : "") +
      (P && P.length ? '<h2>Current condition</h2><div style="display:flex;flex-wrap:wrap;gap:8px">' + P.map(p => '<div style="width:calc(33% - 6px)"><img src="' + p.src + '" style="width:100%;border-radius:6px"><div style="font-size:11px;color:#5F6368">' + esc(p.room || "") + "</div></div>").join("") + "</div>" : "") +
      "<h2>Price</h2><table><thead><tr><th>Description</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      '<div class="tot"><p><span>Subtotal</span><b>' + money(c.grand) + "</b></p>" + (c.gst ? "<p><span>GST</span><b>" + money(c.gst) + "</b></p>" : "") + '<p class="grand"><span>Total</span><span>' + money(c.total) + "</span></p></div>" +
      '<p class="note">Quantities are estimates from the measured areas. Final set-out, cuts, substrate and product data are confirmed on site.</p></body></html>';
  }
  function exportCsv() {
    const c = calculate(T), rows = [["Project", T.jobName], ["Customer", T.customer], ["Address", T.address], ["Measured tile area (m2)", T.tiles.reduce((s, t) => s + tileArea(t), 0)], ["Subtotal ex GST", c.exGST], ["GST", c.gst], ["Total", c.total], [], ["Line", "Measured m2", "Order m2", "Tile count", "Grout kg", "Adhesive bags", "Materials", "Labour", "Line total"]];
    c.lines.forEach(l => rows.push([l.name, l.area != null ? l.area : l.quantity, l.orderArea != null ? l.orderArea : "", l.tileCount != null ? l.tileCount : "", l.groutKg != null ? l.groutKg : "", l.adhesiveBags != null ? l.adhesiveBags : "", l.materials, l.labour, l.subtotal]));
    E.share(fileBase() + ".csv", rows.map(r => r.map(v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\r\n"), "text/csv");
  }

  /* ---------- events ---------- */
  document.addEventListener("click", e => {
    const el = e.target.closest("button,[data-open],[data-oedit],a"); if (!el) return;
    const d = el.dataset;
    if (d.go) { if (d.go === "back") E.back(); else E.go(d.go); refresh(); return; }
    if (d.new != null) { startNew(); return; }
    if (d.jmenu) { e.stopPropagation(); const id = d.jmenu, x = read(STORE, []).find(r => r.id === id); if (!x) return; E.menu([["Open", () => openJob(id)], ["Delete", () => E.ask("Delete " + (x.jobName || "this take-off") + "?", "It will be removed from this phone.", "Delete", () => { JOB.removeJob(x); localStorage.setItem(STORE, JSON.stringify(read(STORE, []).filter(r => r.id !== id))); refresh(); }, true), true]]); return; }
    if (d.jfu) { const x = read(STORE, []).find(r => r.id === d.jfu); if (x) JOB.followUp(x); return; }
    if (d.open) { openJob(d.open); return; }
    if (d.exportall != null) { E.share("shopmate-tiling-all-data.json", JSON.stringify({ exportedAt: new Date().toISOString(), estimates: read(STORE, []), materials }, null, 2), "application/json"); return; }
    if (d.matadd != null) { const name = $("matName").value.trim(); if (!name) return E.toast("Enter a material name"); materials.push({ id: uid(), name, category: $("matCategory").value, length: num($("matLength").value), width: num($("matWidth").value), price: num($("matPrice").value), coverage: num($("matCoverage").value), pack: num($("matPack").value), supplier: $("matSupplier").value.trim() }); persistMaterials(); renderMaterials(); E.toast("Material saved"); return; }
    if (d.matremove) { materials = materials.filter(m => m.id !== d.matremove); persistMaterials(); renderMaterials(); return; }
    if (d.matreset != null) { E.ask("Restore the sample materials?", "Your own materials list will be replaced.", "Restore", () => { materials = JSON.parse(JSON.stringify(defaultMaterials)); persistMaterials(); renderMaterials(); }); return; }
    if (!T) return;
    if (JOB.handle(el, T)) return;
    if (d.step != null) { step = +d.step; save(true); renderEst(); window.scrollTo(0, 0); return; }
    if (d.next != null) { if (step < 3) { step++; save(true); renderEst(); window.scrollTo(0, 0); } return; }
    if (d.prev != null) { if (step > 0) { step--; save(true); renderEst(); window.scrollTo(0, 0); } return; }
    if (d.savedraft != null) { if (!hasContent(T)) return E.toast("Add a job name or an area first"); save(); E.home("home"); refresh(); return; }
    if (d.quote != null) { E.menu([["Quote PDF", async () => { JOB.quoteSent(T); save(true); renderEst(); const P = T.quotePhotos === false ? [] : await JOB.quotePhotos(T); E.pdf(quoteHtml(P), fileBase().replace(/[\\/:*?"<>|]/g, "") + ".pdf"); }], ["Spreadsheet (CSV)", exportCsv], ["Backup (JSON)", () => E.share(fileBase() + " backup.json", JSON.stringify({ exportedAt: new Date().toISOString(), estimate: T, materials }, null, 2), "application/json")]]); return; }
    if (d.how) { T.how = d.how; save(true); renderEst(); if (T.how === "ai") setTimeout(() => $("aiWrap").scrollIntoView({ behavior: "smooth", block: "start" }), 60); return; }
    if (d.pricing) { T.pricingMethod = d.pricing; save(true); renderEst(); return; }
    if (d.pmethod) { T.profitMethod = d.pmethod; save(true); renderEst(); return; }
    if (d.qph) { T.quotePhotos = d.qph === "1"; save(true); return renderEst(); }
    if (d.gst) { T.gstMode = d.gst; save(true); renderEst(); return; }
    if (d.qfmt) { T.quoteFormat = d.qfmt; save(true); renderEst(); return; }
    if (d.addtile != null) { const t = { ...tileDefaults(), name: "Area " + (T.tiles.length + 1) }; T.tiles.push(t); save(true); renderEst(); tileSheet(t.id); return; }
    if (d.tedit) { tileSheet(d.tedit); return; }
    if (d.tmeasure) { measureLine(d.tmeasure); return; }
    if (d.addother != null) { otherSheet(""); return; }
    if (d.oedit) { otherSheet(d.oedit); return; }
  });
  document.addEventListener("input", e => {
    const t = e.target, k = t.dataset.j; if (!T || !k) return;
    T[k] = t.type === "number" ? (t.value === "" && (k === "labourRate" || k === "labourProductivity") ? "" : num(t.value)) : t.value;
    if (k === "customer" && JOB.custFill(T)) { save(true); return renderEst(); }
    if (k === "jobName") $("estHead").querySelector("small").textContent = T.jobName || "Tiling";
    clearTimeout(save.t); save.t = setTimeout(() => save(true), 400);
    const rb = $("resBox"); if (rb) rb.innerHTML = resultHtml();
    renderBar();
  });
  function refresh() { const v = E.view; if (v === "home") renderHome(); else if (v === "saved") renderSaved(); else if (v === "materials") renderMaterials(); }
  document.addEventListener("est-view", e => { if (e.detail === "est") { if (T) renderEst(); return; } if (T) save(true); if (e.detail !== "photos") { try { localStorage.removeItem(CUR); } catch (x) { } } refresh(); });
  /* after the quote: photos, follow-ups, variations, invoice */
  JOB.init({
    trade: "Tiling", job: () => T, name: j => j.jobName, rooms: j => (j.tiles || []).map(x => x.name).filter(Boolean),
    save: j => { if (!j || j === T) save(true); else { const all = read(STORE, []), i = all.findIndex(x => x.id === j.id); if (i >= 0) { all[i] = j; try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { } } } },
    render: () => { if (E.view === "est" && T) renderEst(); else refresh(); },
    total: j => calculate({ ...blank(), ...j }).total, gstAdd: j => j.gstMode === "add",
    lines: j => [{ name: "Tiling works - " + (j.jobName || "as quoted"), qty: 1, ex: calculate({ ...blank(), ...j }).grand }]
  });
  /* the phone's back button goes back one step inside a take-off */
  { const pb = window.onBack; window.onBack = function () { if (E.view === "est" && T && step > 0 && !document.querySelector(".sheet,.phed")) { step--; save(true); renderEst(); window.scrollTo(0, 0); return true; } return pb.apply(this, arguments); }; }

  /* AI mark-up -> take-off lines: area rows become tile lines, the rest scope lines; sent again = replaced */
  window.addEventListener("sf-lines", e => {
    const d = e.detail, AREA = ["floor_tile", "wet_area_floor", "wall_tile", "external_paving"], wall = k => /wall|splash/.test(k);
    if (!T) { T = blank(); }
    T.tiles = T.tiles.filter(t => !String(t.id).startsWith("sf_") && !(tileArea(t) === 0 && !num(t.unitPrice))); T.others = T.others.filter(o => !String(o.id).startsWith("sf_"));
    const kind = { waterproofing: "Waterproofing", skirting_border: "Skirting", splashback: "Splashback", border_feature_strip: "Border / feature", niche_count: "Niche", movement_joints: "Silicone / isolation joint", falls_drains: "Other" }; let n = 0;
    d.rows.forEach(r => {
      if (AREA.indexOf(r.key) >= 0) { T.tiles.push({ ...tileDefaults(), id: "sf_" + r.key, name: r.name, areaMode: "area", area: Math.round(r.v * 100) / 100, kind: wall(r.key) ? "Wall tile" : "Floor tile", surface: wall(r.key) ? "Wall" : "Floor" }); n++; }
      else { T.others.push({ id: "sf_" + r.key, name: r.name, kind: kind[r.key] || "Other", unit: r.u === "no" ? "each" : r.u, quantity: Math.round(r.v * 100) / 100, rate: "", materialCost: "", labourCost: "", notes: "" }); n++; }
    });
    save(true); d.done("Added " + n + " lines to the take-off. Add tile prices and rates on the Price step.");
    if (!d.silent) { step = 1; renderEst(); window.scrollTo(0, 0); } else renderBar();
  });

  /* ---------- start ---------- */
  { // a take-off left open on the old screens becomes a saved draft
    const old = read(STORE + "_draft", null);
    if (old && (old.jobName || (old.tiles || []).some(t => tileArea(t) > 0))) { const all = read(STORE, []); if (!all.some(x => x.id && x.id === old.id)) { all.unshift({ ...old, id: old.id || uid(), updatedAt: new Date().toISOString() }); try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { } } }
    try { localStorage.removeItem(STORE + "_draft"); } catch (e) { }
  }
  let cur = null; try { cur = JSON.parse(localStorage.getItem(CUR) || "null"); } catch (e) { }
  const rec = cur && read(STORE, []).find(x => x.id === cur.id);
  E.show("home"); renderHome();
  if (rec) { T = { ...blank(), ...rec }; step = cur.step || 0; E.go("est"); save(true); renderEst(); }
})();
