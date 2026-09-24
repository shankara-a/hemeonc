/* Minimal PDF.js viewer: one page at a time at fit-width (or zoom), with ◀ ▶ paging. */
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
   * host gets: .pdf-toolbar (paging, zoom, open/download) + .pdf-pages (one canvas)
   */
  HH.mountPdf = function (host, url, { title = "", meta = "" } = {}) {
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

    /* ---- magnifier: a second render of the page at LENS_ZOOM, sampled under the cursor ---- */
    const LENS_ZOOM = 2.6, LENS_COLS = 3;   // the cards are laid out in three columns
    const lensSize = () => {
      const cv = pages.querySelector("canvas");
      // roughly one column wide, so the lens frames a readable unit of the card
      return Math.max(180, Math.min(360, Math.round((cv ? cv.getBoundingClientRect().width : 780) / LENS_COLS)));
    };
    const lensEl = host.querySelector(".pdf-lens");
    const lensCv = lensEl.querySelector("canvas");
    let lensOn = false, hi = null, hiFor = "", hiBusy = false;
    try { lensOn = localStorage.getItem("hh.lens") === "1"; } catch (_) { /* ignore */ }

    const buildHi = async () => {
      if (!doc || !lensOn || hiBusy) return;
      const key = `${page}@${Math.round(zoom * 1000)}`;
      if (hiFor === key && hi) return;
      hiBusy = true;
      try {
        const pg = await doc.getPage(page);
        const vp = pg.getViewport({ scale: zoom * LENS_ZOOM });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        if (destroyed) return;
        hi = c; hiFor = key;
      } catch (_) { hi = null; } finally { hiBusy = false; }
    };

    const moveLens = (e) => {
      const cv = pages.querySelector("canvas");
      if (!lensOn || !cv || !hi) return;
      const r = cv.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) { lensEl.hidden = true; return; }

      const size = lensSize();
      // `hi` is the page at LENS_ZOOM x the on-screen scale, so copying a `size`-wide square
      // of it 1:1 magnifies by exactly LENS_ZOOM. Derive from the real ratio to absorb rounding.
      const src = size * (hi.width / r.width) / LENS_ZOOM;
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const sx = fx * hi.width - src / 2, sy = fy * hi.height - src / 2;

      const ctx = lensCv.getContext("2d");
      lensCv.width = size; lensCv.height = size;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(hi, sx, sy, src, src, 0, 0, size, size);

      // centred on the cursor, like a real magnifier held over the page
      const hr = host.getBoundingClientRect();
      lensEl.style.width = lensEl.style.height = `${size}px`;
      lensEl.style.left = `${e.clientX - hr.left - size / 2}px`;
      lensEl.style.top = `${e.clientY - hr.top - size / 2}px`;
      lensEl.hidden = false;
    };

    const setLens = (on) => {
      lensOn = on;
      try { localStorage.setItem("hh.lens", on ? "1" : "0"); } catch (_) { /* ignore */ }
      host.querySelector("[data-lens]")?.classList.toggle("on", on);
      host.classList.toggle("lensing", on);
      if (!on) { lensEl.hidden = true; hi = null; hiFor = ""; } else buildHi();
    };
    pages.addEventListener("mousemove", moveLens);
    pages.addEventListener("mouseleave", () => { lensEl.hidden = true; });

    const render = async () => {
      if (!doc || destroyed) return;
      if (rendering) await rendering;
      rendering = (async () => {
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const avail = pages.clientWidth - 24;
        const scale = fit ? avail / base.width : zoom;
        if (fit) zoom = scale;
        const vp = p.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width * dpr);
        c.height = Math.floor(vp.height * dpr);
        c.style.width = `${Math.floor(vp.width)}px`;
        c.style.height = `${Math.floor(vp.height)}px`;
        c.setAttribute("aria-label", `${title} page ${page}`);
        const ctx = c.getContext("2d");
        ctx.scale(dpr, dpr);
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        if (destroyed) return;
        pages.innerHTML = "";
        pages.appendChild(c);
        pg.textContent = `${page} / ${doc.numPages}`;
        nav.prev.disabled = page <= 1;
        nav.next.disabled = page >= doc.numPages;
        host.classList.toggle("single-page", doc.numPages === 1);
        hi = null; hiFor = "";
        if (lensOn) buildHi();
      })();
      await rendering;
      rendering = null;
    };
    const go = (d) => { if (!doc) return; const n = page + d; if (n < 1 || n > doc.numPages) return; page = n; render(); };

    host.querySelector(".pdf-toolbar").addEventListener("click", (e) => {
      const z = e.target.closest("[data-zoom]"), n = e.target.closest("[data-nav]");
      if (e.target.closest("[data-lens]")) return setLens(!lensOn);
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

    lib().then((pdfjs) => pdfjs.getDocument({ url }).promise).then((d) => {
      if (destroyed) return;
      doc = d;
      setLens(lensOn);
      return render();
    }).catch((err) => {
      pages.innerHTML = `<div class="pdf-status">Couldn't render inline (${HH.esc(err.message)}). <a href="${url}" target="_blank" rel="noopener">Open the PDF ↗</a></div>`;
    });

    return {
      refit,
      next: () => go(1), prev: () => go(-1),
      destroy() {
        destroyed = true;
        window.removeEventListener("resize", refit);
        window.removeEventListener("keydown", onKey);
        if (doc) doc.destroy();
      },
    };
  };
})();
