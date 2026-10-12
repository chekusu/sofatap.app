// Progressive enhancement only: the page works fully without this script.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  // A quiet dot field behind the gesture section, echoing the phone's touch surface.
  // It only runs while the section is on screen, and never when Reduce Motion is on
  // (the static CSS dot pattern stays instead). It is decorative and hidden from assistive tech.
  var canvas = document.querySelector('.dot-field');
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (!canvas || !canvas.getContext || !motion || !('IntersectionObserver' in window)) return;

  var section = canvas.parentElement;
  var ctx = canvas.getContext('2d');
  if (!ctx) return; // Keep the static CSS dot pattern.
  var GAP = 28;
  var width = 0;
  var height = 0;
  var pointer = null;
  var ripples = [];
  var visible = false;
  var frame = 0;

  function resize() {
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = section.clientWidth;
    height = section.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(time) {
    frame = 0;
    ctx.clearRect(0, 0, width, height);
    ripples = ripples.filter(function (r) { return time - r.start < 1100; });
    for (var y = GAP / 2; y < height; y += GAP) {
      for (var x = GAP / 2; x < width; x += GAP) {
        var dx = Math.sin(time * 0.0004 + x * 0.018 + y * 0.011) * 1.6;
        var dy = Math.cos(time * 0.00035 + y * 0.02 - x * 0.007) * 1.6;
        var glow = 0;
        if (pointer) {
          var px = x - pointer.x;
          var py = y - pointer.y;
          var d = Math.sqrt(px * px + py * py);
          if (d < 110 && d > 0) {
            var push = Math.pow(1 - d / 110, 2) * 12;
            dx += (px / d) * push;
            dy += (py / d) * push;
            glow = Math.max(glow, 1 - d / 110);
          }
        }
        for (var i = 0; i < ripples.length; i += 1) {
          var r = ripples[i];
          var rx = x - r.x;
          var ry = y - r.y;
          var rd = Math.sqrt(rx * rx + ry * ry) || 1;
          var progress = (time - r.start) / 1100;
          var band = Math.abs(rd - progress * 260);
          if (band < 26) {
            var wave = (1 - band / 26) * (1 - progress);
            dx += (rx / rd) * wave * 7;
            dy += (ry / rd) * wave * 7;
            glow = Math.max(glow, wave);
          }
        }
        ctx.fillStyle = 'rgba(152, 233, 196, ' + (0.18 + glow * 0.6).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, 1.1 + glow * 1.2, 0, 6.2832);
        ctx.fill();
      }
    }
    if (visible) frame = requestAnimationFrame(draw);
  }

  function start() {
    if (!frame && visible && !motion.matches && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function local(event) {
    var box = section.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function enable() {
    canvas.classList.add('is-live');
    resize();
    start();
  }
  function disable() {
    stop();
    canvas.classList.remove('is-live');
    ctx.clearRect(0, 0, width, height);
  }

  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) start(); else stop();
  }).observe(section);

  section.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') pointer = local(e); });
  section.addEventListener('pointerleave', function () { pointer = null; });
  section.addEventListener('pointerdown', function (e) {
    if (motion.matches) return;
    var p = local(e);
    ripples.push({ x: p.x, y: p.y, start: performance.now() });
    if (ripples.length > 4) ripples.shift();
  });
  window.addEventListener('resize', function () { if (!motion.matches) resize(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  var onMotionChange = function () { if (motion.matches) disable(); else enable(); };
  if (motion.addEventListener) motion.addEventListener('change', onMotionChange);
  else if (motion.addListener) motion.addListener(onMotionChange);

  if (!motion.matches) enable();
})();
