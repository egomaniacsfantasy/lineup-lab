import { connected, fallback, otpRequired, REASON } from './status.js';
import { validateEspnSession } from './espnApi.js';

const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[autocomplete="username"]',
  '#InputIdentityFlowValue',
  '[data-testid="InputIdentityFlowValue"] input',
];

const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
  '#InputPassword',
  '[data-testid="InputPassword"] input',
];

const OTP_SELECTORS = [
  'input[autocomplete="one-time-code"]',
  'input[inputmode="numeric"]',
  'input[name*="otp" i]',
  'input[name*="code" i]',
  '#otp',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button:has-text("Continue")',
  'button:has-text("Log In")',
  'button:has-text("Log in")',
  'button:has-text("Sign In")',
  'button:has-text("Sign in")',
  'input[type="submit"]',
];

function randomDelay(min = 80, max = 220) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function firstVisible(page, selectors, timeout = 1_500) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    } catch {
      // Try the next selector in the chain.
    }
  }
  return null;
}

async function clickSubmit(page) {
  const button = await firstVisible(page, SUBMIT_SELECTORS, 900);
  if (button) {
    await button.click({ delay: randomDelay(20, 90) });
    return;
  }
  await page.keyboard.press('Enter');
}

async function fillLikeHuman(locator, value) {
  await locator.click({ delay: randomDelay(20, 80) });
  await locator.fill('');
  await locator.pressSequentially(value, { delay: randomDelay(30, 85) });
}

async function pageContains(page, pattern) {
  try {
    return await page.getByText(pattern).first().isVisible({ timeout: 500 });
  } catch {
    return false;
  }
}

async function classifyFailure(page) {
  if (await pageContains(page, /captcha|robot|verify you'?re human|security challenge/i)) {
    return fallback(
      REASON.CAPTCHA,
      'ESPN asked for a human check. Use the ESPN-site connector instead.',
    );
  }
  if (await pageContains(page, /passkey|passwordless|no password|use your passkey/i)) {
    return fallback(
      REASON.PASSKEY,
      'This Disney account is set up without a normal password. Use the ESPN-site connector instead.',
    );
  }
  if (await pageContains(page, /incorrect|invalid|couldn'?t find|try again/i)) {
    return fallback(
      REASON.BAD_CREDENTIALS,
      'ESPN did not accept that email and password.',
    );
  }
  if (await pageContains(page, /blocked|unusual traffic|temporarily unable/i)) {
    return fallback(
      REASON.BOT_CHALLENGE,
      'ESPN blocked this login attempt. Use the ESPN-site connector instead.',
    );
  }
  return null;
}

async function captureCookies(context) {
  const cookies = await context.cookies(['https://www.espn.com', 'https://fantasy.espn.com']);
  const espnS2 = cookies.find((cookie) => cookie.name.toLowerCase() === 'espn_s2')?.value;
  const swid = cookies.find((cookie) => cookie.name.toLowerCase() === 'swid')?.value;
  if (!espnS2 || !swid) return null;
  return { espnS2, swid };
}

/* We are here to type into a login form, not to render ESPN. The fantasy
   league page is a full single-page app — scripts, fonts, images, video
   embeds, analytics — and on a half-CPU instance simply loading it consumed
   the entire login budget before a field could be found. Everything that
   cannot carry a login form is refused at the network layer. */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);
const BLOCKED_HOST_PATTERN =
  /(googletagmanager|google-analytics|doubleclick|scorecardresearch|chartbeat|nielsen|adobedtm|omtrdc|krxd|moatads|amazon-adsystem|taboola|outbrain|branch\.io|braze|optimizely)/i;

async function createContext({ browser, config }) {
  const context = await browser.newContext({
    userAgent: config.userAgent,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  context.setDefaultTimeout(config.loginTimeoutMs);

  await context.route('**/*', (route) => {
    const request = route.request();
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) return route.abort();
    if (BLOCKED_HOST_PATTERN.test(request.url())) return route.abort();
    return route.continue();
  });

  return context;
}

export async function createLoginMachine({
  config,
  challengeStore,
  browserFactory = async () => {
    const { chromium } = await import('playwright');
    return chromium.launch({
      headless: true,
      proxy: config.proxyServer ? { server: config.proxyServer } : undefined,
      /* The worker runs in a small container and the logs show it running out
         of memory. --disable-dev-shm-usage is the important one: /dev/shm is
         64MB in a container, Chromium puts its shared memory there by default,
         and it dies when that fills — which looks exactly like the hangs and
         half-finished logins we have been seeing. The rest drop subsystems a
         login form has no use for. */
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-features=site-per-process,TranslateUI,BackForwardCache',
        '--js-flags=--max-old-space-size=256',
      ],
    });
  },
  validateSession = validateEspnSession,
} = {}) {
  let browser = null;

  async function getBrowser() {
    browser ??= await browserFactory();
    return browser;
  }

  async function finishAuthenticatedContext({ context, leagueId, season }) {
    const cookies = await captureCookies(context);
    if (!cookies) {
      return fallback(
        REASON.ESPN_REJECTED,
        'ESPN accepted the sign-in but did not hand back a league session. This is usually a sign-in prompt we could not clear, such as a code or a security check.',
      );
    }

    try {
      const league = await validateSession({ leagueId, season, ...cookies });
      return connected({ ...cookies, league });
    } catch {
      return fallback(
        REASON.VALIDATION_FAILED,
        'ESPN accepted the login, but Fantasy rejected the session. Use the ESPN-site connector instead.',
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async function startLogin({ email, password, leagueId, season }) {
    const browserInstance = await getBrowser();
    const context = await createContext({ browser: browserInstance, config });
    const page = await context.newPage();
    const targetUrl = `https://fantasy.espn.com/football/league?leagueId=${encodeURIComponent(
      leagueId,
    )}&seasonId=${encodeURIComponent(season)}`;

    try {
      /* 'commit' returns as soon as the navigation is committed rather than
         waiting for a whole SPA to reach DOMContentLoaded. The wait that
         matters is the one for the email field, which is right below, so
         waiting twice for the same page only spent budget. */
      await page.goto(targetUrl, { waitUntil: 'commit' });
      const emailField = await firstVisible(page, EMAIL_SELECTORS, 12_000);
      if (!emailField) {
        const earlyFailure = await classifyFailure(page);
        if (earlyFailure) {
          await context.close().catch(() => undefined);
          return earlyFailure;
        }
      } else {
        await fillLikeHuman(emailField, email);
        await clickSubmit(page);
      }

      const passwordField = await firstVisible(page, PASSWORD_SELECTORS, 6_000);
      if (!passwordField) {
        const failure = await classifyFailure(page);
        if (failure) {
          await context.close().catch(() => undefined);
          return failure;
        }
      } else {
        await fillLikeHuman(passwordField, password);
        await clickSubmit(page);
      }

      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await page.waitForTimeout(randomDelay(800, 1_500));

      const failure = await classifyFailure(page);
      if (failure) {
        await context.close().catch(() => undefined);
        return failure;
      }

      const otpField = await firstVisible(page, OTP_SELECTORS, 1_000);
      if (otpField) {
        const challengeId = challengeStore.create({ context, page, leagueId, season });
        return otpRequired(challengeId);
      }

      return finishAuthenticatedContext({ context, leagueId, season });
    } catch (error) {
      await context.close().catch(() => undefined);
      if (error.name === 'TimeoutError') {
        return fallback(
          REASON.WORKER_TIMEOUT,
          'ESPN login took too long. Use the ESPN-site connector instead.',
        );
      }
      return fallback(
        REASON.NETWORK,
        'ESPN login could not finish. Use the ESPN-site connector instead.',
      );
    }
  }

  async function continueOtp({ challengeId, otp }) {
    const session = challengeStore.take(challengeId);
    if (!session) {
      return fallback(
        REASON.WORKER_TIMEOUT,
        'That ESPN code expired. Start the login again.',
      );
    }

    const { context, page, leagueId, season } = session;
    try {
      const otpField = await firstVisible(page, OTP_SELECTORS, 2_000);
      if (!otpField) {
        await context.close().catch(() => undefined);
        return fallback(
          REASON.ESPN_REJECTED,
          'ESPN no longer shows the code screen. Start the login again.',
        );
      }
      await fillLikeHuman(otpField, otp);
      await clickSubmit(page);
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await page.waitForTimeout(randomDelay(1_000, 1_600));
      const failure = await classifyFailure(page);
      if (failure) {
        await context.close().catch(() => undefined);
        return failure;
      }
      return finishAuthenticatedContext({ context, leagueId, season });
    } catch {
      await context.close().catch(() => undefined);
      return fallback(
        REASON.NETWORK,
        'ESPN code check could not finish. Start the login again.',
      );
    }
  }

  async function close() {
    await challengeStore.closeAll();
    await browser?.close?.().catch(() => undefined);
    browser = null;
  }

  /* Launching chromium is the single most expensive step, and it was happening
     lazily inside the first user's login — so one person always paid for it
     out of their own budget. The server calls this at boot instead. */
  async function warmup() {
    await getBrowser();
  }

  return { startLogin, continueOtp, close, warmup };
}
