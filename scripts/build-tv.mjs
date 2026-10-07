import { build, transform } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'tv/samsung');
const output = resolve(root, 'dist-tv');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of ['config.xml', 'index.html', 'tv.css']) cpSync(resolve(source, file), resolve(output, file));
const sharedGlobals = new Map([
  ['app-core.js', 'LocadoraCore'],
  ['i18n.js', 'LocadoraI18n'],
  ['genre-themes.js', 'LocadoraGenreThemes'],
]);
for (const [file, globalName] of sharedGlobals) {
  // These scripts are loaded separately for their globals. They still need
  // the same Chromium 69 lowering as the bundled app; copying them raw leaves
  // optional chaining/nullish syntax that prevents boot on Tizen 5.5.
  const sourceText = readFileSync(resolve(root, `public/${file}`), 'utf8');
  const moduleBranch = `if (typeof module === 'object' && module.exports) module.exports = api;\n  else root.${globalName} = api;`;
  const browserSource = sourceText.replace(moduleBranch, `root.${globalName} = api;`);
  if (browserSource === sourceText) throw new Error(`Could not force browser global for ${file}.`);
  const transformed = await transform(browserSource, {
    target: ['chrome69'], minify: true, legalComments: 'none', sourcemap: false,
  });
  writeFileSync(resolve(output, file), transformed.code);
}
cpSync(resolve(root, 'public/favicon.png'), resolve(output, 'icon.png'));
cpSync(resolve(root, 'public/images'), resolve(output, 'images'), { recursive: true });
mkdirSync(resolve(output, 'audio/ambience'), { recursive: true });
mkdirSync(resolve(output, 'audio/music/1990s'), { recursive: true });
for (const file of ['store-room-tone.mp3', 'fluorescent-hum-loop.mp3', 'fluorescent-light-flicker.mp3', 'vhs-eject.mp3', 'shop-door-bell.mp3']) {
  cpSync(resolve(root, `public/audio/ambience/${file}`), resolve(output, `audio/ambience/${file}`));
}
cpSync(resolve(root, 'public/audio/music/1990s/night-drive.mp3'), resolve(output, 'audio/music/1990s/night-drive.mp3'));

await build({
  entryPoints: [resolve(source, 'src/app.mjs')],
  outfile: resolve(output, 'app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome69'],
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  plugins: [{
    name: 'locadora-three-tv',
    setup(builder) {
      builder.onResolve({ filter: /^\/vendor\/three\.module\.js$/ }, () => ({ path: resolve(root, 'node_modules/three-tv/build/three.module.js') }));
    },
  }],
});

const bundlePath = resolve(output, 'app.js');
const bundle = readFileSync(bundlePath, 'utf8')
  .replaceAll('"/images/', '"./images/')
  .replaceAll("'/images/", "'./images/");
writeFileSync(bundlePath, bundle);

function directorySize(path) {
  const entry = statSync(path);
  if (entry.isFile()) return entry.size;
  return readdirSync(path, { withFileTypes: true }).reduce((total, child) => total + directorySize(resolve(path, child.name)), 0);
}

const bytes = directorySize(output);
const maximum = 20 * 1024 * 1024;
if (bytes > maximum) throw new Error(`TV build is ${(bytes / 1024 / 1024).toFixed(1)} MiB; expected at most 20 MiB.`);
console.log(`Built Samsung TV app in dist-tv (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
