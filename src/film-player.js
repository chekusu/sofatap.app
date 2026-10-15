// The film's quiet player (progressive enhancement; separate from the phone → TV demo).
// Without this script, or if setting it up fails at any step, the native <video controls> player
// stays exactly as it was: setup is all or nothing and undoes itself on any error.
//  - Nothing plays by itself: no autoplay, no loop, no resuming. Only the visitor's play or
//    replay starts the film, with its narration (sound on unless they turned it off).
//  - Once set up, the native chrome goes and three icon buttons sit below the picture:
//    play/pause, sound on/off and play from the start ([data-action="play|sound|replay"]).
//    Clicking the picture also plays or pauses.
//  - Captions come from the page's own WebVTT track and are drawn in an HTML layer over the
//    picture, so the picture's feathered edge never fades them. That layer is the only visible
//    caption: every track is kept 'hidden', also when the browser later switches one to 'showing'.
//  - Labels and states follow the media element's own events, so fast clicks, a rejected play()
//    and the end of the film cannot leave a wrong label.
(function (global) {
  'use strict';

  var LABEL_KEYS = ['play', 'pause', 'soundOn', 'soundOff', 'replay'];

  // Everything is checked before the page is touched.
  function parts(root) {
    var labels = JSON.parse(root.getAttribute('data-labels'));
    if (!labels || typeof labels !== 'object') throw new Error('film: no labels');
    LABEL_KEYS.forEach(function (k) {
      if (typeof labels[k] !== 'string' || !labels[k].trim()) throw new Error('film: missing label ' + k);
    });
    var p = { labels: labels, controls: root.querySelector('.film__controls'), captions: root.querySelector('.film__captions'), btn: {} };
    if (!p.controls || !p.captions) throw new Error('film: missing controls or captions');
    ['play', 'sound', 'replay'].forEach(function (action) {
      p.btn[action] = root.querySelector('[data-action="' + action + '"]');
      if (!p.btn[action]) throw new Error('film: missing ' + action + ' button');
    });
    return p;
  }

  function attach(root) {
    var video = root && root.querySelector('video');
    if (!video || root.getAttribute('data-ready') === 'true') return null;
    var p = parts(root);
    var labels = p.labels, controls = p.controls, captions = p.captions, btn = p.btn;
    var tracks = video.textTracks;
    var track = tracks && tracks.length ? tracks[0] : null;

    // What setup changes, so a failure can put it all back.
    var listeners = [];
    var on = function (target, type, fn) { target.addEventListener(type, fn); listeners.push([target, type, fn]); };
    var modes = [];
    for (var i = 0; tracks && i < tracks.length; i++) modes.push([tracks[i], tracks[i].mode]);
    var had = { controls: video.hasAttribute('controls'), loop: video.loop };

    function rollback() {
      listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
      listeners = [];
      modes.forEach(function (m) { m[0].mode = m[1]; });
      if (had.controls) video.setAttribute('controls', '');
      video.loop = had.loop;
      controls.hidden = true;
      captions.hidden = true;
      captions.textContent = '';
      root.removeAttribute('data-ready');
      root.removeAttribute('data-state');
      root.classList.remove('is-ready');
    }

    function playing() { return !video.paused && !video.ended; }

    function render() {
      var now = playing();
      btn.play.setAttribute('aria-label', now ? labels.pause : labels.play);
      btn.play.setAttribute('data-state', now ? 'pause' : 'play');
      var audible = !video.muted;
      btn.sound.setAttribute('aria-label', audible ? labels.soundOff : labels.soundOn);
      btn.sound.setAttribute('aria-pressed', String(audible));
      btn.sound.setAttribute('data-state', audible ? 'on' : 'off');
      root.setAttribute('data-state', video.ended ? 'ended' : now ? 'playing' : 'paused');
    }

    function start() {
      var result = video.play();
      // A rejected play() (for example no media, or the browser refused) leaves it paused.
      if (result && typeof result.catch === 'function') result.catch(render);
      render();
    }

    function toggle() {
      if (playing()) video.pause();
      else {
        if (video.ended) video.currentTime = 0;
        start();
      }
      render();
    }

    function keepHidden() {
      for (var j = 0; j < tracks.length; j++) if (tracks[j].mode === 'showing') tracks[j].mode = 'hidden';
    }
    function showCue() {
      keepHidden();
      var cues = track.activeCues || [];
      var text = [];
      for (var j = 0; j < cues.length; j++) text.push(cues[j].text);
      text = text.join('\n');
      if (captions.textContent !== text) captions.textContent = text;
      captions.hidden = !text;
    }

    try {
      on(btn.play, 'click', toggle);
      on(btn.sound, 'click', function () { video.muted = !video.muted; render(); });
      on(btn.replay, 'click', function () { video.currentTime = 0; start(); });
      ['play', 'playing', 'pause', 'ended', 'volumechange', 'seeked', 'emptied'].forEach(function (e) { on(video, e, render); });

      // Captions: the page's own track, as text (never HTML). The track stays 'hidden' so its cues
      // and cuechange keep working while nothing is drawn natively.
      if (track) {
        on(tracks, 'change', showCue);
        on(tracks, 'addtrack', keepHidden);
        ['loadstart', 'loadedmetadata', 'loadeddata', 'play', 'seeked'].forEach(function (e) { on(video, e, keepHidden); });
        on(track, 'cuechange', showCue);
        track.mode = 'hidden';
        showCue();
      }

      // Replace the native controls.
      video.removeAttribute('controls');
      on(video, 'click', toggle);
      video.loop = false;
      controls.hidden = false;
      root.setAttribute('data-ready', 'true');
      root.classList.add('is-ready');
      render();
    } catch (error) {
      rollback();
      throw error;
    }
    return { render: render };
  }

  global.SofatapFilmPlayer = { attach: attach };

  if (global.document) {
    try { attach(global.document.querySelector('.film')); } catch (error) {
      // attach has already put the native player back.
      if (global.console) global.console.warn(error);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
