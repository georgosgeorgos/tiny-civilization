import * as THREE from "three";

export type CosmicSystem = { group: THREE.Group; planet: THREE.Group; update: (time: number, zoom: number) => void };

function planetTexture(seed: number, ocean: string, land: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable");
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 56; i += 1) {
    const x = ((Math.sin(i * 89.1 + seed) * 43758.5) % 1 + 1) % 1;
    const y = ((Math.sin(i * 27.2 + seed * 3) * 23421.2) % 1 + 1) % 1;
    context.fillStyle = i % 5 === 0 ? "#d5c980" : land;
    context.beginPath();
    context.ellipse(x * 256, y * 128, 10 + ((i * 19) % 34), 4 + ((i * 13) % 15), i * 0.55, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePlanet(radius: number, seed: number, ocean: string, land: string): THREE.Group {
  const group = new THREE.Group();
  group.userData.radius = radius;
  const surface = new THREE.MeshStandardMaterial({ map: planetTexture(seed, ocean, land), roughness: 0.82 });
  surface.userData.cosmicBaseOpacity = 1;
  const atmosphere = new THREE.MeshBasicMaterial({ color: 0x88cfff, transparent: true, opacity: 0.13, side: THREE.BackSide, depthWrite: false });
  atmosphere.userData.cosmicBaseOpacity = 0.13;
  group.add(
    new THREE.Mesh(new THREE.SphereGeometry(radius, 36, 24), surface),
    new THREE.Mesh(new THREE.SphereGeometry(radius * 1.025, 32, 20), atmosphere),
  );
  return group;
}

function addPlanetLabel(planet: THREE.Group, name: string): void {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.font = "600 30px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillStyle = "rgba(5, 12, 25, 0.72)";
  context.fillRect(0, 9, canvas.width, 50);
  context.strokeStyle = "rgba(170, 229, 255, 0.75)";
  context.strokeRect(0.5, 9.5, canvas.width - 1, 49);
  context.fillStyle = "#e8f7ff";
  context.fillText(name, canvas.width / 2, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  const radius = Number(planet.userData.radius ?? 30);
  label.position.set(0, radius * 1.42, 0);
  label.scale.set(radius * 2.2, radius * 0.5, 1);
  planet.add(label);
}

/** Generated zoom context: local tiles → planet → solar system. */
export function createCosmicSystem(): CosmicSystem {
  const group = new THREE.Group();
  group.visible = false;
  const positions = new Float32Array(1600 * 3);
  for (let i = 0; i < 1600; i += 1) {
    const radius = 700 + ((i * 71) % 2500);
    const theta = i * 2.39996;
    positions.set([Math.cos(theta) * radius, ((i * 47) % 900) - 450, Math.sin(theta) * radius], i * 3);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)), new THREE.PointsMaterial({ color: 0xdbe8ff, size: 4, transparent: true, depthWrite: false }));
  const planet = makePlanet(115, 7, "#1d7794", "#4c8c4d");
  planet.userData.planetName = "Tidelight";
  planet.userData.planetCopy = "A temperate ocean world of many cultures and growing frontiers.";
  addPlanetLabel(planet, "Tidelight");
  const sun = new THREE.Mesh(new THREE.SphereGeometry(62, 28, 20), new THREE.MeshBasicMaterial({ color: 0xffc15a }));
  sun.position.set(-520, 0, -230);
  const light = new THREE.PointLight(0xffb14d, 12, 1300, 1.4);
  light.position.copy(sun.position);
  group.add(stars, planet, sun, light);
  for (const spec of [{ distance: 300, radius: 25, seed: 2, ocean: "#8d5541", land: "#c99461", speed: 0.1 }, { distance: 460, radius: 40, seed: 5, ocean: "#9b8872", land: "#d5c9aa", speed: 0.06 }, { distance: 680, radius: 52, seed: 9, ocean: "#5b497e", land: "#a487c4", speed: 0.035 }]) {
    const body = makePlanet(spec.radius, spec.seed, spec.ocean, spec.land);
    body.userData.orbit = spec;
    body.userData.planetName = ["Cinder", "Palehaven", "Violet Reach"][spec.seed === 2 ? 0 : spec.seed === 5 ? 1 : 2];
    body.userData.planetCopy = ["Volcanic coasts, mineral wealth, and hardy settlements.", "A cold world of long winters and careful craft.", "A strange luminous world with ancient ruins."][spec.seed === 2 ? 0 : spec.seed === 5 ? 1 : 2];
    addPlanetLabel(body, String(body.userData.planetName));
    group.add(body);
  }
  return { group, planet, update(time, zoom) {
    planet.rotation.set(0.18, time * 0.025, 0);
    for (const child of group.children) {
      const orbit = child.userData.orbit as { distance: number; speed: number } | undefined;
      if (!orbit) continue;
      const angle = time * orbit.speed + orbit.distance;
      child.position.set(sun.position.x + Math.cos(angle) * orbit.distance, 0, sun.position.z + Math.sin(angle) * orbit.distance);
      child.rotation.y = time * 0.08;
    }
    stars.visible = zoom > 900;
  } };
}
