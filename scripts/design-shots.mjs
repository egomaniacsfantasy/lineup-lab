import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const cwd = process.cwd();
const outputLabelArg = process.argv.find((arg) => arg.startsWith('--label='));
const label = outputLabelArg ? outputLabelArg.slice('--label='.length) : 'current';
const outputDir = path.join(cwd, 'artifacts', 'design-shots', label);

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureProcess({ port, command, args, name }) {
  if (await isPortOpen(port)) return { child: null, started: false };

  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'pipe',
  });

  child.stdout.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));

  return { child, started: true };
}

await mkdir(outputDir, { recursive: true });

const server = await ensureProcess({
  port: 8799,
  command: 'npm',
  args: ['run', 'server'],
  name: 'server',
});

const vite = await ensureProcess({
  port: 4173,
  command: 'npm',
  args: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  name: 'vite',
});

try {
  await waitForUrl('http://127.0.0.1:8799/api/health');
  await waitForUrl('http://127.0.0.1:4173/design/matchup');

  const browser = await chromium.launch({ headless: true });
  const shots = [];
  const capture = async (name, callback) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1800 },
      colorScheme: 'dark',
    });
    try {
      await callback(page);
      const file = path.join(outputDir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push({ name, file });
    } finally {
      await page.close();
    }
  };

  await capture('matchup-cold', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/matchup-cold', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
  });

  await capture('matchup-empty', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/matchup', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
  });

  await capture('matchup-live-expanded', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/matchup-live', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  });

  await capture('market-default', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/market?view=deals', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
  });

  await capture('market-manager-apollo', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/market?view=deals', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Apollo Archers', exact: true }).click();
    await page.waitForTimeout(1500);
  });

  await capture('market-verdict-1for1', async (page) => {
    await page.goto(
      'http://127.0.0.1:4173/design/market?view=deals&leagueId=og-design-market-live&managerRosterId=2&give=t-mclaurin&get=d-london',
      { waitUntil: 'networkidle' },
    );
    await page.getByRole('button', { name: /Price this trade/i }).click();
    await page.getByText('GOOD VALUE.').waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
  });

  await capture('market-verdict-3for1', async (page) => {
    await page.goto(
      'http://127.0.0.1:4173/design/market?view=deals&leagueId=og-design-market-live&managerRosterId=3&give=b-robinson,t-kelce,b-aubrey&get=j-jefferson',
      { waitUntil: 'networkidle' },
    );
    await page.getByRole('button', { name: /Price this trade/i }).click();
    await page.getByText('OVERPAY.').waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
  });

  await capture('league-board', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/league', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  });

  await capture('league-board-expanded', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/league', { waitUntil: 'networkidle' });
    await page.locator('.matchup-slate__row-button').first().click();
    await page.waitForTimeout(300);
  });

  await capture('league-futures', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/league?view=futures', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  });

  await capture('league-futures-compare', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/league?view=futures', { waitUntil: 'networkidle' });
    await page.locator('.league-futures__row').nth(3).click();
    await page.waitForTimeout(400);
  });

  await capture('league-schedule', async (page) => {
    await page.goto('http://127.0.0.1:4173/design/league?view=schedule', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  });

  await browser.close();
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(shots, null, 2)}\n`, 'utf8');
  console.log(`Saved ${shots.length} design shots to ${outputDir}`);
} finally {
  if (vite.child) vite.child.kill('SIGTERM');
  if (server.child) server.child.kill('SIGTERM');
}
