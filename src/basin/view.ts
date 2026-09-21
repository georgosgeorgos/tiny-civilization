import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BasinState, BasinWorld } from "./types.ts";

export type MapLayer = "landscape" | "fertility" | "forest";

/** Presentation only: camera movement never creates or advances settlements. */
export class BasinView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  private readonly controls: OrbitControls;
  private readonly terrain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly settlementGroup = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  private readonly cargoGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly markers: THREE.Object3D[] = [];
  private readonly observer: ResizeObserver;
  private readonly world: BasinWorld;
  private lastSeason = -1;
  private lastSelection = "";
  private layer: MapLayer = "landscape";
  private down: { x: number; y: number } | null = null;
  private readonly select: (id: string) => void;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, world: BasinWorld, select: (id: string) => void) {
    this.canvas = canvas;
    this.world = world;
    this.select = select;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(0xe4e7d8);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene.fog = new THREE.Fog(0xe4e7d8, 80, 150);
    this.scene.add(new THREE.HemisphereLight(0xfffae6, 0x667858, 2.6));
    const sun = new THREE.DirectionalLight(0xffeac1, 3.2);
    sun.position.set(-20, 50, 25);
    this.scene.add(sun);
    this.camera.position.set(35, 45, 52);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 85;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minPolarAngle = 0.25;
    this.terrain = new THREE.Mesh(this.makeTerrain(world), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    this.scene.add(this.terrain, this.settlementGroup, this.routeGroup, this.cargoGroup);
    this.addTrees(world);
    this.addSettlements(world);
    this.paint(world);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private point(cellId: number, offset = 0): THREE.Vector3 {
    const cell = this.world.cells[cellId];
    return new THREE.Vector3(cell.x - this.world.width / 2, cell.elevation * 7 + offset, cell.z - this.world.height / 2);
  }

  private makeTerrain(world: BasinWorld): THREE.BufferGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const cell of world.cells) vertices.push(cell.x - world.width / 2, cell.elevation * 7, cell.z - world.height / 2);
    for (let z = 0; z < world.height - 1; z++) {
      for (let x = 0; x < world.width - 1; x++) {
        const i = z * world.width + x;
        indices.push(i, i + world.width, i + 1, i + 1, i + world.width, i + world.width + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(vertices.length), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private paint(world: BasinWorld): void {
    const colors = this.terrain.geometry.getAttribute("color");
    const color = new THREE.Color();
    for (const cell of world.cells) {
      if (cell.river) color.setHex(0x4a99b1);
      else if (this.layer === "fertility") color.setHSL(0.08 + cell.fertility * 0.23, 0.48, 0.65 - cell.fertility * 0.24);
      else if (this.layer === "forest") color.setHSL(0.25, 0.15 + cell.forest * 0.4, 0.79 - cell.forest * 0.49);
      else color.setHSL(0.18 + cell.forest * 0.12, 0.24 + cell.fertility * 0.13, 0.68 - cell.forest * 0.28 - cell.elevation * 0.09);
      colors.setXYZ(cell.id, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  private addTrees(world: BasinWorld): void {
    const cells = world.cells.filter((cell) => !cell.river && cell.forest > 0.46 && cell.id % 3 === 0 && !world.settlements.some((s) => Math.hypot(s.x - cell.x, s.z - cell.z) < 3));
    const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.36, 1.45, 5), new THREE.MeshStandardMaterial({ color: 0x315a42, roughness: 1 }), cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, index) => {
      const p = this.point(cell.id, 0.55);
      matrix.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(index, matrix);
    });
    this.scene.add(mesh);
  }

  private addSettlements(world: BasinWorld): void {
    const wall = new THREE.MeshStandardMaterial({ color: 0xefe4ca, roughness: 0.95 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x9a654e, roughness: 1 });
    const wallGeometry = new THREE.BoxGeometry(0.65, 0.65, 0.7);
    const roofGeometry = new THREE.ConeGeometry(0.63, 0.45, 4);
    for (const [index, settlement] of world.settlements.entries()) {
      const centerId = settlement.z * world.width + settlement.x;
      const center = this.point(centerId);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.64, 40), new THREE.MeshBasicMaterial({ color: [0xb17f31, 0x416a53, 0x6c6088][index], side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(center).add(new THREE.Vector3(0, 0.14, 0));
      ring.userData.settlementId = settlement.id;
      this.markers.push(ring);
      this.settlementGroup.add(ring);
      for (let n = 0; n < 9; n++) {
        const angle = n * 2.4;
        const radius = n < 3 ? 0.7 : 1.8;
        const x = Math.round(settlement.x + Math.cos(angle) * radius);
        const z = Math.round(settlement.z + Math.sin(angle) * radius);
        const base = this.point(z * world.width + x);
        const house = new THREE.Mesh(wallGeometry, wall);
        house.position.copy(base).add(new THREE.Vector3(0, 0.33, 0));
        house.userData.settlementId = settlement.id;
        const top = new THREE.Mesh(roofGeometry, roof);
        top.position.copy(base).add(new THREE.Vector3(0, 0.85, 0));
        top.rotation.y = Math.PI / 4;
        top.userData.settlementId = settlement.id;
        this.settlementGroup.add(house, top);
        this.markers.push(house, top);
      }
      const label = this.makeLabel(settlement.name);
      label.position.copy(center).add(new THREE.Vector3(0, 3.1, 0));
      label.userData.settlementId = settlement.id;
      this.settlementGroup.add(label);
      this.markers.push(label);
    }
  }

  private makeLabel(name: string): THREE.Sprite {
    const label = document.createElement("canvas");
    label.width = 384; label.height = 80;
    const ctx = label.getContext("2d")!;
    ctx.fillStyle = "rgba(247,244,231,0.94)";
    ctx.beginPath(); ctx.roundRect(4, 4, 376, 72, 12); ctx.fill();
    ctx.fillStyle = "#243c35";
    ctx.font = "600 30px Georgia";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(name, 192, 42);
    const texture = new THREE.CanvasTexture(label);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(5.5, 1.15, 1);
    return sprite;
  }

  setLayer(layer: MapLayer): void { this.layer = layer; this.paint(this.world); }

  focus(id?: string): void {
    const settlement = this.world.settlements.find((s) => s.id === id);
    const target = settlement ? this.point(settlement.z * this.world.width + settlement.x) : new THREE.Vector3();
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(25, 38, 40));
  }

  update(state: Readonly<BasinState>, selected: string): void {
    if (this.lastSelection !== selected) {
      this.lastSelection = selected;
      for (const marker of this.markers) {
        if (marker instanceof THREE.Mesh && marker.geometry instanceof THREE.RingGeometry) marker.scale.setScalar(marker.userData.settlementId === selected ? 1.25 : 1);
      }
    }
    if (this.lastSeason === state.season) return;
    this.lastSeason = state.season;
    this.paint(state.world);
    this.clearGroup(this.routeGroup);
    for (const route of state.routes) {
      const points = route.cells.map((id) => this.point(id, 0.22));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: route.bridge ? 0x98601c : 0xc4b28f, transparent: true, opacity: 0.9 }));
      this.routeGroup.add(line);
      if (route.bridge) {
        for (const id of route.cells.filter((cellId) => this.world.cells[cellId].river)) {
          const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, 1.12), new THREE.MeshStandardMaterial({ color: 0xa77440 }));
          bridge.position.copy(this.point(id, 0.42));
          this.routeGroup.add(bridge);
        }
      }
    }
    this.clearGroup(this.cargoGroup);
    for (const shipment of state.shipments.slice(0, 80)) {
      const route = state.routes.find((r) => r.id === shipment.routeId);
      if (!route?.cells.length) continue;
      const progress = Math.max(0, Math.min(1, 1 - (shipment.arrival - state.season) / Math.max(1, route.travelSeasons)));
      const cells = route.from === shipment.from ? route.cells : [...route.cells].reverse();
      const id = cells[Math.min(cells.length - 1, Math.floor(progress * (cells.length - 1)))];
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), new THREE.MeshBasicMaterial({ color: shipment.good === "food" ? 0xeec153 : shipment.good === "timber" ? 0x9c593a : 0x6b7089 }));
      cargo.position.copy(this.point(id, 0.65));
      this.cargoGroup.add(cargo);
    }
  }

  render(): void { this.controls.update(); this.renderer.render(this.scene, this.camera); }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private onPointerDown = (event: PointerEvent): void => { this.down = { x: event.clientX, y: event.clientY }; };
  private onPointerUp = (event: PointerEvent): void => {
    if (!this.down || Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6) return;
    this.down = null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.markers)[0];
    if (hit) this.select(hit.object.userData.settlementId as string);
  };

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material: THREE.Material) => material.dispose());
      }
      group.remove(child);
    }
  }

  dispose(): void {
    this.observer.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        if (!(object instanceof THREE.Sprite)) geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material: THREE.Material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => {
      if (material instanceof THREE.SpriteMaterial) material.map?.dispose();
      material.dispose();
    });
    this.renderer.dispose();
  }
}
