export type ShareResult = 'shared' | 'copied';

export async function shareText({
  title,
  text,
  url,
}: {
  title: string;
  text: string;
  url?: string;
}): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch {
      // In-app/local browser surfaces often expose navigator.share but reject
      // the call. Fall back to clipboard instead of making the button a no-op.
    }
  }

  const payload = [text, url].filter(Boolean).join('\n');
  await navigator.clipboard.writeText(payload);
  return 'copied';
}
