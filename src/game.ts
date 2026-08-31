import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { chooseNextBuilding, emptyCounts, eraName, SOCIETY_NAMES, SOCIETY_PLANS, type CivSnapshot } from "./ai";
import { BUILDINGS, biomeAllows, type BuildingId } from "./buildings";
import { hash2, hexDistance, hexesInRadius, hexKey, hexNeighbors, hexToWorld, worldToHex } from "./hex";
import {
  createClouds,
  createEnvironment,
  createSky,
  createSkyDome,
  createStars,
  createWater,
  sunFromHour,
  type WaterSystem,
} from "./look";
import {
  applySeasonPalette,
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
import { DISCOVER_COPY, UNLOAD_RADIUS, VIEW_RADIUS, sampleWorld, styleForKind, type Biome, type LandKind, type Terrain, type WorldSample } from "./world";
import { Hud } from "./ui";
import { developmentStage, isUnlocked, specialtyFor, type DevelopmentStage } from "./civilization";
import { goalCopy, type SimulationConfig } from "./config";
import { createCosmicSystem, type CosmicSystem } from "./cosmos";
import { DIRECTIVE_COPY, directivesFromText, speedFromText, yearsFromText, type Directive } from "./directive";
import { institutionEffects } from "./simulation/institutions.ts";
import { innovationEffects } from "./simulation/innovation.ts";
import { SimulationClient } from "./simulation/client.ts";
import type { CulturalState, CultureTraits, RegionSimulationInput, SimulationInputs } from "./simulation/types.ts";
import type { EvolutionEra } from "./simulation/evolution.ts";
import { exchangeRegions, type NetworkConnection, type NetworkRegion } from "./simulation/network.ts";
import { forkCulture, shouldSocietyCollapse, shouldSocietyFragment } from "./simulation/lineage.ts";
import { createWorldManifest, serializeExperiment, type WorldManifest } from "./simulation/manifest.ts";
import { classifyChronicleEvent, EventChronicle } from "./simulation/chronicle.ts";
import { HouseholdSystem, inheritBehavioralStrategy, initialBehavioralStrategy, type BehavioralStrategy, type HouseholdMetrics } from "./simulation/households.ts";
import { settleShipment } from "./simulation/market.ts";
import { resolveConflict } from "./simulation/conflict.ts";
import { advanceDiplomaticChannel, channelSupportsContact, channelSupportsTrade, createDiplomaticChannel, dispatchMessage, type DiplomaticChannel, type DiplomaticMessageKind } from "./simulation/diplomacy.ts";
import { advanceRegionalRelation, createRegionalRelation, regionalRelationMode, type RegionalRelation } from "./simulation/interregional.ts";
import { TerrainChunks } from "./terrain-chunks";
import { WorldState } from "./world-state";
import type { HistoryLayer, HistoryMark, TerritorialClaim } from "./world-state";
import { createSpacecraftSystem, type SpacecraftSystem } from "./spacecraft";
import { createSubatomicSystem, type SubatomicSystem } from "./subatomic";
import { originProfile, type OriginProfile } from "./origins";
import { SeededRandom } from "./simulation/random.ts";

type CatastropheState = {
  kind: "earthquake" | "eruption" | "meteorite" | "tsunami" | "locusts";
  epicenterQ: number;
  epicenterR: number;
  radius: number;
  intensity: number;
  startDay: number;
  durationDays: number;
  buildingsDestroyed: number;
  resolved: boolean;
} | null;

type Person = {
  id: string;
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
  age: number;
  strategy: BehavioralStrategy;
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
  knowledge: number;
  populationCapacity: number;
  migrationPressure: number;
  era: EvolutionEra;
  culture: CulturalState;
  culturalInfluence: Partial<CultureTraits>;
  diplomacy: DiplomaticChannel;
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

type TradeRoute = {
  societyId: string;
  boat: THREE.Group;
  progress: number;
  direction: 1 | -1;
  delivered: boolean;
};

type CommunicationLink = {
  source: THREE.Vector3;
  destination: THREE.Vector3;
  line: THREE.Line;
  pulse: THREE.Mesh;
  mode: "parley" | "trade";
};

type District = "homes" | "fields" | "works" | "civic" | "harbor";
type ObserverLens = "settlement" | "fields" | "citizen" | "society" | "network";
type ObservatoryView = "world" | "universe" | "subatomic";

type WorldEvent = "none" | "festival" | "drought" | "ash" | "trade" | "migration" | "flood" | "wildfire";
type CivilizationGoal = SimulationConfig["goal"] | "knowledge" | "network";

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

const DISTRICT_FOR_BUILDING: Record<BuildingId, District> = {
  hut: "homes", farm: "fields", orchard: "fields", lumber: "works", mine: "works", forge: "works", shrine: "civic", market: "civic", fishery: "harbor",
};
const DISTRICT_OFFSETS: Record<District, readonly [number, number]> = {
  homes: [0, 0], fields: [-4, 3], works: [4, -3], civic: [2, 2], harbor: [-2, -4],
};
const EVOLUTION_RANK: Record<EvolutionEra, number> = { Camp: 0, Agrarian: 1, Maritime: 2, Civic: 3, Industrial: 4, Adaptive: 5, Orbital: 5 };
const BUILDING_ERA: Record<BuildingId, EvolutionEra> = {
  hut: "Camp", farm: "Camp", lumber: "Camp", fishery: "Camp", orchard: "Agrarian", shrine: "Agrarian", market: "Agrarian", mine: "Maritime", forge: "Civic",
};
const BUILDING_TECH: Record<BuildingId, number> = { hut: 1, farm: 1, fishery: 1, lumber: 1, orchard: 2, market: 2, shrine: 2, mine: 3, forge: 4 };

const WEATHER_COPY: Record<Weather, string> = {
  clear: "Skies clear. Good traveling weather.",
  overcast: "Cloud cover settles in. The air is cool, but travel is still open.",
  rain: "Rain on the fields. Crops drink deep.",
  storm: "A storm rolls in. People slow, seas rise.",
};

const HEX_SIZE = 1;
const VIEW_OFFSETS = hexesInRadius(VIEW_RADIUS);
const SPACECRAFT_DECK = hexesInRadius(10);

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
  terrain: Terrain;
  buildable: boolean;
  coast: boolean;
  wooded: boolean;
  owner: "player" | "tribe" | null;
  territory: TerritorialClaim;
  claimant: string | null;
  contestedWith: string | null;
  kind: LandKind;
  islandId: string;
  buildLeft: number;
  buildTotal: number;
  ready: boolean;
  historyMesh: THREE.Group | null;
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
  private readonly worldState: WorldState;
  private readonly terrainChunks: TerrainChunks;
  private readonly roadGroup = new THREE.Group();
  private readonly roadEdges = new Map<string, THREE.Group>();
  private readonly tradeGroup = new THREE.Group();
  private readonly tradeRoutes = new Map<string, TradeRoute>();
  private readonly communicationGroup = new THREE.Group();
  private readonly communicationLinks = new Map<string, CommunicationLink>();
  private readonly regionalRelations = new Map<string, RegionalRelation>();
  private readonly activityLog: string[] = [];
  private readonly water: WaterSystem;
  private readonly clouds: THREE.Group;
  private readonly cosmos: CosmicSystem;
  private readonly spacecraft: SpacecraftSystem | null;
  private readonly subatomic: SubatomicSystem;
  private readonly popIns: { object: THREE.Object3D; t: number; target: number }[] = [];
  private readonly swaying: THREE.Object3D[] = [];
  private readonly smokeStacks: THREE.Object3D[] = [];
  private readonly shrineOrbs: THREE.Object3D[] = [];
  private readonly nightLights: THREE.Mesh[] = [];
  private readonly peopleGroup = new THREE.Group();
  private readonly people: Person[] = [];
  private readonly households = new HouseholdSystem();
  private householdMetrics: HouseholdMetrics | null = null;
  private personSerial = 0;
  private readonly hexGeo = makeHexColumn();
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
  private simDays = 0.4;
  /** Observer time deliberately advances at a fixed visual pace. */
  private visualDays = 0.4;
  private weatherDays = 0.4;
  private speed = 1;
  private season: Season = "Spring";
  private visualSeason: Season = "Spring";
  private gold = 72;
  private food = 22;
  private wood = 16;
  private mood = 52;
  private technology = 0;
  private hullIntegrity = 97;
  private culturalInfluence: Partial<CultureTraits> = {};
  private playerDiseaseImport = 0;
  private readonly societyDiseaseImport = new Map<string, number>();
  private weather: Weather = "clear";
  private weatherUntil = 1.1;
  private readonly weatherPace: number;
  private event: WorldEvent = "none";
  private eventUntil = 0;
  private goal: CivilizationGoal;
  private goalTier = 1;
  private migrationResolved = false;
  private readonly auto = true;
  private directive: Directive = "balanced";
  private directiveQueue: Directive[] = [];
  private autoTimer = 0;
  private societyTimer = 0;
  private diplomacyTimer = 0;
  private regionalNetworkTimer = 0;
  private lifecycleTimer = 0;
  private readonly fragmentationCooldown = new Map<string, number>();
  private readonly conflictCooldown = new Map<string, number>();
  private readonly fallenLineages = new Map<string, CulturalState>();
  private readonly renewalUntil = new Map<string, number>();
  private societyLensIndex = 0;
  private growTimer = 0;
  private hungerTimer = 0;
  private seeded = false;
  private readonly founded = new Set<string>();
  private readonly societies = new Map<string, Society>();
  private readonly animals: Critter[] = [];
  private readonly life = new LivingWorld();
  private running = true;
  private hudTimer = 0;
  private renderScale = 1.5;
  private qualityTimer = 0;
  private qualityFrames = 0;
  private cosmicMode = false;
  private observatoryView: ObservatoryView = "world";
  private readonly visualStyle: SimulationConfig["visualStyle"];
  private readonly origin: SimulationConfig["origin"];
  private readonly originProfile: OriginProfile;
  private readonly spacecraftMode: boolean;
  private readonly simulation: SimulationClient;
  private readonly manifest: WorldManifest;
  private readonly chronicle: EventChronicle;
  private readonly directiveHistory: string[] = [];
  private lastSimulationInputs: SimulationInputs | null = null;
  private lastRegionalSnapshots: ReadonlyMap<string, Readonly<import("./simulation/types.ts").SimulationSnapshot>> = new Map();
  private lastOriginCrisis: string | null = null;
  private readonly gameRandom!: SeededRandom;
  private catastrophe: CatastropheState | null = null;
  private lastEruptionDay = -Infinity;
  private pointerDown: { x: number; y: number } | null = null;
  private readonly navigationKeys = new Set<string>();
  private observerMove: {
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    progress: number;
    observatoryView?: ObservatoryView;
  } | null = null;

  constructor(canvas: HTMLCanvasElement, config: SimulationConfig) {
    this.canvas = canvas;
    this.visualStyle = config.visualStyle;
    this.origin = config.origin;
    this.originProfile = originProfile(config.origin);
    this.manifest = createWorldManifest(config);
    this.chronicle = new EventChronicle();
    this.gameRandom = new SeededRandom(config.seed ^ 0x47414d45);
    this.spacecraftMode = config.origin === "spacecraft";
    this.worldState = new WorldState(config.seed, config.archetype);
    this.weatherPace = config.temperament === "calm" ? 1.65 : config.temperament === "wild" ? 0.72 : 1;
    this.terrainChunks = new TerrainChunks(this.worldState, 31, 148, this.visualStyle);
    const baseStores = config.resources === "lean" ? { gold: 36, food: 12, wood: 8 } : config.resources === "abundant" ? { gold: 120, food: 40, wood: 32 } : { gold: 72, food: 22, wood: 16 };
    const startingStores = {
      gold: baseStores.gold + this.originProfile.storeBonus.gold,
      food: baseStores.food + this.originProfile.storeBonus.food,
      wood: baseStores.wood + this.originProfile.storeBonus.wood,
    };
    this.gold = startingStores.gold;
    this.food = startingStores.food;
    this.wood = startingStores.wood;
    this.mood = this.originProfile.startingMood;
    this.goal = config.goal;
    this.speed = config.speed;
    this.technology = Math.max(config.technology === "advanced" ? 90 : config.technology === "developing" ? 30 : 0, this.originProfile.knowledgeFloor);
    this.simulation = new SimulationClient(config.seed, startingStores, this.technology);
    this.weatherUntil = this.weatherDays + 0.75 * this.weatherPace;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, this.spacecraftMode ? 0 : 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.renderScale));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.4, 9000);
    this.camera.position.set(105, 170, 190);

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
    this.subatomic = createSubatomicSystem(config.seed);
    this.scene.add(this.subatomic.group);
    this.spacecraft = this.spacecraftMode ? createSpacecraftSystem() : null;
    if (this.spacecraft) this.scene.add(this.spacecraft.group);
    this.scene.add(this.roadGroup);
    this.scene.add(this.terrainChunks.group);
    this.scene.add(this.tileGroup);
    this.scene.add(this.tradeGroup);
    this.scene.add(this.communicationGroup);
    this.scene.add(this.peopleGroup);
    this.scene.add(this.life.group);
    if (this.spacecraftMode) {
      this.camera.position.set(23, 28, 30);
      this.controls.target.set(0, 0, 0);
      this.terrainChunks.group.visible = false;
      this.water.mesh.visible = false;
      this.clouds.visible = false;
      this.life.group.visible = false;
    }
    this.ensureWorld();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.05, 0.2, 0.94);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.bindUi();
    this.bindObserverNavigation();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    applySeasonPalette(this.season);
    this.updateLighting();
    this.seedCivilization();
    this.captureChronicleCheckpoint();
    this.refreshHud();
    (window as unknown as { game: Game }).game = this;
    this.setHint(`${goalCopy(config.goal)} Write “speed 2×” or “pause time” to set the observer pace.`);
    this.loop();
  }

  private ensureWorld(): void {
    if (this.spacecraftMode) {
      this.ensureSpacecraftDeck();
      return;
    }
    const focus = worldToHex(this.controls.target.x, this.controls.target.z, HEX_SIZE);
    const focusKey = `${Math.round(focus.q / 3)},${Math.round(focus.r / 3)}`;
    const first = this.tiles.size === 0;
    if (!first && focusKey === this.lastFocus) return;
    this.lastFocus = focusKey;

    for (const offset of VIEW_OFFSETS) {
      const q = focus.q + offset.q;
      const r = focus.r + offset.r;
      if (this.tiles.has(hexKey(q, r))) continue;
      const sample = this.worldState.sample(q, r);
      if (!sample) continue;
      this.stampTile(q, r, sample);
      if (!this.discovered.has(sample.kind)) {
        this.discovered.add(sample.kind);
        this.setHint(DISCOVER_COPY[sample.kind]);
      }
    }
    this.terrainChunks.update(focus.q, focus.r);
    this.pruneWorld(focus.q, focus.r);
    if (this.seeded) this.tryFoundSocieties();
  }

  /** The orbital scenario uses a finite, sealed hex deck rather than a procedural planet. */
  private ensureSpacecraftDeck(): void {
    if (this.tiles.size > 0) return;
    for (const offset of SPACECRAFT_DECK) {
      const distance = hexDistance(offset.q, offset.r);
      const sample: WorldSample = {
        land: true,
        kind: "metro",
        biome: distance < 3 ? "urban" : "plaza",
        height: 0.42,
        terrain: "plain",
        coast: false,
        buildable: distance < 9,
        landmark: "none",
        islandId: "0,0",
      };
      this.stampTile(offset.q, offset.r, sample);
    }
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

    if (this.spacecraftMode) {
      tint.setHSL(sample.biome === "urban" ? 0.58 : 0.56, 0.13, sample.biome === "urban" ? 0.24 + n * 0.04 : 0.37 + n * 0.04);
      cliff.color.setHex(0x1b2632);
    } else

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
    this.applyVisualStyle(tint, cliff.color);
    this.applyOriginLandscapeStyle(tint, cliff.color);
    const stored = this.worldState.tile(q, r);

    const top =
      sample.landmark === "vent"
        ? makeLavaMaterial()
        : sample.biome === "urban" || sample.biome === "plaza"
          ? makePavementMaterial(tint)
          : sample.biome === "sand" || sample.biome === "desert"
            ? makeSandMaterial(tint)
            : makeGrassMaterial(tint);
    this.applyTerritoryColor(top.color, stored.owner, stored.territory);
    const bottom = new THREE.MeshStandardMaterial({ color: this.spacecraftMode ? 0x101923 : 0x3d2a1c, roughness: this.spacecraftMode ? 0.52 : 1, metalness: this.spacecraftMode ? 0.45 : 0, flatShading: true });
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
    if (!decor && sample.terrain === "mountain") {
      decor = this.makeMountainDecor(sample.biome === "snow");
    } else if (!decor && sample.biome === "jungle" && n > 0.28) {
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
      terrain: sample.terrain,
      buildable: sample.buildable,
      coast: sample.coast,
      wooded,
      owner: stored.owner,
      territory: stored.territory,
      claimant: stored.claimant,
      contestedWith: stored.contestedWith,
      kind: sample.kind,
      islandId: sample.islandId,
      buildLeft: 0,
      buildTotal: 0,
      ready: false,
      historyMesh: null,
    });
    const tile = this.tiles.get(hexKey(q, r)) as Tile;
    this.paintStratigraphy(tile, stored.history);
    if (stored.building) this.restoreBuilding(tile, stored);
  }

  private applyVisualStyle(top: THREE.Color, cliff: THREE.Color): void {
    if (this.visualStyle === "austere") {
      top.lerp(new THREE.Color(0x60747a), 0.32).offsetHSL(0, -0.18, -0.05);
      cliff.lerp(new THREE.Color(0x454c50), 0.32).offsetHSL(0, -0.14, -0.04);
    } else if (this.visualStyle === "radiant") {
      top.offsetHSL(0.015, 0.16, 0.09);
      cliff.offsetHSL(-0.01, 0.12, 0.045);
    }
  }

  /** A scenario's material inheritance is readable before any HUD value is. */
  private applyOriginLandscapeStyle(top: THREE.Color, cliff: THREE.Color): void {
    if (this.spacecraftMode) return;
    if (this.origin === "camp") {
      top.lerp(new THREE.Color(0x8a7547), 0.12);
      cliff.lerp(new THREE.Color(0x66503b), 0.14);
    } else if (this.origin === "farmers") {
      top.lerp(new THREE.Color(0x6e9a48), 0.16).offsetHSL(0.01, 0.04, 0.015);
      cliff.lerp(new THREE.Color(0x8b7040), 0.1);
    } else if (this.origin === "city") {
      top.lerp(new THREE.Color(0x71818b), 0.23).offsetHSL(-0.015, -0.08, -0.02);
      cliff.lerp(new THREE.Color(0x625d58), 0.22);
    }
  }

  private applyTerritoryColor(color: THREE.Color, owner: Tile["owner"], territory: TerritorialClaim = "none"): void {
    if (territory === "contested") {
      color.lerp(new THREE.Color(0xe2ad45), 0.46);
      return;
    }
    if (territory === "memory") {
      color.lerp(new THREE.Color(0x876ca0), 0.3);
      return;
    }
    if (owner === "player") color.lerp(new THREE.Color(0x4aa9d6), territory === "sovereignty" ? 0.3 : 0.18);
    if (owner === "tribe") color.lerp(new THREE.Color(0xc86d5a), territory === "sovereignty" ? 0.3 : 0.18);
  }

  private claimantFor(tile: Tile): string | null {
    if (tile.owner === "player") return "player";
    return tile.owner === "tribe" ? tile.islandId : null;
  }

  private paintTerritory(tile: Tile): void {
    const color = tile.baseTop.clone();
    this.applyTerritoryColor(color, tile.owner, tile.territory);
    tile.topMat.color.copy(color);
  }

  /** Render the durable residue of previous land use as low, translucent
   * marks: field contours, erosion, abandoned foundations and route traces. */
  private paintStratigraphy(tile: Tile, history: HistoryLayer): void {
    if (tile.historyMesh) tile.mesh.remove(tile.historyMesh);
    const layer = new THREE.Group();
    const addDisc = (radius: number, color: number, opacity: number) => {
      const mark = new THREE.Mesh(new THREE.CircleGeometry(radius, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.y = 0.507;
      layer.add(mark);
    };
    if (history.cultivation > 0.03) {
      for (const radius of [0.24, 0.4]) {
        const contour = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.025, 6), new THREE.MeshBasicMaterial({ color: 0xb38b47, transparent: true, opacity: history.cultivation * 0.38, depthWrite: false, side: THREE.DoubleSide }));
        contour.rotation.x = -Math.PI / 2;
        contour.position.y = 0.509;
        layer.add(contour);
      }
    }
    if (history.erosion > 0.03) addDisc(0.34, 0x473228, history.erosion * 0.32);
    if (history.abandonment > 0.03) {
      const footprint = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.32, 4), new THREE.MeshBasicMaterial({ color: 0x9d86a5, transparent: true, opacity: history.abandonment * 0.44, depthWrite: false, side: THREE.DoubleSide }));
      footprint.rotation.x = -Math.PI / 2;
      footprint.rotation.z = Math.PI / 4;
      footprint.position.y = 0.511;
      layer.add(footprint);
    }
    if (history.trade > 0.03) {
      const route = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.455, 6), new THREE.MeshBasicMaterial({ color: 0xd8aa55, transparent: true, opacity: history.trade * 0.36, depthWrite: false, side: THREE.DoubleSide }));
      route.rotation.x = -Math.PI / 2;
      route.position.y = 0.513;
      layer.add(route);
    }
    if (layer.children.length === 0) return;
    tile.historyMesh = layer;
    tile.mesh.add(layer);
  }

  private recordStratigraphy(tile: Tile, mark: HistoryMark, amount: number): void {
    this.paintStratigraphy(tile, this.worldState.markHistory(tile.q, tile.r, mark, amount));
  }

  private recordRegionalStratigraphy(id: string, mark: HistoryMark, amount: number): void {
    const tile = id === "player"
      ? [...this.tiles.values()].find((candidate) => candidate.owner === "player" && candidate.ready)
      : [...this.tiles.values()].find((candidate) => candidate.islandId === id && candidate.owner === "tribe" && candidate.ready);
    if (tile) this.recordStratigraphy(tile, mark, amount);
  }

  private restoreBuilding(tile: Tile, stored: import("./world-state").StoredTile): void {
    if (!stored.building || !stored.owner) return;
    tile.building = stored.building;
    tile.owner = stored.owner;
    tile.buildLeft = stored.buildLeft;
    tile.buildTotal = stored.buildTotal;
    tile.ready = stored.ready;
    if (tile.decor) {
      tile.mesh.remove(tile.decor);
      tile.decor = null;
    }
    tile.buildingMesh = makeBuilding(stored.building, this.architectureFor(tile));
    tile.buildingMesh.position.y = 0.5;
    const built = stored.ready || stored.buildTotal <= 0 ? 1 : Math.max(0.28, 1 - stored.buildLeft / stored.buildTotal);
    tile.buildingMesh.scale.setScalar(built);
    tile.mesh.add(tile.buildingMesh);
    this.registerAnimatedObjects(tile.buildingMesh);
    if (tile.ready) {
      this.markRoads(tile);
      this.attachPort(tile);
    }
  }

  private makeMountainDecor(snowCapped: boolean): THREE.Group {
    const mountain = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: snowCapped ? 0x74777a : 0x66574b, roughness: 1, flatShading: true });
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.05, 5), rock);
    peak.position.y = 0.5;
    peak.rotation.y = Math.PI * 0.18;
    mountain.add(peak);
    if (snowCapped) {
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(0.27, 0.32, 5),
        new THREE.MeshStandardMaterial({ color: 0xe7edf0, roughness: 0.95, flatShading: true }),
      );
      snow.position.y = 1.02;
      snow.rotation.y = peak.rotation.y;
      mountain.add(snow);
    }
    mountain.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return mountain;
  }

  private bindUi(): void {
    document.querySelector<HTMLFormElement>("#directive-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>("#directive-input");
      const text = input?.value ?? "";
      const years = yearsFromText(text);
      if (years !== null) this.advanceDeepTime(years);
      const pace = speedFromText(text);
      if (pace !== null) this.setObserverSpeed(pace);
      const directives = directivesFromText(text);
      const directive = directives[0];
      if (directive) {
        this.directiveQueue = directives.slice(1);
        this.setDirective(directive, text);
      } else if (pace === null) {
        this.setHint("Try asking for food, growth, trade, culture, frontier, balance, or a time pace.");
      }
      if (input) input.value = "";
    });
    document.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((button) => {
      button.addEventListener("click", () => this.setZoom(Number(button.dataset.zoom)));
    });
    document.querySelectorAll<HTMLButtonElement>("[data-observatory-view]").forEach((button) => {
      button.addEventListener("click", () => this.setObservatoryView(button.dataset.observatoryView as ObservatoryView));
    });
    document.querySelector<HTMLButtonElement>("#advance-century")?.addEventListener("click", () => this.advanceCenturyStep());
    document.querySelector<HTMLButtonElement>("#recenter-view")?.addEventListener("click", () => this.recenterObserver());
    const speedSelector = document.querySelector<HTMLSelectElement>("#speed-selector");
    if (speedSelector) {
      speedSelector.value = String(this.speed);
      speedSelector.addEventListener("change", () => this.setObserverSpeed(Number(speedSelector.value)));
    }
    document.querySelector<HTMLSelectElement>("#lens-selector")?.addEventListener("change", (event) => {
      this.setObserverLens((event.target as HTMLSelectElement).value as ObserverLens);
    });
    document.querySelector<HTMLButtonElement>("#export-manifest")?.addEventListener("click", () => this.downloadManifest());
  }

  private downloadManifest(): void {
    const manifest = createWorldManifest(this.manifest.config, this.directiveHistory);
    const payload = serializeExperiment({
      manifest,
      definition: {
        stores: { food: this.food, wood: this.wood, gold: this.gold },
        knowledge: this.technology,
        inputs: this.lastSimulationInputs ?? {
          population: this.citizens().length,
          housing: this.housingOf("player"),
          annualProduction: { food: 0, wood: 0, gold: 0 },
          buildings: emptyCounts(),
          moodPressure: 0,
          infrastructure: { roads: 0, ports: 0, tradeRoutes: 0 },
          disruption: "none",
        },
        years: 0,
        checkpointEvery: 1,
      },
      events: this.chronicle.getEvents(),
      checkpoints: this.chronicle.getCheckpoints().length > 0
        ? this.chronicle.getCheckpoints()
        : [{ year: yearFromDays(this.simDays), snapshot: structuredClone(this.simulation.snapshot) }],
    });
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${manifest.id}-checkpoint.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.setHint("Saved a reproducible world manifest and current simulation checkpoint.");
  }

  /** Pointer navigation changes only the observer's point of view. It never
   * selects, moves, or constructs anything in the simulated world. */
  private bindObserverNavigation(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    this.canvas.addEventListener("pointerup", (event) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (event.button !== 0 || !down) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) return;
      this.focusClickedTile(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("pointerleave", () => { this.pointerDown = null; });
    window.addEventListener("keydown", (event) => {
      if (!event.key.startsWith("Arrow") || this.isTyping()) return;
      this.navigationKeys.add(event.key);
      this.observerMove = null;
      event.preventDefault();
    });
    window.addEventListener("keyup", (event) => {
      if (!event.key.startsWith("Arrow")) return;
      this.navigationKeys.delete(event.key);
      event.preventDefault();
    });
  }

  private isTyping(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  }

  private focusClickedTile(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.observatoryView === "universe") {
      this.focusClickedPlanet();
      return;
    }
    if (this.cosmicMode || !this.tileGroup.visible) return;
    const hit = this.raycaster.intersectObjects(this.tileGroup.children, true)[0];
    if (hit) {
      let object: THREE.Object3D | null = hit.object;
      while (object && (typeof object.userData.q !== "number" || typeof object.userData.r !== "number")) object = object.parent;
      const tile = object ? this.tiles.get(hexKey(object.userData.q as number, object.userData.r as number)) : undefined;
      if (tile) {
        this.travelObserverTo(this.tileTop(tile));
        const society = tile.owner === "tribe" ? this.societies.get(tile.islandId) : null;
        const place = society?.name ?? (tile.owner === "player" ? "the home settlement" : DISCOVER_COPY[tile.kind]);
        this.setHint(`Observer traveling to ${place}.`);
        return;
      }
    }
    // Empty water and deck space are navigable too, so a click always means
    // “move the observer here” rather than only “select a rendered tile.”
    const target = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), target)) return;
    this.travelObserverTo(target);
    this.setHint("Observer traveling to the selected viewpoint.");
  }

  /** Universe clicks are visits: bodies can be inspected closely without
   * pretending that their separate societies are part of this world's model. */
  private focusClickedPlanet(): void {
    const hits = this.raycaster.intersectObjects(this.cosmos.group.children, true);
    let body: THREE.Object3D | null = null;
    for (const hit of hits) {
      let candidate: THREE.Object3D | null = hit.object;
      while (candidate && typeof candidate.userData.planetName !== "string") candidate = candidate.parent;
      if (candidate) {
        body = candidate;
        break;
      }
    }
    if (!body) {
      this.setHint("Choose a labeled planet to visit, or use World to return to Tidelight.");
      return;
    }
    const center = body.getWorldPosition(new THREE.Vector3());
    const radius = Number(body.userData.radius ?? 28);
    const direction = new THREE.Vector3().subVectors(this.camera.position, center);
    if (direction.lengthSq() < 0.001) direction.set(1.5, 0.8, 2.4);
    direction.normalize();
    this.observerMove = {
      fromTarget: this.controls.target.clone(),
      toTarget: center,
      fromPosition: this.camera.position.clone(),
      toPosition: center.clone().addScaledVector(direction, radius * 3.5),
      progress: 0,
    };
    const name = String(body.userData.planetName);
    const copy = String(body.userData.planetCopy ?? "An uncharted neighboring world.");
    const readout = document.querySelector("#planet-readout");
    if (readout) readout.textContent = `Visiting ${name} · ${copy}`;
    this.setHint(`Observer traveling to ${name}. ${copy} Its civilization is not yet simulated, but its world can be observed here.`);
  }

  private travelObserverTo(target: THREE.Vector3): void {
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length(), 18, this.spacecraftMode ? 64 : 180);
    if (offset.lengthSq() < 0.001) offset.set(0.45, 0.7, 0.55);
    offset.normalize();
    this.observerMove = {
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      fromPosition: this.camera.position.clone(),
      toPosition: target.clone().addScaledVector(offset, distance),
      progress: 0,
    };
  }

  private advanceObserverMove(dt: number): void {
    const move = this.observerMove;
    if (!move) return;
    move.progress = Math.min(1, move.progress + dt / 0.62);
    const eased = move.progress * move.progress * (3 - 2 * move.progress);
    this.controls.target.lerpVectors(move.fromTarget, move.toTarget, eased);
    this.camera.position.lerpVectors(move.fromPosition, move.toPosition, eased);
    if (move.progress >= 1) {
      this.observerMove = null;
      if (move.observatoryView) {
        this.observatoryView = move.observatoryView;
        this.refreshViewReadout();
      }
    }
  }

  private moveObserverWithArrows(dt: number): void {
    if (this.navigationKeys.size === 0) return;
    const forward = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const direction = new THREE.Vector3();
    if (this.navigationKeys.has("ArrowUp")) direction.add(forward);
    if (this.navigationKeys.has("ArrowDown")) direction.sub(forward);
    if (this.navigationKeys.has("ArrowRight")) direction.add(right);
    if (this.navigationKeys.has("ArrowLeft")) direction.sub(right);
    if (direction.lengthSq() === 0) return;
    const distance = this.camera.position.distanceTo(this.controls.target);
    direction.normalize().multiplyScalar(dt * THREE.MathUtils.clamp(distance * 0.28, 18, 120));
    this.controls.target.add(direction);
    this.camera.position.add(direction);
  }

  private setObserverSpeed(value: number): void {
    if (![0, 1, 2, 4, 8, 96].includes(value)) return;
    this.speed = value;
    const selector = document.querySelector<HTMLSelectElement>("#speed-selector");
    if (selector) selector.value = String(value);
    this.setHint(value === 0 ? "The observer paused time." : value === 96 ? "The observer selected years pace." : `The observer set time to ${value}×.`);
  }

  private setObserverLens(lens: ObserverLens): void {
    const playerTiles = [...this.tiles.values()].filter((tile) => tile.owner === "player" && tile.ready);
    const frame = (tile: Tile, distance: number, message: string) => {
      this.frameObserver(this.tileTop(tile), distance);
      this.setHint(message);
    };
    if (lens === "settlement") {
      const home = playerTiles.find((tile) => tile.building === "hut") ?? playerTiles[0];
      if (home) frame(home, 48, "Settlement lens. Watch the council's home district.");
      return;
    }
    if (lens === "fields") {
      const land = playerTiles.find((tile) => tile.building === "farm" || tile.building === "orchard" || tile.building === "fishery");
      if (land) frame(land, 36, "Working-lands lens. Food and ecology shape the settlement here.");
      return;
    }
    if (lens === "citizen") {
      const citizen = this.citizens()[this.societyLensIndex % Math.max(1, this.citizens().length)];
      this.societyLensIndex += 1;
      if (citizen) {
        const tile = this.tiles.get(hexKey(citizen.q, citizen.r));
        if (tile) frame(tile, 16, "Citizen lens. This resident's daily movement makes local work visible.");
      }
      return;
    }
    if (lens === "society") {
      const societies = [...this.societies.values()];
      const society = societies[this.societyLensIndex % Math.max(1, societies.length)];
      this.societyLensIndex += 1;
      const center = society && [...this.tiles.values()].find((tile) => tile.islandId === society.islandId && tile.owner === "tribe" && tile.ready);
      if (center && society) {
        const channel = society.diplomacy;
        const relation = channel.treaty === "trade-pact" ? "trade pact" : channel.treaty === "parley" ? "cautious parley" : channel.treaty === "hostile" ? "closed border" : "no accord";
        frame(center, 56, `${society.name} lens. Its needs evolve independently; current relation: ${relation}, trust ${Math.round(channel.trust * 100)}%.`);
      }
      else this.setHint("No neighboring society is within the observed world yet.");
      return;
    }
    const points = playerTiles.concat([...this.tiles.values()].filter((tile) => tile.owner === "tribe" && tile.ready));
    if (points.length === 0) return;
    const center = points.reduce((sum, tile) => sum.add(this.tileTop(tile)), new THREE.Vector3()).multiplyScalar(1 / points.length);
    this.frameObserver(center, 420);
    this.setHint("Regional-network lens. Goods, ideas, and migrants move between developing places.");
  }

  private frameObserver(target: THREE.Vector3, distance: number): void {
    this.observerMove = null;
    const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.45, 0.7, 0.55);
    direction.normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.controls.update();
  }

  private tileTop(tile: Tile): THREE.Vector3 {
    return new THREE.Vector3(
      tile.mesh.position.x,
      tile.mesh.position.y + 0.5 * tile.scaleY,
      tile.mesh.position.z,
    );
  }

  private advanceDeepTime(years: number): void {
    if (!this.lastSimulationInputs) {
      this.setHint("The first season is still being observed. Try the deep-time request again in a moment.");
      return;
    }
    this.simDays += years * 12;
    // Deep time changes the chronicle, not the observer's current sky.
    this.simulation.setStores({ food: this.food, wood: this.wood, gold: this.gold });
    const projection = this.simulation.advanceYears(this.lastSimulationInputs, years);
    if (projection) this.applySimulationSnapshot(projection);
    this.captureChronicleCheckpoint();
    this.setHint(`Deep-time projection: ${years.toLocaleString()} years pass. The observer is now in year ${yearFromDays(this.simDays)}.`);
    this.refreshHud();
  }

  /** A reproducible, inspectable macro-history increment rather than a burst of
   * continuous real-time speed. */
  private advanceCenturyStep(): void {
    this.setObserverSpeed(0);
    this.advanceDeepTime(100);
    this.setHint(`Century step complete. Year ${yearFromDays(this.simDays)} is now paused for observation.`);
  }

  private placeBuilding(
    tile: Tile,
    id: BuildingId,
    opts: { owner: "player" | "tribe"; free?: boolean; silent?: boolean; treasury?: Society },
  ): boolean {
    const def = BUILDINGS[id];
    if (tile.building || !tile.buildable || !biomeAllows(def, tile.biome) || !this.terrainAllows(id, tile)) return false;
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
    tile.claimant = this.claimantFor(tile);
    tile.contestedWith = null;
    tile.territory = id === "hut" ? "habitation" : "sovereignty";
    if (tile.decor) {
      tile.mesh.remove(tile.decor);
      tile.decor = null;
    }
    tile.buildingMesh = makeBuilding(def.id, this.architectureFor(tile));
    tile.buildingMesh.position.y = 0.5;
    const instant = Boolean(opts.free);
    tile.buildTotal = instant ? 0 : 0.28 + (def.goldCost + def.woodCost) * 0.012;
    tile.buildLeft = tile.buildTotal;
    tile.buildingMesh.scale.setScalar(instant ? 0.01 : 0.28);
    tile.mesh.add(tile.buildingMesh);
    this.persistTile(tile);
    this.registerAnimatedObjects(tile.buildingMesh);
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
    if (tile.building === "farm" || tile.building === "orchard") this.recordStratigraphy(tile, "cultivation", 0.28);
    if (tile.building === "lumber" || tile.building === "mine") this.recordStratigraphy(tile, "erosion", 0.16);
    this.claimTerritory(tile);
    this.markRoads(tile);
    this.attachPort(tile);
    this.persistTile(tile);
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

  /**
   * Settlements project claims rather than painting every region as permanently
   * owned. Overlap produces a durable contested frontier; collapse preserves a
   * subdued memory claim for later societies to inherit or erase.
   */
  private claimTerritory(center: Tile): void {
    const claimant = this.claimantFor(center);
    if (!center.owner || !claimant) return;
    const traits = center.owner === "player"
      ? this.simulation.snapshot.culture.traits
      : this.societies.get(center.islandId)?.culture.traits;
    const reach = 1 + Math.floor(((traits?.cooperation ?? 0.45) + (traits?.mobility ?? 0.45)) * 1.35);
    for (const offset of hexesInRadius(Math.min(3, reach))) {
      const tile = this.tiles.get(hexKey(center.q + offset.q, center.r + offset.r));
      if (!tile || tile === center) continue;
      const foreignClaim = tile.claimant && tile.claimant !== claimant && tile.territory !== "memory";
      if (foreignClaim) {
        tile.territory = "contested";
        tile.contestedWith = claimant;
      } else {
        tile.claimant = claimant;
        tile.contestedWith = null;
        tile.territory = "economic";
        // Administrative ownership remains local to a society's home region;
        // claims can nevertheless meet across procedural regional boundaries.
        if (tile.islandId === center.islandId && !tile.owner) tile.owner = center.owner;
      }
      this.paintTerritory(tile);
      this.persistTile(tile);
    }
  }

  private markRoads(tile: Tile): void {
    for (const hex of hexNeighbors(tile.q, tile.r)) {
      const next = this.tiles.get(hexKey(hex.q, hex.r));
      if (!next?.building || !next.ready || !tile.ready || next.owner !== tile.owner) continue;
      next.topMat.color.lerp(new THREE.Color(0x6b5344), 0.18);
      tile.topMat.color.lerp(new THREE.Color(0x6b5344), 0.12);
      const edge = [hexKey(tile.q, tile.r), hexKey(next.q, next.r)].sort().join(":");
      if (this.roadEdges.has(edge)) continue;
      this.recordStratigraphy(next, "trade", 0.06);
      this.recordStratigraphy(tile, "trade", 0.06);
      const start = this.tileTop(tile);
      const end = this.tileTop(next);
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = Math.hypot(direction.x, direction.z);
      const road = new THREE.Group();
      const bed = new THREE.Mesh(
        new THREE.BoxGeometry(length * 0.94, 0.035, 0.23),
        new THREE.MeshStandardMaterial({ color: 0x654737, roughness: 0.96, flatShading: true }),
      );
      const ruts = new THREE.Mesh(
        new THREE.BoxGeometry(length * 0.91, 0.012, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x987159, roughness: 1, flatShading: true }),
      );
      ruts.position.y = 0.025;
      road.add(bed, ruts);
      road.position.copy(start).lerp(end, 0.5);
      road.position.y += 0.032;
      road.rotation.y = Math.atan2(direction.z, direction.x);
      road.castShadow = true;
      road.receiveShadow = true;
      this.roadGroup.add(road);
      this.roadEdges.set(edge, road);
    }
  }

  /** Coastal fisheries and markets become ports once their construction is complete. */
  private attachPort(tile: Tile): void {
    if (!tile.coast || !tile.buildingMesh || (tile.building !== "fishery" && tile.building !== "market")) return;
    if (tile.buildingMesh.userData.port) return;
    const port = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x765038, roughness: 0.9, flatShading: true });
    const cloth = new THREE.MeshStandardMaterial({ color: tile.owner === "player" ? 0x7ce0c2 : 0xe5b36c, roughness: 0.72, flatShading: true, side: THREE.DoubleSide });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.055, 0.16), wood);
    pier.position.set(0.32, 0.03, 0.28);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.52, 6), wood);
    mast.position.set(0.18, 0.28, 0.2);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13), cloth);
    flag.position.set(0.29, 0.42, 0.2);
    flag.rotation.y = Math.PI / 2;
    port.add(pier, mast, flag);
    port.position.set(-0.22, 0.04, 0.04);
    port.userData.port = true;
    tile.buildingMesh.userData.port = true;
    tile.buildingMesh.add(port);
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

  private spawnOne(tile: Tile, role: PersonRole, index = 0, tribe = false, inherit = false): void {
    const seed = (hash2(tile.q + index + 3, tile.r + index) + index * 0.17 + this.people.length * 0.09) % 1;
    const parent = inherit
      ? this.people.find((person) => person.tribe === tribe && person.islandId === tile.islandId && person.age >= 18 && person.age < 60 && person.homeQ === tile.q && person.homeR === tile.r)
        ?? this.people.find((person) => person.tribe === tribe && person.islandId === tile.islandId && person.age >= 18 && person.age < 60)
      : undefined;
    const mesh = makeHuman(role, seed);
    const angle = seed * Math.PI * 2 + index * 2.15;
    const offset = new THREE.Vector3(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
    const person: Person = {
      id: `resident-${this.personSerial++}`,
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
      age: 16 + Math.floor(seed * 40),
      strategy: parent ? inheritBehavioralStrategy(parent.strategy, seed) : initialBehavioralStrategy(seed),
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
    const hour = hourFromDays(this.visualDays);
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
        (hourFromDays(this.visualDays) >= 17.5 || isNight(hourFromDays(this.visualDays)) ? 1.7 : 1);
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

  private setDirective(directive: Directive, instruction?: string): void {
    this.directive = directive;
    const record = instruction?.trim() || DIRECTIVE_COPY[directive];
    if (this.directiveHistory.at(-1) !== record) this.directiveHistory.push(record);
    document.querySelectorAll<HTMLButtonElement>("[data-directive]").forEach((button) => {
      button.classList.toggle("active", button.dataset.directive === directive);
    });
    const order = document.querySelector("#council-order");
    if (order) order.textContent = instruction?.trim() ? `Council order: “${instruction.trim()}”` : DIRECTIVE_COPY[directive];
    this.setHint(`Council directive: ${DIRECTIVE_COPY[directive]}`);
  }

  private setZoom(distance: number): void {
    const wasSpecialView = this.observatoryView !== "world";
    this.observatoryView = "world";
    this.refreshViewReadout();
    if (wasSpecialView) {
      this.controls.target.set(0, 1.2, 0);
      this.camera.position.set(38, 58, 72);
    }
    const direction = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.4, 0.72, 0.55);
    direction.normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
    this.controls.update();
    this.setHint(distance < 120 ? "Local view. Observe the council's work close up." : distance < 900 ? "World view. Survey the societies." : "Space view. Observe the worlds beyond Tidelight.");
  }

  private recenterObserver(): void {
    this.observerMove = null;
    if (this.observatoryView === "universe") {
      this.transitionToObservatoryView("universe", new THREE.Vector3(-300, 0, -100), new THREE.Vector3(-145, 390, 1220));
    } else if (this.observatoryView === "subatomic") {
      this.transitionToObservatoryView("subatomic", new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 42, 132));
    } else if (this.spacecraftMode) {
      this.frameObserver(new THREE.Vector3(0, 0, 0), 48);
    } else {
      this.frameObserver(new THREE.Vector3(0, 0, 0), 430);
    }
    this.setHint("Observer recentered on the active simulation view.");
  }

  private setObservatoryView(view: ObservatoryView): void {
    if (view === "world") {
      this.camera.near = 0.4;
      this.camera.far = 9000;
      this.camera.updateProjectionMatrix();
      this.observerMove = null;
      this.observatoryView = view;
      this.refreshViewReadout();
      this.frameObserver(new THREE.Vector3(0, 0, 0), 430);
      this.setPlanetReadout("Tidelight · the simulated home world");
      this.setHint("World view. Regional terrain, settlements, and routes are visible together.");
      return;
    }
    if (view === "universe") {
      this.camera.near = 4;
      this.camera.far = 30000;
      this.camera.updateProjectionMatrix();
      this.transitionToObservatoryView(view, new THREE.Vector3(-300, 0, -100), new THREE.Vector3(-145, 390, 1220));
      this.setPlanetReadout("Select a planet to visit");
      this.setHint("Universe view. Tidelight and its neighboring worlds are shown at a stable astronomical scale.");
      return;
    }
    this.camera.near = 0.05;
    this.camera.far = 1200;
    this.camera.updateProjectionMatrix();
    this.transitionToObservatoryView(view, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 42, 132));
    this.setPlanetReadout("Subatomic observation lens");
    this.setHint("Subatomic view. This is an observational lens: a stylized atom, energy cloud, and orbitals—not a separate game system.");
  }

  private transitionToObservatoryView(view: Exclude<ObservatoryView, "world">, target: THREE.Vector3, position: THREE.Vector3): void {
    this.observerMove = {
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      fromPosition: this.camera.position.clone(),
      toPosition: position,
      progress: 0,
      observatoryView: view,
    };
  }

  private refreshViewReadout(): void {
    const copy: Record<ObservatoryView, string> = {
      world: "Settlement scale · 1 m",
      universe: "Planetary scale · 10⁹ m schematic",
      subatomic: "Subatomic scale · 10⁻¹⁰ m schematic",
    };
    const readout = document.querySelector("#view-scale");
    if (readout) readout.textContent = copy[this.observatoryView];
    document.querySelectorAll<HTMLButtonElement>("[data-observatory-view]").forEach((button) => {
      const selected = button.dataset.observatoryView === this.observatoryView;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  private setPlanetReadout(text: string): void {
    const readout = document.querySelector("#planet-readout");
    if (readout) readout.textContent = text;
  }

  private sendEnvoy(cooperate: boolean): void {
    this.sendDiplomaticAction(cooperate ? "trade-proposal" : "rival-claim");
  }

  private sendDiplomaticAction(kind: DiplomaticMessageKind, targetSociety?: Society): void {
    const costs: Partial<Record<DiplomaticMessageKind, number>> = {
      "trade-proposal": 8, "rival-claim": 8, "gift": 5, "festival-invitation": 3, "marriage-alliance": 12, "defense-pact": 8,
    };
    const cost = costs[kind] ?? 8;
    const market = [...this.tiles.values()].some((tile) => tile.owner === "player" && tile.building === "market" && tile.ready);
    const shrine = [...this.tiles.values()].some((tile) => tile.owner === "player" && tile.building === "shrine" && tile.ready);
    const playerPort = this.findPort("player");
    const folk = this.citizens();
    const society = targetSociety ?? [...this.societies.values()]
      .filter((candidate) => kind !== "trade-proposal" || Boolean(playerPort && this.findPort("tribe", candidate.islandId)))
      .sort((a, b) => a.relation - b.relation)[0];
    if (!society) return this.setHint("Discover another society before sending an envoy.");
    if ((kind === "trade-proposal" || kind === "rival-claim" || kind === "gift") && !market) return this.setHint("A market is needed to send an envoy.");
    if (kind === "trade-proposal" && !playerPort) return this.setHint("Build a coastal fishery or market before sending a trade envoy.");
    if (kind === "festival-invitation" && !shrine) return this.setHint("A shrine is needed to host a festival invitation.");
    if (kind === "marriage-alliance" && folk.length <= 8) return this.setHint("The settlement needs more than 8 people for a marriage alliance.");
    if (kind === "marriage-alliance" && !channelSupportsContact(society.diplomacy)) return this.setHint("A parley or trade pact is needed before a marriage alliance.");
    if (kind === "defense-pact" && !this.simulation.snapshot.institutions.forms.includes("watch")) return this.setHint("A watch institution is needed for a defense pact.");
    if (kind === "defense-pact" && !channelSupportsContact(society.diplomacy)) return this.setHint("A parley or trade pact is needed before a defense pact.");
    if (this.gold < cost) return this.setHint(`A ${kind} needs ${cost} gold.`);
    if (society.diplomacy.messages.some((message) => message.kind === kind)) {
      this.setHint(`An earlier ${kind} message is still traveling to ${society.name}.`);
      return;
    }
    this.gold -= cost;
    const playerLanguage = this.simulation.snapshot.culture.language;
    const affinity = playerLanguage.family === society.culture.language.family ? 0.95 : Math.max(0.12, 1 - Math.abs(playerLanguage.boundary - society.culture.language.boundary) * 0.7);
    const [q, r] = society.islandId.split(",").map(Number);
    society.diplomacy = dispatchMessage(society.diplomacy, kind, yearFromDays(this.simDays), {
      distance: hexDistance(q, r), infrastructure: (playerPort ? 0.7 : 0.2) + (this.playerInfrastructure().roads > 1 ? 0.12 : 0), languageAffinity: affinity,
    });
    const labels: Partial<Record<DiplomaticMessageKind, string>> = {
      "trade-proposal": "A trade envoy", "rival-claim": "A rival claim", "gift": "A diplomatic gift",
      "festival-invitation": "A festival invitation", "marriage-alliance": "A marriage proposal", "defense-pact": "A defense pact offer",
    };
    this.setHint(`${labels[kind] ?? "A message"} departs for ${society.name}; its response will arrive after the journey.`);
  }

  private findPort(owner: "player" | "tribe", islandId?: string): Tile | null {
    return [...this.tiles.values()]
      .filter((tile) =>
        tile.owner === owner &&
        tile.ready &&
        tile.coast &&
        (tile.building === "fishery" || tile.building === "market") &&
        (!islandId || tile.islandId === islandId),
      )
      .sort((a, b) => (a.building === "market" ? -1 : 1) - (b.building === "market" ? -1 : 1))[0] ?? null;
  }

  private createTradeRoute(society: Society): void {
    if (this.tradeRoutes.has(society.islandId)) return;
    const home = this.findPort("player");
    const destination = this.findPort("tribe", society.islandId);
    if (!home || !destination) return;
    const boat = this.makeTradeBoat();
    boat.position.copy(this.tileTop(home));
    this.tradeGroup.add(boat);
    this.tradeRoutes.set(society.islandId, { societyId: society.islandId, boat, progress: 0, direction: 1, delivered: false });
  }

  private makeTradeBoat(): THREE.Group {
    const boat = new THREE.Group();
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4631, roughness: 0.82, flatShading: true });
    const sailMaterial = new THREE.MeshStandardMaterial({ color: 0xf1ddb0, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
    const cargoMaterial = new THREE.MeshStandardMaterial({ color: 0xbe8646, roughness: 0.9, flatShading: true });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.26), hullMaterial);
    hull.position.y = 0.04;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.5, 6), hullMaterial);
    mast.position.y = 0.3;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.28), sailMaterial);
    sail.position.set(0.04, 0.37, 0);
    sail.rotation.y = Math.PI / 2;
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), cargoMaterial);
    cargo.position.set(-0.2, 0.15, 0);
    boat.add(hull, mast, sail, cargo);
    boat.userData.cargo = cargo;
    boat.castShadow = true;
    return boat;
  }

  private updateTradeRoutes(simDt: number, time: number): void {
    for (const route of this.tradeRoutes.values()) {
      const society = this.societies.get(route.societyId);
      const home = this.findPort("player");
      const destination = society && this.findPort("tribe", society.islandId);
      if (!society || !channelSupportsTrade(society.diplomacy) || !home || !destination) {
        route.boat.visible = false;
        continue;
      }
      route.boat.visible = true;
      const weatherFactor = this.weather === "storm" ? 0.35 : this.weather === "rain" ? 0.7 : 1;
      route.progress += route.direction * (simDt / SECONDS_PER_DAY) * 0.19 * weatherFactor;
      if (route.progress >= 1 || route.progress <= 0) {
        if (!route.delivered) {
          const risk = this.weather === "storm" ? 0.62 : this.weather === "rain" ? 0.22 : 0.04;
          const shipment = route.direction > 0
            ? settleShipment({ stores: { food: this.food, wood: this.wood, gold: this.gold }, population: this.citizens().length }, { stores: { food: society.food, wood: society.wood, gold: society.gold }, population: this.people.filter((person) => person.tribe && person.islandId === society.islandId).length }, 1.35, risk)
            : settleShipment({ stores: { food: society.food, wood: society.wood, gold: society.gold }, population: this.people.filter((person) => person.tribe && person.islandId === society.islandId).length }, { stores: { food: this.food, wood: this.wood, gold: this.gold }, population: this.citizens().length }, 1.35, risk);
          if (route.direction > 0) {
            this.food = shipment.source.food; this.wood = shipment.source.wood; this.gold = shipment.source.gold;
            society.food = shipment.destination.food; society.wood = shipment.destination.wood; society.gold = shipment.destination.gold;
          } else {
            society.food = shipment.source.food; society.wood = shipment.source.wood; society.gold = shipment.source.gold;
            this.food = shipment.destination.food; this.wood = shipment.destination.wood; this.gold = shipment.destination.gold;
          }
          if (shipment.shipment) this.setHint(`${society.name}'s boat delivers ${shipment.shipment.amount.toFixed(1)} ${shipment.shipment.good}; local scarcity sets the price.`);
          route.delivered = true;
        }
        route.progress = Math.max(0, Math.min(1, route.progress));
        route.direction = route.direction > 0 ? -1 : 1;
      } else {
        route.delivered = false;
      }
      const from = this.tileTop(home);
      const to = this.tileTop(destination);
      const position = from.lerp(to, route.progress);
      position.y = Math.max(0.12, position.y - 0.26) + Math.sin(time * 3.2 + route.progress * 8) * 0.025;
      route.boat.position.copy(position);
      route.boat.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + (route.direction < 0 ? Math.PI : 0);
      const cargo = route.boat.userData.cargo as THREE.Mesh | undefined;
      if (cargo) cargo.rotation.y = time * 1.8;
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

  private techLevel(knowledge = this.technology): number {
    return 1 + Math.floor(Math.sqrt(knowledge / 20));
  }

  private canUseBuilding(id: BuildingId, snap: CivSnapshot): boolean {
    return isUnlocked(id, snap.people, snap.buildingTotal) && this.techLevel() >= BUILDING_TECH[id] && this.eraAllows(this.simulation.snapshot.era, id, this.simulation.snapshot.culture);
  }

  private architectureFor(tile: Tile): import("./world").ArchStyle {
    if (this.spacecraftMode) return "orbital";
    // The same procedural terrain can host a materially different first
    // society: origins leave distinct material traces from day one.
    if (tile.owner === "player" && this.origin === "camp" && this.simulation.snapshot.era === "Camp") return "camp";
    if (tile.owner === "player" && this.origin === "farmers") return "agrarian";
    if (tile.owner === "player" && this.origin === "city") return "metro";
    return styleForKind(tile.kind);
  }

  private eraAllows(era: EvolutionEra, id: BuildingId, culture?: CulturalState): boolean {
    if (EVOLUTION_RANK[era] >= EVOLUTION_RANK[BUILDING_ERA[id]]) return true;
    const practices = new Set(culture?.practices ?? []);
    // Cultural discoveries can open a path that a linear "age" would miss.
    if (id === "orchard" && practices.has("soil-rest covenant")) return true;
    if ((id === "market" || id === "shrine") && practices.has("common granary")) return true;
    if (id === "fishery" && practices.has("wayfinding compact")) return true;
    if (id === "forge" && practices.has("open archive")) return true;
    return false;
  }

  private terrainAllows(id: BuildingId, tile: Tile): boolean {
    if (this.spacecraftMode) return true;
    if (id === "fishery") return tile.coast;
    if (id === "farm") return tile.terrain === "plain" || tile.terrain === "hill";
    if (id === "orchard" || id === "lumber" || id === "market") return tile.terrain !== "mountain";
    if (id === "mine") return tile.terrain === "hill" || tile.terrain === "mountain" || ["rock", "volcanic", "crystal", "urban"].includes(tile.biome);
    if (id === "forge") return tile.terrain === "hill" || tile.terrain === "mountain" || ["rock", "volcanic", "urban"].includes(tile.biome);
    return true;
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
    // A region needs one founding site before it can have a territorial core.
    // Subsequent expansion remains constrained to its own evolving claim.
    if (nearby.length === 0) return tile.building === null;
    const folk = owner === "player" ? this.citizens().length : this.people.filter((person) => person.tribe && person.islandId === tile.islandId).length;
    const morale = owner === "player" ? this.mood : this.societies.get(tile.islandId)?.mood ?? 40;
    const radius = Math.max(1.7, 1.8 + Math.min(4.5, nearby.length * 0.22 + folk * 0.08 + (morale - 45) * 0.025));
    return nearby.some((entry) => hexDistance(entry.q - tile.q, entry.r - tile.r) <= radius);
  }

  private findSite(id: BuildingId, islandId?: string): Tile | null {
    const def = BUILDINGS[id];
    const owner = islandId ? "tribe" : "player";
    const district = DISTRICT_FOR_BUILDING[id];
    const [islandQ, islandR] = (islandId ?? "0,0").split(",").map(Number);
    const [offsetQ, offsetR] = DISTRICT_OFFSETS[district];
    const anchorQ = islandQ + offsetQ;
    const anchorR = islandR + offsetR;
    const ranked: { tile: Tile; score: number }[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.building || !tile.buildable || !biomeAllows(def, tile.biome) || !this.terrainAllows(id, tile) || !this.territoryAllows(tile, owner)) continue;
      if (tile.owner && tile.owner !== owner) continue;
      if (islandId && tile.islandId !== islandId) continue;
      if (!islandId && !this.playerIslands.has(tile.islandId)) continue;
      let score = 80 - hexDistance(tile.q - anchorQ, tile.r - anchorR) * 2.2;
      if (!islandId && tile.kind === "home") score += 40;
      let adjacent = 0;
      for (const hex of hexNeighbors(tile.q, tile.r)) {
        const next = this.tiles.get(hexKey(hex.q, hex.r));
        if (!next?.building || next.owner !== owner) continue;
        if (islandId && next.islandId !== islandId) continue;
        adjacent += 1;
      }
      score += adjacent * 8;
      const localDistrict = [...this.tiles.values()].filter(
        (entry) => entry.islandId === tile.islandId && entry.owner === owner && entry.building && DISTRICT_FOR_BUILDING[entry.building] === district,
      );
      const clusterDistance = localDistrict.reduce((best, entry) => Math.min(best, hexDistance(entry.q - tile.q, entry.r - tile.r)), Infinity);
      if (Number.isFinite(clusterDistance)) score += Math.max(0, 14 - clusterDistance * 3.5);
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
    for (const id of this.originProfile.foundations) {
      const site = this.findSite(id);
      if (site) this.placeBuilding(site, id, { owner: "player", free: true, silent: true });
    }
    if (!this.spacecraftMode) {
      this.tryFoundSocieties();
      this.seedAnimals();
    }
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
    const ordered = [...groups.entries()]
      .filter(([, group]) => group.kind !== "home" && group.tiles.length >= 8)
      .filter(([islandId]) => !this.founded.has(islandId))
      .filter(([islandId]) => (this.renewalUntil.get(islandId) ?? 0) <= this.simDays)
      .sort((a, b) => {
        const distA = hexDistance(Number(a[0].split(",")[0]), Number(a[0].split(",")[1]));
        const distB = hexDistance(Number(b[0].split(",")[0]), Number(b[0].split(",")[1]));
        if (distA !== distB) return distA - distB;
        return b[1].tiles.length - a[1].tiles.length;
      });
    for (const [islandId, group] of ordered) {
      if (this.societies.size >= 10) break;
      const plan = SOCIETY_PLANS[group.kind];
      if (!plan) continue;
      this.founded.add(islandId);
      this.renewalUntil.delete(islandId);
      const same = [...this.societies.values()].filter((society) => society.kind === group.kind).length;
      const inherited = this.fallenLineages.get(islandId);
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
        knowledge: 0,
        populationCapacity: 2,
        migrationPressure: 0,
        era: "Camp",
        culture: inherited
          ? forkCulture(inherited, Math.floor(hash2(group.tiles[0]?.q ?? 1, group.tiles[0]?.r ?? 1) * 1_000_000), "renewal")
          : forkCulture(this.simulation.snapshot.culture, Math.floor(hash2(group.tiles[0]?.q ?? 1, group.tiles[0]?.r ?? 1) * 1_000_000), "diaspora"),
        culturalInfluence: {},
        diplomacy: createDiplomaticChannel(yearFromDays(this.simDays)),
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
        this.setHint(`${society.name} keeps a camp on the ${group.kind} isle.`);
      }
    }
  }

  /** Resolve slow social transitions independently from building choice. */
  private evaluateSocietyLifecycles(): void {
    if (this.spacecraftMode) return;
    for (const society of [...this.societies.values()]) {
      const population = this.people.filter((person) => person.tribe && person.islandId === society.islandId).length;
      const state = { population, capacity: society.populationCapacity, food: society.food, mood: society.mood, migrationPressure: society.migrationPressure, culture: society.culture };
      if (shouldSocietyCollapse(state)) {
        this.collapseSociety(society);
        continue;
      }
      const last = this.fragmentationCooldown.get(society.islandId) ?? -Infinity;
      if (this.simDays - last < 18 || !shouldSocietyFragment(state)) continue;
      if (this.foundOffshoot(society)) this.fragmentationCooldown.set(society.islandId, this.simDays);
    }
    // Unsettled regions remain candidates after their fallow period, enabling
    // renewal even when the observer camera never moves.
    this.tryFoundSocieties();
  }

  private foundOffshoot(parent: Society): boolean {
    if (this.societies.size >= 10) return false;
    const [parentQ, parentR] = parent.islandId.split(",").map(Number);
    const groups = new Map<string, { kind: LandKind; tiles: Tile[] }>();
    for (const tile of this.tiles.values()) {
      if (tile.kind === "home" || this.founded.has(tile.islandId)) continue;
      const group = groups.get(tile.islandId) ?? { kind: tile.kind, tiles: [] };
      group.tiles.push(tile);
      groups.set(tile.islandId, group);
    }
    const target = [...groups.entries()]
      .filter(([, group]) => group.tiles.length >= 8 && Boolean(SOCIETY_PLANS[group.kind]))
      .sort((a, b) => {
        const [aq, ar] = a[0].split(",").map(Number);
        const [bq, br] = b[0].split(",").map(Number);
        return hexDistance(aq - parentQ, ar - parentR) - hexDistance(bq - parentQ, br - parentR);
      })[0];
    if (!target) return false;
    const [islandId, group] = target;
    const seed = Math.floor(hash2(parentQ + this.simDays, parentR + group.tiles.length) * 1_000_000);
    const branch = forkCulture(parent.culture, seed, "diaspora");
    const suffix = branch.lineage.split("-").at(-1) ?? "branch";
    const child: Society = {
      ...parent,
      islandId,
      kind: group.kind,
      name: `${parent.name} ${suffix}`,
      gold: parent.gold * 0.24,
      food: parent.food * 0.28,
      wood: parent.wood * 0.26,
      mood: Math.max(35, parent.mood - 7),
      relation: Math.max(-4, parent.relation),
      knowledge: parent.knowledge * 0.62,
      populationCapacity: 2,
      migrationPressure: 0.15,
      era: "Camp",
      stage: "Camp",
      culture: branch,
      culturalInfluence: {},
      diplomacy: createDiplomaticChannel(yearFromDays(this.simDays)),
    };
    parent.gold *= 0.76;
    parent.food *= 0.72;
    parent.wood *= 0.74;
    this.founded.add(islandId);
    this.societies.set(islandId, child);
    for (const id of (SOCIETY_PLANS[group.kind] ?? ["hut", "farm"]).slice(0, 2)) {
      const site = this.findSite(id, islandId);
      if (site) this.placeBuilding(site, id, { owner: "tribe", free: true, silent: true, treasury: child });
    }
    this.moveResident(parent.islandId, islandId);
    this.moveResident(parent.islandId, islandId);
    this.setHint(`${parent.name} sends an offshoot to the ${group.kind} isle; the ${branch.lineage} lineage begins.`);
    return true;
  }

  private collapseSociety(society: Society): void {
    this.fallenLineages.set(society.islandId, structuredClone(society.culture));
    for (let index = this.people.length - 1; index >= 0; index -= 1) {
      const person = this.people[index];
      if (!person?.tribe || person.islandId !== society.islandId) continue;
      this.peopleGroup.remove(person.mesh);
      this.people.splice(index, 1);
    }
    for (const tile of this.tiles.values()) {
      const wasHome = tile.islandId === society.islandId && tile.owner === "tribe";
      const wasClaimant = tile.claimant === society.islandId;
      const wasContender = tile.contestedWith === society.islandId;
      if (!wasHome && !wasClaimant && !wasContender) continue;
      if (wasContender && !wasClaimant) {
        // The other society retains the frontier once its counterpart vanishes.
        tile.territory = "economic";
        tile.contestedWith = null;
      } else {
        if (wasHome && tile.buildingMesh) tile.mesh.remove(tile.buildingMesh);
        if (wasHome) {
          this.recordStratigraphy(tile, "abandonment", 0.42);
          tile.building = null;
          tile.buildingMesh = null;
          tile.owner = null;
          tile.ready = false;
          tile.buildLeft = 0;
          tile.buildTotal = 0;
        }
        tile.territory = "memory";
        tile.claimant = society.islandId;
        tile.contestedWith = null;
      }
      this.paintTerritory(tile);
      this.persistTile(tile);
    }
    this.societies.delete(society.islandId);
    for (const key of this.regionalRelations.keys()) {
      if (key.split("|").includes(society.islandId)) this.regionalRelations.delete(key);
    }
    this.founded.delete(society.islandId);
    this.renewalUntil.set(society.islandId, this.simDays + 18);
    this.fragmentationCooldown.delete(society.islandId);
    this.simulation.retireRegion(society.islandId);
    this.assignHomes();
    this.assignJobs();
    this.setHint(`${society.name} collapses; its abandoned works become a memory for a future settlement.`);
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

  private hasPlayerConstruction(): boolean {
    return [...this.tiles.values()].some((tile) => tile.owner === "player" && tile.buildLeft > 0);
  }

  private tryAutonomousFrontier(): boolean {
    const snap = this.civSnapshot();
    if (!["Town", "City"].includes(developmentStage(snap.people, snap.buildingTotal)) || this.hasPlayerConstruction()) return false;
    const target = [...this.tiles.values()]
      .filter((tile) => tile.kind !== "home" && !this.playerIslands.has(tile.islandId) && !this.societies.has(tile.islandId))
      .filter((tile) => !tile.building && !tile.owner && tile.buildable)
      .sort((a, b) => hexDistance(a.q, a.r) - hexDistance(b.q, b.r))[0];
    if (!target || !this.placeBuilding(target, "hut", { owner: "player", silent: true })) return false;
    this.playerIslands.add(target.islandId);
    this.setHint(`The council founded a frontier on the ${target.kind} isle.`);
    return true;
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
    if ((this.directive === "frontier" || this.goal === "explore") && this.tryAutonomousFrontier()) return;
    if (this.hasPlayerConstruction()) return;
    const snap = this.civSnapshot();
    const localDirective = this.directive === "balanced" ? this.directiveForCulture(this.simulation.snapshot.culture.traits) : this.directive;
    const id = chooseNextBuilding(snap, (building) => this.canUseBuilding(building, snap) && this.canSite(building), localDirective, this.simulation.snapshot.ecology.minerals);
    if (!id) return;
    const site = this.findSite(id);
    if (!site) return;
    if (this.placeBuilding(site, id, { owner: "player", silent: true })) {
      this.setHint(`${this.simulation.snapshot.culture.lineage} custom favors a ${BUILDINGS[id].name.toLowerCase()}.`);
    }
  }

  private directiveForCulture(traits: CultureTraits): Directive {
    if (traits.stewardship > 0.62) return "food";
    if (traits.curiosity > 0.62) return "wealth";
    if (traits.cooperation > 0.64 || traits.resilience > 0.65) return "culture";
    if (traits.mobility > 0.68) return "frontier";
    return "growth";
  }

  private tryAutonomousDiplomacy(): void {
    if (this.directive !== "wealth" && this.goal !== "network") return;
    const targetRoutes = this.goal === "network" ? this.goalTarget() : Math.max(1, Math.ceil(this.societies.size / 3));
    if (this.tradeRoutes.size >= targetRoutes) return;
    this.sendEnvoy(true);
  }

  /** Agreements only become true when the message arrives. This separates the
   * information layer from a shipment and lets trust decay during isolation. */
  private advanceRegionalDiplomacy(): void {
    const year = yearFromDays(this.simDays);
    const playerLanguage = this.simulation.snapshot.culture.language;
    const infrastructure = this.playerInfrastructure();
    for (const society of this.societies.values()) {
      const affinity = playerLanguage.family === society.culture.language.family ? 0.95 : Math.max(0.12, 1 - Math.abs(playerLanguage.boundary - society.culture.language.boundary) * 0.7);
      const population = this.people.filter((person) => person.tribe && person.islandId === society.islandId).length;
      const result = advanceDiplomaticChannel(society.diplomacy, year, {
        infrastructure: Math.min(1, infrastructure.ports * 0.35 + infrastructure.roads * 0.04 + (this.findPort("tribe", society.islandId) ? 0.28 : 0)),
        languageAffinity: affinity,
        scarcity: Math.max(0, 1 - society.food / Math.max(3, population * 2.5)),
      });
      society.diplomacy = result.channel;
      for (const arrival of result.arrivals) {
        society.relation = THREE.MathUtils.clamp(society.relation + arrival.relationDelta, -60, 70);
        if (arrival.kind === "gift") {
          this.setHint(`${society.name} receives a diplomatic gift. Trust grows slowly but reliably.`);
        } else if (arrival.kind === "festival-invitation") {
          this.mood = Math.min(100, this.mood + 4);
          society.mood = Math.min(100, society.mood + 4);
          this.setHint(`${society.name} joins a shared festival. Both settlements' spirits lift.`);
        } else if (arrival.kind === "marriage-alliance") {
          this.moveResident("player", society.islandId);
          this.moveResident(society.islandId, "player");
          this.setHint(`A marriage alliance binds ${society.name} and the home settlement. Trust will decay more slowly.`);
        } else if (arrival.kind === "defense-pact") {
          this.setHint(`${society.name} accepts a defense pact. Conflict escalation between the two is now restrained.`);
        } else if (arrival.treaty === "trade-pact") {
          society.gold += 5;
          this.mood = Math.min(100, this.mood + 2);
          this.createTradeRoute(society);
          this.setHint(`${society.name} accepts a trade pact. Trust ${Math.round(society.diplomacy.trust * 100)}%; a route can now carry goods.`);
        } else if (arrival.treaty === "parley") {
          this.setHint(`${society.name} receives the envoy but only agrees to a cautious parley. Reliable contact must continue.`);
        } else if (arrival.treaty === "hostile") {
          this.setHint(`${society.name} receives the rival claim and closes its border. Trust falls before conflict begins.`);
        }
      }
    }
    this.advanceAutonomousRelations(year);
  }

  /** Neighboring societies build their own histories; player diplomacy is not
   * a hidden hub that determines every interregional relationship. */
  private advanceAutonomousRelations(year: number): void {
    const societies = [...this.societies.values()];
    for (let a = 0; a < societies.length; a += 1) {
      const left = societies[a];
      if (!left) continue;
      for (let b = a + 1; b < societies.length; b += 1) {
        const right = societies[b];
        if (!right) continue;
        const key = this.regionalRelationKey(left.islandId, right.islandId);
        const [leftQ, leftR] = left.islandId.split(",").map(Number);
        const [rightQ, rightR] = right.islandId.split(",").map(Number);
        const geometricDistance = hexDistance(leftQ - rightQ, leftR - rightR);
        // The same terrain burden that weakens exchange also lengthens the
        // social journey needed to establish a relationship.
        const distance = geometricDistance * ((this.regionalTerrainCost(left.islandId) + this.regionalTerrainCost(right.islandId)) / 2);
        const affinity = left.culture.language.family === right.culture.language.family
          ? 0.9
          : Math.max(0.1, 1 - Math.abs(left.culture.language.boundary - right.culture.language.boundary) * 0.62);
        const leftPeople = this.people.filter((person) => person.tribe && person.islandId === left.islandId).length;
        const rightPeople = this.people.filter((person) => person.tribe && person.islandId === right.islandId).length;
        const context = {
          distance,
          languageAffinity: affinity,
          infrastructure: Math.min(1, (this.findPort("tribe", left.islandId) ? 0.42 : 0.05) + (this.findPort("tribe", right.islandId) ? 0.42 : 0.05)),
          scarcityA: Math.max(0, 1 - left.food / Math.max(3, leftPeople * 2.5)),
          scarcityB: Math.max(0, 1 - right.food / Math.max(3, rightPeople * 2.5)),
          borderFriction: (distance < 28 ? 0.3 : distance < 54 ? 0.12 : 0) + (left.kind === right.kind ? 0.11 : 0),
        };
        const previous = this.regionalRelations.get(key) ?? createRegionalRelation(year, context);
        const next = advanceRegionalRelation(previous, year, context);
        this.regionalRelations.set(key, next);
        if (next.stance !== previous.stance && next.stance !== "none") {
          const action = next.stance === "trade" ? "open a direct trade corridor" : next.stance === "parley" ? "begin a cautious direct parley" : "close their border in hostility";
          this.setHint(`${left.name} and ${right.name} ${action}.`);
        }
        this.tryAutonomousDiplomaticAction(left, right, year);
      }
    }
  }

  private tryAutonomousDiplomaticAction(left: Society, right: Society, year: number): void {
    const roll = hash2(left.islandId.length + right.islandId.length, year);
    if (roll <= 0.85) return;
    const leftPop = this.people.filter((person) => person.tribe && person.islandId === left.islandId).length;
    const rightPop = this.people.filter((person) => person.tribe && person.islandId === right.islandId).length;
    const traits = left.culture.traits;
    const [leftQ, leftR] = left.islandId.split(",").map(Number);
    const distance = hexDistance(leftQ - Number(right.islandId.split(",")[0]), leftR - Number(right.islandId.split(",")[1]));
    const infrastructure = Math.min(1, (this.findPort("tribe", left.islandId) ? 0.42 : 0.05) + (this.findPort("tribe", right.islandId) ? 0.42 : 0.05));
    const affinity = left.culture.language.family === right.culture.language.family ? 0.9 : Math.max(0.1, 1 - Math.abs(left.culture.language.boundary - right.culture.language.boundary) * 0.62);
    const dispatchContext = { distance, infrastructure, languageAffinity: affinity };
    if (traits.cooperation > 0.6) {
      const shrine = [...this.tiles.values()].some((tile) => tile.islandId === left.islandId && tile.owner === "tribe" && tile.building === "shrine" && tile.ready);
      const kind: DiplomaticMessageKind = shrine && roll > 0.92 ? "festival-invitation" : "gift";
      if (left.gold >= 5 && !left.diplomacy.messages.some((m) => m.kind === kind)) {
        left.gold -= kind === "festival-invitation" ? 3 : 5;
        left.diplomacy = dispatchMessage(left.diplomacy, kind, year, dispatchContext);
        return;
      }
    }
    if (traits.mobility > 0.6 && leftPop > 8 && rightPop > 8 && channelSupportsContact(left.diplomacy) && !left.diplomacy.kinshipTie) {
      if (left.gold >= 12 && !left.diplomacy.messages.some((m) => m.kind === "marriage-alliance")) {
        left.gold -= 12;
        left.diplomacy = dispatchMessage(left.diplomacy, "marriage-alliance", year, dispatchContext);
        return;
      }
    }
    if (traits.resilience > 0.6 && channelSupportsContact(left.diplomacy)) {
      const watch = left.era !== "Camp" && (left.culture.traits.resilience > 0.62 || left.culture.practices.includes("fortified quarters"));
      if (watch && left.gold >= 8 && !left.diplomacy.messages.some((m) => m.kind === "defense-pact")) {
        left.gold -= 8;
        left.diplomacy = dispatchMessage(left.diplomacy, "defense-pact", year, dispatchContext);
      }
    }
  }

  private regionalRelationKey(left: string, right: string): string {
    return left < right ? `${left}|${right}` : `${right}|${left}`;
  }

  /** Every modeled regional exchange must have an established social channel.
   * Player pacts and autonomous regional relationships use the same modes. */
  private networkConnection(from: NetworkRegion, to: NetworkRegion): NetworkConnection {
    const fromSociety = from.id === "player" ? null : this.societies.get(from.id);
    const toSociety = to.id === "player" ? null : this.societies.get(to.id);
    if (!fromSociety && !toSociety) return "none";
    if (!fromSociety || !toSociety) {
      const channel = fromSociety?.diplomacy ?? toSociety?.diplomacy;
      if (!channel) return "none";
      return channelSupportsTrade(channel) ? "trade" : channelSupportsContact(channel) ? "parley" : "none";
    }
    const relation = this.regionalRelations.get(this.regionalRelationKey(fromSociety.islandId, toSociety.islandId));
    return relation ? regionalRelationMode(relation) : "none";
  }

  private resolveRegionalConflicts(): void {
    const player = this.civSnapshot();
    const defense = player.counts.forge * 0.18 + this.playerInfrastructure().roads * 0.025;
    const diplomacyScore = player.counts.market * 0.24 + this.simulation.snapshot.institutions.legitimacy * 0.22;
    const year = yearFromDays(this.simDays);
    for (const society of this.societies.values()) {
      const cooldownKey = this.regionalRelationKey("player", society.islandId);
      const cooldownUntil = this.conflictCooldown.get(cooldownKey) ?? 0;
      if (year < cooldownUntil) continue;
      const hasPact = society.diplomacy.messages.some((m) => m.kind === "defense-pact") || (society.diplomacy.kinshipTie && society.diplomacy.trust > 0.5);
      const contested = this.contestedResourcePressure(society);
      if (contested > 5 && channelSupportsContact(society.diplomacy) && society.diplomacy.trust > 0.4) {
        const roll = hash2(society.islandId.length, year);
        const negotiationChance = hasPact ? 0.25 : 0.4;
        if (roll > negotiationChance) {
          this.splitContestedTerritory(society);
          this.conflictCooldown.set(cooldownKey, year + 5);
          this.setHint(`${society.name} negotiated a territorial settlement; contested lands are divided.`);
          continue;
        }
      }
      const population = this.people.filter((person) => person.tribe && person.islandId === society.islandId).length;
      const escalationFactor = hasPact ? 0.7 : 1;
      const result = resolveConflict({
        relation: society.relation,
        scarcity: Math.max(0, 1 - society.food / Math.max(3, population * 2.5)),
        grievance: Math.max(0, -society.relation / 45) * escalationFactor + contested * 0.04,
        defense,
        diplomacy: diplomacyScore,
      });
      if (result.outcome === "none") continue;
      society.relation = THREE.MathUtils.clamp(society.relation + result.relationDelta, -60, 70);
      society.food *= result.foodMultiplier;
      this.mood = THREE.MathUtils.clamp(this.mood + result.stabilityDelta * 100, 0, 100);
      this.setHint(`${society.name}: ${result.outcome} follows regional grievance and bargaining.`);
    }
  }

  private contestedResourcePressure(society: Society): number {
    let pressure = 0;
    for (const tile of this.tiles.values()) {
      if (tile.territory !== "contested") continue;
      if (tile.contestedWith !== society.islandId && tile.claimant !== society.islandId) continue;
      pressure += 1;
      if (tile.building) pressure += 3;
      if (tile.building === "fishery" || tile.building === "mine") pressure += 2;
    }
    return pressure;
  }

  private splitContestedTerritory(society: Society): void {
    const [societyQ, societyR] = society.islandId.split(",").map(Number);
    let playerClaimed = 0;
    let societyClaimed = 0;
    for (const tile of this.tiles.values()) {
      if (tile.territory === "none" || tile.territory === "contested") continue;
      if (tile.claimant === "player") playerClaimed += 1;
      else if (tile.claimant === society.islandId) societyClaimed += 1;
    }
    for (const tile of this.tiles.values()) {
      if (tile.territory !== "contested") continue;
      if (tile.contestedWith !== society.islandId && tile.claimant !== society.islandId) continue;
      const distToPlayer = hexDistance(tile.q, tile.r);
      const distToSociety = hexDistance(tile.q - societyQ, tile.r - societyR);
      const goesToPlayer = distToPlayer < distToSociety || (distToPlayer === distToSociety && playerClaimed <= societyClaimed);
      tile.territory = "economic";
      tile.contestedWith = null;
      if (goesToPlayer) {
        tile.claimant = "player";
        if (!tile.owner) tile.owner = "player";
        playerClaimed += 1;
      } else {
        tile.claimant = society.islandId;
        if (!tile.owner) tile.owner = "tribe";
        societyClaimed += 1;
      }
      this.paintTerritory(tile);
      this.persistTile(tile);
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
      const id = chooseNextBuilding(
        snap,
        (building) =>
          isUnlocked(building, people, buildingTotal) &&
          this.techLevel(society.knowledge) >= BUILDING_TECH[building] &&
          this.eraAllows(society.era, building, society.culture) &&
          this.canSite(building, society.islandId, society),
        this.directiveForCulture(society.culture.traits),
      );
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
    const beforeYear = yearFromDays(this.simDays);
    this.simDays += simDt / SECONDS_PER_DAY;
    this.season = seasonFromDays(this.simDays);
    const year = yearFromDays(this.simDays);

    if (year !== beforeYear) {
      this.gold += 6;
      this.wood += 3;
      for (const society of this.societies.values()) {
        society.gold += 4;
        society.wood += 2;
      }
      this.setHint(`Year ${year} begins. Stores are counted and shared.`);
      this.captureChronicleCheckpoint(year);
      this.advanceAges(year);
      this.checkCatastrophe(year);
    }

    if (this.catastrophe && !this.catastrophe.resolved) {
      this.resolveCatastrophe();
    }

    this.tickConstruction(simDt);

    if (this.simDays >= this.eventUntil && this.event !== "none") {
      this.event = "none";
      this.migrationResolved = false;
    }

    if (!this.spacecraftMode && this.weatherDays >= this.weatherUntil) {
      const roll = hash2(Math.floor(this.weatherDays * 13), Math.floor(this.weatherDays));
      // Atmospheric presentation advances with the observer, not simulation
      // speed. Overcast is deliberately separate from rain, so a lively sky
      // does not imply permanent precipitation.
      const seasonWetness = this.visualSeason === "Spring" ? 0.08 : this.visualSeason === "Autumn" ? 0.05 : this.visualSeason === "Winter" ? 0.035 : 0;
      const climateRegime = this.simulation.snapshot.climate.regime;
      const dryBias = climateRegime === "dry-cold" ? 0.22 : climateRegime === "dry" ? 0.18 : climateRegime === "wet" ? -0.12 : 0;
      const clearCutoff = 0.48 - seasonWetness + dryBias;
      const overcastCutoff = 0.84 - seasonWetness * 0.45 + dryBias * 0.5;
      const rainCutoff = 0.97 - seasonWetness * 0.2 + dryBias * 0.3;
      const next: Weather = roll < clearCutoff ? "clear" : roll < overcastCutoff ? "overcast" : roll < rainCutoff ? "rain" : "storm";
      const duration = next === "clear" ? 0.62 + roll * 0.72 : next === "overcast" ? 0.42 + roll * 0.46 : next === "rain" ? 0.16 + roll * 0.15 : 0.09 + roll * 0.11;
      this.weatherUntil = this.weatherDays + duration * this.weatherPace;
      if (next !== this.weather) {
        this.weather = next;
        this.setHint(WEATHER_COPY[next]);
      } else {
        this.weather = next;
      }
      const droughtThreshold = (climateRegime === "dry" || climateRegime === "dry-cold") ? 0.84 : 0.92;
      const floodLower = climateRegime === "wet" ? 0.60 : 0.66;
      const floodUpper = climateRegime === "wet" ? 0.72 : 0.72;
      if (roll > droughtThreshold && this.event === "none") {
        this.event = "drought";
        this.eventUntil = this.simDays + 0.9;
        this.setHint("Drought. The soil cracks and farms slow.");
      } else if (roll < 0.08 && this.event === "none") {
        this.event = "festival";
        this.eventUntil = this.simDays + 0.55;
        this.setHint("A festival night. Mood lifts across the isles.");
      } else if (roll > 0.84 && roll < 0.9 && this.discovered.has("volcano") && this.event === "none" && this.simDays - this.lastEruptionDay > 20 * 12) {
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
      } else if (roll > floodLower && roll < floodUpper && this.event === "none") {
        this.event = "flood";
        this.eventUntil = this.simDays + 0.55;
        this.setHint("Coastal floods sweep in. Fisheries surge while fields struggle.");
      } else if (roll > 0.60 && roll < floodLower && this.event === "none") {
        this.event = "wildfire";
        this.eventUntil = this.simDays + 0.42;
        this.setHint("Wildfire runs through the wildlands. Lumber slows and spirits fall.");
      }
    }

    const weatherFarm = this.spacecraftMode ? 1.12 : this.weather === "rain" ? 1.28 : this.weather === "storm" ? 0.82 : this.weather === "overcast" ? 0.96 : 1;
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
        if (tile.terrain === "hill" && (tile.building === "farm" || tile.building === "orchard")) foodGain *= 0.84;
      }
      if (def.goldPerYear) {
        let goldMul = tile.biome === "volcanic" && tile.building === "mine" ? 1.45 : 1;
        if (this.event === "ash" && (tile.building === "mine" || tile.building === "forge")) goldMul *= 1.55;
        if (this.event === "trade" && tile.building === "market") goldMul *= 1.7;
        goldGain = def.goldPerYear * goldMul * work;
        if (tile.building === "mine") {
          goldGain *= tile.terrain === "mountain" ? 1.45 : tile.terrain === "hill" ? 1.18 : 1;
          const mineralStock = this.simulation.snapshot.ecology.minerals;
          goldGain *= Math.max(0.18, Math.sqrt(mineralStock));
        }
        if (tile.building === "forge") goldGain *= tile.terrain === "mountain" ? 1.2 : 1;
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
    const householdSignals = this.households.advance(
      this.people.map((person) => ({
        id: person.id,
        regionId: person.tribe ? person.islandId : "player",
        homeKey: `${person.homeQ},${person.homeR}`,
        age: person.age,
        role: person.role,
        seed: person.seed,
        strategy: person.strategy,
      })),
      [
        { id: "player", food: this.food, housing, mood: this.mood, environmentalStress: THREE.MathUtils.clamp(1 - (this.simulation.snapshot.ecology.water + this.simulation.snapshot.climate.rainfall) * 0.5, 0, 1) },
        ...[...this.societies.values()].map((society) => ({ id: society.islandId, food: society.food, housing: this.housingOf("tribe", society.islandId), mood: society.mood, environmentalStress: THREE.MathUtils.clamp(1 - society.food / Math.max(4, this.people.filter((person) => person.tribe && person.islandId === society.islandId).length * 2.4), 0, 1) })),
      ],
      simDt / YEAR_SECONDS,
    );
    for (const person of this.people) {
      const learned = this.households.strategyFor(person.id);
      if (learned) person.strategy = learned;
    }
    this.householdMetrics = householdSignals.get("player") ?? null;
    const household = this.householdMetrics;
    if (household) happiness += (household.cohesion - household.inequality) * 8;
    const alliedTowns = [...this.societies.values()].filter((society) => society.relation >= 16).length;
    if (folk.length > 0 && this.food < 1) happiness -= 18;
    if (folk.length > housing) happiness -= 10;
    if (!this.spacecraftMode && this.weather === "storm") happiness -= 6;
    if (!this.spacecraftMode && this.weather === "rain") happiness += 2;
    if (this.event === "festival") happiness += 16;
    if (this.event === "drought") happiness -= 8;
    if (this.event === "wildfire") happiness -= 7;
    if (this.spacecraftMode) {
      const readyModules = [...this.tiles.values()].filter((tile) => tile.owner === "player" && tile.ready).length;
      const repairCapacity = [...this.tiles.values()].filter((tile) => tile.owner === "player" && tile.ready && (tile.building === "forge" || tile.building === "mine")).length;
      const pressure = Math.max(0, folk.length - readyModules * 1.25) * 0.07;
      this.hullIntegrity = THREE.MathUtils.clamp(this.hullIntegrity + (repairCapacity * 0.018 - pressure) * simDt / SECONDS_PER_DAY, 12, 100);
      happiness += (this.hullIntegrity - 70) * 0.16;
    }
    const deltaYears = simDt / YEAR_SECONDS;
    const annualProduction = {
      food: playerYield.food / Math.max(deltaYears, 0.000001) * (household?.laborReadiness ?? 0.75) * this.originProfile.production.food,
      wood: playerYield.wood / Math.max(deltaYears, 0.000001) * (household?.laborReadiness ?? 0.75) * this.originProfile.production.wood + (this.spacecraftMode ? 2.2 : 0.5),
      gold:
        playerYield.gold / Math.max(deltaYears, 0.000001) * (household?.laborReadiness ?? 0.75) +
        (this.spacecraftMode ? 3.2 : 0.7) +
        markets * (0.8 + this.societies.size * 0.15) +
        (this.event === "trade" ? markets * 2.2 : 0) +
        (alliedTowns * markets * 0.45 + this.tradeRoutes.size * markets * 1.25) * this.originProfile.production.gold,
    };
    const playerDemographics = this.computeDemographics(folk);
    const depRatio = (playerDemographics.children + playerDemographics.elders) / Math.max(1, playerDemographics.adults);
    const laborEff = 1 / (1 + depRatio * 0.25);
    annualProduction.food *= laborEff;
    annualProduction.wood *= laborEff;
    const snap = this.civSnapshot();
    const disruption = this.event === "drought" || this.event === "flood" || this.event === "wildfire" || this.event === "ash"
      ? this.event
      : this.weather === "storm" ? "storm" : "none";
    this.simulation.setStores({ food: this.food, wood: this.wood, gold: this.gold });
    const localInputs: SimulationInputs = {
      deltaDays: simDt / SECONDS_PER_DAY,
      population: folk.length,
      housing,
      annualProduction,
      buildings: snap.counts,
      moodPressure: (happiness - 50) / 50 - (household?.migrationPressure ?? 0) * 0.12 + this.originProfile.moodPressure,
      infrastructure: this.playerInfrastructure(),
      disruption: this.spacecraftMode && this.hullIntegrity < 38 ? "storm" : disruption,
      fidelity: "local",
      culturalInfluence: this.culturalInfluence,
      diseaseImport: this.playerDiseaseImport,
      origin: this.origin,
      demographics: playerDemographics,
    };
    this.lastSimulationInputs = localInputs;
    const simulated = this.simulation.advance(localInputs);
    if (simulated) this.applySimulationSnapshot(simulated);

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

    const regionalInputs: RegionSimulationInput[] = [];
    for (const society of this.societies.values()) {
      const yieldNow = societyYield.get(society.islandId) ?? { food: 0, gold: 0, wood: 0 };
      const tribe = this.people.filter((person) => person.tribe && person.islandId === society.islandId);
      let tribeHappiness = 42;
      let tribeHousing = 0;
      const counts = emptyCounts();
      for (const tile of this.tiles.values()) {
        if (tile.islandId !== society.islandId || tile.owner !== "tribe" || !tile.building) continue;
        tribeHappiness += BUILDINGS[tile.building].happiness;
        tribeHousing += BUILDINGS[tile.building].housing;
        counts[tile.building] += 1;
      }
      if (society.food < 1 && tribe.length > 0) tribeHappiness -= 16;
      if (tribe.length > tribeHousing) tribeHappiness -= 10;
      const tribeDemographics = this.computeDemographics(tribe);
      const tribeDepRatio = (tribeDemographics.children + tribeDemographics.elders) / Math.max(1, tribeDemographics.adults);
      const tribeLaborEff = 1 / (1 + tribeDepRatio * 0.25);
      const annual = {
        food: yieldNow.food / Math.max(deltaYears, 0.000001) * tribeLaborEff,
        wood: yieldNow.wood / Math.max(deltaYears, 0.000001) * tribeLaborEff + 0.35,
        gold: yieldNow.gold / Math.max(deltaYears, 0.000001) + 0.4 + (society.relation <= -14 ? 0.7 : 0),
      };
      regionalInputs.push({
        id: society.islandId,
        stores: { food: society.food, gold: society.gold, wood: society.wood },
        knowledge: 0,
        inputs: {
          deltaDays: simDt / SECONDS_PER_DAY,
          population: tribe.length,
          housing: tribeHousing,
          annualProduction: annual,
          buildings: counts,
          moodPressure: (tribeHappiness - 50) / 50 - (householdSignals.get(society.islandId)?.migrationPressure ?? 0) * 0.1,
          infrastructure: this.tribeInfrastructure(society.islandId),
          disruption,
          fidelity: "remote",
          culturalInfluence: society.culturalInfluence,
          diseaseImport: this.societyDiseaseImport.get(society.islandId) ?? 0,
          demographics: tribeDemographics,
        },
      });
      society.stage = developmentStage(tribe.length, [...this.tiles.values()].filter(
        (tile) => tile.islandId === society.islandId && tile.owner === "tribe" && tile.building,
      ).length);
    }
    const regionalSnapshots = this.simulation.advanceRegions(regionalInputs);
    this.lastRegionalSnapshots = regionalSnapshots;
    for (const society of this.societies.values()) {
      const remote = regionalSnapshots.get(society.islandId);
      if (!remote) continue;
      society.food = Math.min(55, remote.stores.food);
      society.gold = Math.min(140, remote.stores.gold);
      society.wood = Math.min(90, remote.stores.wood);
      society.mood = Math.round((remote.health * 0.45 + remote.stability * 0.55) * 100);
      society.knowledge = remote.knowledge;
      society.populationCapacity = remote.populationCapacity;
      society.migrationPressure = remote.migrationPressure;
      society.era = remote.era;
      society.culture = remote.culture;
    }

    this.regionalNetworkTimer += simDt;
    if (this.regionalNetworkTimer >= SECONDS_PER_DAY * 0.5) {
      const networkYears = this.regionalNetworkTimer / YEAR_SECONDS;
      this.regionalNetworkTimer = 0;
      this.exchangeBetweenRegions(networkYears);
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

    this.lifecycleTimer += simDt;
    if (this.lifecycleTimer > SECONDS_PER_DAY * 2.4) {
      this.lifecycleTimer = 0;
      this.evaluateSocietyLifecycles();
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
    this.diplomacyTimer += simDt;
    if (this.diplomacyTimer > SECONDS_PER_DAY * 3) {
      this.diplomacyTimer = 0;
      this.advanceRegionalDiplomacy();
      this.tryAutonomousDiplomacy();
      this.resolveRegionalConflicts();
    }
    this.updateTradeRoutes(simDt, this.clock.elapsedTime);
    this.evaluateGoal();
    this.advanceCouncilOrder();

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
      this.persistTile(tile);
      if (tile.buildLeft <= 0) this.finishBuilding(tile, false);
    }
  }

  private applySimulationSnapshot(snapshot: import("./simulation/types.ts").SimulationSnapshot): void {
    this.food = snapshot.stores.food;
    this.wood = snapshot.stores.wood;
    this.gold = snapshot.stores.gold;
    this.technology = snapshot.knowledge;
    this.mood = Math.round((snapshot.health * 0.45 + snapshot.stability * 0.55) * 100);
    if (snapshot.originCrisis && snapshot.originCrisis.outcome !== this.lastOriginCrisis) {
      this.lastOriginCrisis = snapshot.originCrisis.outcome;
      this.setHint(`Year ${snapshot.originCrisis.year}: ${this.originProfile.title} faces ${snapshot.originCrisis.outcome}. Its institutions and knowledge path will now remember this fork.`);
    }
  }

  private captureChronicleCheckpoint(year = yearFromDays(this.simDays)): void {
    this.chronicle.checkpoint(year, this.simulation.snapshot as import("./simulation/types.ts").SimulationSnapshot);
  }

  private persistTile(tile: Tile): void {
    this.worldState.save(tile.q, tile.r, {
      building: tile.building,
      owner: tile.owner,
      territory: tile.territory,
      claimant: tile.claimant,
      contestedWith: tile.contestedWith,
      buildLeft: tile.buildLeft,
      buildTotal: tile.buildTotal,
      ready: tile.ready,
      history: this.worldState.tile(tile.q, tile.r).history,
    });
  }

  private staffFactor(tile: Tile): number {
    if (!tile.building || tile.building === "hut" || tile.buildLeft > 0) return 0;
    const outdoor =
      tile.building === "farm" ||
      tile.building === "orchard" ||
      tile.building === "lumber" ||
      tile.building === "fishery";
    if (outdoor && isNight(hourFromDays(this.visualDays))) return 0;
    const workers = this.people.filter(
      (person) => person.islandId === tile.islandId && person.workQ === tile.q && person.workR === tile.r,
    );
    if (workers.length === 0) return 0;
    const present = workers.filter((person) => !person.sleeping && person.q === tile.q && person.r === tile.r).length;
    let factor = 0.12 + 0.88 * (present / workers.length);
    const outbreak = tile.owner === "player"
      ? this.simulation.snapshot.diseaseOutbreak
      : this.lastRegionalSnapshots.get(tile.islandId)?.diseaseOutbreak ?? false;
    if (outbreak) factor *= 0.7;
    return factor;
  }

  private playerInfrastructure(): { roads: number; ports: number; tradeRoutes: number } {
    let ports = 0;
    for (const tile of this.tiles.values()) {
      if (tile.owner === "player" && tile.ready && tile.coast && (tile.building === "fishery" || tile.building === "market")) ports += 1;
    }
    const roads = [...this.roadEdges.values()].filter((road) => road.userData.owner === "player").length;
    return { roads, ports, tradeRoutes: this.tradeRoutes.size };
  }

  private tribeInfrastructure(islandId: string): { roads: number; ports: number; tradeRoutes: number } {
    let ports = 0;
    for (const tile of this.tiles.values()) {
      if (tile.islandId === islandId && tile.owner === "tribe" && tile.ready && tile.coast && (tile.building === "fishery" || tile.building === "market")) ports += 1;
    }
    let tradeRoutes = 0;
    for (const relation of this.regionalRelations.values()) {
      if (relation.stance === "trade") tradeRoutes += 1;
    }
    return { roads: 0, ports, tradeRoutes };
  }

  private regionalTradeOpenness(id: string): number {
    const residents = this.people.filter((person) => (id === "player" ? !person.tribe : person.tribe && person.islandId === id));
    if (residents.length === 0) return 0.5;
    return residents.reduce((total, person) => total + person.strategy.tradeOpenness, 0) / residents.length;
  }

  private regionalTerrainCost(id: string): number {
    const hub = id === "player"
      ? [...this.tiles.values()].find((tile) => tile.owner === "player" && tile.ready)
      : [...this.tiles.values()].find((tile) => tile.islandId === id && tile.owner === "tribe" && tile.ready);
    if (!hub) return 1.25;
    let cost = hub.terrain === "mountain" ? 2.5 : hub.terrain === "hill" ? 1.45 : 1;
    if (hub.biome === "jungle" || hub.biome === "swamp") cost += 0.32;
    if (hub.biome === "desert" || hub.biome === "snow") cost += 0.22;
    if (hub.coast && (hub.building === "market" || hub.building === "fishery")) cost -= 0.22;
    return Math.max(0.7, cost);
  }

  private exchangeBetweenRegions(years: number): void {
    const player = this.civSnapshot();
    const playerSim = this.simulation.snapshot;
    const playerInfrastructure = this.playerInfrastructure();
    const playerInstEffects = institutionEffects(playerSim.institutions);
    const playerInnovEffects = innovationEffects(playerSim.innovations);
    const playerHealthProtection = playerInstEffects.healthProtection + playerInnovEffects.healthProtection;
    const regions: NetworkRegion[] = [{
      id: "player", q: 0, r: 0, population: player.people, capacity: playerSim.populationCapacity,
      food: this.food, wood: this.wood, gold: this.gold, knowledge: this.technology,
      stability: playerSim.stability, migrationPressure: playerSim.migrationPressure,
      markets: player.counts.market, ports: playerInfrastructure.ports,
      institutions: player.counts.market + player.counts.shrine + player.counts.forge,
      openness: this.regionalTradeOpenness("player"),
      terrainCost: this.regionalTerrainCost("player"),
      culture: playerSim.culture.traits,
      language: playerSim.culture.language,
      diseaseRisk: playerSim.ecology.disease,
      healthProtection: playerHealthProtection,
    }];
    for (const society of this.societies.values()) {
      const [q, r] = society.islandId.split(",").map(Number);
      const tiles = [...this.tiles.values()].filter((tile) => tile.islandId === society.islandId && tile.owner === "tribe" && tile.building);
      const regionSnap = this.lastRegionalSnapshots.get(society.islandId);
      const regionDisease = regionSnap?.ecology.disease ?? 0.04;
      const regionHP = regionSnap
        ? institutionEffects(regionSnap.institutions).healthProtection + innovationEffects(regionSnap.innovations).healthProtection
        : 0;
      regions.push({
        id: society.islandId, q, r,
        population: this.people.filter((person) => person.tribe && person.islandId === society.islandId).length,
        capacity: society.populationCapacity, food: society.food, wood: society.wood, gold: society.gold,
        knowledge: society.knowledge, stability: society.mood / 100, migrationPressure: society.migrationPressure,
        markets: tiles.filter((tile) => tile.building === "market").length,
        ports: tiles.filter((tile) => tile.coast && (tile.building === "market" || tile.building === "fishery")).length,
        institutions: tiles.filter((tile) => tile.building === "market" || tile.building === "shrine" || tile.building === "forge").length,
        openness: this.regionalTradeOpenness(society.islandId),
        terrainCost: this.regionalTerrainCost(society.islandId),
        culture: society.culture.traits,
        language: society.culture.language,
        diseaseRisk: regionDisease,
        healthProtection: regionHP,
      });
    }
    const effects = exchangeRegions(regions, years, (from, to) => this.networkConnection(from, to));
    const playerEffect = effects.get("player");
    if (playerEffect) {
      this.food = Math.max(0, this.food + playerEffect.food);
      this.wood = Math.max(0, this.wood + playerEffect.wood);
      this.gold = Math.max(0, this.gold + playerEffect.gold);
      this.technology = Math.max(0, this.technology + playerEffect.knowledge);
      this.mood = Math.max(0, Math.min(100, this.mood + playerEffect.stability * 100));
      this.culturalInfluence = this.blendCultureInfluence(this.culturalInfluence, playerEffect.culture);
      this.playerDiseaseImport = playerEffect.diseaseImport;
    }
    for (const society of this.societies.values()) {
      const effect = effects.get(society.islandId);
      if (!effect) continue;
      society.food = Math.max(0, Math.min(55, society.food + effect.food));
      society.wood = Math.max(0, Math.min(90, society.wood + effect.wood));
      society.gold = Math.max(0, Math.min(140, society.gold + effect.gold));
      society.knowledge = Math.max(0, society.knowledge + effect.knowledge);
      society.mood = Math.max(0, Math.min(100, society.mood + effect.stability * 100));
      society.culturalInfluence = this.blendCultureInfluence(society.culturalInfluence, effect.culture);
      this.societyDiseaseImport.set(society.islandId, effect.diseaseImport);
    }
    this.reconcileCommunicationLinks(regions);
    const origins = regions.filter((region) => (effects.get(region.id)?.migrants ?? 0) < 0);
    const destinations = regions.filter((region) => (effects.get(region.id)?.migrants ?? 0) > 0);
    for (const destination of destinations) {
      let incoming = effects.get(destination.id)?.migrants ?? 0;
      while (incoming > 0) {
        const origin = origins.find((candidate) => (effects.get(candidate.id)?.migrants ?? 0) < 0);
        if (!origin || !this.moveResident(origin.id, destination.id)) break;
        const originEffect = effects.get(origin.id);
        if (originEffect) originEffect.migrants += 1;
        incoming -= 1;
      }
    }
  }

  private blendCultureInfluence(current: Partial<CultureTraits>, signal: CultureTraits): Partial<CultureTraits> {
    const next: Partial<CultureTraits> = {};
    for (const trait of Object.keys(signal) as (keyof CultureTraits)[]) {
      const prior = current[trait] ?? 0;
      // Imported practices fade unless local conditions keep selecting for them.
      next[trait] = THREE.MathUtils.clamp(prior * 0.76 + signal[trait], -0.35, 0.35);
    }
    return next;
  }

  /** Visualize established interregional exchange as a persistent signal and moving packet. */
  private reconcileCommunicationLinks(regions: readonly NetworkRegion[]): void {
    const player = regions.find((region) => region.id === "player");
    if (!player) return;
    const playerReady = player.markets + player.institutions >= 2;
    const wanted = new Set<string>();
    for (const region of regions) {
      if (region.id === "player") continue;
      const society = this.societies.get(region.id);
      const mode = society && channelSupportsTrade(society.diplomacy) ? "trade" : society && channelSupportsContact(society.diplomacy) ? "parley" : null;
      const ready = playerReady && Boolean(mode) && region.markets + region.institutions + region.ports >= 1;
      if (!ready || !mode) continue;
      const key = `player:${region.id}`;
      wanted.add(key);
      const existing = this.communicationLinks.get(key);
      if (existing?.mode === mode) continue;
      if (existing) {
        this.communicationGroup.remove(existing.line, existing.pulse);
        existing.line.geometry.dispose();
        (existing.line.material as THREE.Material).dispose();
        existing.pulse.geometry.dispose();
        (existing.pulse.material as THREE.Material).dispose();
        this.communicationLinks.delete(key);
      }
      const from = this.regionPoint("player");
      const to = this.regionPoint(region.id);
      if (!from || !to) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: mode === "trade" ? 0x8de9ff : 0xd6a6ff, dashSize: mode === "trade" ? 1.15 : 0.56, gapSize: mode === "trade" ? 0.72 : 1.05, transparent: true, opacity: mode === "trade" ? 0.72 : 0.46 }));
      line.computeLineDistances();
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 10, 8),
        new THREE.MeshStandardMaterial({ color: mode === "trade" ? 0xe9fbff : 0xf0ddff, emissive: mode === "trade" ? 0x2ecff0 : 0x9b58d2, emissiveIntensity: mode === "trade" ? 2.2 : 1.25, roughness: 0.2 }),
      );
      this.communicationGroup.add(line, pulse);
      this.communicationLinks.set(key, { source: from, destination: to, line, pulse, mode });
      this.recordRegionalStratigraphy("player", "trade", mode === "trade" ? 0.14 : 0.06);
      this.recordRegionalStratigraphy(region.id, "trade", mode === "trade" ? 0.14 : 0.06);
      this.setHint(`${mode === "trade" ? "A trade corridor" : "A cautious signal corridor"} opens with ${this.societies.get(region.id)?.name ?? "a neighboring region"}. ${mode === "trade" ? "Goods, people, and knowledge" : "Ideas and customs"} can now travel visibly.`);
    }
    // Autonomous societies can communicate with one another even when the
    // observer's civilization has never met either party. These paths expose
    // the simulation's distributed diplomatic history rather than a hub.
    const autonomous = regions.filter((region) => region.id !== "player");
    for (let index = 0; index < autonomous.length; index += 1) {
      const left = autonomous[index];
      if (!left) continue;
      for (let peer = index + 1; peer < autonomous.length; peer += 1) {
        const right = autonomous[peer];
        if (!right) continue;
        const relation = this.regionalRelations.get(this.regionalRelationKey(left.id, right.id));
        const mode = relation ? regionalRelationMode(relation) : "none";
        if (mode === "none" || left.population <= 0 || right.population <= 0) continue;
        const key = `regional:${this.regionalRelationKey(left.id, right.id)}`;
        wanted.add(key);
        const existing = this.communicationLinks.get(key);
        if (existing?.mode === mode) continue;
        if (existing) {
          this.communicationGroup.remove(existing.line, existing.pulse);
          existing.line.geometry.dispose();
          (existing.line.material as THREE.Material).dispose();
          existing.pulse.geometry.dispose();
          (existing.pulse.material as THREE.Material).dispose();
          this.communicationLinks.delete(key);
        }
        const from = this.regionPoint(left.id);
        const to = this.regionPoint(right.id);
        if (!from || !to) continue;
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: mode === "trade" ? 0xffd878 : 0x8ff0c8, dashSize: mode === "trade" ? 1.05 : 0.5, gapSize: mode === "trade" ? 0.65 : 1.1, transparent: true, opacity: mode === "trade" ? 0.66 : 0.42 }));
        line.computeLineDistances();
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 10, 8),
          new THREE.MeshStandardMaterial({ color: mode === "trade" ? 0xfff1bd : 0xd0ffea, emissive: mode === "trade" ? 0xde8e1f : 0x25bd83, emissiveIntensity: mode === "trade" ? 1.8 : 1.1, roughness: 0.2 }),
        );
        this.communicationGroup.add(line, pulse);
        this.communicationLinks.set(key, { source: from, destination: to, line, pulse, mode });
        this.recordRegionalStratigraphy(left.id, "trade", mode === "trade" ? 0.12 : 0.05);
        this.recordRegionalStratigraphy(right.id, "trade", mode === "trade" ? 0.12 : 0.05);
      }
    }
    for (const [key, link] of this.communicationLinks) {
      if (wanted.has(key)) continue;
      this.communicationGroup.remove(link.line, link.pulse);
      link.line.geometry.dispose();
      (link.line.material as THREE.Material).dispose();
      link.pulse.geometry.dispose();
      (link.pulse.material as THREE.Material).dispose();
      this.communicationLinks.delete(key);
    }
  }

  private regionPoint(id: string): THREE.Vector3 | null {
    if (id === "player") {
      const home = [...this.tiles.values()].find((tile) => tile.owner === "player" && tile.ready && tile.building === "market")
        ?? [...this.tiles.values()].find((tile) => tile.owner === "player" && tile.ready);
      return home ? this.tileTop(home).add(new THREE.Vector3(0, 0.8, 0)) : null;
    }
    const center = [...this.tiles.values()].find((tile) => tile.islandId === id && tile.owner === "tribe" && tile.ready && tile.building === "market")
      ?? [...this.tiles.values()].find((tile) => tile.islandId === id && tile.owner === "tribe" && tile.ready);
    return center ? this.tileTop(center).add(new THREE.Vector3(0, 0.8, 0)) : null;
  }

  private updateCommunicationLinks(time: number): void {
    for (const [key, link] of this.communicationLinks) {
      const phase = ((time * 0.28 + key.length * 0.13) % 1 + 1) % 1;
      link.pulse.position.copy(link.source).lerp(link.destination, phase);
      link.pulse.position.y += Math.sin(phase * Math.PI) * 1.2;
    }
  }

  private moveResident(originId: string, destinationId: string): boolean {
    const originTribe = originId !== "player";
    const resident = this.people
      .filter((person) => person.tribe === originTribe && (originTribe ? person.islandId === originId : true))
      // Displacement chooses households with the most urgent hardship. A
      // mobile disposition instead improves coping after arrival, so scarcity
      // does not automatically export the trait it is selecting for.
      .sort((left, right) => this.households.hardshipFor(right.id) - this.households.hardshipFor(left.id) || left.seed - right.seed)[0];
    const destinationTribe = destinationId !== "player";
    const home = [...this.tiles.values()].find(
      (tile) =>
        tile.building === "hut" && tile.ready && tile.owner === (destinationTribe ? "tribe" : "player") &&
        (!destinationTribe || tile.islandId === destinationId),
    );
    if (!resident || !home) return false;
    resident.tribe = destinationTribe;
    resident.islandId = home.islandId;
    resident.q = home.q;
    resident.r = home.r;
    resident.destQ = home.q;
    resident.destR = home.r;
    resident.homeQ = home.q;
    resident.homeR = home.r;
    resident.workQ = home.q;
    resident.workR = home.r;
    resident.progress = 1;
    resident.wait = 0.9;
    this.setRole(resident, "villager");
    resident.mesh.position.copy(this.tileTop(home).add(resident.offset));
    this.assignHomes();
    this.assignJobs();
    this.setHint(`${originId === "player" ? "A villager" : "A migrant"} resettled in ${destinationId === "player" ? "your civilization" : this.societies.get(destinationId)?.name ?? "a neighboring region"}.`);
    return true;
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

  private advanceAges(year: number): void {
    const regionPop = new Map<string, number>();
    for (const person of this.people) {
      const key = person.tribe ? person.islandId : "player";
      regionPop.set(key, (regionPop.get(key) ?? 0) + 1);
    }
    const toRemove: number[] = [];
    for (let i = 0; i < this.people.length; i++) {
      const person = this.people[i];
      person.age += 1;
      if (person.age >= 78) {
        const regionKey = person.tribe ? person.islandId : "player";
        if ((regionPop.get(regionKey) ?? 0) <= 6) continue;
        const mortalityChance = 0.15 + (person.age - 78) * 0.08;
        if (hash2(person.seed + year * 0.0037, year) < mortalityChance) {
          toRemove.push(i);
          regionPop.set(regionKey, (regionPop.get(regionKey) ?? 1) - 1);
        }
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const person = this.people[toRemove[i]];
      this.peopleGroup.remove(person.mesh);
      this.people.splice(toRemove[i], 1);
    }
    if (toRemove.length > 0) {
      this.assignHomes();
      this.assignJobs();
      this.setHint(`${toRemove.length === 1 ? "An elder" : "Elders"} passed away this year.`);
    }
  }

  private checkCatastrophe(_year: number): void {
    if (this.catastrophe && !this.catastrophe.resolved) return;
    this.catastrophe = null;
    const tiles = [...this.tiles.values()];
    const hasVolcanicTile = tiles.some((t) => t.biome === "volcanic");
    const ventTile = tiles.find((t) => {
      const sample = this.worldState.sample(t.q, t.r);
      return sample?.landmark === "vent";
    });

    if (this.spacecraftMode) {
      if (this.gameRandom.next() < 1 / 800) {
        const intensity = 0.3 + this.gameRandom.next() * 0.5;
        this.hullIntegrity = Math.max(12, this.hullIntegrity - (5 + intensity * 10));
        this.setHint("A meteorite strikes the hull. Integrity drops; repair modules respond.");
      }
      return;
    }

    const regime = this.simulation.snapshot.climate.regime;

    if (this.gameRandom.next() < (1 / 100) * (hasVolcanicTile ? 2.5 : 1)) {
      const epicenter = (hasVolcanicTile ? tiles.find((t) => t.biome === "volcanic") : undefined) ?? tiles[Math.floor(this.gameRandom.next() * tiles.length)];
      if (epicenter) {
        const intensity = 0.4 + this.gameRandom.next() * 0.4;
        this.catastrophe = { kind: "earthquake", epicenterQ: epicenter.q, epicenterR: epicenter.r, radius: 2 + Math.floor(this.gameRandom.next() * 3), intensity, startDay: this.simDays, durationDays: 0.5, buildingsDestroyed: 0, resolved: false };
        this.setHint("An earthquake shakes the land. Buildings tremble.");
        if (epicenter.coast && this.gameRandom.next() < 0.4) {
          this.catastrophe.kind = "tsunami";
          this.catastrophe.radius = 99;
          this.setHint("An earthquake triggers a tsunami. Coastal settlements are at risk.");
        }
        return;
      }
    }

    if (ventTile && this.gameRandom.next() < 1 / 200) {
      const intensity = 0.5 + this.gameRandom.next() * 0.35;
      this.catastrophe = { kind: "eruption", epicenterQ: ventTile.q, epicenterR: ventTile.r, radius: 3 + Math.floor(this.gameRandom.next() * 4), intensity, startDay: this.simDays, durationDays: 3, buildingsDestroyed: 0, resolved: false };
      this.lastEruptionDay = this.simDays;
      this.setHint("The volcano erupts. Lava and ash engulf the surroundings.");
      return;
    }

    if (this.gameRandom.next() < 1 / 800) {
      const epicenter = tiles[Math.floor(this.gameRandom.next() * tiles.length)];
      if (epicenter) {
        const intensity = 0.5 + this.gameRandom.next() * 0.4;
        this.catastrophe = { kind: "meteorite", epicenterQ: epicenter.q, epicenterR: epicenter.r, radius: 1 + Math.floor(this.gameRandom.next() * 3), intensity, startDay: this.simDays, durationDays: 0, buildingsDestroyed: 0, resolved: false };
        this.worldState.setLandmarkOverride(epicenter.q, epicenter.r, "crater");
        this.setHint("A meteorite strikes the earth. A crater marks the impact.");
        return;
      }
    }

    const locustChance = (1 / 50) * (regime === "dry" || regime === "dry-cold" ? 2 : 1);
    if (this.gameRandom.next() < locustChance) {
      this.catastrophe = { kind: "locusts", epicenterQ: 0, epicenterR: 0, radius: 0, intensity: 0.6, startDay: this.simDays, durationDays: 0.8, buildingsDestroyed: 0, resolved: false };
      this.food *= 0.4;
      for (const society of this.societies.values()) society.food *= 0.45;
      this.setHint("A locust swarm descends. Stored food is devastated and farms suffer.");
      this.catastrophe.resolved = true;
      return;
    }
  }

  private resolveCatastrophe(): void {
    const cat = this.catastrophe;
    if (!cat || cat.resolved) return;

    const snapshot = this.simulation.snapshot;
    const forms = new Set(snapshot.institutions.forms);
    const mitigation = (forms.has("watch") ? 0.15 : 0) + (snapshot.culture.traits.resilience * 0.1) + (forms.has("maintenance") ? 0.12 : 0);

    const toRemovePersons: number[] = [];
    let destroyed = 0;

    if (cat.kind === "tsunami") {
      for (const tile of this.tiles.values()) {
        if (!tile.coast || !tile.building) continue;
        if (this.gameRandom.next() >= cat.intensity * (1 - mitigation)) continue;
        if (tile.buildingMesh) tile.mesh.remove(tile.buildingMesh);
        if (tile.building === "hut") {
          for (let i = 0; i < this.people.length; i++) {
            if (this.people[i].homeQ === tile.q && this.people[i].homeR === tile.r) toRemovePersons.push(i);
          }
        }
        this.recordStratigraphy(tile, "abandonment", 0.65);
        tile.building = null;
        tile.buildingMesh = null;
        tile.ready = false;
        tile.buildLeft = 0;
        tile.buildTotal = 0;
        this.persistTile(tile);
        destroyed += 1;
      }
    } else {
      for (const tile of this.tiles.values()) {
        if (!tile.building) continue;
        if (hexDistance(tile.q - cat.epicenterQ, tile.r - cat.epicenterR) > cat.radius) continue;
        if (this.gameRandom.next() >= cat.intensity * (1 - mitigation)) continue;
        if (tile.buildingMesh) tile.mesh.remove(tile.buildingMesh);
        if (tile.building === "hut") {
          for (let i = 0; i < this.people.length; i++) {
            if (this.people[i].homeQ === tile.q && this.people[i].homeR === tile.r) toRemovePersons.push(i);
          }
        }
        this.recordStratigraphy(tile, "abandonment", 0.65);
        tile.building = null;
        tile.buildingMesh = null;
        tile.ready = false;
        tile.buildLeft = 0;
        tile.buildTotal = 0;
        this.persistTile(tile);
        destroyed += 1;
      }

      if (cat.kind === "eruption") {
        for (const tile of this.tiles.values()) {
          if (hexDistance(tile.q - cat.epicenterQ, tile.r - cat.epicenterR) > Math.max(1, Math.floor(cat.radius * 0.5))) continue;
          this.worldState.setBiomeOverride(tile.q, tile.r, "volcanic");
        }
      }
    }

    const uniquePersons = [...new Set(toRemovePersons)].sort((a, b) => b - a);
    for (const idx of uniquePersons) {
      const person = this.people[idx];
      if (person) {
        this.peopleGroup.remove(person.mesh);
        this.people.splice(idx, 1);
      }
    }

    if (destroyed > 0 || uniquePersons.length > 0) {
      this.assignHomes();
      this.assignJobs();
    }

    cat.buildingsDestroyed = destroyed;
    cat.resolved = true;
    const moodPenalty = Math.min(30, 15 + destroyed * 2);
    this.mood = Math.max(0, this.mood - moodPenalty);
    if (destroyed > 0) {
      this.setHint(`The ${cat.kind} destroyed ${destroyed} building${destroyed > 1 ? "s" : ""}. Mood falls as the settlement recovers.`);
    }
  }

  private computeDemographics(people: Person[]): { children: number; adults: number; elders: number } {
    let adults = 0;
    let elders = 0;
    for (const person of people) {
      if (person.age >= 65) elders += 1;
      else adults += 1;
    }
    const children = Math.round(adults * 0.28);
    return { children, adults, elders };
  }

  private tryBirths(): void {
    const folk = this.citizens();
    const housing = this.housingOf("player");
    if (this.simulation.snapshot.birthReadiness > 0.34 && (this.householdMetrics?.birthReadiness ?? 0.5) > 0.42 && folk.length < housing && this.food > 4) {
      const hut = [...this.tiles.values()].find(
        (tile) => tile.building === "hut" && tile.owner === "player" && tile.buildLeft <= 0,
      );
      if (hut) {
        this.spawnOne(hut, "villager", 0, false, true);
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
      this.spawnOne(hut, "villager", 0, true, true);
      this.assignHomes();
      this.setHint(`${society.name} welcomed a new villager.`);
      return;
    }
  }

  private tryHunger(): void {
    if (this.citizens().length > 1 && this.simulation.snapshot.mortalityRisk > 0.48) {
      const gone = this.exileHungry(false);
      if (gone) this.setHint("Disease, hunger, or insecurity drove a villager to leave.");
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
    const preferred = !tribe ? this.householdMetrics?.vulnerableResidentId : null;
    const person =
      (preferred ? this.people.find((entry) => entry.id === preferred && entry.tribe === tribe) : undefined) ??
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
      this.applyTerritoryColor(color, tile.owner, tile.territory);
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
    if (this.spacecraftMode) {
      this.skyDome.visible = false;
      this.sunDisc.visible = false;
      this.moonDisc.visible = false;
      this.clouds.visible = false;
      this.water.mesh.visible = false;
      this.scene.background = null;
      if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = 0;
      this.hemi.intensity = 0.18;
      this.hemi.color.setHex(0x9dc9ff);
      this.hemi.groundColor.setHex(0x111827);
      this.fill.intensity = 0.08;
      this.sunLight.intensity = 2.8;
      this.sunLight.color.setHex(0xe4f3ff);
      this.sunLight.position.set(14, 28, 12);
      this.sunLight.target.position.set(0, 0, 0);
      this.renderer.toneMappingExposure = 1.12;
      this.scene.environmentIntensity = 0.46;
      (this.stars.material as THREE.PointsMaterial).opacity = 0.92;
      return;
    }
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
    const hour = hourFromDays(this.visualDays);
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

    const storm = this.weather === "storm" ? 0.22 : this.weather === "rain" ? 0.1 : this.weather === "overcast" ? 0.045 : 0;
    const fog = day > 0.25 ? new THREE.Color().setHSL(0.48, this.visualStyle === "austere" ? 0.1 : 0.22, 0.55 + day * 0.12 - storm * 0.18) : new THREE.Color(this.visualStyle === "radiant" ? 0x10102e : 0x0b1522);
    if (this.event === "ash") fog.lerp(new THREE.Color(0x6a6058), 0.35);
    if (this.event === "drought") fog.lerp(new THREE.Color(0xc4b07a), 0.2);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.density = this.weather === "storm" ? 0.0024 : this.weather === "rain" ? 0.0017 : this.weather === "overcast" ? 0.00135 : 0.00115;
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
    this.hemi.intensity = (0.12 + day * 0.32) * (this.weather === "clear" ? 1 : this.weather === "overcast" ? 0.91 : 0.82);
    this.fill.intensity = (0.05 + day * 0.18) * (this.weather === "storm" ? 0.4 : 1);
    this.renderer.toneMappingExposure = (0.72 + day * 0.42) * (this.weather === "storm" ? 0.88 : 1);
    this.clouds.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mat = object.material as THREE.MeshStandardMaterial;
      mat.color.setHex(this.weather === "storm" ? 0x8a94a0 : this.weather === "rain" ? 0xc8d0d8 : this.weather === "overcast" ? 0xb4bfca : 0xfff4e4);
      mat.opacity = this.weather === "clear" ? 0.82 : this.weather === "overcast" ? 0.86 : 0.9;
    });
  }

  private goalTarget(): number {
    if (this.goal === "prosper") return 250 + (this.goalTier - 1) * 120;
    if (this.goal === "explore") return 3 + Math.floor((this.goalTier - 1) / 2);
    if (this.goal === "survive") return 20 + (this.goalTier - 1) * 4;
    if (this.goal === "knowledge") return 90 + (this.goalTier - 1) * 75;
    return 1 + Math.floor((this.goalTier - 1) / 2);
  }

  private goalLabel(): string {
    const target = this.goalTarget();
    if (this.goal === "prosper") return `Milestone: ${Math.floor(this.gold)} / ${target} gold`;
    if (this.goal === "explore") return `Milestone: ${this.playerIslands.size} / ${target} isles`;
    if (this.goal === "survive") return `Milestone: ${this.citizens().length} / ${target} people through winter`;
    if (this.goal === "knowledge") return `Milestone: ${Math.floor(this.technology)} / ${target} knowledge`;
    return `Milestone: ${this.tradeRoutes.size} / ${target} sea routes`;
  }

  private evaluateGoal(): void {
    const target = this.goalTarget();
    const complete =
      (this.goal === "prosper" && this.gold >= target) ||
      (this.goal === "explore" && this.playerIslands.size >= target) ||
      (this.goal === "survive" && this.citizens().length >= target && this.season === "Winter") ||
      (this.goal === "knowledge" && this.technology >= target) ||
      (this.goal === "network" && this.tradeRoutes.size >= target);
    if (!complete) return;
    const completed = this.goal;
    const cycle: CivilizationGoal[] = ["survive", "prosper", "explore", "knowledge", "network"];
    this.goal = cycle[(cycle.indexOf(completed) + 1) % cycle.length] ?? "prosper";
    this.goalTier += 1;
    this.setHint(`${completed === "network" ? "Trade-network" : completed[0].toUpperCase() + completed.slice(1)} milestone complete. The civilization enters chapter ${this.goalTier}.`);
  }

  private advanceCouncilOrder(): void {
    const next = this.directiveQueue[0];
    if (!next) return;
    const snap = this.civSnapshot();
    const ready =
      (this.directive === "food" && this.food >= Math.max(12, snap.people * 3)) ||
      (this.directive === "growth" && snap.people >= Math.max(8, snap.housing - 1)) ||
      (this.directive === "wealth" && (this.gold >= 90 || this.tradeRoutes.size > 0)) ||
      (this.directive === "culture" && this.mood >= 65) ||
      (this.directive === "frontier" && this.playerIslands.size >= 2) ||
      this.directive === "balanced";
    if (!ready) return;
    this.directiveQueue.shift();
    this.setDirective(next);
    this.setHint(`The council completed its first priority and is now turning to ${next}.`);
  }

  private refreshHud(): void {
    const hour = hourFromDays(this.visualDays);
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
              : this.weather === "overcast"
                ? "Overcast"
                : this.weather === "rain"
                  ? "Rain"
                  : "Storm";
    const simulation = this.simulation.snapshot;
    const localFoodNeed = Math.max(1, snap.people * 2.5);
    const currentRegime = simulation.climate.regime;
    const regimeNote = currentRegime === "dry" ? " A dry decade is settling in."
      : currentRegime === "wet" ? " Wet years are favoring the fields."
      : currentRegime === "dry-cold" ? " Cold drought is stressing crops and morale."
      : "";
    const outlook = simulation.mortalityRisk > 0.48
      ? "Demographic crisis"
      : this.food < localFoodNeed * 0.55
        ? "Food reserves are thinning"
        : simulation.migrationPressure > 0.42
          ? "Households are looking outward"
          : simulation.ecology.disease > 0.48
            ? "Public health is under strain"
            : simulation.ecology.minerals < 0.2
              ? "Mines are nearly exhausted"
              : simulation.ecology.minerals < 0.5
                ? "Mineral yields are declining"
                : simulation.ecology.soil < 0.48 || simulation.ecology.water < 0.42
                  ? "The land is carrying a cost"
                  : currentRegime === "dry" || currentRegime === "dry-cold"
                    ? "The climate is drying"
                    : currentRegime === "wet"
                      ? "The climate is wetting"
                      : "Conditions are broadly stable";
    const cause = simulation.mortalityRisk > 0.48
      ? "Scarcity, ecological stress, or disease is now affecting the population." + regimeNote
      : this.food < localFoodNeed * 0.55
        ? "Production and stored staples are below the settlement’s near-term needs." + regimeNote
        : simulation.migrationPressure > 0.42
          ? "Crowding, remembered hardship, or weak local opportunity is increasing migration pressure." + regimeNote
          : simulation.ecology.disease > 0.48
            ? "Dense settlement and stressed water create a disease burden; care institutions and waterworks help." + regimeNote
            : simulation.ecology.minerals < 0.2
              ? "Local mineral deposits are spent; trade or new territory may be needed to sustain gold income." + regimeNote
              : simulation.ecology.minerals < 0.5
                ? "Mining is drawing down deposits faster than geology can replenish them." + regimeNote
                : simulation.ecology.soil < 0.48 || simulation.ecology.water < 0.42
                  ? "Extraction and climate are weakening soil or water faster than they recover." + regimeNote
                  : currentRegime !== "normal"
                    ? (currentRegime === "dry" ? "A dry decade is settling in." : currentRegime === "dry-cold" ? "Cold drought is stressing crops and morale." : "Wet years are favoring the fields.")
                    : "The council’s current institutions, ecology, and stores are in a workable balance.";
    this.hud.refresh({
      year: yearFromDays(this.simDays), season: this.season, era: eraName(snap.people, snap.buildingTotal),
      goal: this.goalLabel(),
      clock: `${timeOfDay(hour)} ${clock}`, sky, day: dayOfSeason(this.simDays), gold: this.gold,
      food: this.food, wood: this.wood, mood: this.mood, people: snap.people,
      others: this.people.filter((person) => person.tribe).length, towns: this.societies.size, tradeRoutes: this.tradeRoutes.size, housing: snap.housing,
      technology: this.techLevel(),
      evolution: simulation.era,
      capacity: simulation.populationCapacity,
      health: Math.round(simulation.health * 100),
      land: this.spacecraftMode ? Math.round(this.hullIntegrity) : Math.round(((simulation.ecology.soil + simulation.ecology.forest + simulation.ecology.fish) / 3) * 100),
      culture: `${simulation.culture.language.dialect} · ${simulation.culture.practices[0] ?? "unsettled custom"}`,
      outlook,
      cause,
      scenario: this.spacecraftMode ? "spacecraft" : "planet",
    });
    if (this.citizens().length > 0 && this.food < 1) this.setHint("The village is hungry. Auto will try a farm or fishery.");
  }

  private setHint(text: string): void {
    this.hud.setHint(text);
    if (this.activityLog[0] === text) return;
    this.activityLog.unshift(text);
    this.activityLog.splice(5);
    const feed = document.querySelector("#activity-feed");
    if (feed) feed.innerHTML = this.activityLog.map((entry) => `<li>${entry}</li>`).join("");
    this.chronicle.record(
      this.simDays,
      classifyChronicleEvent(text),
      text,
      ["player", ...this.societies.keys()],
      { population: this.citizens().length, food: this.food, gold: this.gold, knowledge: this.technology, towns: this.societies.size },
    );
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
    if (!this.spacecraftMode && this.observatoryView === "world" && !this.observerMove?.observatoryView && distance <= 10.5) {
      this.setObservatoryView("subatomic");
      return;
    }
    if (this.observatoryView === "subatomic" && distance > 175) {
      this.observatoryView = "world";
      this.refreshViewReadout();
    }
    if (this.observatoryView === "subatomic") {
      this.cosmicMode = true;
      this.cosmos.group.visible = false;
      this.subatomic.group.visible = true;
      this.terrainChunks.group.visible = false;
      this.tileGroup.visible = false;
      this.roadGroup.visible = false;
      this.tradeGroup.visible = false;
      this.communicationGroup.visible = false;
      this.peopleGroup.visible = false;
      this.life.group.visible = false;
      this.clouds.visible = false;
      this.water.mesh.visible = false;
      this.subatomic.update(time);
      return;
    }
    this.subatomic.group.visible = false;
    if (this.spacecraftMode) {
      this.cosmicMode = false;
      this.cosmos.group.visible = false;
      this.terrainChunks.group.visible = false;
      this.tileGroup.visible = true;
      this.roadGroup.visible = true;
      this.tradeGroup.visible = true;
      this.communicationGroup.visible = false;
      this.peopleGroup.visible = true;
      this.spacecraft?.update(time);
      return;
    }
    if (this.observatoryView === "universe") {
      this.cosmicMode = true;
      this.cosmos.group.visible = true;
      this.cosmos.group.position.set(0, 0, 0);
      this.cosmos.group.children.forEach((child) => { child.visible = true; });
      this.cosmos.planet.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const material = object.material as THREE.Material & { opacity?: number };
        material.opacity = Number(material.userData.cosmicBaseOpacity ?? 1);
      });
      this.terrainChunks.group.visible = false;
      this.tileGroup.visible = false;
      this.roadGroup.visible = false;
      this.tradeGroup.visible = false;
      this.communicationGroup.visible = false;
      this.peopleGroup.visible = false;
      this.life.group.visible = false;
      this.clouds.visible = false;
      this.water.mesh.visible = false;
      this.cosmos.update(time, 1700);
      this.cosmos.planet.visible = true;
      return;
    }
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
      const baseOpacity = Number(material.userData.cosmicBaseOpacity ?? 1);
      material.opacity = baseOpacity * cosmic;
      material.transparent = baseOpacity < 1 || cosmic < 0.999;
    });
    this.tileGroup.visible = cosmic < 0.98;
    this.roadGroup.visible = cosmic < 0.98;
    this.tradeGroup.visible = cosmic < 0.98;
    this.communicationGroup.visible = cosmic < 0.98;
    this.peopleGroup.visible = cosmic < 0.98;
    this.life.group.visible = cosmic < 0.98;
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

    this.advanceObserverMove(dt);
    this.moveObserverWithArrows(dt);
    this.controls.update();
    this.followWorld();
    this.updateScaleOfWorld(time);
    this.ensureWorld();
    if (!this.spacecraftMode) {
      this.water.update(time);
      this.life.update(dt, time, this.controls.target, this.weather);
    }
    this.tuneQuality(dt);
    if (simDt > 0) {
      if (!this.spacecraftMode) {
        this.visualDays += dt / SECONDS_PER_DAY;
        this.weatherDays += dt / SECONDS_PER_DAY;
      }
      const nextVisualSeason = seasonFromDays(this.visualDays);
      if (nextVisualSeason !== this.visualSeason) {
        this.visualSeason = nextVisualSeason;
        this.applySeason(this.visualSeason);
      }
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
        child.visible = !isNight(hourFromDays(this.visualDays)) || t < 0.85;
      }
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
    if (!this.spacecraftMode) this.updateAnimals(simDt, time);
    this.updateCommunicationLinks(time);
    for (const object of this.shrineOrbs) {
      object.rotation.y = time * 0.9;
      object.rotation.z = Math.sin(time) * 0.15;
    }

    this.composer.render();
    requestAnimationFrame(this.loop);
  };
}
