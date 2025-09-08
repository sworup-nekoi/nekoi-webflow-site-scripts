/**
 * NEKOI — Fit Text V4 (Footer JS, ES5/min-safe)
 * Reusable, class-based, content-aware fit-to-container with no trailing gap.
 *
 * Usage in Webflow/HTML:
 *   <div class="fit-text-container">  <!-- the container whose inner width we fill -->
 *     <h1 class="fit-text">NEKOI</h1>  <!-- the text that should fill -->
 *   </div>
 *   // Optional: set letter-spacing on .fit-text; this script converts it to flex gap
 *
 * Classes:
 *   - .fit-text-container  → container to fit into (padding is respected)
 *   - .fit-text            → text to scale; kept single-line; trailing gap removed
 *
 * Notes:
 *   - ES5 compatible; safe observers; rAF-batched; avoids attribute/style loops
 *   - Exposes window.NekoiFitTextV4.{refresh(), destroy()}
 */
(function(){
  if (window.NekoiFitTextV4){ try{ window.NekoiFitTextV4.refresh(); }catch(e){} return; }

  var TEXT_SEL = '.fit-text';
  var CONT_SEL = '.fit-text-container';

  var els = [];
  var ros = [];                 // ResizeObservers
  var mos = [];                 // MutationObservers
  var queue = [];
  var rafId = null;

  function toPx(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function closestEl(el, sel){ while (el && el.nodeType === 1){ if (el.matches && el.matches(sel)) return el; el = el.parentElement; } return null; }
  function getContent(el){ var a = el.getAttribute('data-fit-text'); if (a) return a; return (el.textContent || '').replace(/\s+/g,' ').trim(); }
  function hasClass(el, cls){ return el && ((' ' + el.className + ' ').indexOf(' ' + cls + ' ') !== -1); }
  function getWrap(el){ var f = el.firstElementChild; return (f && hasClass(f, '__fitLetters')) ? f : null; }

  // Create or refresh the per-letter wrapper; convert letter-spacing -> gap (no trailing gap)
  // Also supports optional CSS var --fit-gap (px|em|number=em)
  function ensureWrap(el){
    var wrap = getWrap(el);

    // temporarily clear inline letter-spacing so computed reflects Designer rules
    var prevInlineLS = el.style.letterSpacing;
    el.style.letterSpacing = '';

    var cs = getComputedStyle(el);
    var fs = toPx(cs.fontSize) || 16;

    // Prefer CSS var override when provided
    var varGap = (cs.getPropertyValue && cs.getPropertyValue('--fit-gap')) ? cs.getPropertyValue('--fit-gap').trim() : '';
    var lsEm = 0;
    if (varGap) {
      if (/px$/i.test(varGap))      lsEm = toPx(varGap) / fs;
      else if (/em$/i.test(varGap)) lsEm = parseFloat(varGap) || 0;
      else                           lsEm = parseFloat(varGap) || 0; // bare number => em
    } else {
      var lsRaw = cs.letterSpacing;
      var lsPx = (lsRaw && lsRaw !== 'normal') ? toPx(lsRaw) : 0;
      lsEm = fs ? (lsPx / fs) : 0;
    }

    if (wrap){
      wrap.style.gap = (lsEm ? lsEm : 0) + 'em';
      // lock host tracking to 0 so there is no trailing gap
      el.style.letterSpacing = '0';
      return wrap;
    }

    var text = getContent(el);
    if (!text) { el.style.letterSpacing = prevInlineLS || '0'; return null; }

    // mark so our MutationObserver ignores this rebuild
    el.__fit_spanifying = true;

    wrap = document.createElement('span');
    wrap.className = '__fitLetters';
    var ws = wrap.style;
    ws.display = 'inline-flex';
    ws.whiteSpace = 'nowrap';
    ws.alignItems = 'baseline';
    ws.gap = (lsEm ? lsEm : 0) + 'em';

    // neutralize letter-spacing on the host element; we emulate via gap
    el.style.letterSpacing = '0';

    for (var i = 0; i < text.length; i++){
      var ch = text.charAt(i);
      var s = document.createElement('span');
      s.textContent = (ch === ' ') ? '\u00A0' : ch;
      s.style.display = 'inline-block';
      wrap.appendChild(s);
    }

    // replace children
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(wrap);

    el.__fit_spanifying = false;
    return wrap;
  }

  function fitOne(el){
    var container = closestEl(el, CONT_SEL) || el.parentElement;
    if (!container) return;

    var wrap = ensureWrap(el);
    if (!wrap) return;

    // container inner width (minus padding)
    var csC = getComputedStyle(container);
    var padL = toPx(csC.paddingLeft), padR = toPx(csC.paddingRight);
    var cw = (container.clientWidth || container.getBoundingClientRect().width) - padL - padR;
    if (!(cw > 0)) return;

    // Skip work if nothing meaningful changed — use actual gap (wrap) not letter-spacing (host is 0)
    var sig = getContent(el) + '|' + (wrap.style.gap || '0') + '|' + cw.toFixed(2);
    if (el.__fit_lastSig === sig) return;

    // measure intrinsically at base
    var BASE = 100; // px
    var prevFS = el.style.fontSize;
    var prevWS = el.style.whiteSpace;
    var prevDisp = el.style.display;
    var prevW = el.style.width;

    el.style.whiteSpace = 'nowrap';
    el.style.display = 'inline-block';
    el.style.width = 'auto';
    el.style.fontSize = BASE + 'px';

    var tw = wrap.scrollWidth || wrap.getBoundingClientRect().width || 0;
    if (!(tw > 0)){
      el.style.fontSize = prevFS; el.style.whiteSpace = prevWS; el.style.display = prevDisp; el.style.width = prevW; return;
    }

    // exact scale and snap to device pixel for crisp text
    var scale = cw / tw;
    var size  = Math.max(0.0001, BASE * scale);
    var dpr   = Math.max(1, Math.round(window.devicePixelRatio || 1));
    var final = Math.round(size * dpr) / dpr;

    // apply and restore layout props
    el.style.fontSize = final + 'px';
    el.style.whiteSpace = prevWS || '';
    el.style.display    = prevDisp || '';
    el.style.width      = prevW || '';

    el.__fit_lastSig = sig;
  }

  function enqueue(el){
    if (queue.indexOf(el) === -1) queue.push(el);
    if (rafId) return;
    var raf = window.requestAnimationFrame || function(fn){ return setTimeout(fn,16); };
    rafId = raf(function(){
      rafId = null;
      var list = queue.slice(); queue.length = 0;
      for (var i = 0; i < list.length; i++) fitOne(list[i]);
    });
  }

  function refresh(){ for (var i = 0; i < els.length; i++) enqueue(els[i]); }

  function observe(el){
    var container = closestEl(el, CONT_SEL) || el.parentElement;

    // Refit on container resize only (avoid element resize feedback)
    if (typeof ResizeObserver !== 'undefined'){
      var ro = new ResizeObserver(function(){ enqueue(el); });
      ro.observe(container);
      ros.push(ro);
    } else {
      window.addEventListener('resize', function(){ enqueue(el); }, { passive: true });
    }

    // Watch text content changes only (avoid attribute/style loops)
    var mo = new MutationObserver(function(muts){
      if (el.__fit_spanifying) return; // ignore our own span rebuilds
      for (var i = 0; i < muts.length; i++){
        var m = muts[i];
        if (m.type === 'characterData' || m.type === 'childList'){
          ensureWrap(el);
          enqueue(el);
          break;
        }
      }
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    mos.push(mo);
  }

  function init(){
    els = [];
    var nodeList = document.querySelectorAll(TEXT_SEL);
    for (var i = 0; i < nodeList.length; i++) els.push(nodeList[i]);

    for (var j = 0; j < els.length; j++){ ensureWrap(els[j]); observe(els[j]); }
    refresh();
    try { if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') { document.fonts.ready.then(refresh); } } catch(_){ }
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  window.NekoiFitTextV4 = {
    refresh: refresh,
    destroy: function(){
      for (var i = 0; i < ros.length; i++) try { ros[i].disconnect(); } catch(e){}
      for (var j = 0; j < mos.length; j++) try { mos[j].disconnect(); } catch(e){}
      ros = []; mos = []; els = []; queue = [];
      if (rafId){ if (window.cancelAnimationFrame) cancelAnimationFrame(rafId); else clearTimeout(rafId); rafId = null; }
      delete window.NekoiFitTextV4;
    }
  };
})();