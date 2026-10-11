// Progressive enhancement only: the page works fully without this script.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  var scenes = document.querySelectorAll('.scene');
  if (!('IntersectionObserver' in window)) {
    scenes.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  // Play each scene's short illustration sequence once, when it scrolls into view.
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.35 });
  scenes.forEach(function (el) { observer.observe(el); });
})();
