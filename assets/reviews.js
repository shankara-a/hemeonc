/* Reviews tab: disease rail on the left, trials + one-pager PDF on the right. */
(function () {
  const HH = (window.HH = window.HH || {});
  let viewer = null;
  let currentSlug = null;

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
      return `<div class="dz-group"><div class="dz-group-title">${HH.esc(g.name)}</div>` + list.map((d) => `
        <button class="dz-btn" data-slug="${d.slug}">
          <span class="dz-name">${HH.esc(d.short || d.name)}</span>
          <span class="dz-meta">${opBy[d.slug] ? `<span class="pdf" title="One-pager available">📄</span>` : ""}${count[d.slug] ? `<span title="${count[d.slug]} trials">🧪 ${count[d.slug]}</span>` : ""}</span>
        </button>`).join("") + `</div>`;
    }).join("");
    rail.addEventListener("click", (e) => {
      const b = e.target.closest(".dz-btn");
      if (b) location.hash = `#reviews/${b.dataset.slug}`;
    });
  };

  HH.showDisease = function (slug) {
    const main = document.getElementById("rv-main");
    const d = HH.disease(slug);
    document.querySelectorAll(".dz-btn").forEach((b) => b.classList.toggle("active", b.dataset.slug === slug));
    if (!d) { main.innerHTML = `<div class="empty">Pick a disease on the left.</div>`; return; }
    if (viewer) { viewer.destroy(); viewer = null; }
    currentSlug = slug;

    const op = HH.data.onepagers.find((o) => o.disease === slug);
    const trials = HH.data.trials.filter((t) => t.disease === slug).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
    const pdfUrl = op ? `pdfs/${encodeURIComponent(op.file)}` : null;

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
      <div class="rv-body ${op ? "" : "no-pdf"}">
        <div class="rv-trials">
          <div class="card">
            <div class="dash-head"><h3>Key trials</h3><span class="result-count">hover for takeaways · click to pin</span></div>
            <div class="trial-list">${trials.length ? trials.map((t) => HH.trialRow(t)).join("") : `<div class="empty">No trials filed yet — add them with the add-trial skill.</div>`}</div>
          </div>
        </div>
        ${op ? `<div class="rv-pdf card" style="padding:0" id="rv-pdf"></div>`
             : `<div class="card nopdf-note">No one-pager for ${HH.esc(d.name)} yet. Run the <code>cancer-one-pager</code> skill; the PDF lands here automatically on the next sync.</div>`}
      </div>`;

    if (op) viewer = HH.mountPdf(document.getElementById("rv-pdf"), pdfUrl, { title: d.name });
  };

  HH.currentDisease = () => currentSlug;
})();
