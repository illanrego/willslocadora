import * as THREE from '/vendor/three.module.js';

const COLUMNS = 10;
const ROWS = 4;
const MAX_TAPES = COLUMNS * ROWS;

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

function drawCover(context, image) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawPlaceholder(context, title) {
  const { width, height } = context.canvas;
  context.fillStyle = '#17130f';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#c99a2e';
  context.lineWidth = 8;
  context.strokeRect(12, 12, width - 24, height - 24);
  context.fillStyle = '#e7d8b1';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 25px Arial Narrow, sans-serif';
  const words = String(title.name || 'Untitled').toUpperCase().split(/\s+/);
  const lines = [];
  for (const word of words) {
    const current = lines.at(-1) || '';
    if (!current) lines.push(word);
    else if (context.measureText(`${current} ${word}`).width < width - 36) lines[lines.length - 1] = `${current} ${word}`;
    else lines.push(word);
  }
  lines.slice(0, 4).forEach((line, index) => context.fillText(line, width / 2, height / 2 + (index - 1.5) * 32));
}

function drawSign(context, genre, year, type, loading = false) {
  const { width, height } = context.canvas;
  context.fillStyle = '#e7d8b1';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#527f9e';
  context.lineWidth = 24;
  context.strokeRect(12, 12, width - 24, height - 24);
  context.fillStyle = '#101827';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 92px Impact, Arial Narrow, sans-serif';
  context.fillText(String(genre).toUpperCase(), width / 2, 105);
  context.font = '700 32px Courier New, monospace';
  context.fillText(loading ? 'OPENING THE BOXES…' : `${year}  •  ${type === 'series' ? 'SERIES' : 'MOVIES'}`, width / 2, 196);
}

function drawStandMarker(context, stand) {
  const { width, height } = context.canvas;
  context.fillStyle = '#101827';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#9e3634';
  context.fillRect(0, 0, width, 38);
  context.strokeStyle = '#c99a2e';
  context.lineWidth = 10;
  context.strokeRect(5, 5, width - 10, height - 10);
  context.fillStyle = '#e7d8b1';
  context.textAlign = 'center';
  context.font = '900 26px Courier New, monospace';
  context.fillText('STAND', width / 2, 31);
  context.fillStyle = '#c99a2e';
  context.font = '900 78px Impact, Arial Narrow, sans-serif';
  context.fillText(String(stand + 1).padStart(2, '0'), width / 2, 126);
}

export function createImmersiveShelf({ container, titles = [], genre, year, type, stand = 0, onSelect }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'immersive-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', `${genre} rental shelf. Use arrow keys to choose a tape and Enter to inspect it.`);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090f);
  scene.fog = new THREE.Fog(0x06090f, 15, 28);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  camera.position.set(0, 0.55, 18.2);

  scene.add(new THREE.HemisphereLight(0xffefc2, 0x17150f, 2.1));
  const keyLight = new THREE.SpotLight(0xffe7ad, 75, 30, Math.PI / 4, 0.45, 1.3);
  keyLight.position.set(-4, 8, 8);
  keyLight.castShadow = true;
  scene.add(keyLight);
  const amberLight = new THREE.PointLight(0xc99a2e, 18, 18);
  amberLight.position.set(5, 2, 5);
  scene.add(amberLight);

  const room = new THREE.Group();
  scene.add(room);
  const wood = new THREE.MeshStandardMaterial({ color: 0x111011, roughness: 0.68, metalness: 0.08 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.72 });
  const backingMaterial = new THREE.MeshStandardMaterial({ color: 0x2f526b, roughness: 0.78 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x527f9e, roughness: 0.72 });
  const backing = new THREE.Mesh(new THREE.BoxGeometry(12, 9.2, 0.35), backingMaterial);
  backing.position.z = -0.45;
  backing.receiveShadow = true;
  room.add(backing);
  for (const x of [-6.05, 6.05]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 9.85, 0.72), wood);
    post.position.set(x, -0.12, -0.02);
    post.castShadow = true;
    room.add(post);
  }
  for (const y of [-4.25, -2.2, -0.15, 1.9, 3.95]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.3, 1.05), wood);
    board.position.set(0, y, 0);
    board.castShadow = true;
    board.receiveShadow = true;
    room.add(board);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(12.42, 0.09, 1.08), trim);
    lip.position.set(0, y + 0.18, 0.02);
    room.add(lip);
  }

  const signCanvas = canvasTexture(1024, 240, (context) => drawSign(context, genre, year, type));
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(7.9, 1.58, 0.22),
    [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: signCanvas.texture, roughness: 0.62 }), edge],
  );
  sign.position.set(0, 5.15, 0.18);
  sign.castShadow = true;
  room.add(sign);

  const standCanvas = canvasTexture(320, 160, (context) => drawStandMarker(context, stand));
  const standMarker = new THREE.Mesh(
    new THREE.BoxGeometry(1.36, 0.9, 0.16),
    [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: standCanvas.texture, roughness: 0.58 }), edge],
  );
  standMarker.position.set(4.88, 4.88, 0.18);
  standMarker.castShadow = true;
  room.add(standMarker);

  const lampPositions = [-3.2, 3.2];
  const lampShade = new THREE.MeshStandardMaterial({ color: 0x6b321d, metalness: 0.65, roughness: 0.32, side: THREE.DoubleSide });
  const lampBulb = new THREE.MeshStandardMaterial({ color: 0xffc06b, emissive: 0xff7a28, emissiveIntensity: 3.5, roughness: 0.3 });
  for (const x of lampPositions) {
    const fixture = new THREE.Group();
    fixture.position.set(x, 6.05, 0.62);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.45, 12), lampShade);
    stem.position.y = 0.22;
    fixture.add(stem);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 24, 1, true), lampShade);
    shade.position.y = -0.1;
    shade.rotation.x = Math.PI;
    fixture.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), lampBulb);
    bulb.position.y = -0.2;
    fixture.add(bulb);
    room.add(fixture);

    const lamp = new THREE.SpotLight(0xffb15c, 32, 13, 0.58, 0.6, 1.5);
    lamp.position.set(x, 5.82, 0.7);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.target.position.set(x, 0.2, 0.25);
    room.add(lamp, lamp.target);
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 18),
    new THREE.MeshStandardMaterial({ color: 0x242936, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.72;
  floor.receiveShadow = true;
  scene.add(floor);

  const loader = new THREE.TextureLoader();
  const tapes = new THREE.Group();
  room.add(tapes);
  let tapeRecords = [];
  let disposed = false;
  let hovered = -1;
  let selected = 0;
  let frame = 0;
  let pointerTargetX = 0;
  let pointerTargetY = 0.55;
  let baseCameraDistance = 18.2;
  let targetCameraDistance = 18.2;
  let zoomLevel = 1;
  let activeStand = stand;
  let standTransition = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearTapes() {
    for (const record of tapeRecords) {
      record.cover.texture.dispose();
      record.material.dispose();
      record.front.geometry.dispose();
      record.caseMesh.geometry.dispose();
      record.caseMesh.material.dispose();
      tapes.remove(record.group);
    }
    tapeRecords = [];
  }

  function renderTapes(nextTitles) {
    clearTapes();
    nextTitles.slice(0, MAX_TAPES).forEach((title, index) => {
      const row = Math.floor(index / COLUMNS);
      const column = index % COLUMNS;
      const group = new THREE.Group();
      group.position.set(-5 + column * 1.11, 2.9 - row * 2.05, 0.34);
      group.userData.baseZ = 0.34;
      group.rotation.y = (column - 4.5) * -0.007;
      group.userData.index = index;

      const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x171310, roughness: 0.7 });
      const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.45, 0.28), caseMaterial);
      caseMesh.castShadow = true;
      caseMesh.userData.index = index;
      group.add(caseMesh);

      const cover = canvasTexture(256, 384, (context) => drawPlaceholder(context, title));
      const material = new THREE.MeshStandardMaterial({ map: cover.texture, roughness: 0.64 });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.27), material);
      front.position.z = 0.145;
      front.userData.index = index;
      group.add(front);
      tapes.add(group);
      const record = { title, group, caseMesh, front, cover, material };
      tapeRecords.push(record);

      if (title.posterUrl) {
        loader.load(title.posterUrl, (texture) => {
          if (disposed || !tapeRecords.includes(record)) return texture.dispose();
          drawCover(cover.canvas.getContext('2d'), texture.image);
          cover.texture.needsUpdate = true;
          texture.dispose();
        }, undefined, () => {});
      }
    });
    selected = Math.min(selected, Math.max(tapeRecords.length - 1, 0));
  }

  function updateSign(nextGenre, nextYear, nextType, loading = false, nextStand = activeStand) {
    activeStand = nextStand;
    drawSign(signCanvas.canvas.getContext('2d'), nextGenre, nextYear, nextType, loading);
    signCanvas.texture.needsUpdate = true;
    drawStandMarker(standCanvas.canvas.getContext('2d'), activeStand);
    standCanvas.texture.needsUpdate = true;
    renderer.domElement.setAttribute('aria-label', `${nextGenre} rental shelf. Use arrow keys to choose a tape and Enter to inspect it.`);
  }

  function pick(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(tapeRecords.flatMap(({ caseMesh, front }) => [caseMesh, front]), false)[0] || null;
  }

  function adjustZoom(amount) {
    zoomLevel = THREE.MathUtils.clamp(zoomLevel + amount, 0.72, 1.75);
    targetCameraDistance = baseCameraDistance / zoomLevel;
    if (reducedMotion) camera.position.z = targetCameraDistance;
    return zoomLevel;
  }

  function wheel(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.intersectObject(room, true).length) return;
    event.preventDefault();
    adjustZoom(event.deltaY < 0 ? 0.1 : -0.1);
  }

  function pointerMove(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointerTargetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.55;
    pointerTargetY = 0.55 - ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.35;
    const hit = pick(event);
    hovered = hit ? hit.object.userData.index : -1;
    renderer.domElement.style.cursor = hovered >= 0 ? 'pointer' : 'default';
  }

  function click(event) {
    const hit = pick(event);
    if (!hit) return;
    selected = hit.object.userData.index;
    const record = tapeRecords[selected];
    if (record) onSelect(record.title, record.title.posterUrl);
  }

  function keyDown(event) {
    if (event.key === '+' || event.key === '=') {
      adjustZoom(0.12);
      event.preventDefault();
      return;
    }
    if (event.key === '-' || event.key === '_') {
      adjustZoom(-0.12);
      event.preventDefault();
      return;
    }
    if (!tapeRecords.length) return;
    if (event.key === 'ArrowLeft') selected = Math.max(0, selected - 1);
    else if (event.key === 'ArrowRight') selected = Math.min(tapeRecords.length - 1, selected + 1);
    else if (event.key === 'ArrowUp') selected = Math.max(0, selected - COLUMNS);
    else if (event.key === 'ArrowDown') selected = Math.min(tapeRecords.length - 1, selected + COLUMNS);
    else if (event.key === 'Enter' || event.key === ' ') {
      const record = tapeRecords[selected];
      if (record) onSelect(record.title, record.title.posterUrl);
    } else return;
    event.preventDefault();
  }

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fitHeight = 6.05 / verticalTangent;
    const fitWidth = 6.45 / (verticalTangent * camera.aspect);
    baseCameraDistance = Math.max(fitHeight, fitWidth) * 1.18;
    targetCameraDistance = baseCameraDistance / zoomLevel;
    if (!frame || reducedMotion) camera.position.z = targetCameraDistance;
    scene.fog.near = baseCameraDistance * 0.82;
    scene.fog.far = baseCameraDistance + 14;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('click', click);
  renderer.domElement.addEventListener('keydown', keyDown);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  resize();
  renderTapes(titles);

  function render(time) {
    if (disposed) return;
    if (!reducedMotion) {
      camera.position.x += (pointerTargetX - camera.position.x) * 0.035;
      camera.position.y += (pointerTargetY - camera.position.y) * 0.035;
      camera.position.z += (targetCameraDistance - camera.position.z) * 0.12;
    } else {
      camera.position.z = targetCameraDistance;
    }
    camera.lookAt(0, 0.25, 0);
    if (standTransition) {
      const targetX = standTransition.phase === 'out' ? -standTransition.direction * 14 : 0;
      room.position.x += (targetX - room.position.x) * 0.16;
      if (standTransition.phase === 'out' && Math.abs(targetX - room.position.x) < 0.08) {
        updateSign(standTransition.genre, standTransition.year, standTransition.type, false, standTransition.stand);
        renderTapes(standTransition.titles);
        room.position.x = standTransition.direction * 14;
        standTransition.phase = 'in';
      } else if (standTransition.phase === 'in' && Math.abs(room.position.x) < 0.08) {
        room.position.x = 0;
        standTransition = null;
      }
    }
    tapeRecords.forEach((record, index) => {
      const active = index === hovered || index === selected;
      const z = record.group.userData.baseZ + (active ? 0.3 : 0);
      record.group.position.z += (z - record.group.position.z) * 0.16;
      const scale = active ? 1.045 : 1;
      record.group.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.16);
      record.material.emissive.setHex(active ? 0x221805 : 0x000000);
    });
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);

  return {
    zoomIn() {
      return adjustZoom(0.12);
    },
    zoomOut() {
      return adjustZoom(-0.12);
    },
    setLoading(nextGenre, nextYear, nextType, nextStand) {
      updateSign(nextGenre, nextYear, nextType, true, nextStand);
    },
    update(nextTitles, nextGenre, nextYear, nextType, nextStand) {
      standTransition = null;
      room.position.x = 0;
      updateSign(nextGenre, nextYear, nextType, false, nextStand);
      renderTapes(nextTitles);
    },
    transition(nextTitles, nextGenre, nextYear, nextType, nextStand, direction) {
      if (reducedMotion || !direction) {
        this.update(nextTitles, nextGenre, nextYear, nextType, nextStand);
        return;
      }
      hovered = -1;
      selected = 0;
      standTransition = {
        phase: 'out',
        direction: Math.sign(direction),
        titles: nextTitles,
        genre: nextGenre,
        year: nextYear,
        type: nextType,
        stand: nextStand,
      };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('click', click);
      renderer.domElement.removeEventListener('keydown', keyDown);
      renderer.domElement.removeEventListener('wheel', wheel);
      clearTapes();
      signCanvas.texture.dispose();
      standCanvas.texture.dispose();
      const geometries = new Set();
      const materials = new Set();
      room.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
