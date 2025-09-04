

/**
 * NEKOI — Cursor Click Pulse (Footer JS)
 * Spawns a square pulse at the mouse click position.
 * - Mouse only (no touch/pen)
 * - Auto-cleans elements
 * - Safe on SPA navigations (guards double init)
 *
 * Pair with: Cursor-click/cursor-click-head.css
 */
(() => {
  // Prevent double-initialization (e.g., SPA swaps)
  if (window.NekoiClickPulse) return;
  window.NekoiClickPulse = true;

  const MAX_PULSES = 8;          // maximum pulses kept in the layer
  const Z_INDEX = 9998;          // overlay stacking (tweak if needed)
  const DURATION_MS = 420;       // keep in sync with --click-box-duration

  let layer = null;

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'click-pulse-layer';
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: String(Z_INDEX)
    });
    document.body.appendChild(layer);
    return layer;
  }

  function spawn(x, y) {
    const parent = ensureLayer();
    const el = document.createElement('div');
    el.className = 'click-pulse';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    parent.appendChild(el);

    // Remove when animation ends, with a timeout fallback
    const clean = () => { el.remove(); };
    el.addEventListener('animationend', clean, { once: true });
    setTimeout(() => {
      if (el.isConnected) clean();
    }, DURATION_MS + 200);

    // Cap the number of pulses to avoid DOM bloat
    while (parent.childElementCount > MAX_PULSES) {
      parent.firstElementChild?.remove();
    }
  }

  function onPointerDown(e) {
    // Only left-clicks from a physical mouse
    if ((e.pointerType && e.pointerType !== 'mouse') || (e.button != null && e.button !== 0)) return;
    spawn(e.clientX, e.clientY);
  }

  // Register listeners: prefer Pointer Events; fallback to mouse events
  if ('onpointerdown' in window) {
    window.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
  } else {
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // left button only
      spawn(e.clientX, e.clientY);
    }, { passive: true, capture: true });
  }
})();