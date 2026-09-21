const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing app root");
const appRoot = root;

async function start(): Promise<void> {
  const url = new URL(window.location.href);
  if (url.searchParams.get("mode") === "legacy") {
    const { default: markup } = await import("./legacy.html?raw");
    document.body.innerHTML = markup;
    await import("./legacy");
    return;
  }

  const rawSeed = url.searchParams.get("seed");
  const seed = rawSeed?.trim() && Number.isSafeInteger(Number(rawSeed))
    ? Number(rawSeed) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
  url.searchParams.set("seed", String(seed));
  window.history.replaceState(null, "", url);
  const { BasinApp } = await import("./basin/app");
  new BasinApp(appRoot, seed);
}

void start();
