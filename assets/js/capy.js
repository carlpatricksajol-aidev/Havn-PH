/* Kapi the capybara: the moving 3D mascot on the home page.
 * three.js draws a rigged model (/assets/capy/kapi.glb, loaded once and shared) on see-through canvases.
 * Modes (data-capy on the element):
 *   stand  next to the search: idles, waves hello, turns toward the pointer, hops when tapped
 *   peek   big, beside his note: walks in from the edge of the screen when the section comes into view, turns to you,
 *          waves, then talks with open hands, looks at the pointer and waves now and then (and when a place is picked)
 *   jump   in the bottom scene: happy hops, with a wave now and then
 * With "reduce motion" on, Kapi stands still. Model made for ECStay with Higgsfield (Meshy); clips Idle, Wave, Talk, Walk. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

let gltfP = null;
function loadKapi() {
  if (!gltfP) {
    gltfP = new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load('/assets/capy/kapi.glb', resolve, undefined, reject);
    });
  }
  return gltfP;
}

// Camera framing per mode, in model units (Kapi is 1 tall, feet at 0).
const FRAMES = {
  stand: { y: 0.62, h: 1.5, turn: 0.45, head: 0.5, tilt: 0, face: 0 },
  peek: { y: 0.58, h: 1.3, turn: 0.08, head: 0.18, tilt: 0, face: 0 },
  jump: { y: 0.66, h: 1.55, turn: 0.25, head: 0.35, tilt: 0, face: 0 },
};

const pointer = { x: 0, y: 0, seen: false };
window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; }, { passive: true });

export function mount(el) {
  if (el.__kapi) return;
  el.__kapi = true;
  const mode = FRAMES[el.getAttribute('data-capy')] ? el.getAttribute('data-capy') : 'stand';
  const F = FRAMES[mode];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf3e3cf, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
  rim.position.set(2, 1.5, -2);
  scene.add(rim);

  // Soft round shadow under the feet.
  const sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  const sctx = sc.getContext('2d');
  const g = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, mode === 'jump' ? 'rgba(20,60,30,0.32)' : 'rgba(11,31,68,0.26)');
  g.addColorStop(1, 'rgba(11,31,68,0)');
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const root = new THREE.Group();
  scene.add(root);

  let mixer = null, actions = {}, head = null, current = null, base = 'idle';
  const look = { x: 0, y: 0 };
  let hop = 0, lastWave = -99, lastHop = 0, visible = true, raf = 0, ready = false;
  // Walk-in (peek mode): wait off to the right, walk to the spot, turn to face you, wave. Units: Kapi is 1 tall.
  const WALK = { from: 0.95, speed: 0.4, yaw: -Math.PI / 2 + 0.55, turn: 0.5 };
  let enter = null; // { phase: 'wait' | 'walk' | 'turn' | 'done', t }
  const clock = new THREE.Clock();
  const extra = new THREE.Quaternion(), euler = new THREE.Euler();

  function size() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the frame's height, and its width on narrow boxes, so Kapi never touches the edges.
    const fov = 2 * Math.atan(Math.tan(13 * Math.PI / 180) * Math.max(1, 0.75 / camera.aspect));
    camera.fov = fov * 180 / Math.PI;
    const dist = F.h / 2 / Math.tan(fov / 2);
    camera.position.set(0, F.y, dist);
    camera.lookAt(0, F.y, 0);
    camera.updateProjectionMatrix();
  }

  function play(name, once) {
    const a = actions[name];
    if (!a || a === current) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = !!once;
    if (current) a.crossFadeFrom(current, 0.35, false);
    a.play();
    current = a;
  }

  function wave() {
    if (reduce || !actions.wave) return;
    lastWave = clock.elapsedTime;
    play('wave', true);
    if (mode === 'stand') {
      el.classList.add('talk');
      clearTimeout(el.__talkT);
      el.__talkT = setTimeout(() => el.classList.remove('talk'), 2600);
    }
  }

  loadKapi().then((gltf) => {
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
      if (o.isBone && !head && /^head$/i.test(o.name)) head = o;
    });
    root.add(model);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        const n = /wave|hello/i.test(clip.name) ? 'wave' : /talk/i.test(clip.name) ? 'talk' : /walk/i.test(clip.name) ? 'walk' : /cheer/i.test(clip.name) ? 'cheer' : /idle/i.test(clip.name) ? 'idle' : clip.name;
        actions[n] = mixer.clipAction(clip);
      });
      if (!actions.idle) actions.idle = mixer.clipAction(gltf.animations[0]);
      // Each Kapi has his own everyday movement.
      // (Arms-up clips pull the head out of shape on this rig, so the scene Kapi hops instead of cheering.)
      base = mode === 'peek' && actions.talk ? 'talk' : 'idle';
      mixer.addEventListener('finished', () => play(base));
      if (reduce) { actions.idle.play(); mixer.update(0.5); actions.idle.paused = true; }
      else { play(base); mixer.update(Math.random() * 3); }
    }
    // Measure the posed model (a rigged mesh only has its real size once posed): feet on the ground, 1 tall.
    const measure = () => {
      model.updateMatrixWorld(true);
      const b = new THREE.Box3();
      model.traverse((o) => {
        if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); b.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
        else if (o.isMesh) b.expandByObject(o);
      });
      return b;
    };
    let box = measure();
    model.scale.multiplyScalar(1 / Math.max(0.001, box.max.y - box.min.y));
    box = measure();
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box.min.y;
    shadow.scale.set(0.62, 0.62, 1);
    shadow.position.y = 0.002;
    root.rotation.set(0, F.face, F.tilt);
    if (mode === 'peek' && !reduce && actions.walk) {
      // Off to the right until the section is in view, then walk in.
      enter = { phase: 'wait', t: 0 };
      root.position.x = WALK.from;
      root.rotation.y = WALK.yaw;
      actions.walk.timeScale = 1.25;
      if (window.IntersectionObserver) {
        const io = new IntersectionObserver((es) => {
          if (es[0].intersectionRatio >= 0.3 && enter.phase === 'wait') { enter = { phase: 'walk', t: clock.elapsedTime }; play('walk'); io.disconnect(); }
        }, { threshold: [0, 0.3, 0.6] });
        io.observe(el);
      } else { enter.phase = 'done'; root.position.x = 0; root.rotation.y = F.face; }
    }
    shadow.position.x = root.position.x;
    size();
    renderer.render(scene, camera);
    ready = true;
    el.classList.add('live');
    if (!reduce && mode === 'stand') setTimeout(wave, 700);
    loop();
  }).catch(() => { canvas.remove(); });

  // The walk-in, one frame at a time. Returns true while it is running (pointer-following waits).
  function walkIn(t) {
    if (!enter || enter.phase === 'done') return false;
    if (enter.phase === 'walk') {
      const dur = WALK.from / WALK.speed, p = Math.min(1, (t - enter.t) / dur);
      root.position.x = WALK.from * (1 - (p < 0.8 ? p : 0.8 + (1 - Math.pow(1 - (p - 0.8) / 0.2, 2)) * 0.2));
      root.rotation.y = WALK.yaw;
      if (p >= 1) { root.position.x = 0; enter = { phase: 'turn', t }; play('idle'); }
    } else if (enter.phase === 'turn') {
      const q = Math.min(1, (t - enter.t) / WALK.turn), e = q * q * (3 - 2 * q);
      root.rotation.y = WALK.yaw + (F.face - WALK.yaw) * e;
      if (q >= 1) { enter = { phase: 'done', t }; look.x = 0; look.y = 0; wave(); }
    }
    shadow.position.x = root.position.x;
    return enter.phase !== 'done';
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (mixer && !reduce) mixer.update(dt);
    if (!reduce && walkIn(t)) { renderer.render(scene, camera); return; }
    if (!reduce) {
      // Look toward the pointer (or straight out until it moves): body a little, head more.
      const r = el.getBoundingClientRect();
      let tx = 0, ty = 0;
      if (pointer.seen) {
        tx = Math.max(-1, Math.min(1, (pointer.x - (r.left + r.width / 2)) / (window.innerWidth * 0.45)));
        ty = Math.max(-1, Math.min(1, (pointer.y - (r.top + r.height * 0.3)) / (window.innerHeight * 0.6)));
      }
      look.x += (tx - look.x) * Math.min(1, dt * 4);
      look.y += (ty - look.y) * Math.min(1, dt * 4);
      root.rotation.y = F.face + look.x * F.turn;
      if (head) {
        euler.set(-look.y * 0.25 * (F.head / 0.5), look.x * F.head, 0, 'YXZ');
        extra.setFromEuler(euler);
        head.quaternion.multiply(extra);
      }
      // In the scene, hop every couple of seconds; elsewhere when tapped.
      if (mode === 'jump' && hop === 0 && t - lastHop > 1.9) { hop = 1; lastHop = t; }
      if (mode === 'jump' && actions.wave && current === actions[base] && t - lastWave > 9) wave();
      if (hop > 0) {
        hop = Math.max(0, hop - dt * 1.6);
        const p = 1 - hop, s = Math.sin(p * Math.PI * 2) * 0.05;
        root.position.y = Math.sin(p * Math.PI) * (mode === 'jump' ? 0.22 : 0.16);
        root.scale.set(1 + s, 1 - s, 1 + s);
        const k = 0.62 * (1 - Math.sin(p * Math.PI) * 0.35);
        shadow.scale.set(k, k, 1);
      }
      // Wave again now and then.
      if (mode !== 'jump' && actions.wave && current === actions[base] && t - lastWave > (mode === 'peek' ? 13 : 11)) wave();
    }
    renderer.render(scene, camera);
  }

  function loop() {
    cancelAnimationFrame(raf);
    if (!ready || !visible || document.hidden) return;
    frame();
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  el.addEventListener('click', () => { if (reduce || !ready || (enter && enter.phase !== 'done')) return; hop = 1; wave(); });
  // The home page asks for a wave when a place is picked in Kapi's note.
  el.addEventListener('kapi:wave', () => { if (!reduce && ready && (!enter || enter.phase === 'done')) wave(); });

  if (window.ResizeObserver) new ResizeObserver(() => { size(); if (ready) renderer.render(scene, camera); }).observe(el);
  if (window.IntersectionObserver) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { clock.getDelta(); loop(); } }).observe(el);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clock.getDelta(); loop(); } });
  // Stop drawing once the home page is left (the element is removed).
  const gone = new MutationObserver(() => {
    if (!document.body.contains(el)) { cancelAnimationFrame(raf); ready = false; renderer.dispose(); gone.disconnect(); }
  });
  gone.observe(document.body, { childList: true, subtree: true });
}
