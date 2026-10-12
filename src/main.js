// Progressive enhancement only: the page works fully without this script.
// Three independent parts: the language menu, the phone → TV simulation and the
// decorative dot field. A missing feature in one never disables the others.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = function () { return Boolean(motion && motion.matches); };
  var onMotionChange = function (fn) {
    if (!motion) return;
    if (motion.addEventListener) motion.addEventListener('change', fn);
    else if (motion.addListener) motion.addListener(fn);
  };

  [initLanguageMenu, initDemo, initDotField].forEach(function (init) {
    try { init(); } catch (error) { if (window.console) console.warn(error); }
  });

  // Language menu: a <details> list of links. Escape, a click elsewhere or leaving it closes it.
  function initLanguageMenu() {
    var menu = document.querySelector('.lang-menu');
    if (!menu) return;
    var summary = menu.querySelector('summary');
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) { menu.open = false; summary.focus(); }
    });
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    menu.addEventListener('focusout', function (e) { if (menu.open && e.relatedTarget && !menu.contains(e.relatedTarget)) menu.open = false; });
  }

  // ---------------------------------------------------------------------------
  // The phone → TV simulation. Input on the phone's touch area goes through the same
  // gesture rules as the iPhone app (SofatapDemoCore.Gestures); the actions move the TV
  // pointer, select films, open the right-click menu and play a simulated film.
  function initDemo() {
    var core = window.SofatapDemoCore;
    var demo = document.getElementById('demo');
    if (!core || !demo) return;
    var copy = {};
    try { copy = JSON.parse(document.getElementById('demo-copy').textContent); } catch (e) { /* keep defaults */ }
    var tr = function (key, vars) {
      return (copy[key] || '').replace(/\{(\w+)\}/g, function (m, name) { return vars && name in vars ? vars[name] : m; });
    };

    var q = function (sel) { return demo.querySelector(sel); };
    var pad = q('.pad');
    var screen = q('.tv__screen');
    var cursor = q('.cursor');
    var view = q('.app__view');
    var tiles = [].slice.call(demo.querySelectorAll('.tile'));
    var menu = q('.menu');
    var menuItems = [].slice.call(menu.querySelectorAll('.menu__item'));
    var player = q('.player');
    var playerBar = player.querySelector('.player__bar span');
    var playerArt = player.querySelector('.player__art');
    var playerTitle = player.querySelector('.player__title');
    var status = q('.demo__status');
    var playButton = q('.demo__play');
    var playText = q('.demo__play-text');
    var finger = q('.pad__finger');
    var fx = q('.pad__fx');
    var fxContext = fx && fx.getContext ? fx.getContext('2d') : null; // optional decoration
    var legend = [].slice.call(document.querySelectorAll('.gesture[data-gesture]'));
    var ring = document.createElement('span');
    ring.className = 'tv__ring';
    ring.setAttribute('aria-hidden', 'true');
    screen.appendChild(ring);

    pad.setAttribute('tabindex', '0');
    pad.setAttribute('role', 'application');
    playButton.hidden = false;
    demo.classList.add('is-live');

    var filmTime = null; // set while the video is being recorded
    var filmScriptStarted = false;
    var now = function () { return filmTime !== null ? filmTime : performance.now() / 1000; };
    // Touch and pen follow the app's timing; a mouse double click follows desktop timing,
    // so a real double click resolves to exactly one right click with no left click before it.
    var touchGestures = new core.Gestures();
    var mouseGestures = new core.Gestures({ doubleInterval: core.RULES.mouseDoubleInterval });
    var gestures = touchGestures;
    var gesturesFor = function (type) { return type === 'mouse' ? mouseGestures : touchGestures; };
    var nextDeadline = function () {
      var a = touchGestures.nextDeadline();
      var b = mouseGestures.nextDeadline();
      return a === null ? b : b === null ? a : Math.min(a, b);
    };
    var cancelAll = function () { dispatch(touchGestures.cancel()); dispatch(mouseGestures.cancel()); };
    var titles = tiles.map(function (t) { return t.querySelector('.tile__title').textContent; });
    var state;
    function resetState() {
      state = {
        pointer: { x: core.SCRIPT.pointer.x, y: core.SCRIPT.pointer.y },
        hover: null, selected: -1, menu: null, playing: null, dragging: false,
        list: {}, seen: {}, ripples: [], ring: null, legend: {},
      };
    }
    resetState();

    var contacts = {};
    var contactCount = function () { return Object.keys(contacts).length; };
    var lastHover = null;
    var lastPointerType = 'mouse';
    var lastRightAt = -10;
    var lastLeftAt = -10;
    var deadlineTimer = 0;
    var stageVisible = true;
    var script = null;
    var scriptStart = 0;
    var autoplayed = false;
    var frame = 0;

    // --- geometry -----------------------------------------------------------
    function screenBox() { return screen.getBoundingClientRect(); }
    function pointerPx() { var b = screenBox(); return { x: state.pointer.x * b.width, y: state.pointer.y * b.height }; }
    function local(el) {
      var b = screenBox();
      var r = el.getBoundingClientRect();
      return { left: r.left - b.left, top: r.top - b.top, right: r.right - b.left, bottom: r.bottom - b.top };
    }
    function centre(el) { var r = local(el); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; }
    function inside(p, r) { return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom; }
    function visibleInView(el) {
      var v = local(view);
      var r = local(el);
      return r.bottom > v.top + 4 && r.top < v.bottom - 4;
    }

    // What the pointer is over: the open menu first, then the player or the film grid.
    function targets() {
      if (state.menu) return menuItems.filter(function (m) { return !m.hidden; }).map(function (el, i) { return { kind: 'menu', index: i, el: el }; });
      if (state.playing) return [{ kind: 'back', el: player.querySelector('.player__back') }, { kind: 'toggle', el: player.querySelector('.player__toggle') }];
      return tiles.filter(visibleInView).map(function (el) { return { kind: 'tile', index: Number(el.dataset.index), el: el }; });
    }
    function hitTest() {
      var p = pointerPx();
      var list = targets();
      for (var i = 0; i < list.length; i += 1) if (inside(p, local(list[i].el))) return list[i];
      if (state.menu) return null;
      if (state.playing) return { kind: 'screen' };
      return null;
    }

    function targetPoint(name) {
      var parts = name.split(':');
      var el = parts[0] === 'tile' ? tiles[Number(parts[1])] : parts[0] === 'menu' ? menuItems[Number(parts[1])] : null;
      if (!el) return null;
      var c = centre(el);
      var r = local(el);
      // Aim a little inside the start of a menu entry, like a person would.
      if (parts[0] === 'menu') c.x = r.left + Math.min((r.right - r.left) * 0.35, 90);
      return c;
    }

    // --- announcements and feedback ----------------------------------------
    function say(text) { if (text) status.textContent = text; }
    function nameOf(target) { return target && target.kind === 'tile' ? titles[target.index] : ''; }
    function flashLegend(name) { state.legend[name] = now(); }
    function clickRing(kind) { state.ring = { kind: kind, at: now(), x: state.pointer.x, y: state.pointer.y }; }

    // --- actions ------------------------------------------------------------
    function movePointer(dx, dy) {
      var size = pad.getBoundingClientRect();
      var box = screenBox();
      if (!size.width || !box.width) return;
      var gain = box.width / size.width;
      state.pointer.x = Math.min(0.995, Math.max(0, state.pointer.x + (dx * gain) / box.width));
      state.pointer.y = Math.min(0.99, Math.max(0, state.pointer.y + (dy * gain) / box.height));
      flashLegend('slide');
      updateHover();
    }

    function updateHover() {
      var hit = hitTest();
      var key = hit ? hit.kind + ':' + (hit.index === undefined ? '' : hit.index) : null;
      if (key === state.hover) return;
      state.hover = key;
      tiles.forEach(function (t) { t.classList.toggle('is-hover', Boolean(hit && hit.kind === 'tile' && hit.el === t)); });
      menuItems.forEach(function (m) { m.classList.toggle('is-hover', Boolean(hit && hit.kind === 'menu' && hit.el === m)); });
      player.querySelectorAll('[data-hit]').forEach(function (el) { el.classList.toggle('is-hover', Boolean(hit && hit.el === el)); });
      if (state.dragging) tiles.forEach(function (t) { t.classList.toggle('is-held', Boolean(hit && hit.el === t)); });
    }

    function select(index) {
      state.selected = index;
      tiles.forEach(function (t, i) { t.classList.toggle('is-selected', i === index); });
    }

    function leftClick() {
      lastLeftAt = now();
      flashLegend('tap');
      clickRing('left');
      var hit = hitTest();
      if (state.menu) {
        if (hit && hit.kind === 'menu') activate(hit.index);
        else { closeMenu(); say(tr('demo.s.close')); }
        return;
      }
      if (state.playing) {
        if (hit && hit.kind === 'back') stopPlayer(true);
        else togglePause();
        return;
      }
      if (hit && hit.kind === 'tile') { select(hit.index); say(tr('demo.s.select', { item: titles[hit.index] })); }
      else { select(-1); say(tr('demo.s.clear')); }
    }

    function rightClick() {
      lastRightAt = now();
      flashLegend('double');
      clickRing('right');
      if (state.menu) closeMenu();
      var hit = hitTest();
      if (state.playing) { openMenu('player', state.playing.index); return; }
      if (hit && hit.kind === 'tile') { select(hit.index); openMenu('tile', hit.index); return; }
      say(tr('demo.s.menuNone'));
    }

    function menuActions(kind, index) {
      if (kind === 'player') return [state.playing.paused ? 'resume' : 'pause', 'back'];
      return ['play', state.list[index] ? 'remove' : 'add', state.seen[index] ? 'unwatched' : 'watched'];
    }

    function openMenu(kind, index) {
      var actions = menuActions(kind, index);
      menuItems.forEach(function (el, i) {
        var action = actions[i];
        el.hidden = !action;
        if (action) {
          el.dataset.action = action;
          el.querySelector('.menu__text').textContent = tr('demo.menu.' + action);
        }
      });
      menu.dataset.kind = kind;
      menu.hidden = false;
      state.menu = { kind: kind, index: index, actions: actions, at: now() };
      // Open at the pointer, flipped so it stays on the TV screen.
      var box = screenBox();
      var p = pointerPx();
      var w = menu.offsetWidth;
      var h = menu.offsetHeight;
      var x = p.x + 4;
      var y = p.y + 4;
      if (x + w > box.width - 4) x = p.x - w - 4;
      if (y + h > box.height - 4) y = p.y - h - 4;
      menu.style.left = Math.max(4, x) + 'px';
      menu.style.top = Math.max(4, y) + 'px';
      state.hover = null;
      updateHover();
      var labels = actions.map(function (a) { return tr('demo.menu.' + a); }).join(', ');
      say(kind === 'player' ? tr('demo.s.menuPlayer', { items: labels }) : tr('demo.s.menu', { item: titles[index], items: labels }));
    }

    function closeMenu() {
      state.menu = null;
      menu.hidden = true;
      menuItems.forEach(function (m) { m.classList.remove('is-hover'); });
      state.hover = null;
      updateHover();
    }

    function activate(i) {
      var m = state.menu;
      var action = m.actions[i];
      var index = m.index;
      closeMenu();
      var item = titles[index];
      if (action === 'play') startPlayer(index);
      else if (action === 'add' || action === 'remove') {
        state.list[index] = action === 'add';
        tiles[index].classList.toggle('is-listed', state.list[index]);
        say(tr(action === 'add' ? 'demo.s.added' : 'demo.s.removed', { item: item }));
      } else if (action === 'watched' || action === 'unwatched') {
        state.seen[index] = action === 'watched';
        tiles[index].classList.toggle('is-seen', state.seen[index]);
        say(tr(action === 'watched' ? 'demo.s.watched' : 'demo.s.unwatched', { item: item }));
      } else if (action === 'pause' || action === 'resume') togglePause();
      else if (action === 'back') stopPlayer(true);
    }

    function startPlayer(index) {
      select(index);
      playerArt.innerHTML = tiles[index].querySelector('.poster').outerHTML;
      playerTitle.textContent = titles[index];
      player.hidden = false;
      demo.classList.add('is-playing');
      state.playing = { index: index, started: now(), elapsed: 0, paused: false, last: now() };
      state.hover = null;
      updateHover();
      say(tr('demo.s.play', { item: titles[index] }));
    }

    function stopPlayer(announce) {
      if (!state.playing) return;
      state.playing = null;
      player.hidden = true;
      demo.classList.remove('is-playing', 'is-paused');
      state.hover = null;
      updateHover();
      if (announce) say(tr('demo.s.back'));
    }

    function togglePause() {
      var p = state.playing;
      if (!p) return;
      p.paused = !p.paused;
      demo.classList.toggle('is-paused', p.paused);
      say(tr(p.paused ? 'demo.s.pause' : 'demo.s.resume'));
    }

    function scrollList(px) {
      if (state.playing || state.menu) return;
      var before = view.scrollTop;
      view.scrollTop = Math.max(0, Math.min(view.scrollHeight - view.clientHeight, before + px));
      if (view.scrollTop !== before) {
        flashLegend('scroll');
        state.hover = null;
        updateHover();
        clearTimeout(scrollList.timer);
        scrollList.timer = setTimeout(function () { say(tr('demo.s.scroll')); }, 400);
      }
    }

    function setDragging(down) {
      state.dragging = down;
      demo.classList.toggle('is-dragging', down);
      if (!down) tiles.forEach(function (t) { t.classList.remove('is-held'); });
      flashLegend('hold');
      state.hover = null;
      updateHover();
      say(tr(down ? 'demo.s.drag' : 'demo.s.drop'));
    }

    function dispatch(actions) {
      actions.forEach(function (a) {
        if (a.type === 'move') movePointer(a.dx, a.dy);
        else if (a.type === 'left') leftClick();
        else if (a.type === 'right') rightClick();
        else if (a.type === 'drag') setDragging(a.down);
        // The app sends scroll(-dy) as a wheel step: fingers moving down scroll the list down.
        else if (a.type === 'scroll') scrollList(-a.dy * 1.6);
      });
    }

    // --- contacts (shared by real touches and the script) ---------------------
    function ripple(point, kind) {
      state.ripples.push({ x: point.x, y: point.y, kind: kind, at: now() });
      if (state.ripples.length > 6) state.ripples.shift();
    }
    function contact(kind, point, time) {
      var g = touchGestures;
      if (kind === 'begin') { dispatch(g.begin(point, 1, time)); ripple(point, 'touch'); }
      else if (kind === 'move') dispatch(g.move(point, 1, time));
      else {
        var actions = g.end(point, 0, time);
        var right = actions.some(function (a) { return a.type === 'right'; });
        ripple(point, right ? 'double' : 'tap');
        dispatch(actions);
      }
    }

    function padPoint(e) { var r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function centroid() {
      var ids = Object.keys(contacts);
      var x = 0; var y = 0;
      ids.forEach(function (id) { x += contacts[id].x; y += contacts[id].y; });
      return { x: x / ids.length, y: y / ids.length };
    }

    pad.addEventListener('pointerdown', function (e) {
      lastPointerType = e.pointerType;
      if (e.pointerType === 'mouse' && e.button !== 0) return; // the right button arrives as contextmenu
      takeOver();
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      contacts[e.pointerId] = padPoint(e);
      gestures = gesturesFor(e.pointerType);
      var count = contactCount();
      dispatch(gestures.begin(count === 1 ? contacts[e.pointerId] : centroid(), count, now()));
      if (count === 1) ripple(contacts[e.pointerId], 'touch');
      schedule();
    });
    pad.addEventListener('pointermove', function (e) {
      if (contacts[e.pointerId]) {
        contacts[e.pointerId] = padPoint(e);
        var count = contactCount();
        dispatch(gestures.move(count === 1 ? contacts[e.pointerId] : centroid(), count, now()));
        schedule();
      } else if (e.pointerType === 'mouse' && !contactCount()) {
        // A hovering mouse acts like a finger sliding on the touch area: relative movement.
        var p = padPoint(e);
        if (lastHover) { takeOver(); dispatch([{ type: 'move', dx: p.x - lastHover.x, dy: p.y - lastHover.y }]); schedule(); }
        lastHover = p;
      }
    });
    function lift(e) {
      if (!contacts[e.pointerId]) return;
      var p = padPoint(e);
      delete contacts[e.pointerId];
      var remaining = contactCount();
      var actions = gestures.end(p, remaining, now());
      if (!remaining) ripple(p, actions.some(function (a) { return a.type === 'right'; }) ? 'double' : 'tap');
      dispatch(actions);
      if (e.pointerType === 'mouse') lastHover = p;
      schedule();
    }
    function cancelContacts() {
      if (!contactCount()) return;
      contacts = {};
      dispatch(gestures.cancel());
      schedule();
    }
    // Losing focus or hiding the page drops everything in flight, like the app going inactive:
    // held drags, contacts and a tap still waiting for its double-tap window.
    function interrupt() {
      contacts = {};
      cancelAll();
      if (script && filmTime === null) endScript(true);
      schedule();
    }
    pad.addEventListener('pointerup', lift);
    pad.addEventListener('pointercancel', cancelContacts);
    pad.addEventListener('lostpointercapture', function (e) { if (contacts[e.pointerId]) cancelContacts(); });
    pad.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !contactCount()) lastHover = null; });
    pad.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') lastHover = padPoint(e); });

    // A real mouse double click is a right click (the double tap of the app). If the two
    // clicks were close enough the gesture rules already sent it; never send it twice,
    // and drop the waiting tap of the second click so nothing is clicked afterwards.
    // The mouse gesture rules already turn a real double click into one right click on the
    // second release. A dblclick that arrives without that (for example from assistive
    // software) is a right click too, unless a click was just delivered for it.
    pad.addEventListener('dblclick', function (e) {
      e.preventDefault();
      if (lastPointerType !== 'mouse') return; // touch keeps the app's own double-tap timing
      if (now() - lastRightAt < 0.6 || now() - lastLeftAt < 0.6) return;
      mouseGestures.dropPendingTap();
      rightClick();
      schedule();
    });
    pad.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (lastPointerType !== 'mouse' || contactCount()) return; // touch long-press is a hold, not a right click
      if (now() - lastRightAt < 0.6) return;
      takeOver();
      dispatch(mouseGestures.flushPendingTap());
      rightClick();
      schedule();
    });
    pad.addEventListener('wheel', function (e) {
      // A simulation shortcut for desktop visitors; the app itself scrolls with two fingers.
      e.preventDefault();
      takeOver();
      scrollList(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
      schedule();
    }, { passive: false });

    // Keyboard: arrows move the pointer from target to target, Enter/Space clicks,
    // Shift+F10 or the Menu key right-clicks, Escape closes the menu or the player.
    pad.addEventListener('keydown', function (e) {
      var dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      var handled = true;
      if (dirs[e.key]) { takeOver(); keyMove(dirs[e.key]); }
      else if (e.key === 'Enter' || e.key === ' ') { takeOver(); leftClick(); ripple(fingerRest(), 'tap'); }
      else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        takeOver(); lastRightAt = now(); rightClick(); ripple(fingerRest(), 'double');
        // Keyboard users land on the first menu entry, so Enter chooses it straight away.
        if (state.menu) { pointAt(menuItems[0]); say(tr(state.menu.kind === 'player' ? 'demo.s.menuPlayer' : 'demo.s.menu', { item: titles[state.menu.index], items: state.menu.actions.map(function (a) { return tr('demo.menu.' + a); }).join(', ') })); }
      }
      else if (e.key === 'Escape') {
        if (state.menu) { closeMenu(); say(tr('demo.s.close')); }
        else if (state.playing) stopPlayer(true);
        else handled = false;
      } else if (e.key === 'PageDown' || e.key === 'PageUp') { takeOver(); scrollList((e.key === 'PageDown' ? 1 : -1) * view.clientHeight * 0.6); }
      else handled = false;
      if (handled) { e.preventDefault(); schedule(); }
    });
    function pointAt(el) {
      var box = screenBox();
      var c = centre(el);
      state.pointer.x = c.x / box.width;
      state.pointer.y = c.y / box.height;
      state.hover = null;
      updateHover();
    }
    function fingerRest() { var r = pad.getBoundingClientRect(); return { x: r.width / 2, y: r.height * 0.55 }; }

    function keyMove(dir) {
      var p = pointerPx();
      var best = null;
      var all = state.menu || state.playing ? targets() : tiles.map(function (el) { return { kind: 'tile', index: Number(el.dataset.index), el: el }; });
      all.forEach(function (t) {
        var c = centre(t.el);
        var along = (c.x - p.x) * dir[0] + (c.y - p.y) * dir[1];
        var across = Math.abs((c.x - p.x) * dir[1]) + Math.abs((c.y - p.y) * dir[0]);
        if (along <= 6) return;
        var score = along + across * 2;
        if (!best || score < best.score) best = { score: score, target: t };
      });
      var box = screenBox();
      if (best) {
        if (best.target.kind === 'tile' && !visibleInView(best.target.el)) {
          var v = local(view);
          var r = local(best.target.el);
          view.scrollTop += r.top < v.top ? r.top - v.top - 8 : r.bottom - v.bottom + 8;
        }
        var c = centre(best.target.el);
        state.pointer.x = c.x / box.width;
        state.pointer.y = c.y / box.height;
      } else {
        state.pointer.x = Math.min(0.995, Math.max(0, state.pointer.x + dir[0] * 0.08));
        state.pointer.y = Math.min(0.99, Math.max(0, state.pointer.y + dir[1] * 0.08));
      }
      flashLegend('slide');
      state.hover = null;
      updateHover();
      var hit = hitTest();
      if (hit && hit.kind === 'tile') say(tr('demo.s.over', { item: nameOf(hit) }));
      else if (hit && hit.kind === 'menu') say(hit.el.querySelector('.menu__text').textContent);
      else if (hit && hit.kind === 'back') say(hit.el.textContent.trim());
      else say(tr('demo.s.empty'));
    }

    // --- scripted demo (the "Play demo" button and the recorded video) ---------
    function resetScene() {
      contacts = {};
      touchGestures = new core.Gestures();
      mouseGestures = new core.Gestures({ doubleInterval: core.RULES.mouseDoubleInterval });
      gestures = touchGestures;
      closeMenu();
      stopPlayer(false);
      setDraggingQuiet();
      tiles.forEach(function (t) { t.classList.remove('is-selected', 'is-listed', 'is-seen', 'is-hover', 'is-held'); });
      view.scrollTop = 0;
      resetState();
      updateHover();
    }
    function setDraggingQuiet() { demo.classList.remove('is-dragging'); }

    function startScript() {
      resetScene();
      scriptStart = now();
      script = new core.ScriptPlayer({
        padSize: function () { var r = pad.getBoundingClientRect(); return { w: r.width, h: r.height }; },
        gain: function () { return screenBox().width / pad.getBoundingClientRect().width; },
        pointer: pointerPx,
        target: targetPoint,
        contact: function (kind, point, t) { contact(kind, point, scriptStart + t); },
        finger: showFinger,
        step: function (step) { demo.dataset.step = step.gesture || (step.end ? 'end' : ''); },
        done: function () { endScript(false); },
      });
      demo.classList.add('is-scripted');
      playText.textContent = tr('demo.stop');
      playButton.classList.add('is-running');
      say(tr('demo.s.demo'));
      schedule();
    }
    function endScript(interrupted) {
      if (!script) return;
      script = null;
      showFinger(null, false);
      demo.classList.remove('is-scripted');
      playText.textContent = tr('demo.play');
      playButton.classList.remove('is-running');
      if (interrupted) dispatch(touchGestures.cancel());
      else say(tr('demo.s.done'));
    }
    // Any real input takes over from the scripted demo.
    function takeOver() {
      autoplayed = true;
      if (script) { endScript(true); say(''); }
    }
    function showFinger(point, touching) {
      if (!point) { finger.classList.remove('is-shown', 'is-touching'); return; }
      finger.classList.add('is-shown');
      finger.classList.toggle('is-touching', touching);
      finger.style.transform = 'translate(' + point.x.toFixed(1) + 'px, ' + point.y.toFixed(1) + 'px)';
    }

    playButton.addEventListener('click', function () {
      if (script) { endScript(true); say(tr('demo.s.ready')); }
      else { autoplayed = true; startScript(); }
    });

    // --- rendering ------------------------------------------------------------
    function render(time) {
      cursor.style.left = (state.pointer.x * 100).toFixed(3) + '%';
      cursor.style.top = (state.pointer.y * 100).toFixed(3) + '%';
      var reduced = reducedMotion() && filmTime === null;
      // Menu: a short fade and scale when it opens.
      if (state.menu) {
        var u = reduced ? 1 : Math.min(1, (time - state.menu.at) / 0.14);
        menu.style.opacity = String(0.4 + 0.6 * u);
        menu.style.transform = 'scale(' + (0.96 + 0.04 * u).toFixed(3) + ')';
      }
      // Player progress and a slow push-in on the art.
      var p = state.playing;
      if (p) {
        if (!p.paused) p.elapsed += Math.max(0, Math.min(0.25, time - p.last));
        p.last = time;
        playerBar.style.width = (6 + Math.min(90, p.elapsed * 3)).toFixed(2) + '%';
        playerArt.style.transform = reduced ? 'none' : 'scale(' + (1.04 + Math.min(0.08, p.elapsed * 0.008)).toFixed(4) + ')';
      }
      // Click ring on the TV.
      if (state.ring) {
        var age = time - state.ring.at;
        var life = state.ring.kind === 'right' ? 0.55 : 0.4;
        if (age > life || age < 0) { state.ring = null; ring.style.opacity = '0'; }
        else {
          var k = reduced ? 0.5 : age / life;
          ring.className = 'tv__ring tv__ring--' + state.ring.kind;
          ring.style.left = (state.ring.x * 100).toFixed(3) + '%';
          ring.style.top = (state.ring.y * 100).toFixed(3) + '%';
          ring.style.opacity = String(reduced ? 0.9 : 1 - k);
          ring.style.transform = 'translate(-50%, -50%) scale(' + (reduced ? 1 : 0.4 + k * 1.2).toFixed(3) + ')';
        }
      }
      legend.forEach(function (el) {
        var at = state.legend[el.dataset.gesture];
        el.classList.toggle('is-active', at !== undefined && time - at < 1.2 && time >= at);
      });
      drawPad(time, reduced);
    }

    // Touch feedback on the phone: ripples like the app (mint for a tap, ice and mint for a double tap).
    function drawPad(time, reduced) {
      if (!fxContext) return;
      var r = pad.getBoundingClientRect();
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(r.width * ratio);
      var h = Math.round(r.height * ratio);
      if (fx.width !== w || fx.height !== h) { fx.width = w; fx.height = h; }
      fxContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      fxContext.clearRect(0, 0, r.width, r.height);
      state.ripples = state.ripples.filter(function (rp) { return time - rp.at < 1.1 && time >= rp.at - 0.001; });
      state.ripples.forEach(function (rp) {
        var age = time - rp.at;
        var life = rp.kind === 'double' ? 1.0 : 0.85;
        if (age > life) return;
        var k = age / life;
        var rings = rp.kind === 'double' ? [[0, '188, 235, 255', 1], [0.12, '163, 255, 209', 0.8]] : [[0, '163, 255, 209', 1]];
        if (rp.kind === 'touch') rings = [[0, '163, 255, 209', 0.5]];
        rings.forEach(function (spec) {
          var kk = Math.max(0, k - spec[0]);
          var radius = reduced ? 22 : 8 + kk * (rp.kind === 'touch' ? 28 : rp.kind === 'double' ? 78 : 58);
          var alpha = reduced ? (age < 0.4 ? 0.7 : 0) : (1 - kk) * 0.85 * spec[2];
          if (alpha <= 0) return;
          fxContext.strokeStyle = 'rgba(' + spec[1] + ', ' + alpha.toFixed(3) + ')';
          fxContext.lineWidth = rp.kind === 'double' ? 2.4 : 2;
          fxContext.beginPath();
          fxContext.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
          fxContext.stroke();
        });
      });
    }

    // Frames run only while something is moving; otherwise a timer waits for the next
    // gesture deadline (a tap waiting for its double-tap window, or a hold).
    function needsFrame(time) {
      if (script || state.ripples.length || state.ring) return true;
      if (state.menu && time - state.menu.at < 0.2) return true;
      for (var name in state.legend) if (time - state.legend[name] < 1.2) return true;
      return Boolean(state.playing && !state.playing.paused && stageVisible && !reducedMotion());
    }
    function tick() {
      frame = 0;
      var time = now();
      if (script) script.update(time - scriptStart);
      dispatch(touchGestures.advance(time));
      dispatch(mouseGestures.advance(time));
      render(time);
      if (needsFrame(time)) schedule();
      else armDeadline();
    }
    function armDeadline() {
      clearTimeout(deadlineTimer);
      var deadline = nextDeadline();
      if (deadline !== null && filmTime === null) deadlineTimer = setTimeout(schedule, Math.max(0, (deadline - now()) * 1000) + 4);
    }
    function schedule() {
      if (filmTime !== null || frame) return;
      frame = requestAnimationFrame(tick);
    }

    document.addEventListener('visibilitychange', function () { if (document.hidden) interrupt(); });
    window.addEventListener('blur', interrupt);
    window.addEventListener('resize', function () { state.hover = null; updateHover(); schedule(); });
    onMotionChange(function () { render(now()); schedule(); });

    // Play the demo once when it first comes into view, unless the visitor prefers less motion.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        stageVisible = entries[0].isIntersecting;
        if (stageVisible) schedule();
        if (stageVisible && !autoplayed && !reducedMotion() && filmTime === null) { autoplayed = true; startScript(); }
      }, { threshold: 0.6 }).observe(q('.demo__stage'));
    }

    render(now());

    // Recording hooks for tools/film: a fixed clock stepped frame by frame.
    window.SofatapDemo = {
      film: {
        begin: function (options) {
          autoplayed = true;
          if (script) endScript(true);
          filmTime = 0;
          filmScriptStarted = false;
          demo.classList.add('is-film');
          if (options && options.neutral) demo.classList.add('is-neutral');
          resetScene();
          render(0);
        },
        // t: seconds since the scripted demo started; negative values show the resting scene.
        seek: function (t) {
          if (t < 0) { filmTime = t; render(t); return; }
          // The film always runs its own copy of the script from t = 0, whatever played before.
          if (!filmScriptStarted) { filmScriptStarted = true; filmTime = 0; startScript(); scriptStart = 0; }
          filmTime = t;
          if (script) script.update(t);
          dispatch(touchGestures.advance(t));
          dispatch(mouseGestures.advance(t));
          render(t);
        },
        state: function () {
          return { pointer: state.pointer, selected: state.selected, menu: state.menu && state.menu.actions, playing: state.playing && state.playing.index, step: demo.dataset.step || '' };
        },
      },
      play: function () { startScript(); },
    };
  }

  // ---------------------------------------------------------------------------
  // A quiet dot field behind the gesture section, echoing the phone's touch surface.
  // It only runs while the section is on screen, and never when Reduce Motion is on
  // (the static CSS dot pattern stays instead). It is decorative and hidden from assistive tech.
  function initDotField() {
    var canvas = document.querySelector('.dot-field');
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
    onMotionChange(function () { if (motion.matches) disable(); else enable(); });

    if (!motion.matches) enable();
  }
})();
