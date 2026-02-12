import './style.css';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';

const canvas = document.getElementById('scene');
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const modelSelectEl = document.getElementById('modelSelect');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe2ecf9, 18, 70);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(-7, 5.5, 0);

const hemi = new THREE.HemisphereLight(0xf8fbff, 0x7c8aa0, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(9, 14, 11);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

const input = { forward: 0, turn: 0, turbo: false };
const pressed = new Set();

const onKey = (event, down) => {
  const k = event.key.toLowerCase();
  if (down) {
    pressed.add(k);
  } else {
    pressed.delete(k);
  }
  input.forward = (pressed.has('w') || pressed.has('arrowup') ? 1 : 0) + (pressed.has('s') || pressed.has('arrowdown') ? -1 : 0);
  input.turn = (pressed.has('a') || pressed.has('arrowleft') ? 1 : 0) + (pressed.has('d') || pressed.has('arrowright') ? -1 : 0);
  input.turbo = pressed.has('shift');
};

window.addEventListener('keydown', (e) => onKey(e, true));
window.addEventListener('keyup', (e) => onKey(e, false));

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;

const physicsMeshes = [];
const qTmp = new THREE.Quaternion();
const vTmp = new THREE.Vector3();

function addRigidMesh(body, mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  physicsMeshes.push({ body, mesh });
}

function makeFixedBox(x, y, z, hx, hy, hz, color = '#8b9bb2', rotY = 0) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) }));
  const collider = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(1.2);
  world.createCollider(collider, body);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
    new THREE.MeshStandardMaterial({ color })
  );
  addRigidMesh(body, mesh);
}

makeFixedBox(0, -0.6, 0, 25, 0.6, 25, '#9aadc4');
makeFixedBox(5.5, -0.2, 0, 2, 0.2, 2.5, '#6f8098', -0.42);
makeFixedBox(10.2, 0.18, 0.8, 1.7, 0.18, 2.1, '#6f8098', 0.18);
makeFixedBox(14.8, 0.58, -0.5, 1.5, 0.18, 2, '#6f8098', -0.28);

for (let i = 0; i < 28; i++) {
  const x = 6 + i * 0.9;
  const z = ((i % 4) - 1.5) * 0.75;
  const h = 0.2 + (i % 3) * 0.12;
  makeFixedBox(x, h * 0.5 - 0.02, z, 0.28, h * 0.5, 0.28, i % 2 ? '#5e7492' : '#4f6484');
}

const torsoBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.15, 0).setCanSleep(false).setAdditionalMass(8)
);
world.createCollider(RAPIER.ColliderDesc.cuboid(0.36, 0.09, 0.2).setDensity(1.2).setFriction(1.1), torsoBody);

const torsoMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.72, 0.18, 0.4),
  new THREE.MeshStandardMaterial({ color: '#203146', metalness: 0.25, roughness: 0.45 })
);
addRigidMesh(torsoBody, torsoMesh);

const headMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.14, 0.1, 0.2),
  new THREE.MeshStandardMaterial({ color: '#86a5cc', metalness: 0.15, roughness: 0.4 })
);
headMesh.position.set(0.4, 0.02, 0);
torsoMesh.add(headMesh);

const legDefs = [
  { name: 'FL', x: 0.26, z: 0.17, phase: 0 },
  { name: 'FR', x: 0.26, z: -0.17, phase: Math.PI },
  { name: 'RL', x: -0.26, z: 0.17, phase: Math.PI },
  { name: 'RR', x: -0.26, z: -0.17, phase: 0 }
];

const legs = [];
const upperLen = 0.2;
const lowerLen = 0.22;

for (const leg of legDefs) {
  const hipWorld = { x: leg.x, y: 1.07, z: leg.z };

  const upper = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(hipWorld.x, hipWorld.y - upperLen * 0.5, hipWorld.z));
  world.createCollider(RAPIER.ColliderDesc.capsule(upperLen * 0.35, 0.045).setDensity(0.7).setFriction(1.0), upper);

  const lower = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(hipWorld.x, hipWorld.y - upperLen - lowerLen * 0.5, hipWorld.z)
  );
  world.createCollider(RAPIER.ColliderDesc.capsule(lowerLen * 0.35, 0.04).setDensity(0.65).setFriction(1.3), lower);
  world.createCollider(RAPIER.ColliderDesc.ball(0.05).setTranslation(0, -lowerLen * 0.52, 0).setFriction(2.5).setRestitution(0.03), lower);

  const upperMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.045, upperLen * 0.7, 8, 14),
    new THREE.MeshStandardMaterial({ color: '#0d1b2e', roughness: 0.55 })
  );
  const lowerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.04, lowerLen * 0.7, 8, 14),
    new THREE.MeshStandardMaterial({ color: '#2f435e', roughness: 0.5 })
  );
  addRigidMesh(upper, upperMesh);
  addRigidMesh(lower, lowerMesh);

  const hipJoint = world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: leg.x, y: -0.04, z: leg.z }, { x: 0, y: upperLen * 0.45, z: 0 }, { x: 1, y: 0, z: 0 }),
    torsoBody,
    upper,
    true
  );
  hipJoint.setLimits(-0.65, 0.65);
  hipJoint.configureMotorModel(RAPIER.MotorModel.ForceBased);

  const kneeJoint = world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: 0, y: -upperLen * 0.45, z: 0 }, { x: 0, y: lowerLen * 0.45, z: 0 }, { x: 1, y: 0, z: 0 }),
    upper,
    lower,
    true
  );
  kneeJoint.setLimits(-1.35, 0.2);
  kneeJoint.configureMotorModel(RAPIER.MotorModel.ForceBased);

  legs.push({ ...leg, hipJoint, kneeJoint, upper, lower, upperMesh, lowerMesh });
}

for (let i = 0; i < 24; i++) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(4.8 + i * 0.5, 1.3 + i * 0.08, ((i % 3) - 1) * 0.5)
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.14, 0.14, 0.14).setDensity(0.35).setRestitution(0.15), body);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.28, 0.28),
    new THREE.MeshStandardMaterial({ color: i % 2 ? '#f59e0b' : '#94a3b8' })
  );
  addRigidMesh(body, mesh);
}

const chasePos = new THREE.Vector3();
const chaseLook = new THREE.Vector3();
const skinCache = new Map();
let activeSkinKey = 'a1';
let isLoadingSkin = false;

const MODEL_PRESETS = {
  a1: {
    label: 'Unitree A1',
    base: 'https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/robots/a1_description/meshes',
    color: { trunk: '#dbe4f2', thigh: '#b6c4d9', calf: '#a2b4cd' }
  },
  aliengo: {
    label: 'Unitree AlienGo',
    base: 'https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/robots/aliengo_description/meshes',
    color: { trunk: '#d7deeb', thigh: '#a7b8d0', calf: '#90a7c8' }
  },
  b2: {
    label: 'Unitree B2',
    base: 'https://raw.githubusercontent.com/unitreerobotics/unitree_ros/master/robots/b2_description/meshes',
    color: { trunk: '#ced8e8', thigh: '#9baec9', calf: '#839ab8' }
  },
  duckmini: {
    label: 'OpenDuck Mini',
    procedural: true,
    color: { trunk: '#ffd766', thigh: '#ffb14a', calf: '#ff9a3d' }
  }
};

function finalizeTemplate(root, targetMaxDim, tone = null) {
  const model = root.clone(true);
  model.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = new THREE.MeshStandardMaterial({
        color: tone || '#d4dce8',
        metalness: 0.2,
        roughness: 0.55
      });
    }
  });

  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetMaxDim / maxDim;
  model.scale.setScalar(s);

  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  return model;
}

function clearCurrentSkin() {
  while (torsoMesh.children.length) {
    torsoMesh.remove(torsoMesh.children[0]);
  }
  torsoMesh.add(headMesh);
  for (const leg of legs) {
    leg.upperMesh.clear();
    leg.lowerMesh.clear();
  }
  torsoMesh.visible = true;
  headMesh.visible = true;
  for (const leg of legs) {
    leg.upperMesh.visible = true;
    leg.lowerMesh.visible = true;
  }
}

async function loadSkinAssets(modelKey) {
  if (skinCache.has(modelKey)) {
    return skinCache.get(modelKey);
  }

  const preset = MODEL_PRESETS[modelKey];
  if (!preset) {
    throw new Error(`Unknown model preset: ${modelKey}`);
  }

  if (preset.procedural) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: preset.color.trunk,
      metalness: 0.08,
      roughness: 0.52
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: '#ff8a24',
      metalness: 0.04,
      roughness: 0.55
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#1f2937',
      metalness: 0.1,
      roughness: 0.62
    });

    const trunk = new THREE.Group();
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 28, 20), bodyMat);
    belly.scale.set(1.45, 1.0, 1.0);
    trunk.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 20), bodyMat);
    head.position.set(0.3, 0.1, 0);
    trunk.add(head);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 16), accentMat);
    beak.rotation.z = -Math.PI * 0.5;
    beak.position.set(0.43, 0.08, 0);
    trunk.add(beak);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), darkMat);
    const eyeR = eyeL.clone();
    eyeL.position.set(0.36, 0.14, 0.06);
    eyeR.position.set(0.36, 0.14, -0.06);
    trunk.add(eyeL, eyeR);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 18), bodyMat);
    tail.rotation.z = Math.PI * 0.75;
    tail.position.set(-0.36, 0.02, 0);
    trunk.add(tail);

    const thigh = new THREE.Group();
    const thighShell = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.14, 7, 14), accentMat);
    thighShell.rotation.z = Math.PI * 0.5;
    thigh.add(thighShell);

    const calf = new THREE.Group();
    const calfShell = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 7, 14), accentMat);
    calfShell.rotation.z = Math.PI * 0.5;
    calf.add(calfShell);

    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), darkMat);
    foot.scale.set(1.6, 0.55, 1.1);
    foot.position.set(0, -0.11, 0);
    calf.add(foot);

    const assets = { trunk, thigh, calf };
    skinCache.set(modelKey, assets);
    return assets;
  }

  const loader = new ColladaLoader();

  const loadDae = (url) =>
    new Promise((resolve, reject) => {
      loader.load(url, (data) => resolve(data.scene), undefined, reject);
    });

  const [trunkRaw, thighRaw, calfRaw] = await Promise.all([
    loadDae(`${preset.base}/trunk.dae`),
    loadDae(`${preset.base}/thigh.dae`),
    loadDae(`${preset.base}/calf.dae`)
  ]);

  const assets = {
    trunk: finalizeTemplate(trunkRaw, 0.9, preset.color.trunk),
    thigh: finalizeTemplate(thighRaw, 0.32, preset.color.thigh),
    calf: finalizeTemplate(calfRaw, 0.32, preset.color.calf)
  };
  skinCache.set(modelKey, assets);
  return assets;
}

async function applySkin(modelKey) {
  const preset = MODEL_PRESETS[modelKey];
  if (!preset) {
    return;
  }

  isLoadingSkin = true;
  statusEl.textContent = `Loading ${preset.label} skin...`;
  clearCurrentSkin();

  try {
    const assets = await loadSkinAssets(modelKey);
    const trunkVisual = assets.trunk.clone(true);
    trunkVisual.rotation.y = Math.PI * 0.5;
    trunkVisual.position.y += 0.02;
    torsoMesh.visible = false;
    headMesh.visible = false;
    torsoMesh.add(trunkVisual);

    for (const leg of legs) {
      const thighVisual = assets.thigh.clone(true);
      thighVisual.rotation.z = Math.PI * 0.5;
      thighVisual.position.y += 0.02;
      leg.upperMesh.visible = false;
      leg.upperMesh.add(thighVisual);

      const calfVisual = assets.calf.clone(true);
      calfVisual.rotation.z = Math.PI * 0.5;
      calfVisual.position.y -= 0.03;
      leg.lowerMesh.visible = false;
      leg.lowerMesh.add(calfVisual);
    }

    activeSkinKey = modelKey;
  } catch (err) {
    console.warn('Unitree skin load failed:', err);
    statusEl.textContent = `${preset.label} load failed, fallback render`;
  } finally {
    isLoadingSkin = false;
  }
}

async function initSkins() {
  modelSelectEl.addEventListener('change', async (event) => {
    const key = event.target.value;
    await applySkin(key);
  });

  window.addEventListener('keydown', async (event) => {
    const map = { '1': 'a1', '2': 'aliengo', '3': 'b2', '4': 'duckmini' };
    const key = map[event.key];
    if (!key) {
      return;
    }
    modelSelectEl.value = key;
    await applySkin(key);
  });

  await applySkin(activeSkinKey);
}

initSkins();

let t = 0;
const clock = new THREE.Clock();

function driveController(dt) {
  const boost = input.turbo ? 1.8 : 1;
  const gaitHz = (1.6 + Math.abs(input.forward) * 1.6 + Math.abs(input.turn) * 0.6) * boost;
  t += dt * gaitHz;

  const stride = (0.25 + Math.abs(input.forward) * 0.5) * boost;
  const kneeLift = 0.85 + Math.abs(input.forward) * 0.45;
  const damping = 7 + Math.abs(input.forward) * 6;
  const stiffness = 40 + Math.abs(input.forward) * 45;

  for (const leg of legs) {
    const cycle = t * Math.PI * 2 + leg.phase + input.turn * (leg.z > 0 ? 0.28 : -0.28);
    const hipTarget = Math.sin(cycle) * stride;
    const kneeTarget = -0.7 - Math.max(0, Math.cos(cycle)) * kneeLift;

    leg.hipJoint.configureMotorPosition(hipTarget, stiffness, damping);
    leg.kneeJoint.configureMotorPosition(kneeTarget, stiffness * 0.92, damping * 1.05);
  }

  const rbRot = torsoBody.rotation();
  qTmp.set(rbRot.x, rbRot.y, rbRot.z, rbRot.w);

  const forward = vTmp.set(1, 0, 0).applyQuaternion(qTmp).setY(0).normalize();
  const push = 10.5 * input.forward * boost;
  torsoBody.applyImpulse({ x: forward.x * push * dt, y: 0, z: forward.z * push * dt }, true);

  torsoBody.applyTorqueImpulse({ x: 0, y: input.turn * (0.38 + Math.abs(input.forward) * 0.12) * boost * dt, z: 0 }, true);

  if (pressed.has(' ')) {
    torsoBody.applyImpulse({ x: 0, y: 0.7, z: 0 }, true);
  }
}

function updateCamera() {
  const pos = torsoBody.translation();
  const rot = torsoBody.rotation();
  qTmp.set(rot.x, rot.y, rot.z, rot.w);

  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(qTmp).setY(0).normalize();
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(qTmp).setY(0).normalize();

  chasePos.set(pos.x, pos.y, pos.z).addScaledVector(forward, -3.6).addScaledVector(side, 1.2).add(new THREE.Vector3(0, 2.0, 0));
  chaseLook.set(pos.x, pos.y + 0.2, pos.z).addScaledVector(forward, 2.2);

  camera.position.lerp(chasePos, 0.08);
  camera.lookAt(chaseLook);
}

function syncMeshes() {
  for (const entry of physicsMeshes) {
    const p = entry.body.translation();
    const r = entry.body.rotation();
    entry.mesh.position.set(p.x, p.y, p.z);
    entry.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

function updateHud() {
  const vel = torsoBody.linvel();
  const speed = Math.hypot(vel.x, vel.z);
  const mode = input.turbo ? 'TURBO' : 'WALK';
  const model = MODEL_PRESETS[activeSkinKey]?.label ?? 'Fallback';
  hintEl.textContent = 'WASD move, Shift turbo, Space hop, 1/2/3/4 model';
  if (!isLoadingSkin) {
    statusEl.textContent = `${model} | ${mode} | speed ${speed.toFixed(2)} m/s`;
  }
}

function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  driveController(dt);
  world.step();
  syncMeshes();
  updateCamera();
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
