import * as THREE from "three";
import type { BuildingId } from "./buildings";
import type { ArchStyle } from "./world";

const bark = new THREE.MeshStandardMaterial({ color: 0x5c3a24, roughness: 0.9, flatShading: true });
const pine = new THREE.MeshStandardMaterial({ color: 0x14532e, roughness: 0.75, flatShading: true });
const roundLeaf = new THREE.MeshStandardMaterial({ color: 0x3f9a3c, roughness: 0.7, flatShading: true });
const stone = new THREE.MeshStandardMaterial({ color: 0x7a766c, roughness: 0.95, flatShading: true });
const darkStone = new THREE.MeshStandardMaterial({ color: 0x4e535a, roughness: 0.9, flatShading: true });
const cropGreen = new THREE.MeshStandardMaterial({ color: 0x7bc44a, roughness: 0.7, flatShading: true });
const cropRipe = new THREE.MeshStandardMaterial({ color: 0xe2c84a, roughness: 0.65, flatShading: true });

function shadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeHexColumn(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(0.9, 1.04, 1, 6);
  geometry.rotateY(Math.PI / 6);
  return geometry;
}

export function makeCliffMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8a6240,
    roughness: 0.96,
    metalness: 0.02,
    flatShading: true,
  });
}

export function makeGrassMaterial(tint: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
  });
}

export function makeSandMaterial(tint: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
}

export function makePavementMaterial(tint: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.52,
    metalness: 0.16,
    flatShading: true,
  });
}

export function makePine(): THREE.Group {
  const group = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 5), bark));
  trunk.position.y = 0.11;
  const lower = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.28, 6), pine));
  lower.position.y = 0.3;
  const mid = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 6), pine));
  mid.position.y = 0.46;
  const top = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 6), pine));
  top.position.y = 0.6;
  group.add(trunk, lower, mid, top);
  group.userData.sway = true;
  return group;
}

export function makeRoundTree(): THREE.Group {
  const group = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.2, 5), bark));
  trunk.position.y = 0.1;
  const crown = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), roundLeaf));
  crown.position.y = 0.34;
  crown.scale.set(1.15, 0.95, 1.1);
  group.add(trunk, crown);
  group.userData.sway = true;
  return group;
}

export function makeRocks(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const rock = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + i * 0.03, 0), stone));
    rock.position.set((i - 1) * 0.12, 0.06 + i * 0.02, (i % 2) * 0.08 - 0.04);
    rock.rotation.set(i * 0.4, i * 0.8, 0.2);
    group.add(rock);
  }
  return group;
}

export function makeTent(): THREE.Group {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.9, flatShading: true });
  const pole = new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.85, flatShading: true });
  const canvas = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.34, 4), hide));
  canvas.position.y = 0.2;
  const stick = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.38, 4), pole));
  stick.position.y = 0.2;
  group.add(canvas, stick);
  return group;
}

export function makeSheep(): THREE.Group {
  const group = new THREE.Group();
  const wool = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.95, flatShading: true });
  const face = new THREE.MeshStandardMaterial({ color: 0x3a3030, roughness: 0.8, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), wool));
  body.position.y = 0.12;
  body.scale.set(1.2, 0.85, 0.9);
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), face));
  head.position.set(0.1, 0.14, 0);
  const legGeo = new THREE.BoxGeometry(0.02, 0.07, 0.02);
  for (const [x, z] of [
    [-0.05, 0.04],
    [0.04, 0.04],
    [-0.05, -0.04],
    [0.04, -0.04],
  ] as const) {
    const leg = shadow(new THREE.Mesh(legGeo, face));
    leg.position.set(x, 0.04, z);
    group.add(leg);
  }
  group.add(body, head);
  group.userData.leftLeg = group.children[0];
  group.userData.rightLeg = group.children[1];
  return group;
}

export function makeGoat(): THREE.Group {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0xc4b496, roughness: 0.9, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.85, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), hide));
  body.position.y = 0.12;
  const head = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), hide));
  head.position.set(0.1, 0.16, 0);
  const horn = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 4), dark));
  horn.position.set(0.1, 0.22, 0.015);
  group.add(body, head, horn);
  return group;
}

export function makeHut(): THREE.Group {
  const group = new THREE.Group();
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe7d3b0, roughness: 0.85, flatShading: true });
  const timber = new THREE.MeshStandardMaterial({ color: 0x6b3e22, roughness: 0.8, flatShading: true });
  const thatch = new THREE.MeshStandardMaterial({ color: 0xc48a3a, roughness: 0.95, flatShading: true });
  const thatchDark = new THREE.MeshStandardMaterial({ color: 0x8d5a20, roughness: 0.95, flatShading: true });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.7, flatShading: true });

  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.08, 8), stone));
  base.position.y = 0.04;
  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.3, 8), plaster));
  body.position.y = 0.22;
  const beam = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), timber));
  beam.position.set(0.16, 0.22, 0.16);
  const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.3, 8), thatch));
  roof.position.y = 0.5;
  const cap = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 8), thatchDark));
  cap.position.y = 0.66;
  const door = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), doorMat));
  door.position.set(0, 0.16, 0.24);
  const window = shadow(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x9fd7ff, emissive: 0xffc978, emissiveIntensity: 0.2, roughness: 0.3 }),
    ),
  );
  window.position.set(0.16, 0.26, 0.18);
  window.userData.nightLight = true;

  const smoke = makeSmoke();
  smoke.position.set(0.08, 0.7, -0.04);
  group.add(base, body, beam, roof, cap, door, window, smoke);
  return group;
}

export function makeSmoke(): THREE.Group {
  const group = new THREE.Group();
  group.userData.smokeStack = true;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb8c0c6,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < 3; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), mat.clone());
    puff.userData.smoke = i;
    puff.castShadow = false;
    group.add(puff);
  }
  return group;
}

export function makeFlowers(hash: number): THREE.Group {
  const group = new THREE.Group();
  const colors = [0xe86a8a, 0xf2d35b, 0xf7f3ea, 0x7ec8e8, 0xc97ae0];
  for (let i = 0; i < 6; i += 1) {
    const hx = ((hash * (i + 3) * 12.9898) % 1) - 0.5;
    const hz = ((hash * (i + 7) * 78.233) % 1) - 0.5;
    const stem = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.07, 4), cropGreen));
    stem.position.set(hx * 0.5, 0.04, hz * 0.5);
    const bloom = shadow(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 5, 4),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.55, flatShading: true }),
      ),
    );
    bloom.position.set(stem.position.x, 0.085, stem.position.z);
    group.add(stem, bloom);
  }
  return group;
}

export function makeFarm(): THREE.Group {
  const group = new THREE.Group();
  const dirt = new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 1, flatShading: true });
  const barn = new THREE.MeshStandardMaterial({ color: 0xd9cbb6, roughness: 0.8, flatShading: true });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8b3a2c, roughness: 0.75, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.85, flatShading: true });

  const plot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 6), dirt));
  plot.rotation.y = Math.PI / 6;
  plot.position.y = 0.04;
  group.add(plot);

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const plant = shadow(
        new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), col % 2 === 0 ? cropGreen : cropRipe),
      );
      plant.position.set(-0.18 + col * 0.09, 0.1, -0.12 + row * 0.1);
      plant.userData.crop = true;
      group.add(plant);
    }
  }

  const house = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.18), barn));
  house.position.set(0.22, 0.14, 0.18);
  const houseRoof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 4), roof));
  houseRoof.position.set(0.22, 0.28, 0.18);
  houseRoof.rotation.y = Math.PI / 4;
  group.add(house, houseRoof);

  for (let i = 0; i < 4; i += 1) {
    const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.12, 0.025), wood));
    post.position.set(-0.32 + i * 0.12, 0.1, 0.32);
    group.add(post);
  }
  const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.02), wood));
  rail.position.set(-0.14, 0.13, 0.32);
  group.add(rail);

  return group;
}

export function makeMine(): THREE.Group {
  const group = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({ color: 0x6a4530, roughness: 0.85, flatShading: true });
  const crystal = new THREE.MeshStandardMaterial({
    color: 0xffc85a,
    emissive: 0xffaa33,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.4,
    flatShading: true,
  });

  const mound = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), darkStone));
  mound.position.y = 0.16;
  mound.scale.set(1.15, 0.7, 1);
  group.add(mound);

  const hole = shadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x16181c })),
  );
  hole.position.set(-0.04, 0.26, 0.02);
  hole.rotation.x = 0.5;
  group.add(hole);

  const left = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), timber));
  left.position.set(-0.14, 0.22, 0.16);
  left.rotation.z = 0.35;
  const right = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), timber));
  right.position.set(0.14, 0.22, 0.16);
  right.rotation.z = -0.35;
  const beam = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.05), timber));
  beam.position.set(0, 0.36, 0.16);
  group.add(left, right, beam);

  for (let i = 0; i < 4; i += 1) {
    const gem = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.045 + (i % 2) * 0.015, 0), crystal));
    gem.position.set(0.12 + (i % 2) * 0.08, 0.18 + i * 0.04, -0.12 + i * 0.05);
    gem.rotation.set(0.4, i, 0.2);
    group.add(gem);
  }

  const cart = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), timber));
  cart.position.set(-0.22, 0.1, -0.18);
  group.add(cart);

  return group;
}

export function makeFishery(): THREE.Group {
  const group = new THREE.Group();
  const plank = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85, flatShading: true });
  const net = new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.7, transparent: true, opacity: 0.55, flatShading: true });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3a88b0, roughness: 0.7, flatShading: true });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe2d4be, roughness: 0.8, flatShading: true });

  const dock = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.28), plank));
  dock.position.set(0, 0.06, 0.12);
  const hut = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.24), plaster));
  hut.position.set(-0.12, 0.18, -0.08);
  const hutRoof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 4), roof));
  hutRoof.position.set(-0.12, 0.34, -0.08);
  hutRoof.rotation.y = Math.PI / 4;
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.38, 5), plank));
  pole.position.set(0.22, 0.22, 0.16);
  const mesh = shadow(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.18), net));
  mesh.position.set(0.22, 0.16, 0.22);
  mesh.rotation.x = -0.4;
  const crate = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), plank));
  crate.position.set(0.18, 0.12, -0.08);
  group.add(dock, hut, hutRoof, pole, mesh, crate);
  return group;
}

export function makeLumber(): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e28, roughness: 0.9, flatShading: true });
  const pale = new THREE.MeshStandardMaterial({ color: 0xc4a06a, roughness: 0.85, flatShading: true });
  const roof = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.8, flatShading: true });

  const shed = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.22), pale));
  shed.position.set(-0.16, 0.16, 0.1);
  const shedRoof = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.26), roof));
  shedRoof.position.set(-0.16, 0.28, 0.1);
  shedRoof.rotation.z = 0.12;
  group.add(shed, shedRoof);

  for (let i = 0; i < 5; i += 1) {
    const log = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.36, 6), wood));
    log.rotation.z = Math.PI / 2;
    log.position.set(0.16, 0.08 + (i % 2) * 0.06, -0.08 + i * 0.05);
    group.add(log);
  }
  const stump = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.08, 7), wood));
  stump.position.set(0.08, 0.06, 0.22);
  const axe = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), wood));
  axe.position.set(0.12, 0.16, 0.22);
  axe.rotation.z = 0.4;
  group.add(stump, axe);
  return group;
}

export function makeShrine(): THREE.Group {
  const group = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.55, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xf0c45c,
    emissive: 0xffaa33,
    emissiveIntensity: 0.55,
    roughness: 0.3,
    metalness: 0.35,
    flatShading: true,
  });

  const plinth = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 6), marble));
  plinth.rotation.y = Math.PI / 6;
  plinth.position.y = 0.04;
  const step = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 6), marble));
  step.rotation.y = Math.PI / 6;
  step.position.y = 0.1;
  for (let i = 0; i < 3; i += 1) {
    const col = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 6), marble));
    const a = (i / 3) * Math.PI * 2 + 0.4;
    col.position.set(Math.cos(a) * 0.16, 0.28, Math.sin(a) * 0.16);
    group.add(col);
  }
  const orb = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), gold));
  orb.position.y = 0.36;
  orb.userData.nightLight = true;
  orb.userData.shrineOrb = true;
  group.add(plinth, step, orb);
  return group;
}

export function makeMarket(): THREE.Group {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd45a2a, roughness: 0.75, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4e28, roughness: 0.9, flatShading: true });
  const stall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.24), wood));
  stall.position.y = 0.1;
  const postL = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), wood));
  postL.position.set(-0.18, 0.22, 0);
  const postR = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), wood));
  postR.position.set(0.18, 0.22, 0);
  const awning = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.28), cloth));
  awning.position.y = 0.36;
  awning.rotation.z = 0.08;
  const crate = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), wood));
  crate.position.set(0.08, 0.18, 0.02);
  group.add(stall, postL, postR, awning, crate);
  return group;
}

export function makeOrchard(): THREE.Group {
  const group = new THREE.Group();
  const dirt = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 1, flatShading: true });
  const plot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 6), dirt));
  plot.rotation.y = Math.PI / 6;
  plot.position.y = 0.03;
  group.add(plot);
  for (let i = 0; i < 3; i += 1) {
    const tree = makeRoundTree();
    tree.scale.setScalar(0.55);
    const a = (i / 3) * Math.PI * 2;
    tree.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16);
    group.add(tree);
  }
  return group;
}

export function makeForge(): THREE.Group {
  const group = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({ color: 0x8a4a38, roughness: 0.9, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.45, metalness: 0.4, flatShading: true });
  const kiln = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 6), brick));
  kiln.position.y = 0.16;
  const chimney = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 5), brick));
  chimney.position.set(0.08, 0.38, -0.04);
  const glow = shadow(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xff6a20, emissive: 0xff3b00, emissiveIntensity: 0.9, roughness: 0.4 }),
    ),
  );
  glow.position.set(0, 0.16, 0.18);
  glow.userData.nightLight = true;
  const anvil = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), iron));
  anvil.position.set(-0.2, 0.1, 0.08);
  group.add(kiln, chimney, glow, anvil);
  const smoke = makeSmoke();
  smoke.position.set(0.08, 0.5, -0.04);
  group.add(smoke);
  return group;
}

function glassWindow(w: number, h: number, color = 0x8ec8ff): THREE.Mesh {
  const pane = shadow(
    new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.03),
      new THREE.MeshStandardMaterial({
        color,
        emissive: 0x7ec8ff,
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.45,
      }),
    ),
  );
  pane.userData.nightLight = true;
  return pane;
}

function makeAdobeHouse(): THREE.Group {
  const group = new THREE.Group();
  const clay = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.95, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.36), clay));
  body.position.y = 0.18;
  const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.4), clay));
  roof.position.y = 0.34;
  const door = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.03), dark));
  door.position.set(0, 0.14, 0.19);
  group.add(body, roof, door, glassWindow(0.08, 0.08));
  group.children[3].position.set(0.14, 0.22, 0.19);
  return group;
}

function makeIceCabin(): THREE.Group {
  const group = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.88, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.7, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.32), timber));
  body.position.y = 0.16;
  const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 4), snow));
  roof.position.y = 0.38;
  roof.rotation.y = Math.PI / 4;
  group.add(body, roof, glassWindow(0.07, 0.07));
  group.children[2].position.set(0.12, 0.2, 0.17);
  return group;
}

function makeAshHut(): THREE.Group {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a38, roughness: 0.9, flatShading: true });
  const soot = new THREE.MeshStandardMaterial({ color: 0x2a2424, roughness: 0.85, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 6), dark));
  body.position.y = 0.18;
  const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 6), soot));
  roof.position.y = 0.4;
  group.add(body, roof, glassWindow(0.06, 0.06, 0xffc070));
  group.children[2].position.set(0.12, 0.22, 0.16);
  return group;
}

function makeStoneHouse(): THREE.Group {
  const group = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({ color: 0xc4bcae, roughness: 0.75, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.34), marble));
  body.position.y = 0.16;
  const ped = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.38), marble));
  ped.position.y = 0.32;
  group.add(body, ped);
  return group;
}

function makeMetroHut(): THREE.Group {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.55, metalness: 0.12, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.35, metalness: 0.55, flatShading: true });
  const lower = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.32), concrete));
  lower.position.y = 0.2;
  const upper = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.28), concrete));
  upper.position.y = 0.5;
  const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.3), steel));
  roof.position.y = 0.66;
  const w1 = glassWindow(0.11, 0.11);
  w1.position.set(0.13, 0.22, 0.17);
  const w2 = glassWindow(0.09, 0.1);
  w2.position.set(-0.08, 0.5, 0.15);
  const w3 = glassWindow(0.09, 0.1);
  w3.position.set(0.1, 0.5, 0.15);
  group.add(lower, upper, roof, w1, w2, w3);
  return group;
}

function makeMetroFarm(): THREE.Group {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x6a7380, roughness: 0.4, metalness: 0.5, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xb8e8ff,
    transparent: true,
    opacity: 0.45,
    roughness: 0.1,
    metalness: 0.3,
    flatShading: true,
  });
  const house = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.36), glass));
  house.position.y = 0.18;
  const bar = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.03, 0.04), frame));
  bar.position.y = 0.33;
  group.add(house, bar);
  for (let i = 0; i < 6; i += 1) {
    const plant = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), cropGreen));
    plant.position.set(-0.16 + (i % 3) * 0.12, 0.12, -0.08 + Math.floor(i / 3) * 0.12);
    plant.userData.crop = true;
    group.add(plant);
  }
  return group;
}

function makeMetroMine(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.4, metalness: 0.55, flatShading: true });
  const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.28), steel));
  base.position.y = 0.1;
  const mast = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), steel));
  mast.position.y = 0.38;
  const arm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.05), steel));
  arm.position.set(0.12, 0.58, 0);
  group.add(base, mast, arm);
  return group;
}

function makeMetroFishery(): THREE.Group {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb0b6be, roughness: 0.6, flatShading: true });
  const dock = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.3), concrete));
  dock.position.y = 0.05;
  const shed = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.22), concrete));
  shed.position.set(-0.12, 0.18, -0.02);
  const w = glassWindow(0.1, 0.08);
  w.position.set(-0.12, 0.2, 0.1);
  group.add(dock, shed, w);
  return group;
}

function makeMetroLumber(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a7380, roughness: 0.45, metalness: 0.4, flatShading: true });
  const shed = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.24), steel));
  shed.position.y = 0.14;
  group.add(shed);
  for (let i = 0; i < 4; i += 1) {
    const plank = shadow(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.03, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.9, flatShading: true }),
      ),
    );
    plank.position.set(0.18, 0.06 + i * 0.035, -0.12);
    group.add(plank);
  }
  return group;
}

function makeMetroShrine(): THREE.Group {
  const group = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({
    color: 0xa8d8f0,
    roughness: 0.12,
    metalness: 0.4,
    transparent: true,
    opacity: 0.7,
    flatShading: true,
  });
  const cube = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), glass));
  cube.position.y = 0.22;
  const spire = shadow(
    new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0x88d0ff, emissiveIntensity: 0.6, metalness: 0.5 }),
    ),
  );
  spire.position.y = 0.48;
  spire.userData.nightLight = true;
  spire.userData.shrineOrb = true;
  group.add(cube, spire);
  return group;
}

function makeMetroMarket(): THREE.Group {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.5, flatShading: true });
  const canopy = new THREE.MeshStandardMaterial({ color: 0x3a88c8, roughness: 0.4, metalness: 0.2, flatShading: true });
  const hall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), concrete));
  hall.position.y = 0.14;
  const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.34), canopy));
  roof.position.y = 0.27;
  const w = glassWindow(0.28, 0.12);
  w.position.set(0, 0.14, 0.16);
  group.add(hall, roof, w);
  return group;
}

function makeMetroOrchard(): THREE.Group {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xc8ccc4, roughness: 0.7, flatShading: true });
  const plot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), stone));
  plot.position.y = 0.03;
  group.add(plot);
  for (let i = 0; i < 3; i += 1) {
    const tree = makeRoundTree();
    tree.scale.setScalar(0.45);
    const a = (i / 3) * Math.PI * 2;
    tree.position.set(Math.cos(a) * 0.14, 0.04, Math.sin(a) * 0.14);
    group.add(tree);
  }
  return group;
}

function makeMetroForge(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a535c, roughness: 0.4, metalness: 0.5, flatShading: true });
  const hall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.3), steel));
  hall.position.y = 0.16;
  const stack = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.36, 6), steel));
  stack.position.set(0.12, 0.42, -0.04);
  const glow = glassWindow(0.12, 0.08, 0xff8a40);
  glow.position.set(0, 0.16, 0.16);
  group.add(hall, stack, glow);
  const smoke = makeSmoke();
  smoke.position.set(0.12, 0.6, -0.04);
  group.add(smoke);
  return group;
}

function makeHarborHut(): THREE.Group {
  const group = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({ color: 0xa45a48, roughness: 0.85, flatShading: true });
  const slate = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.6, metalness: 0.15, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.3), brick));
  body.position.y = 0.18;
  const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.34), slate));
  roof.position.y = 0.35;
  roof.rotation.z = 0.08;
  const w = glassWindow(0.08, 0.08, 0xffe0a0);
  w.position.set(0.1, 0.2, 0.16);
  group.add(body, roof, w);
  return group;
}

function makeHarborFishery(): THREE.Group {
  const group = new THREE.Group();
  const plank = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.88, flatShading: true });
  const brick = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.85, flatShading: true });
  const dock = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.07, 0.32), plank));
  dock.position.set(0, 0.06, 0.1);
  const ware = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.28), brick));
  ware.position.set(-0.12, 0.2, -0.08);
  group.add(dock, ware);
  return group;
}

function makeHarborMarket(): THREE.Group {
  const group = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({ color: 0xb45a42, roughness: 0.85, flatShading: true });
  const hall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.28), brick));
  hall.position.y = 0.14;
  const arch = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.04), brick));
  arch.position.set(0, 0.14, 0.16);
  group.add(hall, arch);
  return group;
}

function makeHarborForge(): THREE.Group {
  const group = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({ color: 0x6a4038, roughness: 0.88, flatShading: true });
  const hall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.28), brick));
  hall.position.y = 0.16;
  const stack = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), brick));
  stack.position.set(0.1, 0.4, -0.04);
  group.add(hall, stack);
  const smoke = makeSmoke();
  smoke.position.set(0.1, 0.55, -0.04);
  group.add(smoke);
  return group;
}

function makeMetroBuilding(id: BuildingId): THREE.Group {
  if (id === "hut") return makeMetroHut();
  if (id === "farm") return makeMetroFarm();
  if (id === "mine") return makeMetroMine();
  if (id === "fishery") return makeMetroFishery();
  if (id === "lumber") return makeMetroLumber();
  if (id === "shrine") return makeMetroShrine();
  if (id === "market") return makeMetroMarket();
  if (id === "orchard") return makeMetroOrchard();
  return makeMetroForge();
}

function makeHarborBuilding(id: BuildingId): THREE.Group {
  if (id === "hut") return makeHarborHut();
  if (id === "fishery") return makeHarborFishery();
  if (id === "market") return makeHarborMarket();
  if (id === "forge") return makeHarborForge();
  return makeMetroBuilding(id);
}

export function makeBuilding(id: BuildingId, style: ArchStyle = "rustic"): THREE.Group {
  if (style === "metro") return makeMetroBuilding(id);
  if (style === "harbor") return makeHarborBuilding(id);
  if (id === "hut" && style === "adobe") return makeAdobeHouse();
  if (id === "hut" && style === "ice") return makeIceCabin();
  if (id === "hut" && style === "ash") return makeAshHut();
  if (id === "hut" && style === "ancient") return makeStoneHouse();
  if (id === "hut") return makeHut();
  if (id === "farm") return makeFarm();
  if (id === "mine") return makeMine();
  if (id === "fishery") return makeFishery();
  if (id === "lumber") return makeLumber();
  if (id === "shrine") return makeShrine();
  if (id === "market") return makeMarket();
  if (id === "orchard") return makeOrchard();
  return makeForge();
}

export function ghostify(root: THREE.Object3D, color: number): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = Array.isArray(object.material) ? object.material[0] : object.material;
    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      roughness: 0.5,
      depthWrite: false,
      emissive: color,
      emissiveIntensity: 0.2,
    });
    if (source instanceof THREE.MeshStandardMaterial) {
      material.color.copy(source.color);
    }
    object.material = material;
    object.castShadow = false;
  });
}

export function applySeasonPalette(season: "Spring" | "Summer" | "Autumn" | "Winter"): void {
  if (season === "Winter") {
    pine.color.setHex(0x6d7a68);
    roundLeaf.color.setHex(0xd5ddd3);
    cropGreen.color.setHex(0x8a8a70);
    cropRipe.color.setHex(0xcfc7a4);
  } else if (season === "Autumn") {
    pine.color.setHex(0x2a5a30);
    roundLeaf.color.setHex(0xc45e1c);
    cropGreen.color.setHex(0xb7a03a);
    cropRipe.color.setHex(0xe8b23a);
  } else if (season === "Spring") {
    pine.color.setHex(0x1a6a38);
    roundLeaf.color.setHex(0x58b34e);
    cropGreen.color.setHex(0x7ed45a);
    cropRipe.color.setHex(0xd6e07a);
  } else {
    pine.color.setHex(0x14532e);
    roundLeaf.color.setHex(0x3f9a3c);
    cropGreen.color.setHex(0x7bc44a);
    cropRipe.color.setHex(0xe2c84a);
  }
}

export type PersonRole =
  | "villager"
  | "farmer"
  | "miner"
  | "fisher"
  | "woodcutter"
  | "keeper"
  | "merchant"
  | "grower"
  | "smith";

const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const TUNICS: Record<PersonRole, number[]> = {
  villager: [0x3d7ea6, 0xb85c38, 0x6b8f3e, 0x7b4ea3],
  farmer: [0xd4a017, 0x6f8f2e, 0xc47a2a],
  miner: [0x4a5560, 0x6b5344, 0x3f4a52],
  fisher: [0x2a7aa8, 0x3d8eb8, 0x1f5f7a],
  woodcutter: [0x6a4a28, 0x8a6238, 0x4a3420],
  keeper: [0xe8dcc8, 0xd4c4a0, 0xf0e6d0],
  merchant: [0xc45a28, 0xd4783a, 0x8a3020],
  grower: [0x4a8a38, 0x6bb35a, 0x3d6a28],
  smith: [0x5a4038, 0x8a4a38, 0x3a3030],
};

export function makeHuman(role: PersonRole, seed: number): THREE.Group {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({
    color: SKINS[Math.floor(seed * SKINS.length) % SKINS.length],
    roughness: 0.7,
    flatShading: true,
  });
  const palette = TUNICS[role];
  const cloth = new THREE.MeshStandardMaterial({
    color: palette[Math.floor(seed * 17) % palette.length],
    roughness: 0.8,
    flatShading: true,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: seed > 0.55 ? 0x2b1d14 : 0x4a3728,
    roughness: 0.9,
    flatShading: true,
  });

  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 6), cloth));
  body.position.y = 0.145;
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), skin));
  head.position.y = 0.23;
  const haircap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.044, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), hair));
  haircap.position.y = 0.242;

  const leftArm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.08, 0.022), skin));
  leftArm.position.set(-0.06, 0.145, 0);
  leftArm.rotation.z = 0.18;
  const rightArm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.08, 0.022), skin));
  rightArm.position.set(0.06, 0.145, 0);
  rightArm.rotation.z = -0.18;

  const leftLeg = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.028), cloth));
  leftLeg.position.set(-0.022, 0.04, 0);
  const rightLeg = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.028), cloth));
  rightLeg.position.set(0.022, 0.04, 0);

  group.add(body, head, haircap, leftArm, rightArm, leftLeg, rightLeg);

  if (role === "farmer") {
    const hat = shadow(
      new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.05, 7),
        new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 0.9, flatShading: true }),
      ),
    );
    hat.position.y = 0.285;
    group.add(hat);
  }
  if (role === "miner") {
    const helm = shadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.05, 0.03, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.55, metalness: 0.25, flatShading: true }),
      ),
    );
    helm.position.y = 0.268;
    const lamp = shadow(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 6, 5),
        new THREE.MeshStandardMaterial({ color: 0xffc85a, emissive: 0xffaa33, emissiveIntensity: 0.8 }),
      ),
    );
    lamp.position.set(0, 0.268, 0.05);
    lamp.userData.nightLight = true;
    group.add(helm, lamp);
  }
  if (role === "fisher") {
    const cap = shadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.03, 7),
        new THREE.MeshStandardMaterial({ color: 0x2a6a88, roughness: 0.8, flatShading: true }),
      ),
    );
    cap.position.y = 0.27;
    group.add(cap);
  }
  if (role === "woodcutter") {
    const cap = shadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.055, 0.028, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9, flatShading: true }),
      ),
    );
    cap.position.y = 0.268;
    group.add(cap);
  }
  if (role === "keeper") {
    const sash = shadow(
      new THREE.Mesh(
        new THREE.TorusGeometry(0.05, 0.01, 5, 10),
        new THREE.MeshStandardMaterial({
          color: 0xf0c45c,
          emissive: 0xffaa33,
          emissiveIntensity: 0.4,
          roughness: 0.4,
          flatShading: true,
        }),
      ),
    );
    sash.position.y = 0.29;
    sash.rotation.x = Math.PI / 2;
    sash.userData.nightLight = true;
    group.add(sash);
  }
  if (role === "merchant") {
    const sash = shadow(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.04, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xf0c45c, roughness: 0.5, flatShading: true }),
      ),
    );
    sash.position.set(0, 0.16, 0.05);
    group.add(sash);
  }
  if (role === "grower") {
    const hat = shadow(
      new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.06, 6),
        new THREE.MeshStandardMaterial({ color: 0x3d6a28, roughness: 0.85, flatShading: true }),
      ),
    );
    hat.position.y = 0.29;
    group.add(hat);
  }
  if (role === "smith") {
    const apron = shadow(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.1, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x3a3030, roughness: 0.8, flatShading: true }),
      ),
    );
    apron.position.set(0, 0.13, 0.05);
    group.add(apron);
  }

  group.userData.leftLeg = leftLeg;
  group.userData.rightLeg = rightLeg;
  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;
  return group;
}

export function makeLavaMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xff5a1f,
    emissive: 0xff3b00,
    emissiveIntensity: 1.1,
    roughness: 0.45,
    metalness: 0.1,
    flatShading: true,
  });
}

export function makeVolcanoVent(): THREE.Group {
  const group = new THREE.Group();
  const lava = shadow(
    new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.08, 6), makeLavaMaterial()),
  );
  lava.position.y = 0.06;
  lava.userData.nightLight = true;
  const rim = shadow(
    new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.06, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2422, roughness: 1, flatShading: true }),
    ),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.08;
  group.add(lava, rim);
  return group;
}

export function makeRuinColumns(): THREE.Group {
  const group = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({ color: 0xc9c3b4, roughness: 0.7, flatShading: true });
  for (let i = 0; i < 3; i += 1) {
    const h = 0.28 + (i % 2) * 0.14;
    const col = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, h, 6), marble));
    const a = (i / 3) * Math.PI * 2;
    col.position.set(Math.cos(a) * 0.22, h / 2, Math.sin(a) * 0.22);
    col.rotation.z = (i - 1) * 0.12;
    group.add(col);
  }
  const slab = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.12), marble));
  slab.position.set(0.02, 0.08, -0.16);
  slab.rotation.z = 0.4;
  group.add(slab);
  return group;
}

export function makeCrystalCluster(): THREE.Group {
  const group = new THREE.Group();
  const gem = new THREE.MeshStandardMaterial({
    color: 0x7ae0ff,
    emissive: 0x3ad0ff,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.35,
    flatShading: true,
  });
  for (let i = 0; i < 4; i += 1) {
    const crystal = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.07 + (i % 2) * 0.04, 0), gem));
    crystal.position.set((i - 1.5) * 0.1, 0.12 + i * 0.03, (i % 2) * 0.1 - 0.05);
    crystal.rotation.set(0.3, i, 0.4);
    crystal.userData.nightLight = true;
    group.add(crystal);
  }
  return group;
}

export function makeStandingStones(): THREE.Group {
  const group = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.95, flatShading: true });
  const left = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), rock));
  left.position.set(-0.12, 0.17, 0);
  const right = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), rock));
  right.position.set(0.12, 0.15, 0);
  const lintel = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.1), rock));
  lintel.position.set(0, 0.36, 0);
  group.add(left, right, lintel);
  return group;
}

export function makeMesaButte(): THREE.Group {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb45a32, roughness: 0.95, flatShading: true });
  const top = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 6), red));
  top.position.y = 0.2;
  group.add(top);
  return group;
}

export function makeOasis(): THREE.Group {
  const group = new THREE.Group();
  const water = new THREE.MeshStandardMaterial({
    color: 0x3aa0b8,
    roughness: 0.2,
    metalness: 0.15,
    flatShading: true,
  });
  const pool = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 8), water));
  pool.position.y = 0.03;
  group.add(pool, makePalm());
  return group;
}

export function makePalm(): THREE.Group {
  const group = new THREE.Group();
  const trunk = shadow(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.045, 0.42, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.9, flatShading: true }),
    ),
  );
  trunk.position.y = 0.21;
  trunk.rotation.z = 0.12;
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.7, flatShading: true });
  for (let i = 0; i < 5; i += 1) {
    const frond = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 4), leaf));
    frond.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.08, 0.44, Math.sin((i / 5) * Math.PI * 2) * 0.08);
    frond.rotation.z = 0.9;
    frond.rotation.y = (i / 5) * Math.PI * 2;
    group.add(frond);
  }
  group.add(trunk);
  group.userData.sway = true;
  return group;
}

export function makeCactus(): THREE.Group {
  const group = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x3d8a48, roughness: 0.8, flatShading: true });
  const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6), green));
  body.position.y = 0.16;
  const arm = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 5), green));
  arm.position.set(0.08, 0.2, 0);
  arm.rotation.z = -0.7;
  group.add(body, arm);
  return group;
}

export function makeReeds(): THREE.Group {
  const group = new THREE.Group();
  const reed = new THREE.MeshStandardMaterial({ color: 0x6a7a38, roughness: 0.85, flatShading: true });
  for (let i = 0; i < 7; i += 1) {
    const blade = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.22 + (i % 3) * 0.06, 3), reed));
    blade.position.set((i - 3) * 0.05, 0.12, ((i * 3) % 5) * 0.03 - 0.06);
    blade.rotation.z = (i - 3) * 0.08;
    blade.userData.sway = true;
    group.add(blade);
  }
  return group;
}

export function makeIceSpire(): THREE.Group {
  const group = new THREE.Group();
  const ice = new THREE.MeshStandardMaterial({
    color: 0xd8eef8,
    roughness: 0.25,
    metalness: 0.2,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  const spire = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), ice));
  spire.position.y = 0.2;
  group.add(spire);
  return group;
}

export function makeRadioTower(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a7380, roughness: 0.4, metalness: 0.5, flatShading: true });
  const mast = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), steel));
  mast.position.y = 0.35;
  const light = shadow(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xff3344, emissiveIntensity: 1.1 }),
    ),
  );
  light.position.y = 0.72;
  light.userData.nightLight = true;
  group.add(mast, light);
  return group;
}

export function makeHarborCrane(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc4782a, roughness: 0.45, metalness: 0.35, flatShading: true });
  const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), steel));
  post.position.y = 0.25;
  const arm = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.06), steel));
  arm.position.set(0.18, 0.48, 0);
  group.add(post, arm);
  return group;
}

export function makeStreetLamp(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.4, flatShading: true });
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.42, 5), steel));
  pole.position.y = 0.21;
  const lamp = shadow(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffcc66, emissiveIntensity: 0.85 }),
    ),
  );
  lamp.position.y = 0.44;
  lamp.userData.nightLight = true;
  group.add(pole, lamp);
  return group;
}

export function makePlanter(): THREE.Group {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xa8aaa4, roughness: 0.8, flatShading: true });
  const box = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), stone));
  box.position.y = 0.04;
  const bush = shadow(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x3a8a48, roughness: 0.75, flatShading: true }),
    ),
  );
  bush.position.y = 0.14;
  group.add(box, bush);
  return group;
}

export type LandmarkKind = "vent" | "ruin" | "crystal" | "stone" | "mesa" | "oasis" | "tower" | "crane";

export function makeLandmark(kind: LandmarkKind): THREE.Group | null {
  if (kind === "vent") return makeVolcanoVent();
  if (kind === "ruin") return makeRuinColumns();
  if (kind === "crystal") return makeCrystalCluster();
  if (kind === "stone") return makeStandingStones();
  if (kind === "mesa") return makeMesaButte();
  if (kind === "oasis") return makeOasis();
  if (kind === "tower") return makeRadioTower();
  if (kind === "crane") return makeHarborCrane();
  return null;
}

export type DecorKind = "pine" | "round" | "rocks" | "palm" | "cactus" | "reeds" | "ice" | "lamp" | "planter";

export function makeTileDecor(kind: DecorKind, hash: number): THREE.Group {
  const group = new THREE.Group();
  if (kind === "lamp") {
    const lamp = makeStreetLamp();
    lamp.position.set((hash - 0.5) * 0.2, 0, ((hash * 2) % 1 - 0.5) * 0.2);
    group.add(lamp);
    return group;
  }
  if (kind === "planter") {
    const pot = makePlanter();
    pot.position.set((hash - 0.5) * 0.18, 0, ((hash * 3) % 1 - 0.5) * 0.18);
    group.add(pot);
    return group;
  }
  if (kind === "rocks") {
    const rocks = makeRocks();
    rocks.position.set((hash - 0.5) * 0.3, 0, (hash * 1.7 - 0.5) * 0.25);
    group.add(rocks);
    return group;
  }
  if (kind === "cactus") {
    const cactus = makeCactus();
    cactus.position.set((hash - 0.5) * 0.25, 0, ((hash * 2) % 1 - 0.5) * 0.25);
    cactus.scale.setScalar(0.85 + hash * 0.4);
    group.add(cactus);
    return group;
  }
  if (kind === "reeds") {
    group.add(makeReeds());
    return group;
  }
  if (kind === "ice") {
    const ice = makeIceSpire();
    ice.position.set((hash - 0.5) * 0.2, 0, ((hash * 3) % 1 - 0.5) * 0.2);
    ice.scale.setScalar(0.7 + hash * 0.5);
    group.add(ice);
    return group;
  }
  const tree = kind === "palm" ? makePalm() : kind === "pine" ? makePine() : makeRoundTree();
  tree.position.set((hash - 0.5) * 0.28, 0, ((hash * 2) % 1 - 0.5) * 0.28);
  tree.rotation.y = hash * Math.PI * 2;
  tree.scale.setScalar(0.85 + hash * 0.35);
  group.add(tree);
  if (hash > 0.72 && kind !== "palm") {
    const extra = hash > 0.88 ? makePine() : makeRoundTree();
    extra.position.set(-tree.position.x * 0.8, 0, -tree.position.z * 0.6);
    extra.scale.setScalar(0.7);
    group.add(extra);
  }
  return group;
}
