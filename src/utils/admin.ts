/**
 * Agreement editing is limited to the three collaborators who own the model.
 *
 * This is a UI gate only. It decides what the app shows, not what the database
 * accepts: anyone who knows the table name could still write to Supabase
 * directly. Real enforcement has to be a row-level-security policy on
 * `olympus_agreement` restricting writes to these user ids, which is server
 * side and Franco's call.
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
