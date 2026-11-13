/* ECStay — the celebration moment (after a Keeper sends a listing).
 *   medallion(el)  a brass medallion with the ECStay mark, drawn live in 3D: it flips in, then turns slowly and leans
 *                  toward the pointer (or with the phone's tilt). Reflections come from a small studio environment.
 *   confetti(el)   one burst of brass and ivory foil that flutters down and is gone in about five seconds.
 * With "reduce motion" on, the medallion stands still and there is no confetti. Loaded only when needed. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function medallion(el) {
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0, 6.4);
  const key = new THREE.DirectionalLight(0xffe6b8, 2.4); key.position.set(-2.5, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe3d0, 0.9); rim.position.set(3, -1, -2); scene.add(rim);
  const front = new THREE.DirectionalLight(0xffe9c0, 1.7); front.position.set(0.6, 0.8, 6); scene.add(front);

  // Brass: a brushed face, a polished rim and mark.
  const brushed = new THREE.MeshStandardMaterial({ color: 0xc79a4b, metalness: 1, roughness: 0.42, envMapIntensity: 1.5 });
  const polished = new THREE.MeshStandardMaterial({ color: 0xe2b765, metalness: 1, roughness: 0.16, envMapIntensity: 1.6 });
  // The raised mark: a touch softer and lighter than the rim, so it catches light from the front instead of mirroring the dark room.
  const raised = new THREE.MeshStandardMaterial({ color: 0xf3d48c, metalness: 1, roughness: 0.34, envMapIntensity: 2.2 });
  const coin = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 96), brushed);
  face.rotation.x = Math.PI / 2; coin.add(face);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 24, 120), polished); coin.add(edge);
  [0.055, -0.055].forEach((z) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.012, 12, 120), polished); ring.position.z = z; coin.add(ring); });
  scene.add(coin);

  // The mark, raised on both sides (the back one is turned so it also reads the right way round).
  fetch('/assets/brand/ecstay-icon.svg').then((r) => r.text()).then((svg) => {
    const paths = new SVGLoader().parse(svg).paths.filter((p) => p.userData.node && p.userData.node.nodeName === 'path');
    const shapes = []; paths.forEach((p) => SVGLoader.createShapes(p).forEach((s) => shapes.push(s)));
    if (!shapes.length) return;
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 26, bevelEnabled: true, bevelThickness: 7, bevelSize: 5, bevelSegments: 4, curveSegments: 10 });
    geo.computeBoundingBox();
    const b = geo.boundingBox, w = b.max.x - b.min.x, h = b.max.y - b.min.y, s = 1.12 / Math.max(w, h);
    geo.translate(-(b.min.x + w / 2), -(b.min.y + h / 2), 0);
    [1, -1].forEach((side) => {
      const m = new THREE.Mesh(geo, raised);
      m.scale.set(s * side, -s, s * 0.9 * side);   // SVG y runs down
      m.position.z = 0.05 * side;
      coin.add(m);
    });
  }).catch(() => {});

  const still = reduce();
  const tilt = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  const onMove = (e) => { const r = el.getBoundingClientRect(); aim.y = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2))) * 0.5; aim.x = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2))) * 0.3; };
  const onTilt = (e) => { if (e.gamma == null) return; aim.y = Math.max(-1, Math.min(1, e.gamma / 35)) * 0.5; aim.x = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 35)) * 0.3; };
  if (!still) { window.addEventListener('pointermove', onMove, { passive: true }); window.addEventListener('deviceorientation', onTilt, { passive: true }); }

  let raf = 0, t0 = 0, dead = false;
  function size() { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function frame(now) {
    if (dead) return;
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    // Flips in over 1.6 s (two turns, easing out), then a slow sway.
    const k = Math.min(1, t / 1.6), ease = 1 - Math.pow(1 - k, 3);
    tilt.x += (aim.x - tilt.x) * 0.06; tilt.y += (aim.y - tilt.y) * 0.06;
    coin.rotation.y = (1 - ease) * Math.PI * 4 + Math.sin(t * 0.7) * 0.42 * ease + tilt.y;
    coin.rotation.x = Math.sin(t * 0.5) * 0.08 * ease + tilt.x;
    coin.position.y = Math.sin(t * 0.9) * 0.035 * ease;
    coin.scale.setScalar(0.55 + 0.45 * ease);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  size();
  if (still) { coin.rotation.y = 0.32; coin.rotation.x = 0.06; setTimeout(() => renderer.render(scene, camera), 250); renderer.render(scene, camera); }
  else raf = requestAnimationFrame(frame);
  el.classList.add('live');
  const ro = window.ResizeObserver ? new ResizeObserver(() => { size(); if (still) renderer.render(scene, camera); }) : null;
  if (ro) ro.observe(el);

  return function stop() {
    dead = true; cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('deviceorientation', onTilt);
    if (ro) ro.disconnect();
    pmrem.dispose(); renderer.dispose();
  };
}

export function confetti(host, origin) {
  if (reduce()) return function () {};
  const canvas = document.createElement('canvas');
  canvas.className = 'cele-confetti'; canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  function size() { W = host.clientWidth; H = host.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size();
  // Foil: mostly brass, some ivory, a little soft green. Light and dark sides, so pieces flash as they turn.
  const FOIL = [['#E7C784', '#9C7434'], ['#D9B166', '#8A6431'], ['#F3E3BC', '#B98B4E'], ['#F6F0E5', '#CFC6B4'], ['#C99A5B', '#7A5626'], ['#9DB9A9', '#4F7362']];
  const ox = origin ? origin.x : W / 2, oy = origin ? origin.y : H * 0.3;
  const n = Math.round(Math.min(150, Math.max(70, W / 6)));
  const bits = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25, v = 5 + Math.random() * 9;
    const ribbon = Math.random() < 0.22;
    return { x: ox, y: oy, vx: Math.cos(a) * v * (W < 500 ? 0.75 : 1.15), vy: Math.sin(a) * v - 2, w: ribbon ? 3 + Math.random() * 2 : 6 + Math.random() * 5, h: ribbon ? 16 + Math.random() * 12 : 8 + Math.random() * 7,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, flip: Math.random() * 6.28, vf: 0.12 + Math.random() * 0.2, sway: Math.random() * 6.28, c: FOIL[i % FOIL.length], delay: Math.random() * 180 };
  });
  let raf = 0, t0 = 0, last = 0, dead = false;
  function frame(now) {
    if (dead) return;
    if (!t0) { t0 = now; last = now; }
    const t = now - t0, dt = Math.min(2.2, (now - last) / 16.67); last = now;
    ctx.clearRect(0, 0, W, H);
    const fade = t > 4200 ? Math.max(0, 1 - (t - 4200) / 1100) : 1;
    let alive = 0;
    for (const p of bits) {
      if (t < p.delay) { alive++; continue; }
      p.vy += 0.16 * dt; p.vx *= Math.pow(0.985, dt); p.vy *= Math.pow(0.988, dt);
      p.sway += 0.05 * dt; p.x += (p.vx + Math.sin(p.sway) * 0.6) * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt; p.flip += p.vf * dt;
      if (p.y > H + 30) continue;
      alive++;
      const f = Math.cos(p.flip);
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.max(0.08, Math.abs(f)));
      ctx.fillStyle = f > 0 ? p.c[0] : p.c[1];
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (f > 0.75) { ctx.globalAlpha = fade * (f - 0.75) * 2.4; ctx.fillStyle = '#FFF6DC'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.35); }
      ctx.restore();
    }
    if (alive && fade > 0) raf = requestAnimationFrame(frame); else stop();
  }
  function stop() { if (dead) return; dead = true; cancelAnimationFrame(raf); window.removeEventListener('resize', size); canvas.remove(); }
  window.addEventListener('resize', size);
  raf = requestAnimationFrame(frame);
  return stop;
}
