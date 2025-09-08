/**
 * NEKOI — Fit Text v3 (Footer JS)
 * Pixel-perfect, content-aware fit-to-container for titles.
 * - Targets: text `.studio-name` inside container `.hero-title`
 * - Removes trailing spacing by replacing letter-spacing with per-letter spans + flex gap
 * - Measures intrinsically at a base size and scales to container inner width
 * - Auto-refits on resize, text/style changes, and after webfonts load
 * - ES5/minifier-friendly
 */
(function(){
  // Prevent double init (e.g., multiple script tags / SPA swaps)
  if (window.NekoiFitTextV3) return;

  var TEXT_SEL = '.studio-name';
  var CONT_SEL = '.hero-title';

  var els = [];
  var ros = []; // ResizeObservers
  var mos = []; // MutationObservers

  function toPx(val){
    var n = parseFloat(val); return isFinite(n) ? n : 0;
  }

  function closestEl(el, sel){
    while (el && el.nodeType === 1){
      if (el.matches && el.matches(sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Create/refresh the per-letter span wrapper and convert tracking into gap (no trailing gap)
  function spanify(el){
    // If already spanified, refresh gap from current letter-spacing and return
    var wrap = el.querySelector('.__fitLetters');
    var cs = getComputedStyle(el);
    var fsPx = toPx(cs.fontSize) || 16;
    var lsRaw = cs.letterSpacing;
    var lsPx = (lsRaw && lsRaw !== 'normal') ? toPx(lsRaw) : 0;
    var lsEm = fsPx ? (lsPx / fsPx) : 0;

    if (wrap){
      wrap.style.gap = (lsEm ? lsEm : 0) + 'em';
      // Ensure parent letter-spacing is neutralized
      el.style.letterSpacing = '0';
      return wrap;
    }

    var text = (el.textContent || '').replace(/\s+/g,' ').trim();
    if (!text) return null;

    wrap = document.createElement('span');
    wrap.className = '__fitLetters';
    var ws = wrap.style;
    ws.display = 'inline-flex';
    ws.whiteSpace = 'nowrap';
    ws.alignItems = 'baseline';
    ws.gap = (lsEm ? lsEm : 0) + 'em';

    // Clear letter-spacing on the element itself; we emulate via gap
    el.style.letterSpacing = '0';

    // Create spans per character (NBSP for spaces)
    for (var i=0; i<text.length; i++){
      var ch = text.charAt(i);
      var s = document.createElement('span');
      s.textContent = (ch === ' ') ? '\u00A0' : ch;
      s.style.display = 'inline-block';
      wrap.appendChild(s);
    }

    // Replace raw text with wrapper
    el.textContent = '';
    el.appendChild(wrap);
    return wrap;
  }

  function fitOne(el){
    var container = closestEl(el, CONT_SEL) || el.parentElement;
    if (!container) return;

    var wrap = spanify(el);
    if (!wrap) return;

    // Container inner width (minus padding)
    var csC = getComputedStyle(container);
    var padL = toPx(csC.paddingLeft), padR = toPx(csC.paddingRight);
    var cw = (container.clientWidth || container.getBoundingClientRect().width) - padL - padR;
    if (!isFinite(cw) || cw <= 0) return;

    // Save styles we touch
    var prevFS = el.style.fontSize;
    var prevWS = el.style.whiteSpace;
    var prevDisp = el.style.display;
    var prevW = el.style.width;

    // Intrinsic measurement at base size
    var BASE = 100; // px
    el.style.whiteSpace = 'nowrap';
    el.style.display = 'inline-block';
    el.style.width = 'auto';
    el.style.fontSize = BASE + 'px';

    var tw = wrap.scrollWidth || wrap.getBoundingClientRect().width || 0;
    if (!isFinite(tw) || tw <= 0){
      el.style.fontSize = prevFS; el.style.whiteSpace = prevWS; el.style.display = prevDisp; el.style.width = prevW; return;
    }

    // Exact scale and snap to device pixel for crispness
    var scale = cw / tw;
    var size  = Math.max(0.0001, BASE * scale);
    var dpr   = Math.max(1, Math.round(window.devicePixelRatio || 1));
    var final = Math.round(size * dpr) / dpr;

    // Apply and restore layout props
    el.style.fontSize = final + 'px';
    el.style.whiteSpace = prevWS || '';
    el.style.display    = prevDisp || '';
    el.style.width      = prevW || '';
  }

  function fitAll(){
    for (var i=0; i<els.length; i++) fitOne(els[i]);
  }

  function observe(el){
    var container = closestEl(el, CONT_SEL) || el.parentElement;

    // Refit on container or element resize
    if (window.ResizeObserver){
      var ro = new ResizeObserver(function(){ fitOne(el); });
      ro.observe(container); ro.observe(el);
      ros.push(ro);
    } else {
      window.addEventListener('resize', function(){ fitOne(el); }, { passive: true });
    }

    // Re-spanify & refit on content/style changes (text, tracking changes, etc.)
    var mo = new MutationObserver(function(){ spanify(el); fitOne(el); });
    mo.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    mos.push(mo);
  }

  function init(){
    els = Array.prototype.slice.call(document.querySelectorAll(TEXT_SEL));
    for (var i=0; i<els.length; i++){
      spanify(els[i]);
      fitOne(els[i]);
      observe(els[i]);
    }

    // Refit after webfonts load
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(function(){ fitAll(); });
      }
    } catch (_) {}
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // Public API for debugging
  window.NekoiFitTextV3 = {
    refresh: fitAll,
    teardown: function(){
      for (var i=0; i<ros.length; i++) try { ros[i].disconnect(); } catch(e){}
      for (var j=0; j<mos.length; j++) try { mos[j].disconnect(); } catch(e){}
      ros = []; mos = []; els = [];
      delete window.NekoiFitTextV3;
    }
  };
})();