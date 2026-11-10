/* Kapi the capybara: the moving 3D mascot on the home page.
 * three.js draws a rigged model (/assets/capy/kapi.glb) on a see-through canvas.
 * Kapi idles, waves hello, turns toward the pointer and hops when tapped.
 * With "reduce motion" on, Kapi stands still. Model made with Higgsfield (Meshy). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export function mount(el) {
  if (el.__kapi) return;
  el.__kapi = true;
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
  const g = sc.getContext('2d').createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(11,31,68,0.28)');
  g.addColorStop(1, 'rgba(11,31,68,0)');
  const sctx = sc.getContext('2d');
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const root = new THREE.Group();
  scene.add(root);

  let mixer = null, actions = {}, head = null, current = null;
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let hop = 0, lastWave = 0, visible = true, raf = 0, ready = false;
  const clock = new THREE.Clock();
  const extra = new THREE.Quaternion(), euler = new THREE.Euler();

  function size() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
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
    el.classList.add('talk');
    clearTimeout(el.__talkT);
    el.__talkT = setTimeout(() => el.classList.remove('talk'), 2600);
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('/assets/capy/kapi.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 0; }
      if (o.isBone && !head && /head/i.test(o.name)) head = o;
    });
    root.add(model);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        const n = /wave|hello/i.test(clip.name) ? 'wave' : /idle/i.test(clip.name) ? 'idle' : clip.name;
        actions[n] = mixer.clipAction(clip);
      });
      if (!actions.idle) actions.idle = mixer.clipAction(gltf.animations[0]);
      mixer.addEventListener('finished', () => play('idle'));
      if (reduce) { actions.idle.play(); mixer.update(0.5); actions.idle.paused = true; }
      else { play('idle'); mixer.update(0); }
    }
    // Measure the posed model (a rigged mesh only has its real size once the skeleton is posed),
    // then stand it on the ground, centred, 1 unit tall.
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
    // Room above the head for the hop, a little below the feet for the shadow.
    const fov = camera.fov * Math.PI / 180, view = 1.22;
    camera.position.set(0, 0.58, view / 2 / Math.tan(fov / 2));
    camera.lookAt(0, 0.58, 0);
    size();
    renderer.render(scene, camera);
    ready = true;
    el.classList.add('live');
    if (!reduce) setTimeout(wave, 700);
    loop();
  }, undefined, () => { canvas.remove(); });

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (mixer && !reduce) mixer.update(dt);
    if (!reduce) {
      // Turn toward the pointer: body a little, head more.
      look.x += (look.tx - look.x) * Math.min(1, dt * 4);
      look.y += (look.ty - look.y) * Math.min(1, dt * 4);
      root.rotation.y = look.x * 0.45;
      if (head) {
        euler.set(-look.y * 0.25, look.x * 0.5, 0, 'YXZ');
        extra.setFromEuler(euler);
        head.quaternion.multiply(extra);
      }
      // A happy hop when tapped.
      if (hop > 0) {
        hop = Math.max(0, hop - dt * 1.6);
        const p = 1 - hop;
        root.position.y = Math.sin(p * Math.PI) * 0.16;
        root.scale.set(1 + Math.sin(p * Math.PI * 2) * 0.04, 1 - Math.sin(p * Math.PI * 2) * 0.04, 1 + Math.sin(p * Math.PI * 2) * 0.04);
        shadow.scale.setScalar(0.62 * (1 - Math.sin(p * Math.PI) * 0.35));
        shadow.scale.z = 1;
      }
      // Wave again now and then.
      if (actions.wave && current === actions.idle && t - lastWave > 11) wave();
    }
    renderer.render(scene, camera);
  }

  function loop() {
    cancelAnimationFrame(raf);
    if (!ready || !visible || document.hidden) return;
    frame();
    if (!reduce) raf = requestAnimationFrame(loop);
  }

  window.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.35;
    look.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.45)));
    look.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight * 0.6)));
  }, { passive: true });
  el.addEventListener('click', () => { if (reduce || !ready) return; hop = 1; wave(); });

  if (window.ResizeObserver) new ResizeObserver(() => { size(); if (ready && reduce) frame(); }).observe(el);
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
