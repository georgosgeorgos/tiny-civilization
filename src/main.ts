import { Game } from "./game";
import { configFromPrompt, configFromSearch } from "./config";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas");
}

const setup = document.querySelector<HTMLDialogElement>("#setup");
const form = document.querySelector<HTMLFormElement>("#setup-form");
const start = () => new Game(canvas, configFromSearch(window.location.search));
// A civilization should be observable immediately; setup is an optional new-world action.
start();

document.querySelector("#new-world")?.addEventListener("click", () => setup?.showModal());
document.querySelector("#setup-cancel")?.addEventListener("click", () => setup?.close());

const choiceCopy: Record<string, Record<string, string>> = {
  origin: { camp: "A small camp", farmers: "A farmers’ village", city: "An established city", spacecraft: "A deep-space habitat" },
  archetype: { continental: "on a connected continent", archipelago: "among an archipelago", shattered: "on a shattered world", frontier: "at a wild frontier" },
  goal: { prosper: "seeking prosperity.", survive: "determined to endure.", explore: "looking to connect distant settlements." },
};

function refreshScenarioSummary(): void {
  if (!form) return;
  const data = new FormData(form);
  const summary = document.querySelector("#scenario-summary");
  if (summary) summary.textContent = `${choiceCopy.origin[String(data.get("origin"))] ?? "A new society"} ${choiceCopy.archetype[String(data.get("archetype"))] ?? "in an unknown place"}, ${choiceCopy.goal[String(data.get("goal"))] ?? "seeking a future."}`;
}

function selectChoice(button: HTMLButtonElement): void {
  if (!form) return;
  const field = button.dataset.choice;
  const value = button.dataset.value;
  if (!field || !value) return;
  const input = form.querySelector<HTMLInputElement>(`input[name="${field}"]`);
  if (!input) return;
  input.value = value;
  form.querySelectorAll<HTMLButtonElement>(`[data-choice="${field}"]`).forEach((candidate) => {
    const selected = candidate === button;
    candidate.classList.toggle("is-selected", selected);
    candidate.setAttribute("aria-pressed", String(selected));
  });
  refreshScenarioSummary();
}

form?.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((button) => button.addEventListener("click", () => selectChoice(button)));
document.querySelector<HTMLButtonElement>("#setup-surprise")?.addEventListener("click", () => {
  const options: Record<string, string[]> = { origin: ["camp", "farmers", "city", "spacecraft"], archetype: ["continental", "archipelago", "shattered", "frontier"], goal: ["prosper", "survive", "explore"] };
  for (const [field, values] of Object.entries(options)) {
    const value = values[Math.floor(Math.random() * values.length)] as string;
    const choice = form?.querySelector<HTMLButtonElement>(`[data-choice="${field}"][data-value="${value}"]`);
    if (choice) selectChoice(choice);
  }
});
refreshScenarioSummary();
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const base = configFromSearch(new URLSearchParams({
    resources: String(data.get("resources")), temperament: String(data.get("temperament")),
    goal: String(data.get("goal")), auto: "on", speed: String(data.get("speed")),
    technology: String(data.get("technology")),
    origin: String(data.get("origin")),
    archetype: String(data.get("archetype")),
    style: String(data.get("style")),
    seed: String(seed),
  }).toString());
  const config = configFromPrompt(String(data.get("world-prompt")), base);
  const params = new URLSearchParams({
    resources: config.resources, temperament: config.temperament, goal: config.goal,
    auto: config.auto ? "on" : "off", speed: String(config.speed), technology: config.technology,
    style: config.visualStyle,
    origin: config.origin,
    archetype: config.archetype,
    seed: String(config.seed),
  });
  window.location.search = params.toString();
});
