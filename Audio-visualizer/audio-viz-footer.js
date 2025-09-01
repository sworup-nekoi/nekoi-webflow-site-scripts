/*
  Audio Visualizer (Canvas + WebAudio) — jsDelivr version
  ------------------------------------------------------
  • Looks for a wrapper:  #audio-viz  or  .audio-visualizer
  • Reads theme + layout from CSS custom properties (scoped on <html>/<body>)
  • Creates a canvas overlay that fills the wrapper (does not change layout)
  • Connects to <audio id="site-music"> (or the first audio[src]) and visualizes
  • Persists play/pause across pages and optionally restores position
  • Alignment: set `--viz-align: left|right|center` (right mirrors order; center reserved)
*/
(function () {
  if (window.__audioVizInit) return;              // guard: only once per page
  window.__audioVizInit = true;

  function init() {
    try {
      // --- DOM --------------------------------------------------------------
      const wrap = document.getElementById("audio-viz") || document.querySelector(".audio-visualizer");
      if (!wrap) return; // nothing to draw into on this page

      const audioEl =
        document.getElementById("site-music") ||
        document.querySelector('audio[data-role="site-music"]') ||
        document.querySelector("audio#site-audio") ||
        document.querySelector("audio[src]");
      if (!audioEl) return;

      // allow AnalyserNode on remote audio + ensure it buffers
      try { audioEl.crossOrigin = audioEl.crossOrigin || "anonymous"; } catch {}
      audioEl.preload = audioEl.preload || "auto";

      // iOS inline playback hint
      try {
        audioEl.setAttribute("playsinline", "");
        audioEl.setAttribute("webkit-playsinline", "");
      } catch {}

      // Promote data-src → src and kick loading when the first user gesture happens
      function ensureAudioReady() {
        try {
          const hasRealSrc = !!audioEl.getAttribute("src");
          const ds = audioEl.getAttribute("data-src");
          if (ds && (!hasRealSrc || audioEl.src === "" || audioEl.src === location.href)) {
            audioEl.setAttribute("src", ds);
          }
          if (audioEl.preload === "none") {
            audioEl.preload = "auto";
          }
          // Force the element to acknowledge the (possibly new) src
          audioEl.load();
        } catch {}
      }

      // --- Persistence keys -------------------------------------------------
      const PLAY_KEY = "viz:was-playing";
      const TIME_KEY = "viz:last-time";      // optional: restore position

      // Canvas fills wrapper
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      Object.assign(canvas.style, {
        position: "absolute", inset: "0", width: "100%", height: "100%",
        display: "block", pointerEvents: "none"
      });
      wrap.appendChild(canvas);

      // --- CSS tokens (BODY first so theme tokens apply) --------------------
      const VAR_SCOPE = document.body || document.documentElement;
      const cssVar = (name, fb) => {
        let v = getComputedStyle(VAR_SCOPE).getPropertyValue(name).trim();
        if (!v) v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fb;
      };
      const lenVarPx = (name, fbPx) => {
        const probe = document.createElement("div");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.width = `var(${name})`;
        (document.body || document.documentElement).appendChild(probe);
        const px = parseFloat(getComputedStyle(probe).width);
        probe.remove();
        return Number.isFinite(px) ? px : fbPx;
      };

      // Theme + layout knobs (live)
      let BAR_A, BAR_B, CAP, CAP_GAP_PX, CAP_H_PX, CAP_DROP,
          PAD_X, GAP_X, MAX_BARS, MIN_BAR, BAND_CURVE, ALT_EVERY,
          AGC_ON, AGC_SMOOTH, AGC_MAX, SENSITIVITY, SMOOTHING,
          QUIET_BOOST, MIN_ACTIVE_FRAC, MIN_ACTIVE_PX, IDLE_PX, SILENCE_THRESH, ALIGN;

      function readTheme() {
        BAR_A       = cssVar("--viz-bar",       "#fff");
        BAR_B       = cssVar("--viz-bar-alt",   BAR_A);
        CAP         = cssVar("--viz-cap",       "transparent");

        PAD_X       = lenVarPx("--viz-pad-x",    8);
        GAP_X       = lenVarPx("--viz-gap",      2);
        MAX_BARS    = Math.max(1, parseInt(cssVar("--viz-max-bars", "64"), 10) || 64);
        MIN_BAR     = Math.max(1, lenVarPx("--viz-min-bar", 8));

        CAP_GAP_PX  = lenVarPx("--viz-cap-gap",  2);
        CAP_H_PX    = lenVarPx("--viz-cap-h",    2);
        CAP_DROP    = Math.max(0.02, parseFloat(cssVar("--viz-cap-drop","0.6")) || 0.6);

        BAND_CURVE  = Math.max(0.4, parseFloat(cssVar("--viz-band-curve", "1.6")) || 1.6);
        ALT_EVERY   = Math.max(1, parseInt(cssVar("--viz-alt-every", "2"), 10) || 2);

        AGC_ON      = cssVar("--viz-agc", "1") !== "0";
        AGC_SMOOTH  = Math.min(0.5, Math.max(0.01, parseFloat(cssVar("--viz-agc-smooth", "0.1")) || 0.1));
        AGC_MAX     = Math.max(1, parseFloat(cssVar("--viz-agc-max", "16")) || 16);

        SENSITIVITY = Math.max(0.1, parseFloat(cssVar("--viz-sensitivity","1.35")) || 1.35);
        SMOOTHING   = Math.min(0.98, Math.max(0, parseFloat(cssVar("--viz-smoothing","0.60")) || 0.60));

        QUIET_BOOST     = Math.max(0, parseFloat(cssVar("--viz-quiet-boost","1.45")) || 1.45);
        MIN_ACTIVE_FRAC = Math.min(1, Math.max(0, parseFloat(cssVar("--viz-min-active-frac","0.40")) || 0.40));
        MIN_ACTIVE_PX   = lenVarPx("--viz-min-active-px", 3);

        IDLE_PX        = lenVarPx("--viz-idle-px", 2);
        SILENCE_THRESH = Math.max(0, Math.min(0.2, parseFloat(cssVar("--viz-silence-thresh","0.02")) || 0.02));
        ALIGN = (cssVar("--viz-align", "left") || "left").toLowerCase();
      }
      readTheme();

      // Watch theme-ish changes + OS scheme
      const mo = new MutationObserver(readTheme);
      mo.observe(document.documentElement, { attributes:true, attributeFilter:["data-theme","data-wf-theme","class"] });
      mo.observe(document.body,           { attributes:true, attributeFilter:["data-theme","data-wf-theme","class"] });
      const mqlDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      if (mqlDark && mqlDark.addEventListener) mqlDark.addEventListener("change", readTheme);

      // --- Web Audio --------------------------------------------------------
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();

      let source;
      try { source = ac.createMediaElementSource(audioEl); } catch { return; }

      const analyser = ac.createAnalyser();
      analyser.fftSize = 512; // 256 bins
      analyser.smoothingTimeConstant = SMOOTHING;

      const gain = ac.createGain();
      gain.gain.value = 0; // fade in after user gesture

      // Route audio so fades affect what the analyser "hears":
      // source → gain → destination, and also tap analyser AFTER gain
      source.connect(gain);
      gain.connect(ac.destination);
      gain.connect(analyser); // analyser monitors post‑gain signal (reflects fade in/out)

      // === Exposed playback API (fade via GainNode; iOS-friendly) ==========
      function fadeTo(target, ms = 300) {
        const now = ac.currentTime;
        const sec = Math.max(0.001, (ms|0) / 1000);
        const g = gain.gain;
        try {
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(Math.max(0, Math.min(1, target)), now + sec);
        } catch {}
        return new Promise(res => setTimeout(res, Math.max(0, ms|0)));
      }

      async function playWithFade(ms = 800) {
        try { ensureAudioReady(); } catch {}
        try { await ac.resume(); } catch {}
        try { await audioEl.play(); } catch {}
        sessionStorage.setItem(PLAY_KEY, "1");
        await fadeTo(1, ms);
      }

      async function pauseWithFade(ms = 400) {
        await fadeTo(0, ms);
        audioEl.pause();
        sessionStorage.setItem(PLAY_KEY, "0");
        try { sessionStorage.setItem(TIME_KEY, String(audioEl.currentTime || 0)); } catch {}
      }

      // Persist currentTime periodically
      (function bindPersistence() {
        if (audioEl.__vizPersistBound) return;
        audioEl.__vizPersistBound = true;
        const saveTime = () => {
          try { sessionStorage.setItem(TIME_KEY, String(audioEl.currentTime || 0)); } catch {}
        };
        audioEl.addEventListener("pause", saveTime);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") saveTime();
        });
        window.addEventListener("pagehide", saveTime);
        setInterval(() => { if (!audioEl.paused) saveTime(); }, 2000);
      })();

      // Click/tap toggle binding
      function initToggle(opts = {}) {
        const sel = opts.selector || "[data-viz-toggle]";
        document.querySelectorAll(sel).forEach((el) => bindToggle(el, opts));
      }

      function bindToggle(el, opts = {}) {
        const fadeInMs  = +el.dataset.fadeIn  || opts.fadeInMs  || 800;
        const fadeOutMs = +el.dataset.fadeOut || opts.fadeOutMs || 400;
        el.setAttribute("role", "button");
        if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
        // Improve mobile tap behavior (remove 300ms delay / prevent ghost click)
        el.style.touchAction = "manipulation";

        // iOS/Android gesture unlock: prime audio context on first touch/pointer
        // This ensures later programmatic play() calls succeed when no preloader is present.
        const primeOnce = (e) => {
          try {
            // Block default to avoid subsequent synthetic click navigation on link blocks
            if (e) {
              e.preventDefault();
              e.stopPropagation();
              if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            }
            // Ensure a real src is present and loading, and unlock the AudioContext
            ensureAudioReady();
            ac.resume().catch(()=>{});
            // Force gain to 0 so first audible frame is controlled by our fade
            const now = ac.currentTime;
            try {
              gain.gain.cancelScheduledValues(now);
              gain.gain.setValueAtTime(0, now);
            } catch {}
          } catch {}
        };
        el.addEventListener("pointerdown", primeOnce, { passive: false, once: true });

        const stopAll = (e) => {
          if (!e) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        };

        const setUI = (on) => {
          el.classList.toggle("is-playing", !!on);
          el.setAttribute("aria-pressed", on ? "true" : "false");
        };

        const onToggle = (e) => {
          stopAll(e);
          if (audioEl.paused || audioEl.ended) {
            playWithFade(fadeInMs).then(() => setUI(true));
          } else {
            pauseWithFade(fadeOutMs).then(() => setUI(false));
          }
        };

        // Use a single pointerup handler to avoid iOS double-tap quirks
        el.addEventListener("pointerup", onToggle, { passive: false });

        // Optional keyboard access
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") onToggle(e);
        });

        // reflect initial state
        const playing = sessionStorage.getItem(PLAY_KEY) === "1" && !audioEl.paused;
        setUI(playing);
      }

      // Expose API on window for external control
      window.__audioViz = {
        audio: audioEl,
        context: ac,
        analyser,
        gain,
        fadeTo,
        playWithFade,
        pauseWithFade,
        initToggle,
        ensureAudioReady,
      };

      // --- Sizing / DPR -----------------------------------------------------
      let dpr = Math.max(1, window.devicePixelRatio || 1);
      const bandsCache = { count: 0, ranges: [] };

      function resize() {
        dpr = Math.max(1, window.devicePixelRatio || 1);
        const w = wrap.clientWidth  || 1;
        const h = wrap.clientHeight || 1;
        canvas.width  = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        readTheme();
        bandsCache.count = 0;
      }
      resize();
      window.addEventListener("resize", resize, { passive:true });
      if (window.visualViewport) {
        visualViewport.addEventListener("resize", resize, { passive:true });
      }

      // --- Bands ------------------------------------------------------------
      const bins = new Uint8Array(analyser.frequencyBinCount);
      function buildBands(count, N, minBin = 2, maxBin = N) {
        const total = Math.max(minBin + 1, Math.min(maxBin, N));
        const span  = Math.max(1, total - minBin);
        const ranges = [];
        for (let i = 0; i < count; i++) {
          const t0 = i / count, t1 = (i + 1) / count;
          const u0 = Math.pow(t0, BAND_CURVE), u1 = Math.pow(t1, BAND_CURVE);
          let b0 = Math.floor(minBin + u0 * span);
          let b1 = Math.floor(minBin + u1 * span);
          if (b0 < minBin) b0 = minBin;
          if (b1 <= b0) b1 = Math.min(total, b0 + 1);
          if (b1 > total) b1 = total;
          ranges.push({ i0: b0, i1: b1 });
        }
        return ranges;
      }

      // --- Loop -------------------------------------------------------------
      let capBottoms = [];
      let agcScale = 1;
      let lastAlign = null;
      let themeTick = 0;

      function draw() {
        if ((themeTick++ % 12) === 0) readTheme();
        analyser.smoothingTimeConstant = SMOOTHING;

        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        ctx.clearRect(0, 0, w, h);

        analyser.getByteFrequencyData(bins);

        const innerW     = Math.max(1, w - PAD_X * 2);
        let   targetBars = Math.max(1, Math.floor(innerW / Math.max(1, MIN_BAR)));
        targetBars       = Math.min(MAX_BARS, targetBars);

        // Determine visual order (left-to-right placement) based on ALIGN
        let order = [];
        for (let i = 0; i < targetBars; i++) order[i] = i;
        if (ALIGN === "right") {
          order.reverse(); // mirror: highest-index band appears at left; visually "hug right"
        }
        // (Optional future: ALIGN === "center" could interleave from center; for now defaults to left)

        const totalGapW  = GAP_X * Math.max(0, targetBars - 1);
        const barW       = Math.max(1, (innerW - totalGapW) / targetBars);
        const baseY      = h - 2;
        const usableH    = Math.max(1, baseY - 6);

        if (bandsCache.count !== targetBars) {
          bandsCache.count  = targetBars;
          bandsCache.ranges = buildBands(targetBars, bins.length, 2, bins.length);
          capBottoms = new Array(targetBars).fill(baseY - CAP_GAP_PX);
        }

        // Average bins per band + frame max (after sensitivity)
        const bandVals = new Array(targetBars);
        let frameMax = 0.0001;
        for (let i = 0; i < targetBars; i++) {
          const { i0, i1 } = bandsCache.ranges[i];
          let sum = 0, width = Math.max(1, i1 - i0);
          for (let k = i0; k < i1; k++) sum += bins[k] || 0;
          let norm = (sum / width) / 255;
          norm = Math.max(0, Math.min(1, norm * SENSITIVITY));
          bandVals[i] = norm;
          if (norm > frameMax) frameMax = norm;
        }

        const silent = audioEl.paused || audioEl.muted || frameMax < SILENCE_THRESH;

        if (!silent && AGC_ON) {
          const target = Math.min(AGC_MAX, 0.90 / frameMax);
          agcScale += (target - agcScale) * AGC_SMOOTH;
        } else {
          agcScale += (1 - agcScale) * 0.2;
        }

        const quietBoostScale = !silent && frameMax < 0.08
          ? 1 + QUIET_BOOST * (0.08 - frameMax) / 0.08
          : 1;

        const K = Math.max(1, Math.floor(targetBars * MIN_ACTIVE_FRAC));
        const indices = Array.from({length: targetBars}, (_, i) => i)
          .sort((a, b) => bandVals[b] - bandVals[a]);
        const activeSet = new Set(indices.slice(0, K));

        for (let pos = 0; pos < targetBars; pos++) {
          const i = order[pos]; // band index to read from
          const x = PAD_X + pos * (barW + GAP_X);

          let barH, y;
          if (silent) {
            barH = Math.min(usableH, IDLE_PX);
            y = baseY - barH;
          } else {
            const norm = bandVals[i];
            barH = Math.max(2, Math.min(usableH, norm * agcScale * quietBoostScale * usableH));
            if (activeSet.has(i) && barH < MIN_ACTIVE_PX) barH = Math.min(usableH, MIN_ACTIVE_PX);
            y = baseY - barH;
          }

          const isAlt = (pos % ALT_EVERY) === (ALT_EVERY - 1);
          ctx.fillStyle = isAlt ? BAR_B : BAR_A;
          ctx.fillRect(x, y, barW, barH);

          if (CAP !== "transparent" && CAP !== "") {
            const targetBottom = y - CAP_GAP_PX;
            let bottom = Number.isFinite(capBottoms[i]) ? capBottoms[i] : targetBottom;
            bottom = targetBottom < bottom ? targetBottom : Math.min(bottom + CAP_DROP, targetBottom);
            capBottoms[i] = bottom;

            ctx.fillStyle = CAP;
            ctx.fillRect(x, bottom - CAP_H_PX, barW, CAP_H_PX);
          }
        }

        requestAnimationFrame(draw);
      }

      // --- Start audio + persistence ---------------------------------------
      function fadeIn() {
        const now = ac.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(1, now + 1.2);
      }

      function startAudio() {
        ac.resume().catch(()=>{});
        audioEl.play().catch(()=>{});
        fadeIn();
      }

      function startAudioOnce() {
        if (sessionStorage.getItem(PLAY_KEY) !== "1") {
          sessionStorage.setItem(PLAY_KEY, "1");
        }
        startAudio();
      }

      // remember play/pause + position
      audioEl.addEventListener("play",  () => sessionStorage.setItem(PLAY_KEY, "1"));
      audioEl.addEventListener("pause", () => sessionStorage.setItem(PLAY_KEY, "0"));
      window.addEventListener("pagehide", () => {
        try { sessionStorage.setItem(TIME_KEY, String(audioEl.currentTime || 0)); } catch {}
      });

      audioEl.addEventListener("loadedmetadata", () => {
        try {
          const t = parseFloat(sessionStorage.getItem(TIME_KEY) || "0");
          if (Number.isFinite(t) && audioEl.duration && t < audioEl.duration) {
            audioEl.currentTime = t;
          }
        } catch {}
      }, { once:true });

      // Gate audio start behind preloader if present/visible.
      // We always start playback MUTED inside the actual click gesture,
      // then fade up once the preloader is truly hidden. This satisfies
      // autoplay policies on all platforms (including iOS).
      const preloader = document.querySelector(".preloader");
      const overlayHot = document.querySelector(".overlay-expander");
      const preloaderVisible = !!(preloader && getComputedStyle(preloader).display !== "none");

      if (preloaderVisible) {
        // Helpers
        const isHidden = () => {
          if (!preloader) return true;
          if (!preloader.parentNode) return true;
          const cs = getComputedStyle(preloader);
          return cs.display === "none";
        };
        const isHot = () => !!(overlayHot && getComputedStyle(overlayHot).pointerEvents !== "none");

        // Arm the click only when the expander is interactive (pointer-events:auto)
        function armEnterClick() {
          const targets = [];
          if (preloader) targets.push(preloader);
          if (overlayHot && overlayHot !== preloader) targets.push(overlayHot);

          let armed = false;
          const captureOpts = { once: true, capture: true };

          const onEnter = (e) => {
            if (armed) return;
            armed = true;
            // make sure a real source is present and loading
            try { ensureAudioReady(); } catch {}
            // Mute immediately; start playback inside this user gesture
            const now = ac.currentTime;
            try {
              gain.gain.cancelScheduledValues(now);
              gain.gain.setValueAtTime(0, now);
            } catch {}
            ac.resume().catch(()=>{});
            audioEl.play().then(() => {
              sessionStorage.setItem(PLAY_KEY, "1");
            }).catch(()=>{});

            // Fade up ONLY once preloader is actually hidden
            const FADE_MS = 800;
            let mo2, poll2;
            const cleanup = () => {
              targets.forEach(t => t.removeEventListener("click", onEnter, captureOpts));
              if (mo2) mo2.disconnect();
              if (poll2) clearInterval(poll2);
            };
            const tryFade = () => {
              if (onEnter._didFade) return;
              if (isHidden()) {
                onEnter._didFade = true;
                fadeTo(1, FADE_MS);
                cleanup();
              }
            };
            if (preloader) {
              mo2 = new MutationObserver(tryFade);
              mo2.observe(preloader, { attributes: true, attributeFilter: ["style", "class"] });
            }
            poll2 = setInterval(tryFade, 120);

            // Allow the click to continue to the preloader so it can do its own hide logic.
            // (No stopPropagation here on purpose.)
          };

          targets.forEach(t => t.addEventListener("click", onEnter, captureOpts));
        }

        if (isHot()) {
          armEnterClick();
        } else {
          // Wait for overlay to become interactive
          let mo, poll, safetyTO;
          const check = () => {
            if (isHot()) {
              cleanup();
              armEnterClick();
            }
          };
          const cleanup = () => {
            if (mo) mo.disconnect();
            if (poll) clearInterval(poll);
            if (safetyTO) clearTimeout(safetyTO);
          };
          if (overlayHot) {
            mo = new MutationObserver(check);
            mo.observe(overlayHot, { attributes: true, attributeFilter: ["style", "class"] });
          }
          poll = setInterval(check, 120);
          safetyTO = setTimeout(check, 15000); // keep waiting; no fallback unlock
        }
      } else {
        // No preloader on this page: resume only if user had music playing.
        if (sessionStorage.getItem(PLAY_KEY) === "1") {
          try { ensureAudioReady(); } catch {}
          audioEl.play().then(() => {
            ac.resume().catch(()=>{});
            fadeTo(1, 800);
          }).catch(() => {
            // Autoplay blocked; user must use explicit [data-viz-toggle]
          });
        }
        // Otherwise do nothing: start via [data-viz-toggle] only.
      }

      // Auto-bind any [data-viz-toggle] controls on the page
      if (window.__audioViz && typeof window.__audioViz.initToggle === "function") {
        window.__audioViz.initToggle();
      }

      draw();
    } catch (e) {
      console.error("[viz] init error:", e);
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else
    init();
})();
