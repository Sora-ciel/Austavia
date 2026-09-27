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
