/*!
 * LOGO EYES — pupils track the cursor, blink, and idle‑dart
 * Usage: wrap two `.pupil` elements inside `.logo-eyes .eyes`
 * Tuning: CSS custom property `--eye-move` (any CSS length) on `.logo-eyes`
 * Re-inits automatically after SPA swaps via `spa:ready` event.
 */
(function () {
  "use strict";

  const PASSIVE = { passive: true };
  const IS_TOUCH = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  // Resolve a CSS custom property representing a *length* to pixels (supports clamp(), vw/vh/vmin)
  function readLenVarPx(scopeEl, varName) {
    try {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = `var(${varName})`;
      scopeEl.appendChild(probe);
      const px = parseFloat(getComputedStyle(probe).width);
      probe.remove();
      return Number.isFinite(px) ? px : NaN;
    } catch {
      return NaN;
    }
  }

  function initEyesOnPage() {
    const wraps = document.querySelectorAll(".logo-eyes .eyes");
    if (!wraps.length) return;

    wraps.forEach((wrap) => {
      if (wrap.dataset.logoEyesInit === "1") return;
      wrap.dataset.logoEyesInit = "1";
      setupOne(wrap, IS_TOUCH);
    });
  }

  function setupOne(wrap, isTouch) {
    const pupils = Array.from(wrap.querySelectorAll(".pupil"));
    if (pupils.length < 2) return;

    // ----- CONFIG -----
    const BLINK_INTERVAL = 2000;   // ms between blinks (base, with jitter)
    const BLINK_DURATION = 120;    // ms eyelid close time
    const TRIGGER_DISTANCE = 40;   // px for dilation falloff (desktop only)
    const SMOOTH = 0.08;           // 0..1 follow snappiness
    const MIN_SCALE = 1.0;
    const MAX_SCALE = 1.2;

    // Eased blink tuning
    const BLINK_HOLD_MS = 60;      // how long lids stay fully closed
    const BLINK_OPEN_SMOOTH  = 0.22;  // easing for opening (smaller = quicker)
    const BLINK_CLOSE_SMOOTH = 0.35;  // easing for closing (smaller = quicker)
    const MIN_LID = 0.06;            // how “closed” the lids get (0 = fully flat)

    // Movement range: CSS --eye-move (supports clamp) or auto-calc from geometry
    const host = wrap.closest(".logo-eyes") || wrap;
    let MOVEMENT = readLenVarPx(host, "--eye-move");
    if (!Number.isFinite(MOVEMENT)) MOVEMENT = calcMovement();

    // ----- STATE -----
    let tx = 0, ty = 0;           // target offsets
    let x = 0,  y = 0;            // animated offsets
    let scl = 1;                  // pupil scale (desktop "dilate" toward pointer)
    let sclY = 1;                 // vertical squish for blinks (current)
    let sclYGoal = 1;             // target eyelid scaleY (for eased blink)
    let idleTimer = null;
    let dartTimer = null;

    // Animation loop (per wrapper)
    (function raf() {
      // position smoothing
      x += (tx - x) * SMOOTH;
      y += (ty - y) * SMOOTH;

      // eyelid easing: use different speeds for closing vs opening
      const ease = sclYGoal < sclY ? BLINK_CLOSE_SMOOTH : BLINK_OPEN_SMOOTH;
      sclY += (sclYGoal - sclY) * ease;

      const t = `translate(${x}px, ${y}px) scale(${scl}) scaleY(${sclY})`;
      for (let i = 0; i < pupils.length; i++) pupils[i].style.transform = t;
      requestAnimationFrame(raf);
    })();

    // Cursor tracking (desktop only)
    function onMove(e) {
      const b = wrap.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      const ang = Math.atan2(dy, dx);
      tx = Math.cos(ang) * MOVEMENT;
      ty = Math.sin(ang) * MOVEMENT;

      const dist = Math.min(Math.hypot(dx, dy), TRIGGER_DISTANCE);
      scl = MAX_SCALE - (dist / TRIGGER_DISTANCE) * (MAX_SCALE - MIN_SCALE);

      armIdle();
    }
    if (!isTouch) window.addEventListener("mousemove", onMove, PASSIVE);

    // Idle "darting" (random small movements)
    function startDart() {
      stopDart();
      dartTimer = setInterval(() => {
        tx = (Math.random() - 0.5) * MOVEMENT * 2;
        ty = (Math.random() - 0.5) * MOVEMENT * 2;
      }, 1200);
    }
    function stopDart() {
      if (dartTimer) {
        clearInterval(dartTimer);
        dartTimer = null;
      }
    }

    function armIdle() {
      clearTimeout(idleTimer);
      stopDart();
      if (isTouch) scl = 1;
      idleTimer = setTimeout(startDart, 2000);
    }

    // Touch: treat any interaction as activity and keep eyes subtle
    if (isTouch) {
      const onInteract = () => {
        tx = 0;
        ty = 0;
        armIdle();
      };
      window.addEventListener("pointerdown", onInteract, PASSIVE);
      window.addEventListener("pointermove", onInteract, PASSIVE);
      window.addEventListener("scroll", onInteract, PASSIVE);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") armIdle();
      });
    }

    // Start idle timer
    armIdle();

    // Blink (randomized, eased with occasional natural double‑blink)
    (function scheduleBlink() {
      const jitter = () => BLINK_INTERVAL + Math.random() * 2000;

      function blinkOnce(then) {
        // ease closed → hold → ease open
        sclYGoal = MIN_LID;
        setTimeout(() => {
          sclYGoal = 1;
          if (then) setTimeout(then, 40 + Math.random() * 120); // brief pause before second blink
        }, BLINK_HOLD_MS);
      }

      setTimeout(function tick() {
        if (Math.random() < 0.15) {
          // ~15% chance of a double blink
          blinkOnce(() => blinkOnce());
        } else {
          blinkOnce();
        }
        setTimeout(tick, jitter());
      }, jitter());
    })();

    // Recalc movement on resize (re-read CSS var or auto-calc)
    window.addEventListener(
      "resize",
      () => {
        setTimeout(() => {
          const m = readLenVarPx(host, "--eye-move");
          MOVEMENT = Number.isFinite(m) ? m : calcMovement();
        }, 0);
      },
      PASSIVE
    );

    // Derive a sane MOVEMENT from current geometry
    function calcMovement() {
      const b = wrap.getBoundingClientRect();
      const pRect = pupils[0].getBoundingClientRect();
      const eyeH = b.height;

      const p0 = pupils[0].getBoundingClientRect();
      const p1 = pupils[1].getBoundingClientRect();
      const cx0 = p0.left + p0.width / 2;
      const cx1 = p1.left + p1.width / 2;
      const eyeGap = Math.abs(cx1 - cx0);

      const byH = Math.max(3, (eyeH - pRect.height) * 0.33);
      const byG = Math.max(3, (eyeGap - pRect.width) * 0.25);
      return Math.min(14, Math.max(5, Math.min(byH, byG)));
    }
  }

  // Run on initial load and after SPA content swaps
  if (document.readyState !== "loading") initEyesOnPage();
  else document.addEventListener("DOMContentLoaded", initEyesOnPage);
  document.addEventListener("spa:ready", initEyesOnPage);
})();
