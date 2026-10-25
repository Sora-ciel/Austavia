<script>
  import { createEventDispatcher } from 'svelte';
  import {
    CONTROL_COLOR_DEFAULTS,
    BLOCK_THEME_DEFAULTS,
    DEFAULT_PREVIEW_BG,
    normalizeControlColors,
    normalizeBlockTheme
  } from '../utils/themeDefaults.js';

  const dispatch = createEventDispatcher();

  export let controlColors = CONTROL_COLOR_DEFAULTS;
  export let blockTheme = BLOCK_THEME_DEFAULTS;
  export let previewBg = DEFAULT_PREVIEW_BG;
  export let themes = [];
  export let selectedThemeId = '';

  let workingControlColors = normalizeControlColors(controlColors);
  let workingBlockTheme = normalizeBlockTheme(blockTheme);
  let localPreviewBg = previewBg || DEFAULT_PREVIEW_BG;
  let themeName = '';
  let themeDescription = '';
  let error = '';
  let editingThemeId = null;
  let editingExisting = false;

  let lastControlColorsRef = controlColors;
  let lastBlockThemeRef = blockTheme;
  let lastPreviewBg = previewBg;

  $: themeList = Array.isArray(themes) ? themes.filter(Boolean) : [];
  $: customThemeOptions = themeList.filter((theme) => theme?.isCustom);
  $: primaryActionLabel = editingExisting ? 'Save changes' : 'Save theme';

  $: if (editingThemeId && !customThemeOptions.some((theme) => theme.id === editingThemeId)) {
    editingThemeId = null;
    editingExisting = false;
  }

  $: if (controlColors && controlColors !== lastControlColorsRef) {
    workingControlColors = normalizeControlColors(controlColors);
    lastControlColorsRef = controlColors;
  }

  $: if (blockTheme && blockTheme !== lastBlockThemeRef) {
    workingBlockTheme = normalizeBlockTheme(blockTheme);
    lastBlockThemeRef = blockTheme;
  }

  $: if (previewBg !== lastPreviewBg && typeof previewBg === 'string') {
    localPreviewBg = previewBg || DEFAULT_PREVIEW_BG;
    lastPreviewBg = previewBg;
  }

  function resetFromCurrentTheme() {
    workingControlColors = normalizeControlColors(controlColors);
    workingBlockTheme = normalizeBlockTheme(blockTheme);
    localPreviewBg = previewBg || DEFAULT_PREVIEW_BG;
  }

  function startNewTheme() {
    resetFromCurrentTheme();
    themeName = '';
    themeDescription = '';
    editingThemeId = null;
    editingExisting = false;
    error = '';
  }

  function loadThemeForEditing(theme) {
    if (!theme) {
      return;
    }

    workingControlColors = normalizeControlColors(
      theme.controlColors || CONTROL_COLOR_DEFAULTS
    );
    workingBlockTheme = normalizeBlockTheme(theme.blockTheme || BLOCK_THEME_DEFAULTS);
    localPreviewBg = theme.previewBg || DEFAULT_PREVIEW_BG;
    themeName = theme.name || '';
    themeDescription = theme.description || '';
    editingThemeId = theme.id || null;
    editingExisting = Boolean(theme?.isCustom && theme?.id);
    error = '';
  }

  function handleSelectThemeForEditing(theme) {
    loadThemeForEditing(theme);
  }

  function handleDeleteActiveTheme() {
    if (!editingThemeId) {
      return;
    }
    dispatch('deleteTheme', { id: editingThemeId });
  }

  function handleDuplicateCurrentTheme() {
    const baseName = (themeName || '').trim() || 'Custom theme';
    dispatch('duplicateTheme', {
      sourceId: editingThemeId,
      name: `${baseName} Copy`,
      description: themeDescription.trim(),
      controlColors: workingControlColors,
      blockTheme: workingBlockTheme,
      previewBg: localPreviewBg
    });
  }

  function handleDuplicateTheme(theme) {
    if (!theme) {
      return;
    }
    const baseName = (theme.name || '').trim() || 'Custom theme';
    dispatch('duplicateTheme', {
      sourceId: theme.id || null,
      name: `${baseName} Copy`,
      description: theme.description || '',
      controlColors: theme.controlColors,
      blockTheme: theme.blockTheme,
      previewBg: theme.previewBg
    });
  }

  function handleDeleteTheme(theme) {
    if (!theme?.id) {
      return;
    }
    dispatch('deleteTheme', { id: theme.id });
  }

  const controlFieldMap = [
    { key: 'panelBg', label: 'Panel background' },
    { key: 'textColor', label: 'Text color' },
    { key: 'buttonBg', label: 'Button background' },
    { key: 'buttonText', label: 'Button text' },
    { key: 'borderColor', label: 'Border color' }
  ];

  const canvasFields = [
    { key: 'outerBg', label: 'Canvas background' },
    { key: 'innerBg', label: 'Canvas inner area' }
  ];

  const controlSections = [
    {
      key: 'left',
      label: 'Left controls',
      description: 'Customize the toolbar shown on the left side of the canvas.',
      fields: controlFieldMap
    },
    {
      key: 'right',
      label: 'Right controls',
      description: 'Adjust the dropdown that appears on the right.',
      fields: controlFieldMap
    },
    {
      key: 'canvas',
      label: 'Canvas',
      description: 'Tune the canvas background layers.',
      fields: canvasFields
    }
  ];

  const blockColorKeys = new Set([
    'borderColor',
    'focusOutline',
    'headerBg',
    'headerText',
    'accentColor',
    'accentText',
    'mediaButtonBg',
    'mediaButtonText'
  ]);

  const blockFieldGroups = [
    {
      title: 'Block frame',
      description: 'Border, radius and shadows for your blocks.',
      fields: [
        { key: 'borderColor', label: 'Border color' },
        { key: 'borderWidth', label: 'Border width' },
        { key: 'borderRadius', label: 'Corner radius' },
        { key: 'shadow', label: 'Drop shadow', type: 'textarea' }
      ]
    },
    {
      title: 'Opacity',
      description:
        'How much of what is behind a block shows through it. The writing has its own dial so a see-through block can still be read.',
      fields: [
        { key: 'bgOpacity', label: 'Block background', type: 'range' },
        { key: 'headerOpacity', label: 'Block header', type: 'range' },
        { key: 'textOpacity', label: 'Text', type: 'range' }
      ]
    },
    {
      title: 'Focus state',
      description: 'Highlighting when a block is focused.',
      fields: [
        { key: 'focusOutline', label: 'Focus outline' },
        { key: 'focusShadow', label: 'Focus shadow', type: 'textarea' }
      ]
    },
    {
      title: 'Header styling',
      description: 'Typography and background for block headers.',
      fields: [
        { key: 'headerBg', label: 'Header background' },
        { key: 'headerText', label: 'Header text color' },
        { key: 'headerFont', label: 'Header font family' },
        { key: 'headerLetterSpacing', label: 'Letter spacing' },
        { key: 'headerTransform', label: 'Text transform' }
      ]
    },
    {
      title: 'Body & accent',
      description: 'Body font and accent colors for buttons.',
      fields: [
        { key: 'bodyFont', label: 'Body font family' },
        { key: 'accentColor', label: 'Accent color' },
        { key: 'accentText', label: 'Accent text color' }
      ]
    },
    {
      title: 'Media controls',
      description: 'Fine tune the inline media controls.',
      fields: [
        { key: 'controlRadius', label: 'Control corner radius' },
        { key: 'mediaButtonBg', label: 'Media button background' },
        { key: 'mediaButtonText', label: 'Media button text' }
      ]
    }
  ];

  // Themes saved before these dials existed have no opacity at all, and a
  // theme file can be hand-edited into anything. Either way the answer is fully
  // opaque rather than a blank slider or an invisible block — an absent setting
  // means the block looked solid when it was saved, so that is what it should
  // still look like.
  // `theme` is passed in rather than read off the component, so that the
  // readout beside each slider re-renders when the value changes: a template
  // expression is only re-evaluated when something it *names* changes, and a
  // dependency reached inside a helper is invisible to that. Without it the
  // slider moved, the blocks faded, and the number kept saying 100%.
  function blockOpacityValue(theme, key) {
    const raw = Number(theme?.[key] ?? BLOCK_THEME_DEFAULTS[key]);
    if (!Number.isFinite(raw)) return 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  }

  function toCssVarName(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  $: previewStyle = Object.entries(workingBlockTheme || {})
    .map(([key, value]) => `--block-${toCssVarName(key)}: ${value}`)
    .join('; ');

  const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const HEX_ALPHA_REGEX = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i;

  function expandShortHex(value) {
    if (!value || !/^#[0-9a-f]{3}$/i.test(value)) {
      return value;
    }
    const [, digits] = value.match(/^#([0-9a-f]{3})$/i);
    return `#${digits
      .split('')
      .map((char) => char + char)
      .join('')}`;
  }

  function expandShortHexWithAlpha(value) {
    if (!value || !/^#[0-9a-f]{4}$/i.test(value)) {
      return value;
    }
    const [, digits] = value.match(/^#([0-9a-f]{4})$/i);
    return `#${digits
      .split('')
      .map((char) => char + char)
      .join('')}`;
  }

  function hexToRgb(hex) {
    const expanded = expandShortHex(hex);
    const match = expanded && expanded.match(/^#([0-9a-f]{6})$/i);
    if (!match) {
      return { r: 0, g: 0, b: 0 };
    }
    const [, digits] = match;
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    return { r, g, b };
  }

  function clampAlpha(alpha) {
    if (Number.isNaN(alpha)) {
      return 1;
    }
    return Math.min(1, Math.max(0, alpha));
  }

  function formatColorValue(hex, alpha = 1) {
    if (!hex) {
      return '';
    }

    const expanded = expandShortHex(hex)?.toLowerCase();
    const normalizedAlpha = clampAlpha(alpha);

    if (!expanded || !/^#([0-9a-f]{6})$/i.test(expanded)) {
      return hex;
    }

    if (normalizedAlpha >= 0.999) {
      return expanded;
    }

    const { r, g, b } = hexToRgb(expanded);
    const roundedAlpha = Math.round(normalizedAlpha * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${roundedAlpha})`;
  }

  function parseCssColor(value) {
    const fallback = { hex: null, alpha: 1, editable: false };

    if (!value || typeof value !== 'string') {
      return fallback;
    }

    const trimmed = value.trim();

    if (HEX_ALPHA_REGEX.test(trimmed)) {
      const expanded = expandShortHexWithAlpha(trimmed).toLowerCase();
      const match = expanded.match(/^#([0-9a-f]{8})$/i);
      if (!match) {
        return fallback;
      }
      const [, digits] = match;
      const rgbHex = `#${digits.slice(0, 6)}`;
      const alphaHex = digits.slice(6, 8);
      const alpha = clampAlpha(parseInt(alphaHex, 16) / 255);
      return { hex: rgbHex, alpha, editable: true };
    }

    if (HEX_COLOR_REGEX.test(trimmed)) {
      return { hex: expandShortHex(trimmed).toLowerCase(), alpha: 1, editable: true };
    }

    const rgbaMatch = trimmed.match(
      /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1|0|0?\.\d+))?\)$/i
    );

    if (rgbaMatch) {
      const [, r, g, b, alphaValue = '1'] = rgbaMatch;
      const numericR = Number(r);
      const numericG = Number(g);
      const numericB = Number(b);
      const alphaNum = clampAlpha(Number(alphaValue));

      if (numericR <= 255 && numericG <= 255 && numericB <= 255) {
        const toHex = (component) => Number(component).toString(16).padStart(2, '0');
        return {
          hex: `#${toHex(numericR)}${toHex(numericG)}${toHex(numericB)}`,
          alpha: alphaNum,
          editable: true
        };
      }

      return fallback;
    }

    return fallback;
  }

  function getBlockFieldValue(key) {
    return workingBlockTheme[key] ?? BLOCK_THEME_DEFAULTS[key] ?? '';
  }

  function getBlockColorState(key) {
    const value = getBlockFieldValue(key);
    const parsed = parseCssColor(value);
    return { ...parsed, value };
  }

  function handleBlockColorChange(key, hex, alpha = 1) {
    if (!hex) {
      return;
    }
    const formatted = formatColorValue(hex, alpha);
    updateBlockField(key, formatted);
  }

  function handleBlockOpacityChange(key, alpha) {
    const state = getBlockColorState(key);
    if (!state.hex) {
      return;
    }
    const formatted = formatColorValue(state.hex, alpha);
    updateBlockField(key, formatted);
  }

  $: previewColorState = parseCssColor(localPreviewBg);

  function handlePreviewColorChange(hex) {
    if (!hex) {
      return;
    }
    const formatted = formatColorValue(hex, previewColorState.alpha ?? 1);
    handlePreviewChange(formatted);
  }

  function handlePreviewOpacityChange(alpha) {
    if (!previewColorState.hex) {
      return;
    }
    const formatted = formatColorValue(previewColorState.hex, alpha);
    handlePreviewChange(formatted);
  }

  function updateControlColor(section, key, value) {
    workingControlColors = {
      ...workingControlColors,
      [section]: {
        ...workingControlColors[section],
        [key]: value
      }
    };
    dispatch('updateControlColor', { section, side: section, key, value });
  }

  function updateBlockField(key, value) {
    workingBlockTheme = {
      ...workingBlockTheme,
      [key]: value
    };
    dispatch('updateBlockTheme', { key, value });
  }

  function handlePreviewChange(value) {
    localPreviewBg = value || DEFAULT_PREVIEW_BG;
    dispatch('updatePreviewBg', { value: localPreviewBg });
  }

  function handleSaveTheme() {
    const trimmedName = themeName.trim();
    if (!trimmedName) {
      error = 'Give your theme a name before saving it.';
      return;
    }

    error = '';
    const payload = {
      name: trimmedName,
      description: themeDescription.trim(),
      controlColors: workingControlColors,
      blockTheme: workingBlockTheme,
      previewBg: localPreviewBg
    };

    if (editingExisting && editingThemeId) {
      dispatch('updateTheme', { id: editingThemeId, ...payload });
    } else {
      dispatch('saveTheme', payload);
    }
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 12, 0.86);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: clamp(12px, 3vh, 36px) clamp(16px, 4vw, 48px);
    z-index: 1200;
    user-select: text;
  }

  .overlay * {
    user-select: text;
  }

  .panel {
    width: min(1420px, 100%);
    max-height: calc(100dvh - clamp(24px, 6vh, 72px));
    background: rgba(18, 20, 28, 0.96);
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 32px 120px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding: clamp(24px, 3vw, 40px);
    color: #f5f7ff;
    overflow: auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.4rem;
    letter-spacing: 0.04em;
  }

  .panel-header p {
    margin: 4px 0 0;
    opacity: 0.75;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    color: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }

  .content-grid {
    display: grid;
    grid-template-columns: 0.9fr 1fr 1fr 0.95fr;
    gap: 24px;
  }

  .section-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .theme-library {
    gap: 20px;
  }

  .theme-library-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .theme-library-actions .ghost-btn {
    padding: 8px 16px;
  }

  .theme-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 420px;
    overflow: auto;
    padding-right: 4px;
  }

  .theme-list-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .theme-list-item.active {
    border-color: rgba(91, 139, 255, 0.9);
    background: rgba(91, 139, 255, 0.12);
  }

  .theme-list-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .theme-list-content strong {
    font-size: 0.92rem;
    letter-spacing: 0.02em;
  }

  .theme-list-content span {
    font-size: 0.78rem;
    opacity: 0.75;
  }

  .theme-list-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .theme-list-actions button {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: inherit;
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .empty-note {
    font-size: 0.8rem;
    opacity: 0.7;
  }

  .section-card h3 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .section-card p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.4;
    opacity: 0.7;
  }

  /* The slider and its number sit on one line, with the readout at a fixed
     width so the row does not jitter between 9% and 100% while dragging. */
  .range-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .range-row input[type="range"] {
    flex: 1;
    min-width: 0;
  }
  .range-readout {
    flex: 0 0 auto;
    min-width: 42px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .field-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field-list h4 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
    letter-spacing: 0.03em;
  }

  label span {
    opacity: 0.75;
  }

  input[type="color"],
  input[type="text"],
  textarea {
    background: rgba(10, 12, 18, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: inherit;
    padding: 10px;
    font-family: inherit;
    font-size: 0.85rem;
  }

  input[type="color"] {
    width: 52px;
    height: 36px;
    padding: 0;
  }

  textarea {
    min-height: 70px;
    resize: vertical;
  }

  .color-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .color-text-input {
    flex: 1;
  }

  .opacity-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .opacity-row input[type='range'] {
    flex: 1;
  }

  .opacity-value {
    min-width: 36px;
    text-align: right;
  }

  .color-helper {
    font-size: 0.75rem;
    opacity: 0.6;
    margin-top: 4px;
  }

  .preview-card {
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 18px;
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .preview-box {
    border-radius: var(--block-border-radius, 16px);
    border: var(--block-border-width, 1px) solid var(--block-border-color, rgba(255, 255, 255, 0.15));
    box-shadow: var(--block-shadow, 0 18px 45px rgba(0, 0, 0, 0.45));
    background: var(--preview-bg, rgba(12, 14, 18, 0.86));
    overflow: hidden;
  }

  .preview-header {
    background: var(--block-header-bg, rgba(18, 18, 24, 0.88));
    color: var(--block-header-text, #ffffff);
    font-family: var(--block-header-font, 'Inter', sans-serif);
    letter-spacing: var(--block-header-letter-spacing, 0.08em);
    text-transform: var(--block-header-transform, uppercase);
    padding: 10px 16px;
    font-size: 0.85rem;
  }

  .preview-body {
    padding: 16px;
    color: var(--block-header-text, #ffffff);
    font-family: var(--block-body-font, 'Inter', sans-serif);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .preview-actions {
    display: flex;
    gap: 10px;
  }

  .preview-button {
    border-radius: var(--block-control-radius, 10px);
    background: var(--block-media-button-bg, rgba(255, 255, 255, 0.08));
    color: var(--block-media-button-text, #ffffff);
    padding: 10px 14px;
    font-size: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .preview-accent {
    background: var(--block-accent-color, #ff5f5f);
    color: var(--block-accent-text, #ffffff);
    padding: 12px 16px;
    border-radius: var(--block-control-radius, 10px);
    text-align: center;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .preview-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .theme-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .meta-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
    grid-column: 1 / -1;
    flex-wrap: wrap;
    align-items: center;
  }

  .primary-btn {
    background: #5b8bff;
    color: #0b101a;
    border: none;
    border-radius: 999px;
    padding: 10px 22px;
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  .ghost-btn {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 10px 22px;
    cursor: pointer;
  }

  .danger-btn {
    background: rgba(255, 107, 107, 0.12);
    border: 1px solid rgba(255, 107, 107, 0.4);
    color: #ff9b9b;
    border-radius: 999px;
    padding: 10px 18px;
    cursor: pointer;
  }

  .error {
    margin-top: 4px;
    font-size: 0.8rem;
    color: #ff9b9b;
  }

  @media (max-width: 1280px) {
    .content-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .theme-library {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 880px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .theme-list {
      max-height: none;
    }
  }

  @media (max-width: 640px) {
    .panel {
      padding: 24px 16px;
    }
  }
</style>

<div class="overlay">
  <div class="panel">
    <div class="panel-header">
      <div>
        <h2>Advanced CSS theme builder</h2>
        <p>Create bespoke control palettes and block styling, then save them as reusable themes.</p>
      </div>
      <button class="close-btn" type="button" on:click={handleClose}>Close</button>
    </div>

    <div class="content-grid">
      <div class="section-card theme-library">
        <h3>Theme library</h3>
        <p>Manage your saved themes or load one to continue editing.</p>

        <div class="theme-library-actions">
          <button class="ghost-btn" type="button" on:click={startNewTheme}>
            Start new theme
          </button>
          <button class="ghost-btn" type="button" on:click={resetFromCurrentTheme}>
            Sync with current view
          </button>
        </div>

        <div class="theme-list">
          {#if customThemeOptions.length}
            {#each customThemeOptions as theme (theme.id)}
              <div
                class="theme-list-item"
                class:active={editingThemeId === theme.id || (!editingThemeId && selectedThemeId === theme.id)}
              >
                <div class="theme-list-content">
                  <strong>{theme.name}</strong>
                  <span>{theme.description}</span>
                </div>
                <div class="theme-list-actions">
                  <button type="button" on:click={() => handleSelectThemeForEditing(theme)}>
                    Edit
                  </button>
                  <button type="button" on:click={() => handleDuplicateTheme(theme)}>
                    Duplicate
                  </button>
                  <button type="button" on:click={() => handleDeleteTheme(theme)}>
                    Delete
                  </button>
                </div>
              </div>
            {/each}
          {:else}
            <span class="empty-note">No custom themes yet. Save one to start a library.</span>
          {/if}
        </div>
      </div>

      <div class="section-card controls-card">
        <h3>Control colors</h3>
        <p>Pick colors for each surface of the UI. The changes apply live so you can preview immediately.</p>

        {#each controlSections as section}
          <div class="field-list">
            <h4>{section.label}</h4>
            <p>{section.description}</p>
            {#each section.fields as field}
              <label>
                <span>{field.label}</span>
                <input
                  type="color"
                  value={workingControlColors[section.key]?.[field.key] || CONTROL_COLOR_DEFAULTS[section.key]?.[field.key]}
                  on:input={(event) =>
                    updateControlColor(section.key, field.key, event.target.value)}
                />
              </label>
            {/each}
          </div>
        {/each}
      </div>

      <div class="section-card block-card">
        <h3>Block styling</h3>
        <p>Fine tune typography, shadows and accents for the blocks rendered on the canvas.</p>

        {#each blockFieldGroups as group}
          <div class="field-list">
            <h4>{group.title}</h4>
            <p>{group.description}</p>
            {#each group.fields as field}
              <label>
                <span>{field.label}</span>
                {#if field.type === 'range'}
                  <div class="range-row">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={blockOpacityValue(workingBlockTheme, field.key)}
                      on:input={(event) =>
                        updateBlockField(field.key, Number(event.target.value))}
                    />
                    <span class="range-readout">{blockOpacityValue(workingBlockTheme, field.key)}%</span>
                  </div>
                {:else if field.type === 'textarea'}
                  <textarea
                    on:input={(event) => updateBlockField(field.key, event.target.value)}
                  >{workingBlockTheme[field.key] ?? BLOCK_THEME_DEFAULTS[field.key] ?? ''}</textarea>
                {:else if blockColorKeys.has(field.key)}
                  {#key `${field.key}-${getBlockFieldValue(field.key)}`}
                    {@const colorState = getBlockColorState(field.key)}
                    {#if colorState.editable}
                      <div class="color-input-row">
                        <input
                          type="color"
                          value={colorState.hex}
                          on:input={(event) =>
                            handleBlockColorChange(field.key, event.target.value, colorState.alpha)}
                        />
                        <input
                          class="color-text-input"
                          type="text"
                          value={colorState.value}
                          on:input={(event) => updateBlockField(field.key, event.target.value)}
                        />
                      </div>
                      <div class="opacity-row">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round((colorState.alpha ?? 1) * 100)}
                          aria-label={`${field.label} opacity`}
                          on:input={(event) =>
                            handleBlockOpacityChange(
                              field.key,
                              Number(event.target.value) / 100
                            )
                          }
                        />
                        <span class="opacity-value">{Math.round((colorState.alpha ?? 1) * 100)}%</span>
                      </div>
                    {:else}
                      <div class="color-input-row">
                        <input
                          type="color"
                          disabled
                          value="#ffffff"
                          title="Color picker requires a solid hex or rgb value."
                        />
                        <input
                          class="color-text-input"
                          type="text"
                          value={colorState.value}
                          on:input={(event) => updateBlockField(field.key, event.target.value)}
                        />
                      </div>
                      <span class="color-helper">Use the text field for gradients or CSS variables.</span>
                    {/if}
                  {/key}
                {:else}
                  <input
                    type="text"
                    value={workingBlockTheme[field.key] ?? BLOCK_THEME_DEFAULTS[field.key] ?? ''}
                    on:input={(event) => updateBlockField(field.key, event.target.value)}
                  />
                {/if}
              </label>
            {/each}
          </div>
        {/each}
      </div>

      <div class="section-card preview-card">
        <div
          class="preview-box"
          style={`--preview-bg: ${localPreviewBg}; ${previewStyle}`}
        >
          <div class="preview-header">Preview header</div>
          <div class="preview-body">
            <div>Lorem ipsum dolor sit amet, consectetur.</div>
            <div class="preview-actions">
              <span class="preview-button">Play</span>
              <span class="preview-button">Pause</span>
            </div>
            <div class="preview-accent">Accent action</div>
          </div>
        </div>

        <div class="preview-input">
          <span>Preview background</span>
          {#if previewColorState.editable}
            <input
              type="color"
              value={previewColorState.hex}
              on:input={(event) => handlePreviewColorChange(event.target.value)}
            />
            <input
              type="text"
              value={localPreviewBg}
              on:input={(event) => handlePreviewChange(event.target.value)}
            />
            <div class="opacity-row">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round((previewColorState.alpha ?? 1) * 100)}
                aria-label="Preview background opacity"
                on:input={(event) =>
                  handlePreviewOpacityChange(Number(event.target.value) / 100)
                }
              />
              <span class="opacity-value">{Math.round((previewColorState.alpha ?? 1) * 100)}%</span>
            </div>
          {:else}
            <input
              type="color"
              disabled
              value="#ffffff"
              title="Color picker requires a solid color or rgba value."
            />
            <input
              type="text"
              value={localPreviewBg}
              on:input={(event) => handlePreviewChange(event.target.value)}
            />
            <span class="color-helper">Use the text field for gradients or CSS variables.</span>
          {/if}
        </div>
      </div>
    </div>
    <form class="theme-meta" on:submit|preventDefault={handleSaveTheme}>
      <label>
        <span>Theme name</span>
        <input
          type="text"
          placeholder="e.g. Midnight Neon"
          bind:value={themeName}
        />
        {#if error}
          <span class="error">{error}</span>
        {/if}
      </label>

      <label>
        <span>Description (optional)</span>
        <input
          type="text"
          placeholder="Short description of the vibe"
          bind:value={themeDescription}
        />
      </label>

      <div class="meta-actions">
        <button
          class="ghost-btn"
          type="button"
          on:click={handleDuplicateCurrentTheme}
        >
          Duplicate as new
        </button>
        {#if editingExisting}
          <button
            class="danger-btn"
            type="button"
            on:click={handleDeleteActiveTheme}
          >
            Delete theme
          </button>
        {/if}
        <button class="ghost-btn" type="button" on:click={handleClose}>Cancel</button>
        <button class="primary-btn" type="submit">{primaryActionLabel}</button>
      </div>
    </form>
  </div>
</div>
