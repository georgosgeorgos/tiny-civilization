import * as THREE from "three";

export type Weather = "clear" | "overcast" | "rain" | "storm";

export class LivingWorld {
  readonly group = new THREE.Group();
  private readonly birds: THREE.Group[] = [];
  private readonly boats: THREE.Group[] = [];
  private readonly fish: THREE.Mesh[] = [];
  private readonly rain: THREE.Points;
  private readonly rainVel: Float32Array;
  weather: Weather = "clear";

  constructor() {
    const birdGeo = new THREE.ConeGeometry(0.06, 0.14, 3);
    const birdMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, flatShading: true });
    for (let i = 0; i < 14; i += 1) {
      const bird = new THREE.Group();
      const body = new THREE.Mesh(birdGeo, birdMat);
      body.rotation.x = Math.PI / 2;
      bird.add(body);
      bird.userData = {
        angle: (i / 14) * Math.PI * 2,
        radius: 8 + (i % 5) * 1.6,
        height: 4.2 + (i % 4) * 0.5,
        speed: 0.35 + (i % 3) * 0.12,
      };
      this.group.add(bird);
      this.birds.push(bird);
    }

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.8, flatShading: true });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7, flatShading: true });
    for (let i = 0; i < 6; i += 1) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.22), hullMat);
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 3), sailMat);
      sail.position.y = 0.28;
      boat.add(hull, sail);
      boat.userData = {
        angle: (i / 6) * Math.PI * 2,
        radius: 18 + (i % 3) * 8,
        speed: 0.08 + (i % 2) * 0.04,
      };
      this.group.add(boat);
      this.boats.push(boat);
    }

    const fishMat = new THREE.MeshStandardMaterial({
      color: 0x3aa0c8,
      emissive: 0x123040,
      roughness: 0.4,
      flatShading: true,
    });
    for (let i = 0; i < 10; i += 1) {
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), fishMat);
      fish.userData = { phase: i * 1.7, radius: 9 + (i % 4) * 2, speed: 0.9 + (i % 3) * 0.2 };
      this.group.add(fish);
      this.fish.push(fish);
    }

    const count = 900;
    const positions = new Float32Array(count * 3);
    this.rainVel = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      this.rainVel[i] = 12 + Math.random() * 10;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: 0xb7d4e8,
        size: 0.08,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.group.add(this.rain);
  }

  update(dt: number, time: number, origin: THREE.Vector3, weather: Weather): void {
    this.weather = weather;
    this.group.position.set(origin.x, 0, origin.z);

    for (const bird of this.birds) {
      bird.userData.angle += dt * bird.userData.speed;
      const a = bird.userData.angle as number;
      const r = bird.userData.radius as number;
      bird.position.set(Math.cos(a) * r, bird.userData.height + Math.sin(time + a) * 0.25, Math.sin(a) * r);
      bird.rotation.y = -a + Math.PI / 2;
    }

    for (const boat of this.boats) {
      boat.userData.angle += dt * boat.userData.speed * (weather === "storm" ? 1.6 : 1);
      const a = boat.userData.angle as number;
      const r = boat.userData.radius as number;
      boat.position.set(Math.cos(a) * r, 0.08 + Math.sin(time * 2 + a) * 0.04, Math.sin(a) * r);
      boat.rotation.y = -a + Math.PI / 2;
      boat.rotation.z = Math.sin(time * 1.4 + a) * (weather === "storm" ? 0.18 : 0.05);
    }

    for (const fish of this.fish) {
      const a = time * fish.userData.speed + fish.userData.phase;
      const r = fish.userData.radius as number;
      const hop = Math.max(0, Math.sin(a * 2)) * 0.55;
      fish.position.set(Math.cos(a) * r, hop, Math.sin(a) * r);
      fish.rotation.z = hop > 0.05 ? -0.6 : 0.2;
      fish.visible = hop > 0.02;
    }

    const raining = weather === "rain" || weather === "storm";
    const mat = this.rain.material as THREE.PointsMaterial;
    mat.opacity = raining ? (weather === "storm" ? 0.55 : 0.32) : 0;
    this.rain.visible = raining;
    if (raining) {
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        let y = pos.getY(i) - this.rainVel[i] * dt * (weather === "storm" ? 1.5 : 1);
        if (y < 0) y = 16 + Math.random() * 4;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  }
}
