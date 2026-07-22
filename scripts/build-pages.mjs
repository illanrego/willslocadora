import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const dist = resolve(root, 'dist');
const threeBuild = resolve(root, 'node_modules/three/build');
const three = resolve(threeBuild, 'three.module.js');

if (!existsSync(three)) throw new Error('Three.js browser module is missing; run npm install first.');
rmSync(dist, { recursive: true, force: true });
cpSync(publicDir, dist, { recursive: true });
mkdirSync(resolve(dist, 'vendor'), { recursive: true });
cpSync(threeBuild, resolve(dist, 'vendor'), { recursive: true });
cpSync(three, resolve(dist, 'vendor/three.module.mjs'));

const index = resolve(dist, 'index.html');
const html = readFileSync(index, 'utf8')
  .replace('href="/styles.css"', 'href="./styles.css"')
  .replace('href="/"', 'href="./"')
  .replaceAll('src="/', 'src="./');
writeFileSync(index, html);

for (const file of ['immersive-shelf.mjs', 'vhs-3d.mjs', 'vhs-case.mjs', 'balcony.mjs']) {
  const path = resolve(dist, file);
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll("'/vendor/three.module.js'", "'./vendor/three.module.mjs'"));
}

console.log(`Built GitHub Pages site in ${dist}`);
