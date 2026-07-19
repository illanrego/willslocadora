import * as THREE from '/vendor/three.module.js';

const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1536;
const ACTIONS = {
  counter: { x: 72, y: 1328, width: 410, height: 104 },
  watch: { x: 506, y: 1328, width: 446, height: 104 },
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
  context.strokeStyle = '#3a2d22';
  context.lineWidth = 5;
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.fillStyle = ink;
  context.font = '900 29px Courier New, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
}

function drawBack(context, title, atCounter) {
  context.fillStyle = '#eee0b8';
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.strokeStyle = '#a58b5d';
  context.lineWidth = 18;
  context.strokeRect(34, 34, 956, 1468);
  context.fillStyle = '#b7392d';
  context.fillRect(72, 72, 260, 18);
  context.fillStyle = '#e3a928';
  context.fillRect(350, 72, 260, 18);
  context.fillStyle = '#2c7e84';
  context.fillRect(628, 72, 324, 18);

  context.fillStyle = '#8d3528';
  context.font = '900 25px Courier New, monospace';
  context.fillText(`${title.type === 'series' ? 'TELEVISION SERIES' : 'FEATURE PRESENTATION'} · ${String(title.source || 'CATALOGUE').toUpperCase()}`, 72, 145);

  context.fillStyle = '#211914';
  context.font = '900 82px Impact, sans-serif';
  let y = wrappedText(context, title.name, 72, 245, 880, 84, 2) + 8;

  context.fillStyle = '#8d3528';
  context.font = '800 29px Courier New, monospace';
  const meta = [title.year, ...(title.genres || []).slice(0, 3), title.imdbRating && `IMDb ★ ${title.imdbRating}`].filter(Boolean).join(' · ');
  y = wrappedText(context, meta || 'DETAILS NOT LISTED', 72, y, 880, 38, 2) + 30;

  const credits = [
    ['DIRECTOR', names(title.director, 4)],
    ['WRITERS', names(title.writer, 4)],
    ['STARRING', names(title.cast, 6)],
  ];
  for (const [label, value] of credits) {
    context.fillStyle = '#2c7378';
    context.font = '900 25px Courier New, monospace';
    context.fillText(label, 72, y);
    context.fillStyle = '#4e4231';
    context.font = '700 25px Arial, sans-serif';
    y = wrappedText(context, value, 260, y, 692, 33, 2) + 18;
  }

  context.strokeStyle = '#b9a373';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(72, y);
  context.lineTo(952, y);
  context.stroke();
  y += 48;
  context.fillStyle = '#4b4031';
  context.font = '28px Georgia, serif';
  wrappedText(context, title.description || 'No synopsis was included by this catalogue source.', 72, y, 880, 39, 8);

  drawButton(context, ACTIONS.counter, atCounter ? 'RETURN TO SHELF' : 'TAKE TO COUNTER', '#d8c698', '#32271e');
  drawButton(context, ACTIONS.watch, 'WATCH IN STREMIO →', '#e3a928', '#211914');
  context.fillStyle = '#b7392d';
  context.font = '900 22px Courier New, monospace';
  context.fillText('BE KIND · REWIND   /   DRAG TO INSPECT', 72, 1480);
}

function inside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function names(value, limit) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values.map((item) => item.trim()).filter(Boolean).slice(0, limit).join(', ') || 'Not listed';
}

function drawPoster(context, image) {
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
}

export function createVhsViewer({ container, title, posterUrl, atCounter, onCounter, onWatch, onClose }) {
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

  const backCanvas = canvasTexture((context) => drawBack(context, title, atCounter));
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
  if (posterUrl) {
    loader.load(posterUrl, (texture) => {
      if (disposed) return texture.dispose();
      drawPoster(frontCanvas.canvas.getContext('2d'), texture.image);
      frontCanvas.texture.needsUpdate = true;
      texture.dispose();
    }, undefined, () => {});
  }

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
      if (inside(ACTIONS.watch, x, y)) return onWatch();
    }
  }

  function doubleClick(event) {
    const hit = pick(event);
    if (!hit) return;
    if (hit.object.userData.surface === 'back' && hit.uv) {
      const x = hit.uv.x * TEXTURE_WIDTH;
      const y = (1 - hit.uv.y) * TEXTURE_HEIGHT;
      if (inside(ACTIONS.counter, x, y) || inside(ACTIONS.watch, x, y)) return;
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
    update(nextTitle, nextAtCounter) {
      title = nextTitle;
      drawBack(backCanvas.canvas.getContext('2d'), title, nextAtCounter);
      backCanvas.texture.needsUpdate = true;
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
