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

// Spine label: the TMDB logo (styled wordmark) when available, else the plain vertical title.
// Vertical logos (like Toy Story 4) keep their natural orientation; horizontal ones
// (like Deadpool 2) are rotated 90° so they read vertically along the spine.
function drawSpineLogo(context, title, logoImage) {
  const { width, height } = context.canvas;
  const iw = logoImage.naturalWidth || logoImage.width;
  const ih = logoImage.naturalHeight || logoImage.height;
  if (!iw || !ih) return;
  const portrait = ih >= iw;
  const maxW = width - 12;
  const maxH = height - 30;
  context.save();
  context.translate(width / 2, height / 2);
  if (!portrait) context.rotate(Math.PI / 2);
  const scale = portrait
    ? Math.min(maxW / iw, maxH / ih)
    : Math.min(maxW / ih, maxH / iw);
  const dw = iw * scale;
  const dh = ih * scale;
  context.drawImage(logoImage, -dw / 2, -dh / 2, dw, dh);
  context.restore();
}

// Shared spine label + VHS tab, drawn over whichever spine background is chosen.
function drawSpineLabel(context, title, logoImage) {
  const { width, height } = context.canvas;
  if (logoImage && (logoImage.naturalWidth || logoImage.width)) {
    drawSpineLogo(context, title, logoImage);
  } else {
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(-Math.PI / 2);
    context.fillStyle = '#fff4d1';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 31px Arial Narrow, Arial, sans-serif';
    const name = String(title.name || 'Untitled').toUpperCase();
    context.fillText(name.length > 30 ? `${name.slice(0, 29)}…` : name, 0, -9, height - 42);
    context.restore();
  }
  context.fillStyle = '#101827';
  context.fillRect(11, height - 37, width - 22, 23);
  context.fillStyle = '#e7d8b1';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 15px Courier New, monospace';
  context.fillText('VHS', width / 2, height - 25);
}

// Placeholder spine used before/without a poster: a deterministic per-title color.
function drawSpine(context, title, logoImage) {
  const { width, height } = context.canvas;
  context.fillStyle = spineColor(title);
  context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(10, 8, 7, .4)';
  context.fillRect(8, 8, width - 16, height - 16);
  drawSpineLabel(context, title, logoImage);
}

// Spine styled from the actual TMDB poster, so the side matches the movie design.
function drawSpineArt(context, title, image, logoImage) {
  const { width, height } = context.canvas;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  context.fillStyle = 'rgba(8, 5, 4, .32)';
  context.fillRect(0, 0, width, height);
  drawSpineLabel(context, title, logoImage);
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

export function createVhsSpine(title, { width = .4, height = 1.42, depth = .3, posterUrl = title.posterUrl || (title.poster ? window.locadoraPosterUrl(title.poster) : ''), logoUrl = title.logoUrl || (title.logo ? window.locadoraPosterUrl(title.logo) : '') } = {}) {
  const group = new THREE.Group();
  const caseMaterial = new THREE.MeshStandardMaterial({ color: 0x171310, roughness: .7 });
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), caseMaterial);
  caseMesh.castShadow = true;
  group.add(caseMesh);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .58 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width * .88, height * .92), material);
  front.position.z = depth / 2 + .006;
  group.add(front);
  let disposed = false;
  let posterImage = null;
  let logoImage = null;
  let activeLogoUrl = logoUrl;
  const draw = () => {
    if (disposed) return;
    const context = canvas.getContext('2d');
    if (posterImage) drawSpineArt(context, title, posterImage, logoImage);
    else drawSpine(context, title, logoImage);
    texture.needsUpdate = true;
  };
  draw();
  if (posterUrl) new THREE.TextureLoader().load(posterUrl, (poster) => {
    if (disposed) return poster.dispose();
    posterImage = poster.image;
    draw();
    poster.dispose();
  }, undefined, () => {});
  const loadLogo = (url) => {
    if (!url || disposed) return;
    new THREE.TextureLoader().load(url, (logo) => {
      if (disposed || url !== activeLogoUrl) return logo.dispose();
      logoImage = logo.image;
      draw();
      logo.dispose();
    }, undefined, () => {});
  };
  loadLogo(activeLogoUrl);
  return {
    group, caseMesh, front, material, posterUrl, logoUrl: activeLogoUrl,
    setLogo(url) {
      if (disposed || !url || url === activeLogoUrl) return;
      activeLogoUrl = url;
      loadLogo(url);
    },
    dispose() { disposed = true; texture.dispose(); material.dispose(); front.geometry.dispose(); caseMesh.geometry.dispose(); caseMaterial.dispose(); },
  };
}
