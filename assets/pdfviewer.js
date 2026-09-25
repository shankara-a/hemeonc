/* PDF.js viewer: all pages stacked and scrolled continuously, with a magnifier lens.
   The ◀ ▶ buttons jump to a page rather than swapping one out. */
(function () {
  const HH = (window.HH = window.HH || {});
  const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38";
  let libPromise = null;

  const lib = () => {
    if (!libPromise) {
      libPromise = import(`${CDN}/pdf.min.mjs`).then((m) => {
        m.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.mjs`;
        return m;
      });
    }
    return libPromise;
  };

  /**
   * Mount a viewer into `host`. Returns { destroy, refit, next, prev }.
   * host gets: .pdf-toolbar + .pdf-pages (one canvas per page) + .pdf-lens
   */
  HH.mountPdf = function (host, url, { title = "", meta = "", highlight = "" } = {}) {
    host.innerHTML = `
      <div class="pdf-toolbar">
        <span class="pdf-label"><b>${HH.esc(title)}</b>${meta ? `<span class="meta">${HH.esc(meta)}</span>` : ""}</span>
        <button class="btn small" data-nav="prev" title="Previous page (←)">◀</button>
        <span class="pg">…</span>
        <button class="btn small" data-nav="next" title="Next page (→)">▶</button>
        <span class="sep"></span>
        <button class="btn small" data-zoom="out" title="Zoom out">−</button>
        <button class="btn small" data-zoom="fit" title="Fit width">Fit</button>
        <button class="btn small" data-zoom="in" title="Zoom in">+</button>
        <button class="btn small" data-lens title="Magnifier — hover the page to zoom (L)">⌕ Lens</button>
        <button class="btn small pdf-hits" data-hits hidden></button>
        <span class="spacer"></span>
        <a class="btn small" href="${url}" target="_blank" rel="noopener">Open ↗</a>
        <a class="btn small" href="${url}" download>Download</a>
      </div>
      <div class="pdf-pages"><div class="pdf-status">Loading PDF…</div></div>
      <div class="pdf-lens" hidden><canvas></canvas></div>`;
    const pages = host.querySelector(".pdf-pages");
    const pg = host.querySelector(".pg");
    const nav = { prev: host.querySelector('[data-nav="prev"]'), next: host.querySelector('[data-nav="next"]') };
    let doc = null, zoom = 1, fit = true, page = 1, destroyed = false, rendering = null;
    let pdfjs = null, query = highlight || "";
    const pageInfo = new Map();             // page -> { vp, items } for drawing search marks

    /* ---- magnifier: a second render of one page at LENS_ZOOM, sampled under the cursor ---- */
    const LENS_ZOOM = 2, LENS_COLS = 3;     // the cards are laid out in three columns
    const lensEl = host.querySelector(".pdf-lens");
    const lensCv = lensEl.querySelector("canvas");
    const hiCache = new Map();              // page -> { canvas, key }
    let lensOn = false, hiBusy = false;
    try { lensOn = localStorage.getItem("hh.lens") === "1"; } catch (_) { /* ignore */ }

    /* To *see* a whole column magnified, the lens has to be a column wide TIMES the zoom —
       a lens merely as wide as the column would show only 1/zoom of it. */
    const lensBox = (cv) => {
      const pageW = cv ? cv.getBoundingClientRect().width : 780;
      const w = Math.round(Math.min((pageW / LENS_COLS) * LENS_ZOOM, pages.clientWidth - 16));
      return { w, h: Math.round(Math.min(w * 0.85, window.innerHeight - 120)) };
    };

    const buildHi = async (n) => {
      if (!doc || !lensOn || hiBusy) return null;
      const key = Math.round(zoom * 1000);
      const got = hiCache.get(n);
      if (got && got.key === key) return got.canvas;
      if (rendering) await rendering;          // never render the same page twice at once
      hiBusy = true;
      try {
        const p = await doc.getPage(n);
        const vp = p.getViewport({ scale: zoom * LENS_ZOOM });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        if (destroyed) return null;
        hiCache.set(n, { canvas: c, key });
        return c;
      } catch (_) {
        return null;
      } finally { hiBusy = false; }
    };

    const moveLens = (e) => {
      if (!lensOn) return;
      const cv = e.target.closest?.("canvas.pdf-page");
      if (!cv) { lensEl.hidden = true; return; }
      const n = +cv.dataset.page;
      const entry = hiCache.get(n);
      const hi = entry && entry.key === Math.round(zoom * 1000) ? entry.canvas : null;
      if (!hi) { buildHi(n); lensEl.hidden = true; return; }    // first pass over a page builds it

      const r = cv.getBoundingClientRect();
      const { w, h } = lensBox(cv);
      // `hi` is the page at LENS_ZOOM x the on-screen scale, so copying a w-by-h slab of it
      // 1:1 magnifies by exactly LENS_ZOOM. Derive from the real ratio to absorb rounding.
      const k = (hi.width / r.width) / LENS_ZOOM;
      const sw = w * k, sh = h * k;
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;

      const ctx = lensCv.getContext("2d");
      lensCv.width = w; lensCv.height = h;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(hi, fx * hi.width - sw / 2, fy * hi.height - sh / 2, sw, sh, 0, 0, w, h);

      // centred on the cursor, like a real magnifier, but kept inside the page area
      const hr = host.getBoundingClientRect(), pr = pages.getBoundingClientRect();
      lensEl.style.width = `${w}px`; lensEl.style.height = `${h}px`;
      lensEl.style.left = `${Math.min(Math.max(e.clientX - w / 2, pr.left + 4), pr.right - w - 4) - hr.left}px`;
      lensEl.style.top = `${Math.min(Math.max(e.clientY - h / 2, pr.top + 4), pr.bottom - h - 4) - hr.top}px`;
      lensEl.hidden = false;
    };

    const setLens = (on, { build = true } = {}) => {
      lensOn = on;
      try { localStorage.setItem("hh.lens", on ? "1" : "0"); } catch (_) { /* ignore */ }
      host.querySelector("[data-lens]")?.classList.toggle("on", on);
      host.classList.toggle("lensing", on);
      if (!on) { lensEl.hidden = true; hiCache.clear(); } else if (build) buildHi(page);
    };
    pages.addEventListener("mousemove", moveLens);
    pages.addEventListener("mouseleave", () => { lensEl.hidden = true; });

    /* ---- render every page, top to bottom, so the document simply scrolls ---- */
    const render = async () => {
      if (!doc || destroyed) return;
      if (rendering) await rendering;
      rendering = (async () => {
        const avail = pages.clientWidth - 24;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const first = await doc.getPage(1);
        const scale = fit ? avail / first.getViewport({ scale: 1 }).width : zoom;
        if (fit) zoom = scale;

        pages.innerHTML = "";                 // drop the status / previous canvases
        hiCache.clear();
        for (let n = 1; n <= doc.numPages; n++) {
          if (destroyed) return;
          const p = n === 1 ? first : await doc.getPage(n);
          const vp = p.getViewport({ scale });
          const wrap = document.createElement("div");
          wrap.className = "pdf-page-wrap";
          const c = document.createElement("canvas");
          c.className = "pdf-page";
          c.dataset.page = n;
          c.width = Math.floor(vp.width * dpr);
          c.height = Math.floor(vp.height * dpr);
          c.style.width = `${Math.floor(vp.width)}px`;
          c.style.height = `${Math.floor(vp.height)}px`;
          c.setAttribute("aria-label", `${title} page ${n}`);
          wrap.style.width = c.style.width;
          wrap.style.height = c.style.height;
          wrap.appendChild(c);
          const marks = document.createElement("div");
          marks.className = "pdf-marks";
          wrap.appendChild(marks);
          pages.appendChild(wrap);            // append first so page 1 shows while the rest draw
          const ctx = c.getContext("2d");
          ctx.scale(dpr, dpr);
          await p.render({ canvasContext: ctx, viewport: vp }).promise;
          pageInfo.set(n, { vp, items: (await p.getTextContent()).items });
          drawMarks(n);
        }
        host.classList.toggle("single-page", doc.numPages === 1);
        updatePageLabel();
        updateHits();
        if (lensOn) buildHi(page);
      })();
      await rendering;
      rendering = null;
    };

    /* ---- search marks: PDF.js gives each text run a transform, so a match can be boxed ---- */
    const drawMarks = (n) => {
      const wrap = pages.querySelector(`canvas.pdf-page[data-page="${n}"]`)?.parentElement;
      const marks = wrap?.querySelector(".pdf-marks");
      const info = pageInfo.get(n);
      if (!marks || !info) return;
      marks.innerHTML = "";
      const q = query.trim().toLowerCase();
      if (q.length < 2 || !pdfjs) return;
      let out = "";
      info.items.forEach((item) => {
        if (!item.str) return;
        const hay = item.str.toLowerCase();
        let i = hay.indexOf(q);
        if (i < 0) return;
        const tx = pdfjs.Util.transform(info.vp.transform, item.transform);
        const fh = Math.hypot(tx[2], tx[3]);
        const cw = (item.width * info.vp.scale) / item.str.length;   // even spacing is close enough
        while (i >= 0) {
          out += `<span style="left:${(tx[4] + cw * i).toFixed(1)}px;top:${(tx[5] - fh).toFixed(1)}px;` +
                 `width:${(cw * q.length).toFixed(1)}px;height:${fh.toFixed(1)}px"></span>`;
          i = hay.indexOf(q, i + q.length);
        }
      });
      marks.innerHTML = out;
    };

    const updateHits = () => {
      const btn = host.querySelector("[data-hits]");
      const n = pages.querySelectorAll(".pdf-marks span").length;
      btn.hidden = !query.trim() || query.trim().length < 2;
      btn.textContent = n ? `${n} hit${n === 1 ? "" : "s"}` : "no hits";
      btn.classList.toggle("none", !n);
      btn.title = n ? "Jump to the first match" : `“${query.trim()}” is not on this card`;
    };

    const jumpToHit = () => {
      const first = pages.querySelector(".pdf-marks span");
      if (!first) return;
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      first.classList.add("flash");
      setTimeout(() => first.classList.remove("flash"), 1200);
    };

    /* which page is under the middle of the viewport */
    const updatePageLabel = () => {
      if (!doc) return;
      const mid = window.innerHeight / 2;
      let best = 1, bestD = Infinity;
      pages.querySelectorAll("canvas.pdf-page").forEach((c) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < bestD) { bestD = d; best = +c.dataset.page; }
      });
      page = best;
      pg.textContent = `${page} / ${doc.numPages}`;
      nav.prev.disabled = page <= 1;
      nav.next.disabled = page >= doc.numPages;
    };

    const go = (d) => {
      if (!doc) return;
      const n = Math.min(Math.max(page + d, 1), doc.numPages);
      pages.querySelector(`canvas.pdf-page[data-page="${n}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    let scrollTimer = null;
    const onScroll = () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(updatePageLabel, 80); };
    window.addEventListener("scroll", onScroll, { passive: true });

    host.querySelector(".pdf-toolbar").addEventListener("click", (e) => {
      const z = e.target.closest("[data-zoom]"), n = e.target.closest("[data-nav]");
      if (e.target.closest("[data-lens]")) return setLens(!lensOn);
      if (e.target.closest("[data-hits]")) return jumpToHit();
      if (n) return go(n.dataset.nav === "next" ? 1 : -1);
      if (!z) return;
      if (z.dataset.zoom === "fit") fit = true;
      else { fit = false; zoom = z.dataset.zoom === "in" ? zoom * 1.2 : zoom / 1.2; }
      render();
    });

    let resizeTimer = null;
    const refit = () => { if (fit) { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); } };
    window.addEventListener("resize", refit);
    const onKey = (e) => {
      if (e.target.matches("input, select, textarea")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "l" && !e.metaKey && !e.ctrlKey) setLens(!lensOn);
    };
    window.addEventListener("keydown", onKey);

    lib().then((m) => { pdfjs = m; return m.getDocument({ url }).promise; }).then((d) => {
      if (destroyed) return;
      doc = d;
      setLens(lensOn, { build: false });          // render first; the lens copy follows
      return render();
    }).catch((err) => {
      pages.innerHTML = `<div class="pdf-status">Couldn't render inline (${HH.esc(err.message)}). <a href="${url}" target="_blank" rel="noopener">Open the PDF ↗</a></div>`;
    });

    return {
      refit,
      next: () => go(1), prev: () => go(-1),
      setHighlight(q) {
        query = q || "";
        pageInfo.forEach((_, n) => drawMarks(n));
        updateHits();
      },
      destroy() {
        destroyed = true;
        window.removeEventListener("resize", refit);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("scroll", onScroll);
        hiCache.clear();
        if (doc) doc.destroy();
      },
    };
  };
})();
