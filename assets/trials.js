/* Trials tab: searchable / filterable library across every disease. */
(function () {
  const HH = (window.HH = window.HH || {});
  const $ = (id) => document.getElementById(id);
  let pendingOpen = null; // trial id to expand after the next render (deep link)

  HH.initTrials = function () {
    const sel = $("tr-disease");
    const { groups, diseases, trials } = HH.data;
    const count = {};
    trials.forEach((t) => { count[t.disease] = (count[t.disease] || 0) + 1; });
    [...groups, { id: "unassigned", name: "Other" }].forEach((g) => {
      const list = diseases.filter((d) => (d.group || "unassigned") === g.id && count[d.slug]);
      if (!list.length) return;
      const og = document.createElement("optgroup");
      og.label = g.name;
      list.sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => {
        const o = document.createElement("option");
        o.value = d.slug; o.textContent = `${d.short || d.name} (${count[d.slug]})`;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    ["tr-q", "tr-disease", "tr-year", "tr-sort", "tr-unverified"].forEach((id) => $(id).addEventListener("input", HH.renderTrials));
  };

  HH.setTrialFilter = function ({ disease = "", q = "" } = {}) {
    $("tr-disease").value = disease;
    if (q !== undefined) $("tr-q").value = q;
  };

  HH.openTrial = function (id) { pendingOpen = id; };

  const hay = (t) => [t.name, t.descriptor, t.setting, t.population, t.arms, t.primary_endpoint, t.results, t.takeaway,
    (t.tags || []).join(" "), (t.highlights || []).join(" "), HH.disease(t.disease)?.name].join(" ").toLowerCase();

  HH.renderTrials = function () {
    const q = $("tr-q").value.trim().toLowerCase();
    const dz = $("tr-disease").value;
    const yr = parseInt($("tr-year").value || "0", 10);
    const sort = $("tr-sort").value;
    const unv = $("tr-unverified").checked;
    const terms = q.split(/\s+/).filter(Boolean);

    let list = HH.data.trials.filter((t) =>
      (!dz || t.disease === dz) && (!yr || t.year >= yr) && (!unv || !t.verified) &&
      (!terms.length || terms.every((w) => hay(t).includes(w))));

    const byName = (a, b) => a.name.localeCompare(b.name);
    if (sort === "year-desc") list.sort((a, b) => b.year - a.year || byName(a, b));
    else if (sort === "year-asc") list.sort((a, b) => a.year - b.year || byName(a, b));
    else if (sort === "name") list.sort(byName);
    else list.sort((a, b) => (HH.disease(a.disease)?.name || "").localeCompare(HH.disease(b.disease)?.name || "") || b.year - a.year);

    $("tr-count").textContent = `${list.length} of ${HH.data.trials.length} trials`;
    const host = $("tr-list");
    if (!list.length) { host.innerHTML = `<div class="empty">No trials match.</div>`; return; }

    if (sort === "disease" && !dz) {
      let cur = null, html = "";
      list.forEach((t) => {
        if (t.disease !== cur) { cur = t.disease; html += `<h3 class="trial-group-title">${HH.esc(HH.disease(cur)?.name || cur)}</h3>`; }
        html += HH.trialRow(t);
      });
      host.innerHTML = html;
    } else {
      host.innerHTML = list.map((t) => HH.trialRow(t, { disease: !dz })).join("");
    }

    if (pendingOpen) {
      const row = document.getElementById(`trial-${pendingOpen}`);
      pendingOpen = null;
      if (row) { row.classList.add("open"); setTimeout(() => row.scrollIntoView({ block: "center" }), 30); }
    }
  };
})();
