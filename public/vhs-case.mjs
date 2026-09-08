import * as THREE from '/vendor/three.module.js';

export function drawVhsPlaceholder(context, title) {
  const { width, height } = context.canvas;
  context.fillStyle = '#17130f'; context.fillRect(0, 0, width, height);
  context.strokeStyle = '#c99a2e'; context.lineWidth = 8; context.strokeRect(12, 12, width - 24, height - 24);
  context.fillStyle = '#e7d8b1'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '900 25px Arial Narrow, sans-serif';
  const lines = [];
  for (const word of String(title.name || 'Untitled').toUpperCase().split(/\s+/)) {
    const current = lines.at(-1) || '';
    if (!current) lines.push(word);
    else if (context.measureText(`${current} ${word}`).width < width - 36) lines[lines.length - 1] = `${current} ${word}`;
    else lines.push(word);
  }
  lines.slice(0, 4).forEach((line, index) => context.fillText(line, width / 2, height / 2 + (index - 1.5) * 32));
}

function makeCover(title) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 384;
  drawVhsPlaceholder(canvas.getContext('2d'), title);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

function drawCover(context, image) {
  const { width, height } = context.canvas;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale; const drawHeight = image.height * scale;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function spineColor(title) {
  let value = 0;
  for (const character of String(title.id || title.name || 'tape')) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${value % 360} 42% ${28 + (value % 18)}%)`;
}

function drawSpine(context, title) {
  const { width, height } = context.canvas;
  context.fillStyle = spineColor(title);
  context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(10, 8, 7, .36)';
  context.fillRect(8, 8, width - 16, height - 16);
  context.strokeStyle = '#e7d8b1';
  context.lineWidth = 5;
  context.strokeRect(7, 7, width - 14, height - 14);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 2);
  context.fillStyle = '#fff4d1';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 31px Arial Narrow, Arial, sans-serif';
  const name = String(title.name || 'Untitled').toUpperCase();
  context.fillText(name.length > 30 ? `${name.slice(0, 29)}…` : name, 0, -9, height - 42);
  context.fillStyle = '#f2c744';
  context.font = '700 20px Courier New, monospace';
  context.fillText(String(title.year || '—'), 0, 27);
  context.restore();
  context.fillStyle = '#101827';
  context.fillRect(11, height - 37, width - 22, 23);
  context.fillStyle = '#e7d8b1';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 15px Courier New, monospace';
  context.fillText('VHS', width / 2, height - 25);
}

export function createVhsCase(title, { width = .82, height = 1.45, depth = .36, posterUrl = title.posterUrl || (title.poster ? window.locadoraPosterUrl(title.poster) : '') } = {}) {
  const group = new THREE.Group();
  const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .7 });
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), caseMaterial); caseMesh.castShadow = true; group.add(caseMesh);
  const cover = makeCover(title);
  const material = new THREE.MeshStandardMaterial({ map: cover.texture, roughness: .64 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width * .88, height * .876), material); front.position.z = depth / 2 + .005; group.add(front);
  let disposed = false;
  if (posterUrl) new THREE.TextureLoader().load(posterUrl, (texture) => {
    if (disposed) return texture.dispose();
    drawCover(cover.canvas.getContext('2d'), texture.image); cover.texture.needsUpdate = true; texture.dispose();
  }, undefined, () => {});
  return { group, caseMesh, front, material, posterUrl, dispose() { disposed = true; cover.texture.dispose(); material.dispose(); front.geometry.dispose(); caseMesh.geometry.dispose(); caseMaterial.dispose(); } };
}

export function createVhsSpine(title, { width = .48, height = 1.42, depth = .52, posterUrl = title.posterUrl || (title.poster ? window.locadoraPosterUrl(title.poster) : '') } = {}) {
  const group = new THREE.Group();
  const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .7 });
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), caseMaterial);
  caseMesh.castShadow = true;
  group.add(caseMesh);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  drawSpine(canvas.getContext('2d'), title);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .58 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width * .88, height * .92), material);
  front.position.z = depth / 2 + .006;
  group.add(front);
  return { group, caseMesh, front, material, posterUrl, dispose() { texture.dispose(); material.dispose(); front.geometry.dispose(); caseMesh.geometry.dispose(); caseMaterial.dispose(); } };
}
