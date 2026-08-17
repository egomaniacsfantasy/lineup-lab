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
    contentInset: 'always',
  },
  server: {
    // ESPN and our API are https; block anything that is not.
    androidScheme: 'https',
    iosScheme: 'https',
  },
};

export default config;
