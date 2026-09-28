// The names as they are shown. No "Mode" on the end: the list they appear in is
// the mode picker, the button they sit on says the mode, and the word was on
// every line of a list where every line is one. Asked for in as many words --
// "in the place where you can choose multiple modes let's remove the mode part
// of the names".
export const MODE_DEFINITIONS = {
  default: {
    id: 'default',
    label: 'Canvas',
    // Clock asked for on 2026-09-27, for every mode except Task, Playlist and
    // Birthday. It lands here and in Simple Note because those are the two that
    // hold blocks; Single Note is one piece of writing and Habit Tracker is a
    // list of habits, and neither has anywhere to put a block.
    addBlockTypes: ['text', 'image', 'music', 'embed', 'clock'],
    showRightControls: true
  },
  simple: {
    id: 'simple',
    label: 'Simple Note',
    addBlockTypes: ['text', 'image', 'music', 'embed', 'clock'],
    showRightControls: true,
    settings: { simpleColumns: true, wallpaper: true }
  },
  single: {
    id: 'single',
    label: 'Single Note',
    addBlockTypes: ['text'],
    showRightControls: true,
    settings: { wallpaper: true }
  },
  habit: {
    id: 'habit',
    label: 'Habit Tracker',
    addBlockTypes: [],
    // The right panel carries themes, saved files and the cloud — none of
    // which is about blocks, and all of which is wanted here as much as
    // anywhere else. It was hidden because this mode adds no blocks, which
    // confused "nothing to add" with "nothing to configure".
    showRightControls: true,
    settings: { wallpaper: true }
  },
  task: {
    id: 'task',
    label: 'Task',
    addBlockTypes: ['text', 'image', 'music', 'embed', 'task'],
    showRightControls: true,
    settings: { wallpaper: true }
  },
  playlist: {
    id: 'playlist',
    label: 'Playlist',
    addBlockTypes: [],
    showRightControls: true,
    settings: { wallpaper: true }
  },
  birthday: {
    id: 'birthday',
    label: 'Birthday',
    addBlockTypes: [],
    showRightControls: false,
    requiresUnlock: true
  }
};

export const MODE_ORDER = ['default', 'simple', 'single', 'habit', 'task', 'playlist', 'birthday'];

/**
 * Whether a mode draws the folder's wallpaper.
 *
 * Every mode but Birthday, and all of them the same picture with the same
 * settings: Canvas's. Asked for on 2026-09-27 -- "make other modes (apart from
 * Birthday) have as background the background Canvas mode uses ... the same
 * background and settings as the image background in Canvas mode." Single Note
 * and Playlist used to share a wallpaper of their own; there is now one per
 * folder, chosen from any of these modes.
 */
export function hasWallpaper(mode) {
  return mode === 'default' || Boolean(MODE_DEFINITIONS[mode]?.settings?.wallpaper);
}

export function getModeDefinition(mode) {
  return MODE_DEFINITIONS[mode] || MODE_DEFINITIONS.single;
}

export function getModeOptions({ birthdayModeUnlocked = false } = {}) {
  return MODE_ORDER.map((id) => {
    const def = MODE_DEFINITIONS[id];
    const locked = def.requiresUnlock && !birthdayModeUnlocked;
    return {
      id,
      label: locked ? `${def.label} 🔒` : def.label,
      locked
    };
  });
}
