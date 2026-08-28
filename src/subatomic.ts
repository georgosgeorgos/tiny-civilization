import * as THREE from "three";

export type SubatomicSystem = {
  group: THREE.Group;
  update: (time: number) => void;
};

/** A scientific lens rather than a second game: the same world is observed as
 * energy, bonds, and probability clouds at a radically different scale. */
export function createSubatomicSystem(seed: number): SubatomicSystem {
  const group = new THREE.Group();
  group.visible = false;
  const nucleus = new THREE.Group();
  const proton = new THREE.MeshStandardMaterial({ color: 0xff7467, emissive: 0x9d211d, emissiveIntensity: 1.3, roughness: 0.35 });
  const neutron = new THREE.MeshStandardMaterial({ color: 0x9a83ff, emissive: 0x30218d, emissiveIntensity: 1.1, roughness: 0.4 });
  for (let index = 0; index < 19; index += 1) {
    const phi = index * 2.39996;
    const radius = 4 + (index % 4) * 1.45;
    const particle = new THREE.Mesh(new THREE.IcosahedronGeometry(1.48, 1), index % 2 ? proton : neutron);
    particle.position.set(Math.cos(phi) * radius, Math.sin(phi * 1.7) * radius * 0.58, Math.sin(phi) * radius * 0.52);
    nucleus.add(particle);
  }
  group.add(nucleus);

  const electrons: THREE.Mesh[] = [];
  const electronMaterial = new THREE.MeshBasicMaterial({ color: 0x91ecff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let shell = 0; shell < 3; shell += 1) {
    const radius = 18 + shell * 13;
    const points: THREE.Vector3[] = [];
    for (let step = 0; step <= 96; step += 1) {
      const angle = (step / 96) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * (0.24 + shell * 0.08), Math.sin(angle) * radius * 0.56));
    }
    const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x2a7fa1, transparent: true, opacity: 0.52 }));
    orbit.rotation.set(shell * 0.73, shell * 1.1, shell * 0.42);
    group.add(orbit);
    for (let electronIndex = 0; electronIndex < shell + 2; electronIndex += 1) {
      const electron = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 9), electronMaterial);
      electron.userData.shell = shell;
      electron.userData.phase = electronIndex / (shell + 2) * Math.PI * 2 + seed * 0.001;
      electron.userData.orbit = orbit;
      group.add(electron);
      electrons.push(electron);
    }
  }

  const cloudPoints = new Float32Array(1300 * 3);
  for (let index = 0; index < 1300; index += 1) {
    const phase = index * 2.39996 + seed;
    const radius = 16 + (index % 43) * 0.82;
    cloudPoints.set([
      Math.cos(phase) * radius,
      Math.sin(phase * 1.73) * radius * 0.45,
      Math.sin(phase) * radius * 0.7,
    ], index * 3);
  }
  const cloud = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(cloudPoints, 3)),
    new THREE.PointsMaterial({ color: 0x4a9dd1, size: 0.36, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(cloud);

  return {
    group,
    update(time) {
      nucleus.rotation.y = time * 0.18;
      nucleus.rotation.x = Math.sin(time * 0.19) * 0.12;
      cloud.rotation.y = -time * 0.035;
      cloud.rotation.z = time * 0.017;
      for (const electron of electrons) {
        const shell = electron.userData.shell as number;
        const phase = (electron.userData.phase as number) + time * (0.85 - shell * 0.14);
        const radius = 18 + shell * 13;
        const local = new THREE.Vector3(Math.cos(phase) * radius, Math.sin(phase) * radius * (0.24 + shell * 0.08), Math.sin(phase) * radius * 0.56);
        electron.position.copy(local.applyEuler((electron.userData.orbit as THREE.Line).rotation));
      }
    },
  };
}
