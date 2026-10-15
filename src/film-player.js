// The film's quiet player (progressive enhancement; separate from the phone → TV demo).
// Without this script, or if setting it up fails, the native <video controls> player stays.
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

  function attach(root) {
    var video = root && root.querySelector('video');
    if (!video || root.getAttribute('data-ready') === 'true') return null;
    var labels = JSON.parse(root.getAttribute('data-labels'));
    var controls = root.querySelector('.film__controls');
    var captions = root.querySelector('.film__captions');
    var btn = {};
    ['play', 'sound', 'replay'].forEach(function (action) {
      btn[action] = root.querySelector('[data-action="' + action + '"]');
      if (!btn[action]) throw new Error('film: missing ' + action + ' button');
    });
    if (!controls || !captions) throw new Error('film: missing controls or captions');

    function playing() { return !video.paused && !video.ended; }

    function render() {
      var on = playing();
      btn.play.setAttribute('aria-label', on ? labels.pause : labels.play);
      btn.play.setAttribute('data-state', on ? 'pause' : 'play');
      var audible = !video.muted;
      btn.sound.setAttribute('aria-label', audible ? labels.soundOff : labels.soundOn);
      btn.sound.setAttribute('aria-pressed', String(audible));
      btn.sound.setAttribute('data-state', audible ? 'on' : 'off');
      root.setAttribute('data-state', video.ended ? 'ended' : on ? 'playing' : 'paused');
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

    btn.play.addEventListener('click', toggle);
    btn.sound.addEventListener('click', function () { video.muted = !video.muted; render(); });
    btn.replay.addEventListener('click', function () { video.currentTime = 0; start(); });
    ['play', 'playing', 'pause', 'ended', 'volumechange', 'seeked', 'emptied'].forEach(function (e) { video.addEventListener(e, render); });

    // Captions: the page's own track, as text (never HTML). The track stays 'hidden' so its cues
    // and cuechange keep working while nothing is drawn natively.
    var tracks = video.textTracks;
    var track = tracks && tracks[0];
    function keepHidden() {
      for (var i = 0; i < tracks.length; i++) if (tracks[i].mode === 'showing') tracks[i].mode = 'hidden';
    }
    function showCue() {
      keepHidden();
      var cues = track.activeCues || [];
      var text = [];
      for (var i = 0; i < cues.length; i++) text.push(cues[i].text);
      text = text.join('\n');
      if (captions.textContent !== text) captions.textContent = text;
      captions.hidden = !text;
    }
    if (track) {
      tracks.addEventListener('change', showCue);
      tracks.addEventListener('addtrack', keepHidden);
      ['loadstart', 'loadedmetadata', 'loadeddata', 'play', 'seeked'].forEach(function (e) { video.addEventListener(e, keepHidden); });
      track.addEventListener('cuechange', showCue);
      track.mode = 'hidden';
      showCue();
    }

    // Everything is wired: only now replace the native controls.
    video.removeAttribute('controls');
    video.addEventListener('click', toggle);
    video.loop = false;
    controls.hidden = false;
    root.setAttribute('data-ready', 'true');
    root.classList.add('is-ready');
    render();
    return { render: render };
  }

  global.SofatapFilmPlayer = { attach: attach };

  if (global.document) {
    var root = global.document.querySelector('.film');
    try { attach(root); } catch (error) {
      // Leave the native player as it is.
      if (root) root.classList.remove('is-ready');
      if (global.console) global.console.warn(error);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
