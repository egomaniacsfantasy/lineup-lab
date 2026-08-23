import { apiUrl } from './apiBase.ts';
import { collectDiagnostics, type Diagnostics } from '../utils/diagnostics.ts';

export interface BugReportContextFields {
  /** Which league was open, so the report can be reproduced against it. */
  provider?: string | null;
  leagueId?: string | null;
  leagueName?: string | null;
  teamName?: string | null;
  /** The signed-in account, so we can reply. Never a password. */
  email?: string | null;
}

export interface BugReportInput extends BugReportContextFields {
  description: string;
  /** A data: URL from screenCapture, or null when they chose not to attach one. */
  screenshot?: string | null;
}

export interface BugReportPayload extends BugReportContextFields {
  description: string;
  screenshot?: string | null;
  diagnostics: Diagnostics;
}

export interface BugReportResult {
  ok: boolean;
  /** Short human-quotable code, e.g. "OG-4F2A". Present when ok. */
  reference?: string;
  message?: string;
}

export function buildBugReport(input: BugReportInput): BugReportPayload {
  const { description, screenshot, ...context } = input;
  return {
    ...context,
    description: description.trim(),
    screenshot: screenshot ?? null,
    diagnostics: collectDiagnostics(),
  };
}

/**
 * Submitting must not be able to fail in a way that loses what someone typed.
 * Any error is returned as a value with a message worth reading, never thrown
 * at the component.
 */
export async function submitBugReport(input: BugReportInput): Promise<BugReportResult> {
  try {
    const response = await fetch(apiUrl('/api/support/bug-report'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBugReport(input)),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return {
        ok: false,
        message:
          response.status === 413
            ? 'That screenshot was too large to send. Try again without it.'
            : `We could not file that (${response.status}). ${detail.slice(0, 120)}`.trim(),
      };
    }

    const body = (await response.json().catch(() => ({}))) as { reference?: string };
    return { ok: true, reference: body.reference };
  } catch {
    return {
      ok: false,
      message: 'We could not reach the server. Check your connection and try again.',
    };
  }
}
