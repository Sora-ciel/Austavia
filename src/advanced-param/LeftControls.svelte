<script>
  import ControlIcon from '../components/ControlIcon.svelte';
  import { createEventDispatcher, onMount } from "svelte";
  import { getModeDefinition, getModeOptions } from "../Modes/modeRegistry.js";
  import { getBlockDefinitions } from "../components/blockRegistry.js";

  export let mode;
  export let modeLabels = {};
  export let currentSaveName;
  export let focusedBlockId = null;
  export let simpleNoteColumnCount = 2;
  export let singleNoteSettings = {};
  export let canvasBackgroundSettings = {};
  export let colors = {};
  export let birthdayModeUnlocked = false;
  export let birthdayUnlockMessage = '';


  const dispatch = createEventDispatcher();
  let fileInputRef;
  let compactUI = false; // now for <= 1024px
  let showMobileMenu = false;
  let menuRef;
  let toggleRef;
  let modeMenuRef;
  let modeButtonRef;
  let modeMenuDesktopRef;
  let modeButtonDesktopRef;
  let addBlockMenuRef;
  let addBlockButtonRef;
  let addBlockMenuDesktopRef;
  let addBlockButtonDesktopRef;
  let mobileQuickActionsRef;
  let showModeLadder = false;
  let showAddBlockMenu = false;
  let birthdayPassword = '';

  $: modeOptions = getModeOptions({ birthdayModeUnlocked });
  $: activeModeDefinition = getModeDefinition(mode);

  const defaultColors = {
    panelBg: "#111111b0",
    textColor: "#ffffff",
    buttonBg: "#333333",
    buttonText: "#ffffff",
    borderColor: "#444444",
    inputBg: "#1d1d1d"
  };

  $: theme = { ...defaultColors, ...(colors || {}) };
  $: leftCssVars = Object.entries({
    // A bar is the colour of the text around it and its groove is the
    // background behind it. In this panel the text around it is button text:
    // almost everything in the left controls is a button, so that is what the
    // controls read as. `textColor` is a second, usually paler colour that only
    // the Bg panel's prose was using — which is exactly why that panel looked
    // like it belonged to something else.
    "--sb-track": theme.panelBg,
    "--sb-thumb": theme.buttonText,
    "--left-panel-bg": theme.panelBg,
    "--left-text-color": theme.textColor,
    "--left-button-bg": theme.buttonBg,
    "--left-button-text": theme.buttonText,
    "--left-border-color": theme.borderColor,
    "--left-input-bg": theme.inputBg
  })
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");


  $: isSimpleNoteMode = Boolean(activeModeDefinition?.settings?.simpleColumns);
  // Named for what the flag means rather than for the mode that had it first:
  // Single Note and Playlist both draw the wallpaper kept in modeSettings.single,
  // and more modes may. Canvas has the same panel but its own settings, which is
  // the only difference between them and what backgroundSettingsKey answers.
  $: usesSharedWallpaper = Boolean(activeModeDefinition?.settings?.singleBackground);
  $: hasModeBackground = usesSharedWallpaper || mode === "default";
  $: backgroundSettingsKey = usesSharedWallpaper ? "single" : "default";
  $: backgroundSettings = usesSharedWallpaper ? singleNoteSettings : canvasBackgroundSettings;
  $: availableAddBlockTypes = activeModeDefinition?.addBlockTypes || [];
  $: canAddBlock = (type) => availableAddBlockTypes.includes(type);
  $: addBlockDefinitions = getBlockDefinitions(availableAddBlockTypes);

  function addBlock(type) {
    if (!canAddBlock(type)) return;
    dispatch("addBlock", type);
  }

  function clear() {
    dispatch("clear");
  }


  function exportJSON() {
    dispatch("exportJSON");
  }

  function importJSON(event) {
    dispatch("importJSON", event);
  }

  function triggerFileInput() {
    fileInputRef.click();
  }

  function toggleModeMenu() {
    showModeLadder = !showModeLadder;
    if (showModeLadder) showAddBlockMenu = false;
    if (compactUI && showModeLadder) showMobileMenu = false;
  }

  function toggleAddBlockMenu() {
    showAddBlockMenu = !showAddBlockMenu;
    if (showAddBlockMenu) showModeLadder = false;
    if (compactUI && showAddBlockMenu) showMobileMenu = false;
  }

  function selectMode(nextMode) {
    if (nextMode === 'birthday' && !birthdayModeUnlocked) return;
    dispatch("setMode", nextMode);
    showModeLadder = false;
  }

  function unlockBirthdayMode() {
    dispatch('unlockBirthdayMode', { password: birthdayPassword });
    birthdayPassword = '';
  }

  // "moveUp" moves a block earlier in the mode's order and "moveDown" later.
  // What that looks like on screen depends on the mode, which is why these are
  // named for the direction the arrow points rather than for the event.
  //
  // Simple Note lays blocks out in reading order, so earlier is higher up and
  // the arrows mean exactly what they show. Everywhere else the order runs the
  // other way against the layout, and the buttons were wired accordingly —
  // which left Simple Note with two arrows that each did the opposite of their
  // icon.
  $: arrowsFollowReadingOrder = mode === 'simple';

  function moveTowardsTop() {
    if (!focusedBlockId) return;
    dispatch(arrowsFollowReadingOrder ? 'moveUp' : 'moveDown');
  }

  function moveTowardsBottom() {
    if (!focusedBlockId) return;
    dispatch(arrowsFollowReadingOrder ? 'moveDown' : 'moveUp');
  }

  function handleSimpleColumnInput(event) {
    const next = Math.max(1, Number.parseInt(event.currentTarget.value, 10) || 1);
    dispatch("modeSettingChange", { columnCount: next });
  }

  // Single Note Mode background image — desktop and phone can each have
  // their own image; which slot is read/written follows the same
  // <=1024px breakpoint (compactUI) the rest of the toolbar already uses.
  let bgPanelOpen = false;
  $: bgImageKey = compactUI ? 'backgroundImageMobile' : 'backgroundImage';
  // Read from and written to whichever mode is showing, so one panel serves
  // both. Everything below is otherwise identical between them.
  $: bgImage = backgroundSettings?.[bgImageKey] || '';
  $: bgOpacity = backgroundSettings?.bgOpacity ?? 100;
  $: bgBlur = backgroundSettings?.bgBlur ?? 0;
  $: bgLuminosity = backgroundSettings?.bgLuminosity ?? 100;
  // Pictures pasted into the note. They follow the wallpaper unless told not
  // to, so the two extra dials are only shown once that is turned off — a pair
  // of sliders that cannot do anything is worse than no sliders.
  $: imagesFollowBackground = backgroundSettings?.imagesFollowBackground !== false;
  $: imageOpacity = backgroundSettings?.imageOpacity ?? 100;
  $: imageLuminosity = backgroundSettings?.imageLuminosity ?? 100;
  $: bgSize = backgroundSettings?.bgSize || 'cover';

  function setBgSetting(patch) {
    dispatch('modeSettingChange', { [backgroundSettingsKey]: patch });
  }
  function onBgFileChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setBgSetting({ [bgImageKey]: String(reader.result || ''), bgThemeOptOut: false });
    reader.readAsDataURL(file);
    event.target.value = '';
  }
  function clearBgImage() {
    // Clearing the slot is enough for an image the reader picked, but a
    // background the theme supplied isn't stored in the file at all — it has
    // to be opted out of, or it would reappear on the next render.
    if (backgroundSettings?.backgroundFromTheme) {
      setBgSetting({ backgroundImage: '', backgroundImageMobile: '', bgThemeOptOut: true });
      return;
    }
    setBgSetting({ [bgImageKey]: '' });
  }

  function checkWidth() {
    compactUI = window.innerWidth <= 1024;
  }

  function elementContainsTarget(element, target) {
    return Boolean(element && target && element.contains(target));
  }

  function clickedInsideAny(target, elements = []) {
    return elements.some((element) => elementContainsTarget(element, target));
  }

  // Close when clicking outside to put for after button click on mobile phones and right controls too 
  function handleClickOutside(event) {
    const target = event.target;

    if (
      showMobileMenu &&
      !clickedInsideAny(target, [menuRef, toggleRef, mobileQuickActionsRef])
    ) {
      showMobileMenu = false;
    }

    if (
      showModeLadder &&
      !clickedInsideAny(target, [
        modeMenuRef,
        modeButtonRef,
        modeMenuDesktopRef,
        modeButtonDesktopRef
      ])
    ) {
      showModeLadder = false;
    }

    if (
      showAddBlockMenu &&
      !clickedInsideAny(target, [
        addBlockMenuRef,
        addBlockButtonRef,
        addBlockMenuDesktopRef,
        addBlockButtonDesktopRef
      ])
    ) {
      showAddBlockMenu = false;
    }
  }


onMount(() => {
  checkWidth();
  window.addEventListener("resize", checkWidth);
  window.addEventListener("click", handleClickOutside); // << add this

  return () => {
    window.removeEventListener("resize", checkWidth);
    window.removeEventListener("click", handleClickOutside); // << cleanup
  };
});

</script>



<style>
  .left-controls-wrapper {
    display: contents;
  }

  .left-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex-grow: 1;
    color: var(--left-text-color, inherit);
  }


  .left-controls-wrapper button,
  .left-controls-wrapper input {
    border-radius: 6px;
    border: 1px solid var(--left-border-color, #444444);
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  /* The toolbar buttons declare the theme's button colours but were rendering
     the #333/#fff fallbacks on every theme — the palette reaches the element
     (the field below resolves the same variables correctly) but this rule was
     losing the cascade. Restating it one level deeper settles it, so the
     buttons and their icons finally follow the theme. */
  .left-controls-wrapper .left-controls button {
    background: var(--left-button-bg, #333333);
    color: var(--left-button-text, #ffffff);
  }

  /* The folder name sits among the buttons but isn't one, so it reads as a
     quieter field: no filled background, just a hairline that firms up when
     focused. Text follows the button colour so it belongs to the same set. */
  .file-name-field {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    /* border-box so the hairline doesn't push it 2px taller than the buttons */
    box-sizing: border-box;
    min-height: 42px;
    padding: 0 11px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--left-button-text, #ffffff) 26%, transparent);
    background: color-mix(in srgb, var(--left-button-text, #ffffff) 7%, transparent);
    color: var(--left-button-text, #ffffff);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .file-name-field:focus-within {
    border-color: color-mix(in srgb, var(--left-button-text, #ffffff) 60%, transparent);
    background: color-mix(in srgb, var(--left-button-text, #ffffff) 12%, transparent);
  }
  .left-controls-wrapper .file-name-field input {
    border: none;
    background: none;
    color: inherit;
    padding: 0;
    min-height: 0;
    width: 11ch;
    /* Same type as the buttons, so the name sits among them as an equal
       rather than reading as small print. */
    font: inherit;
    outline: none;
  }
  .left-controls-wrapper .file-name-field input::placeholder {
    color: inherit;
    opacity: 0.5;
  }

  .mode-switcher {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .mode-ladder {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 200px;
    background: var(--left-panel-bg, #111111);
    border: 1px solid var(--left-border-color, #333333);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 1002;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.35);
  }

  .mode-ladder button {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
  }

  .mode-ladder button.active {
    background: color-mix(in srgb, var(--left-text-color, #ffffff) 20%, transparent);
    border-color: color-mix(in srgb, var(--left-text-color, #ffffff) 45%, transparent);
  }


  .add-block-menu {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .add-block-list {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 190px;
    background: var(--left-panel-bg, #111111);
    border: 1px solid var(--left-border-color, #333333);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 1002;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.35);
  }

  .add-block-list button {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
  }

  .birthday-unlock {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--left-border-color, #333333);
    margin-top: 4px;
    padding-top: 8px;
  }

  .birthday-unlock-row {
    display: flex;
    gap: 6px;
    width: 100%;
  }

  .birthday-unlock-row input {
    flex: 1 1 auto;
    min-width: 0;
    width: auto;
  }

  .birthday-unlock-row button {
    flex: 0 0 auto;
    width: auto;
    white-space: nowrap;
    padding-inline: 10px;
  }

  .birthday-unlock small {
    opacity: 0.85;
  }

  .left-controls-wrapper button {
    background: var(--left-button-bg, #333333);
    color: var(--left-button-text, #ffffff);
    padding: 8px 12px;
    min-height: 42px;
    cursor: pointer;
    /* Icon and label on one baseline, with a consistent gap, now that the
       icons are elements rather than glyphs inside the text. */
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }

  .left-controls-wrapper button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .left-controls-wrapper input {
    background: var(--left-input-bg, #1d1d1d);
    color: var(--left-text-color, #ffffff);
    padding: 6px 8px;
  }


  .thin-button-row {
    display: inline-flex;
    gap: 8px;
  }

  .thin-action-btn {
    width: 54px;
    min-width: 54px;
    padding-inline: 0;
    justify-content: center;
  }

  .compact-toggle-btn {
    display: none;
  }

  .mobile-quick-actions {
    display: none;
    position: static;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    white-space: nowrap;
  }

  .mobile-block-actions {
    display: none;
  }

  /* Matches the buttons it sits between: same height, same type, and the
     button text colour rather than the panel's. */
  .simple-columns-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--left-button-text, #ffffff);
    font: inherit;
    /* Buttons carry 500 from the base stylesheet; `font: inherit` alone picks
       up the panel's 400 and the control reads lighter than its neighbours. */
    font-weight: 500;
    background: var(--left-button-bg, #333333);
    border: 1px solid var(--left-border-color, #444444);
    border-radius: 6px;
    padding: 0 10px;
    height: 42px;
    box-sizing: border-box;
  }

  /* Only the width is set here. The track, thumb and colour come from the
     shared range styling, which follows the theme — the old max-height
     squashed the thumb flat and the accent-color pinned it to one colour. */
  .simple-columns-control input[type="range"] {
    width: min(150px, 18vw);
    cursor: pointer;
  }

  .simple-columns-value {
    min-width: 1.25rem;
    text-align: center;
  }

  /* ── Single Note Mode background image ─────────────────── */
  .bg-settings-wrap { position: relative; display: inline-flex; align-items: center; }
  .bg-settings-wrap > button.active { background: var(--left-border-color, #444444); }
  .bg-panel {
    position: absolute;
    /* The Bg button sits at the end of the toolbar, so open leftwards —
       anchoring left ran the panel off the right edge of the window. */
    right: 0;
    top: calc(100% + 6px);
    z-index: 1002;
    width: 260px;
    background: var(--left-panel-bg, #111111);
    border: 1px solid var(--left-border-color, #333333);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 9px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.55);
  }
  .bg-panel-row { display: flex; gap: 6px; }
  .bg-section-divider {
    height: 1px;
    background: color-mix(in srgb, var(--left-button-text, #ffffff) 18%, transparent);
  }
  .bg-check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: var(--left-button-text, #ffffff);
  }
  .bg-check-row input {
    accent-color: var(--sb-thumb, #ffffff);
    cursor: pointer;
  }
  .bg-file-btn {
    flex: 1;
    text-align: center;
    background: var(--left-button-bg, #333333);
    border: 1px solid var(--left-border-color, #444444);
    border-radius: 7px;
    color: var(--left-button-text, #ffffff);
    padding: 6px 8px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .bg-clear-btn {
    background: rgba(255,90,90,0.15);
    border: 1px solid rgba(255,90,90,0.4);
    border-radius: 7px;
    color: #ff9b9b;
    padding: 6px 8px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .bg-slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    color: var(--left-button-text, #ffffff);
  }
  .bg-slider-row > span:first-child { width: 62px; flex-shrink: 0; }

  /* Coloured from --sb-thumb and --sb-track like every other slider and
     scrollbar in the app. In this panel those are the panel's own text and
     background, so a bar matches the writing next to it — which is the rule
     everywhere: text colour for text and for bars, background colour for
     backgrounds.

     The geometry below stays, because it fixes something the shared rule does
     not. */
  /* The native thumb can only travel between half-a-thumb from each end, so a
     full-width track always leaves a gap the handle can never reach. Draw the
     track ourselves inset by that same half-thumb (--r) and the handle lines
     up with both ends exactly. */
  .bg-slider {
    /* --r is half the thumb; the thumb is exactly as tall as the input and its
       track, so it centres on the drawn bar without any nudging. */
    --r: 8px;
    position: relative;
    flex: 1;
    min-width: 0;
    height: calc(var(--r) * 2);
    display: block;
  }
  .bg-slider::before,
  .bg-slider::after {
    content: '';
    position: absolute;
    left: var(--r);
    right: var(--r);
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 999px;
    pointer-events: none;
  }
  .bg-slider::before {
    background: color-mix(in srgb, var(--sb-thumb, #ffffff) 28%, var(--sb-track, transparent));
  }
  .bg-slider::after {
    right: auto;
    width: calc((100% - var(--r) * 2) * var(--fill, 0%) / 100%);
    background: var(--sb-thumb, #ffffff);
  }

  .bg-slider input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    position: relative;
    z-index: 1;
    width: 100%;
    height: calc(var(--r) * 2);
    margin: 0;
    padding: 0;
    /* the UA border would add 1px a side and shove the thumb off the bar */
    border: none;
    box-sizing: border-box;
    background: transparent;
    cursor: pointer;
  }
  .bg-slider input[type="range"]::-webkit-slider-runnable-track {
    height: calc(var(--r) * 2);
    background: transparent;
    border: none;
  }
  .bg-slider input[type="range"]::-moz-range-track {
    height: calc(var(--r) * 2);
    background: transparent;
    border: none;
  }
  .bg-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: calc(var(--r) * 2);
    height: calc(var(--r) * 2);
    margin-top: 0; /* thumb == track height, so no offset is needed */
    border-radius: 50%;
    background: var(--sb-thumb, #ffffff);
    border: none;
    cursor: pointer;
  }
  .bg-slider input[type="range"]::-moz-range-thumb {
    width: calc(var(--r) * 2);
    height: calc(var(--r) * 2);
    border-radius: 50%;
    background: var(--sb-thumb, #ffffff);
    border: none;
    cursor: pointer;
  }

  .bg-val { width: 42px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; opacity: 0.85; }
  .bg-size-toggle { display: flex; gap: 4px; flex: 1; }
  .bg-size-toggle button {
    flex: 1;
    background: var(--left-button-bg, #333333);
    border: 1px solid var(--left-border-color, #444444);
    border-radius: 6px;
    color: var(--left-button-text, #ffffff);
    padding: 4px;
    font-size: 0.76rem;
    cursor: pointer;
  }
  /* Tinted from the panel's own text rather than a fixed blue, which belonged
     to no theme and was simply the colour somebody had to hand. */
  .bg-size-toggle button.active {
    background: color-mix(in srgb, var(--left-button-text, #ffffff) 22%, transparent);
    border-color: color-mix(in srgb, var(--left-button-text, #ffffff) 45%, transparent);
    color: var(--left-button-text, #ffffff);
  }

  @media (max-width: 1024px) {
    /* Phone controls don't need desktop's 42px hit targets — trimming them is
       what lets the header bar itself get short. */
    .left-controls-wrapper button {
      min-height: 36px;
      padding: 5px 11px;
      font-size: 0.98rem;
    }

    .left-controls {
      display: none;
      flex-direction: column;
      align-items: stretch;
      gap: 3px;
      background: var(--left-panel-bg, #111111f0);
      padding: 12px;
      border-radius: 12px;
      position: fixed;
      top: calc(var(--controls-height, 56px) + 8px);
      left: 8px;
      right: auto;
      width: min(120px, calc(100vw - 16px));
      max-height: calc(100dvh - var(--controls-height, 56px) - 16px);
      overflow: auto;
      z-index: 1002;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    }

    /* The bg panel needs real room for its sliders — widen the whole
       menu column while it's open instead of squeezing the panel into
       the narrow button-width column (or letting it get clipped by
       this list's own overflow:auto escaping it). */
    .left-controls.bg-panel-open {
      width: min(260px, calc(100vw - 16px));
    }

    .left-controls > button,
    .left-controls > input,
    .left-controls > .mode-switcher,
    .left-controls > .add-block-menu,
    .left-controls > .bg-settings-wrap {
      width: 100%;
    }

    .left-controls > input {
      max-width: 100%;
      box-sizing: border-box;
    }

    .left-controls .thin-button-row {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .left-controls .thin-action-btn {
      width: 100%;
      min-width: 0;
    }
    .left-controls.show {
      display: flex;
    }
    .compact-toggle-btn {
      display: inline-flex;
    }

    .mobile-quick-actions {
      display: inline-flex;
    }

    .mobile-only {
      display: none;
    }

    .mobile-block-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 3px;
      width: 100%;
    }

    .simple-columns-control {
      display: none;
    }

    .mode-ladder,
    .add-block-list {
      position: fixed;
      top: calc(var(--controls-height, 56px) + 8px);
      left: 8px;
      right: auto;
      max-height: calc(100dvh - var(--controls-height, 56px) - 16px);
      overflow: auto;

    }

    .mode-ladder {
      width: min(220px, calc(100vw - 16px));
      min-width: 200px;
    }

    .add-block-list {
      width: min(140px, calc(100vw - 16px));
      min-width: 120px;
    }

    /* The bg panel expands inline in the mobile menu instead of floating
       as a detached popover — it's part of the same scrollable list as
       every other control here, so it should behave like one. */
    .bg-settings-wrap {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .bg-settings-wrap > button {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .bg-settings-wrap > button::after {
      content: '▾';
      font-size: 0.7rem;
      opacity: 0.7;
      transition: transform 0.15s ease;
    }

    .bg-settings-wrap > button.active::after {
      transform: rotate(180deg);
    }

    .bg-panel {
      position: static;
      width: 100%;
      box-sizing: border-box;
      margin-top: 6px;
    }

  }
</style>

<div class="left-controls-wrapper" style={leftCssVars}>
  <!-- Toggle button for <= 1024px -->
  {#if compactUI}


    <div class="mobile-quick-actions" bind:this={mobileQuickActionsRef}>
        <button
      class="compact-toggle-btn"
      bind:this={toggleRef}
      on:click={() => (showMobileMenu = !showMobileMenu)}
    >
      <ControlIcon name={showMobileMenu ? 'close' : 'menu'} />
      {showMobileMenu ? "Close" : "Menu"}
      </button>
      <div class="mode-switcher">
        <button
          bind:this={modeButtonRef}
          on:click={toggleModeMenu}
          aria-haspopup="listbox"
          aria-expanded={showModeLadder}
        >
          <ControlIcon name="mode" />
          Mode
        </button>
        {#if showModeLadder}
          <div class="mode-ladder" bind:this={modeMenuRef} role="listbox">
            {#each modeOptions as option}
              <button
                class:active={option.id === mode}
                on:click={() => selectMode(option.id)}
                role="option"
                aria-selected={option.id === mode}
                disabled={option.locked}
              >
                {option.label}
              </button>
            {/each}
            {#if !birthdayModeUnlocked}
              <div class="birthday-unlock">
                <small>Unlock birthday mode for 24 hours.</small>
                <div class="birthday-unlock-row">
                  <input type="password" bind:value={birthdayPassword} placeholder="Password" />
                  <button on:click={unlockBirthdayMode}>Unlock</button>
                </div>
                {#if birthdayUnlockMessage}
                  <small>{birthdayUnlockMessage}</small>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

    </div>
  {/if}

  <!-- Controls -->
  <div
    class="left-controls {showMobileMenu ? 'show' : ''}"
    class:bg-panel-open={hasModeBackground && bgPanelOpen}
    bind:this={menuRef}
  >
    <div class="mode-switcher mobile-only">
      <button
        bind:this={modeButtonDesktopRef}
        on:click={toggleModeMenu}
        aria-haspopup="listbox"
        aria-expanded={showModeLadder}
      >
        <ControlIcon name="mode" />
        {modeLabels?.[mode] ?? mode}
      </button>
      {#if showModeLadder}
        <div class="mode-ladder" bind:this={modeMenuDesktopRef} role="listbox">
          {#each modeOptions as option}
            <button
              class:active={option.id === mode}
              on:click={() => selectMode(option.id)}
              role="option"
              aria-selected={option.id === mode}
              disabled={option.locked}
            >
              {option.label}
            </button>
          {/each}
          {#if !birthdayModeUnlocked}
            <div class="birthday-unlock">
              <small>Unlock birthday mode for 24 hours.</small>
              <div class="birthday-unlock-row">
                <input type="password" bind:value={birthdayPassword} placeholder="Password" />
                <button on:click={unlockBirthdayMode}>Unlock</button>
              </div>
              {#if birthdayUnlockMessage}
                <small>{birthdayUnlockMessage}</small>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <div class="add-block-menu mobile-only">
      <button
        bind:this={addBlockButtonDesktopRef}
        on:click={toggleAddBlockMenu}
        aria-haspopup="listbox"
        aria-expanded={showAddBlockMenu}
      >
        <ControlIcon name="plus" />
        Add block
      </button>
      {#if showAddBlockMenu}
        <div class="add-block-list" bind:this={addBlockMenuDesktopRef} role="listbox">
          {#each addBlockDefinitions as blockDef}
            <button on:click={() => addBlock(blockDef.type)}>{blockDef.icon} {blockDef.label}</button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="thin-button-row">
      <button
        class="thin-action-btn"
        on:click={moveTowardsBottom}
        disabled={!focusedBlockId}
        aria-label="Move block down"
        title="Move block down"
      >
        <ControlIcon name="down" />
      </button>
      <button
        class="thin-action-btn"
        on:click={moveTowardsTop}
        disabled={!focusedBlockId}
        aria-label="Move block up"
        title="Move block up"
      >
        <ControlIcon name="up" />
      </button>
    </div>
    <button on:click={clear}><ControlIcon name="trash" /> Clear</button>
    <button on:click={exportJSON}><ControlIcon name="export" /> Export</button>
    <button on:click={triggerFileInput}><ControlIcon name="import" /> Import JSON</button>
    <button on:click={() => dispatch('undo')}><ControlIcon name="undo" /> Undo</button>
    <button on:click={() => dispatch('redo')}><ControlIcon name="redo" /> Redo</button>

    <div class="mobile-block-actions">
      {#each addBlockDefinitions as blockDef}
        <button on:click={() => addBlock(blockDef.type)}>{blockDef.icon} {blockDef.label}</button>
      {/each}
    </div>

    <input
      type="file"
      accept="application/json"
      on:change={importJSON}
      bind:this={fileInputRef}
      style="display: none"
    />
    <label class="file-name-field">
      <input bind:value={currentSaveName} placeholder="File name" />
    </label>
    {#if isSimpleNoteMode}
      <label class="simple-columns-control mobile-only">
        Columns
        <input
          type="range"
          min="1"
          max="6"
          step="1"
          value={simpleNoteColumnCount}
          on:input={handleSimpleColumnInput}
        />
        <span class="simple-columns-value">{simpleNoteColumnCount}</span>
      </label>
    {/if}

    {#if hasModeBackground}
      <div class="bg-settings-wrap">
        <button
          class:active={bgPanelOpen}
          on:click={() => (bgPanelOpen = !bgPanelOpen)}
        >
          Bg
        </button>
        {#if bgPanelOpen}
          <div class="bg-panel">
            <div class="bg-panel-row">
              <label class="bg-file-btn">
                {bgImage ? 'Change image' : 'Choose image'}
                <input type="file" accept="image/*" on:change={onBgFileChange} hidden />
              </label>
              {#if bgImage}
                <button class="bg-clear-btn" on:click={clearBgImage}>Remove</button>
              {/if}
            </div>
            {#if bgImage}
              <label class="bg-slider-row">
                <span>Opacity</span>
                <span class="bg-slider" style="--fill: {bgOpacity}%">
                  <input type="range" min="0" max="100" step="1" value={bgOpacity}
                    on:input={(e) => setBgSetting({ bgOpacity: Number(e.target.value) })} />
                </span>
                <span class="bg-val">{Math.round(bgOpacity)}%</span>
              </label>
              <label class="bg-slider-row">
                <span>Blur</span>
                <span class="bg-slider" style="--fill: {(bgBlur / 20) * 100}%">
                  <input type="range" min="0" max="20" step="1" value={bgBlur}
                    on:input={(e) => setBgSetting({ bgBlur: Number(e.target.value) })} />
                </span>
                <span class="bg-val">{bgBlur}px</span>
              </label>
              <label class="bg-slider-row">
                <span>Luminosity</span>
                <span class="bg-slider" style="--fill: {(bgLuminosity / 200) * 100}%">
                  <input type="range" min="0" max="200" step="1" value={bgLuminosity}
                    on:input={(e) => setBgSetting({ bgLuminosity: Number(e.target.value) })} />
                </span>
                <span class="bg-val">{Math.round(bgLuminosity)}%</span>
              </label>

              <div class="bg-slider-row">
                <span>Fit</span>
                <div class="bg-size-toggle">
                  <button class:active={bgSize === 'cover'} on:click={() => setBgSetting({ bgSize: 'cover' })}>Cover</button>
                  <button class:active={bgSize === 'contain'} on:click={() => setBgSetting({ bgSize: 'contain' })}>Contain</button>
                </div>
              </div>
            {/if}
            <!-- Outside the wallpaper condition on purpose: a picture pasted
                 into a note is whatever brightness it happened to be, and that
                 is worth turning down whether or not the folder has a
                 background. With none, following simply leaves them alone. -->
            <div class="bg-section-divider" role="presentation"></div>

            <label class="bg-check-row">
              <input
                type="checkbox"
                checked={imagesFollowBackground}
                on:change={(e) => setBgSetting({ imagesFollowBackground: e.target.checked })}
              />
              <span>Pictures in the note follow these</span>
            </label>

            {#if !imagesFollowBackground}
              <label class="bg-slider-row">
                <span>Picture opacity</span>
                <span class="bg-slider" style="--fill: {imageOpacity}%">
                  <input type="range" min="0" max="100" step="1" value={imageOpacity}
                    on:input={(e) => setBgSetting({ imageOpacity: Number(e.target.value) })} />
                </span>
                <span class="bg-val">{Math.round(imageOpacity)}%</span>
              </label>
              <label class="bg-slider-row">
                <span>Picture luminosity</span>
                <span class="bg-slider" style="--fill: {(imageLuminosity / 200) * 100}%">
                  <input type="range" min="0" max="200" step="1" value={imageLuminosity}
                    on:input={(e) => setBgSetting({ imageLuminosity: Number(e.target.value) })} />
                </span>
                <span class="bg-val">{Math.round(imageLuminosity)}%</span>
              </label>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

  </div>
</div>
