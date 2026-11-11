<script>
  import { onMount, onDestroy, tick, setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import { folderCard, pageCover } from './utils/folderDirectory.js';
  import { splitDrop } from './utils/dropKinds.js';
  import { readLayout, writeLayout, offeredModes, stripLayout, stripPick, gestureStart, inBarBand, isPhoneShape } from './utils/controlsLayout.js';
  import ModeIcon from './components/ModeIcon.svelte';
  import ControlsLayoutPage from './advanced-param/ControlsLayoutPage.svelte';
  import { playableAudio } from './utils/mp4Faststart.js';
  import { isTextEntry, undoTarget } from './utils/undoShortcut.js';
  import { canUndoText, canRedoText } from './utils/textHistory.js';
  import { settleTask, goalNow, startTimer as startGoalTimer, pauseTimer as pauseGoalTimer, addProgress } from './utils/taskGoals.js';
  import { answerRing } from './utils/taskGoalRings.js';
  import { HABITS_OWNER } from './utils/goalNotices.js';
  import { addressForAudio, releaseAudioAddress } from './utils/audioAddress.js';
  import RightControls from './advanced-param/RightControls.svelte';
  import LeftControls from './advanced-param/LeftControls.svelte';
  import AdvancedCssPage from './advanced-param/AdvancedCssPage.svelte';
  import ModeArea from './Modes/ModeSwitcher.svelte';
  import PlayerIcon from './components/PlayerIcons.svelte';
  import ControlIcon from './components/ControlIcon.svelte';
  import ScrollingText from './components/ScrollingText.svelte';
  import { SEE_THROUGH_PRESETS } from './utils/outlineTheme.js';
  import { EXTRA_PRESETS } from './utils/extraThemes.js';
  import AlarmRinger from './components/AlarmRinger.svelte';
  import ClockPopupWindows from './components/ClockPopupWindows.svelte';
  import TimerChip from './components/TimerChip.svelte';
  import { blockState, remountOnlyChanged, restoredVersions } from './utils/blockVersions.js';
  import { THEME_KEY as POPUP_THEME_KEY } from './utils/clockPopups.js';
  import {
    saveBlocks,
    loadBlocks,
    loadFolderNotes,
    deleteBlocks,
    listSavedBlocks,
    loadMusicTrack,
    saveMusicTrack,
    saveMusicCover,
    saveMusicLibrary,
    loadMusicLibrary,
    loadSaveMeta,
    loadAllSaveMeta,
    listFolderSnapshots,
    listBinEntries,
    putBinEntry,
    deleteBinEntry,
    putFolderSnapshots,
    deleteFolderSnapshot,
    describeLocalStorage
  } from './storage.js';
  import {
    isFirebaseConfigured,
    onAuthStateChange,
    signInWithGoogle,
    prewarmGoogleSignIn,
    signOutUser,
    loadRemoteFile,
    loadRemoteIndexEntry,
    loadRemoteIndex,
    saveRemoteFile,
    isSyncableFileId,
    subscribeRemoteIndex,
    checkSyncCompatibility,
    loadRemoteThemes,
    saveRemoteTheme,
    deleteRemoteTheme,
    sweepOrphanBlockAttachments,
    sweepStaleWallpapers,
    subscribeStorageUsage,
    subscribeAccountPlan,
    subscribeSubscription,
    deleteRemoteFile,
    binRemoteFile,
    firebaseConfig
  } from './firebaseClient.js';
  import { releaseChannel, channelName, channelBadge, versionLabel } from './utils/releaseChannel.js';
  import ExportDialog from './components/ExportDialog.svelte';
  import ImportDialog from './components/ImportDialog.svelte';
  import BinDialog from './components/BinDialog.svelte';
  import { binEntryOf, sortBin, restoreName, leaveInCloud, cloudDeletesAfterEmptying } from './utils/folderBin.js';
  import { cloudBinAction, newestBinEntry, stampOf, syncFingerprint } from './utils/cloudBin.js';
  import { uniqueName, buildExport, readExport, planImport } from './utils/folderTransfer.js';
  import { embedCloudFiles } from './utils/cloudFiles.js';
  import { extrasOf, withExtras, lookOf } from './utils/themeExtras.js';
  import { solidColor } from './utils/cssColor.js';
  import { deliverFile, isNativeAndroid as onAndroidApp, lastResult as deliveryLastResult } from './utils/fileDelivery.js';
  import { PENDING_DELETES_KEY, readPending, withPending, settlePending, deletesToRun } from './utils/folderMoves.js';
  import { reconcileThemes } from './utils/themeSync.js';
  import {
    themeKey,
    needsFullRepaint,
    paintAll,
    paintStale,
    unpaintAll
  } from './utils/themePainting.js';
  import {
    CONTROL_COLOR_DEFAULTS,
    BLOCK_THEME_DEFAULTS,
    CUSTOM_THEME_ID,
    DEFAULT_PREVIEW_BG,
    normalizeBlockTheme,
    normalizeControlColors
  } from './utils/themeDefaults.js';

  import {
    HATO_PRESETS,
    HATO_ID_PREFIX,
    hatoThemeId,
    isHatoBackground
  } from './utils/hatoTheme.js';

  import { MODE_DEFINITIONS, MODE_ORDER, getModeDefinition, hasWallpaper } from "./Modes/modeRegistry.js";
  import { getCanvasViewport } from './canvasState.js';
  import { getOpeningViewportBox } from './utils/canvasFit.js';
  import { clickOutside } from './utils/clickOutside.js';
  // Empty-versus-absent, folder-name validity and the rest of the sync rules
  // live in one plain module so they can be tested. See utils/syncRules.js.
  import { withoutEmptyValues, unpaintThemeColours } from './utils/syncRules.js';
  // Sync writes down what it decided, so a loop can be read back instead of
  // guessed at. See utils/syncLog.js.
  import { logSync, describeDifference, getSyncLog, persistNow } from './utils/syncLog.js';
  import { mayTakeSave, saveTarget, nameForUnnamedSave, saveChangesNothing } from './utils/saveScheduling.js';
  import { stalledLocks, anyHeld } from './utils/syncLocks.js';
  import { buildDiagnostics, formatDiagnostics } from './utils/diagnostics.js';
  // How long a typing save waits, and the ceiling that stops it waiting for
  // ever. See utils/saveScheduling.js.
  import { nextSaveDelay, saveVerdict } from './utils/saveScheduling.js';
  // Turns an SDK failure into something a person can act on. See
  // utils/syncErrors.js.
  import { explainSyncFailure, TOO_OLD_MESSAGE } from './utils/syncErrors.js';
  import { describeStorageUsage } from './utils/storageUsage.js';
  import { storageAnnouncement } from './utils/storageAlerts.js';
  import { attachmentVerdict, inlinePictureVerdict, freeSpaceBeforeSaving } from './utils/uploadAllowance.js';
  import { estimatedUsage, driftReport, describeDrift } from './utils/storageEstimate.js';
  import { usageForPlan } from './utils/planLimits.js';
  import { getReadableTextColor } from './utils/readableColor.js';
  // The wallpaper settings shared by Single Note and Canvas mode.
  import { BACKGROUND_DEFAULTS, normalizeBackgroundSettings, carryNotePictureSettings, usesPortraitBackground } from './utils/modeBackground.js';
  import { ensureMusicCover, forgetCoverlessTrack } from './utils/musicCovers.js';
  import { FOLDERS_ENTRY, packMusic, readMusicManifest, unpackMusic, mergeMusicLibrary } from './utils/musicTransfer.js';
  import { nowPlayingRecord } from './utils/nowPlaying.js';
  import {
    stepShuffle,
    rememberPlayed,
    prunePath,
    readPath,
    pathToStore,
    STORAGE_KEY as SHUFFLE_PATH_KEY,
    EMPTY as EMPTY_SHUFFLE
  } from './utils/shuffleHistory.js';
  import { steadyWallpaperHeight, isTyping, keyboardIsUp } from './utils/wallpaperViewport.js';
  import { screenshotFileName, canCopyImage, deliveryMessage, captureScale, screenScale, listCaptureHeight, withinTime, CAPTURE_DEADLINES, SCREENSHOT_EVENT } from './utils/screenshotDelivery.js';
  import { playerClickAction } from './utils/playerClicks.js';
  import { pasteKind, textChunks } from './utils/pasteIntent.js';
  import { sanitizeRichText } from './utils/sanitizeRichText.js';
  import { wallpaperPaint, wallpaperRect, isWallpaperLayer, wallpaperSettingsFor, WALLPAPER_LAYER_CLASSES, freshCopyUrl } from './utils/screenshotWallpaper.js';
  import { JOURNAL_KEY, journalEntry, appendLaunch } from './utils/storageJournal.js';
  import { normalizeHabits, habitsEqual, mergeDeviceHabits, describeHabitChange } from './utils/habitStore.js';
  import { settingsForHistory, settingsFromHistory } from './utils/undoableSettings.js';
  import { putOnPage, placeOnPage, samePage, editPage, isNarrow, normalizePageSettings } from './utils/pageLayout.js';
  import { NO_PLACES, visit, goBack, goForward, placesStillThere } from './utils/pagePlaces.js';
  import { folderIdOf } from './utils/folderIdentity.js';
  import { settingsForRename, settingsForCopy, settingsInPlaceOf } from './utils/folderIdentity.js';
  import { uploadVerdict, conflictCopyName, deviceKind, readSeen, writeSeen } from './utils/syncConflict.js';
  import { DEFAULT_MODE_SETTINGS, normalizeModeSettings as normalizeModeSettingsFrom } from './utils/modeSettings.js';
  import { settleHabits, withHabitGoal } from './utils/habitGoals.js';

  // Which Austavia this is -- the real one, staging, a preview of the site, or
  // the dev server -- and the one way it is shown: the tab's name, a badge,
  // and the version in diagnostics. Asked 2026-10-26; see
  // utils/releaseChannel.js. Fixed for the life of the page.
  const channel = releaseChannel({
    projectId: firebaseConfig?.projectId,
    hostname: typeof location === 'undefined' ? '' : location.hostname,
    dev: import.meta.env?.DEV === true
  });
  const channelBadgeText = channelBadge(channel);
  const shownVersion = versionLabel(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev', channel);
  if (typeof document !== 'undefined') document.title = channelName(channel);
  import {
    startupGate,
    releasedWithoutSyncing,
    shouldCheckOnReturn,
    GATE_TIMEOUT_MS,
    workspaceHeldBySync
  } from './utils/startupGate.js';
  import { owesUpload, shouldTakeCloudCopy, receivedFromCloud, editedDuringDownload, aheadOfCloud } from './utils/syncOwing.js';
  import {
    worthKeeping as folderSnapshotWorthKeeping,
    snapshotOf as folderSnapshotOf,
    withSnapshot as withFolderSnapshot,
    emptiesFolder
  } from './utils/folderSnapshots.js';
  import {
    STORAGE_KEY as TYPE_SCALE_STORAGE_KEY,
    MOBILE_BREAKPOINT as TYPE_SCALE_MOBILE_BREAKPOINT,
    DEFAULT_SCALES,
    readScales,
    withScale,
    cssScaleFor,
    scalesToStore
  } from './utils/typeScale.js';
  import {
    startBackgroundAudio,
    stopBackgroundAudio,
    setBackgroundAudioActions,
    notificationDiagnostics
  } from './utils/backgroundAudio.js';
  import { worthReporting } from './utils/playbackPosition.js';
  import { coverForNotification } from './utils/coverArtwork.js';
  import { shouldShowNotification, dismissalFor } from './utils/notificationPresence.js';
  import { notePictureArrived, NOTHING_YET } from './utils/picturePasteReport.js';
  const BLOCK_THEME_STORAGE_KEY = 'blockTheme';
  const BLOCK_THEME_ID_STORAGE_KEY = 'blockThemeId';
  const CUSTOM_THEMES_STORAGE_KEY = 'customThemes';
  // The theme's pop-up backing, player veil and the rest -- see utils/themeExtras.js.
  const THEME_EXTRAS_STORAGE_KEY = 'themeExtras';

  const MOBILE_BREAKPOINT = 1024;

  const MEDIA_HEADER_HEIGHT = 30;
  const MEDIA_DEFAULT_WIDTH = 300;
  const MEDIA_DEFAULT_HEIGHT = 200;
  const MEDIA_FALLBACK_MAX_WIDTH = 400;
  const MEDIA_FALLBACK_MAX_HEIGHT = 300;
  // Margin below 1.0 so a newly placed media block reads as "fit to view"
  // without touching the edges of the screen.
  const MEDIA_FIT_MARGIN = 0.94;

  function getDefaultModeForViewport() {
    if (typeof window === 'undefined') return 'default';
    return window.innerWidth <= MOBILE_BREAKPOINT ? 'simple' : 'default';
  }


  function toCssVarName(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  }

  const STYLE_PRESETS = [
    {
      id: 'default-dark',
      name: 'Default Dark',
      description: 'Original midnight look with subtle neon glow.',
      controlColors: CONTROL_COLOR_DEFAULTS,
      blockTheme: normalizeBlockTheme({
        focusOutline: 'transparent',
        focusShadow: 'none'
      }),
      previewBg: 'rgba(16, 16, 20, 0.82)',
      blockDefaults: { bgColor: '#000000', textColor: '#ffffff' }
    },
    {
      id: 'aurora-glass',
      name: 'Aurora Glass',
      description: 'Frosted glass blocks with cyan lighting and cool controls.',
      controlColors: {
        left: {
          panelBg: '#06131fdd',
          textColor: '#e9fbff',
          buttonBg: '#0f2743',
          buttonText: '#7be0ff',
          borderColor: '#1a3a5f',
          inputBg: '#081a2f'
        },
        right: {
          panelBg: '#0a1727f0',
          textColor: '#e9fbff',
          buttonBg: '#10213a',
          buttonText: '#7be0ff',
          borderColor: '#1f3554'
        },
        canvas: {
          outerBg: '#050b14',
          innerBg: '#050b14'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: 'rgba(96, 210, 255, 0.35)',
        borderRadius: '18px',
        shadow:
          '0 30px 60px rgba(18, 56, 92, 0.65), 0 0 28px rgba(96, 210, 255, 0.32)',
        headerBg: 'linear-gradient(135deg, rgba(8, 32, 58, 0.95), rgba(14, 52, 82, 0.9))',
        headerText: '#7be0ff',
        headerFont: "'Chakra Petch', 'Segoe UI', sans-serif",
        headerLetterSpacing: '0.12em',
        bodyFont: "'Source Sans 3', 'Inter', sans-serif",
        accentColor: '#7be0ff',
        accentText: '#051320',
        mediaButtonBg: 'rgba(123, 224, 255, 0.18)',
        mediaButtonText: '#7be0ff'
      }),
      previewBg: 'rgba(8, 24, 38, 0.82)',
      blockDefaults: { bgColor: '#08202f', textColor: '#7be0ff' }
    },
    {
      id: 'paper-notebook',
      name: 'Paper Notebook',
      description: 'Warm stationery palette with serif typography and clean no-shadow blocks.',
      controlColors: {
        left: {
          panelBg: '#f6f0e8',
          textColor: '#4a3725',
          buttonBg: '#e4d6c8',
          buttonText: '#4a3725',
          borderColor: '#cdb9a6',
          inputBg: '#fff9f2'
        },
        right: {
          panelBg: '#fefbf7',
          textColor: '#4a3725',
          buttonBg: '#ead9c8',
          buttonText: '#4a3725',
          borderColor: '#d8c7b6'
        },
        canvas: {
          outerBg: '#f9f4ed',
          innerBg: '#f9f4ed'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: '#d3c2b4',
        borderWidth: '2px',
        borderRadius: '16px',
        shadow: 'none',
        focusOutline: '#b5835a',
        focusShadow: '0 0 0 2px rgba(181, 131, 90, 0.35), 0 0 14px rgba(181, 131, 90, 0.45)',
        headerBg: 'linear-gradient(120deg, #f9f2e8, #f0e2d2)',
        headerText: '#4a3725',
        headerFont: "'Cormorant Garamond', 'Georgia', serif",
        headerLetterSpacing: '0.02em',
        headerTransform: 'none',
        bodyFont: "'EB Garamond', 'Georgia', serif",
        accentColor: '#b05d3e',
        accentText: '#fff8f3',
        mediaButtonBg: '#e8d6c7',
        mediaButtonText: '#4a3725'
      }),
      previewBg: '#f8efe3',
      blockDefaults: { bgColor: '#fffaf2', textColor: '#4a3725' }
    },
    {
      id: 'redline',
      name: 'Redline',
      description: 'Pure black with hairline red edges and a warning-light glow.',
      controlColors: {
        left: {
          panelBg: '#0b0708ee',
          textColor: '#ffe4e4',
          buttonBg: '#1a0e10',
          buttonText: '#ff5c5c',
          borderColor: '#40161a',
          inputBg: '#120a0b'
        },
        right: {
          panelBg: '#0d0809f2',
          textColor: '#ffe4e4',
          buttonBg: '#1c1012',
          buttonText: '#ff5c5c',
          borderColor: '#4a1a1f'
        },
        canvas: {
          outerBg: '#000000',
          innerBg: '#000000'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: 'rgba(255, 92, 92, 0.5)',
        borderWidth: '1px',
        borderRadius: '10px',
        shadow: '0 18px 40px rgba(0, 0, 0, 0.7), 0 0 16px rgba(255, 45, 45, 0.28)',
        focusOutline: '#ff2d2d',
        focusShadow: '0 0 0 2px rgba(255, 45, 45, 0.4), 0 0 14px rgba(255, 45, 45, 0.55)',
        headerText: '#ff5c5c',
        headerFont: "'Chakra Petch', 'Segoe UI', sans-serif",
        headerLetterSpacing: '0.14em',
        accentColor: '#ff2d2d',
        accentText: '#100303',
        mediaButtonBg: 'rgba(255, 92, 92, 0.16)',
        mediaButtonText: '#ff5c5c'
      }),
      previewBg: '#070405',
      blockDefaults: { bgColor: '#0a0607', textColor: '#ff5c5c' }
    },
    {
      id: 'copper-lagoon',
      name: 'Copper Lagoon',
      description: 'Warm maroon and brown grounds lit by turquoise highlights.',
      controlColors: {
        left: {
          panelBg: '#2a1512ee',
          textColor: '#f3e2dc',
          buttonBg: '#3d201b',
          buttonText: '#4fd6cd',
          borderColor: '#5a2f27',
          inputBg: '#331a16'
        },
        right: {
          panelBg: '#2e1714f2',
          textColor: '#f3e2dc',
          buttonBg: '#42231d',
          buttonText: '#4fd6cd',
          borderColor: '#63342b'
        },
        canvas: {
          outerBg: '#1d0e0c',
          innerBg: '#1d0e0c'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: 'rgba(79, 214, 205, 0.38)',
        borderRadius: '14px',
        shadow: '0 22px 48px rgba(20, 8, 6, 0.7), 0 0 20px rgba(79, 214, 205, 0.18)',
        focusOutline: '#4fd6cd',
        focusShadow: '0 0 0 2px rgba(79, 214, 205, 0.35), 0 0 14px rgba(79, 214, 205, 0.5)',
        headerText: '#4fd6cd',
        headerFont: "'Inter', system-ui, sans-serif",
        headerLetterSpacing: '0.08em',
        accentColor: '#4fd6cd',
        accentText: '#10302e',
        mediaButtonBg: 'rgba(79, 214, 205, 0.16)',
        mediaButtonText: '#4fd6cd'
      }),
      previewBg: '#2a1512',
      blockDefaults: { bgColor: '#3a1d18', textColor: '#6fe3dc' }
    },
    {
      id: 'neon-orchid',
      name: 'Neon Orchid',
      description: 'Deep purple night broken by hot fuchsia signage.',
      controlColors: {
        left: {
          panelBg: '#180a20ee',
          textColor: '#f6e6fb',
          buttonBg: '#26103048',
          buttonText: '#ff5cc8',
          borderColor: '#3d1a4d',
          inputBg: '#1e0c28'
        },
        right: {
          panelBg: '#1b0b24f2',
          textColor: '#f6e6fb',
          buttonBg: '#2a1236',
          buttonText: '#ff5cc8',
          borderColor: '#452055'
        },
        canvas: {
          outerBg: '#100616',
          innerBg: '#100616'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: 'rgba(255, 92, 200, 0.42)',
        borderRadius: '16px',
        shadow: '0 26px 54px rgba(12, 3, 18, 0.72), 0 0 24px rgba(255, 62, 200, 0.28)',
        focusOutline: '#ff3ec8',
        focusShadow: '0 0 0 2px rgba(255, 62, 200, 0.38), 0 0 16px rgba(255, 62, 200, 0.55)',
        headerText: '#ff5cc8',
        headerFont: "'Chakra Petch', 'Segoe UI', sans-serif",
        headerLetterSpacing: '0.12em',
        accentColor: '#ff3ec8',
        accentText: '#1a0417',
        mediaButtonBg: 'rgba(255, 92, 200, 0.18)',
        mediaButtonText: '#ff5cc8'
      }),
      previewBg: '#1a0a22',
      blockDefaults: { bgColor: '#240d30', textColor: '#ff7ada' }
    },
    {
      id: 'ember-slate',
      name: 'Ember Slate',
      description: 'Cool graphite panels with a warm amber ember running through.',
      controlColors: {
        left: {
          panelBg: '#14181dee',
          textColor: '#e8edf2',
          buttonBg: '#1e242c',
          buttonText: '#ffb454',
          borderColor: '#2c343e',
          inputBg: '#181d23'
        },
        right: {
          panelBg: '#161b21f2',
          textColor: '#e8edf2',
          buttonBg: '#212831',
          buttonText: '#ffb454',
          borderColor: '#333c47'
        },
        canvas: {
          outerBg: '#0d1116',
          innerBg: '#0d1116'
        }
      },
      blockTheme: normalizeBlockTheme({
        borderColor: 'rgba(255, 180, 84, 0.32)',
        borderRadius: '12px',
        shadow: '0 20px 44px rgba(4, 8, 12, 0.7), 0 0 18px rgba(255, 180, 84, 0.16)',
        focusOutline: '#ffb454',
        focusShadow: '0 0 0 2px rgba(255, 180, 84, 0.35), 0 0 14px rgba(255, 180, 84, 0.5)',
        headerText: '#ffb454',
        headerFont: "'Inter', system-ui, sans-serif",
        headerLetterSpacing: '0.07em',
        accentColor: '#ffb454',
        accentText: '#1b1206',
        mediaButtonBg: 'rgba(255, 180, 84, 0.15)',
        mediaButtonText: '#ffb454'
      }),
      previewBg: '#161b21',
      blockDefaults: { bgColor: '#1b2129', textColor: '#ffb454' }
    },
    // More ordinary themes -- see utils/extraThemes.js.
    ...EXTRA_PRESETS,
    // Guest theme, meant to be pulled back out later — see utils/hatoTheme.js.
    ...HATO_PRESETS,
    // The see-through family last and together, so the list reads as two
    // groups: "around here are all the low-opacity ones" (2026-09-27). See
    // utils/outlineTheme.js.
    ...SEE_THROUGH_PRESETS
  ];

  const CONTROL_COLOR_STORAGE_KEY = 'controlColors';
  const LAST_SAVE_STORAGE_KEY = 'lastLoadedSave';
  const BOOT_LOAD_GUARD_STORAGE_KEY = 'bootLoadGuard';
  const CLOUD_SYNC_MEMORY_STORAGE_KEY = 'cloudSyncMemoryByFile';
  const AUTO_SYNC_ENABLED_STORAGE_KEY = 'autoSyncEnabled';
  // Which account the files currently in local storage belong to. Without it,
  // signing into a second account would push the first account's files up to
  // it, because bootstrap treats whatever is on this device as "mine".
  const SYNCED_UID_STORAGE_KEY = 'syncedUid';
  const LAST_MODE_STORAGE_KEY = 'lastMode';
  // App-wide counterpart to the per-file blocksFollowTheme switch: a device
  // preference, so it isn't carried between folders by sync.
  const BLOCKS_FOLLOW_THEME_ALL_KEY = 'blocksFollowThemeAllFolders';
  const MUSIC_VOLUME_KEY = 'musicVolume';
  const MUSIC_SHUFFLE_KEY = 'musicShuffle';
  // What was playing and how far in, so a reload or a fresh launch can pick the
  // listening session back up where it stopped.
  const MUSIC_RESUME_KEY = 'musicResume';
  const FALLBACK_SAVE_NAME = 'Fallback';

  function readStoredBackground(value) {
    if (typeof value !== 'string' || isHatoBackground(value)) return '';
    return value;
  }

  // What a folder's mode settings are, worked out in utils/modeSettings.js,
  // where a test can reach it. The wallpaper rule (readStoredBackground) is
  // this app's and is handed in.
  function normalizeModeSettings(settings) {
    return normalizeModeSettingsFrom(settings, { keepImage: readStoredBackground });
  }

  function loadStoredCustomThemes() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const serialized = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
      if (!serialized) return [];
      const parsed = JSON.parse(serialized);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(theme => theme && theme.id && theme.name)
        .map(theme => ({
          ...theme,
          controlColors: normalizeControlColors(theme.controlColors),
          blockTheme: normalizeBlockTheme(theme.blockTheme),
          isCustom: true
        }));
    } catch (error) {
      return [];
    }
  }

  function loadStoredControlColors() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const serialized = localStorage.getItem(CONTROL_COLOR_STORAGE_KEY);
      if (!serialized) return null;
      const parsed = JSON.parse(serialized);
      return normalizeControlColors(parsed);
    } catch (error) {
      return null;
    }
  }

  function loadStoredBlockTheme() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const serializedTheme = localStorage.getItem(BLOCK_THEME_STORAGE_KEY);
      const storedId =
        localStorage.getItem(BLOCK_THEME_ID_STORAGE_KEY) || CUSTOM_THEME_ID;
      if (!serializedTheme) {
        return { theme: null, id: storedId };
      }
      const parsed = JSON.parse(serializedTheme);
      return { theme: normalizeBlockTheme(parsed), id: storedId };
    } catch (error) {
      return null;
    }
  }

  function loadStoredLastSaveName() {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(LAST_SAVE_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function persistLastSaveName(name) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (name) {
        localStorage.setItem(LAST_SAVE_STORAGE_KEY, name);
      } else {
        localStorage.removeItem(LAST_SAVE_STORAGE_KEY);
      }
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function loadBootLoadGuard() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(BOOT_LOAD_GUARD_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const pendingSaveName = typeof parsed.pendingSaveName === 'string'
        ? parsed.pendingSaveName
        : '';
      const startedAt = Number(parsed.startedAt);
      if (!pendingSaveName || !Number.isFinite(startedAt)) return null;
      const openingLastFile = parsed.openingLastFile === true;
      return { pendingSaveName, startedAt, openingLastFile };
    } catch (error) {
      return null;
    }
  }

  function startBootLoadGuard(pendingSaveName) {
    if (typeof localStorage === 'undefined' || !pendingSaveName) return;
    try {
      localStorage.setItem(
        BOOT_LOAD_GUARD_STORAGE_KEY,
        JSON.stringify({ pendingSaveName, startedAt: Date.now(), openingLastFile: true })
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function clearBootLoadGuard() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(BOOT_LOAD_GUARD_STORAGE_KEY);
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function loadCloudSyncMemory() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(CLOUD_SYNC_MEMORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  // The slider position and the loudness are not the same number.
  //
  // Setting the player's volume straight from the slider spends almost all of
  // the travel on nothing: hearing is roughly logarithmic, so 100% and 25%
  // sound much alike while everything you can actually distinguish is crushed
  // into the bottom of the bar. Squaring the position spreads the audible range
  // across the whole slider, which is what leaves the comfortable setting
  // somewhere near the middle instead of pinned at the bottom.
  const MUSIC_VOLUME_CURVE = 2;

  function gainForVolume(position) {
    return position ** MUSIC_VOLUME_CURVE;
  }

  // Half way. Squared, that is the same loudness the old quarter setting gave,
  // so nothing gets louder — the number under the slider simply stops lying
  // about where the useful range is.
  const DEFAULT_MUSIC_VOLUME = 0.5;

  // Positions used to be loudness directly. Read one of those as a position and
  // the music would drop, having been squared a second time, so an old setting
  // is converted once to the position that sounds the same as before.
  const MUSIC_VOLUME_CURVE_KEY = 'musicVolumeCurved';

  function loadMusicVolume() {
    if (typeof localStorage === 'undefined') return DEFAULT_MUSIC_VOLUME;
    // Read as a string first: Number(null) is 0, so a missing key would
    // otherwise start every fresh install silently muted.
    const raw = localStorage.getItem(MUSIC_VOLUME_KEY);
    if (raw === null || raw === '') return DEFAULT_MUSIC_VOLUME;
    const stored = Number(raw);
    if (!Number.isFinite(stored) || stored < 0 || stored > 1) return DEFAULT_MUSIC_VOLUME;

    let alreadyCurved = false;
    try { alreadyCurved = localStorage.getItem(MUSIC_VOLUME_CURVE_KEY) === '1'; } catch { /* ignore */ }
    if (alreadyCurved) return stored;

    const converted = Math.sqrt(stored);
    try {
      localStorage.setItem(MUSIC_VOLUME_KEY, String(converted));
      localStorage.setItem(MUSIC_VOLUME_CURVE_KEY, '1');
    } catch { /* ignore */ }
    return converted;
  }

  function persistMusicVolume(value) {
    try { localStorage.setItem(MUSIC_VOLUME_KEY, String(value)); } catch { /* ignore */ }
  }

  function loadMusicResume() {
    try {
      const raw = localStorage.getItem(MUSIC_RESUME_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed.trackId === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
  function persistMusicResume(state) {
    try {
      if (state) localStorage.setItem(MUSIC_RESUME_KEY, JSON.stringify(state));
      else localStorage.removeItem(MUSIC_RESUME_KEY);
    } catch { /* ignore */ }
  }

  function loadMusicShuffle() {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(MUSIC_SHUFFLE_KEY) === 'true';
  }

  function persistMusicShuffle(value) {
    try { localStorage.setItem(MUSIC_SHUFFLE_KEY, value ? 'true' : 'false'); } catch { /* ignore */ }
  }

  function loadLastMode() {
    if (typeof localStorage === 'undefined') return '';
    try {
      return localStorage.getItem(LAST_MODE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function persistLastMode(nextMode) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LAST_MODE_STORAGE_KEY, nextMode);
    } catch {
      /* ignore persistence failures */
    }
  }

  function loadBlocksFollowThemeAll() {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(BLOCKS_FOLLOW_THEME_ALL_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function persistBlocksFollowThemeAll(value) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(BLOCKS_FOLLOW_THEME_ALL_KEY, value ? 'true' : 'false');
    } catch {
      /* ignore persistence failures */
    }
  }

  // How big the writing is, as a pair: one size for a window the size of a
  // computer's and one for a phone's. Which of the two is in force is decided
  // by the width on screen rather than by the platform -- see
  // utils/typeScale.js, where that choice and its reasons live.
  //
  // Kept on this device, like the other app-wide preferences above it. The cost
  // is that setting the phone's size from a computer does not reach the phone;
  // the alternative is a synced preference whose two halves each belong to a
  // different machine, which is a thing sync has no way to think about.
  let typeScales = { ...DEFAULT_SCALES };

  function loadTypeScales() {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SCALES };
    try {
      return readScales(localStorage.getItem(TYPE_SCALE_STORAGE_KEY));
    } catch {
      return { ...DEFAULT_SCALES };
    }
  }

  function persistTypeScales(scales) {
    if (typeof localStorage === 'undefined') return;
    try {
      // Through the module, which stamps what the numbers mean. Without that a
      // pair written now is indistinguishable from one written before the base
      // existed, and would be rebased a second time on the next read.
      localStorage.setItem(TYPE_SCALE_STORAGE_KEY, JSON.stringify(scalesToStore(scales)));
    } catch {
      /* ignore persistence failures */
    }
  }

  // Written onto the root element rather than into a stylesheet, because the
  // value is a preference and the stylesheet is a build artefact. app.css reads
  // it as `font-size: calc(100% * var(--type-scale))`.
  function applyTypeScale() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    // The base for the width on screen, times where the slider sits. app.css
    // carries the base on its own for the first paint; this replaces it with
    // the real product as soon as there is one.
    const multiplier = cssScaleFor({ width: window.innerWidth, scales: typeScales });
    document.documentElement.style.setProperty('--type-scale', String(multiplier));
  }

  function handleTypeScaleChange(event) {
    typeScales = withScale(typeScales, event.detail || {});
    persistTypeScales(typeScales);
    applyTypeScale();
  }

  // Which of the two sizes is in force is a function of the window, and the
  // window changes without anybody touching the setting: rotated, resized,
  // dragged to another monitor, or shrunk by a keyboard sliding up.
  //
  // A `resize` listener on its own is an event path, and an event path is only
  // ever as right as the last event it heard. So there are several, they are
  // deliberately overlapping, and every one of them works the answer out again
  // from the window rather than nudging it -- which is what makes it safe to
  // run at any moment and safe to run twice.
  //
  //   resize, orientationchange  the window changing under the app
  //   the media query            the one question actually being asked, and it
  //                              is answered by the browser rather than by
  //                              arithmetic on a width
  //   visibilitychange           the look-again: whatever changed while the app
  //                              was in the background, nobody was listening for
  //   ResizeObserver             the page's own box, for a change that resizes
  //                              the view without resizing the window
  //
  // None of these is load-bearing alone, and that is the point.
  function watchTypeScale() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

    const recompute = () => applyTypeScale();
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    document.addEventListener('visibilitychange', recompute);

    // The same breakpoint the module decides on, asked of the browser. Kept in
    // step by importing it rather than by typing 1024 again.
    const query = window.matchMedia?.(`(max-width: ${TYPE_SCALE_MOBILE_BREAKPOINT}px)`);
    query?.addEventListener?.('change', recompute);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(recompute);
      observer.observe(document.documentElement);
    }

    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
      document.removeEventListener('visibilitychange', recompute);
      query?.removeEventListener?.('change', recompute);
      observer?.disconnect();
    };
  }

  /**
   * Keep what a folder held, before something else replaces it.
   *
   * Called at the two places a cloud copy is written over a local one. The
   * deciding -- whether anything is actually being lost, how many to keep, how
   * much room they may take -- is in utils/folderSnapshots.js; this is the part
   * that has a database.
   *
   * It never throws. Losing the snapshot is bad; refusing to apply the
   * download because the snapshot failed would be worse, and would leave the
   * folder in the one state nobody asked for.
   */
  async function keepReplacedCopy(fileName, current, incoming, reason) {
    try {
      if (!folderSnapshotWorthKeeping({ current, incoming })) return;
      const snapshot = folderSnapshotOf(current, { takenAt: Date.now(), ...(reason ? { reason } : {}) });
      const kept = withFolderSnapshot(await listFolderSnapshots(fileName), snapshot);
      await putFolderSnapshots(fileName, kept);
      // Both sides, not just the one being kept.
      //
      // "I added a picture and it vanished" looks like nothing in a log that
      // only says a copy was kept. It is obvious the moment the line says a
      // folder of three blocks was replaced by one of two -- and losing blocks
      // to a copy from elsewhere is loud enough to be worth an error rather
      // than a note, even when it is the correct thing to have done.
      const incomingBlocks = Array.isArray(incoming?.blocks) ? incoming.blocks.length : 0;
      const lostBlocks = snapshot.blockCount > incomingBlocks;
      logSync(lostBlocks ? 'error' : 'snapshot', fileName, reason
        ? `kept the copy first: ${reason}`
        : lostBlocks
        ? 'the copy that arrived has fewer blocks than the one it replaced'
        : 'kept the copy this replaced', {
        blocks: snapshot.blockCount,
        becomes: incomingBlocks,
        characters: snapshot.characterCount,
        nowKeeping: kept.length
      });
    } catch (error) {
      console.error('Could not keep the replaced copy of', fileName, error);
    }
  }

  /** Puts a kept copy back, as an ordinary local save so it syncs onward. */
  async function restoreFolderSnapshot(fileName, takenAt) {
    const snapshots = await listFolderSnapshots(fileName);
    const found = snapshots.find((snapshot) => Number(snapshot?.takenAt) === Number(takenAt));
    if (!found?.payload) return false;

    // The copy on its way out is kept too, so restoring is itself undoable --
    // picking the wrong one from the list must not be the end of the matter.
    const current = await loadBlocks(fileName);
    await keepReplacedCopy(fileName, current, found.payload);

    // Stamped now, deliberately. A restore is a decision made on this device at
    // this moment, and giving it the old stamp would have every other device
    // ignore it as stale -- which is the failure this whole feature exists for.
    await saveBlocks(fileName, {
      blocks: found.payload.blocks,
      modeOrders: found.payload.modeOrders,
      modeSettings: found.payload.modeSettings
    });
    logSync('restore', fileName, 'put back a kept copy', {
      takenAt,
      blocks: found.blockCount,
      characters: found.characterCount
    });

    savedList = await listSavedBlocks();
    autoSyncDirty = true;
    if (fileName === currentSaveName) await remountCurrentSaveIfLoaded();
    return true;
  }

  // Read when the Advanced page opens, and again after anything changes it.
  // Not held live: a list of replaced copies is looked at rarely and reading it
  // on every sync tick would be work nobody asked for.
  let folderSnapshots = [];

  async function refreshFolderSnapshots() {
    try {
      folderSnapshots = currentSaveName ? await listFolderSnapshots(currentSaveName) : [];
    } catch {
      folderSnapshots = [];
    }
  }

  async function handleRestoreSnapshot(event) {
    const takenAt = event.detail?.takenAt;
    if (!takenAt) return;
    const restored = await restoreFolderSnapshot(currentSaveName, takenAt);
    await refreshFolderSnapshots();
    if (!restored) await appAlert('That copy could not be found any more.');
  }

  async function handleForgetSnapshot(event) {
    const takenAt = event.detail?.takenAt;
    if (!takenAt) return;
    folderSnapshots = await deleteFolderSnapshot(currentSaveName, takenAt);
  }

  // Held shut until the cloud copy is here, so nothing can be written against
  // the old one. Both halves of the condition -- an account, and auto sync --
  // are read from this device rather than waited on, so the hold is in place on
  // the first frame instead of after Firebase has finished waking up. See
  // utils/startupGate.js for what lifts it, of which the timeout matters most.
  let gateStartedAt = Date.now();
  let gateWaitedMs = 0;
  let gateTimer = null;
  let gateOutcomeLogged = false;
  const remembersAccount = Boolean(loadSyncedUid());
  const wasOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  let deviceOnline = wasOnline();

  $: workspaceGate = startupGate({
    remembersAccount,
    autoSyncEnabled,
    firebaseConfigured: firebaseReady,
    authResolved: authStateResolved,
    signedIn: Boolean(authUser),
    bootstrapComplete: cloudBootstrapComplete,
    online: deviceOnline,
    waitedMs: gateWaitedMs
  });

  // Mounting is what the request was about: pointer-events on a mounted mode
  // still leaves an editor holding a document, and the lock only ever covered
  // the part after Firebase had answered anyway.
  $: workspaceHeld = workspaceHeldBySync({
    gateHolds: workspaceGate.hold,
    bootstrapping: cloudBootstrapInProgress,
    gating: cloudSyncGateInProgress,
    resuming: resumeCheckInProgress,
    online: deviceOnline
  });

  $: gateMessage = cloudBootstrapInProgress || cloudSyncGateInProgress
    ? 'Syncing with the cloud… editing resumes in a moment.'
    : resumeCheckInProgress
      ? 'Checking for newer work…'
      : `Checking for newer work before you start… (${workspaceGate.reason})`;

  // The wait is counted from a plain interval rather than a reactive block.
  // Reactively starting a timer that writes the value the gate reads is a cycle
  // -- workspaceGate depends on gateWaitedMs, the block that sets gateWaitedMs
  // depends on workspaceGate -- and Svelte refuses to compile it. Started once
  // on mount, it ticks one direction only and stops itself when the gate opens.
  function countTheWait() {
    if (typeof window === 'undefined') return;
    gateStartedAt = Date.now();
    gateTimer = window.setInterval(() => {
      gateWaitedMs = Date.now() - gateStartedAt;
      if (!workspaceGate.hold) {
        clearInterval(gateTimer);
        gateTimer = null;
      }
    }, 250);
  }

  // Said once, when it settles. A release that gave up rather than succeeded
  // means this device is about to be written against a copy nobody checked,
  // which is the state the gate exists to avoid.
  // Not while the bootstrap is still fetching: the workspace stays held by it
  // either way, so saying "started editing without checking" would be both
  // alarming and untrue. Seen on a phone fetching a folder with a picture in
  // it, where eight seconds is not long.
  $: if (
    !workspaceGate.hold
    && !gateOutcomeLogged
    && !cloudBootstrapInProgress
    && remembersAccount
    && autoSyncEnabled
  ) {
    gateOutcomeLogged = true;
    logSync(
      releasedWithoutSyncing(workspaceGate.reason) ? 'error' : 'skip',
      currentSaveName,
      releasedWithoutSyncing(workspaceGate.reason)
        ? 'started editing without checking the cloud first'
        : 'workspace opened',
      { reason: workspaceGate.reason, waitedMs: gateWaitedMs }
    );
  }

  /**
   * Where a picture handed over by the Android keyboard arrives.
   *
   * A keyboard inserts a picture through `InputConnection.commitContent`, not
   * through the clipboard, so none of the paste handling sees it. The Android
   * side reads the bytes and calls this with a data URL; see
   * ImagePasteWebView.java for the half that declares the app accepts pictures
   * at all, which is what the keyboard was complaining about.
   *
   * Put on `window` because a native `evaluateJavascript` has nothing else to
   * call. Returns a string rather than throwing, so the Android side can say
   * whether it worked without parsing an exception.
   */
  /** What the page has heard from the keyboard, for the diagnostics report. */
  let keyboardPictures = NOTHING_YET;

  function receivePictureFromKeyboard(dataUrl) {
    // Recorded whatever happens next, because "the page never heard" and "the
    // page heard and refused it" are different faults that look the same.
    const outcome = takePictureFromKeyboard(dataUrl);
    keyboardPictures = notePictureArrived(keyboardPictures, {
      outcome,
      chars: typeof dataUrl === 'string' ? dataUrl.length : 0
    });
    return outcome;
  }

  function takePictureFromKeyboard(dataUrl) {
    try {
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return 'not a picture';

      // Into whatever is being written in, if anything is. The editor keeps its
      // own reference on the element, which is how the paste handler reaches it
      // too.
      const writing = document.activeElement?.closest?.('.ProseMirror');
      if (writing?.editor) {
        writing.editor.chain().focus().setImage({ src: dataUrl }).run();
        return 'inserted';
      }

      // Nothing focused: it becomes a picture block, which is what pasting one
      // outside a note already does.
      const blob = dataUrlToBlobForPaste(dataUrl);
      if (!blob) return 'unreadable';
      addImageBlockFromFile(new File([blob], `pasted-${Date.now()}.png`, { type: blob.type }));
      return 'added as a block';
    } catch (error) {
      console.error('Could not take a picture from the keyboard:', error);
      return 'failed';
    }
  }

  /**
   * Stops anything that would change the folder while it is being checked.
   *
   * `beforeinput` is the one that matters: typing, deleting, pasting, dropping
   * and undo all announce themselves through it, so refusing it there covers
   * every way writing happens without having to guess at keys. The rest are
   * belt and braces for the paths that do not go through an editor.
   *
   * Capture phase, so it lands before the editor's own handlers rather than
   * after they have already acted.
   */
  function refuseWhileHeld(event) {
    if (!workspaceHeld) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function dataUrlToBlobForPaste(dataUrl) {
    const [meta, encoded] = String(dataUrl).split(',', 2);
    if (!encoded) return null;
    const type = /data:([^;]+)/.exec(meta)?.[1] || 'image/png';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  /**
   * How tall a wallpaper should be drawn, which is not always how tall the
   * window is.
   *
   * The Android keyboard genuinely shrinks the page -- deliberately, so the
   * controls stay reachable and the caret stays on screen -- and a picture
   * sized to cover a box that just got shorter is re-fitted into it, which
   * looks exactly like the picture jumping upwards. So the modes draw their
   * wallpaper at this height instead of at their own, and it holds still while
   * something is being typed into. See utils/wallpaperViewport.js.
   */
  let wallpaperHeight = 0;
  let wallpaperWidth = 0;
  /**
   * Whether the on-screen keyboard is covering the bottom of the screen.
   *
   * Read from the same measurement the wallpaper is held by, because it is the
   * same event seen from two sides: the picture wants to keep its height, and
   * anything sitting at the bottom of a note wants to get out of the way. See
   * utils/wallpaperViewport.js.
   */
  let keyboardOpen = false;

  function measureWallpaperBox() {
    if (typeof window === 'undefined') return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const next = steadyWallpaperHeight({
      previousHeight: wallpaperHeight,
      previousWidth: wallpaperWidth,
      width,
      height,
      typing: isTyping(document.activeElement)
    });
    wallpaperWidth = width;
    if (next !== wallpaperHeight) wallpaperHeight = next;
    // Against the height being held rather than the one just measured: that is
    // the height before the keyboard arrived, which is what it is hiding.
    keyboardOpen = keyboardIsUp({
      heldHeight: wallpaperHeight,
      height,
      typing: isTyping(document.activeElement)
    });
  }

  // Watched the same way the text scale is, and for the same reason: the window
  // changes without anybody asking it to. focusout is here because a keyboard
  // closing is a focus leaving, and the height has to be taken again the moment
  // holding it still stops being right.
  function watchWallpaperBox() {
    if (typeof window === 'undefined') return () => {};
    const remeasure = () => measureWallpaperBox();
    measureWallpaperBox();
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    window.addEventListener('focusout', remeasure);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
      window.removeEventListener('focusout', remeasure);
    };
  }

  function loadSyncedUid() {
    if (typeof localStorage === 'undefined') return '';
    try {
      return localStorage.getItem(SYNCED_UID_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function persistSyncedUid(uid) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (uid) localStorage.setItem(SYNCED_UID_STORAGE_KEY, uid);
      else localStorage.removeItem(SYNCED_UID_STORAGE_KEY);
    } catch {
      /* ignore local persistence failure */
    }
  }

  function persistCloudSyncMemory(memory) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CLOUD_SYNC_MEMORY_STORAGE_KEY, JSON.stringify(memory || {}));
    } catch {
      /* ignore local persistence failure */
    }
  }

  function loadAutoSyncEnabled() {
    if (typeof localStorage === 'undefined') return true;
    try {
      const raw = localStorage.getItem(AUTO_SYNC_ENABLED_STORAGE_KEY);
      if (raw === null) return true;
      return raw === 'true';
    } catch {
      return true;
    }
  }

  function persistAutoSyncEnabled(enabled) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(AUTO_SYNC_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      /* ignore local persistence failure */
    }
  }


  function detectShiftSafeModeDuringStartup(waitMs = 700) {
    if (typeof window === 'undefined') return Promise.resolve(false);

    return new Promise(resolve => {
      let resolved = false;

      const finish = value => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('keydown', onKeyDown);
        resolve(value);
      };

      const onKeyDown = event => {
        if (event.key === 'Shift') {
          finish(true);
        }
      };

      window.addEventListener('keydown', onKeyDown);
      setTimeout(() => finish(false), waitMs);
    });
  }

  async function openFallbackSave(reason = '') {
    const fallbackPayload = { blocks: [], modeOrders: {} };
    await saveBlocks(FALLBACK_SAVE_NAME, fallbackPayload);

    currentSaveName = FALLBACK_SAVE_NAME;
    persistLastSaveName(FALLBACK_SAVE_NAME);
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, {});
    savedList = await listSavedBlocks();

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);

    if (reason) {
      await appAlert(`Opened ${FALLBACK_SAVE_NAME} because "${reason}" could not be loaded.`);
    }
  }

  function persistControlColors(colors) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        CONTROL_COLOR_STORAGE_KEY,
        JSON.stringify(colors)
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function persistBlockTheme(theme, id = selectedThemeId) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        BLOCK_THEME_STORAGE_KEY,
        JSON.stringify(theme)
      );
      localStorage.setItem(
        BLOCK_THEME_ID_STORAGE_KEY,
        id || CUSTOM_THEME_ID
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }


  function persistCustomThemes(themes) {
    if (typeof localStorage === 'undefined') return;
    try {
      // updatedAt and syncedAt are kept because both survive a restart or they
      // are worthless. updatedAt is what settles which of two devices' copies
      // is newer; syncedAt is what tells this device it has seen a theme in
      // the cloud, which is the only thing separating a theme deleted on
      // another device from one made here and never uploaded.
      const serializable = themes.map(theme => ({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        ...lookOf(theme),
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
        syncedAt: theme.syncedAt
      }));
      localStorage.setItem(
        CUSTOM_THEMES_STORAGE_KEY,
        JSON.stringify(serializable)
      );
    } catch (error) {
      /* ignore persistence failures */
    }
  }

  function slugify(value = '') {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function normalizeThemePayload(detail = {}) {
    const {
      name,
      description,
      controlColors: themeControlColors,
      blockTheme: themeBlock,
      previewBg
    } = detail;

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return null;
    }

    const normalizedColors = normalizeControlColors(themeControlColors || controlColors);
    const normalizedBlock = normalizeBlockTheme(themeBlock || blockTheme);
    const safePreviewBg =
      typeof previewBg === 'string' && previewBg
        ? previewBg
        : currentThemePreviewBg || DEFAULT_PREVIEW_BG;

    return {
      name: trimmedName,
      description: (description || '').trim() || 'Custom theme',
      controlColors: normalizedColors,
      blockTheme: normalizedBlock,
      previewBg: safePreviewBg,
      ...extrasOf(detail)
    };
  }

  function createCustomThemePayload(payload, { baseId } = {}) {
    if (!payload) {
      return null;
    }

    const existingIds = new Set([...STYLE_PRESETS, ...customThemes].map(theme => theme.id));
    const slug = baseId || slugify(payload.name) || 'custom-theme';
    let uniqueId = slug;
    let counter = 1;

    while (existingIds.has(uniqueId)) {
      uniqueId = `${slug}-${counter}`;
      counter += 1;
    }

    return {
      id: uniqueId,
      name: payload.name,
      description: payload.description,
      controlColors: payload.controlColors,
      blockTheme: payload.blockTheme,
      previewBg: payload.previewBg,
      ...extrasOf(payload),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCustom: true
    };
  }

  let controlColors = normalizeControlColors();
  let blockTheme = normalizeBlockTheme();
  let selectedThemeId = 'default-dark';
  let customThemes = [];
  let currentThemePreviewBg = DEFAULT_PREVIEW_BG;
  // What the theme on screen has besides its colours -- kept here rather than
  // read off the theme in the list, because editing any colour makes the
  // theme on screen an unsaved one with no entry in the list, and these used
  // to vanish with it. See utils/themeExtras.js.
  let themeExtras = {};
  let showAdvancedCssPage = false;

  $: availableThemes = [...STYLE_PRESETS, ...customThemes];
  // New blocks are born in the active theme's colours instead of always
  // black-on-white. Themes without their own defaults (custom ones) keep the
  // original pair.
  $: activeTheme = availableThemes.find(theme => theme.id === selectedThemeId) || null;
  $: newBlockColors = {
    bgColor: themeExtras.blockDefaults?.bgColor || '#000000',
    textColor: themeExtras.blockDefaults?.textColor || '#ffffff'
  };
  // ── Music player ──────────────────────────────────────────────────
  // Lives here rather than inside Playlist mode: switching modes unmounts the
  // mode component, and playback has to keep going while you work elsewhere.
  // Device-local, never synced: the audio only ever exists on this machine, so
  // its titles and playlists are of no use to another device. Kept in
  // IndexedDB rather than the folder's mode settings, which do sync.
  let musicLibrary = { tracks: [], playlists: [] };

  // Anything saved by an earlier version still sits in the synced settings.
  // Moving it across has to wait for the folder to actually load: running on
  // the first reactive pass sees the empty defaults, adopts nothing, and then
  // never looks again — which is exactly how an earlier attempt at this lost
  // the library from view.
  let musicLibraryLoaded = false;
  let musicLibraryMigrated = false;

  async function loadLocalMusicLibrary() {
    const local = await loadMusicLibrary();
    if (local && (local.tracks.length || local.playlists.length)) {
      musicLibrary = local;
      // Already local, so there's nothing left to bring across.
      musicLibraryMigrated = true;
    }
    musicLibraryLoaded = true;
  }

  async function migrateSyncedMusicLibrary(synced) {
    musicLibrary = {
      tracks: Array.isArray(synced.tracks) ? synced.tracks : [],
      playlists: Array.isArray(synced.playlists) ? synced.playlists : []
    };
    await saveMusicLibrary(musicLibrary);
    // Cleared from the folder so it stops being uploaded from here on.
    await handleModeSettingChange({ detail: { playlist: { tracks: [], playlists: [] } } });
  }

  // The tracker used to keep one list in localStorage, shared by every folder
  // and stuck on one device. When a folder has finished opening, that list is
  // merged into it -- the habits the folder lacks added, the days it lacks
  // filled in, a ✕ the first move turned into a tick put back. See
  // mergeDeviceHabits in utils/habitStore.js, and the request it answers:
  // "we should keep if a habit was already being kept and the day it was
  // before the syncs, instead of wiping it out" (2026-10-05).
  //
  // Once per device: the flag holds the folder it went into. The old key is
  // left where it is -- deleting somebody's only copy of months of ticking, to
  // save a few hundred bytes, is not a trade worth making.
  //
  // It used to run from a reactive statement the moment a folder name was
  // set, which at start-up is before the folder has been read: what it saved
  // then was an empty folder. It runs from load() now, after the folder is on
  // screen.
  const HABITS_KEY = 'habitTrackerData';
  const HABITS_ADOPTED_KEY = 'habitTrackerData:adopted';
  const HABITS_MERGED_KEY = 'habitTrackerData:merged';

  async function mergeOldDeviceHabits(folderName, storedHabits) {
    try {
      if (typeof localStorage === 'undefined' || !folderName) return;
      if (localStorage.getItem(HABITS_MERGED_KEY)) return;

      const onDevice = JSON.parse(localStorage.getItem(HABITS_KEY) || '[]');
      if (!Array.isArray(onDevice) || onDevice.length === 0) {
        localStorage.setItem(HABITS_MERGED_KEY, '(nothing on this device)');
        return;
      }

      const result = mergeDeviceHabits({
        inFolder: storedHabits,
        onDevice,
        // A list that already moved into a folder is not copied into every
        // empty one after it.
        intoEmpty: localStorage.getItem(HABITS_ADOPTED_KEY) !== 'yes'
      });
      if (!result) return; // not this folder's list: try the next one opened

      localStorage.setItem(HABITS_MERGED_KEY, folderName);
      localStorage.setItem(HABITS_ADOPTED_KEY, 'yes');
      if (!result.habits) return; // the folder already had it all
      logSync('habit', folderName, 'brought in the habits this device kept before they synced', {
        added: result.added,
        daysRestored: result.restored
      });
      await handleModeSettingChange({ detail: { habit: { habits: result.habits } } });
    } catch (error) {
      console.warn('Could not merge the habits kept on this device into the folder:', error);
    }
  }

  $: if (musicLibraryLoaded && !musicLibraryMigrated && modeSettings?.playlist) {
    const synced = modeSettings.playlist;
    if ((synced.tracks || []).length || (synced.playlists || []).length) {
      musicLibraryMigrated = true;
      migrateSyncedMusicLibrary(synced);
    }
  }

  let audioEl;
  let nowPlayingId = null;
  let musicQueue = [];
  // The order shuffle actually played things in, so that back goes back rather
  // than picking again. Kept on this device across restarts -- which songs this
  // pair of ears has been through is the same kind of fact as which note was
  // last open, and never worth syncing. See utils/shuffleHistory.js.
  let shufflePlayed = EMPTY_SHUFFLE.played;
  let shufflePosition = EMPTY_SHUFFLE.position;

  function loadShufflePath() {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = readPath(localStorage.getItem(SHUFFLE_PATH_KEY));
      shufflePlayed = stored.played;
      shufflePosition = stored.position;
    } catch {
      // A browser with storage off simply starts a fresh path.
    }
  }

  function persistShufflePath() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SHUFFLE_PATH_KEY, pathToStore({
        played: shufflePlayed,
        position: shufflePosition
      }));
    } catch {
      /* ignore persistence failures */
    }
  }

  /**
   * Drop anything the library no longer holds.
   *
   * Run once the library is here rather than at load, because until then there
   * is nothing to check a song against. A path kept across a restart can name a
   * track deleted since, and walking back onto one would stop with a message
   * about audio that is not on this device.
   */
  let shufflePathPruned = false;
  $: if (!shufflePathPruned && musicLibrary.tracks?.length && shufflePlayed.length) {
    shufflePathPruned = true;
    const known = new Set(musicLibrary.tracks.map(track => track.id));
    const pruned = prunePath({ played: shufflePlayed, position: shufflePosition, known });
    if (pruned.played.length !== shufflePlayed.length) {
      shufflePlayed = pruned.played;
      shufflePosition = pruned.position;
      persistShufflePath();
    }
  }
  let isPlaying = false;
  let nowPlayingUrl = '';
  let playerExpanded = false;
  let playerToggleRef;
  let musicShuffle = loadMusicShuffle();
  let musicVolume = loadMusicVolume();
  let nowPlayingCoverUrl = '';
  // Where we are in the track, for the panel's seek bar.
  let musicPosition = 0;
  let musicDuration = 0;

  function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /** A press on the timeline's row but off its line: seek to that point, and follow the drag. */
  function seekFromRow(event) {
    if (event.target?.closest?.('input') || !musicDuration) return;
    const range = event.currentTarget.querySelector('.pp-seek-range');
    if (!range) return;
    event.preventDefault();
    const at = clientX => {
      const box = range.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      seekMusic(ratio * musicDuration);
    };
    at(event.clientX);
    const move = e => at(e.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function seekMusic(value) {
    const next = Number(value);
    if (!audioEl || !Number.isFinite(next)) return;
    audioEl.currentTime = next;
    // Moved straight away so the handle doesn't spring back while the media
    // element catches up.
    musicPosition = next;
  }

  function syncMusicTime() {
    if (!audioEl) return;
    musicPosition = audioEl.currentTime || 0;
    musicDuration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
  }

  // Records handed over by whatever asked for the music, for the tracks the
  // library has not caught up with. Empty except during an import; see
  // utils/nowPlaying.js for why the player needs them at all.
  let handedOverTracks = [];

  $: nowPlayingTrack = nowPlayingRecord(nowPlayingId, musicLibrary.tracks, handedOverTracks);

  // The cover sits behind a veil of the theme's own panel colour, so the art
  // tints the control rather than fighting the palette. The veil keeps a little
  // transparency on purpose — a fully opaque theme colour would hide the art
  // completely and there'd be nothing to show.
  function artBackground(url, veilVar, fallbackVar) {
    const veil = `color-mix(in srgb, var(${veilVar}, var(${fallbackVar})) 82%, transparent)`;
    if (!url) return '';
    return (
      `background-image: linear-gradient(${veil}, ${veil}), url('${url}');` +
      ' background-size: cover; background-position: center;'
    );
  }
  $: miniPlayerArtStyle = artBackground(nowPlayingCoverUrl, '--player-veil', '--controls-bg');
  $: panelArtStyle = artBackground(nowPlayingCoverUrl, '--dlg-bg', '--dlg-bg');
  // Volume is a device setting, not a per-file one, so it survives reloads
  // without riding along with the folder.
  $: if (audioEl) audioEl.volume = gainForVolume(musicVolume);

  function setMusicVolume(value) {
    musicVolume = Math.min(1, Math.max(0, Number(value)));
    persistMusicVolume(musicVolume);
    try { localStorage.setItem(MUSIC_VOLUME_CURVE_KEY, '1'); } catch { /* ignore */ }
  }

  function toggleShuffle() {
    musicShuffle = !musicShuffle;
    persistMusicShuffle(musicShuffle);
  }

  /** Which cover lookup is the current one, so a slow older one cannot win. */
  let coverRequest = 0;

  /**
   * The player's artwork, changed in one go rather than in two.
   *
   * Asked for: "there's a transition when changing covers, that transition is
   * long as fuck — I'd prefer if when I press to change it took more time to
   * load, but when it does everything changes in a short time."
   *
   * It was not a transition. The old art was cleared *before* the lookup, and
   * the lookup is the slow part — for a track with no stored cover it opens the
   * audio file and parses it. So the player went blank, sat there for as long
   * as that took, and then the new picture appeared: read from the outside as
   * one long dissolve.
   *
   * Now the old art stays until the new one is ready and they swap together. It
   * takes no less time; it just stops showing the middle of it.
   *
   * The counter is what makes that safe. Holding the old picture means a lookup
   * can still be running when the next track is picked, and without it a slow
   * one landing late would paint the wrong cover over the right one — which is
   * a worse fault than the one being fixed, and the sort that only shows up
   * when somebody skips quickly through an album.
   */
  async function showCoverFor(trackId) {
    const mine = ++coverRequest;
    const cover = await ensureMusicCover(trackId);
    if (mine !== coverRequest) return;

    const previous = nowPlayingCoverUrl;
    nowPlayingCoverUrl = cover ? URL.createObjectURL(cover) : '';
    // After the swap, never before: revoking first would blank the player for
    // exactly the moment this is meant to remove.
    if (previous) URL.revokeObjectURL(previous);
  }

  async function playMusicTrack(trackId, queue = [], { remember = true } = {}) {
    const blob = await loadMusicTrack(trackId);
    if (!blob) {
      await appAlert("That track's audio isn't on this device yet. Import it from a music export.");
      return;
    }
    // An m4a with its index at the end plays silent on Linux; see
    // utils/mp4Faststart.js. The stored track is not changed.
    // On Linux, from the app's local server rather than a blob, or the
    // timeline cannot go backwards; see utils/audioAddress.js.
    const address = await addressForAudio(await playableAudio(blob));
    releaseAudioAddress(nowPlayingUrl);
    nowPlayingUrl = address;
    nowPlayingId = trackId;
    musicPosition = 0;
    musicDuration = 0;
    if (queue.length) musicQueue = queue;

    // Chosen rather than stepped to: a new branch, so whatever shuffle had
    // ahead of it is dropped. Stepping passes remember: false and moves the
    // position itself, since walking a path must not rewrite it.
    if (remember) {
      const path = rememberPlayed({ played: shufflePlayed, position: shufflePosition, trackId });
      shufflePlayed = path.played;
      shufflePosition = path.position;
      persistShufflePath();
    }
    showCoverFor(trackId);
    await tick();
    if (audioEl) {
      audioEl.src = nowPlayingUrl;
      audioEl.volume = gainForVolume(musicVolume);
      try {
        await audioEl.play();
        isPlaying = true;
      } catch (error) {
        console.error('Playback failed:', error);
        isPlaying = false;
      }
    }
    rememberPlaybackPosition();
  }

  function toggleMusic() {
    if (!audioEl || !nowPlayingId) return;
    if (audioEl.paused) {
      audioEl.play().then(() => (isPlaying = true)).catch(() => (isPlaying = false));
    } else {
      audioEl.pause();
      isPlaying = false;
    }
  }

  function stopMusic() {
    audioEl?.pause();
    isPlaying = false;
    nowPlayingId = null;
    if (nowPlayingUrl) {
      releaseAudioAddress(nowPlayingUrl);
      nowPlayingUrl = '';
    }
    playerExpanded = false;
    persistMusicResume(null);
  }

  function stepMusic(offset) {
    if (!musicQueue.length || !nowPlayingId) return;

    // Shuffle walks the order it actually played things in. Forward at the end
    // of that order picks something new, which is what shuffle is for; forward
    // in the middle of it -- because back was pressed -- re-walks what was
    // heard. Back used to pick at random too, which meant the one thing back is
    // for was the one thing it could not do.
    if (musicShuffle && musicQueue.length > 1) {
      const stepped = stepShuffle({
        played: shufflePlayed,
        position: shufflePosition,
        queue: musicQueue,
        currentId: nowPlayingId,
        delta: offset
      });
      if (!stepped.trackId) return;
      shufflePlayed = stepped.played;
      shufflePosition = stepped.position;
      persistShufflePath();
      playMusicTrack(stepped.trackId, [], { remember: false });
      return;
    }

    const index = musicQueue.indexOf(nowPlayingId);
    if (index === -1) return;
    const next = musicQueue[(index + offset + musicQueue.length) % musicQueue.length];
    if (next) playMusicTrack(next);
  }

  async function handleLibraryChange(next) {
    musicLibrary = next || { tracks: [], playlists: [] };
    await saveMusicLibrary(musicLibrary);
  }

  // ── Lock screen / notification controls ───────────────────────────
  // The Media Session API is what puts the track on the phone's notification
  // shade and lock screen, and it's also what tells the OS this tab is playing
  // real audio — which is what keeps it running once the screen goes off.
  let mediaSessionCoverUrl = '';

  /** Why the cover is what it is, for the diagnostics report. */
  let coverReport = { stage: 'nothing played yet' };

  /**
   * The cover for a track, ready to hand to anything that wants one.
   *
   * **This used to live inside updateMediaSession, behind its early return**,
   * and that was the whole of the missing artwork on the phone. That function
   * begins by checking for `navigator.mediaSession` and `MediaMetadata` — a
   * browser API — and returns when either is absent. Android's notification is
   * a native service that has nothing to do with that API, but the only place
   * its picture was ever produced was after that check, so wherever the web
   * Media Session is unavailable the notification got no artwork, for ever,
   * while its title, buttons and progress bar all carried on working through
   * the native path. Which is exactly what it looked like from the outside:
   * everything working except the cover.
   *
   * So the cover is prepared on its own terms now, and the web Media Session is
   * one of the things that consumes it rather than the thing that gates it.
   */
  async function prepareCover(track) {
    // Cleared first, and unconditionally. Left to the branch below, a track
    // with no cover of its own kept the previous track's picture.
    mediaSessionCoverUrl = '';

    if (!track) {
      coverReport = { stage: 'nothing playing' };
      return '';
    }

    const report = {
      trackId: track.id,
      // Recorded rather than assumed: this is the condition that was silently
      // deciding whether there was any artwork at all.
      mediaSessionApi:
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaSession) &&
        typeof MediaMetadata !== 'undefined'
    };

    try {
      const cover = await ensureMusicCover(track.id);
      report.coverBytes = cover?.size ?? 0;
      if (!cover) {
        report.stage = 'no cover found in the file or the store';
        coverReport = report;
        return '';
      }

      // Cut down on the way: it travels to Android on an intent, and a
      // full-size embedded sleeve does not fit through Binder. See
      // utils/coverArtwork.js.
      const dataUrl = await coverForNotification(cover);
      report.shrunkChars = dataUrl.length;
      report.stage = dataUrl ? 'ready' : 'a cover was found but was too big to send';
      coverReport = report;

      mediaSessionCoverUrl = dataUrl;
      return dataUrl;
    } catch (error) {
      report.stage = `threw: ${error?.message || error}`;
      coverReport = report;
      return '';
    }
  }

  async function updateMediaSession(track) {
    // First, and outside everything below, because the notification's artwork
    // is not the web Media Session's business.
    const dataUrl = await prepareCover(track);

    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    if (!track) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }

    ms.metadata = new MediaMetadata({
      title: track.title || 'Untitled',
      artist: track.artist || '',
      album: track.album || '',
      artwork: dataUrl ? [{ src: dataUrl, type: 'image/jpeg', sizes: '512x512' }] : []
    });
  }

  function setupMediaSessionHandlers() {
    const ms = navigator.mediaSession;
    if (!ms || typeof ms.setActionHandler !== 'function') return;
    const handlers = {
      play: () => { if (!isPlaying) toggleMusic(); },
      pause: () => { if (isPlaying) toggleMusic(); },
      // Same as the notification being swiped away: stop playing, keep the
      // track. The player's own Stop button is the deliberate "I am done with
      // this", and it still clears; a stop from the operating system is not
      // that, and clearing on it was the complaint.
      stop: () => putTheNotificationAway(),
      previoustrack: () => stepMusic(-1),
      nexttrack: () => stepMusic(1),
      seekto: details => {
        if (audioEl && Number.isFinite(details?.seekTime)) audioEl.currentTime = details.seekTime;
      }
    };
    for (const [action, handler] of Object.entries(handlers)) {
      // Not every platform supports every action; an unsupported one throws.
      try { ms.setActionHandler(action, handler); } catch { /* ignore */ }
    }
  }

  $: if (navigator.mediaSession) {
    navigator.mediaSession.playbackState = nowPlayingId ? (isPlaying ? 'playing' : 'paused') : 'none';
  }
  $: updateMediaSession(nowPlayingTrack);

  // On Android the foreground service is what keeps playback alive once the
  // screen goes off. It's held for as long as a track is loaded — including
  // while paused, since the process has to survive for you to resume from the
  // lock screen — and released when playback is stopped altogether.
  // Re-run on play state too, so the notification's button flips between play
  // and pause along with the player.
  // Re-runs on the play state and on the artwork, so the notification's
  // button flips with the player and the cover appears as soon as it's read.
  /** The track whose notification was swiped away — see utils/notificationPresence.js. */
  let dismissedNotificationFor = null;

  /**
   * Swiped away, or stopped from a car, a headset or the lock screen.
   *
   * Asked for: "when swiping the music out it removes the music it was on in
   * app -- it shouldn't remove, just stop in app." So playback stops and the
   * track stays exactly where it was, ready to press play on.
   *
   * The dismissal is remembered against this track because pausing is itself a
   * change the notification watches, so without it the swipe would put the
   * notification straight back up and undo itself. Pressing play or moving to
   * another track ends it without anything having to clear a flag.
   */
  function putTheNotificationAway() {
    dismissedNotificationFor = dismissalFor(nowPlayingTrack?.id ?? null);
    audioEl?.pause();
  }

  // The dependencies are named here rather than read inside the function,
  // because Svelte works out what a reactive statement depends on from what the
  // statement itself mentions — one that only appears inside a called function
  // is invisible to it, and the notification would then never hear about a
  // pause or a cover that had just finished loading.
  $: notificationWanted = shouldShowNotification({
    hasTrack: Boolean(nowPlayingTrack),
    playing: isPlaying,
    trackId: nowPlayingTrack?.id ?? null,
    dismissedFor: dismissedNotificationFor
  });

  $: if (notificationWanted) {
    tellTheNotification(nowPlayingTrack, isPlaying, mediaSessionCoverUrl);
  } else {
    stopBackgroundAudio();
  }

  // Where the notification was last told the track had reached, and when. Both
  // are needed to work out what Android will have extrapolated to by now — see
  // utils/playbackPosition.js.
  let lastReportedPositionMs = null;
  let lastReportedAt = 0;

  function tellTheNotification(
    track = nowPlayingTrack,
    playing = isPlaying,
    cover = mediaSessionCoverUrl
  ) {
    if (!track) return;
    lastReportedPositionMs = Math.round((Number(audioEl?.currentTime) || 0) * 1000);
    lastReportedAt = Date.now();
    startBackgroundAudio({
      title: track.title || 'Untitled',
      artist: [track.artist, track.album].filter(Boolean).join(' · '),
      // The same data URL the lock screen gets: a blob: URL means nothing
      // outside the page that created it.
      artwork: cover,
      isPlaying: playing,
      position: audioEl?.currentTime,
      // NaN until the file's metadata has been read, which every track passes
      // through. playbackPosition.js drops it rather than claiming a length.
      duration: audioEl?.duration
    });
  }

  /**
   * Keeps the shade's progress bar honest without talking to it constantly.
   *
   * Android is given a position and a speed and works the rest out itself, so
   * `timeupdate` has nothing to add while a track plays normally. This only
   * speaks up when the audio has actually diverged from what the shade would
   * have extrapolated — a seek, or a stall, which fires no event of its own.
   */
  function reportPositionIfItMoved() {
    if (!nowPlayingTrack) return;
    const positionMs = Math.round((Number(audioEl?.currentTime) || 0) * 1000);
    const moved = worthReporting({
      positionMs,
      lastReportedMs: lastReportedPositionMs,
      lastReportedAt,
      now: Date.now(),
      playing: isPlaying
    });
    if (moved) tellTheNotification();
  }

  // ── Resuming where you left off ───────────────────────────────────
  let resumeSeekTo = 0;

  function handleVisibilityForMusic() {
    if (document.visibilityState === 'hidden') rememberPlaybackPosition();
  }

  // timeupdate fires several times a second; the position only needs writing
  // every few seconds for a resume to feel right.
  let lastPositionWrite = 0;
  function throttledRememberPosition() {
    const now = Date.now();
    if (now - lastPositionWrite < 4000) return;
    lastPositionWrite = now;
    rememberPlaybackPosition();
  }

  function rememberPlaybackPosition() {
    if (!nowPlayingId) {
      persistMusicResume(null);
      return;
    }
    persistMusicResume({
      trackId: nowPlayingId,
      queue: musicQueue,
      position: audioEl?.currentTime || 0
    });
  }

  // Loads the last session without starting it: browsers refuse to autoplay
  // before you've interacted with the page, so the track is queued up paused
  // and the first tap on play carries on from the saved position.
  async function restoreLastListeningSession() {
    const saved = loadMusicResume();
    if (!saved) return;
    const track = musicLibrary.tracks?.find(t => t.id === saved.trackId);
    if (!track) return;
    const blob = await loadMusicTrack(saved.trackId);
    if (!blob) return;
    const address = await addressForAudio(await playableAudio(blob));

    releaseAudioAddress(nowPlayingUrl);
    nowPlayingUrl = address;
    nowPlayingId = saved.trackId;
    musicQueue = Array.isArray(saved.queue) && saved.queue.length ? saved.queue : [saved.trackId];
    resumeSeekTo = Number(saved.position) || 0;
    showCoverFor(saved.trackId);
    await tick();
    if (audioEl) {
      audioEl.src = nowPlayingUrl;
      audioEl.volume = gainForVolume(musicVolume);
    }
    isPlaying = false;
  }

  // The library only exists once a folder has loaded, so the restore waits for
  // it rather than running on mount. It runs once per session.
  let listeningSessionRestored = false;
  $: if (!listeningSessionRestored && musicLibrary.tracks?.length) {
    listeningSessionRestored = true;
    restoreLastListeningSession();
  }

  function applyResumePosition() {
    if (resumeSeekTo > 0 && audioEl && Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = Math.min(resumeSeekTo, Math.max(0, audioEl.duration - 1));
    }
    resumeSeekTo = 0;
  }

  let blocksFollowThemeAll = loadBlocksFollowThemeAll();
  // Per-folder switch travels with the file through sync; the app-wide one is
  // a device preference that forces it on regardless of the folder.
  $: blocksFollowTheme = blocksFollowThemeAll || modeSettings.blocksFollowTheme === true;
  // Two passes, because the switch has two moments and only one is a repaint.
  // The reasoning, and the bug that came of running one pass for both, is in
  // utils/themePainting.js. The short version: a single statement naming
  // `blocks` re-ran on the user's own colour change and put the theme's colour
  // straight back, so the colour picker did nothing for as long as the switch
  // was on.
  // Everything the app knows about itself, in one paste.
  //
  // The deciding fact in the last two bugs was a setting, not a stack trace:
  // a switch that was on, and a theme that pinned a colour. Neither threw, so
  // nothing would have been reported. This is the answer to "what is switched
  // on, and what colour is that block" without having to ask for it one field
  // at a time.
  //
  // The measuring is here because it needs a DOM: what a block *computes* to on
  // screen is the fact that settles a colour question, and it cannot be worked
  // out from the saved values alone — that was exactly the gap when a header
  // stopped matching its body.
  // Every block, whatever draws it. Text and music come from BlockShell as
  // `.note`; task, image and embed still carry their own shells and their own
  // root classes. Sampling only `.note` measured three blocks out of eight and
  // pronounced the folder clean — the five it could not see were exactly the
  // ones nobody had ruled out.
  //
  // Keyed on the attribute rather than those classes, because the classes are
  // not unique: a music block's *body* is also `.player`, so a class list
  // matched it twice and reported the inner half as a block of unknown type
  // with no background. Only a root carries a block id.
  const BLOCK_ROOTS = '[data-block-id]';

  function sampleDrawnBlocks(limit = 10) {
    if (typeof document === 'undefined') return [];
    const typeOf = new Map((blocks || []).map(b => [b.id, b.type]));
    return [...document.querySelectorAll(BLOCK_ROOTS)].slice(0, limit).map((el, i) => {
      const header = el.querySelector('.header');
      const id = el.getAttribute('data-block-id') || `#${i + 1}`;
      const name = header?.querySelector('span')?.textContent?.trim() || 'block';
      // What is painted *over* the block, not just the block. A text block's
      // editor gave itself the canvas colour, so the root measured correctly,
      // matched the header, and the report came back clean about a block that
      // was visibly two colours. Whatever covers the content area is the thing
      // being looked at.
      const covering = [...el.children]
        .filter(c => c !== header && !c.classList.contains('resize-handle'))
        .map(c => ({ cls: c.className.toString().split(' ')[0], bg: getComputedStyle(c).backgroundColor }))
        .find(c => c.bg !== 'rgba(0, 0, 0, 0)');

      return {
        id,
        label: `${name} (${typeOf.get(id) || 'unknown'})`,
        bodyBg: getComputedStyle(el).backgroundColor,
        headerBg: header ? getComputedStyle(header).backgroundColor : '(no header)',
        coveredBy: covering ? `${covering.cls} ${covering.bg}` : null
      };
    });
  }

  /** What the native side saw of the keyboard's pictures, or null off Android. */
  async function nativePicturePasteStatus() {
    try {
      const plugin = window.Capacitor?.Plugins?.Diagnostics;
      if (!plugin?.picturePaste) return null;
      return await plugin.picturePaste();
    } catch {
      return null;
    }
  }

  function readFontState() {
    try {
      if (typeof document === 'undefined' || !document.fonts) return { supported: false };
      return {
        supported: true,
        regular: document.fonts.check('300 16px Inter'),
        bold: document.fonts.check('800 16px Inter')
      };
    } catch {
      return { supported: false };
    }
  }

  async function collectDiagnostics() {
    const platform = typeof window === 'undefined'
      ? 'unknown'
      : window.__TAURI_INTERNALS__ || window.__TAURI__
        ? 'desktop'
        : window.Capacitor?.isNativePlatform?.()
          ? 'android'
          : 'web';

    return formatDiagnostics(buildDiagnostics({
      version: shownVersion,
      platform,
      mode,
      folder: currentSaveName,
      theme: {
        id: selectedThemeId,
        name: activeTheme?.name,
        custom: Boolean(activeTheme?.isCustom),
        customCount: customThemes.length
      },
      blockTheme,
      activeColors: newBlockColors,
      canvas: controlColors?.canvas,
      followTheme: {
        folder: modeSettings?.blocksFollowTheme === true,
        allFolders: blocksFollowThemeAll
      },
      blocks,
      habits: modeSettings?.habit?.habits,
      themes: availableThemes,
      samples: sampleDrawnBlocks(),
      sync: {
        signedIn: Boolean(authUser),
        autoSync: autoSyncEnabled,
        lastError: syncFailureNotice || null,
        log: getSyncLog().slice(-8).map(e => `${new Date(e.at).toLocaleTimeString()} ${e.kind} ${e.folder} ${e.message}`)
      },
      library: {
        tracks: musicLibrary?.tracks?.length ?? 0,
        playlists: musicLibrary?.playlists?.length ?? 0
      },
      // What this device predicted against what the cloud counted. Only ever
      // set when the two disagreed by more than arithmetic.
      storageDrift: lastStorageDrift,
      // Both halves of the handover to the phone's notification. Asked for
      // after the cover still did not appear: "do you want to make a diagnostic
      // or something to be sure of why it doesn't work?"
      notification: { ...(await notificationDiagnostics()), cover: coverReport },
      picturePaste: { native: await nativePicturePasteStatus(), page: keyboardPictures },
      // What the local database actually holds. Added after a packaged desktop
      // build lost every imported track while the notes and the sign-in
      // survived -- a symptom with three quite different causes that look
      // identical from outside. See describeLocalStore.
      localStore: await describeLocalStorage(),
      // And what it held at the launches before this one, which is the only
      // thing that can say *when* something went and which build was running.
      journal: storageJournal,
      // Whether the app's own typeface is in use. Bold is nothing but a weight
      // now -- 300 against 800 -- so a build where Inter did not load draws it
      // in a face with two weights and bold stops looking bold, silently.
      fonts: readFontState()
    }));
  }
  let lastPaintedTheme = null;
  $: repaintForTheme(blocksFollowTheme, newBlockColors);
  $: if (blocksFollowTheme && blocks.length) paintStaleBlocksWithTheme(newBlockColors);
  // And the mirror of it with the switch off: a folder saved while it was on
  // still wears the paint, and only the folder open at the time was ever put
  // back. Answered from the blocks, so it holds for a folder opened any time
  // later. See unpaintAll.
  $: if (!blocksFollowTheme && !folderOpening && blocks.length) restoreBlockColors();

  // The theme moved, or the switch has just come on: everything follows.
  function repaintForTheme(on, colors) {
    if (!on) {
      lastPaintedTheme = null;
      return;
    }
    if (!needsFullRepaint(lastPaintedTheme, colors)) return;
    lastPaintedTheme = themeKey(colors);
    paintBlocksWithTheme(colors);
  }

  // Blocks changed — a folder opened, a block added. Paint whatever is not
  // already wearing this theme, which includes a folder whose blocks were last
  // painted under a different one; a colour the user picked is left alone.
  function paintStaleBlocksWithTheme(colors) {
    const next = paintStale(blocks, colors);
    if (next === blocks) return;
    blocks = next;
    pushHistory(blocks, modeOrders);
  }

  // Applies theme colours across every block in every mode, stashing each
  // block's own colours the first time so turning the switch off restores
  // exactly what the user had picked.
  function paintBlocksWithTheme(colors) {
    const next = paintAll(blocks, colors);
    if (next === blocks) return;
    blocks = next;
    pushHistory(blocks, modeOrders);
  }

  function restoreBlockColors() {
    const next = unpaintAll(blocks);
    if (next === blocks) return;
    blocks = next;
    pushHistory(blocks, modeOrders);
  }

  // Per-folder switch. Turning it off while the app-wide one is on leaves the
  // blocks painted, since that setting still applies.
  async function toggleBlocksFollowTheme() {
    const next = !(modeSettings.blocksFollowTheme === true);
    // Turning on: the setting first, then the paint. Painted while the
    // setting still read off, the pass that unpaints a folder with the switch
    // off would take the paint straight back off.
    if (next) {
      await handleModeSettingChange({ detail: { blocksFollowTheme: next } });
      paintBlocksWithTheme(newBlockColors);
      return;
    }
    if (!blocksFollowThemeAll) restoreBlockColors();
    await handleModeSettingChange({ detail: { blocksFollowTheme: next } });
  }

  async function toggleBlocksFollowThemeAll() {
    blocksFollowThemeAll = !blocksFollowThemeAll;
    persistBlocksFollowThemeAll(blocksFollowThemeAll);
    if (blocksFollowThemeAll) paintBlocksWithTheme(newBlockColors);
    else if (modeSettings.blocksFollowTheme !== true) restoreBlockColors();
  }

  function applyThemePreset(preset, { persistSelection = true } = {}) {
    if (!preset) return;
    const nextControlColors = normalizeControlColors(preset.controlColors);
    const nextBlockTheme = normalizeBlockTheme(preset.blockTheme);

    controlColors = nextControlColors;
    blockTheme = nextBlockTheme;
    selectedThemeId = preset.id;
    currentThemePreviewBg = preset.previewBg ?? DEFAULT_PREVIEW_BG;

    themeExtras = extrasOf(preset);
    showBuddyIcons(preset.id);

    if (persistSelection) {
      persistControlColors(nextControlColors);
      persistBlockTheme(nextBlockTheme, preset.id);
      persistThemeExtras(themeExtras);
    }
  }

  // Mr.Lee's characters on the toolbar: a theme's own setting now, so a copy
  // keeps them. The id prefix is how the originals said so before.
  function showBuddyIcons(id = selectedThemeId) {
    const byId = typeof id === 'string' && id.startsWith(HATO_ID_PREFIX);
    hatoThemeId.set(themeExtras.buddyIcons || byId ? (id || 'custom') : null);
  }

  function persistThemeExtras(extras) {
    try {
      localStorage.setItem(THEME_EXTRAS_STORAGE_KEY, JSON.stringify(extras || {}));
    } catch { /* the theme in the list still has them */ }
  }

  function loadStoredThemeExtras() {
    try {
      return extrasOf(JSON.parse(localStorage.getItem(THEME_EXTRAS_STORAGE_KEY) || '{}'));
    } catch {
      return {};
    }
  }

  // An unsaved theme -- any colour edited -- keeps its extras across a reload.
  $: if (selectedThemeId === CUSTOM_THEME_ID) persistThemeExtras(themeExtras);

  function handleThemeExtraChange(event) {
    const { key, value } = event.detail || {};
    if (!key) return;
    themeExtras = withExtras({}, { ...themeExtras, [key]: value });
    selectedThemeId = CUSTOM_THEME_ID;
    persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
    persistThemeExtras(themeExtras);
    showBuddyIcons(CUSTOM_THEME_ID);
  }

  function handleControlColorChange(event) {
    const { section, side, key, value } = event.detail || {};
    const target = section || side;
    if (!target || !key) return;

    const nextSectionTheme = {
      ...controlColors[target],
      [key]: value
    };

    // The input background used to follow the panel's, when the editor had no
    // field for it; it has its own now, and see-through themes set the two
    // differently (2026-10-06).

    controlColors = {
      ...controlColors,
      [target]: nextSectionTheme
    };

    selectedThemeId = CUSTOM_THEME_ID;
    persistControlColors(controlColors);
    persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
  }

  function handleBlockThemeChange(event) {
    const { key, value } = event.detail || {};
    if (!key) return;

    blockTheme = {
      ...blockTheme,
      [key]: value
    };

    selectedThemeId = CUSTOM_THEME_ID;
    persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
  }

  function handlePreviewBgChange(event) {
    const { value } = event.detail || {};
    if (typeof value !== 'string') return;

    currentThemePreviewBg = value || DEFAULT_PREVIEW_BG;
    selectedThemeId = CUSTOM_THEME_ID;
  }

  // ── Theme sync ──────────────────────────────────────────────────────────
  //
  // Local always comes first and never waits on the network: a theme is saved
  // to this device, and the cloud is told afterwards. If that fails, or there
  // is no signed-in account, nothing is lost and nothing is blocked — the
  // theme is still there, and the next sign-in will push it, because a theme
  // with no syncedAt is one the cloud has never seen.

  function markThemeSynced(themeId, updatedAt) {
    const index = customThemes.findIndex(theme => theme.id === themeId);
    if (index === -1) return;

    const updated = { ...customThemes[index], updatedAt, syncedAt: Date.now() };
    customThemes = [
      ...customThemes.slice(0, index),
      updated,
      ...customThemes.slice(index + 1)
    ];
    persistCustomThemes(customThemes);
  }

  async function pushThemeToCloud(theme) {
    if (!firebaseReady || !authUser || !theme) return;

    try {
      const saved = await saveRemoteTheme(theme);
      if (saved) markThemeSynced(theme.id, saved.updatedAt);
    } catch (error) {
      console.warn('Could not sync this theme to the cloud:', error);
    }
  }

  async function removeThemeFromCloud(themeId) {
    if (!firebaseReady || !authUser || !themeId) return;

    try {
      await deleteRemoteTheme(themeId);
    } catch (error) {
      console.warn('Could not remove this theme from the cloud:', error);
    }
  }

  // Runs on every sign-in rather than once, because it is a reconcile and not
  // a migration: what it does with a theme depends on whether this device has
  // ever seen that theme in the cloud, so running it again is safe and running
  // it again is how a second device catches up.
  async function syncThemesWithCloud() {
    if (!firebaseReady || !authUser) return;

    try {
      const remote = await loadRemoteThemes();
      const { themes, toUpload } = reconcileThemes(customThemes, remote);

      const now = Date.now();
      const remoteIds = new Set(remote.map(theme => theme.id));
      customThemes = themes.map(theme =>
        remoteIds.has(theme.id) ? { ...theme, syncedAt: now } : theme
      );
      persistCustomThemes(customThemes);

      for (const theme of toUpload) {
        await pushThemeToCloud(theme);
      }

      // A theme the reconcile dropped may have been the one on screen.
      if (
        selectedThemeId !== CUSTOM_THEME_ID
        && !availableThemes.some(theme => theme.id === selectedThemeId)
        && STYLE_PRESETS.length
      ) {
        applyThemePreset(STYLE_PRESETS[0]);
      }
    } catch (error) {
      console.warn('Could not sync themes with the cloud:', error);
    }
  }

  function handleAdvancedThemeSave(event) {
    const payload = normalizeThemePayload(event.detail || {});
    if (!payload) return;

    const newTheme = createCustomThemePayload(payload);
    if (!newTheme) return;

    customThemes = [...customThemes, newTheme];
    persistCustomThemes(customThemes);
    pushThemeToCloud(newTheme);

    applyThemePreset(newTheme);

    showAdvancedCssPage = false;
  }

  function handleAdvancedThemeUpdate(event) {
    const detail = event.detail || {};
    const { id } = detail;
    if (!id) return;

    const index = customThemes.findIndex(theme => theme.id === id);
    if (index === -1) return;

    const payload = normalizeThemePayload(detail);
    if (!payload) return;

    const existing = customThemes[index];
    const updatedTheme = withExtras({
      ...existing,
      ...payload,
      updatedAt: Date.now()
    }, payload);

    customThemes = [
      ...customThemes.slice(0, index),
      updatedTheme,
      ...customThemes.slice(index + 1)
    ];
    persistCustomThemes(customThemes);
    pushThemeToCloud(updatedTheme);

    applyThemePreset(updatedTheme);
    showAdvancedCssPage = false;
  }

  function handleAdvancedThemeDelete(event) {
    const id = event.detail?.id;
    if (!id) return;

    const existing = customThemes.find(theme => theme.id === id);
    if (!existing) return;

    customThemes = customThemes.filter(theme => theme.id !== id);
    persistCustomThemes(customThemes);
    removeThemeFromCloud(id);

    if (selectedThemeId === id) {
      const fallback = customThemes[customThemes.length - 1] || STYLE_PRESETS[0] || null;
      if (fallback) {
        applyThemePreset(fallback);
      } else {
        controlColors = normalizeControlColors();
        blockTheme = normalizeBlockTheme();
        selectedThemeId = CUSTOM_THEME_ID;
        currentThemePreviewBg = DEFAULT_PREVIEW_BG;
        persistControlColors(controlColors);
        persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
      }
    }

    showAdvancedCssPage = false;
  }

  function handleAdvancedThemeDuplicate(event) {
    const payload = normalizeThemePayload(event.detail || {});
    if (!payload) return;

    const newTheme = createCustomThemePayload(payload);
    if (!newTheme) return;

    customThemes = [...customThemes, newTheme];
    persistCustomThemes(customThemes);
    pushThemeToCloud(newTheme);

    applyThemePreset(newTheme);
    showAdvancedCssPage = false;
  }

  onMount(() => {
    typeScales = loadTypeScales();
    applyTypeScale();
    const stopWatchingTypeScale = watchTypeScale();

    const storedCustomThemes = loadStoredCustomThemes();
    if (storedCustomThemes.length) {
      customThemes = storedCustomThemes;
    }

    const storedControlColors = loadStoredControlColors();
    if (storedControlColors) {
      controlColors = storedControlColors;
    }

    const storedTheme = loadStoredBlockTheme();
    if (storedTheme?.theme) {
      blockTheme = storedTheme.theme;
      selectedThemeId = storedTheme.id ?? CUSTOM_THEME_ID;
    } else {
      selectedThemeId = 'default-dark';
    }

    const combinedThemes = [...STYLE_PRESETS, ...storedCustomThemes];
    if (selectedThemeId !== CUSTOM_THEME_ID) {
      const preset = combinedThemes.find(theme => theme.id === selectedThemeId);
      if (preset) {
        applyThemePreset(preset, { persistSelection: false });
      } else if (STYLE_PRESETS.length) {
        applyThemePreset(STYLE_PRESETS[0], { persistSelection: false });
        selectedThemeId = STYLE_PRESETS[0].id;
      }
    }

    if (selectedThemeId === CUSTOM_THEME_ID) {
      themeExtras = loadStoredThemeExtras();
      showBuddyIcons(CUSTOM_THEME_ID);
    }

    const activeTheme =
      combinedThemes.find(theme => theme.id === selectedThemeId) || null;
    if (activeTheme) {
      currentThemePreviewBg = activeTheme.previewBg ?? DEFAULT_PREVIEW_BG;
    } else if (controlColors?.canvas?.innerBg) {
      currentThemePreviewBg = controlColors.canvas.innerBg;
    } else {
      currentThemePreviewBg = DEFAULT_PREVIEW_BG;
    }

    return stopWatchingTypeScale;
  });

  function themeShadowIsDisabled(shadow) {
    if (shadow == null) return false;
    const normalized = String(shadow).trim().toLowerCase();
    return normalized === 'none' || normalized === '0' || normalized === '0px' || normalized === '0 0';
  }

  $: simpleNoteBlockShadow = themeShadowIsDisabled(blockTheme?.shadow)
    ? 'none'
    : '0 0 2px 1px var(--text), 0 0 6px 2px var(--text)';
  $: simpleNoteBorderColor = themeShadowIsDisabled(blockTheme?.shadow)
    ? 'var(--bg)'
    : 'var(--text)';

  // The opacities are stored as plain numbers, because that is what a slider
  // reads and writes and what a saved theme should hold — a bare 80 survives a
  // round trip through JSON and a future editor in a way that '80%' does not.
  // CSS wants the unit, and both places these land — color-mix()'s percentage
  // and `opacity` — accept one, so a single suffix here serves the surface, the
  // header and the writing alike.
  $: blockThemeCssVars = [
    ...Object.entries(blockTheme || {})
      // The selection settings are optional: left empty they must not be
      // declared at all, so ::selection falls back to the theme's own colours
      // (an empty custom property would win over the fallback and draw nothing).
      .filter(([key, value]) => !(key.startsWith('selection') && (value == null || String(value).trim() === '')))
      .map(([key, value]) => {
        const css = key.endsWith('Opacity') ? `${value}%` : value;
        return `--block-${toCssVarName(key)}: ${css}`;
      }),
    `--simple-note-block-shadow: ${simpleNoteBlockShadow}`,
    `--simple-note-border-color: ${simpleNoteBorderColor}`
  ].join('; ');

  // The theme, stated once at the top of the app so everything below inherits
  // it.
  //
  // Every other set of colours here is scoped to something — --block-* to a
  // block, --left-* to the left panel, --canvas-* to a mode — which meant a new
  // input or scroller had nothing general to reach for and each one invented
  // its own hardcoded fallback. That is why the habit tracker's placeholder was
  // browser grey and its surfaces were navy: not a decision, just the absence
  // of one.
  //
  // These are the app's colours. Anything added from here on should read them,
  // and then it follows the theme without its author having to remember to make
  // it. --sb-track and --sb-thumb are seeded here too, so scrollbars are themed
  // by default rather than in the handful of containers that thought to.
  $: appTextColor = canvasTheme.textColor || getReadableTextColor(canvasTheme.outerBg);
  $: appThemeCssVars = [
    `--app-bg: ${canvasTheme.outerBg}`,
    `--app-text: ${appTextColor}`,
    // Tints of the text colour over the background, so they hold up on a light
    // theme and a dark one without either being named.
    `--app-surface: color-mix(in srgb, ${appTextColor} 8%, transparent)`,
    `--app-border: color-mix(in srgb, ${appTextColor} 22%, transparent)`,
    `--app-muted: color-mix(in srgb, ${appTextColor} 60%, transparent)`,
    `--sb-track: transparent`,
    `--sb-thumb: color-mix(in srgb, ${appTextColor} 40%, transparent)`,
    // What pop-ups sit on, for a theme that says: the panels a toolbar button
    // opens read it before their own colour. See utils/outlineTheme.js.
    ...(themeExtras.popupBg ? [`--app-popup-bg: ${themeExtras.popupBg}`] : [])
  ].join('; ');

  function handleThemeSelect(event) {
    const themeId = event.detail?.id;
    if (!themeId) return;
    if (themeId === CUSTOM_THEME_ID) {
      selectedThemeId = CUSTOM_THEME_ID;
      currentThemePreviewBg =
        controlColors?.canvas?.innerBg ?? DEFAULT_PREVIEW_BG;
      persistBlockTheme(blockTheme, CUSTOM_THEME_ID);
      return;
    }
    const preset = availableThemes.find(theme => theme.id === themeId);
    if (!preset) return;
    applyThemePreset(preset);
  }

  const DEFAULT_HISTORY_TRIGGERS = {
    text: ['position', 'size', 'bgColor', 'textColor'],
    cleantext: ['position', 'size', 'bgColor', 'textColor'],
    image: ['position', 'size', 'bgColor', 'textColor', 'src', 'crop'],
    music: ['position', 'size', 'bgColor', 'textColor', 'playlistId', 'trackUrl', 'title', 'content'],
    embed: ['position', 'size', 'bgColor', 'textColor', 'content'],
    task: ['tasks', 'title'],
    nest: ['position', 'size', 'bgColor', 'textColor', 'links', 'title'],
    page: ['position', 'size', 'bgColor', 'textColor', 'title', 'rows', 'narrowRows'],
    calendar: ['position', 'size', 'bgColor', 'textColor', 'title', 'events', 'nextColor'],
    clock: ['position', 'size', 'bgColor', 'textColor', 'hour12', 'showSeconds', 'showDate', 'alarmTime', 'alarmEnabled'],
    __default: ['position', 'size', 'bgColor', 'textColor', 'content', 'src', 'trackUrl', 'title']
  };

  const KNOWN_MODES = [...MODE_ORDER];
  const MODE_LABELS = Object.fromEntries(
    Object.values(MODE_DEFINITIONS).map((definition) => [definition.id, definition.label])
  );

  function applyHistoryTriggers(block) {
    const triggers =
      block.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[block.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;
    return { ...block, historyTriggers: triggers };
  }

  function ensureModeOrders(allBlocks, incomingOrders = {}) {
    const idsInBlockOrder = allBlocks.map(block => block.id);
    const validIds = new Set(idsInBlockOrder);
    // A mode with an order of its own (Page) keeps none here.
    const modeNames = new Set([
      ...KNOWN_MODES.filter(name => !MODE_DEFINITIONS[name]?.ownOrder),
      ...Object.keys(incomingOrders || {})
    ]);

    const normalized = {};
    for (const name of modeNames) {
      const existing = Array.isArray(incomingOrders?.[name])
        ? incomingOrders[name].filter(id => validIds.has(id))
        : [];
      const missing = idsInBlockOrder.filter(id => !existing.includes(id));
      normalized[name] = [...existing, ...missing];
    }

    return normalized;
  }

  function cloneModeOrders(orders) {
    const clone = {};
    for (const [modeName, order] of Object.entries(orders || {})) {
      clone[modeName] = [...order];
    }
    return clone;
  }

  function cloneState(blockList, orders, { bumpVersion = true } = {}) {
    const normalizedOrders = ensureModeOrders(blockList, orders);
    const blocksClone = blockList.map(block => ({
      ...block,
      _version: bumpVersion ? (block._version || 0) + 1 : block._version ?? 0,
      position: { ...block.position },
      size: { ...block.size }
    }));

    return {
      blocks: blocksClone,
      modeOrders: cloneModeOrders(normalizedOrders),
      // The habits, so the Undo button reaches them -- see
      // utils/undoableSettings.js for what is in and what is left out.
      settings: settingsForHistory(modeSettings)
    };
  }

  function serializeState(blockList, orders, { bumpVersion = false } = {}) {
    const snapshot = cloneState(blockList, orders, { bumpVersion });
    return JSON.stringify(snapshot);
  }

  let controlsRef;
  let canvasRef;
  let controlsResizeObserver;
  let observedControlsEl;

  let mode = getDefaultModeForViewport();
  let modeSettings = normalizeModeSettings();
  $: simpleNoteColumnCount = modeSettings.simple.columnCount;
  // A theme may bring its own single-note background. It is layered over the
  // file's settings instead of being written into the save, so it follows the
  // theme across every file rather than sticking to whichever one happened to
  // be open when the theme was picked — and it leaves saves untouched, so
  // dropping the theme takes the background with it.
  // One wallpaper per folder: Canvas's picture and settings, drawn by every
  // mode (see hasWallpaper in modeRegistry.js). The name is from
  // when Single Note had one of its own, which is now deleted -- see
  // normalizeModeSettings.
  $: singleNoteSettings = withThemeBackground(modeSettings.default, themeExtras);
  // Canvas keeps whatever the folder itself set, and nothing else. A theme
  // supplying a wallpaper is a Single Note arrangement; having one appear over
  // the board the moment somebody changed theme would be a surprise rather
  // than a feature.
  $: canvasBackgroundSettings = modeSettings.default;

  function withThemeBackground(single, theme) {
    const themeBg = theme?.singleBackground;
    // A background the reader chose themselves outranks the theme's, and
    // removing the theme's one sets bgThemeOptOut so it stays gone.
    if (!themeBg || single.bgThemeOptOut || single.backgroundImage) return single;
    return {
      ...single,
      backgroundImage: themeBg.desktop,
      backgroundImageMobile: single.backgroundImageMobile || themeBg.mobile,
      backgroundFromTheme: true
    };
  }
  $: taskAddDirection = modeSettings.task.addDirection;
  $: habits = modeSettings.habit.habits;
  $: activeModeDefinition = getModeDefinition(mode);
  $: showRightControls = activeModeDefinition?.showRightControls !== false;
  let blocks = [];
  let modeOrders = {};
  let normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  let modeOrderedBlocks = [];
  let focusedBlockId = null;
  $: normalizedModeOrders = ensureModeOrders(blocks, modeOrders);
  $: modeOrderedBlocks = (() => {
    const order = normalizedModeOrders[mode] || [];
    const blockMap = new Map(blocks.map(block => [block.id, block]));
    const ordered = [];
    for (const id of order) {
      const block = blockMap.get(id);
      if (block) ordered.push(block);
    }
    if (ordered.length < blocks.length) {
      const seen = new Set(order);
      for (const block of blocks) {
        if (!seen.has(block.id)) {
          ordered.push(block);
        }
      }
    }
    return ordered;
  })();
  let currentSaveName = "default";
  let savedList = [];
  let firebaseReady = isFirebaseConfigured();
  let authUser = null;
  // Whether Firebase has said anything yet, which is not the same as being
  // signed out. Until it has, "no user" means "not asked", and the startup gate
  // has to tell those apart to know whether it is still worth waiting.
  let authStateResolved = false;
  let stopConnectionWatch = null;
  let stopWallpaperWatch = null;
  // The account's stored-byte record, streamed from storage/{uid}. Null until
  // someone signs in and the first snapshot arrives.
  let storageUsage = null;
  let subscriptionRecord = null;
  // The account's plan, as the server keeps it. Undefined until it arrives,
  // null when none is recorded (free). See utils/planLimits.js.
  let accountPlan = undefined;
  let stopPlanListener = null;
  // What this device has added or removed since the server's last word, and
  // the last time the two disagreed. See utils/storageEstimate.js: the
  // server's figure is the truth and this only covers the gap until it
  // arrives -- about thirty seconds, measured.
  let pendingStorageBytes = 0;
  let lastStorageDrift = null;

  // What the app shows and judges by: the server's record, with its ceiling
  // taken from the account's current plan rather than the one it was written
  // under, and this device's uncounted changes folded in. See planLimits.js.
  $: planUsage = usageForPlan(storageUsage, accountPlan);
  $: shownStorageUsage = estimatedUsage(planUsage, pendingStorageBytes);
  // When each lock last got somewhere, so one that stopped moving can be let
  // go of. The flags below are cleared in a `finally`, which covers finishing
  // and covers failing — but not an await that never settles, and that is the
  // one that leaves sync stuck until the app is force-stopped. See
  // utils/syncLocks.js.
  let lockProgress = { upload: null, download: null, bootstrap: null, gate: null };

  function takeLock(name) {
    lockProgress = { ...lockProgress, [name]: Date.now() };
  }

  /** Still getting somewhere. Called as each step lands, not once at the start. */
  function lockProgressed(name) {
    if (lockProgress[name] === null) return;
    lockProgress = { ...lockProgress, [name]: Date.now() };
  }

  function releaseLock(name) {
    lockProgress = { ...lockProgress, [name]: null };
  }

  // Absolute rather than incremental, like every other recomputing pass here:
  // it looks at how long each lock has sat without progress and decides from
  // that, so it is safe to run at any time and safe to run twice.
  function releaseStalledSyncLocks() {
    if (!anyHeld(lockProgress)) return;

    const stalled = stalledLocks(lockProgress);
    for (const name of stalled) {
      if (name === 'upload') uploadInProgress = false;
      if (name === 'download') downloadInProgress = false;
      if (name === 'bootstrap') cloudBootstrapInProgress = false;
      if (name === 'gate') cloudSyncGateInProgress = false;
      releaseLock(name);
      logSync(
        'error',
        currentSaveName,
        `sync ${name} stopped responding and was released, so syncing can carry on`
      );
    }
  }

  let uploadInProgress = false;
  let downloadInProgress = false;
  let fileInputRef;

  // Native window.alert/confirm/prompt are unreliable (or entirely non-functional)
  // inside Capacitor's Android WebView and Tauri's WebView2 host - they must be
  // replaced with an in-app dialog that works the same everywhere.
  let dialogState = null;
  let dialogInputValue = '';
  $: dialogInputValue = dialogState?.defaultValue ?? '';

  function autofocusAction(node) {
    node.focus();
    node.select?.();
  }

  function showDialog(type, message, defaultValue = '', options = null) {
    return new Promise((resolve) => {
      dialogState = { type, message, defaultValue, options, resolve };
    });
  }

  // Multi-way question: resolves to the chosen option's id, or null if dismissed.
  function appChoice(message, options) {
    return showDialog('choice', message, '', options);
  }

  function appAlert(message) {
    return showDialog('alert', message);
  }

  function appConfirm(message) {
    return showDialog('confirm', message);
  }

  function appPrompt(message, defaultValue = '') {
    return showDialog('prompt', message, defaultValue);
  }

  function resolveDialog(value) {
    dialogState?.resolve?.(value);
    dialogState = null;
  }

  function handleDialogConfirm(inputValue) {
    if (!dialogState) return;
    if (dialogState.type === 'prompt') {
      resolveDialog(inputValue);
    } else if (dialogState.type === 'confirm') {
      resolveDialog(true);
    } else {
      resolveDialog(undefined);
    }
  }

  function handleDialogCancel() {
    if (!dialogState) return;
    if (dialogState.type === 'confirm') {
      resolveDialog(false);
    } else {
      resolveDialog(null);
    }
  }

  setContext('appDialogs', { alert: appAlert, confirm: appConfirm, prompt: appPrompt });

  // ── Every folder, as a nest shows it ──────────────────────────────────
  // Name, id and cover of each folder (utils/folderDirectory.js), worked out
  // whole from the folders themselves whenever the list of folders or the
  // open folder changes -- never patched by edits. NestBlock reads it, and
  // opens a folder through `open`.
  const folderDirectory = writable([]);
  const openFolderName = writable('');
  $: openFolderName.set(currentSaveName);
  let directoryRun = 0;
  async function refreshFolderDirectory(names) {
    const run = ++directoryRun;
    const cards = [];
    for (const name of names || []) {
      try {
        cards.push(folderCard(name, await loadBlocks(name)));
      } catch {
        // A folder that cannot be read is left out until it can.
      }
      if (run !== directoryRun) return;
    }
    folderDirectory.set(cards.sort((a, b) => a.name.localeCompare(b.name)));
  }
  $: refreshFolderDirectory(savedList, currentSaveName);
  const folderPages = writable([]);
  $: folderPages.set(blocks.filter(b => b.type === 'page').map(b => ({ id: b.id, title: b.title || '', cover: pageCover(b, blocks) })));
  setContext('folders', {
    directory: folderDirectory,
    current: openFolderName,
    pages: folderPages,
    open: name => goToPlace({ folder: name, pageId: null }),
    openPage: id => goToPlace({ folder: currentSaveName, pageId: id }),
    newFolder: name => makeFolderNamed(name),
    newPage: title => makePageNamed(title)
  });

  $: leftTheme = controlColors.left || CONTROL_COLOR_DEFAULTS.left;
  // The toolbar's buttons are coloured with buttonText, not textColor, and on
  // several themes (Copper Lagoon among them) those two differ sharply. The
  // player sits among those buttons, so it follows the same one they do.
  $: controlsStyle =
    `--controls-bg: ${leftTheme.panelBg}; --controls-border: ${leftTheme.borderColor};` +
    ` --controls-text: ${leftTheme.textColor};` +
    ` --controls-button-text: ${leftTheme.buttonText};` +
    ` --controls-button-bg: ${leftTheme.buttonBg};` +
    // The bar's colour with its see-through taken off: for what is drawn over
    // the content rather than beside it (the column that hides).
    ` --controls-bg-solid: ${solidColor(leftTheme.panelBg, '#111111')};` +
    // What the mini player darkens its cover art with, and sits on without
    // one. The toolbar's own colour unless the theme names one -- a
    // see-through theme's toolbar is clear, which left the cover bare behind
    // the buttons. See playerVeil in utils/outlineTheme.js.
    ` --player-veil: ${themeExtras.playerVeil || leftTheme.panelBg};`;
  // Dialogs and the sync banner render outside .app, so they can't inherit its
  // theme vars — hand them the right-panel palette directly.
  $: rightTheme = controlColors.right || CONTROL_COLOR_DEFAULTS.right;

  // The pop-up windows for timers and alarms are separate pages, so they are
  // handed the theme's dialog colours through local storage, which they share
  // with this window -- see utils/clockPopups.js.
  $: sharePopupTheme(themeExtras.popupBg || rightTheme.panelBg, rightTheme.textColor, leftTheme.buttonText, rightTheme.borderColor);
  function sharePopupTheme(bg, text, accent, border) {
    try {
      localStorage.setItem(POPUP_THEME_KEY, JSON.stringify({ bg, text, accent, border }));
    } catch { /* the pop-ups fall back to plain dark */ }
  }
  $: overlayThemeStyle =
    // A theme's popupBg, when it has one, is what a dialog sits on -- see
    // utils/outlineTheme.js. Otherwise the settings panel's own colour.
    `--dlg-bg: ${themeExtras.popupBg || rightTheme.panelBg}; --dlg-text: ${rightTheme.textColor};` +
    ` --dlg-bg-solid: ${solidColor(themeExtras.popupBg || rightTheme.panelBg, '#17171a')};` +
    ` --dlg-border: ${rightTheme.borderColor}; --dlg-btn-bg: ${rightTheme.buttonBg};` +
    ` --dlg-btn-text: ${rightTheme.buttonText};`;
  // Modes used to derive their own readable text colour from the canvas
  // background, which meant they ignored the palette the theme actually
  // specifies. Hand them the theme's text colour and let them fall back to the
  // derived one only when a theme doesn't state one.
  $: canvasTheme = {
    ...(controlColors.canvas || CONTROL_COLOR_DEFAULTS.canvas),
    textColor: themeExtras.blockDefaults?.textColor || ''
  };
  let Pc = window.innerWidth > MOBILE_BREAKPOINT;
  let deferredLastSaveName = '';
  let deferredLastSaveReason = '';
  let deferredLastSaveTimer = null;
  const DEFERRED_LAST_SAVE_AUTO_DISMISS_MS = 20000;
  let cloudNeedsAttachmentUpload = false;
  let cloudBootstrapInProgress = false;
  let cloudBootstrapComplete = false;
  let cloudSyncGateInProgress = false;
  let pullInFlight = false;
  // Set while a copy from the cloud is being written and the workspace brought
  // up to date with it. Anything captured before that finishes is stale -- see
  // saveVerdict in utils/saveScheduling.js for what happens to a save that
  // arrives in the middle, and why it is dropped rather than held.
  let applyingRemoteCopy = false;
  // Held while the app checks the cloud on coming back, the same way it is held
  // at startup: readable, scrollable, not editable. Without it, the first thing
  // somebody does on returning to a phone is type into a copy that is about to
  // be replaced.
  let resumeCheckInProgress = false;
  // What the last upload attempt actually said, so a folder that will not go up
  // says so on screen. It used to fail into the console alone, where nobody
  // running the packaged app can see it, which is how an account could stop
  // syncing without anything looking wrong.
  let syncFailureNotice = '';
  // The cloud accepts nothing from this version any more (checkSyncCompatibility):
  // it still downloads, but stops sending -- every send would be refused, and
  // was reported as the daily limit (2026-11-11). Said once, then quiet.
  let syncTooOld = false;
  // Folders found ahead of the cloud at launch (aheadOfCloud), owed an upload
  // whatever else marks the sync clean meanwhile: opening the folder after
  // the launch sync did, and cancelled it (2026-11-11). Cleared once the
  // upload pass has been through them.
  let owedSinceLaunch = new Set();
  // The worst storage state this account has been told about since it was last
  // comfortable. Kept so a record that is rewritten on every upload does not
  // put the same banner back every few seconds -- see utils/storageAlerts.js.
  let announcedStorageState = '';

  // Said when it changes, not when an upload is refused. The failure path in
  // syncErrors.js is the same sentence arriving too late to act on: by then a
  // picture has already not saved.
  $: if (shownStorageUsage) {
    const verdict = storageAnnouncement({
      state: describeStorageUsage(shownStorageUsage).state,
      announced: announcedStorageState
    });
    announcedStorageState = verdict.announced;
    if (verdict.announce) syncFailureNotice = verdict.message;
  }
  let cloudSyncMemoryByFile = loadCloudSyncMemory();
  let autoSyncEnabled = loadAutoSyncEnabled();
  let autoSyncUploadIntervalId = null;
  // Downloads used to have no equivalent. See startAutoSyncDownloadBackstop.
  let autoSyncDownloadIntervalId = null;
  let stopRemoteIndexWatch = () => {};
  let autoSyncDirty = false;
  // Per file, not a single joined string - lets the upload tick re-sync only
  // the file(s) that actually changed instead of every saved file.
  let lastAutoSyncFingerprintByFile = {};
  let lastAutoSyncAttachmentFingerprintByFile = {};
  let lastRemoteSyncFingerprint = '';

  // The cloud's stamp for each folder the last time this device saw the
  // cloud's copy -- downloaded, or its own uploaded -- kept across restarts,
  // per account. An upload that finds the cloud has moved on since is a
  // conflict, and keeps both versions (utils/syncConflict.js).
  let cloudSeen = {};
  let cloudSeenFor = null;
  $: if (authUser?.uid && authUser.uid !== cloudSeenFor) {
    cloudSeenFor = authUser.uid;
    cloudSeen = readSeen(typeof localStorage === 'undefined' ? null : localStorage, authUser.uid);
  }
  function noteCloudSeen(fileName, modifiedAt) {
    const at = Number(modifiedAt) || 0;
    if (!at || !authUser?.uid) return;
    cloudSeen = { ...cloudSeen, [fileName]: at };
    writeSeen(typeof localStorage === 'undefined' ? null : localStorage, authUser.uid, cloudSeen);
  }

  function rememberCloudSyncForFile(fileName, syncedAt = Date.now()) {
    cloudSyncMemoryByFile = {
      ...cloudSyncMemoryByFile,
      [fileName]: Number(syncedAt) || Date.now()
    };
    persistCloudSyncMemory(cloudSyncMemoryByFile);
  }

  // Set when a block is deleted, so the sweep below only runs on a save that
  // could have orphaned something. Sweeping every save would mean listing
  // storage every few seconds while someone types, for an answer that is
  // almost always "nothing to do".
  let blocksWereDeleted = false;

  // Runs after the save, never before it, and never allowed to fail it: a
  // leftover upload is a smaller problem than a note that would not save.
  // The block ids come from the folder that was actually saved, never from
  // whatever is on screen now. Reading the live `blocks` looked equivalent and
  // is not: delete a block, then switch folders before the save flushes, and
  // the sweep would run with one folder's name and another folder's ids. None
  // would match, and it would delete every attachment the first folder owned.
  // This function removes things permanently, so it is told exactly what was
  // written rather than asked to assume.
  async function sweepDeletedBlockAttachments(fileName, savedPayload) {
    if (!blocksWereDeleted || !firebaseReady || !authUser) return;
    blocksWereDeleted = false;

    const savedBlocks = savedPayload?.blocks;
    // No blocks in the payload is not the same as a folder with no blocks: it
    // is a payload this code did not understand, and the safe reading of that
    // is to remove nothing.
    if (!Array.isArray(savedBlocks)) return;

    try {
      await sweepOrphanBlockAttachments(fileName, savedBlocks.map(block => block?.id));
    } catch (error) {
      console.warn('Could not remove attachments for deleted blocks:', error);
    }
  }

  async function saveRemoteFileWithMemory(fileName, payload, options = {}) {
    // On a full account the deletions go up before anything is uploaded --
    // otherwise the save that would record them is the save that fails, and
    // deleting can never make room. See freeSpaceBeforeSaving.
    if (freeSpaceBeforeSaving({ deletedBlocks: blocksWereDeleted, usage: shownStorageUsage })) {
      await sweepDeletedBlockAttachments(fileName, payload);
    }

    const result = await saveRemoteFile(fileName, payload, options);
    const syncedAt = Date.now();
    rememberCloudSyncForFile(fileName, syncedAt);
    await sweepDeletedBlockAttachments(fileName, payload);
    await sweepWallpapersFor(fileName, payload);
    return result;
  }

  // Uploaded wallpapers a folder no longer uses: replaced, removed, or the old
  // Single Note one (see staleWallpaperObjects). Looked at once per folder per
  // session and again whenever a wallpaper changes -- worked out afresh from
  // storage each time rather than from a record of what changed, so a picture
  // left behind by an earlier build or another device is found too. Like the
  // block sweep, after the save and never allowed to fail it.
  const wallpapersSwept = new Set();
  let wallpaperChanged = false;

  async function sweepWallpapersFor(fileName, savedPayload) {
    if (!firebaseReady || !authUser) return;
    if (wallpapersSwept.has(fileName) && !wallpaperChanged) return;
    const wallpaper = savedPayload?.modeSettings?.default;
    // A payload without its settings is one this code does not understand,
    // and the safe reading of that is to remove nothing.
    if (!wallpaper || typeof wallpaper !== 'object') return;

    wallpapersSwept.add(fileName);
    wallpaperChanged = false;
    try {
      await sweepStaleWallpapers(fileName, wallpaper);
    } catch (error) {
      console.warn('Could not remove wallpapers the folder no longer uses:', error);
    }
  }

  // --- Undo/Redo history ---
  let history = [];
  let historyIndex = -1;

  // What each block's component is showing, as blockState -- so a history
  // step rebuilds only the blocks that are out of date rather than all of
  // them. See utils/blockVersions.js.
  const shownBlocks = new Map();
  function markShown(blockList) {
    for (const block of blockList || []) {
      if (block?.id) shownBlocks.set(block.id, blockState(block));
    }
  }
  // A block that appears without a history step -- a folder opened, a block
  // arriving by sync -- is built from what is stored, so that is what it
  // shows. Only ids not seen yet: one already recorded keeps its record until
  // something says otherwise.
  $: for (const block of blocks || []) {
    if (block?.id && !shownBlocks.has(block.id)) shownBlocks.set(block.id, blockState(block));
  }
  let hasUnsnapshottedChanges = false;

  async function ensureCurrentHistorySnapshot() {
    if (!blocks.length && history.length) return;

    if (!hasUnsnapshottedChanges) return;

    if (!history.length) {
      await pushHistory(blocks, modeOrders, { persist: false });
      return;
    }

    const isAtLatestSnapshot = historyIndex === history.length - 1;
    if (!isAtLatestSnapshot) return;

    const currentSnapshot = serializeState(blocks, modeOrders, {
      bumpVersion: false
    });
    const latestHistorySnapshot = history[historyIndex];

    if (latestHistorySnapshot !== currentSnapshot) {
      await pushHistory(blocks, modeOrders, { persist: true });
    } else {
      hasUnsnapshottedChanges = false;
    }
  }

  // ---- Save queue: prevents concurrent writes that cause missing chars ----
  let _saveInFlight = false;
  let _pendingSave = null;       // latest payload waiting to run
  let _debounceTimer = null;     // for non-critical (typing) saves
  // When the current run of unsaved changes began. The deadline in
  // nextSaveDelay is measured from this and never moves, so no amount of
  // continued typing can hold a write off indefinitely.
  let _firstQueuedAt = 0;

  function flushPendingSave() {
    _debounceTimer = null;
    _firstQueuedAt = 0;

    if (!_pendingSave) return;
    const payload = _pendingSave;
    _pendingSave = null;
    _runSave(payload);
  }

  async function persistAutosave(blocksToPersist, ordersToPersist = modeOrders, settingsToPersist = modeSettings, { immediate = false } = {}) {
    // Not while a folder is opening: what is on screen then belongs to neither
    // folder, and this used to write an empty one over "default" -- see
    // mayTakeSave in utils/saveScheduling.js.
    if (!mayTakeSave({ folderOpening })) {
      logSync('skip', openingFolderName, 'not saved: the folder is still opening, and what is on screen is not it yet');
      console.warn('A save was asked for while a folder was opening, and dropped.', new Error().stack);
      return;
    }

    // No folder open — a fresh install, or the last one was just deleted.
    // Adopt a name so the first edit creates a folder instead of being
    // silently dropped -- one no folder has, so it never lands on somebody's
    // "default" (see nameForUnnamedSave).
    if (!currentSaveName) currentSaveName = nameForUnnamedSave(savedList);
    persistLastSaveName(currentSaveName);

    const payload = {
      // The folder this was made in, written there whenever it runs.
      folder: currentSaveName,
      blocks: blocksToPersist,
      orders: ordersToPersist,
      modeSettings: settingsToPersist
    };

    if (!immediate) {
      // Replace whatever was queued — only the newest state is worth writing —
      // and restart the quiet window. Restarting is the point: the previous
      // version armed a timer on the first keystroke and then returned early on
      // every one after it, which is a 300ms throttle rather than a debounce,
      // and wrote the whole folder that often for as long as typing continued.
      _pendingSave = payload;

      const now = Date.now();
      if (!_firstQueuedAt) _firstQueuedAt = now;

      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(
        flushPendingSave,
        nextSaveDelay({ now, firstQueuedAt: _firstQueuedAt })
      );
      return;
    }

    // Immediate: flush debounce timer, run (or queue behind in-flight save)
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    _firstQueuedAt = 0;
    _pendingSave = null;
    await _runSave(payload);
  }

  // Key order isn't stable between an in-memory block and the same block read
  // back from storage, so compare with sorted keys rather than raw JSON.
  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort()
        .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  // Fields that change as the UI renders but say nothing about saved content.
  // Fields that live on a block but are not part of what the folder *is*.
  //
  // Each of these is either bookkeeping or something this device worked out for
  // itself, and none of them is an edit. Syncing them made two instances
  // disagree for ever: scrollTop is where you happen to have scrolled inside a
  // text block, different per device and per window, and a round trip through
  // the database changed it on its own — 1384.177734375 came back as 1384, and
  // that alone was enough to restart the loop. resolvedSrc and its companion
  // are worked out from src when a picture is fetched, so they belong to this
  // session rather than to the note.
  const VOLATILE_BLOCK_KEYS = [
    '_version',
    'editing',
    'scrollTop',
    'resolvedSrc',
    'attachmentRequiresAuth'
  ];

  // The folder reduced to what a save actually compares: no volatile keys, and
  // nothing the database cannot hold. The fingerprint is this, stringified.
  //
  // The log diffs these rather than the raw folders, so it can only ever name a
  // field that genuinely caused the write. Diffing the raw ones reported
  // _version on every block — stripped here, so it never caused anything — and
  // a log that points at the wrong field is worse than no log.
  function comparableSave(blocksValue, ordersValue, settingsValue) {
    const cleanedBlocks = (blocksValue || []).map(block => {
      // Theme paint is undone first: it is derived from this device's theme, so
      // comparing it would make two devices on different themes disagree for
      // ever, each rewriting what the other wrote.
      const copy = { ...unpaintThemeColours(block) };
      for (const key of VOLATILE_BLOCK_KEYS) delete copy[key];
      return withoutEmptyValues(copy) ?? {};
    });
    return {
      blocks: cleanedBlocks,
      modeOrders: withoutEmptyValues(ordersValue) ?? {},
      modeSettings: withoutEmptyValues(settingsValue) ?? {}
    };
  }

  function saveContentFingerprint(blocksValue, ordersValue, settingsValue) {
    return stableStringify(comparableSave(blocksValue, ordersValue, settingsValue));
  }

  async function _runSave(payload) {
    const folder = saveTarget(payload, currentSaveName);
    const verdict = saveVerdict({ applyingRemoteCopy, saveInFlight: _saveInFlight });

    if (verdict === 'discard') {
      // Not queued. This payload is the blocks as they were before the cloud
      // copy landed; running it afterwards is exactly how a folder ends up
      // reverted with a fresh timestamp on it.
      logSync('skip', folder, 'a cloud copy is landing, so this save is stale');
      return;
    }

    if (verdict === 'queue') {
      _pendingSave = payload; // queue behind in-flight save
      return;
    }

    _saveInFlight = true;
    try {
      const normalizedOrders = ensureModeOrders(payload.blocks, payload.orders);
      const normalizedSettings = normalizeModeSettings(payload.modeSettings);

      // Merely opening a folder used to rewrite it, restamping modifiedAt and
      // making an untouched folder look newer than the cloud copy (and worth
      // re-uploading). Skip the write when nothing actually changed.
      // Only a folder that is really stored can be "unchanged": loadBlocks
      // answers a name never saved with an empty folder, and a new folder, empty
      // as new folders are, then looked unchanged and was never written
      // (saveChangesNothing, 2026-11-04).
      const stored = (await listSavedBlocks()).includes(folder);
      const existing = stored ? await loadBlocks(folder) : null;
      if (existing) {
        const before = saveContentFingerprint(
          existing.blocks,
          ensureModeOrders(existing.blocks || [], existing.modeOrders),
          normalizeModeSettings(existing.modeSettings)
        );
        const after = saveContentFingerprint(payload.blocks, normalizedOrders, normalizedSettings);
        if (saveChangesNothing({ stored, before, after })) {
          logSync('skip', folder, 'nothing changed, folder left alone');
          return;
        }
        // The whole question, when two instances will not settle, is what one
        // of them thinks keeps changing. Naming the field answers it outright.
        logSync(
          'save',
          folder,
          'content differs, writing and restamping modifiedAt',
          describeDifference(
            comparableSave(
              existing.blocks,
              ensureModeOrders(existing.blocks || [], existing.modeOrders),
              normalizeModeSettings(existing.modeSettings)
            ),
            comparableSave(payload.blocks, normalizedOrders, normalizedSettings)
          )
        );
      }

      // Emptying a folder keeps what it had first, so Advanced settings has it
      // to give back -- see emptiesFolder.
      if (existing && emptiesFolder({ current: existing, incoming: payload })) {
        await keepReplacedCopy(folder, existing, payload, 'emptied on this device');
      }

      await saveBlocks(folder, {
        blocks: payload.blocks,
        modeOrders: normalizedOrders,
        modeSettings: normalizedSettings
      });
      savedList = await listSavedBlocks();
      autoSyncDirty = true;
    } finally {
      _saveInFlight = false;
      if (_pendingSave) {
        const next = _pendingSave;
        _pendingSave = null;
        _runSave(next);
      }
    }
  }

  function markCloudAttachmentDirty() {
    cloudNeedsAttachmentUpload = true;
  }


  async function pushHistory(newBlocks, newOrders = modeOrders, options = {}) {
    // Only the blocks whose component is out of date get a new version, and so
    // a rebuild: ticking a task used to rebuild every block on the canvas, and
    // text blocks with pictures jumped each time (2026-10-05).
    const stateSnapshot = cloneState(remountOnlyChanged(newBlocks, shownBlocks), newOrders, { bumpVersion: false });
    markShown(stateSnapshot.blocks);
    const snapshot = JSON.stringify(stateSnapshot);

    if (historyIndex >= 0 && history[historyIndex] === snapshot) {
      blocks = stateSnapshot.blocks;
      modeOrders = stateSnapshot.modeOrders;
      if (options.persist !== false) {
        await persistAutosave(stateSnapshot.blocks, stateSnapshot.modeOrders, modeSettings, { immediate: true });
      }
      hasUnsnapshottedChanges = false;
      return;
    }

    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }

    history.push(snapshot);
    historyIndex++;

    blocks = stateSnapshot.blocks;
    modeOrders = stateSnapshot.modeOrders;
    if (options.persist !== false) {
      await persistAutosave(stateSnapshot.blocks, stateSnapshot.modeOrders, modeSettings, { immediate: true });
    }
    hasUnsnapshottedChanges = false;
  }

  function updatedBlockValueForKey(key, existingBlock, blockUpdates) {
    if (key === 'position') {
      return { ...existingBlock.position, ...(blockUpdates.position || {}) };
    }
    if (key === 'size') {
      return { ...existingBlock.size, ...(blockUpdates.size || {}) };
    }
    return blockUpdates[key];
  }

  function areHistoryValuesEqual(previousValue, nextValue) {
    if (
      previousValue &&
      nextValue &&
      typeof previousValue === 'object' &&
      typeof nextValue === 'object'
    ) {
      return JSON.stringify(previousValue) === JSON.stringify(nextValue);
    }
    return previousValue === nextValue;
  }

  function restoreSnapshotBlocks(snapshotBlocksRaw) {
    const currentVersionById = new Map(
      blocks.map(block => [block.id, block._version || 0])
    );

    // Rebuilt only where what comes back differs from what is shown -- see
    // utils/blockVersions.js.
    const restored = restoredVersions(snapshotBlocksRaw, currentVersionById, shownBlocks).map(block => ({
      ...block,
      position: { ...block.position },
      size: { ...block.size }
    }));
    markShown(restored);
    return restored;
  }

  async function undo() {
    await ensureCurrentHistorySnapshot();

    if (historyIndex > 0) {
      historyIndex--;
      const snapshotState = JSON.parse(history[historyIndex]) || {};
      const snapshotBlocks = restoreSnapshotBlocks(snapshotState.blocks || []);
      const snapshotOrders = ensureModeOrders(
        snapshotBlocks,
        snapshotState.modeOrders
      );
      blocks = [...snapshotBlocks];
      modeOrders = cloneModeOrders(snapshotOrders);
      modeSettings = settingsFromHistory(modeSettings, snapshotState);
      await persistAutosave(snapshotBlocks, snapshotOrders, modeSettings, { immediate: true });
    }
  }

  async function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      const snapshotState = JSON.parse(history[historyIndex]) || {};
      const snapshotBlocks = restoreSnapshotBlocks(snapshotState.blocks || []);
      const snapshotOrders = ensureModeOrders(
        snapshotBlocks,
        snapshotState.modeOrders
      );
      blocks = [...snapshotBlocks];
      modeOrders = cloneModeOrders(snapshotOrders);
      modeSettings = settingsFromHistory(modeSettings, snapshotState);
      await persistAutosave(snapshotBlocks, snapshotOrders, modeSettings, { immediate: true });
    }
  }

  // F11 toggles fullscreen. Using the web Fullscreen API rather than Tauri's
  // window API keeps one code path across the desktop app, the site and
  // Android — WebView2 honours it and drops the title bar. Escape leaves
  // fullscreen on its own, handled by the browser.
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      // Denied (no user gesture, or the platform refuses) — not worth a dialog.
      console.error('Fullscreen toggle failed:', error);
    }
  }

  // Only the desktop shell needs this: a real browser already has its own F11,
  // and hijacking it there would swap familiar behaviour for a worse copy.
  function isDesktopShell() {
    return typeof window !== 'undefined'
      && !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  }

  function handleFullscreenShortcut(event) {
    if (event.key !== 'F11' || !isDesktopShell()) return;
    event.preventDefault();
    toggleFullscreen();
  }

  // ── Objectives, settled wherever the app is ─────────────────────
  // A time objective's timer finishing, and a daily one starting again, are
  // facts about the clock -- worked out from each task by settleTask. Task mode
  // did it only while it was open, so a timer started there never finished (or
  // moved to Done) while somebody was in another mode. This is the same
  // absolute pass for the whole folder, every 15s and on coming back, so it
  // holds in every mode; the ring itself is AlarmRinger's. Not an undo step,
  // and a task block on the canvas is rebuilt to show it (it keeps its own
  // copy of its tasks). See utils/taskGoals.js.
  // A button pressed on the timer's notification for an objective
  // (utils/goalNotices.js): pause or resume, a minute more, or stop. On one
  // that is ringing, pause and stop answer the ring, as Stop does in the app;
  // the ringer is told, since it keeps the answers it has read.
  function handleGoalAction(event) {
    const { owner, taskId, action, ringKey } = event.detail || {};
    const at = Date.now();
    if (ringKey && (action === 'toggle' || action === 'stop')) {
      try { answerRing(localStorage, ringKey, at); } catch { /* rings out its window */ }
      window.dispatchEvent(new CustomEvent('austavia:goal-answered'));
      return;
    }
    const change =
      action === 'toggle' ? (t, now) => (goalNow(t.goal, now)?.running ? pauseGoalTimer(t, now) : startGoalTimer(t, now))
      : action === 'plus' ? (t, now) => addProgress(t, 60, now)
      : action === 'stop' ? (t, now) => pauseGoalTimer(t, now)
      : null;
    if (!change || !taskId) return;
    if (owner === HABITS_OWNER) {
      handleModeSettingChange({ detail: { habit: { habits: withHabitGoal(modeSettings?.habit?.habits, taskId, change, at) } } });
      return;
    }
    const block = blocks.find(b => b.id === owner && b.type === 'task');
    if (!block || !Array.isArray(block.tasks)) return;
    const tasks = block.tasks.map(t => (t.id === taskId ? change(t, at) : t));
    updateBlockHandler({ detail: { id: block.id, tasks, changedKeys: ['tasks'], pushToHistory: true, bumpVersion: true } });
  }

  function settleTaskGoals() {
    if (folderOpening) return;
    const at = Date.now();
    for (const block of blocks) {
      if (block?.type !== 'task' || !Array.isArray(block.tasks)) continue;
      let changed = false;
      const next = block.tasks.map(task => {
        const settled = settleTask(task, at);
        if (settled !== task) changed = true;
        return settled;
      });
      if (changed) {
        updateBlockHandler({ detail: { id: block.id, tasks: next, changedKeys: ['tasks'], pushToHistory: false, bumpVersion: true } });
      }
    }
    // Habits with an amount or a time, the same way (utils/habitGoals.js).
    // Not an undo step, as for tasks: nobody did it.
    const current = modeSettings?.habit?.habits;
    const settled = settleHabits(current, at);
    if (settled !== current) {
      modeSettings = normalizeModeSettings({ ...modeSettings, habit: { ...modeSettings.habit, habits: settled } });
      persistAutosave(blocks, modeOrders, modeSettings, { immediate: true });
    }
  }

  onMount(() => {
    const pass = setInterval(settleTaskGoals, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') settleTaskGoals(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(pass);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  function handleUndoRedoShortcut(event) {
    const key = event.key?.toLowerCase();
    const hasCommand = event.ctrlKey || event.metaKey;
    if (!hasCommand || key !== "z") return;

    // The editors carry their own undo history, and this listener sits on the
    // window, so a single Ctrl+Z used to run both: the editor stepped back one
    // edit and the workspace stepped back a whole snapshot at the same time.
    // That is how a keystroke meant to remove one image took a page of writing
    // with it, and why redo appeared to work for an instant before the two
    // histories disagreed and it snapped back.
    //
    // While the caret is in text, this one stands aside -- but only text that
    // is really being written in. Focus left behind in a block that is no
    // longer the focused one is released, and the workspace is undone, as the
    // Undo button would. See utils/undoShortcut.js.
    const active = document.activeElement;
    const writing = isTextEntry(active) ? active : isTextEntry(event.target) ? event.target : null;
    const historyKey = writing?.closest?.('[data-history-key]')?.getAttribute('data-history-key') || null;
    const target = undoTarget({
      activeIsText: Boolean(writing),
      activeBlockId: writing?.closest?.('[data-block-id]')?.getAttribute('data-block-id') ?? null,
      focusedBlockId,
      textCanStep: historyKey ? (event.shiftKey ? canRedoText(historyKey) : canUndoText(historyKey)) : null
    });
    if (target === 'text') return;
    if (target === 'release') writing.blur();
    // The note's own handler would otherwise take this keystroke too, and
    // claim it with nothing to undo.
    if (target === 'release' || target === 'pass') event.stopPropagation();

    event.preventDefault();

    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
  }

  // Places a new block without overlapping existing ones. Anchored to the
  // viewport the user is actually looking at (when on the canvas), with a
  // fine-grained sweep that finds real gaps instead of jumping to wherever
  // some unrelated existing block happens to sit.
  // Drop a block where the user is actually looking. Repeat additions cascade
  // by a small step rather than stacking invisibly on the same spot.
  function findViewportCenterPosition(existingBlocks, width, height) {
    const vp = getCanvasViewport();
    if (!vp) return null;

    const CASCADE_STEP = 28;
    const centreX = Math.max(0, vp.canvasX + (vp.canvasVisibleW - width) / 2);
    const centreY = Math.max(0, vp.canvasY + (vp.canvasVisibleH - height) / 2);

    const occupied = (x, y) => existingBlocks.some(b =>
      Math.abs((b.position?.x ?? 0) - x) < 1 && Math.abs((b.position?.y ?? 0) - y) < 1
    );

    let x = centreX;
    let y = centreY;
    for (let step = 0; step < 40 && occupied(x, y); step++) {
      x = centreX + (step + 1) * CASCADE_STEP;
      y = centreY + (step + 1) * CASCADE_STEP;
    }
    return { x, y };
  }

  function findFreePosition(existingBlocks, width, height) {
    const PADDING = 4;
    const SWEEP_STEP = 28;
    const vp = mode === 'default' ? getCanvasViewport() : null;

    function overlaps(x, y) {
      return existingBlocks.some(b => {
        const bx = b.position?.x ?? 0;
        const by = b.position?.y ?? 0;
        const bw = b.size?.width ?? 420;
        const bh = b.size?.height ?? 280;
        return !(x + width + PADDING <= bx || bx + bw + PADDING <= x ||
                 y + height + PADDING <= by || by + bh + PADDING <= y);
      });
    }

    if (!vp) {
      // No live canvas viewport (different mode, or canvas not mounted yet):
      // stack below the lowest existing block instead of guessing blindly.
      const maxY = Math.max(0, ...existingBlocks.map(b => (b.position?.y ?? 0) + (b.size?.height ?? 280)));
      return { x: 100, y: maxY + PADDING };
    }

    const originX = Math.max(0, vp.canvasX + PADDING);
    const originY = Math.max(0, vp.canvasY + PADDING);
    const sweepMaxX = vp.canvasX + vp.canvasVisibleW - width;
    // Search a few screens below the fold too, not just the exact visible
    // area — so a burst of additions (several pastes/drops in a row) tiles
    // into a grid near the viewport instead of falling straight to the
    // single-column "stack below" fallback the moment the visible area fills.
    const sweepMaxY = vp.canvasY + vp.canvasVisibleH * 3 - height;

    if (sweepMaxX >= originX) {
      for (let y = originY; y <= Math.max(originY, sweepMaxY); y += SWEEP_STEP) {
        for (let x = originX; x <= sweepMaxX; x += SWEEP_STEP) {
          if (!overlaps(x, y)) return { x, y };
        }
      }
    }

    // Nothing free inside the current view — extend just past the bottom of
    // what's visible (only counting blocks that actually overlap the
    // viewport horizontally) so the new block needs at most a small scroll
    // to reach, instead of landing next to some block far away on the canvas.
    const visibleBottom = Math.max(
      vp.canvasY + vp.canvasVisibleH,
      ...existingBlocks
        .filter(b => {
          const bx = b.position?.x ?? 0;
          const bw = b.size?.width ?? 420;
          return bx < vp.canvasX + vp.canvasVisibleW && bx + bw > vp.canvasX;
        })
        .map(b => (b.position?.y ?? 0) + (b.size?.height ?? 280))
    );
    return { x: originX, y: visibleBottom + PADDING };
  }

  function getFittedMediaBlockSize(naturalWidth, naturalHeight) {
    if (!naturalWidth || !naturalHeight) {
      return { width: MEDIA_DEFAULT_WIDTH, height: MEDIA_DEFAULT_HEIGHT };
    }

    const box = getOpeningViewportBox();
    const maxW = Math.max(80, (box.width || MEDIA_FALLBACK_MAX_WIDTH) * MEDIA_FIT_MARGIN);
    const maxH = Math.max(80, (box.height || MEDIA_FALLBACK_MAX_HEIGHT) * MEDIA_FIT_MARGIN) - MEDIA_HEADER_HEIGHT;

    const ratio = naturalWidth / naturalHeight;
    let targetHeight = maxH;
    let targetWidth = targetHeight * ratio;
    if (targetWidth > maxW) {
      targetWidth = maxW;
      targetHeight = targetWidth / ratio;
    }

    return { width: targetWidth, height: targetHeight + MEDIA_HEADER_HEIGHT };
  }

  function loadMediaNaturalSize(src, isVideo) {
    return new Promise((resolve) => {
      if (isVideo) {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
        v.onerror = () => resolve({ width: 0, height: 0 });
        v.src = src;
      } else {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = src;
      }
    });
  }

  // --- Block operations ---
  // The note Single Note should open once it is there: the one just added
  // from its menu, or one picked from another folder on its search page. See
  // noteToOpen in utils/lastNote.js.
  let singleNoteToOpen = null;

  /** Every other folder's notes, writing only -- for Single Note's search page. */
  async function listOtherFolderNotes() {
    const names = (savedList || []).filter(name => name && name !== currentSaveName);
    return Promise.all(names.map(async folder => ({ folder, ...(await loadFolderNotes(folder)) })));
  }

  /**
   * A note deleted from Single Note's search page that lives in another
   * folder. That folder is not open, so there is no Undo for it: the folder as
   * it was is kept first (Settings, Advanced, kept copies), then written back
   * without the note -- an ordinary local save, which the next upload sends.
   */
  async function deleteNoteInFolder(event) {
    const { folder, id } = event.detail || {};
    if (!folder || !id || folder === currentSaveName || !savedList.includes(folder)) return;
    try {
      const current = await loadBlocks(folder);
      const kept = (current?.blocks || []).filter(block => block.id !== id);
      if (kept.length === (current?.blocks || []).length) return;
      const next = {
        blocks: kept,
        modeOrders: ensureModeOrders(kept, current?.modeOrders),
        modeSettings: normalizeModeSettings(current?.modeSettings)
      };
      await keepReplacedCopy(folder, current, next);
      await saveBlocks(folder, next);
      savedList = await listSavedBlocks();
      logSync('save', folder, 'deleted a note from Single Note search', { noteId: id });
      autoSyncDirty = true;
    } catch (error) {
      console.error('Could not delete the note from', folder, error);
      await appAlert(`The note could not be deleted from "${folder}".`);
    }
  }

  /** A note picked in another folder: open that folder, then that note. */
  async function openNoteInFolder(event) {
    const { folder, id } = event.detail || {};
    if (!folder || !id || !savedList.includes(folder)) return;
    if (folder !== currentSaveName) await load(folder);
    singleNoteToOpen = { id, at: Date.now() };
  }

  // ── Which page Page mode shows, and where it has been ─────────────────
  // The folder's own page (modeSettings.page), or a page block in it
  // (PageBlock.svelte, 2026-11-10) -- `pageAt`, how this device is moving
  // around, so it stays on the device. `places` is the back and forward
  // history (utils/pagePlaces.js).
  // ── How modes are changed, on this device (utils/controlsLayout.js) ─
  // Decided 2026-11-10: the bar at the bottom on a phone, a column of modes
  // on a computer, modes in order or hidden -- each choosable back to the
  // way it was in Advanced settings, "Controls layout".
  let controlsLayout = readLayout(typeof localStorage !== 'undefined' ? localStorage : null);
  function changeControlsLayout(next) {
    controlsLayout = next;
    writeLayout(typeof localStorage !== 'undefined' ? localStorage : null, next);
  }
  // The phone's status bar, shown or hidden as chosen (SystemBarsPlugin.java);
  // nothing anywhere else.
  $: applyStatusBar(controlsLayout.statusBar);
  function applyStatusBar(choice) {
    const plugin = typeof window !== 'undefined' ? window.Capacitor?.Plugins?.SystemBars : null;
    plugin?.setStatusBarHidden?.({ hidden: choice === 'hidden' }).catch?.(() => {});
  }
  $: offered = offeredModes(MODE_ORDER, controlsLayout, mode);
  // The Controls layout page, over the whole mode area, from Advanced settings.
  // A press on the bar or the column -- outside the page -- closes it (asked
  // 2026-11-10).
  let showControlsLayout = false;
  function closeLayoutFromBar() {
    if (showControlsLayout) showControlsLayout = false;
  }

  // The column that hides goes away once a mode is chosen from it -- asked
  // 2026-11-11: "make it disappear even after you click a mode ... i don't
  // think it needs to stay". The pointer is still over it and the button
  // pressed holds the focus, either of which kept it out. It stays tucked
  // until the pointer has moved off to the right of it, so it does not come
  // straight back out from under the pointer.
  let railTucked = false;
  function tuckRail(button) {
    if (controlsLayout.computer !== 'auto') return;
    button?.blur?.();
    railTucked = true;
    const untuck = (event) => {
      if (event.clientX <= 64) return;
      railTucked = false;
      window.removeEventListener('pointermove', untuck);
    };
    window.addEventListener('pointermove', untuck);
  }

  // A finger on the phone's bar changes mode, one of two ways to compare
  // (Controls layout, modeGesture; asked 2026-11-10):
  // - 'strip': sliding along the bar shows every mode in a strip above it,
  //   each always at its own place in its order, a space in the middle that
  //   keeps the open one;
  // - 'sheet': sliding up from the bar opens every mode, and letting go on
  //   one opens it.
  // utils/controlsLayout.js decides (gestureStart, stripLayout, stripPick).
  let barGesture = null; // { kind: null | 'strip' | 'sheet', startX, startY }
  let strip = null;      // stripLayout() while the strip shows
  let stripIndex = null; // the mode under the finger, null over the middle space
  let sheetPick = null;

  // What opens from the bar -- Settings, Menu, the mode list, the timer's and
  // the player's panels -- is not the bar: a finger in them never starts a
  // gesture (asked 2026-11-10, after the sheet opened from inside Settings).
  const OPENED_FROM_BAR = '.dropdown-content, .left-controls, .mode-ladder, .add-block-list, .timer-panel, .player-panel, .mini-player, [role="dialog"]';

  // Which touches are the bar's: one that starts on the bar, or in a band
  // half the bar's height above it (asked 2026-11-10:
  // some phones keep the very bottom for their own swipe between apps). The
  // band was first a layer over the mode, which swallowed taps there (Task
  // mode's "Add a task" stopped answering); it is only a test of where the
  // touch began now, and only a finger going on upwards makes it anything.
  function startsOnBar(touch, target) {
    if (!controlsRef) return false;
    if (controlsRef.contains(target)) return true;
    // Both gestures, since 2026-11-10: "let's give some more height to the
    // slide along the bar too". The band is on the screen's side of the bar,
    // wherever the bar is (inBarBand).
    return inBarBand(touch.clientY, controlsRef.getBoundingClientRect(), barAtTop ? 'top' : 'bottom');
  }

  // A phone, by its shape rather than its width alone, so turning it on its
  // side keeps the bar where it was chosen (utils/controlsLayout.js
  // isPhoneShape; reported 2026-11-11).
  const phoneNow = () => typeof window !== 'undefined' && isPhoneShape({
    width: window.innerWidth,
    height: window.innerHeight,
    coarse: Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  });
  let onPhone = phoneNow();
  const rememberShape = () => { onPhone = phoneNow(); };
  $: barAtTop = onPhone && controlsLayout.phone !== 'bottom';
  // Where the bar ends on the screen's side, for what opens from a bar at the
  // top to open under it.
  let barEdge = 0;

  function barTouchStart(event) {
    barGesture = null;
    if (event.touches?.length !== 1 || !onPhone || keyboardOpen) return;
    if (event.target.closest?.(OPENED_FROM_BAR)) return;
    // A field in the bar is for typing in, not sliding from.
    if (controlsRef?.contains(event.target) && event.target.closest?.('input, textarea')) return;
    const touch = event.touches[0];
    if (!startsOnBar(touch, event.target)) return;
    barGesture = { kind: null, startX: touch.clientX, startY: touch.clientY };
  }
  function barTouchMove(event) {
    if (!barGesture) return;
    const t = event.touches?.[0];
    if (!t) return;
    if (!barGesture.kind) {
      const toward = barAtTop ? 'down' : 'up';
      const way = gestureStart(t.clientX - barGesture.startX, t.clientY - barGesture.startY, { toward });
      if (!way) return;
      const wanted = controlsLayout.modeGesture === 'sheet' ? toward : 'across';
      barEdge = controlsRef?.getBoundingClientRect().bottom || 0;
      if (way !== wanted) { barGesture = null; return; }
      barGesture = { ...barGesture, kind: controlsLayout.modeGesture };
      if (barGesture.kind === 'strip') strip = stripLayout(offered.length, window.innerWidth);
    }
    // Once it is a gesture, the touch is the bar's alone: what is behind
    // neither scrolls nor gets a press out of it (asked 2026-11-10: the
    // Playlist went on scrolling while sliding up from the bar). Before that,
    // nothing is stopped, so a tap or a scroll there is never in the way.
    if (event.cancelable) event.preventDefault();
    if (barGesture.kind === 'strip') {
      stripIndex = stripPick(t.clientX, strip);
    } else {
      const hit = document.elementFromPoint(t.clientX, t.clientY)?.closest?.('[data-gesture-mode]');
      sheetPick = hit ? hit.dataset.gestureMode : null;
    }
  }
  function barTouchEnd(event) {
    const g = barGesture;
    // A finished gesture is not also a tap on whatever it ended over.
    if (g?.kind && event?.cancelable) event.preventDefault();
    const target = g?.kind === 'strip' ? (stripIndex === null ? null : offered[stripIndex]) : g?.kind === 'sheet' ? sheetPick : null;
    cancelBarGesture();
    if (target && target !== mode) setMode(target);
  }
  function cancelBarGesture() {
    barGesture = null;
    strip = null;
    stripIndex = null;
    sheetPick = null;
  }

  // Ctrl+1 to Ctrl+9 on a computer: the modes, in the order shown.
  function modeShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (!/^[1-9]$/.test(event.key) || onPhone) return;
    const target = offered[Number(event.key) - 1];
    if (!target) return;
    event.preventDefault();
    setMode(target);
  }

  let pageAt = null;
  let places = NO_PLACES;
  // Page mode's edit mode: pictures sized and cropped. Its button is in the
  // control bar, so its state is here.
  let pageEditMode = false;
  $: openPageBlock = pageAt ? blocks.find(b => b.id === pageAt && b.type === 'page') || null : null;
  // A page block deleted, or a folder changed under it: back to the folder's
  // own page. A function, so pageAt is read here without the check feeding
  // itself.
  function dropMissingPage(list, opening) {
    if (pageAt && !opening && !list.some(b => b.id === pageAt && b.type === 'page')) pageAt = null;
  }
  $: dropMissingPage(blocks, folderOpening);
  $: pageNow = openPageBlock
    ? normalizePageSettings({ rows: openPageBlock.rows, ...(Array.isArray(openPageBlock.narrowRows) ? { narrowRows: openPageBlock.narrowRows } : {}) })
    : modeSettings.page;
  $: pageTitle = openPageBlock ? (openPageBlock.title || 'Untitled page') : currentSaveName;

  /** The page shown now, replaced -- in the page block or the folder's settings. Not yet pushed to history. */
  function putPageInPlace(page) {
    const { rows, narrowRows } = normalizePageSettings(page);
    if (openPageBlock) {
      const id = openPageBlock.id;
      blocks = blocks.map(b => (b.id === id
        ? { ...b, rows, ...(narrowRows ? { narrowRows } : {}) }
        : b));
    } else {
      modeSettings = normalizeModeSettings({ ...modeSettings, page: { ...modeSettings.page, rows, ...(narrowRows ? { narrowRows } : {}) } });
    }
  }

  /** A change to the page shown, from Page mode: one step for Undo. */
  async function changePageShown(page) {
    await ensureCurrentHistorySnapshot();
    putPageInPlace(page);
    await pushHistory(blocks, modeOrders);
  }

  async function renamePageShown(title) {
    if (!openPageBlock) return renameFolder({ detail: { to: title } });
    const id = openPageBlock.id;
    blocks = blocks.map(b => (b.id === id ? { ...b, title } : b));
    await pushHistory(blocks, modeOrders);
  }

  const hereNow = () => ({ folder: currentSaveName, pageId: pageAt });

  async function showPlace(place) {
    if (place.folder !== currentSaveName) {
      if (!savedList.includes(place.folder)) return false;
      await load(place.folder);
    }
    pageAt = place.pageId || null;
    // A page block is only ever shown by Page mode.
    if (pageAt && mode !== 'page') setMode('page');
    return true;
  }

  async function goToPlace(place) {
    const from = hereNow();
    if (await showPlace(place)) places = visit(places, from, place);
  }

  async function stepPlace(direction) {
    places = placesStillThere(places, p => savedList.includes(p.folder));
    const step = direction < 0 ? goBack(places, hereNow()) : goForward(places, hereNow());
    if (!step) return;
    places = step.history;
    await showPlace(step.to);
  }

  /** A new, empty folder beside this one, made from a nest without opening it. */
  async function makeFolderNamed(name) {
    const target = savedList.includes(name) ? uniqueName(name, savedList) : name;
    const empty = [];
    await saveBlocks(target, { blocks: empty, modeOrders: ensureModeOrders(empty, {}), modeSettings: normalizeModeSettings() });
    savedList = await listSavedBlocks();
    logSync('save', target, 'made from a nest');
    autoSyncDirty = true;
    return { name: target, id: folderIdOf(target, {}) };
  }

  /** A new page block in this folder, made from a nest; its id. */
  function makePageNamed(title) {
    const page = makeBlock('page', { title });
    blocks = [...blocks, page];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    pushHistory(blocks, modeOrders);
    return page.id;
  }

  /** A new block of a kind, as the menu makes it; not yet in the folder. */
  function makeBlock(type = "text", fields = {}) {
    // Single Note holds only notes, and as many as you like -- it shows them
    // as tabs. It used to refuse an add whenever one existed, from when it
    // showed exactly one; that made "+ Text" do nothing (2026-10-05).
    if (mode === "single") type = "text";
    // A clock is read at a glance, so it starts the size of one rather than the
    // size of a note.
    const blockW = type === 'clock' ? 260 : type === 'nest' ? 380 : type === 'calendar' ? 340 : 300;
    const blockH = type === 'clock' ? 150 : type === 'nest' ? 260 : type === 'page' ? 140 : type === 'calendar' ? 480 : 200;
    // Added deliberately from the menu, so put it where the user is looking —
    // unlike a burst of dropped media, which tiles with findFreePosition.
    const position = mode === 'default'
      ? (findViewportCenterPosition(blocks, blockW, blockH) ?? findFreePosition(blocks, blockW, blockH))
      : { x: 100, y: 100 };
    const newBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type,
      content: "",
      src: "",
      ...(type === "task" ? { tasks: [], title: "Task List" } : {}),
      ...(type === "nest" ? { links: [], title: "Nest" } : {}),
      ...(type === "page" ? { title: "Untitled page", rows: [] } : {}),
      ...(type === "calendar" ? { title: "Calendar", events: [] } : {}),
      // 24-hour by default: the owner is in France, and the setting is one
      // click away for anyone who is not.
      // The alarm starts at seven and off: a time to change rather than a blank
      // to fill, and nothing rings until somebody asks it to.
      ...(type === "clock" ? { hour12: false, showSeconds: false, showDate: true, alarmTime: '07:00', alarmEnabled: false } : {}),
      position,
      size: { width: blockW, height: blockH },
      ...newBlockColors,
      ...fields,
      _version: 0
    });
    return newBlock;
  }

  function addBlock(type = "text", { afterId = null, fields = {} } = {}) {
    if (mode === "single") type = "text";
    const newBlock = makeBlock(type, fields);

    blocks = [...blocks, newBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    // Made on a page, it is put on that page in the same step, so one Undo
    // takes both back -- on both of its layouts, since it is content.
    if (mode === "page") {
      putPageInPlace(editPage(pageNow, { content: true, op: rows => putOnPage(rows, newBlock.id, { afterId, blocks }) }));
      focusedBlockId = newBlock.id;
    }
    pushHistory(blocks, modeOrders);
    if (mode === "single") singleNoteToOpen = { id: newBlock.id, at: Date.now() };
  }

  /**
   * A block put where "/" was typed on a page (PageMode, utils/slashMenu.js):
   * a new one or one already in the folder, under the writing, over it, or
   * between its two halves -- the second half becoming a text block of its
   * own. The writing has already kept its own half; this is the rest, in one
   * step, so one Undo takes it all back.
   */
  function insertOnPage({ textId, where, afterHtml = '', type = null, existingId = null } = {}) {
    let next = [...blocks];
    let placed = existingId;
    if (!placed) {
      const made = makeBlock(type || 'text');
      next.push(made);
      placed = made.id;
    }
    let carryOn = null;
    if (where === 'split') {
      carryOn = makeBlock('text', { content: afterHtml });
      next.push(carryOn);
    }
    const page = editPage(pageNow, {
      content: true,
      op: rows => {
        let out = placeOnPage(rows, placed, { targetId: textId, side: where === 'above' ? 'above' : 'below', blocks: next });
        if (carryOn) out = placeOnPage(out, carryOn.id, { targetId: placed, side: 'below', blocks: next });
        return out;
      }
    });
    blocks = next;
    putPageInPlace(page);
    modeOrders = ensureModeOrders(blocks, modeOrders);
    focusedBlockId = placed;
    pushHistory(blocks, modeOrders);
  }

  // ── Screenshot the whole canvas ───────────────────────────────────
  // Captures everything the mode holds, not just the part on screen: a canvas
  // is usually larger than the window and scrolled around, so cropping to the
  // viewport threw away most of it.
  //
  // Rendered at twice the canvas's own pixel size, so a canvas the size of a
  // 1080p screen comes out at 2160p.
  let screenshotBusy = false;
  let screenshotNote = '';
  let screenshotNoteTimer;

  // How big the picture may be drawn is decided in utils/screenshotDelivery.js
  // (captureScale): a phone is held to far less than a computer, because past
  // its memory the drawing never finishes rather than failing.
  const capturingOnPhone = () =>
    onAndroidApp() || (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT);

  // Temporarily opens every scrollable pane inside `root` so its whole content
  // is laid out, and hands back a function that puts them all back.
  function expandScrollers(root) {
    if (!root?.querySelectorAll) return () => {};
    const touched = [];

    const openUp = element => {
      const style = getComputedStyle(element);
      const scrolls =
        ['auto', 'scroll'].includes(style.overflowY) || ['auto', 'scroll'].includes(style.overflowX);
      const overflowing =
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1;
      if (!scrolls || !overflowing) return;

      touched.push({
        element,
        overflow: element.style.overflow,
        height: element.style.height,
        maxHeight: element.style.maxHeight,
        width: element.style.width,
        maxWidth: element.style.maxWidth
      });
      element.style.overflow = 'visible';
      element.style.height = 'auto';
      element.style.maxHeight = 'none';
      element.style.maxWidth = 'none';
    };

    openUp(root);
    for (const element of root.querySelectorAll('*')) openUp(element);

    return () => {
      for (const entry of touched) {
        entry.element.style.overflow = entry.overflow;
        entry.element.style.height = entry.height;
        entry.element.style.maxHeight = entry.maxHeight;
        entry.element.style.width = entry.width;
        entry.element.style.maxWidth = entry.maxWidth;
      }
    };
  }

  /**
   * Draw the current view and give back a PNG.
   *
   * Split out from the button so that the clipboard can be asked for while the
   * click is still warm — see screenshotDelivery.js. This half takes seconds;
   * the permission does not last that long.
   */
  async function captureScreenshotBlob() {
    let restoreScrollers = () => {};
    let restoreBackground = () => {};
    try {
      // html2canvas-pro rather than html2canvas: the original stops at
      // "unsupported color function" on anything using color-mix(), which the
      // themes lean on throughout, so capturing any mode but the plainest
      // simply failed.
      const html2canvas = (await import('html2canvas-pro')).default;

      // In Canvas and Simple Note the board itself is .canvas-inner; the
      // element around it is only the window onto it, so capturing that would
      // frame the visible part and letterbox the rest. Other modes lay out
      // normally, and their root is the thing to capture.
      const board = canvasRef?.querySelector?.('.canvas-inner');
      const target = board || canvasRef || document.body;

      // The board carries the zoom as a transform. Rendering it while scaled
      // would bake the current zoom into the image, so it is neutralised for
      // the capture and put back afterwards.
      const previousTransform = board ? board.style.transform : null;
      if (board) board.style.transform = 'none';

      // A list that draws only what is on screen draws the rest now, up to what
      // the picture can hold, and is given two frames to do it -- or a tenth of
      // a second, since a page that is not being shown gets no frames at all,
      // and waiting for one left the button busy for good (seen 2026-10-28).
      // Anything the page wants finished first -- a list's covers, say -- is
      // handed back in `waits` and given up to four seconds; a cover that has
      // not arrived by then is drawn as the blank it is on screen.
      const waits = [];
      window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: { capturing: true, waits } }));
      await Promise.race([
        Promise.all(waits.map(wait => Promise.resolve(wait).catch(() => {}))),
        new Promise(resolve => setTimeout(resolve, 4000))
      ]);
      await Promise.race([
        new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        new Promise(resolve => setTimeout(resolve, 100))
      ]);

      // Modes other than Canvas scroll their own panes — the task list, the
      // track list — and only the visible slice of those would be drawn.
      // Opening them up for the capture is what makes this work for every mode
      // rather than just the board.
      restoreScrollers = expandScrollers(target);

      // Measured after expanding, so the size covers the content now on show.
      // A list longer than one readable picture stops at the limit rather than
      // shrinking to a sliver (listCaptureHeight); Canvas, one layout, is
      // shrunk to fit whole instead.
      const width = Math.max(target.scrollWidth, target.clientWidth, 1);
      const fullHeight = Math.max(target.scrollHeight, target.clientHeight, 1);
      // As sharp as this screen draws (screenScale): a phone's ~2.8, not 1.
      const sharpness = screenScale(typeof window === 'undefined' ? 1 : window.devicePixelRatio);
      const height = mode === 'default'
        ? fullHeight
        : listCaptureHeight({ width, height: fullHeight, phone: capturingOnPhone(), scale: sharpness });
      const scale = captureScale({ width, height, phone: capturingOnPhone(), wanted: sharpness });

      // Every mode's wallpaper is painted in underneath the capture rather than
      // captured: the layer it sits in on screen is fixed to the window, which
      // the capture reproduces only partly or not at all -- the phone's
      // screenshots came out with none (2026-10-28). See
      // utils/screenshotWallpaper.js. So the layer is left out, the mode's own
      // background is cleared while it is drawn, and the picture goes under.
      const backdrop = canvasTheme?.innerBg || canvasTheme?.outerBg || '#000000';
      const wallpaperSettings = wallpaperSettingsFor(mode, {
        hasWallpaper: hasWallpaper(mode),
        canvas: canvasBackgroundSettings,
        others: singleNoteSettings
      });
      const wallpaper = wallpaperSettings
        ? wallpaperPaint(wallpaperSettings, {
            // The picture the screen is showing, chosen by the screen's shape
            // as the wallpaper itself chooses (usesPortraitBackground). This
            // went by a 1024px width, so whenever the two disagreed -- a phone
            // on its side, a window 1024 wide -- the screenshot looked for the
            // other picture and painted none (reported 2026-10-28).
            isMobile: typeof window !== 'undefined' &&
              usesPortraitBackground({ width: window.innerWidth, height: window.innerHeight }),
            scale
          })
        : null;

      // The mode's own background sits under its wallpaper on screen; in the
      // picture the wallpaper is painted on that same colour (underlayWallpaper),
      // so the captured part must let it through.
      // Which element that is depends on the mode -- the captured root, or a
      // panel inside it (the Habit Tracker draws its wallpaper inside its own
      // section) -- so it is whatever each wallpaper layer sits in.
      if (wallpaper) {
        const grounds = new Set([target]);
        const scope = canvasRef || target;
        for (const name of WALLPAPER_LAYER_CLASSES) {
          for (const layer of scope.querySelectorAll?.(`.${name}`) || []) {
            if (layer.parentElement) grounds.add(layer.parentElement);
          }
        }
        const saved = [...grounds].map(element => [element, element.style.background]);
        for (const [element] of saved) element.style.background = 'transparent';
        restoreBackground = () => { for (const [element, value] of saved) element.style.background = value || ''; };
      }

      const drawn = await withinTime(html2canvas(target, {
        backgroundColor: wallpaper ? null : backdrop,
        scale,
        logging: false,
        useCORS: true,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
        // The button itself and any open popover are furniture, not content.
        // A picture in the view that will not load is left out after 5s rather
        // than the default 15s, inside the drawing's own deadline.
        imageTimeout: 5000,
        ignoreElements: element =>
          element.classList?.contains('screenshot-btn') ||
          element.classList?.contains('player-panel') ||
          (wallpaper && isWallpaperLayer(element))
      }), CAPTURE_DEADLINES.drawing, 'drawing the page');

      restoreBackground();
      restoreBackground = () => {};
      if (board) board.style.transform = previousTransform || '';
      restoreScrollers();
      restoreScrollers = () => {};

      const canvas = wallpaper ? await underlayWallpaper(drawn, wallpaper, backdrop) : drawn;

      const blob = await withinTime(
        new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
        CAPTURE_DEADLINES.picture,
        'making the picture'
      );
      if (!blob) throw new Error('The image came back empty.');
      return blob;
    } catch (error) {
      // Put the zoom back even if the capture threw part-way through,
      // otherwise the board would be left sitting at 1:1.
      const board = canvasRef?.querySelector?.('.canvas-inner');
      if (board && board.style.transform === 'none') board.style.transform = '';
      throw error;
    } finally {
      // Panes are put back even if the capture threw part-way through,
      // otherwise the mode would be left with its scrollers hanging open --
      // and the mode's background, cleared for the wallpaper, likewise.
      restoreScrollers();
      restoreBackground();
      window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: { capturing: false } }));
    }
  }

  /**
   * The captured board, with the wallpaper and the canvas colour under it.
   *
   * If the wallpaper will not load, the picture comes back on the plain
   * colour: a screenshot without its wallpaper is still the screenshot that
   * was asked for.
   */
  // Loaded by its load event and given up on after `ms`, rather than with
  // image.decode(): decode waits for the page to be drawn, and in a tab that is
  // not being drawn it never settled -- which left the screenshot button busy
  // for good.
  function loadImageWithin(src, ms) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error('The wallpaper took too long to load.')), ms);
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('The wallpaper would not load.')); };
      // A synced wallpaper is a storage link rather than a data URL, and a
      // picture from elsewhere drawn without CORS taints the canvas -- the
      // screenshot then cannot be read back out at all. Asked for with CORS,
      // it either arrives clean or fails here and is left out.
      image.crossOrigin = 'anonymous';
      // Its own copy, not the one the screen already showed: that one can sit
      // in the cache without the permission to be drawn (freshCopyUrl).
      image.src = freshCopyUrl(src);
    });
  }

  async function underlayWallpaper(drawn, paint, backdrop) {
    const out = document.createElement('canvas');
    out.width = drawn.width;
    out.height = drawn.height;
    const ctx = out.getContext('2d');

    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, out.width, out.height);

    try {
      const image = await loadImageWithin(paint.image, 5000);
      const rect = wallpaperRect({
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        width: out.width,
        height: out.height,
        size: paint.size,
        bleed: paint.bleed
      });
      ctx.save();
      ctx.globalAlpha = paint.alpha;
      ctx.filter = paint.filter;
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    } catch (error) {
      console.warn('The wallpaper could not be drawn into the screenshot:', error);
    }

    ctx.drawImage(drawn, 0, 0);
    return out;
  }

  /**
   * Ask for the clipboard now, and hand it the picture when there is one.
   *
   * Called before anything is awaited, on purpose. A browser only allows a
   * clipboard write while the click that caused it still counts, and the
   * capture above takes longer than that on a big board — so the promise goes
   * in and the browser waits for it.
   *
   * Never throws and never rejects: the download is what was asked for, and a
   * clipboard that refuses must not cost somebody their screenshot.
   */
  function copyScreenshotToClipboard(capture) {
    if (!canCopyImage()) return Promise.resolve(false);

    try {
      return navigator.clipboard
        .write([new ClipboardItem({ 'image/png': capture })])
        .then(() => true)
        .catch(error => {
          console.warn('Copying the screenshot failed; it was still saved:', error);
          return false;
        });
    } catch (error) {
      console.warn('This browser would not take a picture for the clipboard:', error);
      return Promise.resolve(false);
    }
  }

  function noteScreenshot(message) {
    screenshotNote = message;
    clearTimeout(screenshotNoteTimer);
    screenshotNoteTimer = setTimeout(() => { screenshotNote = ''; }, 2200);
  }

  /**
   * The button.
   *
   * Deliberately not `async`: everything before `copyScreenshotToClipboard`
   * has to run in the same turn as the click, or the clipboard is already
   * closed by the time we ask.
   *
   * It used to offer the system share sheet on a phone *instead* of
   * downloading, because a download there lands in a folder the gallery does
   * not index. That was asked for, and it is being replaced on purpose rather
   * than tidied away: "make it so that it downloads the image like a normal
   * download and also puts it in the clipboard, for both PC and phones."
   * Both, everywhere, and no sheet to dismiss first.
   */
  function handleScreenshot() {
    if (screenshotBusy) return;
    screenshotBusy = true;
    screenshotNote = '';

    const capture = captureScreenshotBlob();
    // Not in the Android app: what it copies never reaches other apps there,
    // and the share sheet that follows does the job properly (2026-10-05).
    const copying = onAndroidApp() ? Promise.resolve(false) : copyScreenshotToClipboard(capture);

    deliverScreenshot(capture, copying);
  }

  async function deliverScreenshot(capture, copying) {
    try {
      const blob = await capture;
      // A download on a computer; the system share sheet in the Android app,
      // where a web download saved nothing -- see utils/fileDelivery.js.
      // In the Android app: into the phone's Downloads at full resolution, and
      // onto the clipboard (asked 2026-10-29) -- the share sheet only if that
      // cannot be done. See utils/fileDelivery.js.
      const how = await deliverFile(blob, screenshotFileName({ saveName: currentSaveName, mode }), {
        title: 'Screenshot',
        toDownloads: true,
        copy: true
      });
      if (how === 'downloaded') noteScreenshot(deliveryMessage({ copied: await copying, downloaded: true }));
      else if (how === 'saved') noteScreenshot(deliveryLastResult.copied ? 'Saved to Downloads and copied' : 'Saved to Downloads');
      else if (how === 'shared') noteScreenshot('Shared');
    } catch (error) {
      console.error('Screenshot failed', error);
      await copying.catch(() => {});
      // The reason is shown, not only logged: on a phone there is no console
      // to read, and which step stopped is what decides the fix.
      await appAlert(`Couldn't capture this view. ${error?.message || ''}`.trim());
    } finally {
      screenshotBusy = false;
    }
  }

  function deleteBlockHandler(event) {
    const id = event.detail?.id;
    const deletingBlock = blocks.find(block => block.id === id);
    blocks = blocks.filter(b => b.id !== id);
    modeOrders = ensureModeOrders(
      blocks,
      Object.fromEntries(
        Object.entries(modeOrders).map(([modeName, order]) => [
          modeName,
          order.filter(existingId => existingId !== id)
        ])
      )
    );
    if (focusedBlockId === id) {
      focusedBlockId = null;
    }
    if (deletingBlock?.type === 'image') {
      markCloudAttachmentDirty();
    }
    // The room comes back on screen at once rather than when the server next
    // speaks. Measured from what the block was actually carrying, so a block
    // with no picture in it gives nothing back.
    const freed = String(deletingBlock?.src || '').length + String(deletingBlock?.content || '').length;
    if (freed > 0) pendingStorageBytes -= freed;

    // Any block can carry an upload, not just an image one — a picture pasted
    // into written text is stored the same way — so every deletion arms the
    // sweep rather than only the obvious ones.
    blocksWereDeleted = true;
    pushHistory(blocks, modeOrders);
  }

  async function updateBlockHandler(event) {
    const detail = event.detail || {};
    const {
      pushToHistory,
      changedKeys,
      id,
      bumpVersion,
      historyTriggers: incomingHistoryTriggers,
      ...updates
    } = detail;

    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return;

    const existing = blocks[idx];
    const historyTriggers =
      incomingHistoryTriggers ??
      existing.historyTriggers ??
      DEFAULT_HISTORY_TRIGGERS[existing.type] ??
      DEFAULT_HISTORY_TRIGGERS.__default;

    const normalizedChangedKeys =
      Array.isArray(changedKeys) && changedKeys.length
        ? changedKeys
        : Object.keys(updates);

    const actualChangedKeys = normalizedChangedKeys.filter(key => {
      const previousValue = existing[key];
      const nextValue = updatedBlockValueForKey(key, existing, updates);
      return !areHistoryValuesEqual(previousValue, nextValue);
    });

    if (!actualChangedKeys.length) {
      return;
    }
    if (existing.type === 'image' && actualChangedKeys.includes('src')) {
      markCloudAttachmentDirty();
    }

    let shouldSnapshot;
    if (typeof pushToHistory === "boolean") {
      shouldSnapshot = pushToHistory;
    } else if (actualChangedKeys.length) {
      shouldSnapshot = actualChangedKeys.some(key =>
        historyTriggers.includes(key)
      );
    } else {
      shouldSnapshot = true;
    }

    // Apply ONLY the keys that actually changed. A child block (e.g. ImgBlock)
    // always sends its full state in `detail` — src, colors, size, position — so
    // blindly spreading `...updates` lets a partial update (say, a size-only
    // change) clobber unrelated fields with the child's current values. During
    // HMR a transiently re-mounted block can hold empty `src` / default white,
    // which would then wipe the real image + color and trigger content deletion
    // on the next save. Restricting to `normalizedChangedKeys` prevents that.
    // ✅ always clone position & size so reactivity triggers
    const updatedBlock = {
      ...existing,
      position: { ...existing.position },
      size: { ...existing.size },
      historyTriggers,
      ...(bumpVersion ? { _version: (existing._version || 0) + 1 } : {})
    };
    for (const key of normalizedChangedKeys) {
      if (key === 'position') {
        updatedBlock.position = { ...existing.position, ...(updates.position || {}) };
      } else if (key === 'size') {
        updatedBlock.size = { ...existing.size, ...(updates.size || {}) };
      } else if (key in updates) {
        updatedBlock[key] = updates[key];
      }
    }

    const newBlocks = blocks.map((block, index) =>
      index === idx ? updatedBlock : block
    );

    // The block reported this change itself, so it is already showing it --
    // unless it asked to be rebuilt, or was already out of date before it (a
    // change made behind its back is still waiting for its rebuild).
    if (!bumpVersion && shownBlocks.get(id) === blockState(existing)) markShown([updatedBlock]);

    if (shouldSnapshot) {
      blocks = [...newBlocks];
      modeOrders = ensureModeOrders(blocks, modeOrders);
      await pushHistory(blocks, modeOrders);
    } else {
      blocks = [...newBlocks];
      modeOrders = ensureModeOrders(blocks, modeOrders);
      await persistAutosave(blocks, modeOrders);
      hasUnsnapshottedChanges = true;
    }
  }



  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Whether a picture going into the writing fits in what is left.
   *
   * Single Note asks this before inserting one. It is here rather than there
   * because the answer needs the account's balance, whether anybody is signed
   * in, and whether sync is on -- none of which is a mode's business.
   *
   * `bytes` is the length of the data URL, not the file: a picture in writing
   * is stored as that string inside the folder, which is about a third larger
   * than the file it came from.
   */
  async function mayAddPicture(bytes, what = 'This picture') {
    // Kept inside the folder rather than uploaded as a file, so it also has
    // to fit the database's limit for one value -- see inlinePictureVerdict.
    const verdict = inlinePictureVerdict({
      bytes,
      usage: shownStorageUsage,
      signedIn: Boolean(authUser),
      autoSync: autoSyncEnabled,
      what
    });

    if (!verdict.allow) {
      await appAlert(verdict.message);
      return false;
    }

    if (verdict.message) syncFailureNotice = verdict.message;
    // Counted the moment it is accepted, so a second picture is judged against
    // the room the first one took rather than against a figure that has not
    // heard about it yet.
    pendingStorageBytes += Math.max(0, Number(bytes) || 0);
    return true;
  }

  /**
   * Whether a wallpaper fits in what is left.
   *
   * Asked of the account's room like an image block's picture, not of the
   * database's limit for one value: a wallpaper is uploaded as a file (see
   * uploadModeSettingAttachments), so only its size in storage matters.
   * `dataUrlLength` is what the picker read; the file is about three quarters
   * of it.
   */
  async function mayUseBackground(dataUrlLength) {
    const bytes = Math.round(Math.max(0, Number(dataUrlLength) || 0) * 0.75);
    const verdict = attachmentVerdict({
      bytes,
      usage: shownStorageUsage,
      signedIn: Boolean(authUser),
      autoSync: autoSyncEnabled
    });

    if (!verdict.allow) {
      await appAlert(verdict.message);
      return false;
    }
    if (verdict.message) syncFailureNotice = verdict.message;
    pendingStorageBytes += bytes;
    return true;
  }

  async function addImageBlockFromFile(file) {
    if (!file) return;
    if (!file.type?.startsWith('image/') && !file.type?.startsWith('video/')) return;

    // Asked before the picture is read, not after it has uploaded. The server
    // is still what enforces the ceiling -- see utils/uploadAllowance.js --
    // but it can only answer once the file has landed in the bucket, which is
    // half a minute after the moment the answer was useful.
    const verdict = attachmentVerdict({
      bytes: file.size,
      usage: shownStorageUsage,
      signedIn: Boolean(authUser),
      autoSync: autoSyncEnabled
    });

    if (!verdict.allow) {
      // A dialog, because this stops something that was just asked for and
      // owes a reason for it.
      await appAlert(verdict.message);
      return;
    }

    // Worth knowing, not worth interrupting for.
    if (verdict.message) syncFailureNotice = verdict.message;
    pendingStorageBytes += Math.max(0, Number(file.size) || 0);

    const src = await readFileAsDataUrl(file);
    if (typeof src !== 'string') return;

    const isVideo = file.type.startsWith('video/');
    const natural = await loadMediaNaturalSize(src, isVideo);
    const { width: imgW, height: imgH } = getFittedMediaBlockSize(natural.width, natural.height);
    const mediaBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type: 'image',
      content: '',
      src,
      position: mode === 'default' ? findFreePosition(blocks, imgW, imgH) : { x: 100, y: 100 },
      size: { width: imgW, height: imgH },
      ...newBlockColors,
      _version: 0
    });

    blocks = [...blocks, mediaBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    markCloudAttachmentDirty();
    await pushHistory(blocks, modeOrders);
  }

  // Music dropped anywhere goes into the library, in Playlist mode (asked
  // 2026-11-10); utils/dropKinds.js tells it from pictures and videos.
  let incomingMusic = null;

  async function handleModeDrop(event) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files || []);
    const { music, media: mediaFiles } = splitDrop(files);
    if (music.length) {
      if (mode !== 'playlist') setMode('playlist');
      incomingMusic = { files: music, at: Date.now() };
    }
    if (!mediaFiles.length) return;

    // Dropped onto writing, the picture goes *into* the writing.
    //
    // Asked for: the canvas already made a block from a dropped picture, and
    // the same gesture was wanted in Single Note mode -- but there it should
    // "add the images in the note and not as a image block like canvas". A note
    // is one piece of writing; a block beside it would be a second thing rather
    // than part of it.
    //
    // The editor has its own handler for this, which is the tidier path when
    // the editor gets the event. This is here because it is the one that always
    // runs: a listener on this element cannot be skipped by anything inside it,
    // and the editor's version stops propagation when it takes a drop, so the
    // two never both fire.
    const writing = event.target?.closest?.('.ProseMirror');
    if (writing?.editor) {
      const at = writing.editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      let insertAt = at?.pos ?? null;
      for (const file of mediaFiles.filter(f => f.type?.startsWith('image/'))) {
        try {
          const src = await readFileAsDataUrl(file);
          if (typeof src !== 'string') continue;
          const chain = writing.editor.chain().focus();
          if (typeof insertAt === 'number') chain.setTextSelection(insertAt);
          chain.setImage({ src }).run();
          insertAt = writing.editor.state.selection.to;
        } catch (error) {
          console.error('Failed to drop a picture into a note:', error);
        }
      }
      return;
    }

    for (const file of mediaFiles) {
      try {
        await addImageBlockFromFile(file);
      } catch (error) {
        console.error('Failed to import dropped media:', error);
      }
    }
  }

  function handleModeDragOver(event) {
    event.preventDefault();

    // Say what kind of drop this is, not just that one is allowed.
    //
    // preventDefault alone makes a drop legal; the pointer is drawn from
    // `dropEffect`, which starts as "none" until something sets it. That is the
    // flash of the no-entry cursor at the start of a drag -- a frame or two of
    // the browser saying nothing may be dropped here, before the element under
    // the pointer gets round to allowing it.
    //
    // Something dragged in from outside is a copy; something dragged from
    // inside the page is being moved.
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const fromOutside = Array.from(transfer.types || []).includes('Files');
    try {
      transfer.dropEffect = fromOutside ? 'copy' : 'move';
    } catch {
      // Some browsers refuse this outside a real drag; the drop still works.
    }
  }

  async function handlePaste(event) {
    // Don't intercept paste inside text fields
    const t = event.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    // Read now, while the event is live -- a clipboard is emptied once the
    // handler returns.
    const clipboard = event.clipboardData;
    const items = Array.from(clipboard?.items || []);
    const imageItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'));
    const html = clipboard?.getData('text/html') || '';
    const text = clipboard?.getData('text/plain') || '';

    // What the paste is decides what it becomes -- utils/pasteIntent.js. This
    // used to read the plain text only and cut it at every blank line, so a
    // copied list became one block per item and its pictures were lost.
    const kind = pasteKind({ html, text, imageCount: imageItems.length });
    if (kind === 'none') return;
    event.preventDefault();

    try {
      if (kind === 'image') {
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (file) await addImageBlockFromFile(file);
        }
      } else if (kind === 'html') {
        // One block, as it was copied: lists, headings, pictures and all.
        // Through the same allowlist task text uses, since this came from
        // anywhere; the editor's own schema tidies the rest when it opens.
        const clean = sanitizeRichText(html);
        if (clean.trim()) await addTextBlockFromContent(clean);
      } else {
        // Plain text still makes one block per paragraph, but never cuts a
        // list or a code block apart.
        for (const chunk of textChunks(text)) await addTextBlockFromContent(chunk);
      }
    } catch (error) {
      console.error('Paste failed:', error);
    }
  }

  async function addTextBlockFromContent(content) {
    const txtW = 300, txtH = 200;
    const newBlock = applyHistoryTriggers({
      id: crypto.randomUUID(),
      type: 'text',
      content,
      src: '',
      position: mode === 'default' ? findFreePosition(blocks, txtW, txtH) : { x: 100, y: 100 },
      size: { width: txtW, height: txtH },
      ...newBlockColors,
      _version: 0
    });
    blocks = [...blocks, newBlock];
    modeOrders = ensureModeOrders(blocks, modeOrders);
    await pushHistory(blocks, modeOrders);
  }

  async function createNewFile() {
    const proposedName = await appPrompt('Enter a name for the new file:');
    if (proposedName === null || proposedName === undefined) {
      return;
    }

    const trimmedName = proposedName.trim();
    if (!trimmedName) {
      await appAlert('File name cannot be empty.');
      return;
    }

    if (savedList.includes(trimmedName)) {
      const shouldOverwrite = await appConfirm(`"${trimmedName}" already exists. Overwrite it with a blank file?`);
      if (!shouldOverwrite) {
        return;
      }
    }

    currentSaveName = trimmedName;
    persistLastSaveName(trimmedName);
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, {});
    modeSettings = normalizeModeSettings();
    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
    hasUnsnapshottedChanges = false;
    savedList = await listSavedBlocks();
  }

  async function clear() {
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, modeOrders);
    await pushHistory(blocks, modeOrders);
  }

  // Set while load() is between clearing one folder and putting the next on
  // screen. See mayTakeSave in utils/saveScheduling.js.
  let folderOpening = false;
  let openingFolderName = '';

  async function load(name, options = {}) {
    // An edit still waiting out its debounce is written now, to its own
    // folder, rather than left to fire in the middle of the switch.
    if (_pendingSave) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
      _firstQueuedAt = 0;
      const waiting = _pendingSave;
      _pendingSave = null;
      await _runSave(waiting);
    }

    folderOpening = true;
    openingFolderName = name;
    blocks = [];
    currentSaveName = "";
    focusedBlockId = null;
    await tick();

    startBootLoadGuard(name);

    try {
      const loaded = await loadBlocks(name);
      const loadedBlocks = Array.isArray(loaded)
        ? loaded
        : Array.isArray(loaded?.blocks)
        ? loaded.blocks
        : [];
      const loadedOrders = !Array.isArray(loaded)
        ? loaded?.modeOrders
        : {};
      const loadedModeSettings = !Array.isArray(loaded)
        ? loaded?.modeSettings
        : null;

      currentSaveName = name;
      persistLastSaveName(name);
      blocks = loadedBlocks.map(b => ({
        ...applyHistoryTriggers(b),
        _version: 0
      }));
      modeOrders = ensureModeOrders(blocks, loadedOrders);
      modeSettings = normalizeModeSettings(loadedModeSettings);
      // The folder is on screen: saves are its own again.
      folderOpening = false;

      history = [];
      historyIndex = -1;
      await pushHistory(blocks, modeOrders, { persist: true });
      if (options.skipCloudUpload) {
        autoSyncDirty = false;
      }
      clearBootLoadGuard();
      // The habits as stored, not as normalised: a bare `true` from the
      // builds in between has to be told from a ✓ to put a ✕ back.
      await mergeOldDeviceHabits(name, loadedModeSettings?.habit?.habits);
    } catch (error) {
      console.error('Failed to load save file:', error);
      folderOpening = false;
      clearBootLoadGuard();
      await openFallbackSave(name);
    } finally {
      folderOpening = false;
    }
  }

  async function openDeferredLastSave() {
    const name = deferredLastSaveName;
    if (!name) return;

    deferredLastSaveName = '';
    deferredLastSaveReason = '';
    await load(name);
  }

  function dismissDeferredLastSave() {
    deferredLastSaveName = '';
    deferredLastSaveReason = '';
  }

  function scheduleDeferredLastSaveAutoDismiss(hasPending) {
    window.clearTimeout(deferredLastSaveTimer);
    deferredLastSaveTimer = hasPending
      ? window.setTimeout(() => {
          deferredLastSaveTimer = null;
          dismissDeferredLastSave();
        }, DEFERRED_LAST_SAVE_AUTO_DISMISS_MS)
      : null;
  }

  /** The 🗑 and the folder menu's Delete: into the bin, and the cloud told. */
  async function deleteSave(name) {
    await moveFolderToBin(name, { tellCloud: true });
  }

  /**
   * A folder into the bin, whole; if that cannot be done, nothing is deleted.
   * `tellCloud` marks it binned in the cloud too, so every device moves its
   * copy into its own bin -- not wanted when the mark came from the cloud in
   * the first place. A mark that fails to send is sent by a later pull, which
   * notices the cloud is live and older than this delete (utils/cloudBin.js).
   */
  async function moveFolderToBin(name, { deletedAt = Date.now(), tellCloud = true, why = 'moved to the bin' } = {}) {
    try {
      if (currentSaveName === name) await flushWaitingSave();
      const payload = await loadBlocks(name);
      if (payload) await putBinEntry(binEntryOf(name, payload, deletedAt));
    } catch (error) {
      console.error('Could not move the folder to the bin:', error);
      if (tellCloud) await appAlert(`"${name}" was not deleted: it could not be put in the bin (${error?.message || error}).`);
      return false;
    }
    await removeLocalFolder(name);
    logSync('save', name, why);
    await refreshBin();

    if (tellCloud && firebaseReady && authUser) {
      binRemoteFile(name, deletedAt).catch(error =>
        logSync('error', name, 'could not mark it binned in the cloud yet; a later sync will', { error: String(error?.message || error) })
      );
    }
    return true;
  }

  /** Takes a folder off this device, opening another if it was the open one. */
  async function removeLocalFolder(name) {
    const deletingCurrent = currentSaveName === name;
    await deleteBlocks(name);

    // Deleting the open folder opens another one in its place. Emptying the
    // screen and leaving no name is what wrote nothing over "default" on
    // 2026-10-06 -- see nameForUnnamedSave. Only with no folder left is the
    // screen emptied, and then no folder is there to be written over.
    if (deletingCurrent) {
      const remaining = await listSavedBlocks();
      if (remaining.length) {
        savedList = remaining;
        if (loadStoredLastSaveName() === name) persistLastSaveName('');
        await load(remaining[0]);
        return;
      }
    }

    savedList = await listSavedBlocks();
    if (!deletingCurrent) {
      if (loadStoredLastSaveName() === name) persistLastSaveName(currentSaveName);
      return;
    }

    blocks = [];
    currentSaveName = "";
    persistLastSaveName("");
    modeOrders = ensureModeOrders(blocks, modeOrders);
    focusedBlockId = null;
    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
  }

  /**
   * One folder, held against what the cloud's index says of it -- the bin
   * across devices (utils/cloudBin.js). Returns 'normal' when the ordinary
   * sync should go on with it, anything else when it has been dealt with.
   */
  async function applyCloudBin(name, entry, binned, localFolders) {
    const localStamp = localFolders.includes(name) ? stampOf(await loadSaveMeta(name)) : null;
    const binEntry = newestBinEntry(binned, name);
    const action = cloudBinAction({ entry, localStamp, binEntry });
    if (action === 'normal' || action === 'none') return action;

    try {
      if (action === 'bin-local') {
        await moveFolderToBin(name, { deletedAt: Number(entry.binnedAt), tellCloud: false, why: 'moved to the bin on another device' });
      } else if (action === 'fetch-into-bin' || action === 'refresh-bin') {
        const remotePayload = await loadRemoteFile(name);
        if (remotePayload) {
          const kept = action === 'refresh-bin'
            ? { ...binEntry, payload: remotePayload, blockCount: (remotePayload.blocks || []).length }
            : binEntryOf(name, remotePayload, Number(entry.binnedAt));
          await putBinEntry(kept);
          logSync('download', name, action === 'refresh-bin' ? 'a newer copy of a folder in the bin, kept in the bin' : 'in the bin on another device, so in the bin here too');
        }
      } else if (action === 'delete-local') {
        // Deleted for ever elsewhere. A kept copy goes to Advanced settings
        // first, so a delete nobody here asked for can still be undone.
        const payload = await loadBlocks(name);
        await keepReplacedCopy(name, payload, { blocks: [] }, 'deleted for ever on another device');
        await removeLocalFolder(name);
        logSync('save', name, 'deleted for ever on another device, so deleted here');
      } else if (action === 'drop-bin-entry') {
        for (const item of binned.filter(item => item.name === name)) await deleteBinEntry(item.id);
        logSync('save', name, 'deleted for ever on another device, so gone from the bin here');
      } else if (action === 'unbin-local') {
        for (const item of binned.filter(item => item.name === name)) await deleteBinEntry(item.id);
        logSync('download', name, 'restored on another device, so out of the bin here');
        await refreshBin();
        return 'normal'; // the ordinary sync now downloads it
      } else if (action === 'mark-binned') {
        await binRemoteFile(name, Number(binEntry.deletedAt));
        logSync('upload', name, 'told the cloud it is in the bin');
      }
    } catch (error) {
      logSync('error', name, `the bin could not be brought in line (${action}); the next sync will try again`, { error: String(error?.message || error) });
    }
    await refreshBin();
    return action;
  }

  async function signInGoogle() {
    if (!firebaseReady) {
      await appAlert('Firebase is not configured yet.');
      return;
    }

    try {
      await signInWithGoogle();
      await bootstrapCloudSync();
    } catch (error) {
      console.error(error);
      await appAlert(`Google sign-in failed: ${error?.message || error}`);
    }
  }

  // Files on this device that the cloud doesn't have, or has an older copy of.
  // These are the only ones that could actually be lost by clearing local data.
  async function findUnsyncedSaves() {
    const names = await listSavedBlocks();
    if (!names.length) return [];
    let remoteIndex = {};
    try {
      remoteIndex = (await loadRemoteIndex()) || {};
    } catch {
      // Can't reach the cloud, so treat everything as potentially unsynced
      // rather than risk quietly deleting something that never got uploaded.
      return names;
    }
    const unsynced = [];
    for (const name of names) {
      const remoteMeta = remoteIndex[name];
      if (!remoteMeta) { unsynced.push(name); continue; }
      const local = await loadBlocks(name);
      const localAt = Number(local?.modifiedAt || local?.updatedAt || 0);
      const remoteAt = Number(remoteMeta?.modifiedAt || remoteMeta?.updatedAt || 0);
      if (localAt > remoteAt) unsynced.push(name);
    }
    return unsynced;
  }

  // Clears every locally stored file and the state built from it, so the next
  // account starts from a clean device instead of inheriting the last one's.
  async function wipeLocalSaves() {
    const names = await listSavedBlocks();
    for (const name of names) {
      try { await deleteBlocks(name); } catch (error) { console.error('Failed to clear local save:', error); }
    }
    blocks = [];
    focusedBlockId = null;
    modeOrders = ensureModeOrders(blocks, {});
    modeSettings = normalizeModeSettings();
    cloudSyncMemoryByFile = {};
    persistCloudSyncMemory(cloudSyncMemoryByFile);
    lastRemoteSyncFingerprint = '';
    lastAutoSyncFingerprintByFile = {};
    lastAutoSyncAttachmentFingerprintByFile = {};
    history = [];
    historyIndex = -1;

    // Land exactly where a brand-new install does: the name "default" pencilled
    // in with nothing written to storage yet, so the folder is created on the
    // first edit instead of leaving an empty one lying around.
    currentSaveName = 'default';
    persistLastSaveName('');
    savedList = await listSavedBlocks();
  }

  async function signOutGoogle() {
    try {
      // Local files belong to the account that's signing out — leaving them
      // behind is what made the next account adopt (and re-upload) them. What
      // happens to them is always the user's call, never a silent delete.
      const localNames = await listSavedBlocks();

      if (localNames.length) {
        const unsynced = authUser ? await findUnsyncedSaves() : localNames;
        const count = localNames.length;
        const folderWord = count === 1 ? 'folder' : 'folders';

        // With nothing left to upload, removing is already the safe choice, so
        // there's no risky option to offer — and green stays "you lose nothing".
        const message = unsynced.length
          ? `${unsynced.length} of your ${count} ${folderWord} ` +
            `${unsynced.length === 1 ? 'has' : 'have'} changes that aren't in the cloud yet ` +
            `(${unsynced.slice(0, 3).join(', ')}${unsynced.length > 3 ? ', …' : ''}).\n\n` +
            `• Upload and remove — sends those changes to your cloud, then clears this device.\n` +
            `• Leave here — keeps every folder on this device, linked to no account.\n` +
            `• Remove anyway — clears this device and those unsaved changes are gone for good.`
          : `All ${count} ${folderWord} on this device ${count === 1 ? 'is' : 'are'} already saved to your cloud.\n\n` +
            `• Remove from device — clears them here; they stay safe in your cloud.\n` +
            `• Leave here — keeps them on this device, linked to no account.`;

        const options = unsynced.length
          ? [
              { id: 'upload', label: 'Upload and remove', variant: 'safe' },
              { id: 'keep', label: 'Leave here', variant: 'warn' },
              { id: 'delete', label: 'Remove anyway', variant: 'danger' }
            ]
          : [
              { id: 'delete', label: 'Remove from device', variant: 'safe' },
              { id: 'keep', label: 'Leave here', variant: 'warn' }
            ];

        const choice = await appChoice(message, options);
        if (!choice) return; // dismissed — stay signed in

        if (choice === 'upload' && unsynced.length) {
          try {
            await uploadFilesToCloud(unsynced, { shouldUploadAttachments: () => true });
          } catch (error) {
            console.error(error);
            await appAlert(`Couldn't sync those folders: ${error?.message || error}. Still signed in.`);
            return;
          }
        }

        await signOutUser();
        persistSyncedUid('');
        // "Keep" leaves them as ownerless local files, so the next account you
        // sign into is asked whether to adopt them.
        if (choice !== 'keep') await wipeLocalSaves();
        return;
      }

      await signOutUser();
      persistSyncedUid('');
      await wipeLocalSaves();
    } catch (error) {
      console.error(error);
      await appAlert(`Sign out failed: ${error?.message || error}`);
    }
  }

  // Shared per-file upload loop, guarded by uploadInProgress so the manual
  // "upload all" action and the auto-sync tick never race each other.
  // One folder failing used to end the whole run: the loop threw, every folder
  // behind it in the queue was never attempted, and the only trace was a line
  // in the console. A folder the database refuses could stop an entire account
  // syncing indefinitely, which is exactly what a note holding a large inline
  // picture did. Each folder is now attempted on its own, and the names that
  // actually made it are reported back so a failed one is retried rather than
  // being marked as done.
  async function uploadFilesToCloud(names, options = {}) {
    if (uploadInProgress) return { uploadedCount: 0, uploadedNames: [], failures: [], unsyncable: [] };
    uploadInProgress = true;
    takeLock('upload');
    try {
      const uploadedNames = [];
      const failures = [];
      const unsyncable = [];
      const conflicted = [];
      for (const fileName of names) {
        // A name the database cannot use is not a failure to retry — it will
        // never succeed, and retrying it every ten seconds only replaces the
        // screen with an error that cannot be acted on. Set aside once and
        // reported separately.
        if (!isSyncableFileId(fileName)) {
          unsyncable.push(fileName);
          continue;
        }
        try {
          const localPayload = await loadBlocks(fileName);
          const localModifiedAt = Number(localPayload?.modifiedAt || localPayload?.updatedAt || 0);
          // Changed on another device since this one last saw it? Then it is
          // not overwritten: both are kept (utils/syncConflict.js). Asked with
          // a time limit -- offline, the answer may never come, and then this
          // folder simply waits for the next pass.
          const remoteEntry = await Promise.race([
            loadRemoteIndexEntry(fileName),
            new Promise((_, reject) => setTimeout(() => reject(new Error('the cloud did not answer')), 8000))
          ]);
          const verdict = remoteEntry?.deletedAt || remoteEntry?.binnedAt
            ? 'upload'
            : uploadVerdict({
              seen: cloudSeen[fileName] ?? null,
              remoteModifiedAt: remoteEntry?.modifiedAt || remoteEntry?.updatedAt || 0,
              localModifiedAt
            });
          if (verdict === 'conflict') {
            await keepBothVersions(fileName, localPayload, remoteEntry);
            conflicted.push(fileName);
            continue;
          }
          const uploadAttachments = options.shouldUploadAttachments
            ? options.shouldUploadAttachments(fileName)
            : true;
          await saveRemoteFileWithMemory(fileName, localPayload, { uploadAttachments });
          noteCloudSeen(fileName, localModifiedAt);
          uploadedNames.push(fileName);
        } catch (error) {
          failures.push({ fileName, error });
          logSync('error', fileName, error?.message || String(error));
          console.error(`Could not sync "${fileName}" to the cloud:`, error);
        } finally {
          // Every file, finished or failed: a folder of pictures on a slow
          // connection is allowed to take as long as it takes, so long as it
          // keeps arriving somewhere. Only a run that stops moving is let go of.
          lockProgressed('upload');
        }
      }
      if (conflicted.includes(currentSaveName)) await remountCurrentSaveIfLoaded();
      return { uploadedCount: uploadedNames.length, uploadedNames, failures, unsyncable };
    } finally {
      uploadInProgress = false;
      releaseLock('upload');
    }
  }

  /**
   * A folder changed here and, meanwhile, on another device: this device's
   * version becomes a folder of its own -- "Notes (from phone, 11 Nov)", its
   * pictures its own, as Duplicate makes them -- and the folder takes the
   * cloud's version. Both sync; nothing is overwritten (utils/syncConflict.js).
   * Throws, leaving everything as it was, when the copy cannot be made; the
   * next pass tries again.
   */
  /** This device's version of a folder in conflict, saved as a folder of its own. Returns its name. */
  async function saveConflictCopy(fileName, localPayload) {
    const copyName = conflictCopyName(fileName, await listSavedBlocks(), {
      kind: deviceKind({ nativeAndroid: onAndroidApp(), desktopApp: typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__ || window.__TAURI__) }),
      at: new Date()
    });
    const { payload, failed } = await embedCloudFiles(localPayload, { audio: true });
    if (failed) throw new Error('the pictures for the copy could not be fetched');
    await saveBlocks(copyName, { blocks: payload.blocks, modeOrders: payload.modeOrders, modeSettings: settingsForCopy(payload.modeSettings) });
    logSync('save', copyName, `this device's version of "${fileName}", changed on another device meanwhile`);
    // Owed an upload whatever marks the sync clean meanwhile -- the launch
    // sync does, at its end.
    owedSinceLaunch = new Set([...owedSinceLaunch, copyName]);
    appAlert(`"${fileName}" was changed on another device while this one had changes of its own. Both are kept: "${fileName}" has the other device's version, and this device's is in "${copyName}".`);
    return copyName;
  }

  async function keepBothVersions(fileName, localPayload, remoteEntry) {
    const copyName = await saveConflictCopy(fileName, localPayload);

    const remotePayload = await loadRemoteFile(fileName);
    if (!remotePayload) throw new Error('the cloud copy could not be read');
    await keepReplacedCopy(fileName, localPayload, remotePayload, `changed on another device meanwhile; this device's version is now "${copyName}"`);
    await saveBlocks(fileName, remotePayload);
    rememberCloudSyncForFile(fileName, Number(remotePayload?.lastSyncedAt || Date.now()));
    noteCloudSeen(fileName, remoteEntry?.modifiedAt || remotePayload?.modifiedAt || remotePayload?.updatedAt);
    lastAutoSyncFingerprintByFile[fileName] = Number((await loadSaveMeta(fileName))?.updatedAt || receivedFromCloud(remotePayload));
    delete lastAutoSyncAttachmentFingerprintByFile[fileName];

    savedList = await listSavedBlocks();
    autoSyncDirty = true;
    logSync('upload', fileName, 'changed on another device meanwhile: both versions kept', { copy: copyName });
  }

  async function uploadAllLocalToCloud(showInfo = true, options = {}) {
    if (!firebaseReady) {
      await appAlert('Firebase is not configured yet.');
      return;
    }

    if (!authUser) {
      await appAlert('Sign in with Google first.');
      return;
    }

    if (uploadInProgress) return;

    try {
      const names = await listSavedBlocks();
      const uploadAttachments = options.uploadAttachments !== false;
      const { uploadedCount, failures } = await uploadFilesToCloud(names, {
        shouldUploadAttachments: () => uploadAttachments
      });

      if (showInfo) {
        // Asked for by hand, so a folder that would not go up is said out loud
        // rather than left in the console.
        const failed = failures.length
          ? `
${failures.length} could not be uploaded: ${failures.map(f => f.fileName).join(', ')}`
          : '';
        await appAlert(`Upload complete. Uploaded ${uploadedCount} save file(s).${failed}`);
      }
      autoSyncDirty = false;
    } catch (error) {
      console.error(error);
      if (showInfo) {
        await appAlert(`Upload failed: ${error?.message || error}`);
      }
    }
  }

  // Returns { [fileName]: { fingerprint, attachmentFingerprint } } - per file,
  // so the caller can tell exactly which files changed instead of just
  // "something in the account changed."
  /**
   * What each folder's state is, for deciding what needs sending.
   *
   * The fingerprint is the folder's own `updatedAt`, and that is the whole of
   * "has this changed": a local save restamps it whenever the content differs
   * and skips the write entirely when it does not, so the number moving and the
   * folder changing are the same event.
   *
   * It used to be read by loading every folder, which hydrates every attachment
   * in the account into base64 to look at one integer. Now the timestamps come
   * from the records directly, and a folder is only opened when it is a
   * candidate for upload -- which, in the ordinary case of nothing having
   * changed, is none of them.
   */
  async function buildLocalSyncFingerprint({ attachmentsFor = null } = {}) {
    const meta = await loadAllSaveMeta();
    const perFile = {};
    for (const [fileName, times] of Object.entries(meta)) {
      perFile[fileName] = { fingerprint: Number(times?.updatedAt || 0), attachmentFingerprint: null };
    }

    const wanted = attachmentsFor
      ? attachmentsFor.filter((name) => perFile[name])
      : Object.keys(perFile);

    await Promise.all(
      wanted.map(async (fileName) => {
        perFile[fileName].attachmentFingerprint = await attachmentSignatureFor(fileName);
      })
    );

    return perFile;
  }

  /**
   * A summary of the pictures a folder holds, for deciding whether the
   * attachments need re-uploading alongside it.
   *
   * What counts as an attachment is any picture, wherever it sits. Only image
   * blocks were looked at once, so a note that gained a picture pasted into its
   * text looked unchanged, the attachment pass was skipped, and the base64 was
   * written to the database inline.
   *
   * Embedded pictures are summarised by how many there are and how long they
   * are rather than by their bytes: the signature is only compared for
   * equality, and holding megabytes of base64 in it to do that would be a
   * waste.
   */
  async function attachmentSignatureFor(fileName) {
    const payload = await loadBlocks(fileName);
    const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
    return blocks
      .map(block => {
        if (block?.type === 'image') {
          return `${block.id}:${block.src || ''}:${block.content || ''}:${block.trackUrl || ''}`;
        }

        const written = [block?.src, block?.content, block?.trackUrl];
        if (Array.isArray(block?.tasks)) {
          for (const task of block.tasks) written.push(task?.text);
        }

        let count = 0;
        let bytes = 0;
        for (const value of written) {
          if (typeof value !== 'string' || !value.includes('data:')) continue;
          for (const match of value.match(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+[^"')\s>]*/gi) || []) {
            count += 1;
            bytes += match.length;
          }
        }
        return count ? `${block.id}:embedded:${count}:${bytes}` : '';
      })
      .filter(Boolean)
      .join('|');
  }


  async function remountCurrentSaveIfLoaded() {
    if (!currentSaveName || !savedList.includes(currentSaveName)) return;
    await load(currentSaveName, { skipCloudUpload: true });
  }

  // After a cloud pull the folder that was open may not exist on this device
  // any more — signing in on a clean device leaves the name "default" pencilled
  // in while the downloaded folders are named something else. Fall back to the
  // first one that does exist, so signing in actually shows a folder instead of
  // an empty workspace waiting for a click.
  async function openCurrentOrFirstSave() {
    if (currentSaveName && savedList.includes(currentSaveName)) {
      await load(currentSaveName, { skipCloudUpload: true });
      return;
    }
    if (savedList.length) {
      await load(savedList[0], { skipCloudUpload: true });
    }
  }

  async function pullRemoteUpdatesIfNeeded(options = {}) {
    if (!autoSyncEnabled || !firebaseReady || !authUser || uploadInProgress || cloudBootstrapInProgress) return false;

    // One at a time.
    //
    // Three things ask for a pull -- the timer, the index subscription, and
    // coming back to the app -- and returning to a phone set all three off at
    // once. Nothing stopped them overlapping: the fingerprint that skips
    // repeated work is only written at the end, so three passes all read the
    // same stale value, all decided the same folder was behind, and all fetched
    // it. Three downloads, three snapshots of the copy being replaced, and
    // three remounts of the workspace, for one change.
    if (pullInFlight) return false;
    pullInFlight = true;
    try {
      return await runPull(options);
    } finally {
      pullInFlight = false;
    }
  }

  async function runPull(options = {}) {
    const remoteIndex = options.remoteIndex || await loadRemoteIndex();
    const remoteEntries = Object.entries(remoteIndex || {});
    // Bin marks, tombstones and this device's own bin count as changes too --
    // see syncFingerprint.
    const binned = await refreshBin();
    const remoteFingerprint = syncFingerprint(remoteIndex, binned);

    if (remoteFingerprint === lastRemoteSyncFingerprint) return false;

    let downloadedAny = false;
    // Remounting reloads the open folder, which visibly redraws the whole
    // workspace. Doing that because some *other* folder changed on another
    // device is a flash for no reason, so it's tracked separately.
    let openFileChanged = false;
    // An old name a rename left behind is not a folder to receive.
    const owedDeletes = readOwedDeletes();
    for (const [fileName, remoteMeta] of remoteEntries) {
      if (leaveInCloud(fileName, { owedDeletes, localFolders: savedList })) continue;
      // In the bin, here or elsewhere, or deleted for ever: the bin decides.
      if (await applyCloudBin(fileName, remoteMeta, binEntries, savedList) !== 'normal') continue;
      // The stamp, not the folder. This used to open every folder in the
      // account on every tick -- hydrating every attachment into base64 -- to
      // compare two integers.
      const localMeta = savedList.includes(fileName) ? await loadSaveMeta(fileName) : null;
      const localModifiedAt = Number(localMeta?.modifiedAt || localMeta?.updatedAt || 0);
      const remoteModifiedAt = Number(remoteMeta?.modifiedAt || remoteMeta?.updatedAt || 0);

      // Work done here and not yet sent must not be thrown away for a cloud copy
      // that merely carries a later stamp. That is how a block moved twice went
      // back to where the first move put it: the other instance restamped a copy
      // it had only received, so older content arrived looking newer, and the
      // second move — saved locally, still queued — was overwritten.
      //
      // Only guarded once something has actually been sent for this folder. A
      // device that has never uploaded has nothing owed, and blocking there
      // would stop a fresh sign-in ever receiving anything.
      const lastSent = lastAutoSyncFingerprintByFile[fileName];
      const hasUnsentWork = owesUpload({ lastSent, localUpdatedAt: localMeta?.updatedAt });

      if (localMeta && hasUnsentWork && remoteModifiedAt > localModifiedAt) {
        // localUpdatedAt as well as localModifiedAt: the refusal is decided by
        // comparing updatedAt against lastSent, and the log was printing
        // modifiedAt -- so a report of this could show two numbers that look
        // like they should match while the ones that actually disagreed stayed
        // invisible. A log that names the wrong field is worse than no log.
        logSync('skip', fileName, 'cloud copy is newer, but local changes are still unsent', {
          remoteModifiedAt,
          localModifiedAt,
          localUpdatedAt: Number(localMeta?.updatedAt || 0),
          lastSent
        });
        continue;
      }

      if (shouldTakeCloudCopy({
        hasLocalCopy: Boolean(localMeta),
        lastSent,
        localUpdatedAt: localMeta?.updatedAt,
        localModifiedAt,
        remoteModifiedAt
      })) {
        const remotePayload = await loadRemoteFile(fileName);
        if (!remotePayload) continue;
        // Asked again now the download has landed: editing may have been let
        // go while it ran (a resume check that outlasted the hold), and what
        // was typed since must not be overwritten. See editedDuringDownload.
        if (localMeta) {
          const latestMeta = await loadSaveMeta(fileName);
          if (editedDuringDownload({
            updatedAtBefore: localMeta?.updatedAt,
            updatedAtNow: latestMeta?.updatedAt,
            pendingSaveFolder: _pendingSave?.folder ?? null,
            folder: fileName
          })) {
            logSync('skip', fileName, 'edited here while the cloud copy was downloading; the edit stays and the next sync decides again', {
              remoteModifiedAt,
              localUpdatedAtBefore: Number(localMeta?.updatedAt || 0),
              localUpdatedAtNow: Number(latestMeta?.updatedAt || 0)
            });
            continue;
          }
        }
        logSync('download', fileName, 'cloud copy is newer, taking it', {
          remoteModifiedAt,
          localModifiedAt,
          aheadByMs: remoteModifiedAt - localModifiedAt
        });
        // From here until the workspace has been brought up to date, what is in
        // memory is older than what is on disk. A save running in that gap
        // writes the old blocks back with a new stamp, and old content wearing
        // a new stamp wins everywhere.
        applyingRemoteCopy = true;

        // Opened here, where it is genuinely needed: this is the copy about to
        // be replaced, and keeping it is the point.
        await keepReplacedCopy(
          fileName,
          localMeta ? await loadBlocks(fileName) : null,
          remotePayload
        );
        await saveBlocks(fileName, remotePayload);
        rememberCloudSyncForFile(fileName, Number(remoteMeta?.lastSyncedAt || Date.now()));
        noteCloudSeen(fileName, remoteModifiedAt);

        // A copy that was just taken from the cloud owes the cloud nothing.
        //
        // Without this the device deadlocks. `lastSent` still names whatever
        // this device last uploaded, the local stamp is now the downloaded
        // one, and the two differ -- so the guard above decides there is unsent
        // work and refuses every newer copy from then on. Nothing ever clears
        // it, because there genuinely is nothing to upload, so the upload tick
        // never runs and never updates `lastSent` either. It only breaks when
        // somebody happens to edit.
        //
        // Seen as nine consecutive refusals over a hundred seconds, all naming
        // the same pair of numbers, while the other device went on writing.
        // Read back rather than taken from the payload.
        //
        // The first version of this recorded `remotePayload.updatedAt`, which
        // is what *arrived* -- and the deadlock came back anyway, with the log
        // showing a lastSent that was neither the old local stamp nor the new
        // one. Storage puts its own rules over a payload on the way in, so the
        // only number that is certainly right is the one that ended up there.
        // Asking costs one read of a record already in memory.
        lastAutoSyncFingerprintByFile[fileName] =
          Number((await loadSaveMeta(fileName))?.updatedAt || receivedFromCloud(remotePayload));
        // Not recorded, on purpose: working it out means opening the folder,
        // and the only cost of leaving it unknown is that the next upload --
        // if there ever is one -- checks the attachments once.
        delete lastAutoSyncAttachmentFingerprintByFile[fileName];

        downloadedAny = true;
        if (fileName === currentSaveName) openFileChanged = true;
      }
    }

    lastRemoteSyncFingerprint = remoteFingerprint;

    if (downloadedAny) {
      try {
        savedList = await listSavedBlocks();
        // Only when the folder on screen is the one that actually changed.
        if (openFileChanged) {
          logSync('remount', currentSaveName, 'open folder changed underneath, redrawing');
          await remountCurrentSaveIfLoaded();
        }
      } finally {
        // A save queued before the copy landed is stale for the same reason a
        // save arriving during it is, so it goes the same way rather than
        // running the moment the gate opens.
        if (_pendingSave) {
          logSync('skip', currentSaveName, 'a cloud copy landed, so the queued save is stale');
          _pendingSave = null;
        }
        applyingRemoteCopy = false;
      }

      if (options.showInfo) {
        await appAlert('Cloud download complete. Newer cloud updates were applied.');
      }
    }

    return downloadedAny;
  }

  function refreshRemoteIndexWatch() {
    stopRemoteIndexWatch();
    stopRemoteIndexWatch = () => {};

    if (!autoSyncEnabled || !firebaseReady || !authUser) return;

    stopRemoteIndexWatch = subscribeRemoteIndex(remoteIndex => {
      pullRemoteUpdatesIfNeeded({ remoteIndex }).catch(error => {
        console.error('Auto sync download failed:', error);
      });
    });
  }

  $: autoSyncEnabled, firebaseReady, authUser, refreshRemoteIndexWatch();

  // Downloads were driven by that subscription and by nothing else, while
  // uploads had a ten-second timer behind them. One listener that is not
  // connected — a phone with the app in the background, a socket dropped, wifi
  // handed over to mobile data — and this device never hears that anything
  // changed. Not late: never, until something else happens to wake it. The
  // other device meanwhile uploads perfectly and its log says so, which is what
  // makes it look like the cloud has the changes and is refusing to hand them
  // over.
  //
  // Thirty seconds rather than ten, because the subscription is still the fast
  // path and this only has to catch what it misses. A tick that finds nothing
  // reads the index and stops there — pullRemoteUpdatesIfNeeded compares a
  // fingerprint before it touches a single folder.
  function startAutoSyncDownloadBackstop() {
    if (autoSyncDownloadIntervalId !== null) return;

    autoSyncDownloadIntervalId = window.setInterval(() => {
      // Before asking for anything: a lock that stopped responding blocks every
      // attempt after it, so the tick that keeps sync honest is also the one
      // that lets go of it.
      releaseStalledSyncLocks();
      pullRemoteUpdatesIfNeeded().catch(error => {
        console.error('Auto sync download backstop failed:', error);
      });
    }, 30_000);
  }

  // Coming back to the app is the moment a phone is most likely to be holding a
  // dead subscription, and the moment someone is most likely to be looking for
  // the note they wrote on the other device. Re-attach the listener and ask
  // once, rather than waiting up to another thirty seconds.
  // Whether the app has actually been away since the last check. A file dialog
  // takes the window's focus and gives it back without the page ever being
  // hidden, which is the difference between "I came back" and "a dialog closed".
  let awaySinceLastCheck = false;

  function handleVisibilityForSync() {
    // Leaving is the last safe moment to write. A typing save can now sit for
    // up to SAVE_MAX_WAIT_MS, and on a phone "hidden" is very often the last
    // thing that happens before the app is killed outright, so the queued
    // change has to go to disk here rather than wait out a timer that may never
    // fire.
    if (document.visibilityState !== 'visible') {
      awaySinceLastCheck = true;
      flushPendingSave();
      return;
    }

    checkCloudOnResume({ trigger: 'visibilitychange' });
  }

  /**
   * Coming back to the app is a startup in every way that matters.
   *
   * The device has been away, another one may have written, and the first thing
   * somebody does on returning to a phone is carry on typing -- into a copy
   * that is about to be replaced. Startup holds the workspace for exactly this
   * reason; resuming did not, and a phone left in a pocket is away far longer
   * than an app takes to start.
   *
   * So the same hold, with the same shape: readable and scrollable, not
   * editable, and released as soon as the check is done. The check is quick now
   * that a device which is up to date does no folder reads at all -- for most
   * resumes this is a flicker or nothing.
   */
  function onWindowReturned(event) {
    checkCloudOnResume({ trigger: event?.type || 'focus' });
  }

  async function checkCloudOnResume({ trigger = 'focus' } = {}) {
    // Not every return of focus is a return to the app. Choosing a picture
    // opens a native dialog, which takes focus and hands it back -- and running
    // the check there put the workspace into its read-only moment exactly as
    // the picture was being inserted, so the picture was refused. It only
    // happened while signed in, because that is the only time this runs.
    if (!shouldCheckOnReturn({ trigger, wasHidden: awaySinceLastCheck })) return;
    if (!autoSyncEnabled || !firebaseReady || !authUser) return;
    if (resumeCheckInProgress) return;

    awaySinceLastCheck = false;

    resumeCheckInProgress = true;
    // The same escape as the startup gate, for the same reason: a check that
    // never answers must not leave somebody unable to write.
    const giveUp = setTimeout(() => {
      if (!resumeCheckInProgress) return;
      resumeCheckInProgress = false;
      logSync('error', currentSaveName, 'started editing without checking the cloud first', {
        reason: 'the cloud did not answer on resume',
        waitedMs: GATE_TIMEOUT_MS
      });
    }, GATE_TIMEOUT_MS);

    try {
      refreshRemoteIndexWatch();
      await pullRemoteUpdatesIfNeeded();
    } catch (error) {
      console.error('Auto sync download on resume failed:', error);
    } finally {
      clearTimeout(giveUp);
      resumeCheckInProgress = false;
    }
  }

  async function autoSyncUploadTick(options = {}) {
    if (!autoSyncEnabled || !firebaseReady || !authUser || uploadInProgress || cloudBootstrapInProgress) return;
    const force = options.force === true;
    const owed = owedSinceLaunch.size > 0;
    if (!autoSyncDirty && !force && !owed) return;
    owedSinceLaunch = new Set();

    const perFile = await buildLocalSyncFingerprint();
    const fileNames = Object.keys(perFile);
    if (!fileNames.length) {
      autoSyncDirty = false;
      return;
    }

    // Only the folders whose own stamp moved since the last tick. Editing one
    // note used to re-save every folder in the account; and before this, simply
    // working out that nothing had changed opened every one of them.
    const changedNames = force
      ? fileNames
      : fileNames.filter(
          fileName => perFile[fileName].fingerprint !== lastAutoSyncFingerprintByFile[fileName]
        );

    if (!changedNames.length) {
      autoSyncDirty = false;
      return;
    }

    if (syncTooOld) {
      if (syncFailureNotice !== TOO_OLD_MESSAGE) {
        syncFailureNotice = TOO_OLD_MESSAGE;
        logSync('skip', '', 'not uploaded: this version is too old for the cloud');
      }
      autoSyncDirty = false;
      return;
    }

    // Only now, and only for these, is a folder actually opened -- the
    // attachment summary is the one part that needs to see the content.
    await Promise.all(
      changedNames.map(async fileName => {
        perFile[fileName].attachmentFingerprint = await attachmentSignatureFor(fileName);
      })
    );

    for (const fileName of changedNames) {
      logSync('upload', fileName, 'queued for upload', {
        because: 'updatedAt moved',
        updatedAt: perFile[fileName].fingerprint,
        lastSent: lastAutoSyncFingerprintByFile[fileName] ?? '(never)'
      });
    }

    const { uploadedNames, failures, unsyncable } = await uploadFilesToCloud(changedNames, {
      shouldUploadAttachments: fileName =>
        force || perFile[fileName].attachmentFingerprint !== lastAutoSyncAttachmentFingerprintByFile[fileName]
    });

    // The other half of "queued for upload": without it a log ends at the
    // queue, and a folder that went up cannot be told from one that never did
    // (2026-10-05).
    for (const fileName of uploadedNames) logSync('upload', fileName, 'sent to the cloud');
    for (const { fileName, error } of failures) {
      logSync('error', fileName, 'upload failed', { error: String(error?.code || error?.message || error) });
    }
    for (const fileName of unsyncable) logSync('skip', fileName, 'not uploaded: the name cannot be used in the cloud');

    // Only what actually reached the cloud is remembered as sent. Recording a
    // folder that failed would leave it looking synced while its changes sat on
    // this device alone.
    for (const fileName of uploadedNames) {
      lastAutoSyncFingerprintByFile[fileName] = perFile[fileName].fingerprint;
      lastAutoSyncAttachmentFingerprintByFile[fileName] = perFile[fileName].attachmentFingerprint;
    }
    if (failures.length) {
      const [{ fileName, error }] = failures;
      // A refusal may be the cloud having moved past this version while it
      // was open: asked again before it is explained, so it is not called the
      // daily limit.
      if (!syncTooOld && /permission/i.test(String(error?.code || error?.message || error))) {
        try { syncTooOld = !(await checkSyncCompatibility()).compatible; } catch { /* explained as it is */ }
      }
      if (syncTooOld) {
        syncFailureNotice = TOO_OLD_MESSAGE;
        autoSyncDirty = false;
        return;
      }
      // The account's own record is passed in because the error cannot tell
      // "you are out of space" from "something else refused this" — both
      // arrive as an identical storage/unauthorized.
      const detail = explainSyncFailure(error, { storageUsage: planUsage });
      syncFailureNotice = failures.length > 1
        ? `${failures.length} folders could not sync. "${fileName}": ${detail}`
        : `"${fileName}" could not sync: ${detail}`;
    } else if (unsyncable.length) {
      const named = unsyncable.map(name => (name ? `"${name}"` : 'an unnamed folder')).join(', ');
      syncFailureNotice =
        `${named} stays on this device: a folder name cannot be empty or contain . # $ [ ] or /. ` +
        'Everything else is syncing normally.';
    } else {
      syncFailureNotice = '';
    }

    await payOwedDeletes(failures.length > 0);

    // A folder left behind is still owed an upload, so the next tick tries it
    // again instead of waiting for another edit to mark things dirty. Names the
    // database cannot use are not included: those will never succeed, and
    // holding the flag up for them would keep the loop running forever.
    autoSyncDirty = failures.length > 0;

    // Recorded as seen so an unusable folder stops being offered on every tick.
    for (const fileName of unsyncable) {
      lastAutoSyncFingerprintByFile[fileName] = perFile[fileName]?.fingerprint;
      lastAutoSyncAttachmentFingerprintByFile[fileName] = perFile[fileName]?.attachmentFingerprint;
    }
  }

  async function toggleAutoSync() {
    if (autoSyncEnabled) {
      autoSyncEnabled = false;
      persistAutoSyncEnabled(false);
      return;
    }

    if (!firebaseReady || !authUser) {
      await appAlert('Sign in with Google first.');
      return;
    }

    autoSyncEnabled = true;
    persistAutoSyncEnabled(true);
    autoSyncDirty = true;
    cloudSyncGateInProgress = true;
    takeLock('gate');
    try {
      await pullRemoteUpdatesIfNeeded();
      await remountCurrentSaveIfLoaded();
    } finally {
      cloudSyncGateInProgress = false;
      releaseLock('gate');
    }
  }

  async function downloadAllCloudToLocal() {
    if (!firebaseReady) {
      await appAlert('Firebase is not configured yet.');
      return;
    }

    if (!authUser) {
      await appAlert('Sign in with Google first.');
      return;
    }

    if (downloadInProgress) return;

    downloadInProgress = true;
    takeLock('download');
    try {
      await pullRemoteUpdatesIfNeeded({ showInfo: true });
    } catch (error) {
      console.error(error);
      await appAlert(`Download failed: ${error?.message || error}`);
    } finally {
      downloadInProgress = false;
      releaseLock('download');
    }
  }

  // Push ownerless local folders into the signed-in account. A folder whose
  // name already exists in the cloud is renamed first — uploading over it would
  // replace that account's copy with this device's, losing one of the two.
  async function adoptLocalFoldersIntoAccount(names) {
    if (!names.length) return;
    let remoteNames;
    try {
      remoteNames = new Set(Object.keys((await loadRemoteIndex()) || {}));
    } catch (error) {
      console.error('Could not read the cloud file list before adopting folders:', error);
      return; // leave them local; the regular sync will retry later
    }

    const toUpload = [];
    for (const name of names) {
      let target = name;
      if (remoteNames.has(target)) {
        let suffix = 2;
        target = `${name} (this device)`;
        while (remoteNames.has(target)) target = `${name} (this device ${suffix++})`;
        const payload = await loadBlocks(name);
        // Not the cloud's folder of that name: one of its own (utils/folderIdentity.js).
        await saveBlocks(target, { ...payload, modeSettings: settingsForCopy(payload?.modeSettings) });
        await deleteBlocks(name);
        if (currentSaveName === name) {
          currentSaveName = target;
          persistLastSaveName(target);
        }
      }
      remoteNames.add(target);
      toUpload.push(target);
    }

    savedList = await listSavedBlocks();
    try {
      await uploadFilesToCloud(toUpload, { shouldUploadAttachments: () => true });
    } catch (error) {
      console.error('Failed to add local folders to this account:', error);
    }
  }

  async function bootstrapCloudSync() {
    if (!firebaseReady || !authUser) return;
    if (cloudBootstrapInProgress) return;

    cloudBootstrapInProgress = true;
    takeLock('bootstrap');
    try {
      const previousUid = loadSyncedUid();
      const localBeforeSync = await listSavedBlocks();

      if (previousUid && previousUid !== authUser.uid) {
        // Signed into a different account than this device's files came from
        // (a switch that skipped sign-out). They aren't this account's to
        // upload, and they're already backed up under the other one.
        await wipeLocalSaves();
      } else if (!previousUid && localBeforeSync.length) {
        // Folders that belong to no account yet — made while signed out, or
        // kept behind at the last sign-out. Adding them to this account is a
        // real decision, so ask instead of silently adopting them.
        const count = localBeforeSync.length;
        const folderWord = count === 1 ? 'folder' : 'folders';
        const choice = await appChoice(
          `This device has ${count} ${folderWord} that ${count === 1 ? "isn't" : "aren't"} ` +
          `linked to any account yet ` +
          `(${localBeforeSync.slice(0, 3).join(', ')}${count > 3 ? ', …' : ''}).\n\n` +
          `• Add to this account — uploads them to your cloud and keeps them here.\n` +
          `• Delete them — removes them from this device; your cloud folders are untouched.`,
          [
            { id: 'adopt', label: 'Add to this account', variant: 'safe' },
            { id: 'delete', label: 'Delete them', variant: 'danger' }
          ]
        );
        // Dismissing keeps them — never lose folders to a stray tap.
        if (choice === 'delete') {
          await wipeLocalSaves();
        } else {
          await adoptLocalFoldersIntoAccount(localBeforeSync);
        }
      }
      persistSyncedUid(authUser.uid);

      const [localNames, remoteIndex] = await Promise.all([
        listSavedBlocks(),
        loadRemoteIndex()
      ]);
      const remoteNames = Object.keys(remoteIndex || {});
      const localNameSet = new Set(localNames);
      const remoteNameSet = new Set(remoteNames);

      // Simple sync policy:
      // 1) First time account (no cloud files): upload all local files.
      // 2) Existing cloud account (has cloud files): download cloud files locally.
      if (remoteNames.length === 0) {
        for (const localName of localNames) {
          const localPayload = await loadBlocks(localName);
          await saveRemoteFileWithMemory(localName, localPayload, { uploadAttachments: true });
        }

        savedList = await listSavedBlocks();
        cloudBootstrapComplete = true;
        autoSyncDirty = false;
        return;
      }

      // Existing account: the cloud wins, but only where it has anything to
      // say. This downloaded and rewrote every folder in the account on every
      // single launch -- seventeen full downloads and seventeen full writes for
      // a device that was already up to date -- which is most of what "waiting
      // for the sync" was. Now a folder is fetched when its stamp is ahead of
      // this device's, and a device that is current fetches nothing at all.
      const localMeta = await loadAllSaveMeta();
      const behind = [];
      // Not a folder in the bin, nor an old name a rename left: this is the
      // path that brought deleted folders back at every launch (2026-10-06).
      await refreshBin();
      const owedDeletes = readOwedDeletes();
      for (const remoteName of remoteNames) {
        if (leaveInCloud(remoteName, { owedDeletes, localFolders: localNames })) continue;
        if (await applyCloudBin(remoteName, remoteIndex[remoteName], binEntries, await listSavedBlocks()) !== 'normal') continue;
        const mine = localMeta[remoteName];
        const remoteAt = Number(remoteIndex[remoteName]?.modifiedAt || remoteIndex[remoteName]?.updatedAt || 0);
        const localAt = Number(mine?.modifiedAt || mine?.updatedAt || 0);
        if (!mine || remoteAt > localAt) behind.push(remoteName);
      }

      logSync('download', '', behind.length ? 'fetching the folders that moved' : 'already up to date', {
        folders: remoteNames.length,
        fetching: behind.length
      });

      for (const remoteName of behind) {
        const remotePayload = await loadRemoteFile(remoteName);
        if (remotePayload) {
          // Changed here since this device last saw the cloud, and changed
          // there too: this device's version is kept as a folder of its own
          // before the cloud's comes in (utils/syncConflict.js). Unknown when
          // nothing was recorded -- the first launch of this version -- and
          // then the copy below is what is kept, as before.
          const seenAt = cloudSeen[remoteName];
          const localAt = Number(localMeta[remoteName]?.modifiedAt || localMeta[remoteName]?.updatedAt || 0);
          if (localMeta[remoteName] && seenAt && localAt > seenAt) {
            try {
              await saveConflictCopy(remoteName, await loadBlocks(remoteName));
              autoSyncDirty = true;
            } catch (error) {
              // Not taken over, then: kept as it is, and asked about again next launch.
              logSync('error', remoteName, 'could not keep this device\'s version, so the cloud\'s was not taken', { error: String(error?.message || error) });
              continue;
            }
          }
          // A device that had work of its own is exactly where "the cloud wins"
          // hurts, so what it had is kept before the cloud takes over.
          await keepReplacedCopy(
            remoteName,
            localMeta[remoteName] ? await loadBlocks(remoteName) : null,
            remotePayload
          );
          await saveBlocks(remoteName, remotePayload);
          rememberCloudSyncForFile(remoteName, Number(remotePayload?.lastSyncedAt || Date.now()));
          noteCloudSeen(remoteName, remoteIndex[remoteName]?.modifiedAt || remoteIndex[remoteName]?.updatedAt);
          // As above: what was just fetched is not owed back.
          lastAutoSyncFingerprintByFile[remoteName] =
            Number((await loadSaveMeta(remoteName))?.updatedAt || receivedFromCloud(remotePayload));
          delete lastAutoSyncAttachmentFingerprintByFile[remoteName];
        }
      }

      // What the cloud already has is not owed an upload. Without this, the
      // first tick after every launch queued every folder in the account
      // because nothing had been recorded as sent yet -- the account uploading
      // itself to itself, once per start.
      const afterFetch = await loadAllSaveMeta();
      for (const [fileName, times] of Object.entries(afterFetch)) {
        const remoteAt = Number(
          remoteIndex[fileName]?.modifiedAt || remoteIndex[fileName]?.updatedAt || 0
        );
        if (remoteAt && remoteAt >= Number(times?.modifiedAt || 0)) {
          lastAutoSyncFingerprintByFile[fileName] = Number(times?.updatedAt || 0);
          // In step with the cloud: this is what it was seen to hold.
          noteCloudSeen(fileName, remoteAt);
        }
      }

      // And what this device has ahead of the cloud goes up now, not at the
      // next edit: work that failed to go up before the app shut (aheadOfCloud
      // in utils/syncOwing.js; rehearsal of 0.8.67, 2026-11-11).
      const owed = aheadOfCloud(afterFetch, remoteIndex);
      if (owed.length) {
        logSync('upload', '', 'ahead of the cloud since before this launch', { folders: owed.join(', ') });
        owedSinceLaunch = new Set([...owedSinceLaunch, ...owed]);
      }

      savedList = await listSavedBlocks();
      // The loop above refreshed IndexedDB, but the open folder is still the
      // copy read at boot — reopen it, and only when it was one of the ones
      // that changed.
      if (behind.includes(currentSaveName) || !savedList.includes(currentSaveName)) {
        await openCurrentOrFirstSave();
      }
      cloudBootstrapComplete = true;
      autoSyncDirty = false;
    } catch (error) {
      console.error('Cloud bootstrap sync failed:', error);
      // Do not block regular autosync forever if bootstrap fails.
      cloudBootstrapComplete = true;
    } finally {
      cloudBootstrapInProgress = false;
      releaseLock('bootstrap');
    }
  }

  // ── Export, import, rename, duplicate ────────────────────────────
  // Asked for on 2026-10-05. What a file holds and how a new folder is named
  // are decided in utils/folderTransfer.js; a folder's pictures are made its
  // own by utils/cloudFiles.js; the old name a rename leaves in the cloud is
  // remembered by utils/folderMoves.js. This part does the reading and
  // writing.
  let exportDialogOpen = false;
  let exportBusy = false;
  let importState = null; // { file, fileName }
  let importBusy = false;

  function exportJSON() {
    exportDialogOpen = true;
  }

  /** An edit still waiting out its debounce, written before a folder is read whole. */
  async function flushWaitingSave() {
    if (!_pendingSave) return;
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    _firstQueuedAt = 0;
    const waiting = _pendingSave;
    _pendingSave = null;
    await _runSave(waiting);
  }

  const withoutSessionFields = blockList => (blockList || []).map(block => {
    const { _version, resolvedSrc, attachmentRequiresAuth, ...kept } = block || {};
    return kept;
  });

  async function runExport(event) {
    const { scope, settings, pictures, currentTheme, customThemes: withCustomThemes, music } = event.detail || {};
    exportBusy = true;
    try {
      await flushWaitingSave();
      const names = scope === 'all' ? [...savedList] : [currentSaveName].filter(Boolean);
      const folders = [];
      let failed = 0;
      for (const name of names) {
        let payload = await loadBlocks(name);
        if (!payload) continue;
        if (pictures) {
          const embedded = await embedCloudFiles(payload);
          payload = embedded.payload;
          failed += embedded.failed;
        }
        folders.push({
          name,
          blocks: withoutSessionFields(payload.blocks),
          modeOrders: payload.modeOrders,
          modeSettings: payload.modeSettings
        });
      }
      const file = buildExport({
        folders,
        include: { settings, currentTheme, customThemes: withCustomThemes },
        themes: {
          custom: customThemes.map(theme => ({ id: theme.id, name: theme.name, description: theme.description, ...lookOf(theme) })),
          selectedId: selectedThemeId,
          // The theme on screen as it is -- even unsaved -- so it can be made
          // again where it has never been.
          current: {
            id: selectedThemeId,
            name: activeTheme?.name || 'Imported theme',
            description: activeTheme?.description || '',
            ...lookOf({ controlColors, blockTheme, previewBg: currentThemePreviewBg, ...themeExtras })
          }
        }
      });
      const baseName = scope === 'all' ? 'Austavia folders' : currentSaveName || 'Austavia';
      if (music) {
        // With the music, the file is a zip: the folders as they would have
        // been, beside the audio -- see utils/musicTransfer.js.
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        zip.file(FOLDERS_ENTRY, JSON.stringify(file, null, 2));
        await packMusic(zip, musicLibrary, { loadTrack: loadMusicTrack, loadCover: ensureMusicCover });
        await deliverFile(await zip.generateAsync({ type: 'blob' }), `${baseName}.zip`);
      } else {
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
        await deliverFile(blob, `${baseName}.json`);
      }
      exportDialogOpen = false;
      if (failed) {
        await appAlert(`${failed} picture${failed === 1 ? '' : 's'} could not be fetched, and stay${failed === 1 ? 's' : ''} as a link in the file.`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      await appAlert(`The export could not be made: ${error?.message || error}`);
    } finally {
      exportBusy = false;
    }
  }

  async function importJSON(event) {
    const input = event?.target;
    const chosen = input?.files?.[0];
    if (!chosen) return;
    if (input) input.value = '';

    // A zip is an export with music, or Playlist mode's own music file.
    if (/\.zip$/i.test(chosen.name) || /zip/.test(chosen.type)) {
      try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(chosen);
        const foldersEntry = zip.file(FOLDERS_ENTRY);
        const file = foldersEntry
          ? readExport(await foldersEntry.async('string'), chosen.name)
          : { folders: [], themes: null, legacy: false };
        const music = await readMusicManifest(zip);
        if (file.error || (!file.folders.length && !file.themes && !music?.tracks.length)) {
          await appAlert(file.error || 'This file has nothing in it to import.');
          return;
        }
        importState = { file, fileName: chosen.name, zip, music };
      } catch (error) {
        await appAlert(`This zip could not be read: ${error?.message || error}`);
      }
      return;
    }

    const file = readExport(await chosen.text(), chosen.name);
    if (file.error) {
      await appAlert(file.error);
      return;
    }
    importState = { file, fileName: chosen.name };
  }

  async function runImport(event) {
    const choice = event.detail || {};
    const plan = planImport({
      file: importState?.file,
      folders: choice.folders,
      settings: choice.settings,
      themes: choice.themes,
      currentTheme: choice.currentTheme,
      target: choice.target,
      existingFolders: savedList,
      currentFolder: currentSaveName,
      existingThemes: availableThemes,
      officialThemeIds: STYLE_PRESETS.map(theme => theme.id)
    });
    if (plan.error) {
      await appAlert(plan.error);
      return;
    }

    importBusy = true;
    try {
      await flushWaitingSave();
      for (const write of plan.writes) {
        const importedBlocks = withoutSessionFields(write.blocks);
        if (write.replaces) {
          // In place of the open folder -- kept first, so it can be put back
          // from Settings, Advanced, kept copies.
          const current = await loadBlocks(write.name);
          const next = {
            blocks: importedBlocks,
            modeOrders: ensureModeOrders(importedBlocks, write.modeOrders),
            // In place of the folder, it stays that folder (utils/folderIdentity.js).
            modeSettings: normalizeModeSettings(write.modeSettings === undefined
              ? current?.modeSettings
              : settingsInPlaceOf(write.modeSettings, write.name, current?.modeSettings))
          };
          await keepReplacedCopy(write.name, current, next);
          await saveBlocks(write.name, next);
          logSync('save', write.name, 'replaced by an import');
        } else {
          await saveBlocks(write.name, {
            blocks: importedBlocks,
            modeOrders: ensureModeOrders(importedBlocks, write.modeOrders),
            modeSettings: normalizeModeSettings(settingsForCopy(write.modeSettings))
          });
          logSync('save', write.name, 'made by an import');
        }
      }

      // Themes go in as the theme editor adds them: new ids, names no theme has.
      const madeFrom = new Map();
      for (const theme of plan.themes) {
        const payload = normalizeThemePayload(theme);
        const created = payload && createCustomThemePayload(payload);
        if (!created) continue;
        customThemes = [...customThemes, created];
        madeFrom.set(theme.id, created);
        pushThemeToCloud(created);
      }
      if (madeFrom.size) persistCustomThemes(customThemes);
      if (choice.music && importState.music && importState.zip) {
        const imported = await unpackMusic(importState.zip, importState.music, {
          saveTrack: saveMusicTrack,
          saveCover: saveMusicCover,
          onTrack: forgetCoverlessTrack
        });
        await handleLibraryChange(mergeMusicLibrary(musicLibrary, importState.music, imported));
      }

      const switchTo = plan.switchTo;
      if (switchTo) {
        const target = switchTo.source === 'added'
          ? madeFrom.get(switchTo.id)
          : availableThemes.find(theme => theme.id === switchTo.id);
        if (target) applyThemePreset(target);
      }

      savedList = await listSavedBlocks();
      autoSyncDirty = true;
      importState = null;
      if (plan.writes.length) await load(plan.writes[0].name);
    } catch (error) {
      console.error('Import failed:', error);
      await appAlert(`The import could not be finished: ${error?.message || error}`);
    } finally {
      importBusy = false;
    }
  }

  function readOwedDeletes() {
    try {
      return readPending(localStorage.getItem(PENDING_DELETES_KEY));
    } catch {
      return [];
    }
  }

  function writeOwedDeletes(list) {
    try {
      localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(list));
    } catch { /* tried again next time */ }
  }

  /**
   * The open folder under a new name -- the same folder, not a second one.
   * Asked for on 2026-10-05. Its pictures are fetched and kept with it first:
   * the old name's cloud path is deleted once the folder is up under the new
   * one, and links into it would break. Offline, that fetch fails, and the
   * rename waits rather than risk them.
   */
  async function renameFolder(event) {
    const to = String(event.detail?.to ?? '').trim();
    const from = currentSaveName;
    if (!to || to === from) return;

    // Nothing saved under the old name yet: the first save takes the new one.
    if (!from || !savedList.includes(from)) {
      currentSaveName = to;
      persistLastSaveName(to);
      return;
    }
    if (savedList.includes(to)) {
      await appAlert(`There is already a folder called "${to}".`);
      return;
    }

    try {
      await flushWaitingSave();
      const current = await loadBlocks(from);
      const { payload, failed } = await embedCloudFiles(current, { audio: true });
      if (failed) {
        await appAlert(`${failed} picture${failed === 1 ? '' : 's'} in this folder could not be fetched, so it was not renamed. Try again when online.`);
        return;
      }
      // The same folder under a new name: its id goes with it, so a nest's
      // link to it still leads to it (utils/folderIdentity.js).
      await saveBlocks(to, { blocks: payload.blocks, modeOrders: payload.modeOrders, modeSettings: settingsForRename(payload.modeSettings, from) });
      await deleteBlocks(from);
      writeOwedDeletes(withPending(readOwedDeletes(), from));
      savedList = await listSavedBlocks();
      persistLastSaveName(to);
      logSync('save', to, `renamed from "${from}"`);
      autoSyncDirty = true;
      await load(to);
    } catch (error) {
      console.error('Rename failed:', error);
      await appAlert(`The folder could not be renamed: ${error?.message || error}`);
    }
  }

  // ── The bin ───────────────────────────────────────────────────────
  // Deleted folders, kept on this device for 15 days -- asked for on
  // 2026-10-06. The rules are utils/folderBin.js; this reads and writes.
  let binEntries = [];
  let binOpen = false;
  let binBusy = false;

  /**
   * What is in the bin now, with anything past its 15 days emptied -- worked
   * out from when each was deleted, every time, rather than scheduled. An
   * emptied folder's cloud copy is owed a delete, paid by the upload tick.
   */
  async function refreshBin() {
    try {
      const { kept, expired } = sortBin(await listBinEntries());
      for (const entry of expired) await deleteBinEntry(entry.id);
      binEntries = kept;
      await deleteFromCloudNow(cloudDeletesAfterEmptying(expired, kept, savedList));
    } catch (error) {
      console.warn('Could not read the bin:', error);
    }
    return binEntries;
  }

  /**
   * The cloud copy of folders the bin has let go of -- deleted for ever, or
   * past their 15 days -- deleted now, not left for later. Only then: moving a
   * folder into the bin leaves the cloud alone, so Restore has something to
   * come back to. Remembered first, so one that fails offline is tried again
   * by the upload tick (payOwedDeletes).
   */
  async function deleteFromCloudNow(names) {
    if (!names.length) return;
    let owed = readOwedDeletes();
    for (const name of names) owed = withPending(owed, name);
    writeOwedDeletes(owed);
    if (!firebaseReady || !authUser) return;

    for (const name of names) {
      try {
        await deleteRemoteFile(name);
        writeOwedDeletes(readOwedDeletes().filter(item => item !== name));
        logSync('upload', name, 'deleted from the cloud: it left the bin');
      } catch (error) {
        logSync('error', name, 'could not delete it from the cloud yet; it will be tried again', { error: String(error?.message || error) });
      }
    }
  }

  async function openBin() {
    await refreshBin();
    binOpen = true;
  }

  async function restoreFromBin(event) {
    const entry = event.detail;
    if (!entry?.payload) return;
    binBusy = true;
    try {
      const name = restoreName(entry, savedList);
      const { blocks: keptBlocks = [], modeOrders: keptOrders, modeSettings: keptSettings } = entry.payload;
      await saveBlocks(name, { blocks: keptBlocks, modeOrders: keptOrders, modeSettings: keptSettings });
      await deleteBinEntry(entry.id);
      savedList = await listSavedBlocks();
      logSync('save', name, name === entry.name ? 'restored from the bin' : `restored from the bin as "${name}"`);
      autoSyncDirty = true;
      await refreshBin();
      binOpen = false;
      await load(name);
    } catch (error) {
      console.error('Restore failed:', error);
      await appAlert(`The folder could not be restored: ${error?.message || error}`);
    } finally {
      binBusy = false;
    }
  }

  async function forgetFromBin(event) {
    const entry = event.detail;
    if (!entry) return;
    const sure = await appConfirm(`Delete "${entry.name}" for ever? It cannot be brought back, and its copy in the cloud is deleted too.`);
    if (!sure) return;
    await deleteBinEntry(entry.id);
    const { kept } = sortBin(await listBinEntries());
    await deleteFromCloudNow(cloudDeletesAfterEmptying([entry], kept, savedList));
    logSync('save', entry.name, 'deleted for ever from the bin');
    await refreshBin();
  }

  /** A copy of a folder, named as an import would be: "Damn 1", "Damn 2". */
  async function duplicateFolder(name) {
    if (!savedList.includes(name)) return;
    try {
      if (name === currentSaveName) await flushWaitingSave();
      const current = await loadBlocks(name);
      const { payload, failed } = await embedCloudFiles(current, { audio: true });
      if (failed) {
        await appAlert(`${failed} picture${failed === 1 ? '' : 's'} could not be fetched, so the copy was not made. Try again when online.`);
        return;
      }
      const copyName = uniqueName(name, savedList);
      // A different folder: it takes its own id from its name.
      await saveBlocks(copyName, { blocks: payload.blocks, modeOrders: payload.modeOrders, modeSettings: settingsForCopy(payload.modeSettings) });
      savedList = await listSavedBlocks();
      logSync('save', copyName, `duplicated from "${name}"`);
      autoSyncDirty = true;
    } catch (error) {
      console.error('Duplicate failed:', error);
      await appAlert(`The folder could not be copied: ${error?.message || error}`);
    }
  }

  /**
   * Old names a rename left in the cloud, deleted once nothing is failing to
   * upload -- so the renamed folder, pictures and all, is up first. Owed
   * across restarts; see utils/folderMoves.js.
   */
  async function payOwedDeletes(uploadFailed) {
    let owed = settlePending(readOwedDeletes(), savedList);
    for (const name of deletesToRun({ pending: owed, localFolders: savedList, uploadFailed })) {
      try {
        await deleteRemoteFile(name);
        owed = owed.filter(item => item !== name);
        logSync('upload', name, 'old name deleted from the cloud after a rename');
      } catch (error) {
        logSync('error', name, 'could not delete the old name from the cloud', { error: String(error?.message || error) });
      }
    }
    writeOwedDeletes(owed);
  }

  function setControlsHeight(value) {
    const px = `${value}px`;
    if (canvasRef) {
      canvasRef.style.setProperty("--controls-height", px);
    }
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--controls-height", px);
    }
  }

  function adjustCanvasPadding() {
    if (typeof window === "undefined") return;

    const fallbackHeight = window.innerWidth <= MOBILE_BREAKPOINT ? 55 : 56;
    const height = controlsRef?.offsetHeight || fallbackHeight;
    setControlsHeight(height);
  }

  async function handleModeSettingChange(event) {
    const detail = event.detail || {};
    let patch = { ...modeSettings };

    if (detail.columnCount !== undefined) {
      const nextColumnCount = Math.max(1, Number.parseInt(detail.columnCount, 10) || DEFAULT_MODE_SETTINGS.simple.columnCount);
      patch = { ...patch, simple: { ...patch.simple, columnCount: nextColumnCount } };
    }

    if (detail.taskAddDirection !== undefined) {
      patch = { ...patch, task: { ...patch.task, addDirection: detail.taskAddDirection } };
    }

    // The folder's wallpaper -- every mode's -- which arrives
    // under Canvas mode's own id.
    if (detail.default && typeof detail.default === 'object') {
      patch = { ...patch, default: { ...patch.default, ...detail.default } };
      if ('backgroundImage' in detail.default || 'backgroundImageMobile' in detail.default) {
        wallpaperChanged = true;
      }
    }

    if (detail.blocksFollowTheme !== undefined) {
      patch = { ...patch, blocksFollowTheme: detail.blocksFollowTheme === true };
    }

    if (detail.playlist && typeof detail.playlist === 'object') {
      patch = { ...patch, playlist: { ...patch.playlist, ...detail.playlist } };
    }

    const habitsChange = detail.habit && typeof detail.habit === 'object' &&
      !habitsEqual(modeSettings?.habit?.habits, detail.habit.habits ?? modeSettings?.habit?.habits);
    // What a page shows is made, as habits are: a step for Undo.
    const pageChange = detail.page && typeof detail.page === 'object' &&
      !samePage(modeSettings?.page?.rows, detail.page.rows);
    // Typing not yet in the history gets its own entry first, so undoing the
    // habit change does not also take the typing with it.
    if (habitsChange || pageChange) await ensureCurrentHistorySnapshot();

    if (pageChange) {
      patch = { ...patch, page: { ...patch.page, ...detail.page } };
    }

    if (detail.habit && typeof detail.habit === 'object') {
      // Said in words in the sync log, so a tap that did not stick, or a
      // habit that went missing, can be traced to the moment it happened.
      for (const line of describeHabitChange(modeSettings?.habit?.habits, detail.habit.habits)) {
        logSync('habit', currentSaveName, line);
      }
      patch = { ...patch, habit: { ...patch.habit, ...detail.habit } };
    }

    const nextModeSettings = normalizeModeSettings(patch);
    modeSettings = nextModeSettings;
    // A habit added, ticked, renamed or deleted is a step the Undo button can
    // take back. pushHistory saves as well. A settle -- a timer reaching its
    // goal by itself -- is not: nobody did it (as for tasks).
    if ((habitsChange && !detail.settled) || pageChange) {
      await pushHistory(blocks, modeOrders);
      return;
    }
    await persistAutosave(blocks, modeOrders, nextModeSettings, { immediate: true });
  }

  function setupControlsObserver() {
    if (typeof ResizeObserver === "undefined" || !controlsRef) {
      return;
    }

    if (observedControlsEl === controlsRef) {
      return;
    }

    controlsResizeObserver?.disconnect();
    controlsResizeObserver = new ResizeObserver(() => adjustCanvasPadding());
    controlsResizeObserver.observe(controlsRef);
    observedControlsEl = controlsRef;
  }

  const handleWindowResize = () => {
    adjustCanvasPadding();
    Pc = window.innerWidth > MOBILE_BREAKPOINT;
  };

  function handleFocusToggle(event) {
    const { id } = event.detail || {};
    if (!id) {
      focusedBlockId = null;
      return;
    }

    focusedBlockId = focusedBlockId === id ? null : id;
  }

  async function moveFocusedBlock(offset) {
    if (!focusedBlockId) return;

    const ordersForMode = normalizedModeOrders[mode] || [];
    const index = ordersForMode.indexOf(focusedBlockId);
    if (index === -1) {
      focusedBlockId = null;
      return;
    }

    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= ordersForMode.length) {
      return;
    }

    const updatedOrder = [...ordersForMode];
    updatedOrder.splice(index, 1);
    updatedOrder.splice(targetIndex, 0, focusedBlockId);

    modeOrders = {
      ...modeOrders,
      [mode]: updatedOrder
    };
    await pushHistory(blocks, modeOrders);
  }

  const moveFocusedBlockUp = () => moveFocusedBlock(-1);
  const moveFocusedBlockDown = () => moveFocusedBlock(1);

  // Drag-and-drop rearranging trades two blocks' slots instead of splicing one
  // out and shifting the rest, so untouched blocks keep their exact positions.
  async function swapBlocksInMode(detail) {
    const { aId, bId } = detail || {};
    if (!aId || !bId || aId === bId) return;

    const ordersForMode = normalizedModeOrders[mode] || [];
    const aIndex = ordersForMode.indexOf(aId);
    const bIndex = ordersForMode.indexOf(bId);
    if (aIndex === -1 || bIndex === -1) return;

    const updatedOrder = [...ordersForMode];
    updatedOrder[aIndex] = bId;
    updatedOrder[bIndex] = aId;

    modeOrders = {
      ...modeOrders,
      [mode]: updatedOrder
    };
    await pushHistory(blocks, modeOrders);
  }


  function setMode(nextMode) {
    if (!KNOWN_MODES.includes(nextMode)) return;
    if (nextMode === mode) return;
    mode = nextMode;
    persistLastMode(nextMode);

    if (
      mode === "single" &&
      !blocks.some(block => block.type === "text" || block.type === "cleantext")
    ) {
      addBlock("text");
    }
  }

  $: if (
    focusedBlockId &&
    !blocks.some(block => block.id === focusedBlockId)
  ) {
    focusedBlockId = null;
  }

  let stopAuthListener = () => {};
  // Torn down and re-attached on every auth change, so one account's figures
  // can never be left on screen for the next person to sign in.
  let stopStorageUsageListener = null;
  let stopSubscriptionListener = null;

  // Kept in localStorage rather than in the database it watches, because a
  // journal of what the database held would be wiped by the very event it
  // exists to record. See utils/storageJournal.js.
  let storageJournal = [];

  async function recordLaunch() {
    try {
      const store = await describeLocalStorage();
      const stored = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]');
      storageJournal = appendLaunch(
        stored,
        journalEntry({
          version: shownVersion,
          store
        })
      );
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(storageJournal));
    } catch (error) {
      // A diagnostic must never be a dependency: storage off, quota full, or a
      // journal somebody has edited by hand all mean no history, not no app.
      console.warn('Could not record this launch:', error);
    }
  }

  onMount(async () => {
    Pc = window.innerWidth > MOBILE_BREAKPOINT;
    // Not awaited. It is a note to a future reader and must never sit between
    // the app starting and the person seeing their notes.
    recordLaunch();
    window.addEventListener("resize", handleWindowResize);
    // Capture: the decision has to be made before the note's own handler
    // sees the key, since it claims every Ctrl+Z it receives.
    window.addEventListener("keydown", handleUndoRedoShortcut, true);
    window.addEventListener("keydown", handleFullscreenShortcut);
    window.addEventListener("paste", handlePaste);
    // Backgrounding the app is the moment most likely to be followed by the
    // process being killed, so the position is written out there too.
    document.addEventListener("visibilitychange", handleVisibilityForMusic);
    window.addEventListener("pagehide", rememberPlaybackPosition);
    // The log is coalesced while running; this is the last chance to write it,
    // and a phone being put away is exactly when the process may not come back.
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistNow();
    });
    // Ready the Google plugin now rather than when the button is pressed, so
    // the tap opens the picker instead of starting the work that leads to it.
    // Idle time, and it never throws — sign-in still initialises on demand.
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => prewarmGoogleSignIn(), { timeout: 4000 });
    } else {
      setTimeout(prewarmGoogleSignIn, 1500);
    }

    setupMediaSessionHandlers();
    // What the notification's own buttons do.
    setBackgroundAudioActions({
      previous: () => stepMusic(-1),
      toggle: toggleMusic,
      next: () => stepMusic(1),
      // Swiping the notification away, which is the only thing that reaches
      // this. It means "put this away", not "throw away what I was listening
      // to" — so the track stays loaded and only playback stops. The dismissal
      // is remembered against this track so that pausing, which is a change the
      // notification watches, does not put it straight back up.
      dismiss: putTheNotificationAway,
      // Dragging the progress bar in the shade or on the lock screen. The web
      // player owns the audio element, so the move happens here and the shade
      // is told where it landed on the update that follows.
      seek: seconds => {
        if (audioEl && Number.isFinite(seconds)) audioEl.currentTime = seconds;
      }
    });
    loadLocalMusicLibrary();
    adjustCanvasPadding();

    if (!firebaseReady) authStateResolved = true;
    loadShufflePath();
    countTheWait();
    stopWallpaperWatch = watchWallpaperBox();
    window.__austaviaPasteImage = receivePictureFromKeyboard;

    // The gate releases when the device is offline, so it has to hear about it
    // changing either way -- coming back online while held is worth waiting a
    // little longer for, not a reason to open.
    const notedConnection = () => { deviceOnline = wasOnline(); };
    window.addEventListener('online', notedConnection);
    window.addEventListener('offline', notedConnection);
    stopConnectionWatch = () => {
      window.removeEventListener('online', notedConnection);
      window.removeEventListener('offline', notedConnection);
    };

    if (firebaseReady) {
      stopAuthListener = onAuthStateChange(user => {
        authUser = user;
        authStateResolved = true;
        // Signing in is the moment this device's themes and the account's
        // themes need to agree. Not awaited: sync is a background nicety and
        // must never hold up the app starting.
        if (user) syncThemesWithCloud();

        stopStorageUsageListener?.();
        stopStorageUsageListener = null;
        storageUsage = null;

        // Dropped on sign-out as well as picked up on sign-in. A subscription
        // left on screen after somebody signs out would be showing one
        // person's billing to the next one at the same computer.
        stopSubscriptionListener?.();
        stopSubscriptionListener = null;
        subscriptionRecord = null;
        stopPlanListener?.();
        stopPlanListener = null;
        accountPlan = undefined;
        pendingStorageBytes = 0;
        announcedStorageState = '';

        if (user) {
          stopStorageUsageListener = subscribeStorageUsage(usage => {
            // Every guess is checked when the truth arrives. A prediction
            // nobody checks is a lie with a refresh rate -- and disagreeing is
            // not a fault in itself: another device uploading, a sweep
            // removing something, or JSON overhead all move the real number
            // without this one knowing.
            const drift = driftReport({
              previous: storageUsage,
              pendingBytes: pendingStorageBytes,
              arrived: usage
            });

            if (pendingStorageBytes !== 0 && !drift.agrees) {
              lastStorageDrift = { ...drift, at: Date.now() };
              logSync('storage', currentSaveName || '(account)', describeDrift(drift), {
                predicted: drift.expected,
                counted: drift.actual,
                difference: drift.difference
              });
            }

            // The cloud's figure is the true one, adopted whole. The estimate
            // only ever covered the gap until it arrived.
            pendingStorageBytes = 0;
            storageUsage = usage;
          });
          stopSubscriptionListener = subscribeSubscription(record => {
            subscriptionRecord = record;
          });
          stopPlanListener = subscribeAccountPlan(plan => {
            accountPlan = plan;
          });
        }
      });
      checkSyncCompatibility()
        .then(result => {
          if (!result.compatible) {
            syncTooOld = true;
            appAlert(TOO_OLD_MESSAGE);
          }
        })
        .catch(() => {});
    }

    savedList = await listSavedBlocks();
    const storedLastSave = loadStoredLastSaveName();
    refreshBin();
    const safeModeFromShift = await detectShiftSafeModeDuringStartup();
    const safeModeActive = safeModeFromShift;
    let shouldClearLastSavePointer = false;

    if (safeModeActive) {
      deferredLastSaveName = storedLastSave || '';
      deferredLastSaveReason = 'Safe mode: Shift key held on launch.';
      shouldClearLastSavePointer = true;
      persistLastSaveName('');
      clearBootLoadGuard();
      currentSaveName = FALLBACK_SAVE_NAME;
      blocks = [];
      modeOrders = ensureModeOrders(blocks, {});
    } else {
      if (storedLastSave && savedList.includes(storedLastSave)) {
        currentSaveName = storedLastSave;
      } else if (!currentSaveName && savedList.length) {
        currentSaveName = savedList[0];
      }

      const guardedSave = currentSaveName || FALLBACK_SAVE_NAME;
      const bootGuard = loadBootLoadGuard();

      if (bootGuard?.openingLastFile === true) {
        clearBootLoadGuard();
        deferredLastSaveName = bootGuard.pendingSaveName || guardedSave;
        deferredLastSaveReason =
          'Recovered from a previous startup crash while opening the last file.';
        currentSaveName = FALLBACK_SAVE_NAME;
        blocks = [];
        modeOrders = ensureModeOrders(blocks, {});
      } else {
        startBootLoadGuard(guardedSave);
        // The same gap as in load(): a folder name and no folder yet. Nothing
        // is saved until it is on screen -- see mayTakeSave.
        folderOpening = true;
        openingFolderName = guardedSave;
        try {
          const initialData = await loadBlocks(guardedSave);
          const initialBlocks = Array.isArray(initialData)
            ? initialData
            : Array.isArray(initialData?.blocks)
            ? initialData.blocks
            : [];
          const initialOrders = !Array.isArray(initialData)
            ? initialData?.modeOrders
            : {};
          const initialModeSettings = !Array.isArray(initialData)
            ? initialData?.modeSettings
            : null;
          currentSaveName = guardedSave;
          blocks = initialBlocks.map(b => ({
            ...applyHistoryTriggers(b),
            _version: 0
          }));
          modeOrders = ensureModeOrders(blocks, initialOrders);
          modeSettings = normalizeModeSettings(initialModeSettings);
          folderOpening = false;
          clearBootLoadGuard();
          await mergeOldDeviceHabits(guardedSave, initialModeSettings?.habit?.habits);
        } catch (error) {
          console.error('Failed to load last opened save:', error);
          folderOpening = false;
          clearBootLoadGuard();
          await openFallbackSave(guardedSave);
        } finally {
          folderOpening = false;
        }
      }
    }
    // Reopen in whatever mode was last used, rather than always falling back
    // to the viewport default -- unless that mode no longer exists.
    const storedMode = loadLastMode();
    if (storedMode && KNOWN_MODES.includes(storedMode)) {
      mode = storedMode;
    }

    history = [];
    historyIndex = -1;
    await pushHistory(blocks, modeOrders);
    if (shouldClearLastSavePointer) {
      persistLastSaveName('');
    } else if (deferredLastSaveName) {
      persistLastSaveName(deferredLastSaveName);
    } else {
      persistLastSaveName(currentSaveName);
    }

    autoSyncUploadIntervalId = window.setInterval(() => {
      autoSyncUploadTick().catch(error => {
        console.error('Auto sync upload tick failed:', error);
      });
    }, 10_000);

    startAutoSyncDownloadBackstop();
    document.addEventListener('visibilitychange', handleVisibilityForSync);
    // visibilitychange is the reliable one on a desktop and the late one on a
    // phone: an Android WebView can be back in front of somebody before it
    // fires, which is the gap between coming back and the check starting.
    // focus and pageshow arrive on paths visibilitychange misses, and the check
    // itself refuses to run twice, so asking three times costs nothing.
    // Both are hints rather than proof, and only act when the app was away --
    // see shouldCheckOnReturn.
    window.addEventListener('focus', onWindowReturned);
    window.addEventListener('pageshow', onWindowReturned);
    // Closing the tab or window is the other last-safe-moment.
    window.addEventListener('pagehide', flushPendingSave);

    autoSyncUploadTick().catch(error => {
      console.error('Initial auto sync upload tick failed:', error);
    });
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleWindowResize);
    window.removeEventListener("keydown", handleUndoRedoShortcut, true);
    window.removeEventListener("keydown", handleFullscreenShortcut);
    window.removeEventListener("paste", handlePaste);
    document.removeEventListener("visibilitychange", handleVisibilityForMusic);
    window.removeEventListener("pagehide", rememberPlaybackPosition);
    controlsResizeObserver?.disconnect();
    observedControlsEl = null;
    clearTimeout(screenshotNoteTimer);
    stopAuthListener?.();
    stopConnectionWatch?.();
    stopWallpaperWatch?.();
    if (window.__austaviaPasteImage === receivePictureFromKeyboard) {
      delete window.__austaviaPasteImage;
    }
    if (gateTimer) clearInterval(gateTimer);
    stopStorageUsageListener?.();
    stopSubscriptionListener?.();
    stopPlanListener?.();
    stopRemoteIndexWatch();
    document.removeEventListener('visibilitychange', handleVisibilityForSync);
    window.removeEventListener('focus', onWindowReturned);
    window.removeEventListener('pageshow', onWindowReturned);
    window.removeEventListener('pagehide', flushPendingSave);
    if (autoSyncUploadIntervalId !== null) {
      window.clearInterval(autoSyncUploadIntervalId);
      autoSyncUploadIntervalId = null;
    }
    if (autoSyncDownloadIntervalId !== null) {
      window.clearInterval(autoSyncDownloadIntervalId);
      autoSyncDownloadIntervalId = null;
    }
    if (deferredLastSaveTimer !== null) {
      window.clearTimeout(deferredLastSaveTimer);
      deferredLastSaveTimer = null;
    }
  });

  $: scheduleDeferredLastSaveAutoDismiss(!!deferredLastSaveName);

  // Only with a connection: offline it waited on the cloud for ever, was freed
  // by the stalled-lock pass, and started again at once (2026-11-11). Coming
  // back online starts it (deviceOnline).
  $: if (firebaseReady && authUser && deviceOnline && !cloudBootstrapComplete && !cloudBootstrapInProgress) {
    bootstrapCloudSync();
  }

  $: if (!authUser) {
    cloudBootstrapComplete = false;
  }

  $: if (controlsRef) {
    setupControlsObserver();
    adjustCanvasPadding();
  }

  $: if (canvasRef) {
    adjustCanvasPadding();
  }

  $: groupedBlocks = (() => {
    const groups = [];
    for (let i = 0; i < modeOrderedBlocks.length; i++) {
      const block = modeOrderedBlocks[i];
      const next = modeOrderedBlocks[i + 1];
      if (
        block.type === "image" &&
        next &&
        (next.type === "text" || next.type === "cleantext")
      ) {
        groups.push({ type: "pair", image: block, text: next });
        i++;
      } else {
        groups.push(block);
      }
    }
    return groups;
  })();
</script>








<style>

  .app {
  display: flex;
  flex-direction: column;
  height: 100dvh; /* full app height (stable on mobile browsers) */
  overflow: hidden;
  /* Where the bar is, for everything placed by it: what fills the screen
     starts under it (--bar-top) and ends above it (--bar-bottom); pop-ups
     open just past it (--popup-top / --popup-bottom). */
  --bar-top: var(--controls-height, 56px);
  --bar-bottom: 0px;
  --popup-top: calc(var(--controls-height, 56px) + 8px);
  --popup-bottom: auto;
}

/* ── A phone: the bar at the bottom ─────────────────────────────────
   Decided 2026-11-10, on how modes are changed: "For the phone especially I
   was hoping a way that also doesn't take too much more space on the
   screen, especially height." The same bar, at the same height, moved to
   where a thumb is -- nothing added, the top given back to the content.
   Everything that opened under it opens above it, through the variables
   above. While writing, the keyboard is where the bar would be, so the bar
   steps aside (keyboardOpen). PENDING, "How modes are changed", stage a. */
/* A phone's (class on-phone, isPhoneShape) rather than a width's: turned on
   its side a phone is wider than 700px and kept the computer's layout. */
  .app.phone-bar-bottom {
    /* The phone's own status bar: the mode reaches up under it, so its
       background and wallpaper show there, and its content starts below it
       (asked 2026-11-10). */
    --safe-top: env(safe-area-inset-top, 0px);
    --bar-top: 0px;
    --bar-bottom: var(--controls-height, 56px);
    --popup-top: auto;
    --popup-bottom: calc(var(--controls-height, 56px) + 8px);
  }
  .app.phone-bar-bottom > .controls {
    order: 2;
    position: relative;
    border-bottom: none;
    border-top: 1px solid var(--controls-border, #333);
    padding-top: 8px;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
  }
  .app.phone-bar-bottom.keyboard-up > .controls {
    display: none;
  }
  /* A mode's own buttons in the bar while it is short of width (stage c):
     forward only once there is somewhere to go forward to. */
  .app.on-phone.crowded-bar .page-bar-forward:disabled {
    display: none;
  }

/* ── A computer: the modes in a column on the left ─────────────────── */
/* Over the mode rather than beside it, see-through, so the mode's own
   background and wallpaper show behind it; its buttons are the bar's own
   (asked 2026-11-10: "the left side bar should follow the style of the app
   and the background should show behind"). The mode keeps its content clear
   of it. */
.modes { position: relative; }
.mode-rail {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-width: none;
  /* The bar's own colours from the theme, as the theme has them -- a
     see-through theme's bar is see-through here too (asked 2026-11-10). They
     are set on the bar only, so the column is handed them as well. */
  background: var(--controls-bg, #111);
  border-right: 1px solid var(--controls-border, #333);
  z-index: 900;
}
.mode-rail-btn {
  width: 42px;
  height: 42px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--controls-border, #333);
  background: var(--controls-button-bg, var(--controls-bg, #333));
  color: var(--controls-button-text, var(--controls-text, #fff));
  cursor: pointer;
  transition: filter 0.15s ease;
}
.mode-rail-btn:hover { filter: brightness(1.18); }
.mode-rail-btn.active {
  box-shadow: inset 0 0 0 2px var(--controls-button-text, var(--controls-text, #fff));
}
.app.has-rail .modes > :global(:not(.mode-rail):not(.rail-edge):not(.sync-lock-banner):not(.layout-page):not(.mode-strip):not(.gesture-sheet)) {
  /* The column's room, and a mode's scrollbar balance on top of it
     (utils/idleScrollbar.js), which this would otherwise override. */
  padding-left: calc(56px + var(--sb-balance, 0px)) !important;
  box-sizing: border-box;
}
.app.phone-bar-bottom .modes > :global(:not(.mode-rail):not(.rail-edge):not(.sync-lock-banner):not(.layout-page):not(.mode-strip):not(.gesture-sheet)) {
  padding-top: var(--safe-top, 0px) !important;
  box-sizing: border-box;
}
/* The strip of modes while sliding along the bar (modeGesture 'strip'):
   across the width, every mode at its own place. */
.mode-strip {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--controls-height, 56px) + 14px);
  height: 56px;
  z-index: 1500;
  pointer-events: none;
}
.strip-slot,
.strip-space {
  position: absolute;
  bottom: 0;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.strip-slot {
  border-radius: 10px;
  background: var(--controls-bg, #111);
  border: 1px solid var(--controls-border, #333);
  color: var(--controls-button-text, var(--controls-text, #fff));
  opacity: 0.8;
}
.strip-slot.open { border-style: dashed; }
.strip-slot.chosen {
  opacity: 1;
  height: 54px;
  box-shadow: inset 0 0 0 2px var(--controls-button-text, var(--controls-text, #fff)), 0 6px 18px rgba(0, 0, 0, 0.4);
  z-index: 1;
}
/* The middle: letting go here keeps the mode you are in. */
.strip-space {
  color: var(--controls-button-text, var(--controls-text, #fff));
}
.strip-space::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}
.strip-name {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--controls-bg, #111);
  border: 1px solid var(--controls-border, #333);
  color: var(--controls-button-text, var(--controls-text, #fff));
  font-weight: 700;
  font-size: 0.85rem;
}

/* The sheet of modes while sliding up from the bar (modeGesture 'sheet'). */
.gesture-sheet {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: calc(var(--controls-height, 56px) + 8px);
  z-index: 1500;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 10px;
  border-radius: 14px;
  background: var(--controls-bg, #111);
  border: 1px solid var(--controls-border, #333);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}
.gesture-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 70px;
  border-radius: 10px;
  border: 1px solid var(--controls-border, #333);
  background: var(--controls-button-bg, transparent);
  color: var(--controls-button-text, var(--controls-text, #fff));
  font-size: 0.78rem;
  text-align: center;
}
.gesture-mode.open { border-style: dashed; }
.gesture-mode.chosen {
  box-shadow: inset 0 0 0 2px var(--controls-button-text, var(--controls-text, #fff));
  transform: scale(1.05);
}

/* The column that hides: off the left edge until the pointer reaches it. */
.rail-edge {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 10px;
  z-index: 961;
}
.app.rail-auto .mode-rail {
  z-index: 960;
  /* Over the content while it is out, so solid -- the theme's bar colour
     without its see-through (asked 2026-11-10); the column that stays is
     beside the content and keeps the theme as it is. */
  background: var(--controls-bg-solid, var(--controls-bg, #111));
  transform: translateX(-100%);
  transition: transform 0.18s ease;
}
.app.rail-auto .rail-edge:hover + .mode-rail,
.app.rail-auto .mode-rail:hover,
.app.rail-auto .mode-rail:focus-within {
  transform: none;
}
/* Gone once a mode is chosen from it, though the pointer is still there
   (tuckRail). Weighs as much as the edge's hover above and comes after it. */
.app.rail-auto .rail-edge + .mode-rail.tucked {
  transform: translateX(-100%);
}
/* The layout page starts after a column that stays. */
.app.has-rail .modes > :global(.layout-page) {
  left: 56px;
}
/* The column is a computer's; a phone has the sheet and the swipe. After the
   rules that draw it: Svelte weighs both the same, so the later one wins. */
.app.on-phone .mode-rail { display: none; }
.controls {
  flex: 0 0 auto;  /* only as tall as needed */
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  padding-top: max(8px, env(safe-area-inset-top));
  background: var(--controls-bg, #111);
  border-bottom: 1px solid var(--controls-border, #333);
  overscroll-behavior: contain;
}

.right-controls {
  margin-left: 8px;
}

/* The camera sits just before the settings button, on every screen (asked
   2026-10-28: "it should be to the right, so it is always just before the
   settings button, on every type of device, instead of being in the centre").
   It takes the free space in the bar, so it and the settings button are
   pushed to the right together; it was in the middle on phones, where the bar
   spread its items evenly, and after the left buttons on a computer. When the
   timer or the mini player is showing, they take the free space instead, and
   the camera stays beside the settings button. */
.controls > .screenshot-btn { margin-left: auto; }
:global(.controls > .timer-chip-wrap ~ .screenshot-btn),
.controls > .mini-player ~ .screenshot-btn { margin-left: 8px; }

/* The timer chip opens the right-hand group, before the mini player: it takes
   the free space to its left, and the player then sits just after it rather
   than pushing off on its own (that half is in TimerChip.svelte). */
.controls > :global(.timer-chip-wrap) { margin-left: auto; }

.screenshot-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: 42px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--controls-border, #333);
  background: var(--controls-bg, #333);
  color: var(--controls-button-text, var(--controls-text, #fff));
  cursor: pointer;
  font-size: 1.05rem;
  line-height: 1;
  transition: filter 0.15s ease;
}
.screenshot-btn:hover:not(:disabled) { filter: brightness(1.18); }

/* Page mode's back, forward and edit: the bar's own buttons, narrower. */
.page-nav-bar {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.page-bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-height: 42px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--controls-border, #333);
  background: var(--controls-bg, #333);
  color: var(--controls-button-text, var(--controls-text, #fff));
  cursor: pointer;
}
.page-bar-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.page-bar-btn:hover:not(:disabled) { filter: brightness(1.18); }
.page-bar-btn:disabled { opacity: 0.35; cursor: default; }
.page-bar-btn.on { box-shadow: inset 0 0 0 2px var(--controls-button-text, var(--controls-text, #fff)); }

/* Wide enough for the words while it is saying them, and back to an icon
   afterwards. Colours stay the button's own -- see the theme rule in
   CLAUDE.md. */
.screenshot-btn.has-note { width: auto; padding-inline: 10px; }
.screenshot-note { font-size: 0.72rem; white-space: nowrap; }
.screenshot-btn:disabled { opacity: 0.6; cursor: default; }

/* Matches the height of the toolbar buttons beside it rather than sitting
   short in the middle of the bar. Everything inside inherits the toolbar's
   theme text colour, so the icons recolour with the theme. */
.mini-player {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  padding: 0 6px;
  align-self: stretch;
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid var(--controls-border, #333);
  background: color-mix(in srgb, var(--player-veil, var(--controls-bg, #111)) 75%, transparent);
  color: var(--controls-button-text, var(--controls-text, #fff));
  max-width: 300px;
  flex-shrink: 0;
  box-sizing: border-box;
}
.mini-player.open {
  border-color: color-mix(in srgb, var(--controls-button-text, var(--controls-text, #fff)) 55%, transparent);
}


.mini-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 5px;
  min-height: 0;
  line-height: 0;
  display: grid;
  place-items: center;
  border-radius: 6px;
}
.mini-btn:hover { background: color-mix(in srgb, var(--controls-button-text, var(--controls-text, #fff)) 16%, transparent); }

.mini-cover {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: cover;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--controls-button-text, #fff) 16%, transparent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.mini-cover-blank { opacity: 0.8; box-shadow: none; }

/* The name is the handle for the bigger controls. */
.mini-title-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 170px;
  color: inherit;
  font-size: 0.78rem;
  text-align: left;
  padding: 5px 6px;
  opacity: 0.92;
}


/* Expanded panel: a player card — art and title on top, the seek bar beneath,
   transport under that, with the volume standing as a slim column down the
   right. Themed like the other popovers. */
.player-panel {
  /* Feeds the shared scrollbar/slider colours from the panel's own palette. */
  --sb-track: var(--dlg-bg, #17171a);
  --sb-thumb: var(--dlg-btn-text, var(--dlg-text, #f0f0f0));
  position: fixed;
  top: var(--popup-top, calc(var(--controls-height, 56px) + 8px));
  bottom: var(--popup-bottom, auto);
  right: 8px;
  z-index: 1400;
  width: min(94vw, 400px);
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--dlg-border, #333);
  /* The art layer is supplied inline and overrides this when there is a
     cover; without one the panel still needs its own ground. */
  background: var(--dlg-bg, #17171a);
  color: var(--dlg-btn-text, var(--dlg-text, #f0f0f0));
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: stretch;
  gap: 14px;
  box-sizing: border-box;
}

.pp-main-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
}

.pp-now { display: flex; gap: 11px; align-items: center; min-width: 0; }
.pp-cover {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--dlg-text, #fff) 12%, transparent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.pp-cover-blank {
  display: grid;
  place-items: center;
  opacity: 0.55;
  color: var(--dlg-btn-text, var(--dlg-text, #fff));
  box-shadow: none;
}
.pp-meta { min-width: 0; flex: 1; }
.pp-title { font-size: 0.94rem; font-weight: 600; min-width: 0; }
.pp-sub {
  font-size: 0.76rem;
  opacity: 0.7;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pp-seek {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Room above and below the line that still counts as the line. */
  padding: 12px 0;
  margin: -12px 0;
  cursor: pointer;
  touch-action: none;
}
.pp-seek-range { flex: 1; min-width: 0; }
.pp-seek-range:disabled { opacity: 0.45; cursor: default; }
.pp-time {
  font-size: 0.7rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
  min-width: 28px;
}
.pp-time:last-child { text-align: right; }

/* Three columns with matching outer widths, so the middle one — prev, play,
   next as a single cluster — lands dead centre of the row, and therefore
   centred under the seek bar. Shuffle sits out at the end. */
.pp-row {
  display: grid;
  grid-template-columns: 38px 1fr 38px;
  align-items: center;
}
.pp-row-gutter { display: block; }
.pp-transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.pp-shuffle { justify-self: end; }
.pp-btn {
  flex: 0 0 auto;
  width: 38px;
  height: 34px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  color: inherit;
  border-radius: 9px;
  padding: 0;
  min-height: 0;
  cursor: pointer;
  opacity: 0.85;
}
/* Hover only where there is a pointer that hovers. On a phone a tapped
   button kept its hover tint, which was nearly the "on" tint, so turning
   shuffle off still looked on until the player was closed and opened again
   (reported 2026-11-10). */
@media (hover: hover) {
  .pp-btn:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--dlg-btn-text, var(--dlg-text, #fff)) 14%, transparent);
  }
}
/* On is filled: the button's colour behind, the panel's colour for the
   icon -- unmistakable next to off. */
.pp-btn.on {
  opacity: 1;
  background: var(--dlg-btn-text, var(--dlg-text, #fff));
  color: var(--dlg-bg, #17171a);
}
.pp-play {
  width: 44px;
  height: 38px;
  opacity: 1;
}

/* Volume runs the full height of the card so the two columns balance. */
/* Deliberately unadorned: no panel, no border, nothing dimmed — the same
   treatment as the seek bar, just stood on end. */
.pp-volume {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 0 0 auto;
  /* Wide enough for the readout at its widest, which is "100". It used to be
     26px, which fits "7" and not "100" — and a flex item's min-width is auto,
     so the label quietly grew to fit its content instead of clipping it. The
     slider is a fixed, narrow track and never moved; what widened as the
     volume went up was the number underneath it. */
  width: 36px;
  color: var(--dlg-btn-text, var(--dlg-text, #fff));
  cursor: pointer;
}
/* The upright volume: a normal horizontal slider, rotated a quarter turn
   inside a slot of the size it takes up standing.

   It was a writing-mode "vertical" slider first, and that could not be made
   right: its track rules listed WebKit's and Firefox's pseudo-elements in one
   selector, and a browser drops a whole rule over a pseudo-element it does
   not know -- so in Chrome, Android and the desktop app none of them applied,
   whatever was put in them. Asked on 2026-09-27 to "look at how people do
   volume" rather than keep patching: this is that. The horizontal slider's
   styling is the shared one in app.css, per engine and already right, and
   rotating it keeps the thumb centred on an even track because nothing about
   it changes but the direction. Fixed at its height on purpose: letting it
   stretch made the slider drive the card's height, and the panel grew 40px. */
.pp-volume-slot {
  position: relative;
  display: block;
  width: 14px;
  height: 84px;
  flex: none;
}
.pp-volume-range {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 84px;
  margin: 0;
  padding: 0;
  /* -90deg puts the start of the slider at the bottom: up is louder. */
  transform: translate(-50%, -50%) rotate(-90deg);
}
/* The surface around the controls goes to Playlist mode, so it says so. */
.player-panel { cursor: pointer; }
.player-panel :is(button, input, label) { cursor: pointer; }
/* Number then icon, both in the button text colour, matching the timeline's
   readouts. */
.pp-vol-readout {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
  color: var(--dlg-btn-text, var(--dlg-text, #fff));
}

/* Reserves three digits whatever the number is, so the readout keeps the same
   footprint from 0 to 100 and the icon beside it stops shuffling sideways.
   tabular-nums above keeps the digits themselves from changing width. */
.pp-vol-number {
  min-width: 3ch;
  text-align: right;
}

@media (max-width: 1024px) {
  /* Sized to the toolbar buttons rather than stretched to the row, which on
     phones is a few pixels taller than the buttons themselves. Only the name
     shows here, and the whole strip is the tap target for the big controls. */
  /* Kept deliberately narrow: the toolbar has to fit the menu, mode, camera
     and settings buttons beside it, and anything wider tips the whole row
     into scrolling. */
  .mini-player {
    max-width: 19vw;
    align-self: center;
    min-height: 0;
    height: 32px;
    padding: 0;
    gap: 0;
  }
  .mini-title-btn {
    max-width: none;
    height: 100%;
    padding: 0 5px;
    gap: 4px;
    font-size: 0.72rem;
    border-radius: 7px;
  }
  .mini-cover { width: 17px; height: 17px; }

  /* Icon only, so it costs as little of the row as the settings button. */
  .screenshot-btn {
    padding: 6px 8px;
    min-height: 36px;
  }
  :global(.controls > .timer-chip-wrap ~ .screenshot-btn),
  .controls > .mini-player ~ .screenshot-btn { margin-left: 4px; }
}


.startup-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #322300;
  color: #ffe6a3;
  border-bottom: 1px solid #6f4f00;
}

.startup-warning button {
  background: #ad7a00;
  border: none;
  color: #1e1500;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.startup-warning button:hover {
  filter: brightness(1.08);
}

.startup-warning-dismiss {
  margin-left: auto;
  background: transparent !important;
  color: #ffe6a3 !important;
  font-weight: 700 !important;
  padding: 4px 8px !important;
  line-height: 1;
}

.startup-warning-dismiss:hover {
  filter: none !important;
  background: rgba(255, 230, 163, 0.15) !important;
}

.modes {
  flex: 1 1 auto;  /* take the rest of the height */
  display: flex;
  width: 100%;
  overflow: hidden; /* so canvas doesn’t spill */
}

/* Held, not hidden. The mode keeps its pointer events so it can be scrolled
   and panned; what loses them is everything that would change something.

   A child with pointer-events: none passes the wheel and the touch up to its
   scrolling parent, so a note can still be read through to the end while its
   own writing cannot be clicked into. */
.modes.sync-lock-active {
  opacity: 0.85;
}

.modes.sync-lock-active :global(.ProseMirror),
.modes.sync-lock-active :global(button),
.modes.sync-lock-active :global(input),
.modes.sync-lock-active :global(textarea),
.modes.sync-lock-active :global([draggable='true']),
.modes.sync-lock-active :global([contenteditable='true']) {
  pointer-events: none;
}

/* Qualified by the base class so it wins on specificity: the plain
   .sync-lock-banner rule is defined below this one and would otherwise take the
   border colour back. */
.sync-lock-banner.sync-failed {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Sized rather than left to shrink-to-fit. A bare text node inside a flex
     row is an anonymous item that shrinks as far as it is allowed to, which
     turned the longer message into a column one word wide. */
  width: max-content;
  max-width: min(92vw, 620px);
  /* Left alone by the dim the lock banner applies, since this one is the only
     thing on screen explaining why nothing is being saved to the account. */
  pointer-events: auto;
  border-color: #b3452f;
}

.sync-failed-text {
  /* min-width:0 lets it wrap instead of forcing the row wider than the screen. */
  min-width: 0;
  flex: 1 1 auto;
}

.sync-failed-dismiss {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 7px;
  border: 1px solid var(--dlg-border, #444);
  background: transparent;
  color: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.sync-lock-banner {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1300;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--dlg-bg, #17171a);
  border: 1px solid var(--dlg-border, #444);
  color: var(--dlg-text, #f0f0f0);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  font-size: 0.9rem;
}










/* Optional: make it more mobile-friendly */
/* Mobile adjustments */
@media (max-width: 1024px) {
  .controls {
    /* Hug the buttons below, but keep the original clearance above so the
       phone's status-bar icons never sit on top of them. */
    min-height: 0;
    flex-wrap: nowrap;
    padding: 2px 8px;
    padding-top: max(8px, env(safe-area-inset-top));
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
  }

  .right-controls {
    margin-left: 4px;
  }
}

.app-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.app-dialog {
  background: var(--dlg-bg, #17171a);
  border: 1px solid var(--dlg-border, #333);
  color: var(--dlg-text, #f0f0f0);
  border-radius: 12px;
  padding: 18px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.app-dialog-message {
  margin: 0 0 12px;
  color: var(--dlg-text, #f0f0f0);
  font-size: 0.95rem;
  white-space: pre-wrap;
}

.app-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #444;
  background: #101012;
  color: #f0f0f0;
  font-size: 1rem;
  margin-bottom: 14px;
}

.app-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.app-dialog-danger {
  background: rgba(255, 90, 90, 0.18);
  border: 1px solid rgba(255, 90, 90, 0.45);
  color: #ff9b9b;
}

.app-dialog-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
}

.app-dialog-cancel {
  background: var(--dlg-btn-bg, #2a2a2a);
  color: var(--dlg-btn-text, #f0f0f0);
  border: 1px solid var(--dlg-border, #444);
}

/* Traffic-light weighting on the sign-out choices: safe, cautionary, destructive. */
.app-dialog-safe {
  background: rgba(64, 190, 110, 0.18);
  border: 1px solid rgba(64, 190, 110, 0.55);
  color: #7ce6a4;
}
.app-dialog-warn {
  background: rgba(255, 201, 40, 0.16);
  border: 1px solid rgba(255, 201, 40, 0.5);
  color: #ffd86c;
}

.app-dialog-ok {
  background: #ad7a00;
  color: #1e1500;
}

</style>




<!-- --toolbar-bg and --toolbar-button-text: the toolbar's own colours, for
     anything elsewhere that is meant to match it -- Single Note's search page
     frames its folders in them (2026-10-05). -->
<!-- The dialog colours (--dlg-*) are set here too, so a dialog a mode opens
     (components/AppDialog.svelte) is in the theme's pop-up colours. -->
<!-- The bar's finger gestures are listened for on the window, never on a
     layer of their own, and never stop a touch: a tap anywhere -- in the
     band above the bar too -- reaches what is under it. barTouchStart says
     which touches are the bar's. -->
<svelte:window
  on:resize={rememberShape}
  on:orientationchange={rememberShape}
  on:keydown={modeShortcut}
  on:touchstart|passive={barTouchStart}
  on:touchmove|nonpassive={barTouchMove}
  on:touchend|nonpassive={barTouchEnd}
  on:touchcancel|passive={cancelBarGesture}
/>

<div
  class="app"
  class:keyboard-up={keyboardOpen}
  class:on-phone={onPhone}
  class:phone-bar-bottom={onPhone && controlsLayout.phone === 'bottom'}
  class:phone-bar-top={barAtTop}
  class:has-rail={!onPhone && controlsLayout.computer === 'rail'}
  class:rail-auto={!onPhone && controlsLayout.computer === 'auto'}
  class:crowded-bar={mode === 'page' || Boolean(nowPlayingTrack)}
  style="{appThemeCssVars}; {blockThemeCssVars}; --toolbar-bg: {leftTheme.panelBg}; --toolbar-button-text: {leftTheme.buttonText}; {overlayThemeStyle}">
  <!-- Which Austavia this is, when it is not the real one: inside .app so it
       takes the theme's colours. utils/releaseChannel.js; nothing on production. -->
  {#if channelBadgeText}
    <div class="channel-badge channel-{channel}" aria-label="This is {channelName(channel)}">{channelBadgeText}</div>
  {/if}
  <div class="controls" bind:this={controlsRef} style={controlsStyle} on:pointerdown={closeLayoutFromBar}>
    <LeftControls
      modeIds={offered}
      bind:currentSaveName
      on:renameFolder={renameFolder}
      {mode}
      {simpleNoteColumnCount}
      {singleNoteSettings}
      {canvasBackgroundSettings}
      modeLabels={MODE_LABELS}
      {blocks}
      {savedList}
      {focusedBlockId}
      colors={controlColors.left}
      {mayUseBackground}
      on:addBlock={(e) => addBlock(e.detail)}
      on:clear={clear}
      on:exportJSON={exportJSON}
      on:importJSON={(e) => importJSON(e.detail)}
      on:setMode={(e) => setMode(e.detail)}
      on:undo={undo}
      on:redo={redo}
      on:moveUp={moveFocusedBlockUp}
      on:moveDown={moveFocusedBlockDown}
      on:modeSettingChange={handleModeSettingChange}
    />
    <!-- Page mode's back, forward and edit, in the bar rather than over the
         page (asked 2026-11-10: they made "the page start a lot lower than
         where the buttons start ... or put them in the buttons on controls
         before the music and timer"). -->
    {#if mode === 'page'}
      <div class="page-nav-bar" role="group" aria-label="Page">
        <button class="page-bar-btn" title="Back" aria-label="Back" disabled={!places.back.length} on:click={() => stepPlace(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button class="page-bar-btn page-bar-forward" title="Forward" aria-label="Forward" disabled={!places.forward.length} on:click={() => stepPlace(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
        <button
          class="page-bar-btn"
          class:on={pageEditMode}
          title={pageEditMode ? 'Done editing' : 'Edit: size and crop pictures'}
          aria-pressed={pageEditMode}
          on:click={() => (pageEditMode = !pageEditMode)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
        </button>
      </div>
    {/if}
    <!-- A timer in use, reachable from any mode, just before the mini player
         (asked for on 2026-09-29) -- see utils/timerChip.js. On a phone it is
         a notification instead. -->
    <TimerChip
      {blocks}
      {habits}
      on:goalAction={handleGoalAction}
      themeStyle={overlayThemeStyle}
      notificationTheme={{ bg: themeExtras.popupBg || rightTheme.panelBg, text: rightTheme.textColor, accent: leftTheme.buttonText }}
    />

    <!-- Mini player: present in every mode so what's playing stays reachable
         without going back to Playlist mode. -->
    {#if nowPlayingTrack}
      <!-- Pressing the strip anywhere but its buttons opens the player, as it
           always did. The Playlist jump belongs to the player, not here --
           see utils/playerClicks.js for the request and its correction. -->
      <div
        class="mini-player"
        class:open={playerExpanded}
        style={miniPlayerArtStyle}
        bind:this={playerToggleRef}
        role="button"
        tabindex="0"
        aria-expanded={playerExpanded}
        aria-label={playerExpanded ? 'Hide the player' : 'Open the player'}
        on:click={(event) => {
          if (playerClickAction('mini', event.target, event.currentTarget) === 'open-player') {
            playerExpanded = !playerExpanded;
          }
        }}
        on:keydown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            playerExpanded = !playerExpanded;
          }
        }}
      >
        {#if Pc}
          <button
            class="mini-btn"
            on:click|stopPropagation={() => stepMusic(-1)}
            aria-label="Previous track"
          ><PlayerIcon name="prev" /></button>
          <button
            class="mini-btn"
            on:click|stopPropagation={toggleMusic}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          ><PlayerIcon name={isPlaying ? 'pause' : 'play'} /></button>
          <button
            class="mini-btn"
            on:click|stopPropagation={() => stepMusic(1)}
            aria-label="Next track"
          ><PlayerIcon name="next" /></button>
        {/if}

        <div class="mini-title-btn">
          {#if nowPlayingCoverUrl}
            <img class="mini-cover" src={nowPlayingCoverUrl} alt="" />
          {:else}
            <span class="mini-cover mini-cover-blank">
              <PlayerIcon name={isPlaying ? 'pause' : 'music'} size={12} />
            </span>
          {/if}
          <ScrollingText text={nowPlayingTrack.title || 'Untitled'} always={!Pc} />
        </div>

      </div>

      {#if playerExpanded}
        <!-- Clicking the player anywhere but its controls goes to Playlist
             mode -- see utils/playerClicks.js. Its controls keep their own
             clicks; the keyboard reaches Playlist through the mode picker. -->
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="player-panel"
          style={`${overlayThemeStyle} ${panelArtStyle}`}
          title="Open Playlist"
          use:clickOutside={{ onOutside: () => (playerExpanded = false), ignore: () => [playerToggleRef] }}
          on:click={(event) => {
            if (playerClickAction('player', event.target, event.currentTarget) === 'open-playlist') {
              playerExpanded = false;
              setMode('playlist');
            }
          }}
        >
          <div class="pp-main-col">
            <div class="pp-now">
              {#if nowPlayingCoverUrl}
                <img class="pp-cover" src={nowPlayingCoverUrl} alt="" />
              {:else}
                <div class="pp-cover pp-cover-blank"><PlayerIcon name="music" size={26} /></div>
              {/if}
              <div class="pp-meta">
                <div class="pp-title">
                  <ScrollingText text={nowPlayingTrack.title || 'Untitled'} />
                </div>
                <div class="pp-sub">
                  {[nowPlayingTrack.artist, nowPlayingTrack.album].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            </div>

            <!-- Where you are in the track, and a handle to move it. -->
            <!-- The whole row is the timeline, with room above and below it:
                 a press anywhere in it moves to that point and a drag keeps
                 moving, rather than missing the thin line and landing on the
                 way to Playlist mode (reported 2026-11-10). -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="pp-seek" data-player-control on:pointerdown={seekFromRow}>
              <span class="pp-time">{formatClock(musicPosition)}</span>
              <input
                class="pp-seek-range filled"
                type="range"
                min="0"
                max={musicDuration || 0}
                step="0.1"
                value={musicPosition}
                disabled={!musicDuration}
                style="--range-progress: {musicDuration ? Math.min(100, Math.max(0, (musicPosition / musicDuration) * 100)) : 0}%"
                on:input={(e) => seekMusic(e.target.value)}
                aria-label="Position in track"
              />
              <span class="pp-time">{formatClock(musicDuration)}</span>
            </div>

            <div class="pp-row">
              <!-- Empty cell mirroring the shuffle button, so the three
                   transport icons sit centred on the seek bar above rather
                   than being pushed off by shuffle's width. -->
              <span class="pp-row-gutter" aria-hidden="true"></span>

              <div class="pp-transport">
                <button class="pp-btn" on:click={() => stepMusic(-1)} aria-label="Previous">
                  <PlayerIcon name="prev" size={18} />
                </button>
                <button class="pp-btn pp-play" on:click={toggleMusic} aria-label={isPlaying ? 'Pause' : 'Play'}>
                  <PlayerIcon name={isPlaying ? 'pause' : 'play'} size={20} />
                </button>
                <button class="pp-btn" on:click={() => stepMusic(1)} aria-label="Next">
                  <PlayerIcon name="next" size={18} />
                </button>
              </div>

              <button
                class="pp-btn pp-shuffle"
                class:on={musicShuffle}
                title={musicShuffle ? 'Shuffle on' : 'Shuffle off'}
                aria-pressed={musicShuffle}
                on:click={toggleShuffle}
              ><PlayerIcon name="shuffle" size={18} /></button>
            </div>
          </div>

          <label class="pp-volume" title="Volume">
            <!-- An ordinary horizontal slider turned on its side, the way
                 players usually do an upright volume -- see .pp-volume-slot. -->
            <span class="pp-volume-slot">
              <input
                class="filled pp-volume-range"
                type="range" min="0" max="1" step="0.01"
                value={musicVolume}
                style="--range-progress: {Math.round(musicVolume * 100)}%"
                on:input={(e) => setMusicVolume(e.target.value)}
                aria-label="Volume"
                aria-orientation="vertical"
              />
            </span>
            <span class="pp-vol-readout">
              <span class="pp-vol-number">{Math.round(musicVolume * 100)}</span>
              <PlayerIcon name={musicVolume === 0 ? 'mute' : 'volume'} size={13} />
            </span>
          </label>
        </div>
      {/if}
    {/if}

    <!-- The outcome is said on the button itself rather than in a dialog:
         this is pressed often, and a box to dismiss every time would be worse
         than saying nothing. It is also announced, so it is not only a colour
         change for somebody who cannot see it. -->
    <button
      class="screenshot-btn"
      class:has-note={screenshotNote !== ''}
      on:click={handleScreenshot}
      disabled={screenshotBusy}
      title="Screenshot this view — saves a PNG and copies it"
      aria-label="Screenshot this view"
    >{#if screenshotBusy}…{:else if screenshotNote}<span class="screenshot-note" role="status">{screenshotNote}</span>{:else}<ControlIcon name="camera" size={17} />{/if}</button>

    {#if showRightControls}
    <div class="right-controls">
      <RightControls
        on:openControlsLayout={() => (showControlsLayout = true)}
        {collectDiagnostics}
        {typeScales}
        {folderSnapshots}
        {currentSaveName}
        on:typeScaleChange={handleTypeScaleChange}
        on:advancedOpened={refreshFolderSnapshots}
        on:restoreSnapshot={handleRestoreSnapshot}
        on:forgetSnapshot={handleForgetSnapshot}
        {savedList}
        storageUsage={shownStorageUsage}
        {subscriptionRecord}
        {load}
        {deleteSave}
        {duplicateFolder}
        binCount={binEntries.length}
        {openBin}
        {createNewFile}
        {controlColors}
        themes={availableThemes}
        {selectedThemeId}
        {firebaseReady}
        {authUser}
        {uploadInProgress}
        {downloadInProgress}
        {autoSyncEnabled}
        blocksFollowTheme={modeSettings.blocksFollowTheme === true}
        {blocksFollowThemeAll}
        on:googleSignIn={signInGoogle}
        on:googleSignOut={signOutGoogle}
        on:uploadNow={uploadAllLocalToCloud}
        on:downloadNow={downloadAllCloudToLocal}
        on:toggleAutoSync={toggleAutoSync}
        on:toggleBlocksFollowTheme={toggleBlocksFollowTheme}
        on:toggleBlocksFollowThemeAll={toggleBlocksFollowThemeAll}
        on:selectTheme={handleThemeSelect}
        on:openAdvancedCss={() => (showAdvancedCssPage = true)}
      />
    </div>
    {/if}
  </div>

  {#if deferredLastSaveName}
    <div class="startup-warning">
      <span>{deferredLastSaveReason || `Skipped auto-open for ${deferredLastSaveName}.`}</span>
      <button on:click={openDeferredLastSave}>
        Click to open last file
      </button>
      <button
        class="startup-warning-dismiss"
        type="button"
        aria-label="Dismiss"
        on:click={dismissDeferredLastSave}
      >
        ✕
      </button>
    </div>
  {/if}

  <!-- Readable while it is held, not hidden. Asked for: "the folder can show
       itself and you should be able to move around it, just not edit it while
       it syncs". Scrolling and reading are safe -- nothing written against a
       stale copy comes of them -- so only the things that would change it are
       stopped, in the capture phase before anything else sees them. -->
  <div
    class="modes"
    style={wallpaperHeight ? `--wallpaper-height: ${wallpaperHeight}px;` : ''}
    class:sync-lock-active={workspaceHeld}
    role="region"
    aria-label="Workspace"
    on:beforeinput|capture={refuseWhileHeld}
    on:paste|capture={refuseWhileHeld}
    on:cut|capture={refuseWhileHeld}
    on:drop|capture={refuseWhileHeld}
    on:dragstart|capture={refuseWhileHeld}
    on:dragover={handleModeDragOver}
    on:drop={handleModeDrop}
  >
    <!-- The modes, a click away, down the left edge on a computer (PENDING,
         "How modes are changed", stage d); Ctrl+1 to 9 in the same order. -->
    {#if controlsLayout.computer !== 'top'}
      {#if controlsLayout.computer === 'auto'}
        <!-- The column hidden, shown while the pointer is at the left edge or
             on it (Controls layout, asked 2026-11-10). -->
        <div class="rail-edge" aria-hidden="true"></div>
      {/if}
      <nav class="mode-rail" class:tucked={railTucked} aria-label="Modes" style={controlsStyle} on:pointerdown={closeLayoutFromBar}>
        {#each offered as id, i (id)}
          <button
            class="mode-rail-btn"
            class:active={id === mode}
            title="{MODE_LABELS[id] || id}{i < 9 ? `  (Ctrl+${i + 1})` : ''}"
            aria-label={MODE_LABELS[id] || id}
            aria-current={id === mode ? 'page' : undefined}
            on:click={(event) => { setMode(id); tuckRail(event.currentTarget); }}
          >
            <ModeIcon mode={id} size={22} />
          </button>
        {/each}
      </nav>
    {/if}
    {#if barGesture?.kind === 'strip' && strip}
      <!-- Every mode, always at the same place in its order, a space in the
           middle that keeps the open one; the one under the finger raised
           with its name. In the bar's colours. -->
      <div class="mode-strip" style="{controlsStyle}{barAtTop ? `; top: ${barEdge + 14}px; bottom: auto;` : ''}" aria-hidden="true">
        <div class="strip-space" class:chosen={stripIndex === null} style="left: {strip.space.left}px; width: {strip.space.right - strip.space.left}px;">
          {#if stripIndex === null}<span class="strip-name">Stay: {MODE_LABELS[mode] || mode}</span>{/if}
        </div>
        {#each offered as id, i (id)}
          <div class="strip-slot" class:chosen={i === stripIndex} class:open={id === mode} style="left: {strip.slots[i].left}px; width: {strip.slots[i].width}px;">
            {#if i === stripIndex}<span class="strip-name">{MODE_LABELS[id] || id}</span>{/if}
            <ModeIcon mode={id} size={i === stripIndex ? 24 : 18} />
          </div>
        {/each}
      </div>
    {/if}
    {#if barGesture?.kind === 'sheet'}
      <!-- Every mode, rising from the bar; letting go on one opens it. -->
      <div class="gesture-sheet" style="{controlsStyle}{barAtTop ? `; top: ${barEdge + 8}px; bottom: auto;` : ''}" aria-hidden="true">
        {#each offered as id (id)}
          <div class="gesture-mode" data-gesture-mode={id} class:chosen={id === sheetPick} class:open={id === mode}>
            <ModeIcon mode={id} size={24} />
            <span>{MODE_LABELS[id] || id}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if showControlsLayout}
      <ControlsLayoutPage
        layout={controlsLayout}
        allModes={MODE_ORDER}
        modeLabels={MODE_LABELS}
        on:change={(e) => changeControlsLayout(e.detail)}
        on:close={() => (showControlsLayout = false)}
      />
    {/if}
    {#if workspaceHeld}
      <div class="sync-lock-banner" style={overlayThemeStyle}>{gateMessage}</div>
    {:else if syncFailureNotice}
      <div class="sync-lock-banner sync-failed" style={overlayThemeStyle} role="alert">
        <span class="sync-failed-text">{syncFailureNotice}</span>
        <button type="button" class="sync-failed-dismiss" on:click={() => (syncFailureNotice = '')}>Dismiss</button>
      </div>
    {/if}
    <ModeArea
      {mode}
      openFolder={currentSaveName}
      {canvasBackgroundSettings}
      blocks={modeOrderedBlocks}
      {simpleNoteColumnCount}
      {singleNoteSettings}
      openNoteId={singleNoteToOpen}
      loadOtherFolderNotes={listOtherFolderNotes}
      on:openNote={openNoteInFolder}
      on:deleteNoteElsewhere={deleteNoteInFolder}
      {keyboardOpen}
      {taskAddDirection}
      page={pageNow}
      {pageTitle}
      pageId={pageAt}
      {incomingMusic}
      on:incomingTaken={() => (incomingMusic = null)}
      {pageEditMode}
      on:pageChange={(e) => changePageShown(e.detail.page)}
      on:renamePage={(e) => renamePageShown(e.detail.title)}

      on:addBlock={(e) => addBlock(e.detail.type, { afterId: e.detail.afterId, fields: e.detail.fields })}
      on:insertOnPage={(e) => insertOnPage(e.detail)}
      on:addImage={(e) => addBlock('image', { fields: { src: e.detail.src } })}
      {habits}
      {mayAddPicture}
      {musicLibrary}
      {nowPlayingId}
      {isPlaying}
      shuffle={musicShuffle}
      {groupedBlocks}
      {focusedBlockId}
      modeLabels={MODE_LABELS}
      bind:canvasRef
      canvasColors={canvasTheme}
      leftControlColors={leftTheme}
      on:update={updateBlockHandler}
      on:delete={deleteBlockHandler}
      on:focusToggle={handleFocusToggle}
      on:swapBlocks={(e) => swapBlocksInMode(e.detail)}
      on:libraryChange={(e) => handleLibraryChange(e.detail)}
      on:play={(e) => {
        if (Array.isArray(e.detail.tracks)) handedOverTracks = e.detail.tracks;
        playMusicTrack(e.detail.trackId, e.detail.queue);
      }}
      on:toggle={toggleMusic}
      on:stop={stopMusic}
      on:toggleShuffle={toggleShuffle}
      on:notify={(e) => appAlert(e.detail)}
      on:modeSettingChange={handleModeSettingChange}
    />
  </div>
</div>

<!-- Outside .app so it is never unmounted by a mode change. -->
<audio
  bind:this={audioEl}
  on:ended={() => stepMusic(1)}
  on:play={() => (isPlaying = true)}
  on:pause={() => { isPlaying = false; rememberPlaybackPosition(); }}
  on:loadedmetadata={() => { applyResumePosition(); syncMusicTime(); tellTheNotification(); }}
  on:durationchange={() => { syncMusicTime(); tellTheNotification(); }}
  on:seeked={() => { syncMusicTime(); tellTheNotification(); }}
  on:timeupdate={() => { syncMusicTime(); throttledRememberPosition(); reportPositionIfItMoved(); }}
  preload="metadata"
  hidden
></audio>

<!-- Rings the open folder's alarms in every mode, not only where the clock is
     drawn. -->
<AlarmRinger {blocks} {habits} themeStyle={overlayThemeStyle} />
<!-- The always-on-top timer and alarm windows, in the desktop apps --
     see utils/clockPopups.js. -->
<ClockPopupWindows {blocks} {habits} on:goalAction={handleGoalAction} />

{#if exportDialogOpen}
  <ExportDialog
    currentFolder={currentSaveName}
    folderCount={savedList.length}
    themeCount={customThemes.length}
    currentThemeName={activeTheme?.name || 'Your unsaved theme'}
    {musicLibrary}
    themeStyle={overlayThemeStyle}
    busy={exportBusy}
    on:export={runExport}
    on:close={() => (exportDialogOpen = false)}
  />
{/if}

{#if binOpen}
  <BinDialog
    entries={binEntries}
    themeStyle={overlayThemeStyle}
    busy={binBusy}
    on:restore={restoreFromBin}
    on:forget={forgetFromBin}
    on:close={() => (binOpen = false)}
  />
{/if}

{#if importState}
  <ImportDialog
    file={importState.file}
    fileName={importState.fileName}
    currentFolder={currentSaveName}
    existingFolders={savedList}
    existingThemes={availableThemes}
    officialThemeIds={STYLE_PRESETS.map(theme => theme.id)}
    music={importState.music}
    themeStyle={overlayThemeStyle}
    busy={importBusy}
    on:import={runImport}
    on:close={() => (importState = null)}
  />
{/if}

{#if dialogState}
  <div class="app-dialog-overlay" role="presentation" style={overlayThemeStyle} on:click={handleDialogCancel}>
    <div class="app-dialog" role="dialog" aria-modal="true" on:click|stopPropagation>
      <p class="app-dialog-message">{dialogState.message}</p>
      {#if dialogState.type === 'prompt'}
        <input
          type="text"
          class="app-dialog-input"
          bind:value={dialogInputValue}
          on:keydown={(e) => {
            if (e.key === 'Enter') handleDialogConfirm(dialogInputValue);
            if (e.key === 'Escape') handleDialogCancel();
          }}
          use:autofocusAction
        />
      {/if}
      <div class="app-dialog-actions">
        {#if dialogState.type === 'choice'}
          <button type="button" class="app-dialog-btn app-dialog-cancel" on:click={handleDialogCancel}>Cancel</button>
          {#each dialogState.options || [] as option}
            <button
              type="button"
              class="app-dialog-btn"
              class:app-dialog-safe={option.variant === 'safe'}
              class:app-dialog-warn={option.variant === 'warn'}
              class:app-dialog-danger={option.variant === 'danger'}
              class:app-dialog-ok={!option.variant}
              on:click={() => resolveDialog(option.id)}
            >{option.label}</button>
          {/each}
        {:else}
          {#if dialogState.type !== 'alert'}
            <button type="button" class="app-dialog-btn app-dialog-cancel" on:click={handleDialogCancel}>Cancel</button>
          {/if}
          <button type="button" class="app-dialog-btn app-dialog-ok" on:click={() => handleDialogConfirm(dialogInputValue)}>OK</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showAdvancedCssPage}
  <AdvancedCssPage
    {controlColors}
    {blockTheme}
    previewBg={currentThemePreviewBg}
    {themeExtras}
    themes={availableThemes}
    {selectedThemeId}
    on:close={() => (showAdvancedCssPage = false)}
    on:updateControlColor={handleControlColorChange}
    on:updateBlockTheme={handleBlockThemeChange}
    on:updatePreviewBg={handlePreviewBgChange}
    on:updateThemeExtra={handleThemeExtraChange}
    on:saveTheme={handleAdvancedThemeSave}
    on:updateTheme={handleAdvancedThemeUpdate}
    on:deleteTheme={handleAdvancedThemeDelete}
    on:duplicateTheme={handleAdvancedThemeDuplicate}
  />
{/if}
