import * as THREE from '/vendor/three.module.js';
import { loadFeaturedTitles } from './featured-titles.mjs';
import { createVhsCase } from './vhs-case.mjs';

const TAPE_COLUMNS = 5;
const COUNTER_TOP = 1.75;
const COUNTER_POSITION = new THREE.Vector3(0, COUNTER_TOP, -.25);

function labelTexture(text, { width = 512, height = 160, color = '#f5e8c8', background = '#1b2635' } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.fillStyle = background; context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d2a948'; context.lineWidth = 10; context.strokeRect(8, 8, width - 16, height - 16);
  context.fillStyle = color; context.font = '900 42px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, width / 2, height / 2, width - 28);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function noticeTexture(title, lines, { width = 520, height = 720, background = '#233d4b' } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); context.fillStyle = background; context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d2a948'; context.lineWidth = 14; context.strokeRect(10, 10, width - 20, height - 20);
  context.fillStyle = '#f5e8c8'; context.font = '900 42px Arial'; context.textAlign = 'center'; context.fillText(title, width / 2, 82, width - 48);
  context.strokeStyle = '#d2a948'; context.lineWidth = 4; context.beginPath(); context.moveTo(42, 116); context.lineTo(width - 42, 116); context.stroke();
  context.font = '900 27px Arial'; context.fillStyle = '#f7ddb0'; lines.forEach((line, index) => context.fillText(line, width / 2, 182 + index * 104, width - 62));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function box(width, height, depth, material, x, y, z, group) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}

function drawPixDemonstration(context) {
  const { width, height } = context.canvas;
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  context.strokeStyle = '#d8d8d8'; context.lineWidth = 6; context.strokeRect(3, 3, width - 6, height - 6);
  context.fillStyle = '#157d75'; context.font = '900 42px Arial'; context.textAlign = 'center'; context.fillText('PIX', width / 2, 43);
  const size = 21; const cell = 8; const left = (width - size * cell) / 2; const top = 62;
  const finder = (x, y) => {
    context.fillStyle = '#111'; context.fillRect(left + x * cell, top + y * cell, cell * 7, cell * 7);
    context.fillStyle = '#fff'; context.fillRect(left + (x + 1) * cell, top + (y + 1) * cell, cell * 5, cell * 5);
    context.fillStyle = '#111'; context.fillRect(left + (x + 2) * cell, top + (y + 2) * cell, cell * 3, cell * 3);
  };
  const inFinder = (x, y) => (x < 7 && y < 7) || (x >= 14 && y < 7) || (x < 7 && y >= 14);
  finder(0, 0); finder(14, 0); finder(0, 14);
  context.fillStyle = '#111';
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!inFinder(x, y) && ((x * 17 + y * 31 + x * y * 7 + 11) % 5 < 2)) context.fillRect(left + x * cell, top + y * cell, cell, cell);
  context.fillStyle = '#555'; context.font = '900 13px Arial'; context.fillText('DEMONSTRAÇÃO · NÃO PAGÁVEL', width / 2, height - 12);
}

function pixDemonstrationTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 220; canvas.height = 260;
  drawPixDemonstration(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function featuredMovies(titles) {
  return titles.filter((title) => title.type === 'movie').slice(0, 3);
}

export function createBalcony({ container, rental, year, copy, onCounterSelect, onTitleSelect, onBagSelect, onTip, onOwner, onCollectiveAwards }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true;
  renderer.domElement.className = 'immersive-canvas'; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Locadora counter. Use arrow keys to choose a counter tape, Enter to inspect it, and plus or minus to zoom.');
  container.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07101b); scene.fog = new THREE.Fog(0x07101b, 12, 31);
  const camera = new THREE.PerspectiveCamera(39, 1, .1, 80); camera.position.set(0, 5.8, 17);
  const homeLookAt = new THREE.Vector3(0, 1.7, -1.2); const cameraLookAt = homeLookAt.clone();
  scene.add(new THREE.HemisphereLight(0xffe6b5, 0x17283a, 2.2));
  const warm = new THREE.SpotLight(0xffcb72, 105, 28, .66, .55, 1.5); warm.position.set(-4, 10, 6); warm.castShadow = true; scene.add(warm);
  const blue = new THREE.PointLight(0x5a99be, 18, 18); blue.position.set(6, 1, 4); scene.add(blue);
  const room = new THREE.Group(); scene.add(room);
  const laminate = new THREE.MeshStandardMaterial({ color: 0x16456a, roughness: .72 }); const countertop = new THREE.MeshStandardMaterial({ color: 0x28658d, roughness: .5, metalness: .08 }); const dark = new THREE.MeshStandardMaterial({ color: 0x181714, roughness: .76 }); const steel = new THREE.MeshStandardMaterial({ color: 0x46606a, metalness: .65, roughness: .38 }); const paper = new THREE.MeshStandardMaterial({ color: 0xe9dfbd, roughness: .92 });
  box(24, 14, .35, new THREE.MeshStandardMaterial({ color: 0x202733, roughness: .92 }), 0, 3, -5.4, room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 22), new THREE.MeshStandardMaterial({ color: 0x303440, roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.5; floor.receiveShadow = true; scene.add(floor);
  const posterLoader = new THREE.TextureLoader(); const posterTextures = new Set();
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 18; col += 1) box(.45, .82, .18, new THREE.MeshStandardMaterial({ color: [0x6a2730, 0x304e67, 0x7c6332, 0x2f513f][(row + col) % 4], roughness: .7 }), -5.2 + col * .61, .4 + row * .92, -5.13, room);
  const ownerFrame = box(2.25, 3.25, .08, new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .65 }), -8.2, 4.55, -5.08, room); ownerFrame.castShadow = false; ownerFrame.userData.action = 'owner';
  const ownerPortraitMaterial = new THREE.MeshStandardMaterial({ map: noticeTexture('WILL', [copy.ownerCaption], { width: 360, height: 540, background: '#8e3026' }), roughness: .82 });
  const ownerPortrait = box(2.02, 2.62, .02, ownerPortraitMaterial, 0, .2, .052, ownerFrame); ownerPortrait.castShadow = false;
  const ownerCaption = new THREE.Mesh(new THREE.PlaneGeometry(2.02, .35), new THREE.MeshBasicMaterial({ map: labelTexture(copy.ownerCaption, { width: 520, height: 100, background: '#8e3026' }) })); ownerCaption.position.set(0, -1.42, .07); ownerFrame.add(ownerCaption);
  posterLoader.load(new URL('./images/illan-pixel-portrait.png', import.meta.url).href, (texture) => {
    if (disposed || !ownerFrame.parent) return texture.dispose();
    texture.colorSpace = THREE.SRGBColorSpace; posterTextures.add(texture); ownerPortraitMaterial.map.dispose(); ownerPortraitMaterial.map = texture; ownerPortraitMaterial.needsUpdate = true;
  }, undefined, () => {});
  const awardsFrame = box(2.65, 3.35, .08, new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .65 }), 8.1, 4.55, -5.08, room); awardsFrame.castShadow = false; awardsFrame.userData.action = 'collective-awards';
  const awardsBoard = box(2.4, 3.05, .02, new THREE.MeshStandardMaterial({ map: noticeTexture(copy.collectiveAwards, copy.collectiveAwardLines, { width: 560, height: 720, background: '#315b73' }), roughness: .82 }), 0, 0, .052, awardsFrame); awardsBoard.castShadow = false;
  // The customer side is deliberately open: no railing or barrier crosses the counter view.
  box(13.8, 3.6, 2.4, laminate, 0, -.05, -.3, room); box(14.2, .28, 2.7, countertop, 0, 1.61, -.3, room);
  box(1.45, .035, .9, paper, -3.85, COUNTER_TOP + .018, .25, room);
  const cardFace = new THREE.Mesh(new THREE.PlaneGeometry(1.22, .68), new THREE.MeshBasicMaterial({ map: labelTexture('MEMBRO', { width: 420, height: 120, background: '#d6b84d', color: '#173552' }) })); cardFace.position.set(-3.85, COUNTER_TOP + .038, .25); cardFace.rotation.x = -Math.PI / 2; room.add(cardFace);
  // The CRT screen faces staff (-Z); its vented rear shell faces customers (+Z).
  const crt = new THREE.Group(); crt.position.set(4, COUNTER_TOP + 1.07, .25); room.add(crt);
  const beige = new THREE.MeshStandardMaterial({ color: 0xc6bfa7, roughness: .65 });
  box(2.25, 1.82, 1.38, beige, 0, 0, 0, crt);
  const screen = box(1.7, 1.23, .09, new THREE.MeshStandardMaterial({ color: 0x07151b, emissive: 0x16414a, emissiveIntensity: 1.15, roughness: .2, metalness: .1 }), 0, .03, -.735, crt); screen.castShadow = false;
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 5; col += 1) box(.16, .045, .025, dark, -.36 + col * .18, .2 + row * .12, .704, crt);
  const rearLabel = new THREE.Mesh(new THREE.PlaneGeometry(.62, .18), new THREE.MeshBasicMaterial({ map: labelTexture('CRT-90', { width: 240, height: 80, background: '#6d674f' }) })); rearLabel.position.set(0, -.45, .704); crt.add(rearLabel);
  box(2.35, .18, 1.5, beige, 0, -.98, 0, crt);
  const keyboard = new THREE.Group(); keyboard.position.set(4, COUNTER_TOP + .06, -.93); room.add(keyboard);
  box(2.18, .08, .76, new THREE.MeshStandardMaterial({ color: 0xb9b6a8, roughness: .72 }), 0, 0, 0, keyboard);
  const keyMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e0cf, roughness: .62 });
  for (let row = 0; row < 4; row += 1) for (let col = 0; col < 10; col += 1) box(.16, .045, .12, keyMaterial, -.78 + col * .175, .06, -.24 + row * .15, keyboard);
  const returns = new THREE.Group(); returns.position.set(-5.15, COUNTER_TOP + .525, -.55); room.add(returns);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.05, 1.3), new THREE.MeshStandardMaterial({ color: 0x8c9aa0, metalness: .72, roughness: .3, wireframe: true })); returns.add(basket);
  const returnLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.9, .38), new THREE.MeshBasicMaterial({ map: labelTexture('DEVOLUÇÕES', { width: 500, height: 110, background: '#9b342a' }) })); returnLabel.position.set(0, .72, .68); returns.add(returnLabel);
  (rental.returned || []).slice(-7).forEach((entry, index) => { const tape = box(.78, .22, .48, dark, -.65 + (index % 3) * .62, -.18 + Math.floor(index / 3) * .21, .05, returns); tape.rotation.y = index * .2; });
  const jar = new THREE.Group(); jar.position.set(2.25, COUNTER_TOP + .525, -.2); room.add(jar);
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(.46, .52, 1.05, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xbde3e6, transparent: true, opacity: .45, roughness: .12, transmission: .2, side: THREE.DoubleSide })));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.47, .045, 8, 20), steel); rim.position.y = .525; rim.rotation.x = Math.PI / 2; jar.add(rim);
  const pixSticker = new THREE.Mesh(new THREE.PlaneGeometry(.68, .8), new THREE.MeshBasicMaterial({ map: pixDemonstrationTexture() })); pixSticker.position.set(0, -.03, .526); jar.add(pixSticker); jar.userData.action = 'tip';
  const donationPlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .3), new THREE.MeshBasicMaterial({ map: labelTexture('DOAÇÕES', { width: 380, height: 90, background: '#31636b' }) })); donationPlaque.position.set(1.28, COUNTER_TOP + .42, .42); room.add(donationPlaque);
  const counterObject = new THREE.Group(); counterObject.position.copy(COUNTER_POSITION); room.add(counterObject);
  const interactive = [jar, ownerFrame, awardsFrame]; const tapeRecords = [];
  if (rental.rented) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.9, 1.08), new THREE.MeshPhysicalMaterial({ color: 0xf2e8cf, transparent: true, opacity: .76, roughness: .38 })); bag.position.y = .95; bag.castShadow = true; counterObject.add(bag);
    for (const x of [-.75, .75]) { const handle = new THREE.Mesh(new THREE.TorusGeometry(.45, .07, 8, 18, Math.PI), paper); handle.position.set(x, 1.91, .05); handle.rotation.z = Math.PI; counterObject.add(handle); }
    rental.rented.titles.slice(0, 4).forEach((_, index) => box(.48, 1.05, .18, dark, -1 + index * .63, .8, .63, counterObject));
    const receipt = box(.64, 1.42, .03, paper, .95, 1.8, .58, counterObject); receipt.rotation.z = -.16; const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.25, .62), new THREE.MeshBasicMaterial({ map: labelTexture('LOCADORA', { width: 500, height: 140, background: '#a7352d' }) })); mark.position.set(0, 1.03, .56); counterObject.add(mark); counterObject.userData.action = 'bag'; interactive.push(counterObject);
  } else {
    rental.counter.forEach((title, index) => {
      const vhs = createVhsCase(title, { width: .55, height: 1.1, depth: .25 }); const column = index % TAPE_COLUMNS; const row = Math.floor(index / TAPE_COLUMNS);
      vhs.group.position.set(-1.15 + column * .63 + (row % 2) * .12, .125, -.6 + row * 1.15); vhs.group.userData.baseZ = vhs.group.position.z; vhs.group.rotation.set(-Math.PI / 2, (index % 3 - 1) * .12, 0); vhs.group.userData.action = 'title'; vhs.group.userData.index = index; vhs.caseMesh.userData.index = index; vhs.front.userData.index = index; counterObject.add(vhs.group); tapeRecords.push({ title, vhs }); interactive.push(vhs.caseMesh, vhs.front);
    });
    counterObject.userData.action = 'counter'; interactive.push(counterObject);
  }
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selected = 0; let hovered = -1; let disposed = false; let frame = 0; let zoom = 1; let baseDistance = 17; let pointerX = 0; let pointerY = 0;
  function renderFeaturedPosters(titles) {
    featuredMovies(titles).forEach((title, index) => {
      const x = [-2.7, 0, 2.7][index];
      const frame = box(1.7, 2.38, .08, new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .65 }), x, 4.55, -5.07, room); frame.castShadow = false;
      const posterMaterial = new THREE.MeshStandardMaterial({ map: labelTexture(String(year || ''), { width: 300, height: 430, background: '#332820' }), roughness: .82 });
      const poster = box(1.5, 2.14, .02, posterMaterial, 0, 0, .052, frame); poster.castShadow = false;
      const yearLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.38, .18), new THREE.MeshBasicMaterial({ map: labelTexture(`${year} SELEÇÃO`, { width: 420, height: 80, background: '#1b2635' }) }));
      yearLabel.position.set(0, -1.02, .07); frame.add(yearLabel);
      const posterUrl = title.posterUrl || (title.poster ? window.locadoraPosterUrl(title.poster) : '');
      if (posterUrl) posterLoader.load(posterUrl, (texture) => {
        if (disposed || !frame.parent) return texture.dispose();
        texture.colorSpace = THREE.SRGBColorSpace; posterTextures.add(texture); posterMaterial.map.dispose(); posterMaterial.map = texture; posterMaterial.needsUpdate = true;
      }, undefined, () => {});
    });
  }
  loadFeaturedTitles(year).then((titles) => { if (!disposed) renderFeaturedPosters(titles); });
  const overheadFocus = COUNTER_POSITION.clone(); const customerCamera = new THREE.Vector3(); const overheadCamera = new THREE.Vector3(); const targetCamera = new THREE.Vector3(); const targetLookAt = new THREE.Vector3();
  function zoomProgress() { return THREE.MathUtils.smoothstep((zoom - 1) / (1.65 - 1), 0, 1); }
  function updatePointer(event) { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); pointerX = pointer.x * .34; pointerY = pointer.y * .18; }
  function intersect(event) { updatePointer(event); raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(interactive, true)[0]; }
  function activate(object) { let target = object; while (target && !target.userData.action) target = target.parent; if (target?.userData.action === 'title') onTitleSelect(tapeRecords[target.userData.index]?.title); else if (target?.userData.action === 'bag') onBagSelect(); else if (target?.userData.action === 'counter') onCounterSelect(); else if (target?.userData.action === 'tip') onTip(); else if (target?.userData.action === 'owner') onOwner(); else if (target?.userData.action === 'collective-awards') onCollectiveAwards(); }
  function click(event) { const hit = intersect(event); if (hit) { const index = hit.object.userData.index; if (Number.isInteger(index)) selected = index; activate(hit.object); } }
  function move(event) { const hit = intersect(event); hovered = Number.isInteger(hit?.object.userData.index) ? hit.object.userData.index : -1; renderer.domElement.style.cursor = hit ? 'pointer' : 'default'; }
  function adjustZoom(amount) { zoom = THREE.MathUtils.clamp(zoom + amount, .72, 1.65); return zoom; }
  function wheel(event) { updatePointer(event); event.preventDefault(); adjustZoom(event.deltaY < 0 ? .1 : -.1); }
  function keyDown(event) { if (event.key === '+' || event.key === '=') { adjustZoom(.12); event.preventDefault(); return; } if (event.key === '-' || event.key === '_') { adjustZoom(-.12); event.preventDefault(); return; } if (!tapeRecords.length) return; if (event.key === 'ArrowLeft') selected = Math.max(0, selected - 1); else if (event.key === 'ArrowRight') selected = Math.min(tapeRecords.length - 1, selected + 1); else if (event.key === 'ArrowUp') selected = Math.max(0, selected - TAPE_COLUMNS); else if (event.key === 'ArrowDown') selected = Math.min(tapeRecords.length - 1, selected + TAPE_COLUMNS); else if (event.key === 'Enter' || event.key === ' ') onTitleSelect(tapeRecords[selected]?.title); else return; event.preventDefault(); }
  function resize() { const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; baseDistance = camera.aspect < .75 ? 20 : 17; camera.updateProjectionMatrix(); }
  const observer = new ResizeObserver(resize); observer.observe(container); renderer.domElement.addEventListener('click', click); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('keydown', keyDown); renderer.domElement.addEventListener('wheel', wheel, { passive: false }); resize();
  function render() { if (disposed) return; const overhead = zoomProgress(); const parallax = 1 - overhead; customerCamera.set(pointerX * parallax, 5.8 + pointerY * parallax, baseDistance / zoom); overheadCamera.set(overheadFocus.x, overheadFocus.y + Math.max(10, baseDistance / 1.65), overheadFocus.z); targetCamera.lerpVectors(customerCamera, overheadCamera, overhead); targetLookAt.lerpVectors(homeLookAt, overheadFocus, overhead); if (reducedMotion || overhead >= 1) { camera.position.copy(targetCamera); cameraLookAt.copy(targetLookAt); } else { camera.position.lerp(targetCamera, .12); cameraLookAt.lerp(targetLookAt, .12); } camera.lookAt(cameraLookAt); tapeRecords.forEach(({ vhs }, index) => { const active = index === selected || index === hovered; const targetZ = vhs.group.userData.baseZ + (active ? .22 : 0); const targetScale = active ? 1.05 : 1; if (reducedMotion) { vhs.group.position.z = targetZ; vhs.group.scale.setScalar(targetScale); } else { vhs.group.position.z += (targetZ - vhs.group.position.z) * .16; const nextScale = THREE.MathUtils.lerp(vhs.group.scale.x, targetScale, .16); vhs.group.scale.setScalar(nextScale); } vhs.material.emissive.setHex(active ? 0x221805 : 0); }); renderer.render(scene, camera); frame = requestAnimationFrame(render); } render();
  return { zoomIn() { return adjustZoom(.12); }, zoomOut() { return adjustZoom(-.12); }, dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener('click', click); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('keydown', keyDown); renderer.domElement.removeEventListener('wheel', wheel); tapeRecords.forEach(({ vhs }) => vhs.dispose()); posterTextures.forEach((texture) => texture.dispose()); scene.traverse((object) => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose()); else object.material?.dispose(); }); renderer.dispose(); renderer.domElement.remove(); } };
}
