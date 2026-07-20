'use strict';

const { CatalogueStore } = require('./src/catalogue.js');
const { loadLocalEnv } = require('./src/local-env.js');
const { createServer } = require('./src/server.js');
const { createTmdbClient } = require('./src/tmdb.js');

loadLocalEnv();
const port = Number(process.env.PORT || 4173);

(async () => {
  const catalogue = await new CatalogueStore({ tmdbClient: createTmdbClient({ apiKey: process.env.TMDB_API_KEY }) }).init();
  const server = createServer({ catalogue });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Locadora is open at http://127.0.0.1:${port}`);
  });
  server.on('error', (error) => {
    console.error(`Locadora could not start: ${error.message}`);
    process.exitCode = 1;
  });
})().catch((error) => {
  console.error(`Locadora could not initialise: ${error.message}`);
  process.exitCode = 1;
});
