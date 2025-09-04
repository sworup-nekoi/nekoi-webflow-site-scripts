/**
 * NEKOI — Cursor Click Pulse (Footer JS)
 * Spawns a square pulse at the mouse click position.
 * - Mouse only (no touch/pen)
 * - Auto-cleans elements
 * - Safe on SPA navigations (guards double init)
 *
 * Pair with: Cursor-click/cursor-click-head.css
 */
(function () {
  // Prevent double-initialization (e.g., SPA swaps)
  if (window.NekoiClickPulse) return;
  window.NekoiClickPulse = true;

  var MAX_PULSES = 8;          // maximum pulses kept in the layer
  var Z_INDEX = 9999;       // overlay stacking (above custom cursor)
  var DURATION_MS = 420;       // keep in sync with --click-box-duration

  var layer = null;

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'click-pulse-layer';
    var s = layer.style;
    s.position = 'fixed';
    s.left = '0'; s.top = '0'; s.right = '0'; s.bottom = '0';
    s.pointerEvents = 'none';
    s.zIndex = String(Z_INDEX);
    document.body.appendChild(layer);
    return layer;
  }

  function spawn(x, y) {
    var parent = ensureLayer();
    var el = document.createElement('div');
    el.className = 'click-pulse';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    parent.appendChild(el);

    var cleaned = false;
    function clean() {
      if (cleaned) return; cleaned = true;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    // Remove when animation ends, with a timeout fallback
    el.addEventListener('animationend', clean, { once: true });
    setTimeout(clean, DURATION_MS + 200);

    // Cap the number of pulses to avoid DOM bloat
    while (parent.firstElementChild && parent.childElementCount > MAX_PULSES) {
      parent.removeChild(parent.firstElementChild);
    }
  }

  function onPointerDown(e) {
    // Only left-clicks from a physical mouse
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    spawn(e.clientX, e.clientY);
  }

  // Register listeners: prefer Pointer Events; fallback to mouse events
  if ('onpointerdown' in window) {
    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
  } else {
    window.addEventListener('mousedown', function (e) {
      if (typeof e.button === 'number' && e.button !== 0) return; // left button only
      spawn(e.clientX, e.clientY);
    }, { passive: true, capture: true });
  }
})();