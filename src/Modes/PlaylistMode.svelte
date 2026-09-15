<script>
  import { createEventDispatcher, onMount, onDestroy, afterUpdate, getContext } from 'svelte';
  import { getReadableTextColor } from '../utils/readableColor.js';
  import { logSync } from '../utils/syncLog.js';
  import PlayerIcon from '../components/PlayerIcons.svelte';
  import ScrollingText from '../components/ScrollingText.svelte';
  import { ensureMusicCover, forgetCoverlessTrack } from '../utils/musicCovers.js';
  import { tracksWithPendingWork } from '../utils/playlistMerge.js';
  import {
    readAudioTags,
    formatDuration,
    isSupportedAudioFile,
    SUPPORTED_AUDIO_EXTENSIONS,
    extensionOf,
    audioAcceptFor
  } from '../utils/audioTags.js';
  import { windowRange } from '../utils/listWindow.js';
  import { playbackPool, openingPlaylist } from '../utils/playlistPlayback.js';
  import {
    sizeGroups,
    clustersFromHashes,
    planDeduplication,
    sameNameClusters
  } from '../utils/duplicateTracks.js';
  import { tracksTheLibraryLacks, playableIds } from '../utils/nowPlaying.js';
  import { surfaceBlock, surfaceColors } from '../utils/modeSurface.js';
  import { isCompactToolbar, toolbarLayout } from '../utils/playlistToolbar.js';
  import ModeBackground from '../components/ModeBackground.svelte';
  import { backgroundImageFor, usesPortraitBackground } from '../utils/modeBackground.js';
  import {
    saveMusicTrack,
    saveMusicTracks,
    deleteMusicTrack,
    deleteMusicTracks,
    getAvailableMusicIds,
    loadMusicTrack,
    saveMusicCover,
    deleteMusicCover
  } from '../storage.js';

  export let canvasColors = {};
  export let canvasRef;
  // The folder's blocks, for one thing only: the music block whose colour this
  // mode wears. See utils/modeSurface.js.
  export let blocks = [];
  // { tracks: [{id, title, artist, album, year, lyrics, …}], playlists: [...] }
  export let library = { tracks: [], playlists: [] };
  export let nowPlayingId = null;
  export let isPlaying = false;
  export let shuffle = false;

  const dispatch = createEventDispatcher();
  const appDialogs = getContext('appDialogs');
  const appConfirm = (message) => appDialogs.confirm(message);
  const appPrompt = (message, initial) => appDialogs.prompt(message, initial);

  const defaultCanvasColors = { outerBg: '#000000', innerBg: '#000000' };
  $: canvasTheme = { ...defaultCanvasColors, ...(canvasColors || {}) };

  // This mode is the music block with the walls taken away, so it wears that
  // block's colour — the same thing Single Note mode does with its note, and
  // the reason fading the wallpaper there fades to the note rather than to
  // black. With no music block in the folder it is the theme's own background
  // for the mode. The decision is in utils/modeSurface.js, which both modes
  // call so the two cannot drift apart.
  $: surface = surfaceColors(surfaceBlock(blocks, 'music'), canvasTheme);
  $: modeTextColor = surface.text;
  $: cssVars =
    `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};` +
    ` --pl-surface: ${surface.bg}; --mode-text-color: ${modeTextColor};`;

  // What a run has produced but not yet committed.
  //
  // Showing a track and saving the library used to be the same act: the only
  // way to put something on screen was updateLibrary, which rewrites the whole
  // folder and pushes a sync. So an import committed once at the very end,
  // which is correct for the saving and wrong for the looking — nothing was
  // visible or playable until the last file had been copied, even though the
  // first one was ready in a second.
  //
  // These two hold the same information before it has been saved, so the list
  // can show progress while the commits stay exactly as rare as they were.
  let addedNotYetCommitted = [];
  let scanUpdatesNotYetCommitted = new Map();

  // Merging is in utils/playlistMerge.js, where it can be tested: the ways it
  // could go wrong — a track listed twice as a commit lands, or one deleted
  // mid-scan coming back — are invisible until they happen to somebody.
  $: tracks = tracksWithPendingWork(
    library?.tracks,
    addedNotYetCommitted,
    scanUpdatesNotYetCommitted
  );
  $: playlists = Array.isArray(library?.playlists) ? library.playlists : [];

  // Which playlist you had open, kept on this device.
  //
  // It was null on every entry, so coming back to Playlist mode always dropped
  // you into All music whatever you had been listening to -- and pressing play
  // then started something else. Device-local and never synced, like the
  // remembered note: which playlist you are looking at is a fact about this
  // screen, not about the folder.
  const OPEN_PLAYLIST_KEY = 'lastOpenPlaylist';

  function rememberedPlaylistId() {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(OPEN_PLAYLIST_KEY);
    } catch {
      return null;
    }
  }

  function rememberPlaylistId(id) {
    try {
      if (typeof localStorage === 'undefined') return;
      if (id) localStorage.setItem(OPEN_PLAYLIST_KEY, id);
      else localStorage.removeItem(OPEN_PLAYLIST_KEY);
    } catch {
      // A browser with storage off simply opens on All music.
    }
  }

  let selectedPlaylistId = null;
  // Settled once the library has arrived, because a playlist that no longer
  // exists has to fall back to All music rather than to nothing -- and until
  // the library is here, nothing can be checked against it.
  let openingPlaylistSettled = false;
  $: if (!openingPlaylistSettled && library) {
    openingPlaylistSettled = true;
    selectedPlaylistId = openingPlaylist(library, rememberedPlaylistId());
  }
  $: if (openingPlaylistSettled) rememberPlaylistId(selectedPlaylistId);
  $: selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) || null;
  $: playlistTracks = selectedPlaylist
    ? selectedPlaylist.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean)
    : tracks;

  // Every row, every time. This used to render 200 at a time behind a "show
  // more" button, on the theory that nobody scrolls a few thousand rows before
  // searching — but a playlist is a thing you look down, and having to ask for
  // the rest of your own music on every visit is a worse cost than the DOM.
  // Covers still arrive one at a time, so a long list draws immediately and
  // fills in as it goes.

  // Search runs over everything the tags gave us, not just the title, so
  // "beatles" or "1998" finds the track as readily as its name does.
  let search = '';
  function matchesSearch(track, needle) {
    if (!needle) return true;
    return [track.title, track.artist, track.album, track.genre, track.year]
      .filter(Boolean)
      .some(field => String(field).toLowerCase().includes(needle));
  }
  // The folder's wallpaper — the same settings Single Note keeps, not a copy,
  // so one picture is chosen once and both modes show it. The drawing is
  // ModeBackground.svelte and the normalising is utils/modeBackground.js, which
  // is what stops the two from drifting apart.
  export let backgroundSettings = {};

  let isPortraitScreen =
    typeof window !== 'undefined' &&
    usesPortraitBackground({ width: window.innerWidth, height: window.innerHeight });
  function updateScreenShape() {
    isPortraitScreen = usesPortraitBackground({ width: window.innerWidth, height: window.innerHeight });
    screenWidth = window.innerWidth;
    // The toolbar's own width is now a measurement of a window that no longer
    // exists. Forgetting it falls back to the window until the browser reports
    // the new one, which stops a stale narrow reading from surviving a window
    // being made wider.
    headerWidth = 0;
  }

  // How much of the toolbar there is room for. The decision, and the
  // measurements that prompted it, are in utils/playlistToolbar.js; here we
  // only draw what it says.
  //
  // Two measurements, and the smaller wins.
  //
  // The toolbar's own width is the honest one: the mode does not always have
  // the whole window, because the controls panel takes a slice of it. But a
  // bound width comes from a ResizeObserver, and an observer reports nothing
  // while the page is not being drawn — the same trap as the artwork loading,
  // further down this file. The window's width is delivered by an event, which
  // arrives either way.
  //
  // Neither can be wrong in the direction that matters: the toolbar never has
  // more room than the window it is in, so the smaller of the two is the room
  // there really is — and a toolbar width is forgotten when the window changes,
  // so a stale one cannot outlive what it measured.
  let headerWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  let screenWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  let moreOpen = false;
  let moreEl;
  $: compact = isCompactToolbar({ width: Math.min(headerWidth || Infinity, screenWidth || Infinity) });
  $: layout = toolbarLayout({ compact });
  $: if (!compact) moreOpen = false;

  // With a picture behind them the panels get out of its way; without one they
  // keep the theme's colour, exactly as before. Same rule Single Note uses.
  $: wallpaper = backgroundImageFor(backgroundSettings, { isMobile: isPortraitScreen });

  // Android's picker greys out anything whose MIME the provider disagrees with,
  // so it is asked for everything there; see audioAcceptFor.
  const runningNatively =
    typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  const audioAccept = audioAcceptFor({ native: runningNatively });

  $: searchNeedle = search.trim().toLowerCase();

  // Only the rows on screen are built, and only their covers fetched. Every
  // track is still in the list and still scrolled to — see utils/listWindow.js
  // for why a library of a few thousand made the app unclickable without this.
  let listEl;
  let rowsEl;
  let listScrollTop = 0;
  let listViewport = 0;
  let rowHeight = 0;
  let rowsOffset = 0;

  // The scroller holds a title and sometimes a banner above the rows, so the
  // rows do not begin at scrollTop 0. Measured rather than assumed, because
  // that header changes height with what is in it.
  function measureList() {
    if (!listEl || !rowsEl) return;
    const row = rowsEl.querySelector('.pl-track');
    if (row) {
      const height = row.getBoundingClientRect().height;
      if (height > 0 && height !== rowHeight) rowHeight = height;
    }
    const offset =
      rowsEl.getBoundingClientRect().top - listEl.getBoundingClientRect().top + listEl.scrollTop;
    if (Number.isFinite(offset) && offset !== rowsOffset) rowsOffset = offset;
  }

  function onListScroll() {
    listScrollTop = listEl?.scrollTop || 0;
  }

  // After every render, because the first row cannot be measured before it
  // exists and the header above it changes height with what is in it. A
  // reactive statement was tried and is wrong here: it re-runs when the values
  // it names change, and the row count settles immediately — so it measured
  // once, too early, found no row, and never looked again. The list then kept
  // the unmeasured fallback for ever: sixteen rows, no padding, and a scrollbar
  // that said the library was sixteen tracks long.
  //
  // Nothing is assigned unless it differs, so this settles rather than looping.
  afterUpdate(measureList);

  $: rowWindow = windowRange({
    scrollTop: listScrollTop - rowsOffset,
    viewportHeight: listViewport,
    rowHeight,
    count: visibleTracks.length
  });
  $: renderedTracks = visibleTracks.slice(rowWindow.start, rowWindow.end);
  $: loadCoversFor(renderedTracks);
  $: listedTracks = searchNeedle
    ? playlistTracks.filter(track => matchesSearch(track, searchNeedle))
    : playlistTracks;

  let availableIds = new Set();
  async function refreshAvailability() {
    availableIds = await getAvailableMusicIds();
  }

  // What can actually be played, which during an import is more than the store
  // has got round to listing — see utils/nowPlaying.js. Everywhere below asks
  // this rather than the listing.
  $: playable = playableIds(availableIds, addedNotYetCommitted);
  onMount(async () => {
    updateScreenShape();
    window.addEventListener('resize', updateScreenShape);
    window.addEventListener('orientationchange', updateScreenShape);
    await refreshAvailability();
    // Only lists stored keys, so it costs nothing on open.
    orphanIds = await findOrphans();
  });
  $: if (tracks.length >= 0) refreshAvailability();

  // Cover art is device-local, so it's fetched here rather than carried in the
  // synced metadata. Object URLs are revoked on teardown.
  let coverUrls = {};

  // Fetched per row as it comes into view, rather than for the whole library
  // at once. Walking every track on open meant a store read each — and, for
  // anything without stored artwork, a full read and parse of the audio — so
  // a large library locked the app up for minutes before it drew anything.
  async function loadCoverFor(trackId) {
    if (!trackId || coverUrls[trackId] !== undefined) return;
    coverUrls[trackId] = null; // claim the slot so it's only fetched once
    // Browsing never opens the audio file; that's for playback and the
    // explicit re-read, which know they're paying for it.
    const blob = await ensureMusicCover(trackId, { deepScan: false });
    if (blob) coverUrls = { ...coverUrls, [trackId]: URL.createObjectURL(blob) };
  }

  // Fetched for the rows currently rendered, which is one page rather than the
  // whole library. Deliberately not an IntersectionObserver: that reports
  // nothing while the page isn't being composited, so artwork would silently
  // never load in a backgrounded window. A page of cheap store reads is quick
  // enough that the extra machinery buys nothing.
  async function loadCoversFor(list) {
    for (const track of list) await loadCoverFor(track.id);
  }

  onDestroy(() => {
    window.removeEventListener('resize', updateScreenShape);
    window.removeEventListener('orientationchange', updateScreenShape);
    for (const url of Object.values(coverUrls)) if (url) URL.revokeObjectURL(url);
  });

  let fileInput;
  let importInput;
  let busyMessage = '';

  function updateLibrary(next) {
    dispatch('libraryChange', next);
  }

  // Committed in batches rather than once at the end. Adding a large library
  // used to build the whole list in memory and save it only after the last
  // file — so one failure part-way through (a corrupt file, a full disk)
  // threw away every successful import with it, leaving the audio orphaned in
  // storage and nothing at all in the library.
  // Importing happens in two passes, on purpose.
  //
  // Pass one only copies the audio in, so the music is playable within
  // seconds rather than after the whole library has been analysed. Pass two
  // reads tags and artwork afterwards and records its progress per track, so
  // if it is interrupted — closed tab, dead battery, a crash — it resumes
  // where it stopped and keeps everything already found.
  // Saving the library is not cheap: it rewrites the whole folder and pushes a
  // sync. Committing every 25 files during the copy meant ~75 full saves of an
  // ever-growing track list, which is what turned a five-second import into a
  // multi-minute one. The copy now commits once at the end, and anything an
  // interrupted import leaves behind is recovered from storage instead — the
  // stored file keeps its own name, so nothing is actually lost.
  const SCAN_COMMIT_EVERY = 50;

  let scanning = false;
  let stopScanRequested = false;

  // A track still waiting for pass two.
  $: pendingScanCount = tracks.filter(looksUnscanned).length;

  const AUDIO_EXTENSION_IN_TITLE = new RegExp(`\.(${SUPPORTED_AUDIO_EXTENSIONS.join('|')})$`, 'i');

  // A track the copy pass brought in but the scan hasn't reached yet, or one
  // added by an older version that only ever stored the file name.
  function looksUnscanned(track) {
    if (!track || track.tagsScannedAt) return false;
    // A record written by the tag reader always has at least one of these,
    // even for a sparsely-tagged file; one written by the copy pass has none.
    const hasTagData =
      track.artist || track.album || track.lyrics || track.year || track.durationSeconds;
    return !hasTagData || AUDIO_EXTENSION_IN_TITLE.test(track.title || '');
  }

  // Never let a blank tag overwrite something we already show.
  function withoutEmpties(tags) {
    return Object.fromEntries(
      Object.entries(tags).filter(([, value]) => value !== '' && value != null)
    );
  }

  function titleFromFileName(name) {
    return String(name || '').replace(AUDIO_EXTENSION_IN_TITLE, '') || 'Untitled';
  }

  async function handleFilesChosen(event) {
    // Not `f.type.startsWith('audio/')`: several common containers (.m4a
    // especially) arrive with a video/* or empty MIME type and were being
    // silently dropped before they ever reached the parser.
    const files = [...(event.target?.files || [])].filter(isSupportedAudioFile);
    event.target.value = '';
    if (!files.length) return;

    const added = [];
    const failures = [];
    let outOfSpace = false;

    // Written a chunk at a time rather than a file at a time. Each write used
    // to open its own transaction and wait for it to commit, so importing a
    // thousand files meant a thousand round trips of fixed cost — most of the
    // wait was the commits, not the copying. A chunk is one commit.
    //
    // Chunked rather than done in one go because this really is moving bytes,
    // and a failure part-way is worth keeping the successful part of: an
    // interrupted import holds everything up to the last chunk.
    const CHUNK = 25;

    // Timed and written down, because how long an import takes is a question
    // about this machine's disk that cannot be answered from anywhere else. A
    // benchmark here measured blobs already in memory and missed the reading of
    // the files entirely, which is at least half of it. The app says what it
    // actually did instead, and it lands in the sync log and the diagnostics.
    const copyStartedAt = performance.now();
    let copiedBytes = 0;

    for (let start = 0; start < files.length; start += CHUNK) {
      const chunk = files.slice(start, start + CHUNK);

      busyMessage = `Adding ${Math.min(start + CHUNK, files.length)} of ${files.length}…`;
      addedNotYetCommitted = [...added];
      // Let the screen catch up between chunks; the copying itself never yields.
      await new Promise(resolve => setTimeout(resolve, 0));

      // The files go in exactly as they arrived, so whatever they carry
      // (artwork, lyrics, anything we do not read yet) stays with them.
      const entries = chunk.map(file => ({ id: crypto.randomUUID(), blob: file, file }));

      try {
        await saveMusicTracks(entries);
        for (const entry of entries) copiedBytes += entry.file?.size || 0;
        for (const { id, file } of entries) {
          // No tags yet — that is pass two. The file name stands in until then.
          added.push({ id, fileName: file.name, title: titleFromFileName(file.name) });
        }
      } catch (error) {
        // A chunk that will not commit is retried one at a time, so a single
        // unreadable file costs itself rather than the other twenty-four.
        console.warn('A batch would not commit; retrying it file by file:', error);
        for (const { id, file } of entries) {
          try {
            await saveMusicTrack(id, file);
            added.push({ id, fileName: file.name, title: titleFromFileName(file.name) });
          } catch (single) {
            console.warn('Could not add a track:', file?.name, single);
            failures.push(file?.name || 'unnamed file');
            if (single?.name === 'QuotaExceededError') { outOfSpace = true; break; }
          }
        }
        if (outOfSpace) break;
      }
    }
    const copySeconds = (performance.now() - copyStartedAt) / 1000;
    const copiedMB = Math.round(copiedBytes / 1024 / 1024);
    if (copiedMB) {
      logSync(
        'import',
        '',
        `copied ${added.length} file(s), ${copiedMB} MB in ${copySeconds.toFixed(1)}s`,
        { megabytesPerSecond: +(copiedMB / Math.max(copySeconds, 0.001)).toFixed(1) }
      );
    }

    const importedCount = added.length;
    if (importedCount) {
      // `tracks` already includes the overlay, so the committed list is built
      // from `library` to avoid folding the same additions in twice.
      const committed = Array.isArray(library?.tracks) ? library.tracks : [];
      updateLibrary({ ...library, tracks: [...committed, ...added] });
    }
    addedNotYetCommitted = [];
    await refreshAvailability();
    busyMessage = '';

    if (outOfSpace) {
      await appDialogs.alert(
        `This device ran out of storage space after adding ${importedCount} of ${files.length} tracks. ` +
        'The ones already added have been kept.'
      );
    } else if (failures.length) {
      const shown = failures.slice(0, 5).join(', ');
      await appDialogs.alert(
        `Added ${importedCount} of ${files.length}. ` +
        `Couldn't copy ${failures.length}: ${shown}${failures.length > 5 ? '…' : ''}`
      );
    }

    // The music is in and playable; now fill in titles and artwork.
    if (importedCount) await scanPendingTags();
  }

  // ── Pass two: tags and artwork, resumable ─────────────────────────
  // Progress is recorded per track, so an interrupted run picks up where it
  // stopped instead of starting over, and keeps everything already found.
  async function scanPendingTags({ force = false } = {}) {
    if (scanning) return;
    const targets = tracks.filter(track => force || looksUnscanned(track));
    if (!targets.length) return;

    scanning = true;
    stopScanRequested = false;
    // The other half of an import, timed separately: this pass opens every
    // file again to read its tags and artwork. Which of the two dominates is
    // the thing worth knowing before trying to make either faster.
    const scanStartedAt = performance.now();

    // Worked on a local copy and merged back in batches: saving the library
    // rewrites the whole folder, so doing it per track would cost far more
    // than the scanning itself.
    const working = new Map(tracks.map(track => [track.id, track]));
    let sinceCommit = 0;
    let done = 0;

    const commit = () => {
      if (!sinceCommit) return;
      sinceCommit = 0;
      updateLibrary({ ...library, tracks: [...working.values()] });
      // Committed, so the overlay has nothing left to add.
      scanUpdatesNotYetCommitted = new Map();
    };

    // Tags were only visible when the library was committed, which is every
    // fiftieth track — so a run under fifty showed nothing at all until it
    // finished, and a longer one moved in blocks. Publishing the overlay more
    // often puts each title and artist on screen as it is read, without making
    // the saves any more frequent than they were.
    const SHOW_SCANNED_EVERY = 5;
    let sinceShown = 0;

    const showProgress = () => {
      sinceShown = 0;
      scanUpdatesNotYetCommitted = new Map(working);
    };

    for (const track of targets) {
      if (stopScanRequested) break;
      done += 1;
      busyMessage = `Reading tags ${done} of ${targets.length}…`;

      try {
        const audio = await loadMusicTrack(track.id);
        if (!audio) continue; // audio lives on another device

        const { tags, cover, parsed } = await readAudioTags(audio);

        // Written to its own store straight away, so artwork already found
        // survives even if the library commit hasn't happened yet.
        if (cover) {
          await saveMusicCover(track.id, cover);
          forgetCoverlessTrack(track.id);
        }

        const current = working.get(track.id) || track;
        const merged = { ...current, ...withoutEmpties(tags) };
        // Marked done whether or not the file had anything to give, so a
        // resumed run doesn't grind through it again. A cover found by the
        // byte scan still counts as a successful read.
        if (parsed || cover) merged.tagsScannedAt = Date.now();
        if (!tags.title) merged.title = titleFromFileName(current.title || current.fileName);

        working.set(track.id, merged);
        sinceCommit += 1;
        sinceShown += 1;
      } catch (error) {
        console.warn('Could not read tags for a track:', error);
      }

      if (sinceShown >= SHOW_SCANNED_EVERY) showProgress();
      if (sinceCommit >= SCAN_COMMIT_EVERY) commit();

      // Handing the thread back after every track, not every batch. Reading a
      // file's tags is heavy enough that a run of them makes the app feel
      // stuck, and the music is already playable by this point — so the scan
      // gives way to anything else going on rather than racing to finish.
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    commit();
    const scanSeconds = (performance.now() - scanStartedAt) / 1000;
    if (done) {
      logSync('import', '', `read tags for ${done} of ${targets.length} in ${scanSeconds.toFixed(1)}s`, {
        secondsPerTrack: +(scanSeconds / Math.max(done, 1)).toFixed(2)
      });
    }
    // Fresh object URLs for whatever artwork turned up.
    for (const url of Object.values(coverUrls)) if (url) URL.revokeObjectURL(url);
    coverUrls = {};
    scanning = false;
    stopScanRequested = false;
    busyMessage = '';
  }

  // ── Files left behind by an interrupted import ────────────────────
  // The copy pass records the library once, at the end, because saving it is
  // expensive. If it is interrupted before that, the audio is already in
  // storage with no entry pointing at it. Nothing is lost though: each stored
  // file keeps its own name, so the entries can simply be rebuilt.
  let orphanIds = [];

  async function findOrphans() {
    const storedIds = await getAvailableMusicIds();
    const known = new Set(tracks.map(track => track.id));
    return [...storedIds].filter(id => !known.has(id));
  }


  async function recoverOrphans() {
    const ids = orphanIds.length ? orphanIds : await findOrphans();
    if (!ids.length) return;

    busyMessage = `Recovering ${ids.length}…`;
    const recovered = [];
    for (const id of ids) {
      const audio = await loadMusicTrack(id);
      if (!audio) continue;
      const fileName = audio.name || 'Recovered track';
      recovered.push({ id, fileName, title: titleFromFileName(fileName) });
    }
    if (recovered.length) updateLibrary({ ...library, tracks: [...tracks, ...recovered] });
    orphanIds = [];
    await refreshAvailability();
    busyMessage = '';
    // They arrive untagged, so read them the same way a fresh import does.
    if (recovered.length) await scanPendingTags();
  }

  async function discardOrphans() {
    const ids = orphanIds.length ? orphanIds : await findOrphans();
    if (!ids.length) return;
    const ok = await appConfirm(
      `Delete ${ids.length} audio file${ids.length === 1 ? '' : 's'} that aren't in your library?`
    );
    if (!ok) return;

    busyMessage = `Removing ${ids.length}…`;
    await deleteMusicTracks(ids);
    orphanIds = [];
    await refreshAvailability();
    busyMessage = '';
  }

  async function cleanUpOrphans() {
    busyMessage = 'Checking storage…';
    orphanIds = await findOrphans();
    busyMessage = '';
    if (!orphanIds.length) await appDialogs.alert('No leftover files — nothing to clean up.');
  }

  // ── Removing copies of the same file ──────────────────────────────
  //
  // The deciding is in utils/duplicateTracks.js: which files are worth
  // reading, which are really the same, and which copy stays. What is here is
  // the reading, the asking and the deleting, which need a store and a person.
  //
  // The work is proportional to how many files share a length with another
  // one, not to the size of the library — see that file for why.
  async function hashOfTrack(trackId) {
    if (!crypto?.subtle) return null;
    const blob = await loadMusicTrack(trackId);
    if (!blob) return null;
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Asked for before it runs rather than after it has found something: the
  // wider net deletes files that are not identical, so which promise is being
  // made has to be a choice somebody made on purpose. Off every time it opens —
  // not remembered — because it is the answer to "is this library one where a
  // shared name means a shared song", and that is worth re-reading each time.
  let dedupeOpen = false;
  let dedupeSameName = false;
  $: if (!dedupeOpen) dedupeSameName = false;

  async function removeDuplicates() {
    if (busyMessage) return;
    const alsoSameName = dedupeSameName;
    dedupeOpen = false;

    // No way to compare files means no way to be sure two are the same, and
    // "probably the same" is not a reason to delete somebody's music.
    if (!crypto?.subtle) {
      await appDialogs.alert('This device cannot compare files, so duplicates cannot be found safely.');
      return;
    }

    const startedAt = Date.now();
    busyMessage = 'Measuring files…';
    try {
      const sized = [];
      for (const track of tracks) {
        if (!playable.has(track.id)) continue; // nothing of it on this device
        const blob = await loadMusicTrack(track.id);
        if (blob) sized.push({ id: track.id, size: blob.size });
      }

      const groups = sizeGroups(sized);
      const sizeById = new Map(sized.map(entry => [entry.id, entry.size]));
      const candidates = groups.flat();

      const hashed = [];
      let read = 0;
      for (const id of candidates) {
        busyMessage = `Comparing ${++read} of ${candidates.length}…`;
        try {
          const hash = await hashOfTrack(id);
          if (hash) hashed.push({ id, size: sizeById.get(id), hash });
        } catch (error) {
          // Left out rather than guessed at; see clustersFromHashes.
          console.warn('Could not read a file while looking for duplicates:', id, error);
        }
      }

      const clusters = clustersFromHashes(hashed);

      // Only tracks whose audio is actually here: the wider net keeps the
      // biggest file, and a track this device does not hold has no size to
      // compare and nothing to keep.
      const named = alsoSameName
        ? sameNameClusters(tracks.filter(track => sizeById.has(track.id)))
        : [];

      const plan = planDeduplication({ tracks, playlists }, [...clusters, ...named], {
        playingId: nowPlayingId,
        sizes: sizeById
      });

      logSync(
        'duplicates',
        '',
        `checked ${sized.length} track(s), read ${candidates.length}, found ${plan.identicalCount} copy/copies` +
          `${alsoSameName ? ` and ${plan.sameNameCount} same-name` : ''} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
      );

      busyMessage = '';
      if (!plan.changed) {
        await appDialogs.alert(
          sized.length
            ? alsoSameName
              ? 'No duplicates — no two files are the same, and no two share a name.'
              : 'No duplicates — every file in your library is a different file.'
            : 'Nothing to compare yet.'
        );
        return;
      }

      // The two findings are counted apart because they are two different
      // promises: one is proven, the other is a judgement about a name.
      const parts = [];
      if (plan.identicalCount) {
        parts.push(
          plan.identicalCount === 1
            ? '1 track is exactly the same file as another'
            : `${plan.identicalCount} tracks are exactly the same file as another`
        );
      }
      if (plan.sameNameCount) {
        parts.push(
          plan.sameNameCount === 1
            ? '1 track has the same name as a bigger one'
            : `${plan.sameNameCount} tracks have the same name as a bigger one`
        );
      }
      const ok = await appConfirm(`${parts.join(', and ')}. Remove ${plan.removedCount === 1 ? 'it' : 'them'}?`);
      if (!ok) return;

      for (const id of plan.removedIds) {
        if (coverUrls[id]) URL.revokeObjectURL(coverUrls[id]);
      }
      const dropped = new Set(plan.removedIds);
      coverUrls = Object.fromEntries(Object.entries(coverUrls).filter(([id]) => !dropped.has(id)));

      // Not waited for, for the reason written out over removeSelected: the
      // library is the record of what you have, and reclaiming the space is
      // the storage engine's business. An interrupted delete leaves orphans,
      // which the sweep already finds and offers to remove.
      deleteMusicTracks(plan.removedIds)
        .then(() => refreshAvailability())
        .catch(error => console.warn('Freeing duplicate audio did not finish:', error));

      updateLibrary({ ...library, tracks: plan.tracks, playlists: plan.playlists });
      dispatch(
        'notify',
        plan.removedCount === 1 ? 'Removed one duplicate.' : `Removed ${plan.removedCount} duplicates.`
      );
    } catch (error) {
      console.error('Looking for duplicates failed:', error);
      dispatch('notify', `Could not finish looking for duplicates: ${error?.message || error}`);
    } finally {
      busyMessage = '';
    }
  }

  // ── Selecting several tracks at once ──────────────────────────────
  // Checkboxes stay out of the way until you ask for them — with the Select
  // button, a right-click, or a long-press on touch. Acts on what's currently
  // listed, so a search or an open playlist narrows what "select all" means.
  let selectedIds = new Set();
  let lastClickedId = null;
  let selectionMode = false;

  $: visibleTracks = selectedPlaylist
    ? playlistTracks.filter(track => matchesSearch(track, searchNeedle))
    : listedTracks;
  $: selectedCount = visibleTracks.filter(track => selectedIds.has(track.id)).length;
  $: allVisibleSelected = visibleTracks.length > 0 && selectedCount === visibleTracks.length;

  function toggleSelected(trackId, { range = false } = {}) {
    const next = new Set(selectedIds);
    // Unticking the last track means you've stopped selecting, so the
    // checkboxes step back out of the way rather than lingering over a
    // selection of nothing.
    const leaveWhenEmpty = () => {
      if (!next.size) selectionMode = false;
    };
    if (range && lastClickedId) {
      // Shift-click fills in everything between the two, as a list should.
      const ids = visibleTracks.map(track => track.id);
      const from = ids.indexOf(lastClickedId);
      const to = ids.indexOf(trackId);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        for (let i = start; i <= end; i += 1) next.add(ids[i]);
        selectedIds = next;
        lastClickedId = trackId;
        return;
      }
    }
    if (next.has(trackId)) next.delete(trackId);
    else next.add(trackId);
    selectedIds = next;
    lastClickedId = trackId;
    leaveWhenEmpty();
  }

  function toggleSelectAll() {
    const next = new Set(selectedIds);
    if (allVisibleSelected) for (const track of visibleTracks) next.delete(track.id);
    else for (const track of visibleTracks) next.add(track.id);
    selectedIds = next;
    // "Deselect all" leaves nothing selected, so it leaves selection mode too;
    // the Done button is still there for stepping out with a selection intact.
    if (!next.size) selectionMode = false;
  }

  function clearSelection() {
    selectedIds = new Set();
    lastClickedId = null;
  }

  function enterSelectionMode(trackId = null) {
    selectionMode = true;
    if (trackId) toggleSelected(trackId);
  }

  function exitSelectionMode() {
    selectionMode = false;
    clearSelection();
  }

  function handleTrackContextMenu(event, trackId) {
    event.preventDefault();
    if (selectionMode) toggleSelected(trackId);
    else enterSelectionMode(trackId);
  }

  // Long-press is the touch equivalent of a right-click.
  let longPressTimer;
  function startTrackLongPress(event, trackId) {
    if (event.pointerType !== 'touch' || selectionMode) return;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => enterSelectionMode(trackId), 500);
  }
  function cancelTrackLongPress() {
    clearTimeout(longPressTimer);
  }

  // Dropping tracks that are gone keeps a stale id from lingering in the set.
  $: if (selectedIds.size) {
    const live = new Set(tracks.map(track => track.id));
    if ([...selectedIds].some(id => !live.has(id))) {
      selectedIds = new Set([...selectedIds].filter(id => live.has(id)));
    }
  }

  async function removeSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const ok = await appConfirm(
      ids.length === 1
        ? 'Remove this track from the library?'
        : `Remove these ${ids.length} tracks from the library?`
    );
    if (!ok) return;

    // Freeing the audio is not waited for.
    //
    // Measured: removing a gigabyte takes about two seconds on a desktop and
    // longer on a phone, and it is the storage engine reclaiming the space —
    // not the number of tracks. Batching the deletes into one transaction
    // changed nothing (823ms against 809ms for four hundred), because the cost
    // is bytes rather than round trips. There is no making the engine faster.
    //
    // What there is, is not standing in front of it. The library is the record
    // of what you have; once a track is out of it the track is gone as far as
    // anything here is concerned, and the blobs are just space nobody has
    // reclaimed yet. So the list updates at once and the freeing runs behind it.
    //
    // Safe to leave running because of the rule in CLAUDE.md: if it is
    // interrupted — the app closed, the tab killed — the audio left behind is
    // found by the orphan sweep, which already exists and already offers to
    // remove it. Nothing is lost, it is only reclaimed later.
    for (const id of ids) {
      if (coverUrls[id]) URL.revokeObjectURL(coverUrls[id]);
      if (nowPlayingId === id) dispatch('stop');
    }
    deleteMusicTracks(ids)
      .then(() => refreshAvailability())
      .catch(error => console.warn('Freeing removed audio did not finish:', error));
    const dropped = new Set(ids);
    coverUrls = Object.fromEntries(Object.entries(coverUrls).filter(([id]) => !dropped.has(id)));
    updateLibrary({
      ...library,
      tracks: tracks.filter(track => !dropped.has(track.id)),
      playlists: playlists.map(playlist => ({
        ...playlist,
        trackIds: playlist.trackIds.filter(id => !dropped.has(id))
      }))
    });
    exitSelectionMode();
    busyMessage = '';
  }

  function addSelectedToPlaylist(playlistId) {
    const ids = [...selectedIds];
    if (!ids.length || !playlistId) return;
    updateLibrary({
      ...library,
      playlists: playlists.map(playlist =>
        playlist.id === playlistId
          // Set union, so adding twice doesn't duplicate anything.
          ? { ...playlist, trackIds: [...new Set([...playlist.trackIds, ...ids])] }
          : playlist
      )
    });
    exitSelectionMode();
  }

  function removeSelectedFromPlaylist() {
    if (!selectedPlaylist || !selectedIds.size) return;
    updateLibrary({
      ...library,
      playlists: playlists.map(playlist =>
        playlist.id === selectedPlaylist.id
          ? { ...playlist, trackIds: playlist.trackIds.filter(id => !selectedIds.has(id)) }
          : playlist
      )
    });
    exitSelectionMode();
  }

  async function playlistFromSelection() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const name = await appPrompt('Name this playlist', `Playlist ${playlists.length + 1}`);
    if (!name) return;
    updateLibrary({
      ...library,
      playlists: [...playlists, { id: crypto.randomUUID(), name, trackIds: ids }]
    });
    exitSelectionMode();
  }

  function playSelection() {
    const queue = visibleTracks.filter(t => selectedIds.has(t.id) && playable.has(t.id));
    if (!queue.length) return;
    startPlaying(queue[0].id, queue.map(t => t.id));
  }

  // The records for anything the library has not got yet travel with the
  // request, so the player can name what it is playing during an import — see
  // utils/nowPlaying.js. On any ordinary day this carries nothing.
  function startPlaying(trackId, queueIds) {
    dispatch('play', {
      trackId,
      queue: queueIds,
      tracks: tracksTheLibraryLacks(queueIds, tracks, library?.tracks)
    });
  }

  async function removeTrack(trackId) {
    await deleteMusicTracks([trackId]);
    if (coverUrls[trackId]) URL.revokeObjectURL(coverUrls[trackId]);
    const { [trackId]: _dropped, ...restCovers } = coverUrls;
    coverUrls = restCovers;
    updateLibrary({
      ...library,
      tracks: tracks.filter(t => t.id !== trackId),
      playlists: playlists.map(p => ({ ...p, trackIds: p.trackIds.filter(id => id !== trackId) }))
    });
    await refreshAvailability();
    if (nowPlayingId === trackId) dispatch('stop');
  }

  function createPlaylist() {
    const next = { id: crypto.randomUUID(), name: `Playlist ${playlists.length + 1}`, trackIds: [] };
    updateLibrary({ ...library, playlists: [...playlists, next] });
    selectedPlaylistId = next.id;
  }

  function renamePlaylist(id, name) {
    updateLibrary({ ...library, playlists: playlists.map(p => (p.id === id ? { ...p, name } : p)) });
  }

  function deletePlaylist(id) {
    updateLibrary({ ...library, playlists: playlists.filter(p => p.id !== id) });
    if (selectedPlaylistId === id) selectedPlaylistId = null;
  }

  function toggleTrackInPlaylist(trackId) {
    if (!selectedPlaylist) return;
    const trackIds = selectedPlaylist.trackIds.includes(trackId)
      ? selectedPlaylist.trackIds.filter(id => id !== trackId)
      : [...selectedPlaylist.trackIds, trackId];
    updateLibrary({
      ...library,
      playlists: playlists.map(p => (p.id === selectedPlaylist.id ? { ...p, trackIds } : p))
    });
  }

  // What plays next comes from the playlist you are in, not from what a search
  // has narrowed the screen to -- see playbackPool in utils/playlistPlayback.js.
  // Searching for one song and playing it used to leave a queue of one, which
  // then looped for ever.
  function playTrack(track) {
    if (!playable.has(track.id)) return;
    const queue = playbackPool({ pool: playlistTracks, chosen: track })
      .filter(t => playable.has(t.id));
    startPlaying(track.id, queue.map(t => t.id));
  }

  // Where it starts is what you are looking at; what follows is the playlist.
  // Pressing play after a search should begin with the first thing you found.
  function playAll() {
    const first = listedTracks.find(t => playable.has(t.id));
    if (first) playTrack(first);
  }

  // ── Moving music between devices ──────────────────────────────────
  async function exportLibrary() {
    busyMessage = 'Packing your music…';
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const manifest = [];

      for (const track of tracks) {
        const blob = await loadMusicTrack(track.id);
        if (!blob) continue;
        // Keep the real container extension — defaulting everything to .mp3
        // renamed flac/m4a files on the way out and broke them on import.
        const extension = extensionOf(track.fileName) || 'mp3';
        const fileName = track.fileName || `${track.title || track.id}.${extension}`;
        zip.file(`audio/${track.id}__${fileName}`, blob);
        const cover = await ensureMusicCover(track.id);
        if (cover) zip.file(`covers/${track.id}`, cover);
        manifest.push({ ...track, fileName });
      }
      zip.file('library.json', JSON.stringify({ tracks: manifest, playlists }, null, 2));

      const archive = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(archive);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'austavia-music.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Music export failed:', error);
      dispatch('notify', `Could not export music: ${error?.message || error}`);
    }
    busyMessage = '';
  }

  async function handleImportChosen(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    busyMessage = 'Restoring your music…';
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const manifestFile = zip.file('library.json');
      const manifest = manifestFile
        ? JSON.parse(await manifestFile.async('string'))
        : { tracks: [], playlists: [] };

      const byId = new Map(tracks.map(t => [t.id, t]));
      for (const track of manifest.tracks || []) {
        const entry = zip.file(new RegExp(`^audio/${track.id}__`))[0];
        if (!entry) continue;
        await saveMusicTrack(track.id, await entry.async('blob'));
        forgetCoverlessTrack(track.id);
        const coverEntry = zip.file(`covers/${track.id}`);
        if (coverEntry) await saveMusicCover(track.id, await coverEntry.async('blob'));
        byId.set(track.id, { ...(byId.get(track.id) || {}), ...track });
      }

      const playlistById = new Map(playlists.map(p => [p.id, p]));
      for (const p of manifest.playlists || []) playlistById.set(p.id, p);

      coverUrls = {};
      updateLibrary({ ...library, tracks: [...byId.values()], playlists: [...playlistById.values()] });
      await refreshAvailability();
    } catch (error) {
      console.error('Music import failed:', error);
      dispatch('notify', `Could not import that file: ${error?.message || error}`);
    }
    busyMessage = '';
    event.target.value = '';
  }

  // One description per action, drawn wherever the layout puts it — the bar,
  // the playlist strip or the overflow menu. They are written once here rather
  // than once per place, so a button cannot come to mean two different things
  // depending on the width of the window.
  //
  // `glyph` is what a compact button shows on its own; `label` is the words,
  // which the menu always shows and the bar drops when it is short of room.
  $: playlistActions = {
    add: {
      glyph: '＋',
      label: 'Add music',
      title: 'Add music files from this device',
      run: () => fileInput.click()
    },
    newPlaylist: {
      glyph: '＋',
      label: 'Playlist',
      title: 'Make a new playlist',
      run: createPlaylist
    },
    play: {
      icon: 'play',
      label: 'Play',
      title: 'Play this list',
      disabled: !listedTracks.length,
      run: playAll
    },
    shuffle: {
      icon: 'shuffle',
      label: `Shuffle${shuffle ? ': on' : ''}`,
      title: 'Shuffle — play this list in a random order',
      on: shuffle,
      pressed: shuffle,
      run: () => dispatch('toggleShuffle')
    },
    select: {
      glyph: '☑',
      label: selectionMode ? 'Done selecting' : 'Select songs',
      title: 'Pick several tracks to delete or add to a playlist',
      disabled: !tracks.length,
      on: selectionMode,
      run: () => (selectionMode ? exitSelectionMode() : (selectionMode = true))
    },
    scan: scanning
      ? {
          glyph: '■',
          label: 'Stop scan',
          title: 'Stop reading tags',
          run: () => (stopScanRequested = true)
        }
      : {
          glyph: '↻',
          label: pendingScanCount
            ? `Scan ${pendingScanCount} track${pendingScanCount === 1 ? '' : 's'}`
            : 'Re-read tags',
          title: pendingScanCount
            ? 'Read titles and artwork for the tracks still waiting'
            : 'Re-read titles and artwork for every track',
          disabled: !tracks.length || !!busyMessage,
          on: pendingScanCount > 0,
          run: () => scanPendingTags({ force: pendingScanCount === 0 })
        },
    export: {
      glyph: '⬇',
      label: 'Export',
      title: 'Save the whole library to a file',
      disabled: !tracks.length,
      run: exportLibrary
    },
    import: {
      glyph: '⬆',
      label: 'Import',
      title: 'Restore a library exported from another device',
      run: () => importInput.click()
    },
    dedupe: {
      glyph: '⧉',
      label: 'Remove duplicates',
      title: 'Find tracks stored twice and remove the copies',
      disabled: !tracks.length || !!busyMessage,
      run: () => (dedupeOpen = true)
    },
    cleanUp: {
      glyph: '🧹',
      label: 'Clean up',
      title: 'Delete audio left on this device by an import that failed',
      disabled: !!busyMessage,
      run: cleanUpOrphans
    }
  };

  function runAction(action) {
    moreOpen = false;
    action.run();
  }

  function closeMoreOnOutside(event) {
    if (!moreOpen || !moreEl) return;
    if (!moreEl.contains(event.target)) moreOpen = false;
  }
</script>


<style>
  .playlist-mode {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    /* so the wallpaper holder sits against this box rather than the page */
    position: relative;
    /* The whole surface, not just the panels, so no untouched corner is left
       showing the app background through. */
    background: var(--pl-surface, var(--canvas-inner-bg, #000));
    color: var(--mode-text-color, #fff);
    --sb-track: var(--pl-surface, var(--canvas-inner-bg));
    /* This mode wears the music block's colour rather than the theme's for the
       mode, so it says which background a highlight should show through to;
       see the ::selection rule in app.css. */
    --selection-text: var(--pl-surface, var(--canvas-inner-bg));
    --sb-thumb: var(--mode-text-color);
    --pl-line: color-mix(in srgb, var(--mode-text-color, #fff) 14%, transparent);
    --pl-soft: color-mix(in srgb, var(--mode-text-color, #fff) 8%, transparent);
  }

  .pl-header {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--pl-line);
  }
  /* The four buttons, the search box and the overflow button on one line. The
     busy message is allowed to wrap under them, because it is temporary and
     losing it would be worse than a second row while something is running. */
  .pl-header.compact { gap: 6px; padding: 8px 10px; }
  .pl-header.compact .pl-search { flex: 1 1 110px; min-width: 100px; max-width: none; }

  .pl-btn {
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 30%, transparent);
    background: var(--pl-soft);
    color: var(--mode-text-color, #fff);
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 0.84rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .pl-btn-icon { display: inline-flex; align-items: center; gap: 6px; }
  .pl-glyph { line-height: 1; }

  /* Short of room, a button is its glyph and nothing else. The words are still
     on it as a title and an aria-label, so the button is still named for a
     screen reader and for anyone who holds it. */
  .pl-btn.square {
    padding: 7px 9px;
    min-width: 34px;
    justify-content: center;
    font-size: 0.95rem;
  }

  .pl-more { position: relative; display: inline-flex; }

  .pl-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 5;
    min-width: 190px;
    display: flex;
    flex-direction: column;
    padding: 5px;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 26%, transparent);
    /* Opaque on purpose: it sits over the wallpaper and over the track list,
       and a translucent menu on a photograph cannot be read. */
    background: var(--pl-surface, var(--canvas-inner-bg, #000));
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
  }
  .pl-menu-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--mode-text-color, #fff);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }
  .pl-menu-item:hover:not(:disabled) { background: var(--pl-soft); }
  .pl-menu-item:disabled { opacity: 0.4; cursor: not-allowed; }
  .pl-menu-item.on { background: color-mix(in srgb, var(--mode-text-color, #fff) 20%, transparent); }
  .pl-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--mode-text-color, #fff) 18%, transparent); }
  .pl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pl-btn.on {
    background: color-mix(in srgb, var(--mode-text-color, #fff) 24%, transparent);
    border-color: var(--mode-text-color, #fff);
  }

  .pl-body {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
  }

  /* The picture sits behind everything and takes no clicks. Clipped to the
     mode, because a blurred layer is drawn larger than its box on purpose —
     see modeBackground.js — and would otherwise spill over the toolbar. */
  .pl-bg-holder {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  /* Above the picture. Without this the panels paint over it and the wallpaper
     shows only in whatever corner nothing happens to cover. */
  .playlist-mode > .pl-header,
  .playlist-mode > .pl-body {
    position: relative;
  }

  /* The toolbar above the list, not merely above the wallpaper.
     
     Both of these used to be z-index: 1, which made each of them a stacking
     context of its own — and then the later one in the document wins whatever
     its children say. So the overflow menu, at z-index 5 inside the toolbar,
     still came out underneath the music: it was competing with its parent's
     neighbour, not with the list. */
  .playlist-mode > .pl-header { z-index: 2; }
  .playlist-mode > .pl-body { z-index: 1; }

  /* With a picture behind them the panels get out of its way — the same thing
     Single Note does with its note. Rows, buttons and headings keep their own
     tints, which are translucent already, so the list stays readable over a
     photograph. With no picture, nothing changes.
     
     The mode itself is deliberately not in this list. It is what the picture is
     drawn *on*, and a picture at less than full opacity has to land on
     something: made transparent it landed on whatever was behind the mode,
     which is the app's own background and near enough black on most themes. So
     fading the wallpaper faded to black instead of to the colour this mode
     wears. Single Note keeps its own background for exactly this reason and
     only clears its inner surfaces. */
  .playlist-mode.has-wallpaper .pl-sidebar,
  .playlist-mode.has-wallpaper .pl-tracks {
    background: transparent;
  }

  .pl-sidebar {
    min-height: 0;
    overflow-y: auto;
    /* Names are cut short instead; nothing here is worth scrolling sideways
       for. The row of names on a narrow screen overrides this, because there
       the sideways scroll is the whole design. */
    overflow-x: hidden;
    padding: 10px;
    border-right: 1px solid var(--pl-line);
    background: var(--pl-surface, var(--canvas-inner-bg, #000));
  }

  /* Explicit background here too: without it the track list showed the app
     surface behind the mode instead of the theme's own colour. */
  .pl-tracks {
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px;
    background: var(--pl-surface, var(--canvas-inner-bg, #000));
  }

  .pl-section-title {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.65;
    margin: 2px 0 8px;
  }

  .pl-playlist {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    /* Without this the row is 100% *plus* its padding and border, so the column
       scrolled sideways by twenty pixels whatever the playlist was called. */
    box-sizing: border-box;
    padding: 7px 9px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid transparent;
    background: none;
    color: inherit;
    text-align: left;
    font-size: 0.85rem;
  }
  .pl-playlist:hover { background: var(--pl-soft); }
  .pl-playlist.active {
    border-color: color-mix(in srgb, var(--mode-text-color, #fff) 45%, transparent);
    background: var(--pl-soft);
  }
  /* A long name is cut short rather than made to fit, and the column never
     scrolls sideways to chase it.
     
     The floor is the point of the `min-width`: truncating purely on what is
     left over leaves about six letters, which is not enough to tell two
     playlists apart. Fourteen characters' worth is reserved first and the
     count beside it gives way — the number is a detail, the name is how you
     find the thing. */
  .pl-playlist-name {
    flex: 1 1 auto;
    min-width: min(14ch, 100%);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pl-count {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    opacity: 0.55;
    font-size: 0.75rem;
  }

  .pl-track {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 8px;
    border-bottom: 1px solid var(--pl-line);
  }
  .pl-track:hover { background: var(--pl-soft); }
  .pl-track.playing {
    background: color-mix(in srgb, var(--mode-text-color, #fff) 14%, transparent);
  }
  .pl-track.unavailable { opacity: 0.45; }

  .pl-cover {
    width: 40px;
    height: 40px;
    border-radius: 5px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--pl-soft);
  }
  .pl-cover-blank {
    display: grid;
    place-items: center;
    opacity: 0.5;
    color: var(--mode-text-color, #fff);
  }

  .pl-track-main { flex: 1; min-width: 0; cursor: pointer; }
  .pl-track-title { font-size: 0.9rem; min-width: 0; }
  .pl-track-sub {
    font-size: 0.74rem;
    opacity: 0.65;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pl-icon-btn {
    display: grid;
    place-items: center;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.6;
    padding: 4px 6px;
    font-size: 0.95rem;
    flex-shrink: 0;
  }
  .pl-icon-btn:hover:not(:disabled) { opacity: 1; }
  .pl-icon-btn:disabled { opacity: 0.25; cursor: not-allowed; }

  .pl-search {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 190px;
    min-width: 150px;
    max-width: 320px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 30%, transparent);
    background: var(--pl-soft);
  }
  .pl-search-icon { opacity: 0.6; font-size: 1rem; line-height: 1; }
  .pl-search input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    color: var(--mode-text-color, #fff);
    font-size: 0.84rem;
    padding: 7px 0;
    outline: none;
  }
  .pl-search input::placeholder { color: var(--mode-text-color, #fff); opacity: 0.45; }
  /* the UA clear affordance sits at odds with the themed one beside it */
  .pl-search input::-webkit-search-cancel-button { display: none; }
  .pl-search-clear {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    padding: 0 2px;
    min-height: 0;
    font-size: 1rem;
    line-height: 1;
  }
  .pl-search-clear:hover { opacity: 1; }

  .pl-check {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    margin: 0 2px 0 0;
    /* Colour comes from the shared checkbox in app.css, via --sb-thumb. */
    cursor: pointer;
  }

  .pl-recover {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 10px;
    margin-bottom: 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 35%, transparent);
    background: var(--pl-soft);
    font-size: 0.82rem;
  }
  .pl-recover span { flex: 1 1 240px; min-width: 0; }

  /* Asked before it runs, not after — see removeDuplicates. Laid out as prose
     rather than a row of controls because the thing being chosen is which
     promise is being made, and that takes a sentence. */
  .pl-dedupe {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    margin-bottom: 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 35%, transparent);
    background: var(--pl-soft);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .pl-dedupe-lead { margin: 0; opacity: 0.85; }
  .pl-dedupe-check {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    cursor: pointer;
  }
  .pl-dedupe-check input { margin-top: 2px; flex: 0 0 auto; }
  .pl-dedupe-check strong { display: block; font-weight: 600; }
  .pl-dedupe-check span { opacity: 0.85; }
  .pl-dedupe-check strong { opacity: 1; }
  .pl-dedupe-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .pl-recover .pl-btn { padding: 5px 10px; font-size: 0.78rem; }

  .pl-select-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 8px 8px;
  }
  .pl-select-all {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.8rem;
    opacity: 0.85;
    cursor: pointer;
  }
  .pl-select-all input { accent-color: var(--mode-text-color, #fff); cursor: pointer; }
  .pl-select-done {
    margin-left: auto;
    background: none;
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 30%, transparent);
    color: inherit;
    border-radius: 7px;
    padding: 4px 10px;
    font-size: 0.78rem;
    min-height: 0;
    cursor: pointer;
  }

  /* Sticks to the top of the list so the actions stay reachable however far
     down a long library you have scrolled. */
  .pl-bulk {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 8px;
    margin-bottom: 6px;
    border-radius: 8px;
    border: 1px solid var(--pl-line);
    background: var(--pl-surface, var(--canvas-inner-bg, #000));
  }
  .pl-bulk .pl-btn { padding: 5px 9px; font-size: 0.79rem; }
  .pl-btn-danger { border-color: color-mix(in srgb, #ff6b6b 60%, transparent); }
  .pl-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, #ff6b6b 22%, transparent); }
  .pl-bulk-select {
    border: 1px solid color-mix(in srgb, var(--mode-text-color, #fff) 30%, transparent);
    background: var(--pl-soft);
    color: var(--mode-text-color, #fff);
    border-radius: 8px;
    padding: 5px 8px;
    font-size: 0.79rem;
    cursor: pointer;
  }
  .pl-bulk-select option { background: var(--pl-surface, var(--canvas-inner-bg, #000)); color: var(--mode-text-color, #fff); }

  .pl-track.selected {
    background: color-mix(in srgb, var(--mode-text-color, #fff) 12%, transparent);
  }


  .pl-empty { opacity: 0.6; font-size: 0.85rem; padding: 20px 4px; line-height: 1.5; }
  .pl-busy { font-size: 0.8rem; opacity: 0.8; }

  /* Narrow enough that the playlists cannot have a column of their own, they
     become a single row of names above the music.
     
     What was here before gave them 30vh whether there were twenty of them or
     one: 249px of a 812px phone, mostly empty, and a panel that scrolled
     vertically — which was the complaint. A row is as tall as one name, and it
     scrolls sideways only when there are more names than fit. */
  @media (max-width: 1024px) {
    /* The row of names takes what it needs and the music takes the rest.
       Without the explicit rows both are `auto`, which shares the height
       between them — and the strip ends up taller than the panel it replaced. */
    .pl-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .pl-sidebar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      overflow-x: auto;
      overflow-y: hidden;
      border-right: none;
      border-bottom: 1px solid var(--pl-line);
    }
    .pl-sidebar .pl-section-title { display: none; }
    .pl-playlist {
      width: auto;
      flex: 0 0 auto;
      border-radius: 999px;
      border-color: var(--pl-line);
      padding: 6px 12px;
      /* One line box for every chip, names and the ＋ alike, so they sit level
         however big the glyph inside them is. */
      line-height: 20px;
    }
    /* The delete × is the other thing that can make a chip taller than its
       neighbours; here it lives inside the same line box as the name. */
    .pl-sidebar .pl-icon-btn {
      padding: 0 2px;
      font-size: 0.9rem;
      line-height: 20px;
    }
    .pl-playlist-name { flex: 0 0 auto; max-width: 38vw; }
  }

  /* Only drawn where the toolbar has given the action away — see
     utils/playlistToolbar.js. */
  .pl-playlist-new {
    justify-content: center;
    min-width: 38px;
    font-size: 0.95rem;
  }
</style>

<svelte:window
  on:pointerdown={closeMoreOnOutside}
  on:keydown={(event) => event.key === 'Escape' && (moreOpen = false)}
/>

<div class="playlist-mode" class:has-wallpaper={wallpaper} bind:this={canvasRef} style={cssVars}>
  {#if wallpaper}
    <div class="pl-bg-holder" aria-hidden="true">
      <ModeBackground settings={backgroundSettings} isMobile={isPortraitScreen} />
    </div>
  {/if}
  <div class="pl-header" class:compact bind:clientWidth={headerWidth}>
    {#each layout.bar as id (id)}
      {@const action = playlistActions[id]}
      <button
        class="pl-btn pl-btn-icon"
        class:square={compact}
        class:on={action.on}
        title={action.title}
        aria-label={action.label}
        aria-pressed={action.pressed === undefined ? undefined : action.pressed}
        disabled={action.disabled}
        on:click={() => runAction(action)}
      >
        {#if action.icon}
          <PlayerIcon name={action.icon} size={15} />
        {:else}
          <span class="pl-glyph">{action.glyph}</span>
        {/if}
        {#if !compact}<span>{action.label}</span>{/if}
      </button>
    {/each}

    <label class="pl-search">
      <span class="pl-search-icon" aria-hidden="true">⌕</span>
      <input
        type="search"
        bind:value={search}
        placeholder={compact ? 'Search…' : 'Search title, artist, album…'}
        aria-label="Search music"
      />
      {#if search}
        <button class="pl-search-clear" title="Clear search" on:click={() => (search = '')}>×</button>
      {/if}
    </label>

    {#if layout.menu.length}
      <div class="pl-more" bind:this={moreEl}>
        <button
          class="pl-btn pl-btn-icon square"
          class:on={moreOpen}
          title="Everything else"
          aria-label="Everything else"
          aria-expanded={moreOpen}
          on:click={() => (moreOpen = !moreOpen)}
        ><span class="pl-glyph">⋯</span></button>
        {#if moreOpen}
          <div class="pl-menu">
            {#each layout.menu as id (id)}
              {@const action = playlistActions[id]}
              <button
                class="pl-menu-item"
                class:on={action.on}
                title={action.title}
                disabled={action.disabled}
                on:click={() => runAction(action)}
              >
                <span class="pl-glyph">{action.glyph}</span>
                <span>{action.label}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if busyMessage}<span class="pl-busy">{busyMessage}</span>{/if}
    <input
      type="file"
      accept={audioAccept}
      multiple
      hidden
      bind:this={fileInput}
      on:change={handleFilesChosen}
    />
    <input type="file" accept=".zip,application/zip" hidden bind:this={importInput} on:change={handleImportChosen} />
  </div>

  <div class="pl-body">
    <div class="pl-sidebar">
      <p class="pl-section-title">Playlists</p>
      <button class="pl-playlist" class:active={!selectedPlaylistId} on:click={() => (selectedPlaylistId = null)}>
        <span class="pl-playlist-name">All music</span>
        <span class="pl-count">{tracks.length}</span>
      </button>
      {#each playlists as playlist (playlist.id)}
        <div class="pl-playlist" class:active={selectedPlaylistId === playlist.id}>
          <span
            class="pl-playlist-name"
            role="button"
            tabindex="0"
            title="Double-click to rename"
            on:click={() => (selectedPlaylistId = playlist.id)}
            on:keydown={(e) => e.key === 'Enter' && (selectedPlaylistId = playlist.id)}
            on:dblclick={() => {
              const name = prompt('Playlist name', playlist.name);
              if (name) renamePlaylist(playlist.id, name);
            }}
          >{playlist.name}</span>
          <span class="pl-count">{playlist.trackIds.length}</span>
          <button class="pl-icon-btn" title="Delete playlist" on:click|stopPropagation={() => deletePlaylist(playlist.id)}>×</button>
        </div>
      {/each}
      {#if layout.strip.includes('newPlaylist')}
        <button
          class="pl-playlist pl-playlist-new"
          title={playlistActions.newPlaylist.title}
          aria-label={playlistActions.newPlaylist.label}
          on:click={() => runAction(playlistActions.newPlaylist)}
        >＋</button>
      {/if}
    </div>

    <div class="pl-tracks" bind:this={listEl} bind:clientHeight={listViewport} on:scroll={onListScroll}>
      <p class="pl-section-title">
        {selectedPlaylist ? selectedPlaylist.name : 'All music'}
        {#if selectedPlaylist}<span class="pl-count"> — ✓ adds or removes</span>{/if}
      </p>

      {#if dedupeOpen}
        <div class="pl-dedupe">
          <p class="pl-dedupe-lead">
            Looks for tracks stored more than once and removes the copies. Playlists keep the
            copy that stays, in its place.
          </p>
          <label class="pl-dedupe-check">
            <input type="checkbox" bind:checked={dedupeSameName} />
            <span>
              <strong>Also remove tracks with the same name, keeping the biggest file.</strong>
              These are <em>not</em> identical files. It is for the same song imported twice at
              two qualities — the smaller one is deleted on the strength of its name alone.
              Tracks that share a name but name different artists are left alone.
            </span>
          </label>
          <div class="pl-dedupe-actions">
            <button class="pl-btn" on:click={removeDuplicates} disabled={!!busyMessage}>
              Find duplicates
            </button>
            <button class="pl-btn" on:click={() => (dedupeOpen = false)}>Cancel</button>
          </div>
        </div>
      {/if}

      {#if orphanIds.length}
        <div class="pl-recover">
          <span>
            {orphanIds.length} audio file{orphanIds.length === 1 ? '' : 's'} on this device
            {orphanIds.length === 1 ? "isn't" : "aren't"} in your library — probably from an
            import that stopped early.
          </span>
          <button class="pl-btn" on:click={recoverOrphans} disabled={!!busyMessage}>Add them back</button>
          <button class="pl-btn pl-btn-danger" on:click={discardOrphans} disabled={!!busyMessage}>Delete</button>
          <button class="pl-btn" on:click={() => (orphanIds = [])}>Dismiss</button>
        </div>
      {/if}

      {#if selectionMode && visibleTracks.length}
        <div class="pl-select-row">
          <label class="pl-select-all">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              indeterminate={selectedCount > 0 && !allVisibleSelected}
              on:change={toggleSelectAll}
            />
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
            {#if searchNeedle || selectedPlaylist}<span class="pl-count"> shown</span>{/if}
          </label>
          {#if selectedIds.size}
            <span class="pl-count">{selectedIds.size} selected</span>
          {/if}
          <button class="pl-select-done" on:click={exitSelectionMode}>Done</button>
        </div>
      {/if}

      {#if selectedIds.size}
        <div class="pl-bulk">
          <button class="pl-btn pl-btn-icon" on:click={playSelection}>
            <PlayerIcon name="play" size={14} /> Play
          </button>
          <button class="pl-btn" on:click={playlistFromSelection}>＋ New playlist</button>
          {#if playlists.length}
            <select
              class="pl-bulk-select"
              aria-label="Add selection to a playlist"
              on:change={(e) => { addSelectedToPlaylist(e.target.value); e.target.value = ''; }}
            >
              <option value="">Add to playlist…</option>
              {#each playlists as playlist (playlist.id)}
                <option value={playlist.id}>{playlist.name}</option>
              {/each}
            </select>
          {/if}
          {#if selectedPlaylist}
            <button class="pl-btn" on:click={removeSelectedFromPlaylist}>Remove from this playlist</button>
          {/if}
          <button class="pl-btn pl-btn-danger" on:click={removeSelected}>🗑 Delete</button>
          <button class="pl-btn" on:click={exitSelectionMode}>Cancel</button>
        </div>
      {/if}

      {#if !tracks.length}
        <div class="pl-empty">
          No music yet. <strong>Add music</strong> for files on this device, or
          <strong>Import</strong> to restore an export from another one.<br />
          Titles, artists, artwork and lyrics are read from the files themselves.
        </div>
      {:else if !listedTracks.length && searchNeedle}
        <div class="pl-empty">Nothing matches “{search}”.</div>
      {:else}
        <div class="pl-rows" bind:this={rowsEl}>
        <div style="height:{rowWindow.padTop}px" aria-hidden="true"></div>
        {#each renderedTracks as track (track.id)}
          {@const available = playable.has(track.id)}
          {@const inPlaylist = selectedPlaylist?.trackIds.includes(track.id)}
          <div
            class="pl-track"
            class:playing={nowPlayingId === track.id}
            class:unavailable={!available}
            class:selected={selectedIds.has(track.id)}
            on:contextmenu={(e) => handleTrackContextMenu(e, track.id)}
            on:pointerdown={(e) => startTrackLongPress(e, track.id)}
            on:pointerup={cancelTrackLongPress}
            on:pointermove={cancelTrackLongPress}
            on:pointercancel={cancelTrackLongPress}
          >
            {#if selectionMode}
            <input
              class="pl-check"
              type="checkbox"
              checked={selectedIds.has(track.id)}
              aria-label={`Select ${track.title || 'track'}`}
              on:click={(e) => toggleSelected(track.id, { range: e.shiftKey })}
            />
            {/if}
            {#if coverUrls[track.id]}
              <img class="pl-cover" src={coverUrls[track.id]} alt="" />
            {:else}
              <div class="pl-cover pl-cover-blank"><PlayerIcon name="music" size={18} /></div>
            {/if}

            <button
              class="pl-icon-btn"
              title={available ? (nowPlayingId === track.id && isPlaying ? 'Pause' : 'Play') : 'Audio not on this device'}
              on:click={() => (nowPlayingId === track.id ? dispatch('toggle') : playTrack(track))}
              disabled={!available}
            ><PlayerIcon name={nowPlayingId === track.id && isPlaying ? 'pause' : 'play'} size={15} /></button>

            <div
              class="pl-track-main"
              role="button"
              tabindex="0"
              on:click={() => (selectionMode ? toggleSelected(track.id) : playTrack(track))}
              on:keydown={(e) =>
                e.key === 'Enter' && (selectionMode ? toggleSelected(track.id) : playTrack(track))}
            >
              <div class="pl-track-title">
                <ScrollingText text={track.title || 'Untitled'} />
              </div>
              <div class="pl-track-sub">
                {#if !available}
                  Not on this device — import it here
                {:else}
                  {[track.artist, track.album, formatDuration(track.durationSeconds)].filter(Boolean).join(' · ') || '—'}
                  {#if track.lyrics} · has lyrics{/if}
                {/if}
              </div>
            </div>

            {#if selectedPlaylist}
              <button
                class="pl-icon-btn"
                title={inPlaylist ? 'Remove from playlist' : 'Add to playlist'}
                on:click={() => toggleTrackInPlaylist(track.id)}
              >{inPlaylist ? '✓' : '＋'}</button>
            {/if}
          </div>
        {/each}
        <div style="height:{rowWindow.padBottom}px" aria-hidden="true"></div>
        </div>
      {/if}
    </div>
  </div>
</div>
