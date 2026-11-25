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
})();
