// What a click on the music player does.
//
// Asked for on 2026-09-27, correcting the first go at it: "The mini player
// shouldn't have changed: pressing anywhere but the buttons on it should open
// the player. And it's when you click anywhere but the buttons of the player
// that you should be put in Playlist mode." Both halves were wanted -- the
// first version put the Playlist jump on the mini player, which was the wrong
// one.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { playerClickAction, landsOnControl } from '../src/utils/playerClicks.js';

// Just enough of an element: `closest` answers with whichever ancestor
// matches, the way the DOM does.
function element(tag, { role = null, parent = null, control = false } = {}) {
  const node = {
    tag,
    role,
    parent,
    control,
    closest(selector) {
      for (let at = node; at; at = at.parent) {
        if (at.control && selector.includes('[data-player-control]')) return at;
        const controlTag = ['button', 'input', 'select', 'textarea', 'label', 'a'].includes(at.tag);
        const controlRole = at.role === 'button' || at.role === 'slider';
        if (selector.includes(at.tag) && controlTag) return at;
        if (controlRole) return at;
      }
      return null;
    }
  };
  return node;
}

describe('the mini player', () => {
  const strip = element('div', { role: 'button' });
  const title = element('span', { parent: strip });
  const next = element('button', { parent: strip });
  const nextIcon = element('svg', { parent: next });

  it('opens the player when pressed anywhere but its buttons', () => {
    assert.equal(playerClickAction('mini', strip, strip), 'open-player');
    assert.equal(playerClickAction('mini', title, strip), 'open-player');
  });

  it('leaves its buttons to do their own thing', () => {
    assert.equal(playerClickAction('mini', next, strip), null);
    assert.equal(playerClickAction('mini', nextIcon, strip), null);
  });

  it('never sends you to Playlist mode', () => {
    assert.notEqual(playerClickAction('mini', title, strip), 'open-playlist');
  });
});

describe('the player', () => {
  const panel = element('div');
  const cover = element('img', { parent: panel });
  const play = element('button', { parent: panel });
  const volumeLabel = element('label', { parent: panel });
  const volume = element('input', { parent: volumeLabel });
  const seek = element('input', { parent: panel });

  it('puts you in Playlist mode when clicked anywhere but its controls', () => {
    assert.equal(playerClickAction('player', panel, panel), 'open-playlist');
    assert.equal(playerClickAction('player', cover, panel), 'open-playlist');
  });

  it('leaves its buttons and sliders alone', () => {
    for (const control of [play, volumeLabel, volume, seek]) {
      assert.equal(playerClickAction('player', control, panel), null);
    }
  });
});

it('treats a missing or odd target as not a control', () => {
  assert.equal(landsOnControl(null), false);
  assert.equal(landsOnControl({}), false);
});

// Reported 2026-11-10: "the area to change the timeline is very thin ... very
// easily it clicks on the back and puts you on playlist and closes the music
// player." The timeline's whole row is the timeline's.
describe('the timeline', () => {
  it('a press beside the thin line still belongs to the timeline, not to the way to Playlist mode', () => {
    const player = element('div');
    const row = element('div', { parent: player, control: true });
    const time = element('span', { parent: row });
    assert.equal(playerClickAction('player', row, player), null);
    assert.equal(playerClickAction('player', time, player), null);
    assert.equal(playerClickAction('player', element('div', { parent: player }), player), 'open-playlist');
  });
});
