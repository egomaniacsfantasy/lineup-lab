export interface ParsedGameLine {
  /** Spread alone, e.g. "ATL -0.5" */
  spread: string;
  /** Venue, e.g. "@ TB" */
  venue: string;
  /** Spread plus venue, e.g. "ATL -0.5 @ TB" */
  lead: string;
  /** Game total, e.g. "47.5" */
  total: string;
}

/**
 * Parses a raw game line of the shape "ATL -0.5 · O/U 47.5 @ TB"
 * (or "... vs PHI") into its display parts. The canonical rendered
 * form is "ATL -0.5 @ TB, O/U 47.5".
 */
export function parseGameLine(gameLine: string): ParsedGameLine | null {
  const match = gameLine.match(
    /^(.+?)\s*·\s*O\/U\s*([\d.]+)\s*((?:@|vs)\s*\S+)$/,
  );

  if (!match) {
    return null;
  }

  const spread = match[1].trim();
  const venue = match[3].trim();

  return {
    spread,
    venue,
    lead: `${spread} ${venue}`,
    total: match[2],
  };
}

export function formatGameLine(gameLine: string): string {
  const parsed = parseGameLine(gameLine);
  return parsed ? `${parsed.lead}, O/U ${parsed.total}` : gameLine;
}
