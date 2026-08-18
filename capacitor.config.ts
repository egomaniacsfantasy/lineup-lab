import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Odds Gods iOS shell.
 *
 * The app ships the built web bundle from `dist` inside a native container.
 * That keeps every surface we have already built and verified, and puts the
 * native capabilities Apple's 4.2 guideline wants around it: push for line
 * movement, a home screen widget, and the native share sheet.
 */
const config: CapacitorConfig = {
  appId: 'net.oddsgods.app',
  appName: 'Odds Gods',
  webDir: 'dist',
  ios: {
    // The book is a dark surface. Without this the status bar and the
    // rubber-band overscroll flash white on every scroll.
    backgroundColor: '#0d0f11',
    /* 'always' made WKWebView add its own content inset on top of
       viewport-fit=cover and the safe-area padding the layout already applies.
       Three symptoms, one cause: a black band above the app, a page that was
       permanently a little taller than the screen and so always scrolled
       vertically, and a fixed bottom bar positioned against a frame that no
       longer matched the visible area, so it would not stay put. 'never' hands
       the insets back to CSS, which is where they are handled. */
    contentInset: 'never',
  },
  server: {
    // ESPN and our API are https; block anything that is not.
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    /**
     * The bundle is served from https://localhost, so every call to the real
     * API is cross-origin and WKWebView enforces CORS on it. The server sends
     * no CORS headers, so a plain fetch is blocked before it leaves the phone.
     *
     * Enabling CapacitorHttp routes fetch/XMLHttpRequest through the native
     * HTTP stack, which is not a browser and not subject to CORS. That keeps
     * the fix entirely inside the shell: no server change, no new origin to
     * maintain, nothing for the engine or its routes to care about.
     */
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
