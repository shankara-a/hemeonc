/* Minimal PDF.js viewer: renders every page of a PDF into canvases, fit-to-width by default. */
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
   * Mount a viewer into `host`. Returns a handle with destroy().
   * host gets: .pdf-toolbar (zoom, page count, open/download) + .pdf-pages (canvases)
   */
  HH.mountPdf = function (host, url, { title = "" } = {}) {
    host.innerHTML = `
      <div class="pdf-toolbar">
        <button class="btn small" data-zoom="out" title="Zoom out">−</button>
        <button class="btn small" data-zoom="fit" title="Fit width">Fit</button>
        <button class="btn small" data-zoom="in" title="Zoom in">+</button>
        <span class="pg"></span>
        <span class="spacer"></span>
        <a class="btn small" href="${url}" target="_blank" rel="noopener">Open ↗</a>
        <a class="btn small" href="${url}" download>Download</a>
      </div>
      <div class="pdf-pages"><div class="pdf-status">Loading PDF…</div></div>`;
    const pages = host.querySelector(".pdf-pages");
    const pg = host.querySelector(".pg");
    let doc = null, zoom = 1, fit = true, destroyed = false, rendering = null;

    const render = async () => {
      if (!doc || destroyed) return;
      if (rendering) { await rendering; }
      rendering = (async () => {
        pages.innerHTML = "";
        const avail = pages.clientWidth - 24;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i++) {
          if (destroyed) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (fit ? avail / base.width : zoom) ;
          const vp = page.getViewport({ scale });
          const c = document.createElement("canvas");
          c.width = Math.floor(vp.width * dpr);
          c.height = Math.floor(vp.height * dpr);
          c.style.width = `${Math.floor(vp.width)}px`;
          c.style.height = `${Math.floor(vp.height)}px`;
          c.setAttribute("aria-label", `${title} page ${i}`);
          pages.appendChild(c);
          const ctx = c.getContext("2d");
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          if (fit) zoom = scale;
        }
      })();
      await rendering;
      rendering = null;
    };

    host.querySelector(".pdf-toolbar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-zoom]");
      if (!b) return;
      if (b.dataset.zoom === "fit") fit = true;
      else { fit = false; zoom = b.dataset.zoom === "in" ? zoom * 1.2 : zoom / 1.2; }
      render();
    });

    let resizeTimer = null;
    const onResize = () => { if (fit) { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); } };
    window.addEventListener("resize", onResize);

    lib().then((pdfjs) => pdfjs.getDocument({ url }).promise).then((d) => {
      if (destroyed) return;
      doc = d;
      pg.textContent = `${d.numPages} page${d.numPages === 1 ? "" : "s"}`;
      return render();
    }).catch((err) => {
      pages.innerHTML = `<div class="pdf-status">Couldn't render inline (${HH.esc(err.message)}). <a href="${url}" target="_blank" rel="noopener">Open the PDF ↗</a></div>`;
    });

    return { destroy() { destroyed = true; window.removeEventListener("resize", onResize); if (doc) doc.destroy(); } };
  };
})();
