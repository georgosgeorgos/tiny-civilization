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
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const base = configFromSearch(new URLSearchParams({
    resources: String(data.get("resources")), temperament: String(data.get("temperament")),
    goal: String(data.get("goal")), auto: "on", speed: String(data.get("speed")),
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
