import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const origin = 'https://willslocadora.sitedoillan.com.br';

for (const worker of ['locadora-api', 'locadora-data']) {
  test(`${worker} permits the dedicated production origin`, () => {
    const config = readFileSync(new URL(`../workers/${worker}/wrangler.toml`, import.meta.url), 'utf8');
    assert.match(config, new RegExp(origin.replaceAll('.', '\\.')));
  });
}
