/* Shared helpers + trial card markup. Everything hangs off window.HH. */
(function () {
  const HH = (window.HH = window.HH || {});
  HH.data = { diseases: [], groups: [], trials: [], onepagers: [], byDisease: {}, trialById: {} };

  HH.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  HH.fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  HH.disease = (slug) => HH.data.byDisease[slug];

  HH.pubmedUrl = (t) => t.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${t.pmid}/`
    : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(t.name.replace(/\s*\(.*?\)/, "") + " " + (t.disease ? (HH.disease(t.disease)?.short || "") : ""))}`;

  HH.chips = (t, { disease = false } = {}) => {
    const dz = HH.disease(t.disease);
    return [
      disease && dz ? `<span class="chip dz">${HH.esc(dz.short)}</span>` : "",
      `<span class="chip year">${t.year}</span>`,
      t.phase ? `<span class="chip phase">Ph ${HH.esc(t.phase)}</span>` : "",
      t.n ? `<span class="chip year">n=${t.n.toLocaleString()}</span>` : "",
    ].join("");
  };

  /* Full detail body — used inside the expanded row and the hover popover. */
  HH.trialBody = (t, { withTakeaway = true } = {}) => {
    const dl = [
      ["Population", t.population],
      ["Arms", t.arms],
      ["Primary endpoint", t.primary_endpoint],
      ["Key results", t.results],
      ["Toxicity", t.toxicity],
    ].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${HH.esc(v)}</dd>`).join("");
    const hl = (t.highlights || []).length
      ? `<ul class="thl">${t.highlights.map((h) => `<li>${HH.esc(h)}</li>`).join("")}</ul>` : "";
    const ref = `<div class="tref"><span>${HH.esc(t.reference || "")}</span>` +
      `<a href="${HH.pubmedUrl(t)}" target="_blank" rel="noopener">PubMed ↗</a>` +
      (t.nct ? `<a href="https://clinicaltrials.gov/study/${HH.esc(t.nct)}" target="_blank" rel="noopener">${HH.esc(t.nct)} ↗</a>` : "") +
      `</div>`;
    const flags = `<div class="tflags">updated ${HH.fmtDate(t.updated)}</div>`;
    return `<div class="tcard">${withTakeaway && t.takeaway ? `<div class="tp-take">${HH.esc(t.takeaway)}</div>` : ""}<dl>${dl}</dl>${hl}${ref}${flags}</div>`;
  };

  /* Compact row used in both the Reviews side list and the Trials tab. */
  HH.trialRow = (t, { disease = false } = {}) => `
    <div class="trial-row" data-id="${HH.esc(t.id)}" id="trial-${HH.esc(t.id)}">
      <div class="tr-line"><span class="tr-name">${HH.esc(t.name)}</span>${HH.chips(t, { disease })}</div>
      <div class="tr-desc">${HH.esc(t.descriptor || "")}${t.setting ? ` · <em>${HH.esc(t.setting)}</em>` : ""}</div>
      ${t.takeaway ? `<div class="tr-take">${HH.esc(t.takeaway)}</div>` : ""}
      <div class="tr-more">${HH.trialBody(t, { withTakeaway: false })}</div>
    </div>`;

  /* ---------- hover popover ---------- */
  const pop = () => document.getElementById("trial-pop");
  let hideTimer = null, current = null;
  const canHover = () => window.matchMedia("(hover: hover) and (min-width: 601px)").matches;

  HH.showPop = (row) => {
    if (!canHover()) return;
    const t = HH.data.trialById[row.dataset.id];
    if (!t || row.classList.contains("open")) return;
    clearTimeout(hideTimer);
    const el = pop();
    if (current !== row) {
      current = row;
      const dz = HH.disease(t.disease);
      el.innerHTML = `
        <div class="tp-head"><span class="tp-name">${HH.esc(t.name)}</span>${HH.chips(t, { disease: true })}</div>
        <div class="tp-desc">${HH.esc(t.descriptor || "")}${t.setting ? ` · ${HH.esc(t.setting)}` : ""}</div>
        ${HH.trialBody(t)}
        <div class="tp-hint">Click the trial to pin these details · ${dz ? `<a href="#reviews/${dz.slug}">${HH.esc(dz.short)} review →</a>` : ""}</div>`;
    }
    el.hidden = false;
    // place to the right of the row if there's room, else below it
    const r = row.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const sx = window.scrollX, sy = window.scrollY;
    let left, top;
    if (r.right + 12 + w < window.innerWidth) { left = r.right + 12; top = r.top; }
    else if (r.left - 12 - w > 0) { left = r.left - 12 - w; top = r.top; }
    else { left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16)); top = r.bottom + 8; }
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    el.style.left = `${left + sx}px`;
    el.style.top = `${top + sy}px`;
    row.classList.add("hovered");
  };
  HH.hidePop = (delay = 120) => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      pop().hidden = true;
      document.querySelectorAll(".trial-row.hovered").forEach((r) => r.classList.remove("hovered"));
      current = null;
    }, delay);
  };

  document.addEventListener("mouseover", (e) => {
    const row = e.target.closest(".trial-row");
    if (row && !e.target.closest(".tr-more")) HH.showPop(row);
    else if (e.target.closest("#trial-pop")) clearTimeout(hideTimer);
  });
  document.addEventListener("mouseout", (e) => {
    const to = e.relatedTarget;
    if (to && (to.closest?.("#trial-pop") || to.closest?.(".trial-row") === current)) return;
    if (e.target.closest(".trial-row") || e.target.closest("#trial-pop")) HH.hidePop();
  });
  document.addEventListener("click", (e) => {
    const row = e.target.closest(".trial-row");
    if (!row) return;
    if (e.target.closest("a") || e.target.closest(".tr-more")) return; // let links & selection work
    row.classList.toggle("open");
    if (row.classList.contains("open")) HH.hidePop(0);
  });
  window.addEventListener("scroll", () => { if (current) HH.hidePop(0); }, { passive: true });
})();
