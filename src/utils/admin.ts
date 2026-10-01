/**
 * The site's admins (admin tab, autopilot tools). The name is historical: these
 * accounts once also edited per-player agreement scores, a feature removed 2026-10-01.
 * UI gate only; it decides what the app shows.
 */
export const AGREEMENT_ADMIN_EMAILS = [
  'andrevlahakis@gmail.com',
  'lukejwilliams28@gmail.com',
  'francocasta200@gmail.com',
] as const;

export function isAgreementAdmin(email: string | null | undefined) {
  if (!email) return false;
  return AGREEMENT_ADMIN_EMAILS.includes(
    email.trim().toLowerCase() as (typeof AGREEMENT_ADMIN_EMAILS)[number],
  );
}
