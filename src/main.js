import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const canvas = document.getElementById('scene');
const modeSelectEl = document.getElementById('modeSelect');
const resetBtnEl = document.getElementById('resetBtn');
const physicsStatsEl = document.getElementById('physicsStats');
const sensorStatsEl = document.getElementById('sensorStats');
const cameraStatsEl = document.getElementById('cameraStats');
const hintEl = document.getElementById('hint');
const touchEl = document.getElementById('touch');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdce8f8, 16, 72);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(-7, 5, 0);

scene.add(new THREE.HemisphereLight(0xf9fcff, 0x7989a1, 0.82));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(9, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
scene.add(sun);

const input = { forward: 0, turn: 0, turbo: false, jump: false };
const pressed = new Set();
const qTmp = new THREE.Quaternion();
const eTmp = new THREE.Euler();
const vTmp = new THREE.Vector3();

function normalizeKey(raw) {
  const k = (raw || '').toLowerCase();
  if (k === 'arrowup') return 'w';
  if (k === 'arrowdown') return 's';
  if (k === 'arrowleft') return 'a';
  if (k === 'arrowright') return 'd';
  return k;
}

function refreshInput() {
  input.forward = (pressed.has('w') ? 1 : 0) + (pressed.has('s') ? -1 : 0);
  input.turn = (pressed.has('a') ? 1 : 0) + (pressed.has('d') ? -1 : 0);
  input.turbo = pressed.has('shift');
  input.jump = pressed.has(' ');
}

function setPressed(rawKey, down) {
  const k = normalizeKey(rawKey);
  if (!k) return;
  if (down) pressed.add(k);
  else pressed.delete(k);
  refreshInput();
}

window.addEventListener('keydown', (e) => setPressed(e.key, true));
window.addEventListener('keyup', (e) => setPressed(e.key, false));

touchEl.querySelectorAll('.touch-btn').forEach((btn) => {
  const key = btn.dataset.key;
  const down = (ev) => {
    ev.preventDefault();
    btn.classList.add('active');
    setPressed(key, true);
  };
  const up = (ev) => {
    ev.preventDefault();
    btn.classList.remove('active');
    setPressed(key, false);
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
});

await RAPIER.init({});
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;

const syncEntries = [];
const terrainBodies = [];
let robot = null;
let mode = modeSelectEl.value;

function addBodyMesh(body, mesh, trackTerrain = false) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  syncEntries.push({ body, mesh });
  if (trackTerrain) terrainBodies.push(body);
}

function dropBody(body) {
  const idx = syncEntries.findIndex((e) => e.body === body);
  if (idx >= 0) {
    scene.remove(syncEntries[idx].mesh);
    syncEntries.splice(idx, 1);
  }
  world.removeRigidBody(body);
}

function clearTerrain() {
  while (terrainBodies.length) dropBody(terrainBodies.pop());
}

function buildTerrain() {
  clearTerrain();
  const makeBox = (x, y, z, hx, hy, hz, color, rotY = 0) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) })
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(1.2), body);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), new THREE.MeshStandardMaterial({ color }));
    addBodyMesh(body, mesh, true);
  };

  makeBox(0, -0.6, 0, 30, 0.6, 30, '#95a8bf');
  makeBox(6, -0.15, 0, 2.4, 0.18, 2.8, '#647a98', -0.42);
  makeBox(11, 0.22, 0.7, 2, 0.2, 2.3, '#5d7390', 0.2);
  makeBox(16, 0.62, -0.6, 1.8, 0.22, 2.1, '#586d8b', -0.26);

  for (let i = 0; i < 22; i++) {
    const x = 7 + i * 0.85;
    const z = ((i % 4) - 1.5) * 0.72;
    const h = 0.16 + (i % 3) * 0.12;
    makeBox(x, h * 0.5 - 0.03, z, 0.26, h * 0.5, 0.26, i % 2 ? '#4f6483' : '#5d7392');
  }
}

function createQuadRobot() {
  const bodies = [];
  const joints = [];
  const legs = [];
  let gaitPhase = 0;

  const torso = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.15, 0).setCanSleep(false).setAdditionalMass(8));
  bodies.push(torso);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.36, 0.09, 0.2).setDensity(1.2).setFriction(1.1), torso);
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: '#22364d' }));
  addBodyMesh(torso, torsoMesh);

  const legDefs = [
    { x: 0.26, z: 0.17, phase: 0 },
    { x: 0.26, z: -0.17, phase: Math.PI },
    { x: -0.26, z: 0.17, phase: Math.PI },
    { x: -0.26, z: -0.17, phase: 0 }
  ];

  for (const leg of legDefs) {
    const upper = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(leg.x, 0.97, leg.z));
    const lower = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(leg.x, 0.73, leg.z));
    bodies.push(upper, lower);

    world.createCollider(RAPIER.ColliderDesc.capsule(0.07, 0.045).setDensity(0.7), upper);
    world.createCollider(RAPIER.ColliderDesc.capsule(0.08, 0.04).setDensity(0.65).setFriction(1.3), lower);
    world.createCollider(RAPIER.ColliderDesc.ball(0.05).setTranslation(0, -0.11, 0).setFriction(2.4), lower);

    addBodyMesh(upper, new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.14, 8, 14), new THREE.MeshStandardMaterial({ color: '#0f1d30' })));
    addBodyMesh(lower, new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 8, 14), new THREE.MeshStandardMaterial({ color: '#314a68' })));

    const hip = world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: leg.x, y: -0.04, z: leg.z }, { x: 0, y: 0.07, z: 0 }, { x: 1, y: 0, z: 0 }),
      torso,
      upper,
      true
    );
    const knee = world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0, y: -0.07, z: 0 }, { x: 0, y: 0.08, z: 0 }, { x: 1, y: 0, z: 0 }),
      upper,
      lower,
      true
    );
    hip.setLimits(-0.7, 0.7);
    knee.setLimits(-1.35, 0.2);
    joints.push(hip, knee);
    legs.push({ hip, knee, phase: leg.phase, side: leg.z });
  }

  return {
    type: 'quadruped',
    torso,
    bodies,
    joints,
    reset() {
      torso.setTranslation({ x: 0, y: 1.15, z: 0 }, true);
      torso.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      torso.setLinvel({ x: 0, y: 0, z: 0 }, true);
      torso.setAngvel({ x: 0, y: 0, z: 0 }, true);
      gaitPhase = 0;
    },
    step(dt) {
      const boost = input.turbo ? 1.8 : 1;
      gaitPhase += dt * (1.6 + Math.abs(input.forward) * 1.6 + Math.abs(input.turn) * 0.6) * boost;
      const stride = (0.26 + Math.abs(input.forward) * 0.5) * boost;
      const kneeLift = 0.82 + Math.abs(input.forward) * 0.45;
      const stiff = 42 + Math.abs(input.forward) * 42;
      const damp = 8 + Math.abs(input.forward) * 6;

      for (const leg of legs) {
        const cyc = gaitPhase * Math.PI * 2 + leg.phase + input.turn * (leg.side > 0 ? 0.25 : -0.25);
        leg.hip.configureMotorPosition(Math.sin(cyc) * stride, stiff, damp);
        leg.knee.configureMotorPosition(-0.7 - Math.max(0, Math.cos(cyc)) * kneeLift, stiff * 0.9, damp * 1.04);
      }

      const rot = torso.rotation();
      qTmp.set(rot.x, rot.y, rot.z, rot.w);
      const fwd = vTmp.set(1, 0, 0).applyQuaternion(qTmp).setY(0).normalize();
      const push = 10.8 * input.forward * boost;
      torso.applyImpulse({ x: fwd.x * push * dt, y: 0, z: fwd.z * push * dt }, true);
      torso.applyTorqueImpulse({ x: 0, y: input.turn * (0.38 + Math.abs(input.forward) * 0.1) * boost * dt, z: 0 }, true);
      if (input.jump) torso.applyImpulse({ x: 0, y: 0.72, z: 0 }, true);
    }
  };
}

function createHumanoidRobot() {
  const bodies = [];
  const joints = [];
  const legs = [];
  let gaitPhase = 0;

  const torso = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.45, 0).setCanSleep(false).setAdditionalMass(10));
  bodies.push(torso);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.34, 0.13).setDensity(1.25), torso);

  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.68, 0.26), new THREE.MeshStandardMaterial({ color: '#d5e0ef' }));
  addBodyMesh(torso, torsoMesh);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: '#bfd0e8' }));
  head.position.set(0.22, 0.22, 0);
  torsoMesh.add(head);

  const legsDef = [
    { x: 0.05, z: 0.1, phase: 0 },
    { x: 0.05, z: -0.1, phase: Math.PI }
  ];

  for (const leg of legsDef) {
    const upper = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(leg.x, 1.02, leg.z));
    const lower = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(leg.x, 0.72, leg.z));
    bodies.push(upper, lower);

    world.createCollider(RAPIER.ColliderDesc.capsule(0.11, 0.05).setDensity(0.8), upper);
    world.createCollider(RAPIER.ColliderDesc.capsule(0.1, 0.045).setDensity(0.75), lower);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 0.03, 0.07).setTranslation(0, -0.14, 0).setFriction(2.2), lower);

    addBodyMesh(upper, new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 8, 14), new THREE.MeshStandardMaterial({ color: '#a8bad2' })));
    addBodyMesh(lower, new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 8, 14), new THREE.MeshStandardMaterial({ color: '#8fa6c2' })));

    const hip = world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: leg.x, y: -0.24, z: leg.z }, { x: 0, y: 0.11, z: 0 }, { x: 1, y: 0, z: 0 }),
      torso,
      upper,
      true
    );
    const knee = world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0, y: -0.11, z: 0 }, { x: 0, y: 0.1, z: 0 }, { x: 1, y: 0, z: 0 }),
      upper,
      lower,
      true
    );
    hip.setLimits(-0.65, 0.65);
    knee.setLimits(-1.2, 0.15);
    joints.push(hip, knee);
    legs.push({ hip, knee, phase: leg.phase, side: leg.z });
  }

  return {
    type: 'humanoid',
    torso,
    bodies,
    joints,
    reset() {
      torso.setTranslation({ x: 0, y: 1.45, z: 0 }, true);
      torso.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      torso.setLinvel({ x: 0, y: 0, z: 0 }, true);
      torso.setAngvel({ x: 0, y: 0, z: 0 }, true);
      gaitPhase = 0;
    },
    step(dt) {
      const boost = input.turbo ? 1.5 : 1;
      gaitPhase += dt * (1.2 + Math.abs(input.forward) * 1.4) * boost;
      const stride = (0.22 + Math.abs(input.forward) * 0.36) * boost;
      const stiff = 55;
      const damp = 10;

      for (const leg of legs) {
        const cyc = gaitPhase * Math.PI * 2 + leg.phase;
        leg.hip.configureMotorPosition(Math.sin(cyc) * stride, stiff, damp);
        leg.knee.configureMotorPosition(-0.55 - Math.max(0, Math.cos(cyc)) * 0.72, stiff * 0.88, damp);
      }

      const rot = torso.rotation();
      qTmp.set(rot.x, rot.y, rot.z, rot.w);
      const fwd = vTmp.set(1, 0, 0).applyQuaternion(qTmp).setY(0).normalize();
      torso.applyImpulse({ x: fwd.x * 8.4 * input.forward * dt, y: 0, z: fwd.z * 8.4 * input.forward * dt }, true);
      torso.applyTorqueImpulse({ x: 0, y: input.turn * 0.34 * dt, z: 0 }, true);

      eTmp.setFromQuaternion(qTmp, 'YXZ');
      torso.applyTorqueImpulse({ x: -eTmp.x * 0.22, y: 0, z: -eTmp.z * 0.22 }, true);
      if (input.jump) torso.applyImpulse({ x: 0, y: 0.55, z: 0 }, true);
    }
  };
}

function clearRobot() {
  if (!robot) return;
  while (robot.bodies.length) dropBody(robot.bodies.pop());
  robot = null;
}

function buildRobotForMode(nextMode) {
  clearRobot();
  robot = nextMode === 'humanoid' ? createHumanoidRobot() : createQuadRobot();
  robot.reset();
}

function setMode(nextMode) {
  mode = nextMode;
  buildRobotForMode(mode);
  if (mode === 'isaac') {
    hintEl.textContent = 'Isaac-style: WASD move, Shift turbo, Space jump, clean telemetry panels';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  } else if (mode === 'mobile') {
    hintEl.textContent = 'Mobile-priority: large touch controls, stable camera, lighter rendering';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  } else {
    hintEl.textContent = 'Humanoid-priority: biped balance walk, roll/pitch stabilization';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}

buildTerrain();
setMode(mode);

modeSelectEl.addEventListener('change', () => setMode(modeSelectEl.value));
resetBtnEl.addEventListener('click', () => {
  if (robot) robot.reset();
});

const chasePos = new THREE.Vector3();
const chaseLook = new THREE.Vector3();
const clock = new THREE.Clock();

function updateCamera(dt) {
  if (!robot) return;
  const pos = robot.torso.translation();
  const rot = robot.torso.rotation();
  qTmp.set(rot.x, rot.y, rot.z, rot.w);

  const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(qTmp).setY(0).normalize();
  const side = new THREE.Vector3(0, 0, 1).applyQuaternion(qTmp).setY(0).normalize();

  const dist = mode === 'mobile' ? 4.4 : 3.6;
  chasePos.set(pos.x, pos.y, pos.z).addScaledVector(forward, -dist).addScaledVector(side, 1.2).add(new THREE.Vector3(0, 2, 0));
  chaseLook.set(pos.x, pos.y + 0.2, pos.z).addScaledVector(forward, 2.1);

  camera.position.lerp(chasePos, Math.min(0.12, 0.06 + dt * 2));
  camera.lookAt(chaseLook);
}

function syncMeshes() {
  for (const e of syncEntries) {
    const p = e.body.translation();
    const r = e.body.rotation();
    e.mesh.position.set(p.x, p.y, p.z);
    e.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

function updatePanels() {
  if (!robot) return;

  const vel = robot.torso.linvel();
  const speed = Math.hypot(vel.x, vel.z);
  const pos = robot.torso.translation();
  const rot = robot.torso.rotation();
  qTmp.set(rot.x, rot.y, rot.z, rot.w);
  eTmp.setFromQuaternion(qTmp, 'YXZ');
  const pitch = (eTmp.x * 180) / Math.PI;
  const roll = (eTmp.z * 180) / Math.PI;

  const bodyCount = syncEntries.length;
  physicsStatsEl.textContent = `dt ${(world.timestep * 1000).toFixed(1)}ms | rigid ${bodyCount} | mode ${mode}`;
  sensorStatsEl.textContent = `speed ${speed.toFixed(2)} m/s | pitch ${pitch.toFixed(1)} | roll ${roll.toFixed(1)} | height ${pos.y.toFixed(2)}`;
  cameraStatsEl.textContent = `follow cam | pos (${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`;
}

function loop() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (robot) robot.step(dt);
  world.step();
  syncMeshes();
  updateCamera(dt);
  updatePanels();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
