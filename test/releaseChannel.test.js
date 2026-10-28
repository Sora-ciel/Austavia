import { test } from 'node:test';
import assert from 'node:assert/strict';

import { releaseChannel, channelName, channelBadge, versionLabel } from '../src/utils/releaseChannel.js';

// Asked 2026-10-26: "can we follow a certain convention to see the difference
// between the staging version and the production one? We should probably have
// the same convention for pre-releases of the site even if it doesn't have a
// build."

test('the real app, on the real site or packaged, carries no label at all', () => {
  for (const hostname of ['austavia.app', 'arial-473c1.web.app', 'localhost', 'tauri.localhost']) {
    const channel = releaseChannel({ projectId: 'arial-473c1', hostname });
    assert.equal(channel, 'production', hostname);
    assert.equal(channelBadge(channel), '');
    assert.equal(versionLabel('0.8.662', channel), '0.8.662');
    assert.equal(channelName(channel), 'Austavia');
  }
});

test('anything talking to the staging project says Staging, wherever it runs', () => {
  for (const hostname of ['localhost', 'arial-staging.web.app', 'arial-staging--testing-ab12.web.app']) {
    const channel = releaseChannel({ projectId: 'arial-staging', hostname, dev: hostname === 'localhost' });
    assert.equal(channel, 'staging', hostname);
  }
  assert.equal(channelName('staging'), 'Arial Staging');
  assert.equal(versionLabel('0.8.662', 'staging'), '0.8.662 · staging');
});

test('a test release of the site labels itself, with no build of its own -- and says the data is real', () => {
  const channel = releaseChannel({ projectId: 'arial-473c1', hostname: 'arial-473c1--testing-x7k2p9.web.app' });
  assert.equal(channel, 'preview');
  assert.match(channelBadge(channel), /real data/);
});

test('the dev server is Local; a packaged app on localhost is not', () => {
  assert.equal(releaseChannel({ projectId: 'arial-473c1', hostname: 'localhost', dev: true }), 'local');
  assert.equal(releaseChannel({ projectId: 'arial-473c1', hostname: 'localhost', dev: false }), 'production');
});
