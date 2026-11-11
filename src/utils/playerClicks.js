/**
 * What a click on the music player does, when it does not land on a control.
 *
 * ## What was asked for
 *
 * First, on 2026-09-26: "when we click on the music player anywhere other than
 * the places where there's already buttons it will put you in the playlist
 * mode." That was built on the wrong player -- the mini player strip, which
 * lost its old job of opening the player -- and corrected on 2026-09-27:
 *
 * "The mini player shouldn't have changed: pressing anywhere but the buttons
 * on it should open the player. And it's when you click anywhere but the
 * buttons of the player that you should be put in Playlist mode."
 *
 * So there are two surfaces and one rule each, and both leave their controls
 * alone. A control is anything somebody presses or drags on purpose: a button,
 * a slider, a field, a link, a label that works one.
 */

/**
 * Everything that counts as a control inside either player. The timeline's
 * whole row is one (`data-player-control`): reported 2026-11-10, "the area
 * to change the timeline is very thin ... it clicks on the back and puts
 * you on playlist and closes the music player."
 */
export const PLAYER_CONTROLS = 'button, input, select, textarea, label, a, [role="button"], [role="slider"], [data-player-control]';

/**
 * Whether a click landed on a control, rather than on the surface around the
 * controls. `container` is the player itself: the mini player strip is a
 * role="button" of its own, and a click on its empty space must not count as
 * landing on a control just because the strip is one.
 */
export function landsOnControl(target, container = null) {
  const hit = target && typeof target.closest === 'function' ? target.closest(PLAYER_CONTROLS) : null;
  return Boolean(hit && hit !== container);
}

/**
 * What a click on a player's surface does: 'open-player' on the mini player,
 * 'open-playlist' on the player, and nothing on a control of either.
 */
export function playerClickAction(surface, target, container = null) {
  if (landsOnControl(target, container)) return null;
  if (surface === 'mini') return 'open-player';
  if (surface === 'player') return 'open-playlist';
  return null;
}
