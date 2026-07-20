const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadLocalEnv } = require('../src/local-env.js');

test('loadLocalEnv reads an ignored local file without replacing explicit environment values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'locadora-env-'));
  const file = path.join(directory, '.env');
  fs.writeFileSync(file, '# local only\nTMDB_API_KEY="local key"\nFEATURE_FLAG=true\n');
  const target = { TMDB_API_KEY: 'shell key' };

  const loaded = loadLocalEnv({ file, environment: target });

  assert.deepEqual(loaded, ['FEATURE_FLAG']);
  assert.deepEqual(target, { TMDB_API_KEY: 'shell key', FEATURE_FLAG: 'true' });
  fs.rmSync(directory, { recursive: true, force: true });
});
