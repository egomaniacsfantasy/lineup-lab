const SECRET_KEYS = /password|espnS2|espn_s2|swid|cookie|token|secret|authorization/i;
const PASSWORD_SHAPE = /\b(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]{10,}\b/g;
const ESPN_S2_SHAPE = /\bespn_s2\s*=\s*[^;\s]+/gi;
const SWID_SHAPE = /\bSWID\s*=\s*\{?[^;\s}]+}*/gi;

export function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(ESPN_S2_SHAPE, 'espn_s2=[redacted]')
      .replace(SWID_SHAPE, 'SWID=[redacted]')
      .replace(PASSWORD_SHAPE, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SECRET_KEYS.test(key) ? '[redacted]' : redact(entry),
      ]),
    );
  }
  return value;
}

export function safeLog(logger, level, message, meta = {}) {
  const log = logger?.[level] ?? logger?.log ?? console.log;
  log.call(logger ?? console, message, redact(meta));
}
