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

export function createVhsCase(title, { width = .82, height = 1.45, depth = .28, posterUrl = title.posterUrl || (title.poster ? window.locadoraPosterUrl(title.poster) : '') } = {}) {
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
