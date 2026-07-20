import * as THREE from '/vendor/three.module.js';

const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1536;
const ACTIONS = {
  counter: { x: 72, y: 1328, width: 276, height: 104 },
  availability: { x: 374, y: 1328, width: 276, height: 104 },
  watch: { x: 676, y: 1328, width: 276, height: 104 },
};
const LOCADORA_PALETTE = {
  ink: '#080d17',
  navy: '#101827',
  red: '#9e3634',
  yellow: '#c99a2e',
  cream: '#e7d8b1',
  white: '#f7edcf',
};

function canvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  draw(canvas.getContext('2d'), canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, texture };
}

function wrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    context.fillText(line, x, y);
    y += lineHeight;
    lines += 1;
    if (lines >= maxLines) return y;
    line = word;
  }
  if (line && lines < maxLines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function drawFront(context, title) {
  context.fillStyle = '#171310';
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.fillStyle = '#eadcae';
  context.fillRect(64, 1100, 896, 290);
  context.fillStyle = '#b7392d';
  context.fillRect(64, 1100, 896, 22);
  context.fillStyle = '#211914';
  context.font = '900 70px Impact, sans-serif';
  wrappedText(context, title.name, 108, 1210, 800, 76, 2);
  context.fillStyle = '#66583f';
  context.font = '700 30px Courier New, monospace';
  context.fillText(`${title.year || 'YEAR UNKNOWN'} · ${String(title.type || 'VIDEO').toUpperCase()}`, 108, 1350);
}

function drawButton(context, rect, label, fill, ink) {
  context.fillStyle = fill;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeStyle = LOCADORA_PALETTE.red;
  context.lineWidth = 5;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = ink;
  context.font = '900 22px Courier New, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
}

function drawImageFrame(context, image, x, y, width, height, focus = 0.5) {
  context.fillStyle = LOCADORA_PALETTE.ink;
  context.fillRect(x, y, width, height);
  if (image) {
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) * focus, drawWidth, drawHeight);
    context.restore();
  }
  context.strokeStyle = LOCADORA_PALETTE.yellow;
  context.lineWidth = 7;
  context.strokeRect(x, y, width, height);
}

function drawBarcode(context, value, x, y, width, height) {
  context.fillStyle = '#f6f3e7';
  context.fillRect(x, y, width, height);
  let seed = 0;
  for (const character of String(value || 'LOCADORA')) seed = ((seed * 31) + character.charCodeAt(0)) >>> 0;
  let cursor = x + 24;
  while (cursor < x + width - 24) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const bar = 2 + (seed % 7);
    context.fillStyle = '#111';
    context.fillRect(cursor, y + 18, bar, height - 55);
    cursor += bar + 3 + ((seed >>> 8) % 5);
  }
  context.fillStyle = '#111';
  context.font = '700 19px Courier New, monospace';
  context.textAlign = 'center';
  context.fillText(String(value || 'WILLS-LOCADORA').toUpperCase(), x + width / 2, y + height - 15);
  context.textAlign = 'left';
}

function drawBack(context, title, atCounter, posterImage = null, backdropImage = null) {
  context.fillStyle = LOCADORA_PALETTE.ink;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.fillStyle = LOCADORA_PALETTE.navy;
  context.fillRect(32, 32, 960, 1472);
  context.fillStyle = LOCADORA_PALETTE.red;
  context.fillRect(32, 32, 960, 142);
  context.strokeStyle = LOCADORA_PALETTE.yellow;
  context.lineWidth = 10;
  context.strokeRect(44, 44, 936, 1448);

  context.fillStyle = LOCADORA_PALETTE.cream;
  context.font = '900 24px Arial Narrow, sans-serif';
  context.fillText("WILL'S LOCADORA · VIDEO ARCHIVE", 72, 92);
  context.font = '700 18px Courier New, monospace';
  context.fillText(`${title.type === 'series' ? 'HOME VIDEO SERIES' : 'FEATURE PRESENTATION'} · ${title.year || 'YEAR UNKNOWN'}`, 72, 130);
  drawBarcode(context, title.id, 596, 68, 356, 126);

  context.fillStyle = LOCADORA_PALETTE.yellow;
  context.font = '900 74px Impact, Arial Narrow, sans-serif';
  wrappedText(context, title.name, 72, 250, 880, 75, 2);
  context.fillStyle = LOCADORA_PALETTE.cream;
  context.font = '800 23px Arial Narrow, sans-serif';
  const meta = [...(title.genres || []).slice(0, 3), title.imdbRating && `IMDb ★ ${title.imdbRating}`, title.certificationBR && `BR ${title.certificationBR}`].filter(Boolean).join('  ·  ');
  context.fillText(meta || 'CATALOGUE EDITION', 72, 365);

  drawImageFrame(context, posterImage, 72, 405, 348, 285, 0.18);
  drawImageFrame(context, backdropImage || posterImage, 448, 405, 504, 285, 0.5);

  context.fillStyle = LOCADORA_PALETTE.red;
  context.fillRect(72, 720, 880, 8);
  context.fillStyle = LOCADORA_PALETTE.yellow;
  context.font = '900 29px Arial Narrow, sans-serif';
  context.fillText('THE STORY', 72, 750);
  context.fillStyle = LOCADORA_PALETTE.white;
  context.font = '25px Arial, sans-serif';
  wrappedText(context, title.description || 'No synopsis was included by this catalogue source.', 72, 790, 880, 34, 6);

  const providers = title.availabilityBR?.providers || [];
  context.fillStyle = LOCADORA_PALETTE.yellow;
  context.font = '900 20px Arial Narrow, sans-serif';
  context.fillText('WHERE TO WATCH · BRAZIL', 72, 1015);
  context.fillStyle = LOCADORA_PALETTE.cream;
  context.font = '700 20px Arial, sans-serif';
  context.fillText(providers.join(' · ') || 'No provider listing returned', 326, 1015);

  context.strokeStyle = LOCADORA_PALETTE.red;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(72, 1058);
  context.lineTo(952, 1058);
  context.stroke();

  const credits = [
    ['DIRECTED BY', names(title.director, 4)],
    ['WRITTEN BY', names(title.writer, 4)],
    ['STARRING', names(title.cast, 10)],
  ];
  let y = 1105;
  for (const [label, value] of credits) {
    context.fillStyle = LOCADORA_PALETTE.yellow;
    context.font = '900 20px Arial Narrow, sans-serif';
    context.fillText(label, 72, y);
    context.fillStyle = LOCADORA_PALETTE.cream;
    context.font = '700 20px Arial, sans-serif';
    y = wrappedText(context, value, 242, y, 710, 27, 2) + 12;
  }

  context.fillStyle = LOCADORA_PALETTE.cream;
  context.font = '16px Courier New, monospace';
  context.fillText('CATALOGUE LISTING ONLY · PLAYBACK AND AVAILABILITY BY YOUR STREMIO SETUP', 72, 1288);
  drawButton(context, ACTIONS.counter, atCounter ? 'RETURN TAPE' : 'TO COUNTER', LOCADORA_PALETTE.cream, LOCADORA_PALETTE.ink);
  drawButton(context, ACTIONS.availability, 'WATCH OPTIONS ↗', LOCADORA_PALETTE.red, LOCADORA_PALETTE.white);
  drawButton(context, ACTIONS.watch, 'STREMIO →', LOCADORA_PALETTE.yellow, LOCADORA_PALETTE.ink);

  context.fillStyle = LOCADORA_PALETTE.cream;
  context.font = '900 18px Courier New, monospace';
  context.fillText('VHS  ·  BE KIND, REWIND  ·  DRAG TO INSPECT', 72, 1480);
  context.globalAlpha = 0.13;
  context.strokeStyle = '#fff';
  context.lineWidth = 2;
  for (let index = 0; index < 20; index += 1) {
    const scratchY = 60 + ((index * 83 + String(title.id || '').length * 17) % 1410);
    context.beginPath();
    context.moveTo(48 + (index % 4) * 19, scratchY);
    context.lineTo(976 - (index % 5) * 31, scratchY + (index % 3) * 2);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function inside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function names(value, limit) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values.map((item) => item.trim()).filter(Boolean).slice(0, limit).join(', ') || 'Not listed';
}

function drawPoster(context, image, title, logoImage = null) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#171310';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  context.fillStyle = 'rgba(8, 13, 23, .84)';
  context.fillRect(56, 1180, width - 112, 218);
  if (logoImage) {
    const logoWidth = logoImage.naturalWidth || logoImage.width;
    const logoHeight = logoImage.naturalHeight || logoImage.height;
    const logoScale = Math.min(760 / logoWidth, 130 / logoHeight);
    const fittedWidth = logoWidth * logoScale;
    const fittedHeight = logoHeight * logoScale;
    context.drawImage(logoImage, (width - fittedWidth) / 2, 1216 + (130 - fittedHeight) / 2, fittedWidth, fittedHeight);
  } else {
    context.fillStyle = LOCADORA_PALETTE.cream;
    context.font = '900 64px Impact, sans-serif';
    wrappedText(context, title.name, 96, 1270, width - 192, 70, 2);
  }
  context.fillStyle = LOCADORA_PALETTE.yellow;
  context.font = '700 24px Courier New, monospace';
  context.fillText(`${title.year || 'YEAR UNKNOWN'} · ${String(title.type || 'VIDEO').toUpperCase()}`, 92, 1366);
}

export function createVhsViewer({ container, title, posterUrl, backdropUrl, logoUrl, atCounter, onCounter, onAvailability, onWatch, onClose }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = 'vhs-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', `${title.name} VHS case. Drag to rotate, double-click to flip, or press the arrow keys.`);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 11.5);
  scene.add(new THREE.HemisphereLight(0xffe7c5, 0x21130e, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffd8ae, 4.2);
  keyLight.position.set(-4, 6, 8);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x6fc7d0, 2.4);
  rimLight.position.set(6, -2, -5);
  scene.add(rimLight);

  const group = new THREE.Group();
  scene.add(group);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x171411, roughness: 0.55, metalness: 0.08 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(4.08, 6.08, 0.46), shellMaterial);
  group.add(shell);

  const frontCanvas = canvasTexture((context) => drawFront(context, title));
  const frontMaterial = new THREE.MeshStandardMaterial({ map: frontCanvas.texture, roughness: 0.62 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3.82, 5.82), frontMaterial);
  front.position.z = 0.236;
  front.userData.surface = 'front';
  group.add(front);

  let posterImage = null;
  let backdropImage = null;
  let logoImage = null;
  let currentAtCounter = atCounter;
  const backCanvas = canvasTexture((context) => drawBack(context, title, currentAtCounter, posterImage, backdropImage));
  const backMaterial = new THREE.MeshStandardMaterial({ map: backCanvas.texture, roughness: 0.72 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.82, 5.82), backMaterial);
  back.position.z = -0.236;
  back.rotation.y = Math.PI;
  back.userData.surface = 'back';
  group.add(back);

  const ridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x29231f, roughness: 0.8 });
  for (const x of [-1.97, 1.97]) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 5.92, 0.54), ridgeMaterial);
    ridge.position.x = x;
    group.add(ridge);
  }

  let disposed = false;
  const loader = new THREE.TextureLoader();
  const assetUrls = {};
  function redraw() {
    const frontContext = frontCanvas.canvas.getContext('2d');
    if (posterImage) drawPoster(frontContext, posterImage, title, logoImage);
    else drawFront(frontContext, title);
    frontCanvas.texture.needsUpdate = true;
    drawBack(backCanvas.canvas.getContext('2d'), title, currentAtCounter, posterImage, backdropImage);
    backCanvas.texture.needsUpdate = true;
  }
  function loadAsset(name, url) {
    if (!url || assetUrls[name] === url) return;
    assetUrls[name] = url;
    loader.load(url, (texture) => {
      if (disposed || assetUrls[name] !== url) return texture.dispose();
      if (name === 'poster') posterImage = texture.image;
      if (name === 'backdrop') backdropImage = texture.image;
      if (name === 'logo') logoImage = texture.image;
      redraw();
      texture.dispose();
    }, undefined, () => {});
  }
  loadAsset('poster', posterUrl);
  loadAsset('backdrop', backdropUrl);
  loadAsset('logo', logoUrl);

  let targetX = -0.06;
  let targetY = -0.32;
  let velocityY = 0;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let frame = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = camera.aspect < 0.7 ? 13.5 : 11.5;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function pick(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([front, back], false)[0] || null;
  }

  function pointerDown(event) {
    dragging = true;
    moved = 0;
    velocityY = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.classList.add('is-dragging');
  }

  function pointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    velocityY = dx * 0.012;
    targetY += velocityY;
    targetX = THREE.MathUtils.clamp(targetX + dy * 0.008, -0.72, 0.72);
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function pointerUp(event) {
    if (!dragging) return;
    dragging = false;
    renderer.domElement.classList.remove('is-dragging');
    if (moved >= 8) {
      targetY += velocityY * 2.5;
      return;
    }
    const hit = pick(event);
    if (!hit) return onClose();
    if (hit.object.userData.surface === 'back' && hit.uv) {
      const x = hit.uv.x * TEXTURE_WIDTH;
      const y = (1 - hit.uv.y) * TEXTURE_HEIGHT;
      if (inside(ACTIONS.counter, x, y)) return onCounter();
      if (inside(ACTIONS.availability, x, y)) return onAvailability();
      if (inside(ACTIONS.watch, x, y)) return onWatch();
    }
  }

  function doubleClick(event) {
    const hit = pick(event);
    if (!hit) return;
    if (hit.object.userData.surface === 'back' && hit.uv) {
      const x = hit.uv.x * TEXTURE_WIDTH;
      const y = (1 - hit.uv.y) * TEXTURE_HEIGHT;
      if (inside(ACTIONS.counter, x, y) || inside(ACTIONS.availability, x, y) || inside(ACTIONS.watch, x, y)) return;
    }
    targetY += Math.PI;
  }

  function keyDown(event) {
    if (event.key === 'ArrowLeft') targetY -= 0.22;
    else if (event.key === 'ArrowRight') targetY += 0.22;
    else if (event.key === 'ArrowUp') targetX = THREE.MathUtils.clamp(targetX - 0.16, -0.72, 0.72);
    else if (event.key === 'ArrowDown') targetX = THREE.MathUtils.clamp(targetX + 0.16, -0.72, 0.72);
    else if (event.key === 'Enter' || event.key === ' ') targetY += Math.PI;
    else return;
    event.preventDefault();
  }

  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', pointerUp);
  renderer.domElement.addEventListener('dblclick', doubleClick);
  renderer.domElement.addEventListener('keydown', keyDown);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render(time) {
    if (disposed) return;
    group.rotation.x += (targetX - group.rotation.x) * 0.12;
    group.rotation.y += (targetY - group.rotation.y) * 0.12;
    group.position.y = reducedMotion ? 0 : Math.sin(time * 0.0014) * 0.035;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  renderer.domElement.focus({ preventScroll: true });

  return {
    update(nextTitle, nextAtCounter, assets = {}) {
      title = nextTitle;
      currentAtCounter = nextAtCounter;
      redraw();
      loadAsset('poster', assets.posterUrl);
      loadAsset('backdrop', assets.backdropUrl);
      loadAsset('logo', assets.logoUrl);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerUp);
      renderer.domElement.removeEventListener('dblclick', doubleClick);
      renderer.domElement.removeEventListener('keydown', keyDown);
      frontCanvas.texture.dispose();
      backCanvas.texture.dispose();
      frontMaterial.map?.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();
      shellMaterial.dispose();
      ridgeMaterial.dispose();
      shell.geometry.dispose();
      front.geometry.dispose();
      back.geometry.dispose();
      for (const child of group.children.slice(3)) child.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
