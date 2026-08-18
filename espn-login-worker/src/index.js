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

/* Boot-time visibility. The worker ran for weeks answering healthy while its
   only dependency was absent, because nothing checked until a user tried to
   sign in and got a shrug. If the browser is missing, say so once, loudly, in
   the deploy logs where it is actually read. */
void (async () => {
  try {
    const [{ chromium }, fs] = await Promise.all([
      import('playwright'),
      import('node:fs'),
    ]);
    const bin = chromium.executablePath();
    if (!bin || !fs.existsSync(bin)) {
      console.error(
        '[espn-login] chromium is not installed, so every sign-in will fail. ' +
          'Run `npm run install:browsers` in this service, or redeploy with the ' +
          'build cache cleared so postinstall runs.',
      );
    } else {
      console.log('[espn-login] chromium present at', bin);
    }
  } catch (error) {
    console.error('[espn-login] could not resolve chromium:', error?.message ?? error);
  }
})();
