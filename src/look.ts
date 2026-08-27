import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export const SUN = new THREE.Vector3();

export function hashNoiseTexture(
  size: number,
  a: [number, number, number],
  b: [number, number, number],
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  const image = ctx.createImageData(size, size);
  const { data } = image;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n =
        Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 -
        Math.floor(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
      const n2 =
        Math.sin(x * 3.1 + y * 9.7) * 23421.13 -
        Math.floor(Math.sin(x * 3.1 + y * 9.7) * 23421.13);
      const t = n * 0.65 + n2 * 0.35;
      const i = (y * size + x) * 4;
      data[i] = a[0] + (b[0] - a[0]) * t;
      data[i + 1] = a[1] + (b[1] - a[1]) * t;
      data[i + 2] = a[2] + (b[2] - a[2]) * t;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createSky(): THREE.Object3D {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 6.5;
  uniforms.rayleigh.value = 2.4;
  uniforms.mieCoefficient.value = 0.005;
  uniforms.mieDirectionalG.value = 0.78;

  const elevation = 32;
  const azimuth = 205;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  SUN.setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(SUN);
  sky.material.fog = false;
  return sky;
}

export function createSkyDome(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, "#4aa0d8");
  gradient.addColorStop(0.42, "#f3d2a4");
  gradient.addColorStop(0.58, "#8ecbb8");
  gradient.addColorStop(1, "#2f6d6e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 16), material);
  mesh.renderOrder = -1;
  return mesh;
}

export function createEnvironment(renderer: THREE.WebGLRenderer, sky: THREE.Object3D): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return env;
}

export type WaterSystem = {
  mesh: THREE.Mesh;
  update: (time: number) => void;
};

export function createWater(): WaterSystem {
  const geometry = new THREE.CircleGeometry(780, 80);
  const material = new THREE.MeshStandardMaterial({
    color: 0x14838a,
    roughness: 0.22,
    metalness: 0.12,
    envMapIntensity: 0.85,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  return {
    mesh,
    update() {},
  };
}

export function createClouds(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfff4e4,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    flatShading: true,
  });
  const puff = new THREE.SphereGeometry(1, 7, 6);

  for (let i = 0; i < 12; i += 1) {
    const cloud = new THREE.Group();
    const count = 3 + (i % 3);
    for (let p = 0; p < count; p += 1) {
      const mesh = new THREE.Mesh(puff, mat);
      mesh.scale.set(2.8 + (p % 3) * 0.8, 0.75 + (p % 2) * 0.2, 1.6);
      mesh.position.set(p * 1.6 - 1.5, (p % 2) * 0.2, (p - 1) * 0.55);
      cloud.add(mesh);
    }
    const angle = (i / 12) * Math.PI * 2;
    const radius = 52 + (i % 5) * 14;
    cloud.position.set(Math.cos(angle) * radius, 16 + (i % 4) * 2.2, Math.sin(angle) * radius);
    cloud.userData.speed = 0.08 + (i % 3) * 0.03;
    cloud.userData.radius = radius;
    cloud.userData.angle = angle;
    group.add(cloud);
  }
  return group;
}

export function createMountains(): THREE.Group {
  const group = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({
    color: 0x2d4450,
    roughness: 0.95,
    flatShading: true,
  });
  const snow = new THREE.MeshStandardMaterial({
    color: 0xe8eef2,
    roughness: 0.7,
    flatShading: true,
  });

  for (let i = 0; i < 10; i += 1) {
    const peak = new THREE.Group();
    const h = 5 + (i % 5) * 1.6;
    const base = new THREE.Mesh(new THREE.ConeGeometry(3.2 + (i % 3), h, 5), rock);
    base.position.y = h * 0.35;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3 + (i % 2) * 0.3, h * 0.28, 5), snow);
    cap.position.y = h * 0.7;
    peak.add(base, cap);
    const angle = (i / 10) * Math.PI * 2 + 0.35;
    const dist = 30 + (i % 4) * 2.5;
    peak.position.set(Math.cos(angle) * dist, -0.4, Math.sin(angle) * dist);
    peak.rotation.y = angle;
    group.add(peak);
  }
  return group;
}

export function createShoreFoam(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(11.6, 13.8, 80),
    new THREE.MeshStandardMaterial({
      color: 0xe8f8f4,
      transparent: true,
      opacity: 0.34,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.035;
  return mesh;
}

export function createStars(): THREE.Points {
  const count = 500;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.65 + 0.15);
    const radius = 170;
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xe8f0ff,
    size: 0.35,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  return stars;
}

export function sunFromHour(hour: number, target: THREE.Vector3): void {
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI) * 58;
  const azimuth = 15 + hour * 15;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  target.setFromSphericalCoords(1, phi, theta);
}

export function createHexRing(radius: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0.01, Math.sin(a) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xc8ffe4,
      transparent: true,
      opacity: 0.95,
    }),
  );
}
