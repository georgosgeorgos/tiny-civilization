import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { chooseNextBuilding, emptyCounts, eraName, SOCIETY_NAMES, SOCIETY_PLANS, type CivSnapshot } from "./ai";
import { BUILDING_ORDER, BUILDINGS, biomeAllows, type BuildingId } from "./buildings";
import { hash2, hexDistance, hexesInRadius, hexKey, hexNeighbors, hexToWorld, worldToHex } from "./hex";
import {
  createClouds,
  createEnvironment,
  createHexRing,
  createSky,
  createSkyDome,
  createStars,
  createWater,
  sunFromHour,
  type WaterSystem,
} from "./look";
import {
  applySeasonPalette,
  ghostify,
  makeBuilding,
  makeCliffMaterial,
  makeFlowers,
  makeGrassMaterial,
  makeHexColumn,
  makeHuman,
  makeLandmark,
  makeLavaMaterial,
  makePavementMaterial,
  makeSandMaterial,
  makeSheep,
  makeTileDecor,
  type PersonRole,
} from "./models";
import { LivingWorld, type Weather } from "./life";
import {
  SECONDS_PER_DAY,
  SPEED_STEPS,
  YEAR_SECONDS,
  dayOfSeason,
  daylight,
  farmSeasonYield,
  hourFromDays,
  isNight,
  seasonFromDays,
  timeOfDay,
  yearFromDays,
  type Season,
} from "./time";
import { DISCOVER_COPY, UNLOAD_RADIUS, VIEW_RADIUS, sampleWorld, styleForKind, type Biome, type LandKind } from "./world";
import { Hud } from "./ui";
import { developmentStage, isUnlocked, specialtyFor, type DevelopmentStage } from "./civilization";
import { goalCopy, type SimulationConfig } from "./config";
import { createCosmicSystem, type CosmicSystem } from "./cosmos";
import { DIRECTIVE_COPY, directiveFromText, type Directive } from "./directive";
import { SimulationClient } from "./simulation/client.ts";

type Person = {
  mesh: THREE.Group;
  q: number;
  r: number;
  destQ: number;
  destR: number;
  homeQ: number;
  homeR: number;
  workQ: number;
  workR: number;
  progress: number;
  wait: number;
  speed: number;
  phase: number;
  offset: THREE.Vector3;
  role: PersonRole;
  sleeping: boolean;
  tribe: boolean;
  islandId: string;
  seed: number;
};

type Society = {
  islandId: string;
  kind: LandKind;
  name: string;
  gold: number;
  food: number;
  wood: number;
  mood: number;
  stage: DevelopmentStage;
  relation: number;
};

type Critter = {
  mesh: THREE.Group;
  q: number;
  r: number;
  destQ: number;
  destR: number;
  progress: number;
  wait: number;
  speed: number;
  phase: number;
  offset: THREE.Vector3;
};

type WorldEvent = "none" | "festival" | "drought" | "ash" | "trade" | "migration" | "flood" | "wildfire";

const PEOPLE_PER_BUILDING: Record<BuildingId, { count: number; role: PersonRole }> = {
  hut: { count: BUILDINGS.hut.workers, role: BUILDINGS.hut.workerRole },
  farm: { count: BUILDINGS.farm.workers, role: BUILDINGS.farm.workerRole },
  mine: { count: BUILDINGS.mine.workers, role: BUILDINGS.mine.workerRole },
  fishery: { count: BUILDINGS.fishery.workers, role: BUILDINGS.fishery.workerRole },
  lumber: { count: BUILDINGS.lumber.workers, role: BUILDINGS.lumber.workerRole },
  shrine: { count: BUILDINGS.shrine.workers, role: BUILDINGS.shrine.workerRole },
  market: { count: BUILDINGS.market.workers, role: BUILDINGS.market.workerRole },
  orchard: { count: BUILDINGS.orchard.workers, role: BUILDINGS.orchard.workerRole },
  forge: { count: BUILDINGS.forge.workers, role: BUILDINGS.forge.workerRole },
};

const JOB_FOR_ROLE: Partial<Record<PersonRole, BuildingId>> = {
  farmer: "farm",
  miner: "mine",
  fisher: "fishery",
  woodcutter: "lumber",
  keeper: "shrine",
  merchant: "market",
  grower: "orchard",
  smith: "forge",
};

const WEATHER_COPY: Record<Weather, string> = {
  clear: "Skies clear. Good traveling weather.",
  rain: "Rain on the fields. Crops drink deep.",
  storm: "A storm rolls in. People slow, seas rise.",
};

const HEX_SIZE = 1;
const VIEW_OFFSETS = hexesInRadius(VIEW_RADIUS);

type Tile = {
  q: number;
  r: number;
  building: BuildingId | null;
  mesh: THREE.Mesh;
  buildingMesh: THREE.Object3D | null;
  decor: THREE.Object3D | null;
  baseY: number;
  scaleY: number;
  topMat: THREE.MeshStandardMaterial;
  baseTop: THREE.Color;
  biome: Biome;
  buildable: boolean;
  coast: boolean;
  wooded: boolean;
  owner: "player" | "tribe" | null;
  kind: LandKind;
  islandId: string;
  buildLeft: number;
  buildTotal: number;
  ready: boolean;
};

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tiles = new Map<string, Tile>();
  private readonly tileGroup = new THREE.Group();
  private readonly hoverRing: THREE.Line;
  private readonly water: WaterSystem;
  private readonly clouds: THREE.Group;
  private readonly cosmos: CosmicSystem;
  private readonly popIns: { object: THREE.Object3D; t: number; target: number }[] = [];
  private readonly swaying: THREE.Object3D[] = [];
  private readonly smokeStacks: THREE.Object3D[] = [];
  private readonly shrineOrbs: THREE.Object3D[] = [];
  private readonly nightLights: THREE.Mesh[] = [];
  private readonly peopleGroup = new THREE.Group();
  private readonly people: Person[] = [];
  private readonly hexGeo = makeHexColumn();
  private readonly keys = new Set<string>();
  private readonly hud = new Hud();
  private readonly discovered = new Set<LandKind>(["home"]);
  private readonly playerIslands = new Set<string>(["0,0"]);
  private lastFocus = "";
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly sunDisc: THREE.Mesh;
  private readonly moonDisc: THREE.Mesh;
  private readonly skyDome: THREE.Mesh;
  private readonly stars: THREE.Points;
  private ghost: THREE.Object3D;
  private selected: BuildingId = "hut";
  private hovered: Tile | null = null;
  private simDays = 0.4;
  private speed = 1;
  private season: Season = "Spring";
  private gold = 72;
  private food = 22;
  private wood = 16;
  private mood = 52;
  private technology = 0;
  private weather: Weather = "clear";
  private weatherUntil = 1.1;
  private event: WorldEvent = "none";
  private eventUntil = 0;
  private migrationResolved = false;
  private auto = true;
  private directive: Directive = "balanced";
  private autoTimer = 0;
  private societyTimer = 0;
  private growTimer = 0;
  private hungerTimer = 0;
  private seeded = false;
  private readonly founded = new Set<string>();
  private readonly societies = new Map<string, Society>();
  private readonly animals: Critter[] = [];
  private readonly life = new LivingWorld();
  private running = true;
  private pointerDown: { x: number; y: number } | null = null;
  private hudTimer = 0;
  private renderScale = 1.5;
  private qualityTimer = 0;
  private qualityFrames = 0;
  private cosmicMode = false;
  private readonly visualStyle: SimulationConfig["visualStyle"];
  private readonly simulation: SimulationClient;

  constructor(canvas: HTMLCanvasElement, config: SimulationConfig) {
    this.canvas = canvas;
    this.visualStyle = config.visualStyle;
    const startingStores = config.resources === "lean" ? { gold: 36, food: 12, wood: 8 } : config.resources === "abundant" ? { gold: 120, food: 40, wood: 32 } : { gold: 72, food: 22, wood: 16 };
    this.gold = startingStores.gold;
    this.food = startingStores.food;
    this.wood = startingStores.wood;
    this.auto = config.auto;
    this.speed = config.speed;
    this.technology = config.technology === "advanced" ? 90 : config.technology === "developing" ? 30 : 0;
    this.simulation = new SimulationClient(config.seed, startingStores, this.technology);
    this.weatherUntil = config.temperament === "calm" ? 1.8 : config.temperament === "wild" ? 0.55 : 1.1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.renderScale));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.4, 9000);
    this.camera.position.set(22, 64, 48);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.panSpeed = 2.1;
    this.controls.maxPolarAngle = Math.PI / 2.18;
    this.controls.minPolarAngle = 0.18;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 7000;
    this.controls.target.set(0, 1.2, 0);

    this.scene.fog = new THREE.FogExp2(0x9ec9c8, 0.00115);
    this.scene.background = new THREE.Color(0x8ec8c4);

    const sky = createSky();
    this.scene.environment = createEnvironment(this.renderer, sky);
    this.scene.environmentIntensity = 0.28;
    this.skyDome = createSkyDome();
    this.scene.add(this.skyDome);
    this.stars = createStars();
    this.scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xd7ecff, 0x6a4a2c, 0.42);
    this.scene.add(this.hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff0d2, 3.1);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.shadow.normalBias = 0.035;
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 110;
    this.sunLight.shadow.camera.left = -48;
    this.sunLight.shadow.camera.right = 48;
    this.sunLight.shadow.camera.top = 48;
    this.sunLight.shadow.camera.bottom = -48;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.fill = new THREE.DirectionalLight(0x9ad0ff, 0.22);
    this.fill.position.set(-14, 10, -12);
    this.scene.add(this.fill);

    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: false }),
    );
    this.scene.add(this.sunDisc);

    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xcdd6e8, fog: false }),
    );
    this.scene.add(this.moonDisc);

    this.water = createWater();
    this.scene.add(this.water.mesh);
    this.clouds = createClouds();
    this.scene.add(this.clouds);
    this.cosmos = createCosmicSystem();
    this.scene.add(this.cosmos.group);
    this.scene.add(this.tileGroup);
    this.scene.add(this.peopleGroup);
    this.scene.add(this.life.group);
    this.ensureWorld();

    this.hoverRing = createHexRing(0.82);
    this.scene.add(this.hoverRing);
    this.ghost = this.makeGhost("hut");
    this.scene.add(this.ghost);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.05, 0.2, 0.94);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.bindUi();
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    applySeasonPalette(this.season);
    this.updateLighting();
    this.seedCivilization();
    this.syncSpeedButtons();
    this.syncAutoButton();
    this.refreshHud();
    (window as unknown as { game: Game }).game = this;
    this.setHint(`${goalCopy(config.goal)} Scroll out — a glass city sits east, a brick harbor west.`);
    this.loop();
  }

  private ensureWorld(): void {
    const focus = worldToHex(this.controls.target.x, this.controls.target.z, HEX_SIZE);
    const focusKey = `${Math.round(focus.q / 3)},${Math.round(focus.r / 3)}`;
    const first = this.tiles.size === 0;
    if (!first && focusKey === this.lastFocus) return;
    this.lastFocus = focusKey;

    for (const offset of VIEW_OFFSETS) {
      const q = focus.q + offset.q;
      const r = focus.r + offset.r;
      if (this.tiles.has(hexKey(q, r))) continue;
      const sample = sampleWorld(q, r);
      if (!sample) continue;
      this.stampTile(q, r, sample);
      if (!this.discovered.has(sample.kind)) {
        this.discovered.add(sample.kind);
        this.setHint(DISCOVER_COPY[sample.kind]);
      }
    }
    this.pruneWorld(focus.q, focus.r);
    if (this.seeded) this.tryFoundSocieties();
  }

  private pruneWorld(fq: number, fr: number): void {
    const occupied = new Set<string>();
    for (const person of this.people) {
      occupied.add(hexKey(person.q, person.r));
      occupied.add(hexKey(person.destQ, person.destR));
    }
    const keepIslands = new Set<string>(["0,0", ...this.societies.keys()]);
    for (const [key, tile] of this.tiles) {
      if (tile.building) continue;
      if (occupied.has(key)) continue;
      if (keepIslands.has(tile.islandId)) continue;
      if (hexDistance(tile.q - fq, tile.r - fr) <= UNLOAD_RADIUS) continue;
      this.tileGroup.remove(tile.mesh);
      this.tiles.delete(key);
    }
  }

  private stampTile(q: number, r: number, sample: NonNullable<ReturnType<typeof sampleWorld>>): void {
    const { x, z } = hexToWorld(q, r, HEX_SIZE);
    const n = hash2(q, r);
    const scaleY = Math.max(0.55, sample.height);
    const baseY = scaleY * 0.5 - 0.14;
    const tint = new THREE.Color();
    const cliff = makeCliffMaterial();

    if (sample.biome === "sand") {
      tint.setHSL(0.09, 0.46, 0.5 + n * 0.05);
      cliff.color.setHex(0xc49a6a);
    } else if (sample.biome === "desert") {
      tint.setHSL(0.11, 0.62, 0.58 + n * 0.08);
      cliff.color.setHex(0xc4a060);
    } else if (sample.biome === "volcanic") {
      tint.setHex(0x4a2018);
      cliff.color.setHex(0x2c201c);
    } else if (sample.biome === "crystal") {
      tint.setHSL(0.55, 0.35, 0.42 + n * 0.08);
      cliff.color.setHex(0x4a6070);
    } else if (sample.biome === "ruin") {
      tint.setHSL(0.12, 0.18, 0.42);
      cliff.color.setHex(0x8a8074);
    } else if (sample.biome === "snow") {
      tint.setHSL(0.55, 0.08, 0.82);
      cliff.color.setHex(0x8f8680);
    } else if (sample.biome === "rock") {
      if (sample.kind === "mesa") {
        tint.setHSL(0.05, 0.48, 0.42 + n * 0.08);
        cliff.color.setHex(0x8a3a22);
      } else {
        tint.setHSL(0.08, 0.12, 0.38 + n * 0.06);
        cliff.color.setHex(0x6a5a4c);
      }
    } else if (sample.biome === "jungle") {
      tint.setHSL(0.32, 0.62, 0.22 + n * 0.06);
      cliff.color.setHex(0x3a2814);
    } else if (sample.biome === "swamp") {
      tint.setHSL(0.22, 0.28, 0.22 + n * 0.05);
      cliff.color.setHex(0x3a3420);
    } else if (sample.biome === "urban") {
      tint.setHSL(0.62, 0.05, 0.2 + n * 0.07);
      cliff.color.setHex(0x3a3e44);
    } else if (sample.biome === "plaza") {
      tint.setHSL(0.1, 0.07, 0.64 + n * 0.05);
      cliff.color.setHex(0x8a8680);
    } else {
      tint.setHSL(0.23 + n * 0.04, 0.58, 0.34 + n * 0.08);
      cliff.color.setHex(0xc49a6a);
    }

    const top =
      sample.landmark === "vent"
        ? makeLavaMaterial()
        : sample.biome === "urban" || sample.biome === "plaza"
          ? makePavementMaterial(tint)
          : sample.biome === "sand" || sample.biome === "desert"
            ? makeSandMaterial(tint)
            : makeGrassMaterial(tint);
    const bottom = new THREE.MeshStandardMaterial({ color: 0x3d2a1c, roughness: 1, flatShading: true });
    const mesh = new THREE.Mesh(this.hexGeo, [cliff, top, bottom]);
    mesh.position.set(x, baseY, z);
    mesh.scale.y = scaleY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { q, r };
    this.tileGroup.add(mesh);

    let decor: THREE.Object3D | null = null;
    let wooded = false;
    if (sample.landmark !== "none") {
      decor = makeLandmark(sample.landmark);
    }
    if (!decor && sample.biome === "jungle" && n > 0.28) {
      decor = makeTileDecor("palm", n);
      wooded = true;
    } else if (!decor && sample.biome === "desert" && n > 0.45) {
      decor = makeTileDecor("cactus", n);
    } else if (!decor && sample.biome === "swamp" && n > 0.32) {
      decor = makeTileDecor("reeds", n);
    } else if (!decor && sample.biome === "snow" && n > 0.4) {
      decor = makeTileDecor(n > 0.78 ? "ice" : "pine", n);
    } else if (!decor && sample.biome === "grass" && n > 0.6) {
      decor = makeTileDecor(n > 0.82 ? "pine" : "round", n);
      wooded = true;
    } else if (!decor && sample.kind === "atoll" && n > 0.55) {
      decor = makeTileDecor("palm", n);
    } else if (!decor && sample.coast && n > 0.72) {
      decor = makeTileDecor("rocks", n);
    } else if (!decor && sample.biome === "rock" && n > 0.7) {
      decor = makeTileDecor("rocks", n);
    } else if (!decor && sample.biome === "urban" && n > 0.8 && n < 0.88) {
      decor = makeTileDecor("lamp", n);
    } else if (!decor && sample.biome === "plaza" && n > 0.35) {
      decor = makeTileDecor("planter", n);
    } else if (!decor && sample.biome === "grass" && n > 0.28 && n < 0.55) {
      decor = makeFlowers(n);
    }
    if (decor) {
      decor.position.y = 0.5;
      mesh.add(decor);
    }
    this.registerAnimatedObjects(mesh);

    this.tiles.set(hexKey(q, r), {
      q,
      r,
      building: null,
      mesh,
      buildingMesh: null,
      decor,
      baseY,
      scaleY,
      topMat: top,
      baseTop: tint.clone(),
      biome: sample.biome,
      buildable: sample.buildable,
      coast: sample.coast,
      wooded,
      owner: null,
      kind: sample.kind,
      islandId: sample.islandId,
      buildLeft: 0,
      buildTotal: 0,
      ready: false,
    });
  }

  private bindUi(): void {
    const tools = document.querySelector("#tools");
    if (!tools) return;

    for (const id of BUILDING_ORDER) {
      const def = BUILDINGS[id];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tool";
      button.dataset.id = id;
      button.innerHTML = `<strong>${def.name}</strong><span>${def.goldCost}g${def.woodCost ? ` · ${def.woodCost}w` : ""} · ${def.hint}</span>`;
      button.addEventListener("click", () => this.selectBuilding(id));
      tools.append(button);
    }

    document.querySelectorAll("[data-speed]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = Number((button as HTMLButtonElement).dataset.speed);
        this.setSpeed(value);
      });
    });
    document.querySelector("#auto")?.addEventListener("click", () => {
      this.auto = !this.auto;
      this.syncAutoButton();
      this.setHint(this.auto ? "Auto on. The settlement chooses what to build." : "Auto off. You pick the next building.");
    });
    document.querySelectorAll<HTMLButtonElement>("[data-directive]").forEach((button) => {
      button.addEventListener("click", () => this.setDirective(button.dataset.directive as Directive));
    });
    document.querySelector<HTMLFormElement>("#directive-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>("#directive-input");
      const directive = directiveFromText(input?.value ?? "");
      if (!directive) return this.setHint("Try food, growth, wealth, culture, frontier, or balance.");
      this.setDirective(directive);
      if (input) input.value = "";
    });
    document.querySelector("#frontier-charter")?.addEventListener("click", () => this.charterFrontier());
    document.querySelector("#trade-pact")?.addEventListener("click", () => this.sendEnvoy(true));
    document.querySelector("#rival-claim")?.addEventListener("click", () => this.sendEnvoy(false));
    document.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((button) => {
      button.addEventListener("click", () => this.setZoom(Number(button.dataset.zoom)));
    });
    this.selectBuilding("hut");
    this.syncSpeedButtons();
    this.syncAutoButton();
  }

  private bindInput(): void {
    this.canvas.addEventListener("pointermove", (event) => {
      this.updatePointer(event);
      this.updateHover();
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (event.button !== 0 || !this.pointerDown) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      this.pointerDown = null;
      if (dx * dx + dy * dy > 16) return;
      this.updatePointer(event);
      this.tryPlace();
    });
    window.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (["w", "a", "s", "d", "W", "A", "S", "D", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const mapped = event.key
          .toLowerCase()
          .replace("arrowup", "w")
          .replace("arrowdown", "s")
          .replace("arrowleft", "a")
          .replace("arrowright", "d");
        this.keys.add(mapped);
      }
      if (event.key === "1") this.selectBuilding("hut");
      if (event.key === "2") this.selectBuilding("farm");
      if (event.key === "3") this.selectBuilding("mine");
      if (event.key === "4") this.selectBuilding("fishery");
      if (event.key === "5") this.selectBuilding("lumber");
      if (event.key === "6") this.selectBuilding("shrine");
      if (event.key === "7") this.selectBuilding("market");
      if (event.key === "8") this.selectBuilding("orchard");
      if (event.key === "9") this.selectBuilding("forge");
      if (event.key === " " || event.key === "p" || event.key === "P") {
        event.preventDefault();
        this.setSpeed(this.speed === 0 ? 1 : 0);
      }
      if (event.key === "g" || event.key === "G") {
        this.auto = !this.auto;
        this.syncAutoButton();
        this.setHint(this.auto ? "Auto on. The settlement chooses what to build." : "Auto off. You pick the next building.");
      }
      if (event.key === "+" || event.key === "=") this.nudgeSpeed(1);
      if (event.key === "-" || event.key === "_") this.nudgeSpeed(-1);
      if (event.key === "z" || event.key === "Z") this.setZoom(70);
      if (event.key === "x" || event.key === "X") this.setZoom(430);
      if (event.key === "c" || event.key === "C") this.setZoom(1700);
      if (event.key === "h" || event.key === "H") this.setInterfaceVisible(document.body.classList.contains("cinematic"));
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
      this.keys.delete(event.key.toLowerCase().replace("arrowup", "w").replace("arrowdown", "s").replace("arrowleft", "a").replace("arrowright", "d"));
    });
  }

  private makeGhost(id: BuildingId): THREE.Object3D {
    const ghost = makeBuilding(id);
    ghostify(ghost, BUILDINGS[id].color);
    ghost.visible = false;
    ghost.scale.setScalar(1.02);
    return ghost;
  }

  private selectBuilding(id: BuildingId): void {
    this.selected = id;
    this.scene.remove(this.ghost);
    this.ghost = this.makeGhost(id);
    this.scene.add(this.ghost);
    for (const button of document.querySelectorAll<HTMLButtonElement>(".tool")) {
      button.classList.toggle("active", button.dataset.id === id);
    }
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private hitTile(): Tile | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.tileGroup.children, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        const data = object.userData as { q?: number; r?: number };
        if (data.q !== undefined && data.r !== undefined) {
          return this.tiles.get(hexKey(data.q, data.r)) ?? null;
        }
        object = object.parent;
      }
    }
    return null;
  }

  private tileTop(tile: Tile): THREE.Vector3 {
    return new THREE.Vector3(
      tile.mesh.position.x,
      tile.mesh.position.y + 0.5 * tile.scaleY,
      tile.mesh.position.z,
    );
  }

  private updateHover(): void {
    const tile = this.hitTile();
    this.hovered = tile;
    const def = BUILDINGS[this.selected];
    const snap = this.civSnapshot();
    const isNewFrontier = tile && !this.playerIslands.has(tile.islandId) && tile.kind !== "home";
    const canPlace = Boolean(
      tile &&
        tile.building === null &&
        tile.buildable &&
        tile.owner !== "tribe" &&
        (this.playerIslands.has(tile.islandId) || (isNewFrontier && this.selected === "hut" && ["Town", "City"].includes(developmentStage(snap.people, snap.buildingTotal)))) &&
        biomeAllows(def, tile.biome) &&
        this.canUseBuilding(this.selected, snap) && this.territoryAllows(tile, "player"),
    );
    this.ghost.visible = canPlace;
    this.hoverRing.visible = Boolean(tile);
    if (tile) {
      const top = this.tileTop(tile);
      this.hoverRing.position.copy(top);
      if (canPlace) this.ghost.position.copy(top);
      const ringMat = this.hoverRing.material as THREE.LineBasicMaterial;
      ringMat.color.setHex(canPlace || tile.building ? 0xc8ffe4 : 0xff8a7a);
    }
    this.canvas.style.cursor = canPlace ? "pointer" : "grab";
  }

  private tryPlace(): void {
    if (this.cosmicMode) {
      this.selectPlanet();
      return;
    }
    const tile = this.hitTile();
    if (!tile || tile.building) return;
    if (!tile.buildable) {
      this.setHint("This ground is too wild to settle.");
      return;
    }
    if (tile.owner === "tribe") {
      this.setHint("Another people already claimed this ground.");
      return;
    }
    if (!this.territoryAllows(tile, "player")) {
      this.setHint("This lies beyond your current territory. Build and prosper to extend your influence.");
      return;
    }
    const snap = this.civSnapshot();
    const frontier = !this.playerIslands.has(tile.islandId) && tile.kind !== "home";
    if (frontier && (!["Town", "City"].includes(developmentStage(snap.people, snap.buildingTotal)) || this.selected !== "hut")) {
      this.setHint("Reach Town, then place a hut to establish a new frontier.");
      return;
    }

    const def = BUILDINGS[this.selected];
    if (!this.canUseBuilding(def.id, snap)) {
      this.setHint(`${def.name} needs a more developed settlement or higher technology.`);
      return;
    }
    if (!biomeAllows(def, tile.biome)) {
      const need = def.biomes === "any" ? "open ground" : def.biomes.join(" or ");
      this.setHint(`${def.name} needs ${need} ground.`);
      return;
    }
    if (this.gold < def.goldCost) {
      document.querySelector("#stat-gold")?.classList.add("flash");
      window.setTimeout(() => document.querySelector("#stat-gold")?.classList.remove("flash"), 450);
      this.setHint(`Need ${def.goldCost} gold for a ${def.name.toLowerCase()}.`);
      return;
    }
    if (this.wood < def.woodCost) {
      document.querySelector("#stat-wood")?.classList.add("flash");
      window.setTimeout(() => document.querySelector("#stat-wood")?.classList.remove("flash"), 450);
      this.setHint(`Need ${def.woodCost} wood for a ${def.name.toLowerCase()}.`);
      return;
    }
    if (this.placeBuilding(tile, def.id, { owner: "player" }) && frontier) {
      this.playerIslands.add(tile.islandId);
      this.setHint(`A new frontier is founded on the ${tile.kind} isle.`);
    }
  }

  private placeBuilding(
    tile: Tile,
    id: BuildingId,
    opts: { owner: "player" | "tribe"; free?: boolean; silent?: boolean; treasury?: Society },
  ): boolean {
    const def = BUILDINGS[id];
    if (tile.building || !tile.buildable || !biomeAllows(def, tile.biome)) return false;
    if (tile.owner && tile.owner !== opts.owner) return false;
    if (!opts.free) {
      if (opts.owner === "player") {
        if (this.gold < def.goldCost || this.wood < def.woodCost) return false;
        this.gold -= def.goldCost;
        this.wood -= def.woodCost;
      } else if (opts.treasury) {
        if (opts.treasury.gold < def.goldCost || opts.treasury.wood < def.woodCost) return false;
        opts.treasury.gold -= def.goldCost;
        opts.treasury.wood -= def.woodCost;
      } else return false;
    }

    tile.building = def.id;
    tile.owner = opts.owner;
    if (tile.decor) {
      tile.mesh.remove(tile.decor);
      tile.decor = null;
    }
    tile.buildingMesh = makeBuilding(def.id, styleForKind(tile.kind));
    tile.buildingMesh.position.y = 0.5;
    const instant = Boolean(opts.free);
    tile.buildTotal = instant ? 0 : 0.28 + (def.goldCost + def.woodCost) * 0.012;
    tile.buildLeft = tile.buildTotal;
    tile.buildingMesh.scale.setScalar(instant ? 0.01 : 0.28);
    tile.mesh.add(tile.buildingMesh);
    this.registerAnimatedObjects(tile.buildingMesh);
    this.markRoads(tile);
    this.ghost.visible = false;
    this.refreshHud();
    if (instant) {
      this.popIns.push({ object: tile.buildingMesh, t: 0, target: 1.22 });
      this.finishBuilding(tile, opts.silent);
    } else if (!opts.silent && opts.owner === "player") {
      this.setHint(`Work begins on a ${def.name.toLowerCase()}.`);
    }
    return true;
  }

  private finishBuilding(tile: Tile, silent = true): void {
    if (!tile.building || tile.ready) return;
    tile.ready = true;
    tile.buildLeft = 0;
    if (tile.buildingMesh) {
      this.popIns.push({ object: tile.buildingMesh, t: 0, target: 1.22 });
    }
    const def = BUILDINGS[tile.building];
    if (tile.building === "hut") {
      this.spawnOne(tile, "villager", 0, tile.owner === "tribe");
    }
    this.assignHomes();
    this.assignJobs();
    this.refreshHud();
    if (silent) return;
    if (tile.owner === "player") {
      this.setHint(`The ${def.name.toLowerCase()} is ready.`);
    } else {
      const society = this.societies.get(tile.islandId);
      if (society) this.setHint(`${society.name} finished a ${def.name.toLowerCase()}.`);
    }
  }

  private markRoads(tile: Tile): void {
    for (const hex of hexNeighbors(tile.q, tile.r)) {
      const next = this.tiles.get(hexKey(hex.q, hex.r));
      if (!next?.building || next.owner !== tile.owner) continue;
      next.topMat.color.lerp(new THREE.Color(0x6b5344), 0.18);
      tile.topMat.color.lerp(new THREE.Color(0x6b5344), 0.12);
    }
  }

  private setRole(person: Person, role: PersonRole): void {
    if (person.role === role) return;
    const visible = person.mesh.visible;
    const position = person.mesh.position.clone();
    const rotation = person.mesh.rotation.clone();
    const scale = person.mesh.scale.clone();
    this.peopleGroup.remove(person.mesh);
    person.role = role;
    const mesh = makeHuman(role, person.seed);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.scale.copy(scale);
    mesh.visible = visible;
    person.mesh = mesh;
    this.peopleGroup.add(mesh);
  }

  private spawnOne(tile: Tile, role: PersonRole, index = 0, tribe = false): void {
    const seed = (hash2(tile.q + index + 3, tile.r + index) + index * 0.17 + this.people.length * 0.09) % 1;
    const mesh = makeHuman(role, seed);
    const angle = seed * Math.PI * 2 + index * 2.15;
    const offset = new THREE.Vector3(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
    const person: Person = {
      mesh,
      q: tile.q,
      r: tile.r,
      destQ: tile.q,
      destR: tile.r,
      homeQ: tile.q,
      homeR: tile.r,
      workQ: tile.q,
      workR: tile.r,
      progress: 1,
      wait: 0.4 + index * 0.35,
      speed: 0.7 + seed * 0.35,
      phase: seed * Math.PI * 2,
      offset,
      role,
      sleeping: false,
      tribe,
      islandId: tile.islandId,
      seed,
    };
    mesh.position.copy(this.personWorldPos(person, tile, tile, 1));
    mesh.scale.setScalar(0.01);
    this.popIns.push({ object: mesh, t: 0, target: 2.45 });
    this.peopleGroup.add(mesh);
    this.people.push(person);
  }

  private personWorldPos(person: Person, from: Tile, to: Tile, t: number): THREE.Vector3 {
    const a = this.tileTop(from).add(person.offset);
    const b = this.tileTop(to).add(person.offset);
    return a.lerp(b, t);
  }

  private pickPersonDest(person: Person): void {
    const hour = hourFromDays(this.simDays);
    const night = isNight(hour);
    if (night && person.q === person.homeQ && person.r === person.homeR) {
      person.sleeping = true;
      person.mesh.visible = false;
      person.destQ = person.q;
      person.destR = person.r;
      person.wait = 0.8;
      return;
    }

    person.sleeping = false;
    person.mesh.visible = true;
    const targetQ = night ? person.homeQ : person.workQ;
    const targetR = night ? person.homeR : person.workR;
    const land = (hex: { q: number; r: number }) => {
      const tile = this.tiles.get(hexKey(hex.q, hex.r));
      return Boolean(tile && tile.islandId === person.islandId);
    };
    if (!night && person.role === "villager" && Math.random() < 0.55) {
      const wander = hexNeighbors(person.q, person.r).filter(land);
      const next = wander[Math.floor(Math.random() * wander.length)];
      if (next) {
        person.destQ = next.q;
        person.destR = next.r;
        return;
      }
    }

    const options = hexNeighbors(person.q, person.r).filter(land);
    if (options.length === 0) {
      person.destQ = person.q;
      person.destR = person.r;
      person.wait = 1.2;
      return;
    }

    if (person.q === targetQ && person.r === targetR) {
      person.destQ = person.q;
      person.destR = person.r;
      person.wait = night ? 1 : person.role === "villager" ? 1.6 + Math.random() * 1.4 : 3.2 + Math.random() * 2.4;
      return;
    }

    const toward = options.filter(
      (hex) => hexDistance(hex.q - targetQ, hex.r - targetR) < hexDistance(person.q - targetQ, person.r - targetR),
    );
    const pool = toward.length > 0 ? toward : options;
    const next = pool[Math.floor(Math.random() * pool.length)] ?? options[0];
    person.destQ = next.q;
    person.destR = next.r;
  }

  private updatePeople(dt: number, time: number): void {
    for (const person of this.people) {
      const leftLeg = person.mesh.userData.leftLeg as THREE.Mesh;
      const rightLeg = person.mesh.userData.rightLeg as THREE.Mesh;
      const leftArm = person.mesh.userData.leftArm as THREE.Mesh;
      const rightArm = person.mesh.userData.rightArm as THREE.Mesh;

      if (person.wait > 0) {
        person.wait -= dt;
        const here = this.tiles.get(hexKey(person.q, person.r));
        if (!here) continue;
        person.mesh.position.copy(this.personWorldPos(person, here, here, 1));
        person.mesh.position.y += Math.sin(time * 2.2 + person.phase) * 0.006;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
        leftArm.rotation.x = 0;
        rightArm.rotation.x = 0;
        if (person.wait <= 0) this.pickPersonDest(person);
        continue;
      }

      person.progress +=
        dt *
        person.speed *
        (this.weather === "storm" ? 0.55 : this.mood < 25 ? 0.8 : 1) *
        (hourFromDays(this.simDays) >= 17.5 || isNight(hourFromDays(this.simDays)) ? 1.7 : 1);
      const t = Math.min(1, person.progress);
      const from = this.tiles.get(hexKey(person.q, person.r));
      const to = this.tiles.get(hexKey(person.destQ, person.destR));
      if (!from || !to) {
        person.wait = 0.4;
        person.progress = 0;
        continue;
      }

      const pos = this.personWorldPos(person, from, to, t * t * (3 - 2 * t));
      pos.y += Math.abs(Math.sin(t * Math.PI * 2)) * 0.02;
      person.mesh.position.copy(pos);

      const dx = to.mesh.position.x + person.offset.x - (from.mesh.position.x + person.offset.x);
      const dz = to.mesh.position.z + person.offset.z - (from.mesh.position.z + person.offset.z);
      if (dx * dx + dz * dz > 0.0001) {
        person.mesh.rotation.y = Math.atan2(dx, dz);
      }

      const swing = Math.sin(t * Math.PI * 4) * 0.55;
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.6;
      rightArm.rotation.x = swing * 0.6;

      if (t >= 1) {
        person.q = person.destQ;
        person.r = person.destR;
        person.progress = 0;
        person.wait = 0.35 + Math.random() * 1.4;
      }
    }
  }

  private assignHomes(): void {
    for (const person of this.people) {
      const owner = person.tribe ? "tribe" : "player";
      const huts: Tile[] = [];
      const jobs: { tile: Tile; kind: BuildingId }[] = [];
      for (const tile of this.tiles.values()) {
        if (tile.owner !== owner || tile.islandId !== person.islandId) continue;
        if (tile.building === "hut") huts.push(tile);
        if (tile.building && tile.building !== "hut") jobs.push({ tile, kind: tile.building });
      }
      const jobKind = JOB_FOR_ROLE[person.role];
      if (jobKind) {
        const job =
          jobs.find((entry) => entry.kind === jobKind && entry.tile.q === person.workQ && entry.tile.r === person.workR) ??
          jobs.find((entry) => entry.kind === jobKind);
        if (job) {
          person.workQ = job.tile.q;
          person.workR = job.tile.r;
        }
      }
      if (huts.length === 0) continue;
      let best = huts[0];
      let bestDist = 99;
      for (const hut of huts) {
        const dist = hexDistance(hut.q - person.workQ, hut.r - person.workR);
        if (dist < bestDist) {
          best = hut;
          bestDist = dist;
        }
      }
      person.homeQ = best.q;
      person.homeR = best.r;
    }
    this.assignJobs();
  }

  private assignJobs(): void {
    for (const person of this.people) {
      if (person.role === "villager") continue;
      const work = this.tiles.get(hexKey(person.workQ, person.workR));
      if (!work?.building || work.building === "hut" || work.buildLeft > 0 || work.islandId !== person.islandId) {
        this.setRole(person, "villager");
        person.workQ = person.homeQ;
        person.workR = person.homeR;
      }
    }
    for (const tile of this.tiles.values()) {
      if (!tile.building || tile.building === "hut" || tile.buildLeft > 0) continue;
      const spec = PEOPLE_PER_BUILDING[tile.building];
      const staff = this.people.filter(
        (person) => person.islandId === tile.islandId && person.workQ === tile.q && person.workR === tile.r,
      );
      const need = spec.count - staff.length;
      for (let i = 0; i < need; i += 1) {
        const idle = this.people.find(
          (person) =>
            person.islandId === tile.islandId &&
            person.tribe === (tile.owner === "tribe") &&
            person.role === "villager",
        );
        if (!idle) break;
        idle.workQ = tile.q;
        idle.workR = tile.r;
        this.setRole(idle, spec.role);
      }
    }
  }

  private setSpeed(value: number): void {
    this.speed = value;
    this.syncSpeedButtons();
    this.setHint(value === 0 ? "Time paused." : `Time flowing at ${value}×.`);
  }

  private nudgeSpeed(step: number): void {
    const index = SPEED_STEPS.indexOf(this.speed as (typeof SPEED_STEPS)[number]);
    const next = Math.max(0, Math.min(SPEED_STEPS.length - 1, (index < 0 ? 1 : index) + step));
    this.setSpeed(SPEED_STEPS[next] ?? 1);
  }

  private syncSpeedButtons(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-speed]")) {
      button.classList.toggle("active", Number(button.dataset.speed) === this.speed);
    }
  }

  private syncAutoButton(): void {
    document.querySelector("#auto")?.classList.toggle("active", this.auto);
  }

  private setDirective(directive: Directive): void {
    this.directive = directive;
    document.querySelectorAll<HTMLButtonElement>("[data-directive]").forEach((button) => {
      button.classList.toggle("active", button.dataset.directive === directive);
    });
    this.setHint(`Council directive: ${DIRECTIVE_COPY[directive]}`);
  }

  private setZoom(distance: number): void {
    const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.4, 0.72, 0.55);
    direction.normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
    this.controls.update();
    this.setHint(distance < 120 ? "Local view. Build your settlement tile by tile." : distance < 900 ? "World view. Survey continents and frontiers." : "Space view. Select a planet to learn about it.");
  }

  private setInterfaceVisible(visible: boolean): void {
    document.body.classList.toggle("cinematic", !visible);
    this.setHint(visible ? "Interface restored." : "Cinematic view. Press H to restore the interface.");
  }

  private charterFrontier(): void {
    const snap = this.civSnapshot();
    if (!["Town", "City"].includes(developmentStage(snap.people, snap.buildingTotal))) {
      this.setHint("A frontier charter needs a Town: grow your people and buildings first.");
      return;
    }
    this.setDirective("frontier");
    this.selectBuilding("hut");
    this.setHint("Frontier charter granted. Explore, then place a hut on an unclaimed isle.");
  }

  private sendEnvoy(cooperate: boolean): void {
    const market = [...this.tiles.values()].some((tile) => tile.owner === "player" && tile.building === "market" && tile.ready);
    const society = [...this.societies.values()].sort((a, b) => a.relation - b.relation)[0];
    if (!society) return this.setHint("Discover another society before sending an envoy.");
    if (!market) return this.setHint("A market is needed to send an envoy.");
    if (this.gold < 8) return this.setHint("An envoy needs 8 gold for supplies.");
    this.gold -= 8;
    society.relation = Math.max(-40, Math.min(60, society.relation + (cooperate ? 16 : -14)));
    if (cooperate) {
      society.gold += 5;
      this.mood = Math.min(100, this.mood + 3);
      this.setHint(`A trade pact with ${society.name} deepens your shared prosperity.`);
    } else {
      society.gold += 9;
      this.setHint(`You stake a rival claim against ${society.name}. Their builders will answer.`);
    }
  }

  private civSnapshot(): CivSnapshot {
    const counts = emptyCounts();
    let housing = 0;
    let buildingTotal = 0;
    for (const tile of this.tiles.values()) {
      if (!tile.building || tile.owner === "tribe") continue;
      counts[tile.building] += 1;
      housing += BUILDINGS[tile.building].housing;
      buildingTotal += 1;
    }
    return {
      food: this.food,
      gold: this.gold,
      wood: this.wood,
      mood: this.mood,
      people: this.citizens().length,
      housing,
      counts,
      buildingTotal,
    };
  }

  private techLevel(): number {
    return 1 + Math.floor(Math.sqrt(this.technology / 20));
  }

  private canUseBuilding(id: BuildingId, snap: CivSnapshot): boolean {
    const required: Record<BuildingId, number> = { hut: 1, farm: 1, fishery: 1, lumber: 1, orchard: 2, market: 2, shrine: 2, mine: 3, forge: 4 };
    return isUnlocked(id, snap.people, snap.buildingTotal) && this.techLevel() >= required[id];
  }

  private citizens(): Person[] {
    return this.people.filter((person) => !person.tribe);
  }

  private canSite(id: BuildingId, islandId?: string, treasury?: { gold: number; wood: number }): boolean {
    if (this.findSite(id, islandId) === null) return false;
    const def = BUILDINGS[id];
    const purse = treasury ?? (islandId ? { gold: 0, wood: 0 } : { gold: this.gold, wood: this.wood });
    return purse.gold >= def.goldCost && purse.wood >= def.woodCost;
  }

  private territoryAllows(tile: Tile, owner: "player" | "tribe"): boolean {
    const nearby = [...this.tiles.values()].filter((entry) => entry.owner === owner && entry.islandId === tile.islandId && entry.building && entry.ready);
    if (nearby.length === 0) return owner === "player" && tile.building === null && this.selected === "hut";
    const folk = owner === "player" ? this.citizens().length : this.people.filter((person) => person.tribe && person.islandId === tile.islandId).length;
    const morale = owner === "player" ? this.mood : this.societies.get(tile.islandId)?.mood ?? 40;
    const radius = Math.max(1.7, 1.8 + Math.min(4.5, nearby.length * 0.22 + folk * 0.08 + (morale - 45) * 0.025));
    return nearby.some((entry) => hexDistance(entry.q - tile.q, entry.r - tile.r) <= radius);
  }

  private selectPlanet(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.cosmos.group.children, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object) {
      const name = object.userData.planetName as string | undefined;
      if (name) {
        this.setHint(`${name}: ${String(object.userData.planetCopy)} Zoom in to return to Tidelight's living civilization.`);
        return;
      }
      object = object.parent;
    }
    this.setHint("Select a planet to learn what kind of civilization it could host.");
  }

  private findSite(id: BuildingId, islandId?: string): Tile | null {
    const def = BUILDINGS[id];
    const owner = islandId ? "tribe" : "player";
    const ranked: { tile: Tile; score: number }[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.building || !tile.buildable || !biomeAllows(def, tile.biome) || !this.territoryAllows(tile, owner)) continue;
      if (tile.owner && tile.owner !== owner) continue;
      if (islandId && tile.islandId !== islandId) continue;
      if (!islandId && !this.playerIslands.has(tile.islandId)) continue;
      let score = 80 - hexDistance(tile.q, tile.r) * 1.4;
      if (!islandId && tile.kind === "home") score += 40;
      let adjacent = 0;
      for (const hex of hexNeighbors(tile.q, tile.r)) {
        const next = this.tiles.get(hexKey(hex.q, hex.r));
        if (!next?.building || next.owner !== owner) continue;
        if (islandId && next.islandId !== islandId) continue;
        adjacent += 1;
      }
      score += adjacent * 8;
      if (id === "fishery" && tile.coast) score += 10;
      if (id === "lumber" && tile.wooded) score += 8;
      ranked.push({ tile, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked[0]?.tile ?? null;
  }

  private seedCivilization(): void {
    if (this.seeded) return;
    this.seeded = true;
    const hut = this.findSite("hut");
    if (hut) this.placeBuilding(hut, "hut", { owner: "player", free: true, silent: true });
    const hut2 = this.findSite("hut");
    if (hut2) this.placeBuilding(hut2, "hut", { owner: "player", free: true, silent: true });
    const farm = this.findSite("farm");
    if (farm) this.placeBuilding(farm, "farm", { owner: "player", free: true, silent: true });
    const lumber = this.findSite("lumber");
    if (lumber) this.placeBuilding(lumber, "lumber", { owner: "player", free: true, silent: true });
    const fish = this.findSite("fishery");
    if (fish) this.placeBuilding(fish, "fishery", { owner: "player", free: true, silent: true });
    this.tryFoundSocieties();
    this.seedAnimals();
  }

  private tryFoundSocieties(): void {
    if (this.societies.size >= 10) return;
    const groups = new Map<string, { kind: LandKind; tiles: Tile[] }>();
    for (const tile of this.tiles.values()) {
      const group = groups.get(tile.islandId) ?? { kind: tile.kind, tiles: [] };
      group.tiles.push(tile);
      groups.set(tile.islandId, group);
    }
    for (const [islandId, group] of groups) {
      if (group.kind === "home") this.founded.add(islandId);
    }
    const usedKinds = new Set([...this.societies.values()].map((society) => society.kind));
    const ordered = [...groups.entries()]
      .filter(([, group]) => group.kind !== "home" && group.tiles.length >= 8)
      .filter(([islandId]) => !this.founded.has(islandId))
      .sort((a, b) => {
        const uniqueA = usedKinds.has(a[1].kind) ? 1 : 0;
        const uniqueB = usedKinds.has(b[1].kind) ? 1 : 0;
        if (uniqueA !== uniqueB) return uniqueA - uniqueB;
        const distA = hexDistance(Number(a[0].split(",")[0]), Number(a[0].split(",")[1]));
        const distB = hexDistance(Number(b[0].split(",")[0]), Number(b[0].split(",")[1]));
        if (distA !== distB) return distA - distB;
        return b[1].tiles.length - a[1].tiles.length;
      });
    for (const [islandId, group] of ordered) {
      if (this.societies.size >= 10) break;
      if (usedKinds.has(group.kind)) continue;
      const plan = SOCIETY_PLANS[group.kind];
      if (!plan) continue;
      this.founded.add(islandId);
      usedKinds.add(group.kind);
      const same = [...this.societies.values()].filter((society) => society.kind === group.kind).length;
      const society: Society = {
        islandId,
        kind: group.kind,
        name: same > 0 ? `${SOCIETY_NAMES[group.kind]} ${same + 1}` : SOCIETY_NAMES[group.kind],
        gold: 16 + hash2(group.tiles[0]?.q ?? 1, group.tiles[0]?.r ?? 1) * 12,
        food: 9,
        wood: 7,
      mood: 50,
        stage: "Camp",
        relation: 0,
      };
      this.societies.set(islandId, society);
      const starter = plan.slice(0, Math.min(4, plan.length));
      let placed = 0;
      for (const id of starter) {
        const site = this.findSite(id, islandId);
        if (!site) continue;
        if (this.placeBuilding(site, id, { owner: "tribe", free: true, silent: true, treasury: society })) placed += 1;
      }
      if (placed > 0) {
        this.setHint(`${society.name} keep a camp on the ${group.kind} isle.`);
      }
    }
  }

  private seedAnimals(): void {
    const grass = [...this.tiles.values()].filter((tile) => tile.biome === "grass" || tile.biome === "jungle");
    for (let i = 0; i < 10; i += 1) {
      const tile = grass[Math.floor(hash2(i + 2, 11) * grass.length)];
      if (!tile) continue;
      const mesh = makeSheep();
      const angle = hash2(i, tile.q) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(angle) * 0.28, 0, Math.sin(angle) * 0.28);
      const critter: Critter = {
        mesh,
        q: tile.q,
        r: tile.r,
        destQ: tile.q,
        destR: tile.r,
        progress: 1,
        wait: 0.5 + i * 0.2,
        speed: 0.35 + hash2(i, 3) * 0.2,
        phase: i,
        offset,
      };
      mesh.position.copy(this.tileTop(tile).add(offset));
      mesh.scale.setScalar(1.4);
      this.peopleGroup.add(mesh);
      this.animals.push(critter);
    }
  }

  private hasConstruction(islandId: string, owner: "player" | "tribe"): boolean {
    for (const tile of this.tiles.values()) {
      if (tile.islandId === islandId && tile.owner === owner && tile.buildLeft > 0) return true;
    }
    return false;
  }

  private tryEmergencyFood(): void {
    if (this.hasConstruction("0,0", "player")) return;
    for (const id of ["fishery", "farm", "orchard"] as const) {
      const site = this.findSite(id);
      if (!site) continue;
      if (this.placeBuilding(site, id, { owner: "player", free: true, silent: true })) {
        this.setHint(`Hunger drove a new ${BUILDINGS[id].name.toLowerCase()} from the wild.`);
        return;
      }
    }
  }

  private tryAutoExpand(): void {
    if (this.hasConstruction("0,0", "player")) return;
    const snap = this.civSnapshot();
    const id = chooseNextBuilding(snap, (building) => this.canUseBuilding(building, snap) && this.canSite(building), this.directive);
    if (!id) return;
    const site = this.findSite(id);
    if (!site) return;
    if (this.placeBuilding(site, id, { owner: "player", silent: true })) {
      this.setHint(`The ${eraName(snap.people, snap.buildingTotal).toLowerCase()} starts a ${BUILDINGS[id].name.toLowerCase()}.`);
    }
  }

  private societyTurn = 0;

  private trySocietyExpand(): void {
    const list = [...this.societies.values()];
    if (list.length === 0) return;
    for (let offset = 0; offset < list.length; offset += 1) {
      const society = list[(this.societyTurn + offset) % list.length];
      if (!society || this.hasConstruction(society.islandId, "tribe")) continue;
      let buildingTotal = 0;
      const counts = emptyCounts();
      let housing = 0;
      for (const tile of this.tiles.values()) {
        if (tile.islandId !== society.islandId || tile.owner !== "tribe" || !tile.building) continue;
        counts[tile.building] += 1;
        housing += BUILDINGS[tile.building].housing;
        buildingTotal += 1;
      }
      const people = this.people.filter((person) => person.tribe && person.islandId === society.islandId).length;
      const stage = developmentStage(people, buildingTotal);
      society.stage = stage;
      if (buildingTotal >= 14 + ["Camp", "Hamlet", "Village", "Town", "City"].indexOf(stage) * 7) continue;
      const snap: CivSnapshot = {
        food: society.food,
        gold: society.gold,
        wood: society.wood,
        mood: society.mood,
        people,
        housing,
        counts,
        buildingTotal,
      };
      const id = chooseNextBuilding(snap, (building) => isUnlocked(building, people, buildingTotal) && this.canSite(building, society.islandId, society));
      if (!id) continue;
      const site = this.findSite(id, society.islandId);
      if (!site) continue;
      if (this.placeBuilding(site, id, { owner: "tribe", silent: true, treasury: society })) {
        this.societyTurn += offset + 1;
        this.setHint(`${society.name} starts a ${BUILDINGS[id].name.toLowerCase()}.`);
        return;
      }
    }
  }

  private updateAnimals(dt: number, time: number): void {
    for (const animal of this.animals) {
      if (animal.wait > 0) {
        animal.wait -= dt;
        const here = this.tiles.get(hexKey(animal.q, animal.r));
        if (here) {
          animal.mesh.position.copy(this.tileTop(here).add(animal.offset));
          animal.mesh.position.y += Math.sin(time * 3 + animal.phase) * 0.01;
        }
        if (animal.wait <= 0) {
          const options = hexNeighbors(animal.q, animal.r)
            .map((hex) => this.tiles.get(hexKey(hex.q, hex.r)))
            .filter((tile): tile is Tile => Boolean(tile && (tile.biome === "grass" || tile.biome === "jungle" || tile.biome === "sand")));
          const next = options[Math.floor(Math.random() * options.length)];
          if (next) {
            animal.destQ = next.q;
            animal.destR = next.r;
            animal.progress = 0;
          } else animal.wait = 1.5;
        }
        continue;
      }
      animal.progress += dt * animal.speed;
      const t = Math.min(1, animal.progress);
      const from = this.tiles.get(hexKey(animal.q, animal.r));
      const to = this.tiles.get(hexKey(animal.destQ, animal.destR));
      if (!from || !to) {
        animal.wait = 1;
        continue;
      }
      const pos = this.tileTop(from).add(animal.offset).lerp(this.tileTop(to).add(animal.offset), t);
      pos.y += Math.abs(Math.sin(t * Math.PI)) * 0.03;
      animal.mesh.position.copy(pos);
      const dx = to.mesh.position.x - from.mesh.position.x;
      const dz = to.mesh.position.z - from.mesh.position.z;
      if (dx * dx + dz * dz > 0.0001) animal.mesh.rotation.y = Math.atan2(dx, dz);
      if (t >= 1) {
        animal.q = animal.destQ;
        animal.r = animal.destR;
        animal.wait = 0.8 + Math.random() * 2.2;
      }
    }
  }

  private tickWorld(simDt: number): void {
    const beforeSeason = this.season;
    const beforeYear = yearFromDays(this.simDays);
    this.simDays += simDt / SECONDS_PER_DAY;
    this.season = seasonFromDays(this.simDays);
    const year = yearFromDays(this.simDays);

    if (this.season !== beforeSeason) {
      this.applySeason(this.season);
      this.setHint(
        this.season === "Winter"
          ? "Winter settles in. Fields go still."
          : this.season === "Spring"
            ? "Spring returns. Crops wake up."
            : this.season === "Summer"
              ? "High summer. Farms are busy."
              : "Autumn gold. Harvest while you can.",
      );
    }
    if (year !== beforeYear) {
      this.gold += 6;
      this.wood += 3;
      for (const society of this.societies.values()) {
        society.gold += 4;
        society.wood += 2;
      }
      this.setHint(`Year ${year} begins. Stores are counted and shared.`);
    }

    this.tickConstruction(simDt);

    if (this.simDays >= this.eventUntil && this.event !== "none") {
      this.event = "none";
      this.migrationResolved = false;
    }

    if (this.simDays >= this.weatherUntil) {
      const roll = hash2(Math.floor(this.simDays * 13 + year * 5), Math.floor(this.simDays));
      const next: Weather = roll < 0.52 ? "clear" : roll < 0.8 ? "rain" : "storm";
      this.weatherUntil = this.simDays + 0.35 + roll * 0.65;
      if (next !== this.weather) {
        this.weather = next;
        this.setHint(WEATHER_COPY[next]);
      } else {
        this.weather = next;
      }
      if (roll > 0.92 && this.event === "none") {
        this.event = "drought";
        this.eventUntil = this.simDays + 0.9;
        this.setHint("Drought. The soil cracks and farms slow.");
      } else if (roll < 0.08 && this.event === "none") {
        this.event = "festival";
        this.eventUntil = this.simDays + 0.55;
        this.setHint("A festival night. Mood lifts across the isles.");
      } else if (roll > 0.84 && roll < 0.9 && this.discovered.has("volcano") && this.event === "none") {
        this.event = "ash";
        this.eventUntil = this.simDays + 0.7;
        this.setHint("The volcano breathes ash. Mines run hot.");
      } else if (roll > 0.78 && roll < 0.84 && this.societies.size > 1 && this.event === "none") {
        this.event = "trade";
        this.eventUntil = this.simDays + 0.8;
        this.setHint("Trade winds rise. Markets and ports prosper.");
      } else if (roll > 0.72 && roll < 0.78 && this.event === "none") {
        this.event = "migration";
        this.eventUntil = this.simDays + 0.45;
        this.migrationResolved = false;
        this.setHint("Migrants arrive, looking for safe homes and full stores.");
      } else if (roll > 0.66 && roll < 0.72 && this.event === "none") {
        this.event = "flood";
        this.eventUntil = this.simDays + 0.55;
        this.setHint("Coastal floods sweep in. Fisheries surge while fields struggle.");
      } else if (roll > 0.60 && roll < 0.66 && this.event === "none") {
        this.event = "wildfire";
        this.eventUntil = this.simDays + 0.42;
        this.setHint("Wildfire runs through the wildlands. Lumber slows and spirits fall.");
      }
    }

    const weatherFarm = this.weather === "rain" ? 1.28 : this.weather === "storm" ? 0.82 : 1;
    const drought = this.event === "drought" ? 0.35 : 1;
    const ashFarm = this.event === "ash" ? 0.7 : 1;
    const playerYield = { food: 0, gold: 0, wood: 0 };
    const societyYield = new Map<string, { food: number; gold: number; wood: number }>();
    let housing = 0;
    let happiness = 40;
    let markets = 0;
    for (const tile of this.tiles.values()) {
      if (!tile.building) continue;
      const def = BUILDINGS[tile.building];
      if (tile.owner === "player") {
        housing += def.housing;
        happiness += def.happiness;
        if (tile.building === "market") markets += 1;
      }
      const staff = this.staffFactor(tile);
      if (staff <= 0) continue;
      const work = (staff * simDt) / YEAR_SECONDS;
      let foodGain = 0;
      let goldGain = 0;
      let woodGain = 0;
      if (def.foodPerYear) {
        let yieldMul = 1;
        if (tile.building === "farm") {
          yieldMul = farmSeasonYield(this.season) * weatherFarm * drought * ashFarm;
          if (this.event === "flood") yieldMul *= 0.55;
          if (tile.coast) yieldMul += 0.35;
        }
        if (tile.building === "fishery") {
          yieldMul = this.weather === "storm" ? 0.55 : this.season === "Winter" ? 1.15 : 1;
          if (this.event === "flood") yieldMul *= 1.35;
        }
        if (tile.building === "orchard") {
          yieldMul = farmSeasonYield(this.season) * 0.9 * drought;
        }
        foodGain = def.foodPerYear * yieldMul * work;
      }
      if (def.goldPerYear) {
        let goldMul = tile.biome === "volcanic" && tile.building === "mine" ? 1.45 : 1;
        if (this.event === "ash" && (tile.building === "mine" || tile.building === "forge")) goldMul *= 1.55;
        if (this.event === "trade" && tile.building === "market") goldMul *= 1.7;
        goldGain = def.goldPerYear * goldMul * work;
      }
      if (def.woodPerYear) {
        let woodMul = 1;
        for (const neighbor of hexNeighbors(tile.q, tile.r)) {
          const next = this.tiles.get(hexKey(neighbor.q, neighbor.r));
          if (next?.wooded) woodMul += 0.2;
        }
        woodGain = def.woodPerYear * Math.min(1.8, woodMul) * work;
        if (this.event === "wildfire") woodGain *= 0.35;
      }
      if (tile.owner === "tribe") {
        if (tile.building === specialtyFor(tile.kind)) {
          foodGain *= 1.25;
          goldGain *= 1.25;
          woodGain *= 1.25;
        }
        const bucket = societyYield.get(tile.islandId) ?? { food: 0, gold: 0, wood: 0 };
        bucket.food += foodGain;
        bucket.gold += goldGain;
        bucket.wood += woodGain;
        societyYield.set(tile.islandId, bucket);
      } else {
        playerYield.food += foodGain;
        playerYield.gold += goldGain;
        playerYield.wood += woodGain;
      }
    }

    const folk = this.citizens();
    const alliedTowns = [...this.societies.values()].filter((society) => society.relation >= 16).length;
    if (folk.length > 0 && this.food < 1) happiness -= 18;
    if (folk.length > housing) happiness -= 10;
    if (this.weather === "storm") happiness -= 6;
    if (this.weather === "rain") happiness += 2;
    if (this.event === "festival") happiness += 16;
    if (this.event === "drought") happiness -= 8;
    if (this.event === "wildfire") happiness -= 7;
    const deltaYears = simDt / YEAR_SECONDS;
    const annualProduction = {
      food: playerYield.food / Math.max(deltaYears, 0.000001),
      wood: playerYield.wood / Math.max(deltaYears, 0.000001) + 0.5,
      gold:
        playerYield.gold / Math.max(deltaYears, 0.000001) +
        0.7 +
        markets * (0.8 + this.societies.size * 0.15) +
        (this.event === "trade" ? markets * 2.2 : 0) +
        alliedTowns * markets * 1.25,
    };
    const snap = this.civSnapshot();
    const disruption = this.event === "drought" || this.event === "flood" || this.event === "wildfire" || this.event === "ash"
      ? this.event
      : this.weather === "storm" ? "storm" : "none";
    this.simulation.setStores({ food: this.food, wood: this.wood, gold: this.gold });
    const simulated = this.simulation.advance({
      deltaDays: simDt / SECONDS_PER_DAY,
      population: folk.length,
      housing,
      annualProduction,
      buildings: snap.counts,
      moodPressure: (happiness - 50) / 50,
      disruption,
    });
    if (simulated) {
      this.food = simulated.stores.food;
      this.wood = simulated.stores.wood;
      this.gold = simulated.stores.gold;
      this.technology = simulated.knowledge;
      this.mood = Math.round((simulated.health * 0.45 + simulated.stability * 0.55) * 100);
    }

    if (this.event === "migration" && !this.migrationResolved && this.food > 7 && folk.length < housing) {
      const home = [...this.tiles.values()].find((tile) => tile.owner === "player" && tile.building === "hut" && tile.ready);
      if (home) {
        this.spawnOne(home, "villager");
        this.assignHomes();
        this.assignJobs();
        this.migrationResolved = true;
        this.setHint("A migrant joins the settlement.");
      }
    }

    for (const society of this.societies.values()) {
      const yieldNow = societyYield.get(society.islandId) ?? { food: 0, gold: 0, wood: 0 };
      const tribe = this.people.filter((person) => person.tribe && person.islandId === society.islandId);
      society.food = Math.max(0, society.food + yieldNow.food - (tribe.length * 1.5 * simDt) / YEAR_SECONDS);
      society.gold += yieldNow.gold + (0.4 * simDt) / YEAR_SECONDS;
      if (society.relation <= -14) society.gold += (0.7 * simDt) / YEAR_SECONDS;
      society.wood += yieldNow.wood + (0.35 * simDt) / YEAR_SECONDS;
      let tribeHappiness = 42;
      let tribeHousing = 0;
      for (const tile of this.tiles.values()) {
        if (tile.islandId !== society.islandId || tile.owner !== "tribe" || !tile.building) continue;
        tribeHappiness += BUILDINGS[tile.building].happiness;
        tribeHousing += BUILDINGS[tile.building].housing;
      }
      if (society.food < 1 && tribe.length > 0) tribeHappiness -= 16;
      if (tribe.length > tribeHousing) tribeHappiness -= 10;
      society.mood = Math.max(0, Math.min(100, tribeHappiness));
      society.stage = developmentStage(tribe.length, [...this.tiles.values()].filter(
        (tile) => tile.islandId === society.islandId && tile.owner === "tribe" && tile.building,
      ).length);
      society.gold = Math.min(140, society.gold);
      society.wood = Math.min(90, society.wood);
      society.food = Math.min(55, society.food);
    }

    this.growTimer += simDt;
    if (this.growTimer > SECONDS_PER_DAY * 1.15) {
      this.growTimer = 0;
      this.tryBirths();
    }

    this.hungerTimer += simDt;
    if (this.hungerTimer > SECONDS_PER_DAY * 1.4) {
      this.hungerTimer = 0;
      this.tryHunger();
    }

    this.autoTimer += simDt;
    if (this.auto && this.autoTimer > SECONDS_PER_DAY * 0.45) {
      this.autoTimer = 0;
      if (this.food < 3) this.tryEmergencyFood();
      else this.tryAutoExpand();
    }
    this.societyTimer += simDt;
    if (this.societyTimer > SECONDS_PER_DAY * 0.7) {
      this.societyTimer = 0;
      this.trySocietyExpand();
    }

    this.hudTimer += simDt;
    if (this.hudTimer > 0.25) {
      this.hudTimer = 0;
      this.refreshHud();
    }
  }

  private tickConstruction(simDt: number): void {
    for (const tile of this.tiles.values()) {
      if (!tile.building || tile.buildLeft <= 0 || !tile.buildingMesh) continue;
      tile.buildLeft = Math.max(0, tile.buildLeft - simDt / SECONDS_PER_DAY);
      const done = tile.buildTotal <= 0 ? 1 : 1 - tile.buildLeft / tile.buildTotal;
      tile.buildingMesh.scale.setScalar(0.28 + done * 0.72);
      if (tile.buildLeft <= 0) this.finishBuilding(tile, false);
    }
  }

  private staffFactor(tile: Tile): number {
    if (!tile.building || tile.building === "hut" || tile.buildLeft > 0) return 0;
    const outdoor =
      tile.building === "farm" ||
      tile.building === "orchard" ||
      tile.building === "lumber" ||
      tile.building === "fishery";
    if (outdoor && isNight(hourFromDays(this.simDays))) return 0;
    const workers = this.people.filter(
      (person) => person.islandId === tile.islandId && person.workQ === tile.q && person.workR === tile.r,
    );
    if (workers.length === 0) return 0;
    const present = workers.filter((person) => !person.sleeping && person.q === tile.q && person.r === tile.r).length;
    return 0.12 + 0.88 * (present / workers.length);
  }

  private housingOf(owner: "player" | "tribe", islandId?: string): number {
    let housing = 0;
    for (const tile of this.tiles.values()) {
      if (!tile.building || tile.owner !== owner || tile.buildLeft > 0) continue;
      if (islandId && tile.islandId !== islandId) continue;
      housing += BUILDINGS[tile.building].housing;
    }
    return housing;
  }

  private tryBirths(): void {
    const folk = this.citizens();
    const housing = this.housingOf("player");
    if (this.simulation.snapshot.birthReadiness > 0.34 && folk.length < housing && this.food > 4) {
      const hut = [...this.tiles.values()].find(
        (tile) => tile.building === "hut" && tile.owner === "player" && tile.buildLeft <= 0,
      );
      if (hut) {
        this.spawnOne(hut, "villager");
        this.assignHomes();
        this.setHint("A child of the village came of age.");
        return;
      }
    }
    for (const society of this.societies.values()) {
      const tribe = this.people.filter((person) => person.tribe && person.islandId === society.islandId);
      const homes = this.housingOf("tribe", society.islandId);
      if (society.food <= tribe.length * 1.7 || tribe.length >= homes || society.food <= 4) continue;
      const hut = [...this.tiles.values()].find(
        (tile) =>
          tile.building === "hut" &&
          tile.owner === "tribe" &&
          tile.islandId === society.islandId &&
          tile.buildLeft <= 0,
      );
      if (!hut) continue;
      this.spawnOne(hut, "villager", 0, true);
      this.assignHomes();
      this.setHint(`${society.name} welcomed a new villager.`);
      return;
    }
  }

  private tryHunger(): void {
    if (this.citizens().length > 1 && this.simulation.snapshot.mortalityRisk > 0.58) {
      const gone = this.exileHungry(false);
      if (gone) this.setHint("Poor health and insecurity drove a villager to leave.");
      return;
    }
    for (const society of this.societies.values()) {
      const tribe = this.people.filter((person) => person.tribe && person.islandId === society.islandId);
      if (tribe.length <= 1 || society.food >= 0.5) continue;
      const gone = this.exileHungry(true, society.islandId);
      if (gone) this.setHint(`${society.name} lost a villager to hunger.`);
      return;
    }
  }

  private exileHungry(tribe: boolean, islandId?: string): boolean {
    const person =
      this.people.find(
        (entry) =>
          entry.tribe === tribe &&
          entry.role === "villager" &&
          (islandId ? entry.islandId === islandId : true),
      ) ??
      this.people.find((entry) => entry.tribe === tribe && (islandId ? entry.islandId === islandId : true));
    if (!person) return false;
    this.peopleGroup.remove(person.mesh);
    this.people.splice(this.people.indexOf(person), 1);
    this.assignJobs();
    return true;
  }

  private applySeason(season: Season): void {
    applySeasonPalette(season);
    const winter = season === "Winter" ? 1 : 0;
    const autumn = season === "Autumn" ? 1 : 0;
    for (const tile of this.tiles.values()) {
      if (tile.biome !== "grass" && tile.biome !== "jungle") continue;
      const color = tile.baseTop.clone();
      if (winter) color.lerp(new THREE.Color(0xdfe6dc), 0.55);
      else if (autumn) color.offsetHSL(-0.04, 0.05, 0.04);
      tile.topMat.color.copy(color);
      if (tile.buildingMesh) {
        tile.buildingMesh.traverse((object) => {
          if (!(object instanceof THREE.Mesh) || !object.userData.crop) return;
          object.scale.y = season === "Winter" ? 0.2 : season === "Summer" ? 1.15 : 1;
        });
      }
    }
  }

  private updateLighting(): void {
    if (this.cosmicMode) {
      this.skyDome.visible = false;
      this.sunDisc.visible = false;
      this.moonDisc.visible = false;
      this.scene.background = new THREE.Color(0x02040b);
      if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = 0;
      this.hemi.intensity = 0.18;
      this.fill.intensity = 0.08;
      this.sunLight.intensity = 0.12;
      return;
    }
    this.skyDome.visible = true;
    const hour = hourFromDays(this.simDays);
    const day = daylight(hour);
    const dir = new THREE.Vector3();
    sunFromHour(hour, dir);
    this.sunLight.position.copy(dir).multiplyScalar(42).add(this.controls.target);
    this.sunLight.target.position.copy(this.controls.target);
    this.sunDisc.position.copy(dir).multiplyScalar(110).add(this.controls.target);
    this.moonDisc.position.copy(dir).multiplyScalar(-100).add(this.controls.target);
    this.sunLight.intensity = 0.15 + day * 2.95;
    this.hemi.intensity = 0.12 + day * 0.32;
    this.fill.intensity = 0.05 + day * 0.18;
    this.sunLight.color.set(day > 0.35 ? 0xfff0d2 : 0xffb070);
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.set(day > 0.2 ? 0xffe6b0 : 0xff8148);
    this.sunDisc.visible = dir.y > -0.05;
    this.moonDisc.visible = dir.y < 0.15;
    this.renderer.toneMappingExposure = 0.72 + day * 0.42;
    this.scene.environmentIntensity = 0.12 + day * 0.2;

    const storm = this.weather === "storm" ? 0.22 : this.weather === "rain" ? 0.1 : 0;
    const fog = day > 0.25 ? new THREE.Color().setHSL(0.48, this.visualStyle === "austere" ? 0.1 : 0.22, 0.55 + day * 0.12 - storm * 0.18) : new THREE.Color(this.visualStyle === "radiant" ? 0x10102e : 0x0b1522);
    if (this.event === "ash") fog.lerp(new THREE.Color(0x6a6058), 0.35);
    if (this.event === "drought") fog.lerp(new THREE.Color(0xc4b07a), 0.2);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.density = this.weather === "storm" ? 0.0024 : this.weather === "rain" ? 0.0017 : 0.00115;
    }
    this.scene.background = fog.clone();
    const skyMat = this.skyDome.material as THREE.MeshBasicMaterial;
    const saturation = this.visualStyle === "radiant" ? 1.12 : this.visualStyle === "austere" ? 0.78 : 1;
    skyMat.color.setRGB((0.25 + day * 0.75 - storm) * saturation, (0.28 + day * 0.72 - storm) * saturation, (0.4 + day * 0.6 - storm * 0.4) * saturation);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 0.85 - day * 1.4);

    const nightGlow = (1 - day) * (1 - day);
    for (const object of this.nightLights) {
      const material = object.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.15 + nightGlow * 1.6 + (object.userData.shrineOrb ? 0.35 : 0);
    }
    const waterMat = this.water.mesh.material as THREE.MeshStandardMaterial;
    waterMat.color.set(day > 0.3 ? (this.weather === "storm" ? 0x0e5a62 : 0x14838a) : 0x0a2c38);
    this.sunLight.intensity = (0.15 + day * 2.95) * (this.weather === "storm" ? 0.55 : this.weather === "rain" ? 0.78 : 1);
    this.hemi.intensity = (0.12 + day * 0.32) * (this.weather === "clear" ? 1 : 0.82);
    this.fill.intensity = (0.05 + day * 0.18) * (this.weather === "storm" ? 0.4 : 1);
    this.renderer.toneMappingExposure = (0.72 + day * 0.42) * (this.weather === "storm" ? 0.88 : 1);
    this.clouds.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mat = object.material as THREE.MeshStandardMaterial;
      mat.color.setHex(this.weather === "storm" ? 0x8a94a0 : this.weather === "rain" ? 0xc8d0d8 : 0xfff4e4);
      mat.opacity = this.weather === "clear" ? 0.82 : 0.9;
    });
  }

  private refreshHud(): void {
    const hour = hourFromDays(this.simDays);
    const clock = `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
    const snap = this.civSnapshot();
    const sky =
      this.event === "drought"
        ? "Drought"
        : this.event === "festival"
          ? "Festival"
          : this.event === "ash"
            ? "Ashfall"
            : this.event === "trade"
              ? "Trade winds"
            : this.event === "migration"
                ? "Migration"
                : this.event === "flood"
                  ? "Flood"
                  : this.event === "wildfire"
                    ? "Wildfire"
            : this.weather === "clear"
              ? "Clear"
              : this.weather === "rain"
                ? "Rain"
                : "Storm";
    this.hud.refresh({
      year: yearFromDays(this.simDays), season: this.season, era: eraName(snap.people, snap.buildingTotal),
      clock: `${timeOfDay(hour)} ${clock}`, sky, day: dayOfSeason(this.simDays), gold: this.gold,
      food: this.food, wood: this.wood, mood: this.mood, people: snap.people,
      others: this.people.filter((person) => person.tribe).length, towns: this.societies.size, housing: snap.housing,
      technology: this.techLevel(),
      health: Math.round(this.simulation.snapshot.health * 100),
      land: Math.round(((this.simulation.snapshot.ecology.soil + this.simulation.snapshot.ecology.forest + this.simulation.snapshot.ecology.fish) / 3) * 100),
    });
    if (this.citizens().length > 0 && this.food < 1) this.setHint("The village is hungry. Auto will try a farm or fishery.");
  }

  private setHint(text: string): void {
    this.hud.setHint(text);
  }

  private panCamera(dt: number): void {
    if (this.keys.size === 0) return;
    const facing = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    facing.y = 0;
    if (facing.lengthSq() < 0.0001) facing.set(0, 0, -1);
    facing.normalize();
    const right = new THREE.Vector3(facing.z, 0, -facing.x);
    const delta = new THREE.Vector3();
    const speed = 28 * dt;
    if (this.keys.has("w") || this.keys.has("arrowup")) delta.addScaledVector(facing, speed);
    if (this.keys.has("s") || this.keys.has("arrowdown")) delta.addScaledVector(facing, -speed);
    if (this.keys.has("d") || this.keys.has("arrowright")) delta.addScaledVector(right, speed);
    if (this.keys.has("a") || this.keys.has("arrowleft")) delta.addScaledVector(right, -speed);
    if (delta.lengthSq() === 0) return;
    this.controls.target.add(delta);
    this.camera.position.add(delta);
  }

  private followWorld(): void {
    const t = this.controls.target;
    this.water.mesh.position.x = t.x;
    this.water.mesh.position.z = t.z;
    this.skyDome.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.clouds.position.x = t.x;
    this.clouds.position.z = t.z;
  }

  private updateScaleOfWorld(time: number): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const cosmic = THREE.MathUtils.smoothstep(distance, 340, 680);
    this.cosmicMode = cosmic > 0.35;
    this.cosmos.group.visible = cosmic > 0.01;
    this.cosmos.group.position.copy(this.controls.target);
    this.cosmos.group.children.forEach((child) => {
      if (child !== this.cosmos.planet) child.visible = cosmic > 0.62;
    });
    this.cosmos.planet.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material & { opacity?: number };
      material.opacity = cosmic;
    });
    this.tileGroup.visible = cosmic < 0.98;
    this.peopleGroup.visible = cosmic < 0.98;
    this.clouds.visible = cosmic < 0.75;
    this.water.mesh.visible = cosmic < 0.98;
    this.cosmos.update(time, distance);
  }

  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  /** Catalog animated details once on creation instead of traversing the whole scene every frame. */
  private registerAnimatedObjects(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object.userData.sway) this.swaying.push(object);
      if (object.userData.smokeStack) this.smokeStacks.push(object);
      if (object.userData.shrineOrb) this.shrineOrbs.push(object);
      if (object instanceof THREE.Mesh && object.userData.nightLight) this.nightLights.push(object);
    });
  }

  private tuneQuality(dt: number): void {
    this.qualityTimer += dt;
    this.qualityFrames += 1;
    if (this.qualityTimer < 2) return;
    const fps = this.qualityFrames / this.qualityTimer;
    const next = fps < 48 ? Math.max(1, this.renderScale - 0.2) : fps > 58 ? Math.min(2, this.renderScale + 0.1) : this.renderScale;
    this.qualityTimer = 0;
    this.qualityFrames = 0;
    if (next === this.renderScale) return;
    this.renderScale = next;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.renderScale));
    this.resize();
    this.bloom.enabled = this.renderScale >= 1.25;
  }

  private loop = (): void => {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.08);
    const time = this.clock.elapsedTime;
    const simDt = this.speed === 0 ? 0 : dt * this.speed;

    this.controls.update();
    this.panCamera(dt);
    this.followWorld();
    this.updateScaleOfWorld(time);
    this.ensureWorld();
    this.water.update(time);
    this.life.update(dt, time, this.controls.target, this.weather);
    this.tuneQuality(dt);
    if (simDt > 0) {
      this.tickWorld(simDt);
    }
    this.updateLighting();

    for (const cloud of this.clouds.children) {
      cloud.userData.angle += dt * (cloud.userData.speed as number) * 0.08;
      const radius = cloud.userData.radius as number;
      cloud.position.x = Math.cos(cloud.userData.angle) * radius;
      cloud.position.z = Math.sin(cloud.userData.angle) * radius;
    }

    const gust = this.weather === "storm" ? 0.12 : this.weather === "rain" ? 0.07 : 0.045;
    for (const object of this.swaying) {
      object.rotation.z = Math.sin(time * (this.weather === "storm" ? 2.4 : 1.2) + object.id) * gust;
    }
    for (const object of this.smokeStacks) {
      for (const child of object.children) {
        const i = child.userData.smoke as number | undefined;
        if (i === undefined || !(child instanceof THREE.Mesh)) continue;
        const t = (time * 0.32 + i * 0.33) % 1;
        child.position.set(Math.sin(time * 0.8 + i) * 0.04, t * 0.38, Math.cos(time * 0.6 + i) * 0.03);
        child.scale.setScalar(0.55 + t * 0.9);
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.opacity = (1 - t) * 0.34;
        child.visible = !isNight(hourFromDays(this.simDays)) || t < 0.85;
      }
    }

    for (const tile of this.tiles.values()) {
      const lifted = tile === this.hovered;
      const target = tile.baseY + (lifted ? 0.09 : 0);
      tile.mesh.position.y += (target - tile.mesh.position.y) * Math.min(1, dt * 10);
    }

    if (this.hovered) {
      const top = this.tileTop(this.hovered);
      this.hoverRing.position.copy(top);
      const ringMat = this.hoverRing.material as THREE.LineBasicMaterial;
      ringMat.opacity = 0.65 + Math.sin(time * 4) * 0.25;
      if (this.ghost.visible) this.ghost.position.copy(top);
    }

    for (let i = this.popIns.length - 1; i >= 0; i -= 1) {
      const pop = this.popIns[i];
      pop.t = Math.min(1, pop.t + dt * 3.4);
      const t = pop.t;
      const back = 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
      pop.object.scale.setScalar(Math.max(0.01, back * pop.target));
      if (pop.t >= 1) this.popIns.splice(i, 1);
    }

    this.updatePeople(simDt, time);
    this.updateAnimals(simDt, time);
    for (const object of this.shrineOrbs) {
      object.rotation.y = time * 0.9;
      object.rotation.z = Math.sin(time) * 0.15;
    }

    this.composer.render();
    requestAnimationFrame(this.loop);
  };
}
