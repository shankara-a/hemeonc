/* Reviews tab: disease pill bar on top, full-width one-pager, trial strip / drawer on the right. */
(function () {
  const HH = (window.HH = window.HH || {});
  let viewer = null;
  let currentSlug = null;
  let drawerOpen = false, sortMode = "new";
  try {
    drawerOpen = localStorage.getItem("hh.drawer") === "1";
    sortMode = localStorage.getItem("hh.trialsort") || "new";
  } catch (_) { /* private mode */ }

  const SORTS = {
    new: (a, b) => b.year - a.year || a.name.localeCompare(b.name),
    old: (a, b) => a.year - b.year || a.name.localeCompare(b.name),
    az: (a, b) => a.name.localeCompare(b.name),
  };
  const trialsFor = (slug) => HH.data.trials.filter((t) => t.disease === slug).sort(SORTS[sortMode] || SORTS.new);

  HH.renderRail = function () {
    const rail = document.getElementById("dz-rail");
    const { groups, diseases, trials, onepagers } = HH.data;
    const opBy = Object.fromEntries(onepagers.map((o) => [o.disease, o]));
    const count = {};
    trials.forEach((t) => { count[t.disease] = (count[t.disease] || 0) + 1; });
    const order = [...groups.map((g) => g.id), "unassigned"];
    rail.innerHTML = order.map((gid) => {
      const list = diseases.filter((d) => (d.group || "unassigned") === gid)
        .sort((a, b) => (opBy[b.slug] ? 1 : 0) - (opBy[a.slug] ? 1 : 0) || a.name.localeCompare(b.name));
      if (!list.length) return "";
      const g = groups.find((x) => x.id === gid) || { name: "Other" };
      return `<div class="dz-group"><span class="dz-group-title">${HH.esc(g.name)}</span>` + list.map((d) => `
        <button class="dz-btn ${opBy[d.slug] ? "" : "nopdf"}" data-slug="${d.slug}" title="${HH.esc(d.name)}${opBy[d.slug] ? "" : " — no one-pager yet"}${count[d.slug] ? ` · ${count[d.slug]} trials` : ""}">
          ${HH.esc(d.short || d.name)}${count[d.slug] ? `<span class="dz-n">${count[d.slug]}</span>` : ""}
        </button>`).join("") + `</div>`;
    }).join("");
    rail.addEventListener("click", (e) => {
      const b = e.target.closest(".dz-btn");
      if (b) location.hash = `#reviews/${b.dataset.slug}`;
    });
  };

  const setDrawer = (open) => {
    drawerOpen = open;
    try { localStorage.setItem("hh.drawer", open ? "1" : "0"); } catch (_) { /* ignore */ }
    const body = document.querySelector("#rv-main .rv-body");
    if (!body) return;
    body.classList.toggle("drawer-open", open);
    const btn = body.querySelector(".drawer-toggle");
    if (btn) btn.textContent = open ? "Collapse ›" : "‹ Expand";
    viewer?.refit();
  };

  HH.showDisease = function (slug) {
    const main = document.getElementById("rv-main");
    const d = HH.disease(slug);
    document.querySelectorAll(".dz-btn").forEach((b) => b.classList.toggle("active", b.dataset.slug === slug));
    if (!d) { main.innerHTML = `<div class="empty">Pick a disease above.</div>`; return; }
    if (viewer) { viewer.destroy(); viewer = null; }
    currentSlug = slug;

    const op = HH.data.onepagers.find((o) => o.disease === slug);
    const trials = trialsFor(slug);
    const pdfUrl = op ? `pdfs/${encodeURIComponent(op.file)}` : null;
    const pills = trials.map((t) => `<button class="trial-pill trial-row" data-id="${HH.esc(t.id)}" title="${HH.esc(t.takeaway || "")}"><span class="tp-n">${HH.esc(t.name)}</span><span class="tp-y">${t.year}</span></button>`).join("");
    const sortBtns = [["new", "Newest"], ["old", "Oldest"], ["az", "A–Z"]].map(([k, l]) => `<button class="seg ${sortMode === k ? "active" : ""}" data-sort="${k}">${l}</button>`).join("");

    main.innerHTML = `
      <div class="rv-head">
        <div>
          <h2>${HH.esc(d.name)}</h2>
          <div class="rv-sub">${op ? `One-pager · ${op.pages} page${op.pages === 1 ? "" : "s"} · updated ${HH.fmtDate(op.updated)}` : "No one-pager yet"} · ${trials.length} trial${trials.length === 1 ? "" : "s"}</div>
        </div>
        <div class="rv-actions">
          ${op ? `<a class="btn primary" href="${pdfUrl}" target="_blank" rel="noopener">Open PDF ↗</a><a class="btn" href="${pdfUrl}" download>Download</a>` : ""}
          <a class="btn" href="#trials/${slug}">All ${HH.esc(d.short)} trials →</a>
        </div>
      </div>
      <div class="rv-body ${op ? "" : "no-pdf"} ${drawerOpen ? "drawer-open" : ""}">
        ${op ? `<div class="rv-pdf card" id="rv-pdf"></div>`
             : `<div class="card nopdf-note">No one-pager for ${HH.esc(d.name)} yet. Run the <code>cancer-one-pager</code> skill; the PDF lands here automatically on the next sync.</div>`}
        <aside class="rv-side" aria-label="Key trials">
          <div class="rv-side-head">
            <span class="rv-side-title">Key trials <span class="result-count">${trials.length}</span></span>
            <button class="btn small drawer-toggle" title="Toggle trial details (t)">${drawerOpen ? "Collapse ›" : "‹ Expand"}</button>
          </div>
          <div class="segmented tiny rv-sort" role="group" aria-label="Sort trials">${sortBtns}</div>
          <div class="rv-strip">${pills || `<div class="empty small">None filed yet</div>`}</div>
          <div class="rv-drawer"><div class="trial-list">${trials.map((t) => HH.trialRow(t)).join("")}</div></div>
          <div class="rv-side-hint">hover for the takeaway · click to open</div>
        </aside>
      </div>`;

    main.querySelector(".drawer-toggle").addEventListener("click", () => setDrawer(!drawerOpen));
    main.querySelector(".rv-sort").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sort]");
      if (!b || b.dataset.sort === sortMode) return;
      sortMode = b.dataset.sort;
      try { localStorage.setItem("hh.trialsort", sortMode); } catch (_) { /* ignore */ }
      const wasOpen = drawerOpen;
      HH.showDisease(slug);
      if (wasOpen !== drawerOpen) setDrawer(wasOpen);
    });
    main.querySelector(".rv-strip").addEventListener("click", (e) => {
      const pill = e.target.closest(".trial-pill");
      if (!pill) return;
      e.stopPropagation();
      if (!drawerOpen) setDrawer(true);
      HH.hidePop?.(0);
      const row = main.querySelector(`.rv-drawer #trial-${CSS.escape(pill.dataset.id)}`);
      if (row) {
        main.querySelectorAll(".rv-drawer .trial-row.open").forEach((r) => r !== row && r.classList.remove("open"));
        row.classList.add("open");
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, true);

    if (op) viewer = HH.mountPdf(document.getElementById("rv-pdf"), pdfUrl, { title: d.name });
  };

  window.addEventListener("keydown", (e) => {
    if (e.key !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.matches("input, select, textarea")) return;
    if (!document.getElementById("reviews").classList.contains("active")) return;
    setDrawer(!drawerOpen);
  });

  HH.currentDisease = () => currentSlug;
})();
