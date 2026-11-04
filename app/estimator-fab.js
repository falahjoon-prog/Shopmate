/* Shared by the Painting, Tiling and Electrical estimators:
   - the tab strip is replaced by a round "+" button at the bottom; it lists only the estimate options
   - the gear at the top right opens the rates / materials page
   - Print / Save PDF goes through the phone's own print dialog (window.print and window.open do nothing in the app's web view) */
(function () {
  var nav = document.querySelector('.main-nav'); if (!nav) return;
  var css = document.createElement('style');
  css.textContent = '.main-nav{display:none!important}body{padding-bottom:88px}' +
    /* the page never slides sideways: wide things (page strip, tables, zoomed drawing) scroll inside their own box */
    'html,body{max-width:100%;overflow-x:hidden}@supports (overflow:clip){html,body{overflow-x:clip}}main,section,.card,.sf-card,.sf-step,.sf-box,.form-grid,.totals{min-width:0;max-width:100%}' +
    '.fab{position:fixed;right:18px;bottom:calc(20px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:50%;border:0;background:var(--blue,#E9A21C);color:#fff;font-size:34px;line-height:1;display:grid;place-items:center;box-shadow:0 10px 24px rgba(16,27,44,.3);z-index:50;cursor:pointer;padding:0}' +
    '.fab:active{transform:scale(.94)}' +
    '.fab-bg{position:fixed;inset:0;background:rgba(16,27,44,.35);z-index:60;display:none}.fab-bg.open{display:block}' +
    '.fab-menu{position:fixed;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));background:#fff;border-radius:22px;padding:10px;box-shadow:0 20px 50px rgba(16,27,44,.35);z-index:61;display:none;flex-direction:column;gap:4px}.fab-menu.open{display:flex}' +
    '.fab-menu a,.fab-menu button{display:flex;align-items:center;gap:14px;border:0;background:transparent;border-radius:14px;padding:15px 14px;font:700 16px/1.2 inherit;color:#15243a;text-decoration:none;text-align:left;width:100%;cursor:pointer}' +
    '@media print{.fab,.fab-bg,.fab-menu{display:none!important}}' +
    '.fab-menu a:active,.fab-menu button:active{background:#f1f4f9}.fab-menu .on{background:#f4f7fb}.fab-menu i{font-style:normal;font-size:22px;width:28px;text-align:center}';
  document.head.appendChild(css);
  var bg = document.createElement('div'); bg.className = 'fab-bg';
  var menu = document.createElement('div'); menu.className = 'fab-menu';
  var fab = document.createElement('button'); fab.className = 'fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Estimate options'); fab.textContent = '+';
  function close() { bg.classList.remove('open'); menu.classList.remove('open'); }
  function top() { window.scrollTo(0, 0); }
  function build() {
    menu.innerHTML = '';
    [].forEach.call(nav.querySelectorAll('.nav-btn'), function (src) {
      var raw = (src.textContent || '').replace(/\s*↗\s*$/, '').trim(), icon = (raw.match(/^\S/) || ['•'])[0], label = raw.replace(/^\S\s*/, '');
      var el = src.tagName === 'A' ? document.createElement('a') : document.createElement('button');
      if (src.tagName === 'A') el.href = src.getAttribute('href'); else el.type = 'button';
      el.innerHTML = '<i>' + icon + '</i><span></span>'; el.lastChild.textContent = label;
      if (src.classList.contains('active')) el.classList.add('on');
      if (src.tagName !== 'A') el.addEventListener('click', function () { close(); src.click(); top(); });
      menu.appendChild(el);
    });
  }
  fab.addEventListener('click', function () { build(); bg.classList.add('open'); menu.classList.add('open'); });
  bg.addEventListener('click', close);
  document.body.appendChild(bg); document.body.appendChild(menu); document.body.appendChild(fab);
  /* ---- printing ---- */
  function nativePrint(html, name) {
    try { window.GPNative.print('ep' + Date.now(), JSON.stringify({ html: html, name: name || 'Estimate', landscape: false, paper: 'a4' })); return true; }
    catch (e) { return false; }
  }
  window.onNative = window.onNative || function () {};
  /* time away from the app while in an estimator: the main screen uses it to decide whether to ask for the PIN on the way back */
  window.onAppPause = function () { try { sessionStorage.setItem('smPaused', String(Date.now())); } catch (e) { } };
  window.onAppResume = function () { try { var p = Number(sessionStorage.getItem('smPaused') || 0); if (p) { sessionStorage.setItem('smAway', String(Math.max(Number(sessionStorage.getItem('smAway') || 0), Date.now() - p))); sessionStorage.removeItem('smPaused'); } } catch (e) { } };
  window.print = function () {
    var css = '';
    [].forEach.call(document.styleSheets, function (sh) { try { [].forEach.call(sh.cssRules, function (r) { css += r.cssText + '\n'; }); } catch (e) { } });
    [].forEach.call(document.querySelectorAll('input,textarea,select'), function (el) {
      if (el.tagName === 'TEXTAREA') el.textContent = el.value;
      else if (el.tagName === 'SELECT') [].forEach.call(el.options, function (o) { o.toggleAttribute('selected', o.selected); });
      else el.setAttribute('value', el.value);
    });
    var body = document.body.cloneNode(true);
    /* the PDF is the take-off only: no app chrome, scope/AI chat/drawing flow, camera tool, buttons, toasts or other tabs */
    [].forEach.call(body.querySelectorAll('script,.fab,.fab-bg,.fab-menu,.topbar,.hero,.main-nav,.step-pill,#scopeFlow,.camera-card,#toast,dialog,.modal,button,.actions,.page:not(.active),[hidden]'), function (n) { n.remove(); });
    var page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body>' + body.innerHTML + '</body></html>';
    var title = (document.title || 'Estimate').replace(/^ShopMate AI\s*·\s*/, '');
    var jobEl = document.getElementById('jobName') || document.getElementById('project');
    var fname = ((jobEl && jobEl.value.trim()) || 'Estimate') + ' - ' + title.replace(/\s*Estimator$/, '') + ' take-off - ' + new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) + '.pdf';
    /* straight to a real PDF file + share sheet; the old print screen is only a fallback */
    if (!(window.onNative && window.onNative.__pf)) {   // show a message if the phone couldn't make the PDF (nothing else would tell the user)
      var prevN = window.onNative;
      var hn = function (id, json) {
        if (/^pf/.test(id)) { try { var r = JSON.parse(json); if (!r.ok) { var d = document.createElement('div'); d.textContent = r.error || "Couldn't make the PDF"; d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:90px;z-index:99999;background:#7a1f1f;color:#fff;padding:12px 14px;border-radius:12px;font:600 14px sans-serif'; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 6000); } } catch (e) { } return; }
        if (prevN) return prevN.apply(this, arguments);
      };
      hn.__pf = true; window.onNative = hn;
    }
    try { if (window.GPNative && window.GPNative.sharePdfHtml) { window.GPNative.sharePdfHtml('pf' + Date.now(), JSON.stringify({ html: page, filename: fname })); return; } } catch (e) { }
    nativePrint(page, title);
  };
  // pages that build a quote in a new window (Painting): collect what they write and print it the same way
  var realOpen = window.open;
  window.open = function (url) {
    if (url) return realOpen.apply(window, arguments);
    var buf = '';
    return { document: { write: function (h) { buf += h; }, writeln: function (h) { buf += h + '\n'; }, close: function () { setTimeout(function () { nativePrint(buf, 'Quote'); }, 0); } }, focus: function () { }, print: function () { }, close: function () { }, addEventListener: function () { } };
  };
  /* ---- back button: one step at a time inside the estimator, then out to the main screen ---- */
  var stack = [], silent = false;
  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.nav-btn[data-page]'); if (!b || silent) return;
    var cur = nav.querySelector('.nav-btn.active'); if (cur && cur !== b) stack.push(cur.getAttribute('data-page'));
  }, true);
  window.onBack = function () {
    if (menu.classList.contains('open')) { close(); return true; }
    var dlg = document.querySelector('dialog[open]'); if (dlg) { dlg.close(); return true; }
    var cam = document.getElementById('cameraWorkspace'); if (cam && !cam.hidden) { cam.hidden = true; return true; }
    var res = document.getElementById('result'); if (res && !res.hidden) { res.hidden = true; top(); return true; }
    var prev = stack.pop(); if (!prev) return false;
    var btn = nav.querySelector('.nav-btn[data-page="' + prev + '"]'); if (!btn) return false;
    silent = true; btn.click(); silent = false; top(); return true;
  };
  // gear: rates & settings (Painting/Electrical) or materials (Tiling)
  var gear = document.getElementById('settingsBtn') || document.getElementById('settingsOpen');
  var target = nav.querySelector('[data-page="settings"]') || nav.querySelector('[data-page="materials"]');
  if (gear && target) gear.addEventListener('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); target.click(); top(); }, true);
})();
