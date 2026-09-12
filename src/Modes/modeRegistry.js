export const MODE_DEFINITIONS = {
  default: {
    id: 'default',
    label: 'Canvas Mode',
    addBlockTypes: ['text', 'image', 'music', 'embed'],
    showRightControls: true
  },
  simple: {
    id: 'simple',
    label: 'Simple Note Mode',
    addBlockTypes: ['text', 'image', 'music', 'embed'],
    showRightControls: true,
    settings: { simpleColumns: true }
  },
  single: {
    id: 'single',
    label: 'Single Note Mode',
    addBlockTypes: ['text'],
    showRightControls: true,
    settings: { singleBackground: true }
  },
  habit: {
    id: 'habit',
    label: 'Habit Tracker Mode',
    addBlockTypes: [],
    // The right panel carries themes, saved files and the cloud — none of
    // which is about blocks, and all of which is wanted here as much as
    // anywhere else. It was hidden because this mode adds no blocks, which
    // confused "nothing to add" with "nothing to configure".
    showRightControls: true
  },
  task: {
    id: 'task',
    label: 'Task Mode',
    addBlockTypes: ['text', 'image', 'music', 'embed', 'task'],
    showRightControls: true
  },
  playlist: {
    id: 'playlist',
    label: 'Playlist Mode',
    addBlockTypes: [],
    showRightControls: true,
    // The same wallpaper Single Note has, from the same settings — one picture
    // to choose, and changing it in either place changes both.
    settings: { singleBackground: true }
  },
  birthday: {
    id: 'birthday',
    label: 'Birthday Mode',
    addBlockTypes: [],
    showRightControls: false,
    requiresUnlock: true
  }
};

export const MODE_ORDER = ['default', 'simple', 'single', 'habit', 'task', 'playlist', 'birthday'];

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
