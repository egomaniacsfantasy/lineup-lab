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
  const payload = [text, url].filter(Boolean).join('\n');
  if (navigator.share) {
    try {
      await Promise.race([
        navigator.share({ title, text, url }),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error('share_timeout')), 4500);
        }),
      ]);
      return 'shared';
    } catch {
      // In-app/local browser surfaces often expose navigator.share but reject
      // the call. Fall back to clipboard instead of making the button a no-op.
    }
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('clipboard_unavailable');
  }
  await navigator.clipboard.writeText(payload);
  return 'copied';
}
