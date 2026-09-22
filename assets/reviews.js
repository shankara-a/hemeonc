/* Reviews tab: disease switcher in the top bar, full-width one-pager, trial list + summary on the right. */
(function () {
  const HH = (window.HH = window.HH || {});
  let viewer = null;
  let currentSlug = null;
  let sortMode = "new";
  try { sortMode = localStorage.getItem("hh.trialsort") || "new"; } catch (_) { /* private mode */ }

  const SORTS = {
    new: (a, b) => b.year - a.year || a.name.localeCompare(b.name),
    old: (a, b) => a.year - b.year || a.name.localeCompare(b.name),
    az: (a, b) => a.name.localeCompare(b.name),
  };
  const trialsFor = (slug) => HH.data.trials.filter((t) => t.disease === slug).sort(SORTS[sortMode] || SORTS.new);
  const counts = () => {
    const c = {};
    HH.data.trials.forEach((t) => { c[t.disease] = (c[t.disease] || 0) + 1; });
    return c;
  };
  const pdfBy = () => Object.fromEntries(HH.data.onepagers.map((o) => [o.disease, o]));
  const pill = (t) => `<button class="trial-pill trial-row" data-id="${HH.esc(t.id)}"><span class="tp-n">${HH.esc(t.name)}</span><span class="tp-y">${t.year}</span></button>`;

  /* ---------------- switcher + palette ---------------- */
  const $sw = () => document.getElementById("dz-switch");
  const $pal = () => document.getElementById("dz-palette");
  const $q = () => document.getElementById("dz-q");
  const $res = () => document.getElementById("dz-results");
  let cursor = 0, matches = [];

  const rowsFor = (q) => {
    const { groups, diseases } = HH.data;
    const c = counts(), op = pdfBy();
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (d) => !terms.length || terms.every((w) =>
      [d.name, d.short, ...(d.aliases || [])].join(" ").toLowerCase().includes(w));
    const order = [...groups.map((g) => g.id), "unassigned"];
    const out = [];
    order.forEach((gid) => {
      const list = diseases.filter((d) => (d.group || "unassigned") === gid && hit(d))
        .sort((a, b) => (op[b.slug] ? 1 : 0) - (op[a.slug] ? 1 : 0) || a.name.localeCompare(b.name));
      if (!list.length) return;
      out.push({ group: (groups.find((x) => x.id === gid) || { name: "Other" }).name });
      list.forEach((d) => out.push({ d, n: c[d.slug] || 0, pdf: !!op[d.slug] }));
    });
    return out;
  };

  const drawPalette = () => {
    const rows = rowsFor($q().value);
    matches = rows.filter((r) => r.d);
    if (cursor >= matches.length) cursor = Math.max(0, matches.length - 1);
    if (!matches.length) { $res().innerHTML = `<div class="palette-empty">No disease matches.</div>`; return; }
    let i = -1;
    $res().innerHTML = rows.map((r) => {
      if (r.group) return `<div class="palette-group">${HH.esc(r.group)}</div>`;
      i++;
      return `<button class="palette-item ${i === cursor ? "cursor" : ""}" role="option" data-slug="${r.d.slug}" aria-selected="${r.d.slug === currentSlug}">
        <span class="pi-name">${HH.esc(r.d.name)}</span>
        <span class="pi-meta">${r.pdf ? "📄 " : ""}${r.n ? `${r.n} trials` : "no trials"}</span>
      </button>`;
    }).join("");
    $res().querySelector(".cursor")?.scrollIntoView({ block: "nearest" });
  };

  const openPalette = () => {
    $pal().hidden = false;
    $sw().setAttribute("aria-expanded", "true");
    $q().value = "";
    cursor = 0;
    drawPalette();
    const at = matches.findIndex((m) => m.d.slug === currentSlug);
    if (at > 0) { cursor = at; drawPalette(); }
    $q().focus();
  };
  const closePalette = () => {
    $pal().hidden = true;
    $sw().setAttribute("aria-expanded", "false");
  };
  const choose = (slug) => { closePalette(); location.hash = `#reviews/${slug}`; };

  HH.initSwitcher = function () {
    $sw().addEventListener("click", () => ($pal().hidden ? openPalette() : closePalette()));
    $q().addEventListener("input", () => { cursor = 0; drawPalette(); });
    $q().addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { cursor = Math.min(cursor + 1, matches.length - 1); drawPalette(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { cursor = Math.max(cursor - 1, 0); drawPalette(); e.preventDefault(); }
      else if (e.key === "Enter") { if (matches[cursor]) choose(matches[cursor].d.slug); e.preventDefault(); }
      else if (e.key === "Escape") closePalette();
    });
    $res().addEventListener("click", (e) => {
      const b = e.target.closest(".palette-item");
      if (b) choose(b.dataset.slug);
    });
    $pal().addEventListener("click", (e) => { if (e.target === $pal()) closePalette(); });

    window.addEventListener("keydown", (e) => {
      const typing = e.target.matches("input, select, textarea");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        if (!document.getElementById("reviews").classList.contains("active")) return;
        e.preventDefault();
        $pal().hidden ? openPalette() : closePalette();
      }
    });
  };

  HH.setSwitcherLabel = (d, op, n) => {
    const sw = $sw();
    sw.querySelector(".dz-switch-name").textContent = d ? (d.short || d.name) : "Pick a disease";
    sw.querySelector(".dz-switch-meta").textContent = d ? `${op ? "📄 " : ""}${n} trial${n === 1 ? "" : "s"}` : "";
  };

  /* ---------------- the page ---------------- */
  HH.showDisease = function (slug) {
    const main = document.getElementById("rv-main");
    const d = HH.disease(slug);
    if (!d) { main.innerHTML = `<div class="empty">Pick a disease from the switcher above (or press <kbd>/</kbd>).</div>`; return; }
    if (viewer) { viewer.destroy(); viewer = null; }
    currentSlug = slug;

    const op = HH.data.onepagers.find((o) => o.disease === slug);
    const trials = trialsFor(slug);
    const pdfUrl = op ? `pdfs/${encodeURIComponent(op.file)}` : null;
    HH.setSwitcherLabel(d, op, trials.length);

    const sortBtns = [["new", "Newest"], ["old", "Oldest"], ["az", "A–Z"]]
      .map(([k, l]) => `<button class="seg ${sortMode === k ? "active" : ""}" data-sort="${k}">${l}</button>`).join("");

    main.innerHTML = `
      <div class="rv-body ${op ? "" : "no-pdf"}">
        ${op ? `<div class="rv-pdf card" id="rv-pdf"></div>`
             : `<div class="card nopdf-note"><b>${HH.esc(d.name)}</b> — no one-pager yet. Run the <code>cancer-one-pager</code> skill; the PDF lands here automatically on the next sync.</div>`}
        <aside class="rv-side" aria-label="Key trials">
          <div class="rv-side-head">
            <span class="rv-side-title">Key trials <span class="result-count">${trials.length}</span> · <a href="#trials/${slug}">all →</a></span>
            <div class="segmented tiny rv-sort" role="group" aria-label="Sort trials">${sortBtns}</div>
          </div>
          <div class="rv-strip">${trials.map(pill).join("") || `<div class="empty small">None filed yet</div>`}</div>
        </aside>
        <aside class="rv-detail card" aria-live="polite"><div class="empty small">Hover a trial for its takeaway · click to pin</div></aside>
      </div>`;

    main.querySelector(".rv-sort").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sort]");
      if (!b || b.dataset.sort === sortMode) return;
      sortMode = b.dataset.sort;
      try { localStorage.setItem("hh.trialsort", sortMode); } catch (_) { /* ignore */ }
      const strip = main.querySelector(".rv-strip");
      strip.innerHTML = trialsFor(slug).map(pill).join("");
      const pinnedId = main.querySelector(".rv-detail").dataset.pinned;
      if (pinnedId) strip.querySelector(`[data-id="${CSS.escape(pinnedId)}"]`)?.classList.add("selected");
      main.querySelectorAll(".rv-sort .seg").forEach((x) => x.classList.toggle("active", x.dataset.sort === sortMode));
    });

    if (op) {
      viewer = HH.mountPdf(document.getElementById("rv-pdf"), pdfUrl, {
        title: d.name,
        meta: `${op.pages} page${op.pages === 1 ? "" : "s"} · updated ${HH.fmtDate(op.updated)}`,
      });
    }
  };

  HH.currentDisease = () => currentSlug;
})();
