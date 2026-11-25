/* vCloudOne top menu: mobile toggle and dropdowns. */
(function () {
  var t = document.getElementById('sn-toggle'), l = document.getElementById('sn-links');
  function closeAll(except) {
    document.querySelectorAll('.sn-dd.open').forEach(function (d) {
      if (d !== except) { d.classList.remove('open'); d.querySelector('.sn-dd-btn').setAttribute('aria-expanded', 'false'); }
    });
  }
  if (t && l) {
    t.addEventListener('click', function () {
      var open = l.classList.toggle('open');
      t.classList.toggle('open', open);
      t.setAttribute('aria-expanded', open);
      t.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }
  document.querySelectorAll('.sn-dd').forEach(function (dd) {
    var b = dd.querySelector('.sn-dd-btn');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !dd.classList.contains('open');
      closeAll(dd);
      dd.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open);
    });
  });
  document.addEventListener('click', function () { closeAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  if (l) l.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { l.classList.remove('open'); if (t) { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); } });
  });
  var th = document.getElementById('sn-theme');
  function label() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (th) { th.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); var l = th.querySelector('.sn-theme-l'); if (l) l.textContent = dark ? 'Light mode' : 'Dark mode'; }
  }
  label();
  if (th) th.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    window.dispatchEvent(new Event('themechange'));
  });
  /* redraw pages that paint with theme colours (sizer diagrams) */
  window.addEventListener('themechange', function () { label(); if (typeof window.recalc === 'function') { try { window.recalc(); } catch (e) {} } });
})();
