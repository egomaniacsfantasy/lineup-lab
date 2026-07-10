import { readConfig } from './config.js';
import { createServer } from './server.js';

const config = readConfig();
const server = await createServer({ config });

server.listen(config.port, () => {
  console.log('[espn-login] listening', {
    port: config.port,
    enabled: config.workerEnabled,
    maxConcurrent: config.maxConcurrent,
    maxQueue: config.maxQueue,
  });
});

async function shutdown() {
  await server.closeWorker?.();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
