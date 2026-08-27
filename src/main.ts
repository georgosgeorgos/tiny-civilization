import { Game } from "./game";
import { configFromSearch } from "./config";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("Missing #scene canvas");
}

new Game(canvas, configFromSearch(window.location.search));

const setup = document.querySelector<HTMLDialogElement>("#setup");
const form = document.querySelector<HTMLFormElement>("#setup-form");
document.querySelector("#new-world")?.addEventListener("click", () => setup?.showModal());
document.querySelector("#setup-cancel")?.addEventListener("click", () => setup?.close());
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const params = new URLSearchParams({
    resources: String(data.get("resources")), temperament: String(data.get("temperament")),
    goal: String(data.get("goal")), auto: data.get("auto") ? "on" : "off", speed: String(data.get("speed")),
  });
  window.location.search = params.toString();
});
