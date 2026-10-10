(function () { var module = { exports: {} };
// Turns the app's PDF model (the same one the phone uses) into an A4 page, then into a PDF.
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#1B2230";
  const n = parseInt(m[1], 16), l = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  return l < 0.55 ? "#FFFFFF" : "#1B2230";
}

function modelHtml(m) {
  const acc = /^#[0-9a-f]{6}$/i.test(m.accent || "") ? m.accent : "#E3A21A", ink = inkOn(acc);
  const b = m.business || {}, c = m.customer || {};
  const cols = Array.isArray(m.cols) && m.cols.length === 4 ? m.cols : ["ITEM", "QTY", "PRICE", "AMOUNT"];
  const totals = (m.totals || []).map(t => Array.isArray(t) ? t : [t.label, t.value, t.bold]);
  const contact = [b.abn ? "ABN " + b.abn : "", b.phone, b.email, b.address].filter(Boolean);
  const to = [c.name, c.address, c.phone, c.email].filter(Boolean);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#1B2230;font-size:10.5pt}
.top{background:${acc};color:${ink};padding:14mm 16mm 9mm;display:flex;justify-content:space-between;gap:10mm;border-bottom:3px solid rgba(0,0,0,.18)}
.brand{display:flex;gap:5mm;align-items:center}
.brand img{width:22mm;height:22mm;object-fit:contain;background:#fff;border-radius:3mm;padding:1mm}
.brand h1{margin:0;font-size:19pt;line-height:1.1}
.brand .tag{opacity:.85;font-size:9.5pt;margin-top:1mm}
.title{text-align:right}
.title .t{font-size:20pt;font-weight:800;letter-spacing:.04em}
.title .n{font-size:11pt;margin-top:1mm}
.contact{font-size:9pt;opacity:.9;margin-top:2mm}
.wrap{padding:9mm 16mm 14mm}
.meta{display:flex;justify-content:space-between;gap:10mm;margin-bottom:7mm}
.lbl{font-size:8.5pt;letter-spacing:.06em;color:#6B6558;font-weight:700;text-transform:uppercase;margin-bottom:1.2mm}
.to b{font-size:12pt}
.dates{text-align:right}
.dates div{margin-bottom:2mm}
table{width:100%;border-collapse:collapse}
th{background:${acc};color:${ink};text-align:left;padding:2.4mm 3mm;font-size:8.8pt;letter-spacing:.04em}
td{padding:2.6mm 3mm;border-bottom:.5pt solid #E3DCCB;vertical-align:top}
th:nth-child(n+2),td:nth-child(n+2){text-align:right;white-space:nowrap}
.tot{margin-left:auto;width:75mm;margin-top:4mm}
.tot div{display:flex;justify-content:space-between;padding:1.4mm 0}
.tot .big{border-top:1.5pt solid #1B2230;font-size:13pt;font-weight:800;padding-top:2.4mm}
.gst{font-size:8.8pt;color:#6B6558;margin-top:2mm}
.box{border:1pt solid #E3DCCB;border-radius:2.5mm;padding:4mm;margin-top:6mm;page-break-inside:avoid}
.box .lbl{margin-bottom:2mm}
.spec{border-left:3pt solid ${acc};padding-left:3mm;margin:2mm 0}
.note{white-space:pre-wrap;margin-top:6mm}
.foot{position:fixed;bottom:8mm;left:16mm;right:16mm;text-align:center;font-size:8.5pt;color:#6B6558;border-top:.5pt solid #E3DCCB;padding-top:2mm}
</style></head><body>
<div class="top"><div class="brand">${m.logo ? `<img src="${esc(m.logo)}">` : ""}<div><h1>${esc(b.name)}</h1>${b.tagline ? `<div class="tag">${esc(b.tagline)}</div>` : ""}<div class="contact">${contact.map(esc).join(" · ")}</div></div></div>
<div class="title"><div class="t">${esc(m.title || "INVOICE")}</div><div class="n">${esc(m.number)}</div></div></div>
<div class="wrap">
<div class="meta"><div class="to"><div class="lbl">${esc(m.toLabel || "Bill to")}</div>${to.map((x, i) => i ? `<div>${esc(x)}</div>` : `<b>${esc(x)}</b>`).join("")}</div>
<div class="dates">${m.dateText ? `<div><div class="lbl">${esc(m.dateLabel || "Date")}</div>${esc(m.dateText)}</div>` : ""}${m.dueText ? `<div><div class="lbl">${esc(m.dueLabel || "Payment due")}</div>${esc(m.dueText)}</div>` : ""}</div></div>
<table><thead><tr>${cols.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>
${(m.lines || []).map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.qty)}</td><td>${esc(l.price)}</td><td>${esc(l.amount)}</td></tr>`).join("")}
</tbody></table>
<div class="tot">${totals.map(t => `<div class="${t[2] ? "big" : ""}"><span>${esc(t[0])}</span><span>${esc(t[1])}</span></div>`).join("")}</div>
${m.gstText ? `<div class="gst">${esc(m.gstText)}</div>` : ""}
${(m.bank || []).length ? `<div class="box"><div class="lbl">${esc(m.bankTitle || "How to pay")}</div>${m.bank.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
${(m.specials || []).length ? `<div class="box"><div class="lbl">Specials</div>${m.specials.map(s => `<div class="spec"><b>${esc(s.title)}</b>${s.detail ? `<div>${esc(s.detail)}</div>` : ""}</div>`).join("")}</div>` : ""}
${m.note ? `<div class="note">${esc(m.note)}</div>` : ""}
</div>${m.footer ? `<div class="foot">${esc(m.footer)}</div>` : ""}
</body></html>`;
}

module.exports = { modelHtml };

window.ShopPdf = module.exports; })();
