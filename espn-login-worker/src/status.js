export const STATUS = Object.freeze({
  CONNECTED: 'connected',
  OTP_REQUIRED: 'otp_required',
  FALLBACK: 'fallback',
});

export const REASON = Object.freeze({
  DISABLED: 'disabled',
  BAD_CREDENTIALS: 'bad_credentials',
  CAPTCHA: 'captcha',
  PASSKEY: 'passkey_required',
  BOT_CHALLENGE: 'bot_challenge',
  WORKER_TIMEOUT: 'worker_timeout',
  ESPN_REJECTED: 'espn_rejected',
  VALIDATION_FAILED: 'validation_failed',
  NETWORK: 'network',
  MISSING_FIELDS: 'missing_fields',
  QUEUE_FULL: 'queue_full',
});

export function fallback(reason, message, extra = {}) {
  return {
    status: STATUS.FALLBACK,
    reason,
    message,
    ...extra,
  };
}

export function otpRequired(challengeId, message = 'ESPN emailed you a code. Enter it to continue.') {
  return {
    status: STATUS.OTP_REQUIRED,
    challengeId,
    message,
  };
}

export function connected({ espnS2, swid, league }) {
  return {
    status: STATUS.CONNECTED,
    espnS2,
    swid,
    league,
  };
}
