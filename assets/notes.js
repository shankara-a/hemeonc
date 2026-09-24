/* Renders an exported one-pager spec (data/specs/<slug>.json) as readable HTML.
   Same content as the PDF card — reflowed into one column, with anchors and a TOC.
   Block content is authored HTML from our own spec files, so it is injected as-is. */
(function () {
  const HH = (window.HH = window.HH || {});
  const cache = new Map();

  HH.loadSpec = async function (slug) {
    if (cache.has(slug)) return cache.get(slug);
    const p = fetch(`data/specs/${slug}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    cache.set(slug, p);
    return p;
  };

  const slugify = (s) => HH.plain(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

  const bullets = (b) => `<ul>${b.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

  const table = (b) => {
    const head = b.headers
      ? `<thead><tr>${b.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` : "";
    const rows = b.rows.map((r) => `<tr>${r.map((c, j) =>
      (j === 0 && b.bold_first !== false) ? `<td class="rx">${c}</td>` : `<td>${c}</td>`).join("")}</tr>`).join("");
    return `<div class="tbl-wrap"><table class="nt-table">${head}<tbody>${rows}</tbody></table></div>` +
      (b.footnote ? `<p class="nt-foot">${b.footnote}</p>` : "");
  };

  const pathway = (b) => `<div class="nt-pathway">${(b.chains || []).map((ch) => `
      <div class="nt-chain ${HH.esc(ch.color || "teal")}">
        <div class="nt-chain-head">${ch.header}</div>
        ${(ch.boxes || []).map(([title, lines]) => `
          <div class="nt-box">
            <div class="nt-box-title">${title}</div>
            ${(lines || []).length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
          </div>`).join("")}
      </div>`).join("")}</div>`;

  const BLOCK = { bullets, table, pathway, note: (b) => `<div class="nt-note">${b.html}</div>`, html: (b) => b.html };

  /** Render the spec into `host`; returns [{id, text}] for the TOC. */
  HH.renderNotes = function (host, spec) {
    const toc = [];
    const used = new Set();
    let html = "";

    (spec.pages || []).forEach((pg, pi) => {
      if (pi && pg.subtitle) html += `<div class="nt-pagebreak">${pg.subtitle}</div>`;
      (pg.columns || []).forEach((col) => {
        (col.blocks || []).forEach((b) => {
          const render = BLOCK[b.type];
          if (!render) return;
          let head = "";
          if (b.heading) {
            let id = slugify(b.heading) || `s${toc.length}`;
            while (used.has(id)) id += "-2";
            used.add(id);
            toc.push({ id, text: HH.plain(b.heading) });
            head = `<h3 class="nt-h" id="nt-${id}">${b.heading}</h3>`;
          }
          html += `<section class="nt-sec">${head}${render(b)}</section>`;
        });
      });
    });

    host.innerHTML = `
      <div class="nt-head">
        <h2>${spec.title || ""}</h2>
        ${spec.subtitle ? `<p class="nt-sub">${spec.subtitle}</p>` : ""}
        ${spec.source ? `<p class="nt-src">${spec.source}</p>` : ""}
      </div>
      <div class="nt-body">${html}</div>`;
    return toc;
  };
})();
