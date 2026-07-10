export function readConfig(env = process.env) {
  const workerEnabled = env.ESPN_LOGIN_WORKER_ENABLED === 'true';
  const port = Number(env.PORT || 8787);
  const loginTimeoutMs = Number(env.LOGIN_TIMEOUT_MS || 30_000);
  const otpTtlMs = Number(env.OTP_TTL_MS || 5 * 60_000);
  const maxConcurrent = Number(env.MAX_CONCURRENT_LOGINS || 2);
  const maxQueue = Number(env.MAX_LOGIN_QUEUE || 10);
  const proxyServer = env.PLAYWRIGHT_PROXY_SERVER || '';
  const userAgent =
    env.PLAYWRIGHT_USER_AGENT ||
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  return {
    workerEnabled,
    port,
    loginTimeoutMs,
    otpTtlMs,
    maxConcurrent,
    maxQueue,
    proxyServer,
    userAgent,
  };
}
