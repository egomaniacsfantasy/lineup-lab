/**
 * The line under a team name: who runs it, and how they've done.
 *
 * A manager can have no printable name. ESPN mints an account handle
 * ("espn40393983") for anyone who never set a display name, and the provider
 * drops those rather than pass a serial number off as a person — so this has
 * to render a record on its own without leaving a dangling separator in front
 * of it.
 */
export function managerLine(managerName: string | null | undefined, record: string) {
  const name = managerName?.trim();
  return name ? `${name} · ${record}` : record;
}
