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
  HH.mountPdf = function (host, url, { title = "" } = {}) {
    host.innerHTML = `
      <div class="pdf-toolbar">
        <button class="btn small" data-nav="prev" title="Previous page (←)">◀</button>
        <span class="pg">…</span>
        <button class="btn small" data-nav="next" title="Next page (→)">▶</button>
        <span class="sep"></span>
        <button class="btn small" data-zoom="out" title="Zoom out">−</button>
        <button class="btn small" data-zoom="fit" title="Fit width">Fit</button>
        <button class="btn small" data-zoom="in" title="Zoom in">+</button>
        <span class="spacer"></span>
        <a class="btn small" href="${url}" target="_blank" rel="noopener">Open ↗</a>
        <a class="btn small" href="${url}" download>Download</a>
      </div>
      <div class="pdf-pages"><div class="pdf-status">Loading PDF…</div></div>`;
    const pages = host.querySelector(".pdf-pages");
    const pg = host.querySelector(".pg");
    const nav = { prev: host.querySelector('[data-nav="prev"]'), next: host.querySelector('[data-nav="next"]') };
    let doc = null, zoom = 1, fit = true, page = 1, destroyed = false, rendering = null;

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
      })();
      await rendering;
      rendering = null;
    };
    const go = (d) => { if (!doc) return; const n = page + d; if (n < 1 || n > doc.numPages) return; page = n; render(); };

    host.querySelector(".pdf-toolbar").addEventListener("click", (e) => {
      const z = e.target.closest("[data-zoom]"), n = e.target.closest("[data-nav]");
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
    };
    window.addEventListener("keydown", onKey);

    lib().then((pdfjs) => pdfjs.getDocument({ url }).promise).then((d) => {
      if (destroyed) return;
      doc = d;
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
