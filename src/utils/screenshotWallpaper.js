/**
 * Putting a mode's wallpaper into a screenshot of it.
 *
 * ## What was asked for
 *
 * "For the screenshot functions, make it also screenshot the backgrounds in
 * Canvas mode and other modes using background images." — 2026-09-27.
 *
 * ## Why only Canvas needs this
 *
 * Single Note and Playlist draw their wallpaper inside the element the
 * screenshot captures, so it was always in the picture -- html2canvas-pro
 * applies the opacity, blur and brightness as the screen does. Canvas cannot:
 * its wallpaper is pinned to the window, outside the board, so that zooming
 * the board does not zoom the wallpaper. The screenshot captures the board,
 * and the board has never contained it.
 *
 * So for Canvas the board is captured with nothing behind it, and the
 * wallpaper is painted underneath afterwards with the same settings the
 * screen uses. It covers the whole picture rather than the part of the board
 * that was on screen: a screenshot is of the whole board, and a wallpaper that
 * stopped at the edge of the window would leave the rest of it bare.
 */
import { backgroundLayerStyle } from './modeBackground.js';

/**
 * How to paint the wallpaper into a picture drawn at `scale` pixels per CSS
 * pixel, or null when there is none.
 *
 * The blur is scaled with the picture: a 6px blur on screen is 12px in a
 * picture drawn at twice the size, or it would look half as soft. The bleed --
 * how far the image is drawn past the edges so a blur does not fade them to
 * the colour underneath -- scales with it for the same reason.
 */
export function wallpaperPaint(settings, { isMobile = false, scale = 1 } = {}) {
  const layer = backgroundLayerStyle(settings, { isMobile });
  if (!layer) return null;

  const factor = Number.isFinite(Number(scale)) && Number(scale) > 0 ? Number(scale) : 1;
  const filter = layer.filter === 'none'
    ? 'none'
    : layer.filter.replace(/blur\(([\d.]+)px\)/, (_, px) => `blur(${Number(px) * factor}px)`);

  return {
    image: layer.image,
    alpha: layer.opacity,
    filter,
    size: layer.size,
    bleed: Math.ceil(layer.bleed * factor)
  };
}

/**
 * Where to draw an image of `imageWidth` x `imageHeight` so it covers, or fits
 * inside, a `width` x `height` picture -- centred, as `background-position:
 * center` does on screen. `bleed` grows the area on every side.
 */
export function wallpaperRect({ imageWidth, imageHeight, width, height, size = 'cover', bleed = 0 }) {
  const areaWidth = width + bleed * 2;
  const areaHeight = height + bleed * 2;
  const iw = Math.max(1, Number(imageWidth) || 1);
  const ih = Math.max(1, Number(imageHeight) || 1);

  const ratio = size === 'contain'
    ? Math.min(areaWidth / iw, areaHeight / ih)
    : Math.max(areaWidth / iw, areaHeight / ih);

  const drawnWidth = iw * ratio;
  const drawnHeight = ih * ratio;
  return {
    x: (width - drawnWidth) / 2,
    y: (height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight
  };
}

/**
 * Every mode's wallpaper goes into a screenshot the same way: painted
 * underneath, never captured.
 *
 * Reported 2026-10-28, on the phone: "the screenshot ... without capturing
 * the background." Canvas already painted its wallpaper in underneath the
 * captured board. The other modes left theirs to the capture itself -- a layer
 * fixed to the screen, which the capture reproduces only partly or not at all
 * depending on the layout: Simple Note came out red in the middle and bare at
 * the bottom, and the phone got none. So in every mode with a wallpaper the
 * layer is left out of the capture (`isWallpaperLayer`), the mode's own
 * background is cleared for it, and the picture is painted underneath, from
 * the settings that mode draws it from (`wallpaperSettingsFor`).
 */

/** The element each mode draws its wallpaper in -- left out of a capture. */
export const WALLPAPER_LAYER_CLASSES = ['canvas-bg-holder', 'mode-wallpaper', 'note-bg-clip', 'pl-bg-holder'];

export function isWallpaperLayer(element) {
  return WALLPAPER_LAYER_CLASSES.some(name => element?.classList?.contains(name));
}

/**
 * Which settings a mode's wallpaper comes from: Canvas keeps only what the
 * folder set; every other mode also shows a theme's own wallpaper (App.svelte,
 * canvasBackgroundSettings and singleNoteSettings). Null for a mode without.
 */
export function wallpaperSettingsFor(mode, { hasWallpaper, canvas, others } = {}) {
  if (!hasWallpaper) return null;
  return mode === 'default' ? canvas || null : others || null;
}
