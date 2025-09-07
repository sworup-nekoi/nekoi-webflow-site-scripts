/**
 * NEKOI — Fit Text (Footer JS)
 * Always fits single-line text to its container width by measuring at a base size
 * and scaling to match the available width exactly (no min/max clamps).
 *
 * Usage: add class `fit-text` to any text element.
 * Optional per-element custom properties (set in Webflow):
 *   --fit-base: 100px;  // measurement baseline (does not change final size)
 *   --fit-pad:  0px;    // subtract from container width (e.g., inner padding)
 */
(function(){
  // Guard double init (e.g., SPA swaps)
  if (window.NekoiFitText) return;

  var SEL = '.fit-text';
  var pending = [];          // queued elements to fit
  var rafId = null;          // RAF id for batching
  var RO = null;             // ResizeObserver
  var MO = null;             // MutationObserver

  function has(arr, el){ for (var i=0;i<arr.length;i++){ if (arr[i]===el) return true; } return false; }
  function empty(arr){ arr.length = 0; }

  function pxVar(el, name, fallback){
    var v = '' + (getComputedStyle(el).getPropertyValue(name) || '').trim();
    if (!v) return fallback;
    if (v.slice(-3) === 'rem') return parseFloat(v) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (v.slice(-2) === 'em')  return parseFloat(v) * parseFloat(getComputedStyle(el).fontSize);
    return parseFloat(v);
  }

  function fit(el){
    if (!el || !el.parentElement) return;
    var base = pxVar(el, '--fit-base', 100) || 100;
    var pad  = pxVar(el, '--fit-pad', 0) || 0;

    var parent = el.parentElement;

    // Save styles we touch
    var prevFS = el.style.fontSize;
    var prevWS = el.style.whiteSpace;

    // Measure at base size, single line
    el.style.fontSize = base + 'px';
    el.style.whiteSpace = 'nowrap';

    // Width of the text at base size
    var textW = el.scrollWidth || el.getBoundingClientRect().width || 0;

    // Available width inside the container
    var cw = parent.clientWidth || parent.getBoundingClientRect().width || 0;
    var avail = Math.max(0, cw - pad);

    // Compute exact scale (no clamps)
    var scale = textW > 0 ? (avail / textW) : 1;
    var size = base * scale;

    // Snap to device pixel to avoid blur
    var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    size = Math.round(size * dpr) / dpr;

    el.style.fontSize = size + 'px';
    el.style.whiteSpace = prevWS || '';

    // If webfonts are still loading, refit after they finish
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(function(){ queue(el); });
      }
    } catch(_){}
  }

  function queue(el){
    if (!el) return;
    if (!has(pending, el)) pending.push(el);
    if (rafId) return;
    rafId = requestAnimationFrame(function(){
      rafId = null;
      var list = pending.slice();
      empty(pending);
      for (var i=0;i<list.length;i++) fit(list[i]);
    });
  }

  function fitAll(){
    var nodes = document.querySelectorAll(SEL);
    for (var i=0;i<nodes.length;i++) queue(nodes[i]);
  }

  function observe(el){
    if (!el) return;
    if (!RO && 'ResizeObserver' in window){
      RO = new ResizeObserver(function(entries){
        for (var i=0;i<entries.length;i++){
          var t = entries[i].target;
          if (t.matches && t.matches(SEL)) queue(t);
          if (t.querySelectorAll){
            var kids = t.querySelectorAll(SEL);
            for (var j=0;j<kids.length;j++) queue(kids[j]);
          }
        }
      });
    }
    if (!MO && 'MutationObserver' in window){
      MO = new MutationObserver(function(muts){
        var seen = [];
        for (var i=0;i<muts.length;i++){
          var n = muts[i].target;
          if (n && n.nodeType === 1){
            if (n.matches && n.matches(SEL) && !has(seen,n)) { seen.push(n); queue(n); }
            if (n.querySelectorAll){
              var all = n.querySelectorAll(SEL);
              for (var k=0;k<all.length;k++){ var el2 = all[k]; if (!has(seen,el2)) { seen.push(el2); queue(el2); } }
            }
          }
        }
      });
      MO.observe(document.documentElement, { subtree:true, childList:true, characterData:true, attributes:true });
    }
    if (RO){
      RO.observe(el);
      if (el.parentElement) RO.observe(el.parentElement);
    } else {
      // Fallback: window resize
      window.addEventListener('resize', function(){ queue(el); }, { passive:true });
    }
  }

  function init(){
    var list = document.querySelectorAll(SEL);
    for (var i=0;i<list.length;i++) observe(list[i]);
    fitAll();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // Public API
  window.NekoiFitText = { refresh: fitAll };

  // Refit on SPA/Swup custom event if used
  document.addEventListener('spa:ready', fitAll);
})();