/* ShopMate AI - picks the drawing-set pages that need a tiling mark-up from the PDF's own text (title blocks + drawing register).
   No AI: CAD PDFs carry the sheet number, title and view titles as text. Pages with no text are checked for being blank;
   a page with drawings but no text (a scan) is left for the estimator / the AI.
   Works in the app (window.SFSheetPick) and in Node for tests (module.exports). */
(function (root) {
  "use strict";
  const NO_RE = /^[A-Z]{1,2}-?\d{2,4}(?:\.\d{1,2})?$/;
  const SKIP_RE = /EXISTING|DEMOLITION|PREPARATORY|FIRE|SMOKE|ROOF|REFLECTED CEILING|\bRCP\b|CEILING|\b3D\b|JOINERY|SET.?OUT|STRUCTURAL|SERVICES|HYDRAULIC|ELECTRICAL|MECHANICAL|LANDSCAPE|SITE PLAN|LOCALITY|COVER|DRAWING (SCHEDULE|REGISTER|LIST)|\bNOTES\b|PERSPECTIVE|RENDER|SIGNAGE|FURNITURE/;
  const DATA_RE = /SCHEDULE/;
  const PLAN_RE = /\bGA\b|GENERAL ARRANGEMENT|FLOOR PLAN|FINISHES PLAN|LEVEL \d+ PLAN|\bPLAN\b/;
  const VIEW_PLAN_RE = /(FLOOR PLAN|[-–] ?PLAN\b|PLAN VIEW|\bPLAN\s*$|ENLARGED PLAN)/;
  const NOT_FLOOR_RE = /ROOF|CEILING|\bRCP\b|SITE|DEMOLITION|EXISTING|SET.?OUT|FURNITURE|LANDSCAPE/;
  const STOP = new Set("ALL AND THE WITH FOR FROM FLOOR FLOORS WALL WALLS GROUND FIRST SECOND STAGE ROOMS ROOM AREA AREAS INTERNAL EXTERNAL REFER PER INCLUDING INCLUDED OTHER OTHERS EACH TYPICAL ACACIA LEVEL LEVELS ZONE ZONES WORKS WORK AS SHOWN DRAWINGS DRAWING SCHEDULE TILE TILES TILING ONLY TO OF IN ON AT BY BE".split(" "));

  /* the words in the confirmed scope that name rooms / areas ("ensuites", "utility room", "B-O-H (servery)" -> ENSUITE, UTILITY, SERVERY ...) */
  function scopeWords(scope) {
    const out = new Set(), cats = (scope && scope.categories) || [];
    cats.filter(c => c && c.included !== false).forEach(c => String(c.areas || "").toUpperCase().replace(/\(P\d+\)|P\d+/g, " ").split(/[^A-Z0-9-]+/).forEach(w => {
      w = w.replace(/^-+|-+$/g, ""); if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) return;
      out.add(w.replace(/(IES|S)$/, m => m === "IES" ? "Y" : ""));   // ensuites -> ENSUITE, balconies -> BALCONY
    }));
    return Array.from(out);
  }

  /* text of every page: lines (items grouped by height on the page), sizes, and whether anything is drawn */
  async function extract(pdfjs, data, onPage) {
    const doc = await pdfjs.getDocument({ data: data, isEvalSupported: false, disableFontFace: true }).promise, pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => { const p = vp.convertToViewportPoint(it.transform[4], it.transform[5]); return { s: it.str.trim(), x: p[0] / vp.width, y: p[1] / vp.height, h: Math.abs(it.height || it.transform[3] || 0) }; });
      let ops = 0; if (!items.length) { try { ops = (await pg.getOperatorList()).fnArray.length; } catch (e) { ops = 999; } }
      pages.push({ n: n, items: items, ops: ops });
      pg.cleanup(); if (onPage) onPage(n, doc.numPages);
    }
    try { await doc.destroy(); } catch (e) { }
    return pages;
  }
  function lines(items) {
    const rows = []; items.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach(it => { const r = rows.find(q => Math.abs(q.y - it.y) < 0.004); if (r) r.it.push(it); else rows.push({ y: it.y, it: [it] }); });
    return rows.map(r => r.it.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").toUpperCase());
  }
  /* drawing register: "A202  ACACIA - GA PLAN - GROUND FLOOR  1  16/07/26 ..." */
  function register(ls) {
    const reg = {}; let n = 0;
    ls.forEach(l => { const m = l.match(/\b([A-Z]{1,2}-?\d{2,4}(?:\.\d{1,2})?)\s+(.{4,100}?)\s+(\d{1,2}|[A-Z])\s+\d{1,2}\/\d{1,2}\/\d{2,4}/); if (m) { reg[m[1]] = { name: m[2].trim(), rev: m[3] }; n++; } });
    return n >= 6 ? reg : null;
  }

  function classify(pages, words) {
    const all = pages.map(p => ({ p: p, ls: lines(p.items) }));
    let reg = null, regPage = 0; all.forEach(x => { if (!reg) { const r = register(x.ls); if (r) { reg = r; regPage = x.p.n; } } });
    const W = (words || []).map(w => w.toUpperCase()).filter(Boolean);
    const out = all.map(x => {
      const p = x.p, txt = " " + x.ls.join(" \n ") + " ";
      if (p.n === regPage) return { page: p.n, no: "", title: "Drawing register", kind: "skip", pick: false, why: "drawing list" };
      if (!p.items.length) return p.ops < 15 ? { page: p.n, no: "", title: "", kind: "blank", pick: false, why: "blank page" } : { page: p.n, no: "", title: "(no text - scanned page)", kind: "unknown", pick: false, why: "no text to read - check it yourself" };
      /* sheet number: the biggest sheet-number-like text, preferring one the register lists, then the one nearest the bottom-right (title block) */
      const cands = p.items.filter(i => NO_RE.test(i.s)).map(i => ({ s: i.s, sc: (reg && reg[i.s] ? 1000 : 0) + i.h * 10 + (i.x + i.y) }));
      cands.sort((a, b) => b.sc - a.sc);
      const no = cands.length ? cands[0].s : "", rn = reg && reg[no] ? reg[no].name : "";
      const views = x.ls.filter(l => /PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE/.test(l) && l.length < 220);
      const title = rn || (views.find(l => /[A-Z]{3}/.test(l)) || "").slice(0, 80);
      const T = title.toUpperCase(), hasW = W.filter(w => txt.indexOf(w) >= 0);
      const planViews = views.filter(l => VIEW_PLAN_RE.test(l) && !NOT_FLOOR_RE.test(l));
      let kind, pick = false, why;
      if (SKIP_RE.test(T)) { kind = "skip"; why = "not a floor plan (" + (T.match(SKIP_RE) || [""])[0].toLowerCase() + ")"; }
      else if (DATA_RE.test(T)) { kind = "data"; why = "schedule - sizes for openings, not marked up"; }
      else if (/\bGA\b|GENERAL ARRANGEMENT|FLOOR PLAN|FINISHES PLAN/.test(T) && !NOT_FLOOR_RE.test(T)) { kind = "plan"; pick = true; why = "floor plan of the level - all scoped rooms"; }
      else if (planViews.length) { kind = "enlarged"; pick = hasW.length > 0; why = pick ? "enlarged plan with " + hasW.slice(0, 3).join(", ").toLowerCase() : "enlarged plan - nothing from the scope on it (tick if needed)"; }
      else if (/ELEVATION/.test(views.join(" ")) && !/SECTION|DETAIL/.test(T) && hasW.length) { kind = "data"; why = "elevations only - wall tile heights, not marked up"; }
      else if (/ELEVATION|SECTION|DETAIL/.test(T + " " + views.join(" "))) { kind = "skip"; why = "elevations / sections / details"; }
      else if (PLAN_RE.test(T)) { kind = "plan"; pick = hasW.length > 0 || !W.length; why = "plan"; }
      else { kind = "skip"; why = "no plan view found"; }
      return { page: p.n, no: no, title: title, kind: kind, pick: pick, why: why, rev: reg && reg[no] ? reg[no].rev : "" };
    });
    /* the same sheet number twice: only the latest revision is marked up */
    const best = {}; out.forEach(o => { if (!o.no) return; const b = best[o.no]; if (!b || String(o.rev) > String(b.rev)) best[o.no] = o; });
    out.forEach(o => { if (o.no && best[o.no] !== o && o.pick) { o.pick = false; o.why = "older copy of " + o.no; } });
    return { pages: out, register: reg ? Object.keys(reg).length : 0 };
  }
  const api = { extract: extract, classify: classify, scopeWords: scopeWords };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SFSheetPick = api;
})(typeof window !== "undefined" ? window : this);
