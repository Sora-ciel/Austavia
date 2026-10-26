/**
 * Which Austavia this is: the real one, or one of the ones for trying things.
 *
 * ## What was asked for
 *
 * 2026-10-26, after the first staging builds: "can we follow a certain
 * convention to see the difference between the staging version and the
 * production one? We should probably have the same convention for
 * pre-releases of the site even if it doesn't have a build."
 *
 * ## The channels
 *
 * - **production** -- the real app, on the real project. No label at all.
 * - **staging** -- pointed at `arial-staging`, a separate Firebase project:
 *   nothing done there reaches a real note. Wins over everything else below,
 *   because it is the one fact that decides whose data is on screen.
 * - **preview** -- a test release of the site, on a Firebase preview channel
 *   (RELEASE.md, 4b). It looks like a test and is not one: it is the real
 *   project, with real accounts and real notes, which is what its label says.
 * - **local** -- the dev server on this machine, against the real project.
 *
 * Worked out from which project the app talks to and where it is served, so
 * the very same files deployed to a preview channel label themselves, with no
 * build of their own. Local is the one exception, read from the dev server
 * itself (`dev`): the packaged apps are served from localhost too -- Tauri and
 * Capacitor both -- so the address cannot tell a dev server from a phone.
 */

export const STAGING_PROJECT = 'arial-staging';

const CHANNELS = {
  production: { name: 'Austavia', badge: '', suffix: '' },
  staging: { name: 'Austavia Staging', badge: 'Staging', suffix: 'staging' },
  preview: { name: 'Austavia Preview', badge: 'Preview · real data', suffix: 'preview' },
  local: { name: 'Austavia Local', badge: 'Local', suffix: 'local' }
};

/** A Firebase Hosting preview channel: `<site>--<channel>-<hash>.web.app`. */
const PREVIEW_HOST = /--[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/i;

export function releaseChannel({ projectId = '', hostname = '', dev = false } = {}) {
  if (projectId === STAGING_PROJECT) return 'staging';
  if (PREVIEW_HOST.test(hostname)) return 'preview';
  if (dev) return 'local';
  return 'production';
}

/** What the window, the tab and the launcher call it. */
export function channelName(channel) {
  return (CHANNELS[channel] || CHANNELS.production).name;
}

/** The badge in the corner, or '' for the real app. */
export function channelBadge(channel) {
  return (CHANNELS[channel] || CHANNELS.production).badge;
}

/** The version as shown: `0.8.662`, or `0.8.662 · staging`. */
export function versionLabel(version, channel) {
  const suffix = (CHANNELS[channel] || CHANNELS.production).suffix;
  return suffix ? `${version} · ${suffix}` : String(version);
}
