'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseValue(rawValue) {
  const value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value.replace(/\s+#.*$/, '').trim();
}

function loadLocalEnv({ file = path.join(__dirname, '..', '.env'), environment = process.env } = {}) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const loaded = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || Object.hasOwn(environment, match[1])) continue;
    environment[match[1]] = parseValue(match[2]);
    loaded.push(match[1]);
  }
  return loaded;
}

module.exports = { loadLocalEnv };
