/* Orchestrator: load data, hash routing, tabs, home dashboard. */
(function () {
  const HH = (window.HH = window.HH || {});
  const $ = (id) => document.getElementById(id);

  const showTab = (name) => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
    HH.hidePop?.(0);
  };

  /* Routes: #home · #reviews · #reviews/<slug> · #trials · #trials/<slug> · #trial/<id> */
  const route = () => {
    const h = location.hash.replace(/^#/, "");
    const [head, arg] = h.split("/");
    if (head === "reviews") {
      showTab("reviews");
      const slug = arg || HH.currentDisease?.() || HH.data.onepagers[0]?.disease || HH.data.diseases[0]?.slug;
      if (slug && (slug !== HH.currentDisease?.() || !$("rv-main").querySelector(".rv-head"))) {
        HH.showDisease(slug);
        window.scrollTo({ top: 0 });
      }
    } else if (head === "trials") {
      showTab("trials");
      if (arg !== undefined) HH.setTrialFilter({ disease: arg || "" });
      HH.renderTrials();
    } else if (head === "trial" && arg) {
      const t = HH.data.trialById[arg];
      showTab("trials");
      HH.setTrialFilter({ disease: t ? t.disease : "", q: "" });
      HH.openTrial(arg);
      HH.renderTrials();
    } else {
      showTab("home");
    }
  };

  const renderHome = () => {
    const { trials, onepagers, diseases } = HH.data;
    const latestTrial = trials.map((t) => t.updated).sort().pop();
    const latestPdf = onepagers.map((o) => o.updated).sort().pop();
    $("home-stats").innerHTML = [
      [onepagers.length, "one-pagers"],
      [trials.length, "landmark trials"],
      [new Set(trials.map((t) => t.disease)).size, "diseases with trials"],
      [trials.filter((t) => t.year >= new Date().getFullYear() - 1).length, "trials from the last 2 years"],
    ].map(([n, l]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join("");

    const recent = [
      ...onepagers.map((o) => ({ when: o.updated, html: `<a href="#reviews/${o.disease}">📄 ${HH.esc(o.title)}</a> one-pager` })),
      ...trials.map((t) => ({ when: t.updated, html: `<a href="#trial/${t.id}">🧪 ${HH.esc(t.name)}</a> <span class="result-count">${HH.esc(HH.disease(t.disease)?.short || "")} · ${t.year}</span>` })),
    ].sort((a, b) => (b.when || "").localeCompare(a.when || "")).slice(0, 8);
    $("home-recent").innerHTML = recent.map((r) => `<div class="recent-row"><span class="recent-when">${HH.fmtDate(r.when)}</span><span>${r.html}</span></div>`).join("");
    $("foot-updated").textContent = `data updated ${HH.fmtDate([latestTrial, latestPdf].filter(Boolean).sort().pop())}`;
  };

  const load = async () => {
    const [dz, tr, op] = await Promise.all(["data/diseases.json", "data/trials.json", "data/onepagers.json"]
      .map((u) => fetch(u + "?v=" + Date.now().toString(36).slice(0, 6)).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); })));
    HH.data.groups = dz.groups;
    HH.data.diseases = dz.diseases;
    HH.data.byDisease = Object.fromEntries(dz.diseases.map((d) => [d.slug, d]));
    HH.data.trials = tr.trials;
    HH.data.trialById = Object.fromEntries(tr.trials.map((t) => [t.id, t]));
    HH.data.onepagers = op.onepagers;
  };

  document.addEventListener("DOMContentLoaded", async () => {
    document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { location.hash = "#" + b.dataset.tab; }));
    try {
      await load();
    } catch (err) {
      document.querySelector("main").innerHTML = `<div class="card empty">Couldn't load data (${HH.esc(err.message)}). If you opened this file directly, serve it over HTTP: <code>python3 -m http.server</code></div>`;
      return;
    }
    renderHome();
    HH.renderRail();
    HH.initTrials();
    window.addEventListener("hashchange", route);
    route();
  });
})();
