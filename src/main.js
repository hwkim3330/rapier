import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(9, 7, 10);
camera.lookAt(0, 2, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(7, 12, 6);
dirLight.castShadow = true;
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.BoxGeometry(20, 1, 20),
  new THREE.MeshStandardMaterial({ color: '#94a3b8' })
);
ground.position.set(0, -0.5, 0);
ground.receiveShadow = true;
scene.add(ground);

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10), groundBody);

const dynamicBodies = [];
const boxGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);

for (let i = 0; i < 50; i++) {
  const x = (Math.random() - 0.5) * 4;
  const y = 2 + i * 0.75;
  const z = (Math.random() - 0.5) * 4;

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.35, 0.35, 0.35).setRestitution(0.25), body);

  const mesh = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${180 + i * 3}, 70%, 55%)`) })
  );
  mesh.castShadow = true;
  scene.add(mesh);

  dynamicBodies.push({ body, mesh });
}

function tick() {
  world.step();

  for (const { body, mesh } of dynamicBodies) {
    const p = body.translation();
    const r = body.rotation();
    mesh.position.set(p.x, p.y, p.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
