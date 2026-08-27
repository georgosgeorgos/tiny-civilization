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
if (window.location.search) start();
else setup?.showModal();

document.querySelector("#new-world")?.addEventListener("click", () => setup?.showModal());
document.querySelector("#setup-cancel")?.addEventListener("click", () => setup?.close());
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const base = configFromSearch(new URLSearchParams({
    resources: String(data.get("resources")), temperament: String(data.get("temperament")),
    goal: String(data.get("goal")), auto: data.get("auto") ? "on" : "off", speed: String(data.get("speed")),
    technology: String(data.get("technology")),
  }).toString());
  const config = configFromPrompt(String(data.get("world-prompt")), base);
  const params = new URLSearchParams({
    resources: config.resources, temperament: config.temperament, goal: config.goal,
    auto: config.auto ? "on" : "off", speed: String(config.speed), technology: config.technology,
    style: config.visualStyle,
    seed: String(config.seed),
  });
  window.location.search = params.toString();
});
