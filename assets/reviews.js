/* Reviews tab: disease tree on the left, one-pager in the middle (Card = PDF, Notes = HTML),
   trials or the section TOC on the right. Searching filters the tree by content, not just name. */
(function () {
  const HH = (window.HH = window.HH || {});
  let viewer = null;
  let currentSlug = null;
  let view = "card";              // "card" | "notes"
  let sortMode = "new";
  let query = "";
  let collapsed = new Set();
  try {
    collapsed = new Set(JSON.parse(localStorage.getItem("hh.collapsed") || "[]"));
  } catch (_) { /* ignore */ }
  try {
    sortMode = localStorage.getItem("hh.trialsort") || "new";
    view = localStorage.getItem("hh.rvview") || "card";
  } catch (_) { /* private mode */ }

  const SORTS = {
    new: (a, b) => b.year - a.year || a.name.localeCompare(b.name),
    old: (a, b) => a.year - b.year || a.name.localeCompare(b.name),
    az: (a, b) => a.name.localeCompare(b.name),
  };
  const trialsFor = (slug) => HH.data.trials.filter((t) => t.disease === slug).sort(SORTS[sortMode] || SORTS.new);
  const pdfBy = () => Object.fromEntries(HH.data.onepagers.map((o) => [o.disease, o]));
  const pill = (t) => `<button class="trial-pill trial-row" data-id="${HH.esc(t.id)}"><span class="tp-n">${HH.esc(t.name)}</span><span class="tp-y">${t.year}</span></button>`;

  /* ---------------- tree ---------------- */
  const docFor = (slug) => HH.data.searchDocs?.[slug];

  /** Diseases matching the query, with why they matched. */
  const matching = (q) => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = {};
    HH.data.diseases.forEach((d) => {
      if (!terms.length) { out[d.slug] = { hits: 0 }; return; }
      const name = [d.name, d.short, ...(d.aliases || [])].join(" ").toLowerCase();
      const doc = docFor(d.slug);
      const body = (doc?.text || "").toLowerCase();
      const trials = HH.data.trials.filter((t) => t.disease === d.slug)
        .map((t) => `${t.name} ${t.takeaway} ${(t.tags || []).join(" ")}`).join(" ").toLowerCase();
      if (!terms.every((w) => name.includes(w) || body.includes(w) || trials.includes(w))) return;
      const inBody = terms.some((w) => body.includes(w));
      out[d.slug] = {
        hits: terms.reduce((n, w) => n + (body.split(w).length - 1), 0),
        where: terms.every((w) => name.includes(w)) ? "name" : inBody ? "content" : "trials",
        sections: inBody ? (doc?.headings || []).filter((h) => terms.some((w) => h.toLowerCase().includes(w))) : [],
      };
    });
    return out;
  };

  HH.renderTree = function () {
    const host = document.getElementById("dz-tree");
    const { groups, diseases, trials } = HH.data;
    const op = pdfBy();
    const hits = matching(query);
    const count = {};
    trials.forEach((t) => { count[t.disease] = (count[t.disease] || 0) + 1; });

    const order = [...groups.map((g) => g.id), "unassigned"];
    let any = false;
    host.innerHTML = order.map((gid) => {
      const list = diseases.filter((d) => (d.group || "unassigned") === gid && hits[d.slug])
        .sort((a, b) => (op[b.slug] ? 1 : 0) - (op[a.slug] ? 1 : 0) || a.name.localeCompare(b.name));
      if (!list.length) return "";
      any = true;
      const g = groups.find((x) => x.id === gid) || { name: "Other" };
      // a group opens when it holds the current disease, or when a search matched inside it
      const open = !collapsed.has(gid) || query || list.some((d) => d.slug === currentSlug);
      return `<div class="tree-group ${open ? "open" : ""}">
        <button class="tree-group-head" data-group="${gid}" aria-expanded="${open ? "true" : "false"}">
          <span class="tg-caret" aria-hidden="true">\u203a</span>
          <span class="tg-name">${HH.esc(g.name)}</span>
          <span class="tree-n">${list.length}</span>
        </button>
        <div class="tree-items">${list.map((d) => {
          const h = hits[d.slug];
          const why = query && h.where === "content" ? `<span class="tree-why">${h.hits} in text</span>`
                    : query && h.where === "trials" ? `<span class="tree-why">in trials</span>` : "";
          return `<button class="tree-item ${d.slug === currentSlug ? "active" : ""} ${op[d.slug] ? "" : "nopdf"}"
              data-slug="${d.slug}" title="${HH.esc(d.name)}">
            <span class="ti-name">${HH.esc(d.short || d.name)}</span>
            ${why || `<span class="ti-n">${count[d.slug] || 0}</span>`}
          </button>`;
        }).join("")}</div>
      </div>`;
    }).join("");
    if (!any) host.innerHTML = `<div class="empty small">Nothing matches “${HH.esc(query)}”.</div>`;
  };

  HH.initTree = function () {
    document.getElementById("dz-tree").addEventListener("click", (e) => {
      const g = e.target.closest(".tree-group-head");
      if (g) {
        const id = g.dataset.group;
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
        try { localStorage.setItem("hh.collapsed", JSON.stringify([...collapsed])); } catch (_) { /* ignore */ }
        HH.renderTree();
        return;
      }
      const b = e.target.closest(".tree-item");
      if (b) location.hash = `#reviews/${b.dataset.slug}`;
    });
    const box = document.getElementById("rv-q");
    box.addEventListener("input", () => {
      query = box.value;
      HH.renderTree();
      document.getElementById("rv-clear").hidden = !query;
    });
    document.getElementById("rv-clear").addEventListener("click", () => {
      box.value = ""; query = ""; HH.renderTree();
      document.getElementById("rv-clear").hidden = true;
      box.focus();
    });
  };

  /* ---------------- the page ---------------- */
  const setView = (v) => {
    view = v;
    try { localStorage.setItem("hh.rvview", v); } catch (_) { /* ignore */ }
    if (currentSlug) HH.showDisease(currentSlug, { keepScroll: true });
  };

  HH.showDisease = async function (slug, { keepScroll = false } = {}) {
    const main = document.getElementById("rv-main");
    const d = HH.disease(slug);
    if (!d) { main.innerHTML = `<div class="empty">Pick a disease on the left.</div>`; return; }
    if (viewer) { viewer.destroy(); viewer = null; }
    currentSlug = slug;
    HH.renderTree();

    const op = HH.data.onepagers.find((o) => o.disease === slug);
    const trials = trialsFor(slug);
    const pdfUrl = op ? `pdfs/${encodeURIComponent(op.file)}` : null;
    const spec = op ? await HH.loadSpec(slug) : null;
    if (currentSlug !== slug) return;                   // a later click won the race
    const canNotes = !!spec;
    const showNotes = canNotes && view === "notes";

    const sortBtns = [["new", "Newest"], ["old", "Oldest"], ["az", "A–Z"]]
      .map(([k, l]) => `<button class="seg ${sortMode === k ? "active" : ""}" data-sort="${k}">${l}</button>`).join("");

    main.innerHTML = `
      <div class="rv-bar">
        <div class="segmented rv-view" role="group" aria-label="View">
          <button class="seg ${showNotes ? "" : "active"}" data-view="card">Card</button>
          <button class="seg ${showNotes ? "active" : ""}" data-view="notes" ${canNotes ? "" : "disabled title='No text version for this one-pager yet'"}>Notes</button>
        </div>
        <span class="rv-meta">${op ? `${op.pages} page${op.pages === 1 ? "" : "s"} · updated ${HH.fmtDate(op.updated)}` : "No one-pager yet"}</span>
        <span class="spacer"></span>
        ${op ? `<a class="btn small" href="${pdfUrl}" target="_blank" rel="noopener">Open PDF ↗</a><a class="btn small" href="${pdfUrl}" download>Download</a>` : ""}
      </div>
      <div class="rv-body">
        <div class="rv-doc">${op ? (showNotes ? `<div class="card nt-card" id="rv-notes"></div>` : `<div class="rv-pdf card" id="rv-pdf"></div>`)
          : `<div class="card nopdf-note"><b>${HH.esc(d.name)}</b> — no one-pager yet. Run the <code>cancer-one-pager</code> skill; it lands here on the next sync.</div>`}</div>
        <aside class="rv-rail" aria-label="${showNotes ? "Sections" : "Key trials"}">
          ${showNotes ? `<div class="rail-head"><span class="rail-title">In this note</span></div><nav class="nt-toc" id="nt-toc"></nav>
             <div class="rail-head trials-head"><span class="rail-title">Key trials <span class="result-count">${trials.length}</span></span></div>
             <div class="rv-strip">${trials.map(pill).join("") || `<div class="empty small">None filed</div>`}</div>`
            : `<div class="rail-head">
                 <span class="rail-title">Key trials <span class="result-count">${trials.length}</span></span>
                 <a class="rail-all" href="#trials/${slug}">all →</a>
               </div>
               <div class="segmented tiny rv-sort" role="group" aria-label="Sort trials">${sortBtns}</div>
               <div class="rv-strip">${trials.map(pill).join("") || `<div class="empty small">None filed yet</div>`}</div>`}
        </aside>
      </div>`;

    main.querySelector(".rv-view").addEventListener("click", (e) => {
      const b = e.target.closest("[data-view]");
      if (b && !b.disabled && b.dataset.view !== view) setView(b.dataset.view);
    });
    main.querySelector(".rv-sort")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-sort]");
      if (!b || b.dataset.sort === sortMode) return;
      sortMode = b.dataset.sort;
      try { localStorage.setItem("hh.trialsort", sortMode); } catch (_) { /* ignore */ }
      main.querySelector(".rv-strip").innerHTML = trialsFor(slug).map(pill).join("");
      main.querySelectorAll(".rv-sort .seg").forEach((x) => x.classList.toggle("active", x.dataset.sort === sortMode));
    });

    if (showNotes) {
      const toc = HH.renderNotes(document.getElementById("rv-notes"), spec);
      document.getElementById("nt-toc").innerHTML =
        toc.map((t) => `<a href="#nt-${t.id}" data-nt="${t.id}">${HH.esc(t.text)}</a>`).join("");
      document.getElementById("nt-toc").addEventListener("click", (e) => {
        const a = e.target.closest("[data-nt]");
        if (!a) return;
        e.preventDefault();
        document.getElementById(`nt-${a.dataset.nt}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else if (op) {
      viewer = HH.mountPdf(document.getElementById("rv-pdf"), pdfUrl, {
        title: d.name,
        meta: `${op.pages} page${op.pages === 1 ? "" : "s"}`,
      });
    }
    if (!keepScroll) window.scrollTo({ top: 0 });
  };

  HH.refitPdf = () => viewer?.refit();
  HH.currentDisease = () => currentSlug;
})();
