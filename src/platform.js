// Which computer is this? (progressive enhancement; the page is complete without it).
// One local guess drives the hero's desktop button and the download section, so they always agree:
//  - The operating system comes from the browser's own user agent (and, where supported, its
//    low-entropy client hints). iPhone, iPad (also in desktop mode) and Android are phones and
//    tablets, never a Mac or Linux. When the two sources disagree, nothing is claimed.
//  - The architecture picks between Mac (Apple Silicon or Intel) and Linux (x64 or ARM64) packages.
//    It is used only when the browser's user-agent client hints answer completely and coherently
//    (platform, architecture and bitness), within a short time. The user-agent string never
//    decides it: Safari on Apple Silicon says "Intel Mac OS X", and reduced or privacy user agents
//    say x86_64 on ARM. Without a clear answer both packages stay side by side. Windows has only
//    an x64 package: on a PC that reports ARM or 32-bit, the downloads stay as built.
//  - Nothing is stored, sent or probed: no cookies, storage, network requests or GPU queries.
// Without this script (or on any error) every download stays on the page as it was built.
(function (global) {
  'use strict';

  var DESKTOP = ['windows', 'mac', 'linux'];
  var all = function (root, selector) { return Array.prototype.slice.call(root.querySelectorAll(selector)); };
  var HINT_PLATFORM = { macOS: 'mac', Windows: 'windows', Linux: 'linux', Android: 'android', iOS: 'ios', 'Chrome OS': 'other', 'Chromium OS': 'other' };

  /** The operating system: 'windows', 'mac', 'linux', 'ios', 'android' or 'unknown'. */
  function osOf(nav) {
    nav = nav || {};
    var ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
    var touch = Number(nav.maxTouchPoints) || 0;
    var os = 'unknown';
    if (/iPhone|iPad|iPod/.test(ua)) os = 'ios';
    else if (/Android/i.test(ua)) os = 'android';
    // iPadOS asks for desktop sites as a Mac; a real Mac has no multi-touch screen.
    else if (/Macintosh|Mac OS X/.test(ua)) os = touch > 1 ? 'ios' : 'mac';
    else if (/Windows NT/.test(ua) && !/Windows Phone/.test(ua)) os = 'windows';
    else if (/CrOS/.test(ua)) os = 'unknown';
    // X11 alone is not an operating system (FreeBSD and others use it too).
    else if (/\bLinux\b/.test(ua)) os = 'linux';
    var data = nav.userAgentData;
    if (data && data.mobile === true && DESKTOP.indexOf(os) >= 0) return 'unknown';
    var hinted = data && typeof data.platform === 'string' && data.platform ? HINT_PLATFORM[data.platform] || 'other' : null;
    if (hinted && hinted !== os) return 'unknown';
    return os;
  }

  /**
   * The architecture from high-entropy client hints: 'arm64' or 'x64' for a complete, coherent
   * 64-bit answer, 'other' for a complete answer that is neither (32-bit, for example), and null
   * when it is missing, partial or names another platform.
   */
  function archOf(os, hints) {
    if (!hints || typeof hints !== 'object') return null;
    if (typeof hints.platform !== 'string' || HINT_PLATFORM[hints.platform] !== os) return null;
    if (typeof hints.architecture !== 'string' || !hints.architecture || typeof hints.bitness !== 'string' || !hints.bitness) return null;
    if (hints.bitness !== '64') return 'other';
    if (hints.architecture === 'arm') return 'arm64';
    if (hints.architecture === 'x86') return 'x64';
    return 'other';
  }

  /**
   * Resolves to { os, arch } and never rejects. The architecture is only asked for on a computer,
   * and only waited for `timeout` ms.
   */
  function detect(nav, options) {
    var timeout = (options && options.timeout) || 600;
    var setTimer = (options && options.setTimeout) || global.setTimeout;
    var os;
    try { os = osOf(nav); } catch (error) { os = 'unknown'; }
    var result = { os: os, arch: null };
    var data = nav && nav.userAgentData;
    if (DESKTOP.indexOf(os) < 0 || !data || typeof data.getHighEntropyValues !== 'function') return Promise.resolve(result);
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (arch) { if (!done) { done = true; result.arch = arch; resolve(result); } };
      setTimer(function () { finish(null); }, timeout);
      try {
        Promise.resolve(data.getHighEntropyValues(['architecture', 'bitness']))
          .then(function (hints) { finish(archOf(os, hints)); }, function () { finish(null); });
      } catch (error) { finish(null); }
    });
  }

  // ---------------------------------------------------------------------------
  // The page. Everything below only rearranges what the build already rendered.

  /** The hero's desktop button: the computer's icon and name, still a link to the downloads. */
  function applyHero(doc, os) {
    var box = doc.querySelector('.get-desktop');
    if (!box || DESKTOP.indexOf(os) < 0) return false;
    var labels = JSON.parse(box.getAttribute('data-labels'));
    var versions = JSON.parse(box.getAttribute('data-versions'));
    var link = box.querySelector('.get-desktop__link');
    var text = box.querySelector('.get-desktop__text');
    var version = box.querySelector('.get-desktop__version');
    if (!link || !text || !version || typeof labels[os] !== 'string' || typeof versions[os] !== 'string') return false;
    text.textContent = labels[os];
    version.textContent = versions[os];
    link.setAttribute('data-os', os);
    return true;
  }

  /**
   * The download section: this computer's card first, then the iPhone; the other computers (and,
   * when the architecture is clear, this computer's other package, in a copy of its card) move
   * into the collapsed "Other downloads".
   */
  function applyDownloads(doc, os, arch) {
    var section = doc.getElementById('download');
    var main = section && section.querySelector('.platforms');
    var other = section && section.querySelector('.downloads-other');
    var list = other && other.querySelector('.downloads-other__list');
    var card = doc.getElementById('platform-' + os);
    if (!main || !list || !card || DESKTOP.indexOf(os) < 0) return false;
    // The only Windows package is x64: never present it as this PC's match on ARM or 32-bit.
    if (os === 'windows' && arch && arch !== 'x64') return false;
    if (arch === 'other') arch = null;
    var cards = DESKTOP.map(function (id) { return doc.getElementById('platform-' + id); });
    if (cards.some(function (c) { return !c || c.parentNode !== main; })) return false;

    var keep = null;
    var moved = [];
    if (arch) {
      var items = all(card, '[data-arch]');
      keep = items.filter(function (li) { return li.getAttribute('data-arch') === arch; });
      moved = items.filter(function (li) { return li.getAttribute('data-arch') !== arch; });
      if (keep.length !== 1) { keep = null; moved = []; }
    }
    // A copy of this computer's card for its other package: same name, version, requirements,
    // notes and links, without the ids.
    var alt = null;
    if (moved.length) {
      alt = card.cloneNode(true);
      alt.removeAttribute('id');
      all(alt, '[id]').forEach(function (el) { el.removeAttribute('id'); });
      var title = alt.querySelector('h3');
      title.setAttribute('id', 'platform-' + os + '-more-title');
      alt.setAttribute('aria-labelledby', 'platform-' + os + '-more-title');
      var pkgs = alt.querySelector('.pkgs');
      all(pkgs, '[data-arch]').forEach(function (li) { li.remove(); });
      moved.forEach(function (li) { pkgs.appendChild(li); });
    }

    main.insertBefore(card, main.firstChild);
    if (alt) list.appendChild(alt);
    cards.forEach(function (c) { if (c !== card) list.appendChild(c); });
    card.classList.add('platform--current');
    other.hidden = false;
    section.setAttribute('data-os', os);
    if (keep) section.setAttribute('data-arch', arch);
    return true;
  }

  // A link to a card that is now inside "Other downloads" opens it.
  function openForHash(doc, hash) {
    var other = doc.querySelector('.downloads-other');
    if (!other || other.hidden || !hash || hash.length < 2) return;
    var target = doc.getElementById(decodeURIComponent(hash.slice(1)));
    if (target && other.contains(target)) other.open = true;
  }

  /**
   * Runs the guess and applies it once. The hero changes at once, before anyone can press it (and
   * it stays a link to the downloads, so it never starts a download). The download section waits
   * for the architecture; if the visitor has already pressed or focused something there by then,
   * it is left as built so nothing moves under them.
   */
  function run(doc, nav, options) {
    var engaged = false;
    var section = doc.getElementById('download');
    if (section) {
      ['pointerdown', 'keydown', 'focusin'].forEach(function (type) { section.addEventListener(type, function () { engaged = true; }); });
    }
    var os;
    try { os = osOf(nav); } catch (error) { os = 'unknown'; }
    if (section) section.setAttribute('data-os', os);
    // The operating system is known at once; the hero needs nothing more.
    try { applyHero(doc, os); } catch (error) { if (global.console) global.console.warn(error); }
    return detect(nav, options).then(function (found) {
      if (engaged) return found;
      try {
        if (applyDownloads(doc, found.os, found.arch)) {
          var loc = global.location;
          if (loc) openForHash(doc, loc.hash);
          if (global.addEventListener) global.addEventListener('hashchange', function () { openForHash(doc, global.location.hash); });
        }
      } catch (error) { if (global.console) global.console.warn(error); }
      return found;
    });
  }

  global.SofatapPlatform = { osOf: osOf, archOf: archOf, detect: detect, applyHero: applyHero, applyDownloads: applyDownloads, run: run };

  if (global.document && global.navigator) {
    try { run(global.document, global.navigator); } catch (error) { if (global.console) global.console.warn(error); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
