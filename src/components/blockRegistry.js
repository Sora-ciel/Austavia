export const BLOCK_DEFINITIONS = {
  text: { type: 'text', label: 'Text', icon: '+' },
  image: { type: 'image', label: 'Image', icon: '+' },
  music: { type: 'music', label: 'Music', icon: '+' },
  embed: { type: 'embed', label: 'Embed', icon: '+' },
  task: { type: 'task', label: 'Task List', icon: '+' },
  clock: { type: 'clock', label: 'Clock & alarm', icon: '+' },
  // Links to folders, as tiles (NestBlock.svelte).
  nest: { type: 'nest', label: 'Nest', icon: '+' },
  // A page inside the folder (PageBlock.svelte).
  page: { type: 'page', label: 'Page', icon: '+' }
};

export function getBlockDefinition(type) {
  return BLOCK_DEFINITIONS[type] || { type, label: type, icon: '+' };
}

export function getBlockDefinitions(types = []) {
  return types.map((type) => getBlockDefinition(type));
}
