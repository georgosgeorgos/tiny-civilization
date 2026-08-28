import * as THREE from "three";

export type SpacecraftSystem = {
  group: THREE.Group;
  update: (time: number) => void;
};

function shadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A fixed orbital habitat surrounding the autonomous settlement deck. */
export function createSpacecraftSystem(): SpacecraftSystem {
  const group = new THREE.Group();
  group.name = "deep-space-habitat";

  const hull = new THREE.MeshStandardMaterial({ color: 0x202b38, roughness: 0.4, metalness: 0.82 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x7b8d9e, roughness: 0.28, metalness: 0.9 });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x17212b, roughness: 0.55, metalness: 0.62 });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x5fc8df, emissive: 0x176e94, emissiveIntensity: 1.25, roughness: 0.18, metalness: 0.55 });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x18386a, emissive: 0x0b3264, emissiveIntensity: 0.42, roughness: 0.24, metalness: 0.66 });
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: 0xffc26f, emissive: 0xff6a1c, emissiveIntensity: 2.2, roughness: 0.3 });

  const deck = shadow(new THREE.Mesh(new THREE.CylinderGeometry(18, 19.5, 0.42, 64), deckMaterial));
  deck.position.y = -0.58;
  group.add(deck);

  const outerRing = shadow(new THREE.Mesh(new THREE.TorusGeometry(18.2, 0.42, 10, 72), hull));
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = -0.26;
  group.add(outerRing);

  const innerRing = shadow(new THREE.Mesh(new THREE.TorusGeometry(13.8, 0.11, 8, 64), rim));
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = -0.21;
  group.add(innerRing);

  const spine = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 3.4, 12), hull));
  spine.position.set(0, -2.1, 0);
  group.add(spine);

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const x = Math.cos(angle) * 16.15;
    const z = Math.sin(angle) * 16.15;
    const window = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.42), windowMaterial));
    window.position.set(x, 0.18, z);
    window.rotation.y = -angle;
    group.add(window);

    const strut = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.55, 0.18), rim));
    strut.position.set(x, 0.42, z);
    group.add(strut);
  }

  for (const angle of [0.5, 2.1, 3.7, 5.3]) {
    const panel = shadow(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.08, 2.1), panelMaterial));
    panel.position.set(Math.cos(angle) * 21.1, -1.7, Math.sin(angle) * 21.1);
    panel.rotation.y = -angle;
    group.add(panel);
  }

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.2;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), beaconMaterial);
    beacon.position.set(Math.cos(angle) * 18.7, 0.42, Math.sin(angle) * 18.7);
    beacon.userData.phase = i * 0.8;
    group.add(beacon);
  }

  return {
    group,
    update(time) {
      group.rotation.y = Math.sin(time * 0.035) * 0.012;
      for (const object of group.children) {
        if (!(object instanceof THREE.Mesh) || object.userData.phase === undefined) continue;
        const material = object.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.8 + Math.sin(time * 2.4 + Number(object.userData.phase)) * 0.65;
      }
    },
  };
}
