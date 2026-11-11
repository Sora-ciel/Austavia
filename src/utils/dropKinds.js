/**
 * What was dropped on the app: music, or pictures and videos.
 *
 * Asked 2026-11-10: "make it so that we can slide music in the app and it
 * adds it in playlist. and open playlist mode if we aren't in playlist
 * mode." Music goes to the library wherever it is dropped; pictures and
 * videos go where they always did (a block, or into the writing).
 *
 * A file is music when it reads as one (utils/audioTags.js) and is not a
 * picture: an .m4a often arrives typed video/mp4, so the type alone would
 * have sent it to the Canvas as a video.
 */
import { isSupportedAudioFile, extensionOf } from './audioTags.js';

const VIDEO_ONLY = ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'ogv', '3gp'];

export function splitDrop(files = []) {
  const music = [];
  const media = [];
  for (const file of files) {
    const type = String(file?.type || '');
    const isPicture = type.startsWith('image/');
    const isVideo = type.startsWith('video/') && VIDEO_ONLY.includes(extensionOf(file?.name));
    if (!isPicture && !isVideo && isSupportedAudioFile(file)) music.push(file);
    else if (isPicture || type.startsWith('video/')) media.push(file);
  }
  return { music, media };
}
