'use strict';

const { CatalogueStore } = require('./src/catalogue.js');
const { createServer } = require('./src/server.js');

const port = Number(process.env.PORT || 4173);

(async () => {
  const catalogue = await new CatalogueStore().init();
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
