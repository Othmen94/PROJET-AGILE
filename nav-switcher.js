/* ════════════════════════════════════════════════════════════════
   PostOp Suivi — Switcher universel d'espaces (FAB)
   Inclus via : <script src="/nav-switcher.js" defer></script>
   À placer juste avant </body> dans index.html / patient.html / medecin.html
   ════════════════════════════════════════════════════════════════ */
(function () {
  if (document.getElementById('navSwitcher')) return; // anti-double-injection

  // ── CSS injecté ──
  var css = ''
    + '.nav-switcher{position:fixed;bottom:24px;right:24px;z-index:9999;font-family:"DM Sans",system-ui,-apple-system,sans-serif;}'
    + '.nav-switcher-fab{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1B4FD8,#00C2C7);border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.08);transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;}'
    + '.nav-switcher-fab:hover{transform:scale(1.06);box-shadow:0 12px 32px rgba(0,194,199,.4);}'
    + '.nav-switcher-fab svg{width:22px;height:22px;transition:transform .3s;}'
    + '.nav-switcher.open .nav-switcher-fab svg{transform:rotate(135deg);}'
    + '.nav-switcher-menu{position:absolute;bottom:72px;right:0;display:flex;flex-direction:column;gap:8px;opacity:0;pointer-events:none;transform:translateY(8px) scale(.95);transform-origin:bottom right;transition:opacity .2s,transform .25s cubic-bezier(.34,1.56,.64,1);}'
    + '.nav-switcher.open .nav-switcher-menu{opacity:1;pointer-events:auto;transform:translateY(0) scale(1);}'
    + '.nav-switcher-item{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:100px;background:rgba(15,27,48,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);color:#F1F5FB;text-decoration:none;font-size:13.5px;font-weight:500;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.3);transition:background .15s,border-color .15s,transform .15s;}'
    + '.nav-switcher-item:hover{background:rgba(27,79,216,.45);border-color:rgba(0,194,199,.55);transform:translateX(-3px);}'
    + '.nav-switcher-item.current{background:linear-gradient(135deg,rgba(27,79,216,.6),rgba(0,194,199,.35));border-color:rgba(0,194,199,.6);cursor:default;}'
    + '.nav-switcher-item.current:hover{transform:none;}'
    + '.nav-switcher-item svg{width:17px;height:17px;flex-shrink:0;color:#00C2C7;}'
    + '.nav-switcher-item.current svg{color:#fff;}'
    + '@media (max-width:540px){.nav-switcher{bottom:18px;right:18px;}.nav-switcher-fab{width:52px;height:52px;}.nav-switcher-item{font-size:13px;padding:9px 14px;}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Détection page courante ──
  var path = (location.pathname || '').toLowerCase();
  var current = path.indexOf('patient') !== -1 ? 'patient'
              : path.indexOf('medecin') !== -1 ? 'medecin'
              : 'index';

  // ── Markup ──
  var ICON_HOME    = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>';
  var ICON_USER    = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 14a4 4 0 10-8 0M12 11a4 4 0 100-8 4 4 0 000 8zM3 21h18"/></svg>';
  var ICON_PULSE   = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h4l2-4 4 8 2-4h6"/></svg>';
  var ICON_PLUS    = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14"/></svg>';

  var wrap = document.createElement('div');
  wrap.className = 'nav-switcher';
  wrap.id = 'navSwitcher';
  wrap.innerHTML = ''
    + '<div class="nav-switcher-menu" role="menu">'
    +   '<a href="/" class="nav-switcher-item' + (current==='index'?' current':'') + '" role="menuitem">' + ICON_HOME + '<span>Accueil</span></a>'
    +   '<a href="/patient.html" class="nav-switcher-item' + (current==='patient'?' current':'') + '" role="menuitem">' + ICON_USER + '<span>Espace Patient</span></a>'
    +   '<a href="/medecin.html" class="nav-switcher-item' + (current==='medecin'?' current':'') + '" role="menuitem">' + ICON_PULSE + '<span>Espace Médecin</span></a>'
    + '</div>'
    + '<button class="nav-switcher-fab" aria-label="Changer d\'espace" aria-haspopup="true">' + ICON_PLUS + '</button>';

  document.body.appendChild(wrap);

  // ── Interactions ──
  var fab = wrap.querySelector('.nav-switcher-fab');
  fab.addEventListener('click', function (e) {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') wrap.classList.remove('open');
  });
})();
