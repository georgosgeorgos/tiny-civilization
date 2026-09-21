import { BasinEngine } from "./engine.ts";
import { BasinView, type MapLayer } from "./view.ts";
import type { BasinHistory, BasinIntervention, BasinState, Good } from "./types.ts";
import "./style.css";

const seasons = ["Spring", "Summer", "Autumn", "Winter"];
const goods: Good[] = ["food", "timber", "tools"];
const MAX_COUNTERFACTUAL_SEASONS = 1_600;
const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const number = (value: number): string => Math.round(value).toLocaleString();
const date = (season: number): string => `Year ${Math.floor(season / 4) + 1} · ${seasons[season % 4]}`;
type TrendMetric = "food" | "population" | "wellbeing" | "trade" | "migration" | "foodPrice" | "forest";
const trendMetrics: Record<TrendMetric, { label: string; value: (history: BasinHistory) => number | undefined; format: (value: number) => string; fixedDomain?: [number, number]; zeroBased?: boolean }> = {
  food: { label: "Food reserves", value: (history) => history.food, format: number, zeroBased: true },
  population: { label: "Population", value: (history) => history.population, format: number },
  wellbeing: { label: "Wellbeing", value: (history) => history.wellbeing, format: (value) => `${Math.round(value * 100)}%`, fixedDomain: [0, 1] },
  trade: { label: "Goods traded", value: (history) => history.trade, format: number, zeroBased: true },
  migration: { label: "Households moved", value: (history) => history.migration, format: number, zeroBased: true },
  foodPrice: { label: "Average food price", value: (history) => history.foodPrice, format: (value) => `${value.toFixed(2)} coin`, zeroBased: true },
  forest: { label: "Forest cover", value: (history) => history.forest, format: (value) => `${Math.round(value * 100)}%`, fixedDomain: [0, 1] },
};

export class BasinApp {
  private engine: BasinEngine;
  private view: BasinView | null = null;
  private selected = "";
  private playing = true;
  private pace = 1;
  private accumulator = 0;
  private lastTime = 0;
  private readonly root: HTMLElement;
  private frame = 0;
  private trendMetric: TrendMetric = "food";
  private baseline: { season: number; population: number; food: number; trade: number; wellbeing: number } | null = null;

  constructor(root: HTMLElement, seed: number) {
    this.root = root;
    this.engine = new BasinEngine(seed);
    this.selected = this.engine.state.settlements[0].id;
    this.mount();
    this.bind();
    this.createView();
    this.refresh();
    this.frame = requestAnimationFrame(this.loop);
    window.addEventListener("pagehide", () => { cancelAnimationFrame(this.frame); this.view?.dispose(); });
    document.addEventListener("visibilitychange", () => { this.lastTime = 0; this.accumulator = 0; });
  }

  private mount(): void {
    this.root.innerHTML = `
      <header class="basin-header">
        <a class="basin-brand" href="./"><span class="brand-mark" aria-hidden="true">≋</span><span>Tiny Civilization<small>A river basin observatory</small></span></a>
        <div class="basin-date"><strong id="basin-date"></strong><span id="basin-weather"></span></div>
        <div class="header-actions"><button id="save-basin">Save</button><button id="load-basin">Load</button><button id="new-basin">New basin</button><input id="basin-file" type="file" accept="application/json,.json" hidden /></div>
      </header>
      <main class="basin-workspace">
        <section class="basin-map" aria-label="River basin map">
          <canvas id="basin-canvas" aria-label="Three settlements in a river basin. Drag to orbit, scroll to zoom, or select a settlement using the cards."></canvas>
          <div class="map-heading"><span class="eyebrow">One landscape. Three communities.</span><h1>Lives along the river</h1><p>Land supports livelihoods. Trade connects their futures.</p></div>
          <div class="map-tools"><label>Map <select id="map-layer"><option value="landscape">Landscape</option><option value="fertility">Soil fertility</option><option value="forest">Forest cover</option></select></label><button id="basin-recenter">View basin</button></div>
          <div id="map-error" class="map-error" hidden></div>
          <div class="map-legend"><span><i class="legend-river"></i>River</span><span><i class="legend-route"></i>Trade route</span><span><i class="legend-cargo"></i>Goods in transit</span></div>
          <div class="settlement-cards" id="settlement-cards" aria-label="Choose a settlement"></div>
        </section>
        <aside class="basin-inspector" aria-label="Settlement details">
          <div class="inspector-heading"><span class="eyebrow">Settlement ledger</span><h2 id="settlement-name"></h2><p id="settlement-description"></p></div>
          <div class="settlement-totals" id="settlement-totals"></div>
          <div class="ledger" id="basin-ledger"></div>
          <section class="livelihoods"><h3>How people make a living</h3><div id="basin-livelihoods"></div></section>
          <section class="public-works"><div class="section-line"><h3>Council & public works</h3><span id="basin-treasury"></span></div><p id="bridge-status"></p><button id="fund-bridge">Commission a bridge</button><label class="tax-control">Sales tax <select id="basin-tax"><option value="0">0%</option><option value="0.05">5%</option><option value="0.1">10%</option><option value="0.2">20%</option></select></label><p class="quiet">Taxes fund construction. Bridges shorten journeys and increase carrying capacity.</p></section>
          <section class="basin-routes"><h3>Connections</h3><div id="basin-routes"></div></section>
        </aside>
      </main>
      <section class="basin-bottom">
        <div class="timeline"><button id="basin-play" class="primary">Pause</button><button id="advance-year">+1 year</button><button id="advance-decade">+10 years</button><label>Pace <select id="basin-pace"><option value="1">1 season / sec</option><option value="4">1 year / sec</option><option value="12">3 years / sec</option></select></label><span class="timeline-note">Every season is simulated.</span></div>
        <div class="experiment-controls"><span class="eyebrow">Change one condition</span><button id="basin-drought">Two-year drought</button><button id="basin-compare">Compare with no changes</button><p id="basin-comparison">Compare this history with the same seed and no interventions.</p></div>
        <div class="history-grid"><section class="chronicle"><div class="section-line"><h3>What changed, and why</h3><span id="basin-seed"></span></div><ol id="basin-events"></ol></section><section class="basin-trends"><div class="section-line trend-heading"><h3>Basin history</h3><label>Measure <select id="basin-trend-metric"><option value="food">Food reserves</option><option value="population">Population</option><option value="wellbeing">Wellbeing</option><option value="trade">Goods traded</option><option value="migration">Households moved</option><option value="foodPrice">Average food price</option><option value="forest">Forest cover</option></select></label></div><div id="basin-trend" aria-live="polite"></div><p class="quiet">Follow material, social, and ecological change across the same seasonal timeline.</p></section></div>
        <p id="basin-notice" role="status" aria-live="polite"></p>
        <footer class="basin-footer">An experimental model of land, livelihoods, and exchange.<a href="?mode=legacy">Open the earlier sandbox</a></footer>
      </section>`;
  }

  private el<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }

  private bind(): void {
    this.el("#basin-play").addEventListener("click", () => { this.playing = !this.playing; this.accumulator = 0; this.refresh(); });
    this.el("#advance-year").addEventListener("click", () => this.advance(4));
    this.el("#advance-decade").addEventListener("click", () => this.advance(40));
    this.el<HTMLSelectElement>("#basin-pace").addEventListener("change", (event) => { this.pace = Number((event.target as HTMLSelectElement).value); });
    this.el<HTMLSelectElement>("#basin-trend-metric").addEventListener("change", (event) => {
      this.trendMetric = (event.target as HTMLSelectElement).value as TrendMetric;
      this.drawTrend(this.engine.state);
    });
    this.el<HTMLSelectElement>("#map-layer").addEventListener("change", (event) => this.view?.setLayer((event.target as HTMLSelectElement).value as MapLayer));
    this.el("#basin-recenter").addEventListener("click", () => this.view?.focus());
    this.el("#settlement-cards").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-settlement]");
      if (button?.dataset.settlement) { this.selected = button.dataset.settlement; this.refresh(); this.view?.focus(this.selected); }
    });
    this.el("#basin-drought").addEventListener("click", () => this.intervene({ type: "drought", duration: 8 }));
    this.el("#fund-bridge").addEventListener("click", () => this.intervene({ type: "bridge", settlementId: this.selected }));
    this.el<HTMLSelectElement>("#basin-tax").addEventListener("change", (event) => this.intervene({ type: "tax", settlementId: this.selected, rate: Number((event.target as HTMLSelectElement).value) }));
    this.el("#basin-compare").addEventListener("click", () => this.compare());
    this.el("#new-basin").addEventListener("click", () => {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const url = new URL(location.href); url.search = new URLSearchParams({ seed: String(seed) }).toString();
      location.href = url.href;
    });
    this.el("#save-basin").addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([this.engine.export()], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `basin-${this.engine.state.seed}-season-${this.engine.state.season}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.notice("Saved the whole basin, including households, cargo, public works, and history.");
    });
    this.el("#load-basin").addEventListener("click", () => this.el<HTMLInputElement>("#basin-file").click());
    this.el<HTMLInputElement>("#basin-file").addEventListener("change", async (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 10_000_000) throw new Error("Choose a basin save smaller than 10 MB.");
        const engine = BasinEngine.restore(await file.text());
        this.engine = engine; this.selected = engine.state.settlements[0].id; this.playing = false; this.accumulator = 0; this.baseline = null;
        const url = new URL(location.href); url.searchParams.set("seed", String(engine.state.seed)); history.replaceState(null, "", url);
        this.createView(); this.refresh(); this.notice("Basin restored and paused. Press Play to continue.");
      } catch (error) { this.notice(error instanceof Error ? error.message : "This file could not be loaded."); }
      input.value = "";
    });
  }

  private createView(): void {
    this.view?.dispose(); this.view = null;
    this.el("#map-error").hidden = true;
    try {
      this.view = new BasinView(this.el<HTMLCanvasElement>("#basin-canvas"), this.engine.state.world, (id) => { this.selected = id; this.refresh(); });
      this.view.setLayer(this.el<HTMLSelectElement>("#map-layer").value as MapLayer);
    } catch {
      const error = this.el("#map-error"); error.hidden = false;
      error.textContent = "The 3D view needs WebGL 2. You can still observe the simulation through the settlement ledgers and history below.";
    }
  }

  private advance(seasonsToRun: number): void { this.playing = false; this.accumulator = 0; this.engine.advance(seasonsToRun); this.baseline = null; this.refresh(); }

  private intervene(action: BasinIntervention): void {
    try {
      this.engine.intervene(action); this.baseline = null; this.refresh();
      this.notice(action.type === "drought" ? "Rainfall reduced for the next eight seasons. Watch food reserves and migration." : action.type === "bridge" ? "The council will buy materials and fund construction from its treasury." : "Sales tax changed. Watch household purchasing power and the council treasury.");
    } catch (error) { this.notice(error instanceof Error ? error.message : "That change could not be applied."); }
  }

  private compare(): void {
    this.playing = false;
    if (this.engine.state.season > MAX_COUNTERFACTUAL_SEASONS) {
      this.baseline = null;
      this.refresh();
      this.notice("Counterfactual comparison is available through Year 400 to keep the page responsive.");
      return;
    }
    const baseline = new BasinEngine(this.engine.state.seed);
    baseline.advance(this.engine.state.season);
    const state = baseline.state;
    this.baseline = { season: state.season, population: state.households.reduce((sum, h) => sum + h.size, 0), food: state.households.reduce((sum, h) => sum + h.stocks.food, 0), trade: state.shipments.reduce((sum, s) => sum + s.amount, 0), wellbeing: state.households.reduce((sum, h) => sum + h.wellbeing, 0) / Math.max(1, state.households.length) };
    this.refresh();
    this.notice("Paused to compare the same seed at the same season, without your interventions.");
  }

  private refresh(): void {
    const state = this.engine.state;
    const selected = state.settlements.find((s) => s.id === this.selected) ?? state.settlements[0];
    const households = state.households.filter((h) => h.settlementId === selected.id);
    this.el("#basin-date").textContent = date(state.season);
    this.el("#basin-weather").textContent = state.season < state.droughtUntil ? `Drought · ${state.droughtUntil - state.season} seasons remaining` : "Seasonal rainfall";
    this.el("#basin-play").textContent = this.playing ? "Pause" : "Play";
    this.el("#basin-seed").textContent = `Seed ${state.seed}`;
    this.el("#settlement-cards").innerHTML = state.settlements.map((s) => `<button data-settlement="${escape(s.id)}" aria-pressed="${s.id === selected.id}"><span>${escape(s.name)}</span><strong>${number(s.population)} <small>people</small></strong><span class="card-reading">${s.households} households · ${number(s.stocks.food)} food</span></button>`).join("");
    this.el("#settlement-name").textContent = selected.name;
    this.el("#settlement-description").textContent = `${selected.specialty === "farmer" ? "Fertile floodplain" : selected.specialty === "woodcutter" ? "Woodland community" : "Upland workshops"} · ${households.length} households`;
    const wellbeing = households.reduce((sum, h) => sum + h.wellbeing, 0) / Math.max(1, households.length);
    this.el("#settlement-totals").innerHTML = `<div><strong>${number(selected.population)}</strong><span>Residents</span></div><div><strong>${Math.round(wellbeing * 100)}%</strong><span>Wellbeing</span></div><div><strong>${Math.round(selected.legitimacy * 100)}%</strong><span>Council trust</span></div>`;
    this.el("#basin-ledger").innerHTML = `<table><caption>Stores and last season’s flows</caption><thead><tr><th>Good</th><th>Stored</th><th>Made</th><th>Used</th><th>Price</th></tr></thead><tbody>${goods.map((good) => `<tr><th>${good[0].toUpperCase() + good.slice(1)}</th><td>${number(selected.stocks[good])}</td><td class="positive">+${number(selected.production[good])}</td><td>−${number(selected.consumption[good])}</td><td>${selected.prices[good].toFixed(1)}</td></tr>`).join("")}</tbody></table>`;
    this.el("#basin-livelihoods").innerHTML = (["farmer", "woodcutter", "toolmaker"] as const).map((job) => { const count = households.filter((h) => h.livelihood === job).length; return `<div class="job"><span>${job === "farmer" ? "Farming" : job === "woodcutter" ? "Forestry" : "Toolmaking"}</span><meter min="0" max="${Math.max(1, households.length)}" value="${count}">${count}</meter><strong>${count}</strong></div>`; }).join("");
    this.el("#basin-treasury").textContent = `${number(selected.treasury)} coin`;
    this.el("#bridge-status").textContent = selected.bridge ? "Bridge open. Local connections can carry more goods." : selected.bridgeProgress > 0 ? `Bridge construction · ${Math.round(selected.bridgeProgress * 100)}% complete` : "No bridge commissioned. A crossing can improve access to neighbouring markets.";
    const bridgeButton = this.el<HTMLButtonElement>("#fund-bridge"); bridgeButton.disabled = selected.bridge || selected.bridgeProgress > 0; bridgeButton.textContent = selected.bridge ? "Bridge complete" : selected.bridgeProgress > 0 ? "Construction underway" : "Commission a bridge";
    const tax = this.el<HTMLSelectElement>("#basin-tax");
    if (![...tax.options].some((option) => Number(option.value) === selected.taxRate)) tax.add(new Option(`${Math.round(selected.taxRate * 100)}%`, String(selected.taxRate)));
    tax.value = String(selected.taxRate);
    this.el("#basin-routes").innerHTML = state.routes.filter((r) => r.from === selected.id || r.to === selected.id).map((route) => { const destination = state.settlements.find((s) => s.id === (route.from === selected.id ? route.to : route.from)); return `<div class="route-row"><strong>${escape(destination?.name ?? "Neighbour")}</strong><span>${route.travelSeasons} seasons · capacity ${number(route.capacity)}</span><small>${number(route.traded)} goods dispatched last season${route.bridge ? " · bridge open" : ""}</small></div>`; }).join("");
    this.el("#basin-events").innerHTML = [...state.events].reverse().slice(0, 14).map((event) => `<li><time>${date(event.season)}</time><span>${escape(event.message)}</span>${Object.keys(event.causes).length ? `<details><summary>Why?</summary><p>${Object.entries(event.causes).map(([key, value]) => `${escape(key.replace(/([A-Z])/g, " $1").toLowerCase())}: ${Number(value.toFixed(2))}`).join(" · ")}</p></details>` : ""}</li>`).join("") || "<li>The first season is beginning. Watch the communities establish their livelihoods.</li>";
    this.drawTrend(state);
    const compare = this.el("#basin-comparison");
    if (this.baseline?.season === state.season) {
      const food = state.households.reduce((sum, h) => sum + h.stocks.food, 0);
      const population = state.households.reduce((sum, h) => sum + h.size, 0);
      const signed = (value: number) => `${value >= 0 ? "+" : ""}${number(value)}`;
      compare.textContent = `Compared with no changes: ${signed(food - this.baseline.food)} food in household stores, ${signed(population - this.baseline.population)} residents. Same seed, same season.`;
    } else compare.textContent = "Compare this history with the same seed and no interventions.";
    this.view?.update(state, selected.id);
  }

  private drawTrend(state: Readonly<BasinState>): void {
    const history = state.history.slice(-80);
    const metric = trendMetrics[this.trendMetric];
    const observations = history
      .map((entry) => ({ season: entry.season, value: metric.value(entry) }))
      .filter((entry): entry is { season: number; value: number } => typeof entry.value === "number" && Number.isFinite(entry.value));
    if (!observations.length) {
      this.el("#basin-trend").innerHTML = `<p class="trend-empty">${escape(metric.label)} was not recorded in this older save. Advance one season to begin tracking it.</p>`;
      return;
    }
    const values = observations.map((entry) => entry.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max(0.001, (rawMax - rawMin) * 0.12);
    const min = metric.fixedDomain?.[0] ?? (metric.zeroBased ? 0 : rawMin - padding);
    const max = metric.fixedDomain?.[1] ?? Math.max(min + 0.001, rawMax + padding);
    const points = observations.map((entry, index) => {
      const x = observations.length === 1 ? 180 : 12 + index / (observations.length - 1) * 336;
      const y = 94 - (entry.value - min) / (max - min) * 78;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const latest = observations.at(-1)!;
    const [latestX, latestY] = points.split(" ").at(-1)!.split(",");
    this.el("#basin-trend").innerHTML = `<svg viewBox="0 0 360 116" role="img" aria-label="${escape(metric.label)} over ${observations.length} recorded seasons, currently ${escape(metric.format(latest.value))}"><path class="trend-axis" d="M12 94H348"/><polyline class="trend-line" points="${points}"/><circle class="trend-point" cx="${latestX}" cy="${latestY}" r="3.5"/><text x="12" y="12">${escape(metric.format(max))}</text><text x="12" y="91">${escape(metric.format(min))}</text><text x="12" y="112">${escape(date(observations[0].season))}</text><text x="348" y="112" text-anchor="end">${escape(date(latest.season))}</text></svg><p class="trend-reading"><strong>${escape(metric.label)}</strong><span>${escape(metric.format(latest.value))}</span></p>`;
  }

  private notice(message: string): void { this.el("#basin-notice").textContent = message; }

  private loop = (time: number): void => {
    const dt = this.lastTime ? Math.min(0.25, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    if (this.playing && !document.hidden) {
      this.accumulator += dt * this.pace;
      if (this.accumulator >= 1) {
        const steps = Math.floor(this.accumulator); this.accumulator -= steps;
        this.engine.advance(steps); this.baseline = null; this.refresh();
      }
    }
    this.view?.render();
    this.frame = requestAnimationFrame(this.loop);
  };
}
