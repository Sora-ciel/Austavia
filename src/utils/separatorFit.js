/**
 * Fitting the dividers in writing to the rest of their line, all at once.
 *
 * Measured on the phone 2026-11-25, with Sora typing in a real note: 47 of
 * 69 busy seconds were the dividers being fitted. After each change the
 * editor shrank a divider, measured it, and widened it -- one divider at a
 * time, so every measurement made the phone lay out the whole note again,
 * once per divider, every 50ms of typing. Keys waited a median 92ms and up
 * to a quarter second for it.
 *
 * So the writes and the reads are kept apart: every divider shrunk (or set
 * short) first, then every one measured, which costs one layout whatever the
 * number, then every width written. The rule for which fill their line is
 * markdownShortcuts.js's separatorFillsLine; `ops` are the DOM's, passed in
 * so the order can be tested.
 */
import { separatorFillsLine } from './markdownShortcuts.js';

export const SHORT_SEPARATOR = '3em';

export function fitSeparatorsTogether(doms, ops) {
  const filling = [];
  // 1. Writes only: nothing is measured while the line is still changing.
  for (const dom of doms) {
    if (!ops.inLine(dom)) continue;
    ops.setWidth(dom, '0px');
    if (separatorFillsLine({ hasContentAfter: ops.hasContentAfter(dom) })) filling.push(dom);
    else ops.setWidth(dom, SHORT_SEPARATOR);
  }
  // 2. Reads only: one layout for all of them.
  const rooms = filling.map(dom => ops.room(dom));
  // 3. Writes only. A pixel spare, so rounding cannot push one onto the next
  // line, where it would measure a whole line's room and stay there.
  filling.forEach((dom, i) => ops.setWidth(dom, `${Math.max(0, Math.floor(rooms[i]) - 1)}px`));
}
