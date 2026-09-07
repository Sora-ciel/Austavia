<script>
  import { createEventDispatcher, onMount, onDestroy, getContext } from 'svelte';
  import { getReadableTextColor } from '../utils/readableColor.js';
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
  import {
    saveMusicTrack,
    deleteMusicTrack,
    getAvailableMusicIds,
    loadMusicTrack,
    saveMusicCover,
    deleteMusicCover
  } from '../storage.js';

  export let canvasColors = {};
  export let canvasRef;
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
  $: modeTextColor = canvasTheme.textColor || getReadableTextColor(canvasTheme.innerBg);
  $: cssVars =
    `--canvas-outer-bg: ${canvasTheme.outerBg}; --canvas-inner-bg: ${canvasTheme.innerBg};` +
    ` --mode-text-color: ${modeTextColor};`;

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

  let selectedPlaylistId = null;
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
  // Android's picker greys out anything whose MIME the provider disagrees with,
  // so it is asked for everything there; see audioAcceptFor.
  const runningNatively =
    typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
  const audioAccept = audioAcceptFor({ native: runningNatively });

  $: searchNeedle = search.trim().toLowerCase();
  $: renderedTracks = visibleTracks;
  $: loadCoversFor(renderedTracks);
  $: listedTracks = searchNeedle
    ? playlistTracks.filter(track => matchesSearch(track, searchNeedle))
    : playlistTracks;

  let availableIds = new Set();
  async function refreshAvailability() {
    availableIds = await getAvailableMusicIds();
  }
  onMount(async () => {
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

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      // Repainting on every file costs more than the copy itself, so the list
      // catches up in the same rhythm the progress message does. The tracks
      // themselves are pushed on every pass below; this is only how often the
      // screen is told about them.
      if (i % 20 === 0) {
        busyMessage = `Adding ${i + 1} of ${files.length}…`;
        addedNotYetCommitted = [...added];
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      try {
        const id = crypto.randomUUID();
        // The file goes in exactly as it arrived, so whatever it carries
        // (artwork, lyrics, anything we don't read yet) stays with it.
        await saveMusicTrack(id, file);
        // No tags yet — that's pass two. The file name stands in until then.
        added.push({ id, fileName: file.name, title: titleFromFileName(file.name) });
      } catch (error) {
        // One unreadable file shouldn't cost you the other 1889.
        console.warn('Could not add a track:', file?.name, error);
        failures.push(file?.name || 'unnamed file');
        if (error?.name === 'QuotaExceededError') {
          outOfSpace = true;
          break;
        }
      }
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
    for (const id of ids) {
      await deleteMusicTrack(id);
      await deleteMusicCover(id);
    }
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

    busyMessage = `Removing ${ids.length}…`;
    for (const id of ids) {
      await deleteMusicTrack(id);
      await deleteMusicCover(id);
      if (coverUrls[id]) URL.revokeObjectURL(coverUrls[id]);
      if (nowPlayingId === id) dispatch('stop');
    }
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
    await refreshAvailability();
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
    const queue = visibleTracks.filter(t => selectedIds.has(t.id) && availableIds.has(t.id));
    if (!queue.length) return;
    dispatch('play', { trackId: queue[0].id, queue: queue.map(t => t.id) });
  }

  async function removeTrack(trackId) {
    await deleteMusicTrack(trackId);
    await deleteMusicCover(trackId);
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

  function playTrack(track) {
    if (!availableIds.has(track.id)) return;
    dispatch('play', { trackId: track.id, queue: listedTracks.map(t => t.id) });
  }

  function playAll() {
    const first = listedTracks.find(t => availableIds.has(t.id));
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
</script>

<style>
  .playlist-mode {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    /* The whole surface, not just the panels, so no untouched corner is left
       showing the app background through. */
    background: var(--canvas-inner-bg, #000);
    color: var(--mode-text-color, #fff);
    --sb-track: var(--canvas-inner-bg);
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

  .pl-sidebar {
    min-height: 0;
    overflow-y: auto;
    padding: 10px;
    border-right: 1px solid var(--pl-line);
    background: var(--canvas-inner-bg, #000);
  }

  /* Explicit background here too: without it the track list showed the app
     surface behind the mode instead of the theme's own colour. */
  .pl-tracks {
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px;
    background: var(--canvas-inner-bg, #000);
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
  .pl-playlist-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pl-count { opacity: 0.55; font-size: 0.75rem; }

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
    accent-color: var(--mode-text-color, #fff);
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
    background: var(--canvas-inner-bg, #000);
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
  .pl-bulk-select option { background: var(--canvas-inner-bg, #000); color: var(--mode-text-color, #fff); }

  .pl-track.selected {
    background: color-mix(in srgb, var(--mode-text-color, #fff) 12%, transparent);
  }


  .pl-empty { opacity: 0.6; font-size: 0.85rem; padding: 20px 4px; line-height: 1.5; }
  .pl-busy { font-size: 0.8rem; opacity: 0.8; }

  @media (max-width: 1024px) {
    .pl-body { grid-template-columns: minmax(0, 1fr); }
    .pl-sidebar {
      max-height: 30vh;
      border-right: none;
      border-bottom: 1px solid var(--pl-line);
    }
  }
</style>

<div class="playlist-mode" bind:this={canvasRef} style={cssVars}>
  <div class="pl-header">
    <button class="pl-btn" on:click={() => fileInput.click()}>＋ Add music</button>
    <button class="pl-btn" on:click={createPlaylist}>＋ Playlist</button>
    <button class="pl-btn pl-btn-icon" on:click={playAll} disabled={!listedTracks.length}>
      <PlayerIcon name="play" size={15} /> Play
    </button>
    <button
      class="pl-btn pl-btn-icon"
      class:on={shuffle}
      title="Shuffle — play this list in a random order"
      aria-pressed={shuffle}
      on:click={() => dispatch('toggleShuffle')}
    ><PlayerIcon name="shuffle" size={15} /> Shuffle{shuffle ? ': on' : ''}</button>
    <button
      class="pl-btn"
      class:on={selectionMode}
      on:click={() => (selectionMode ? exitSelectionMode() : (selectionMode = true))}
      disabled={!tracks.length}
      title="Pick several tracks to delete or add to a playlist"
    >☑ Select songs</button>
    {#if scanning}
      <button class="pl-btn" on:click={() => (stopScanRequested = true)}>■ Stop scan</button>
    {:else}
      <button
        class="pl-btn"
        class:on={pendingScanCount > 0}
        on:click={() => scanPendingTags({ force: pendingScanCount === 0 })}
        disabled={!tracks.length || !!busyMessage}
        title={pendingScanCount
          ? 'Read titles and artwork for the tracks still waiting'
          : 'Re-read titles and artwork for every track'}
      >↻ {pendingScanCount ? `Scan ${pendingScanCount} track${pendingScanCount === 1 ? '' : 's'}` : 'Re-read tags'}</button>
    {/if}
    <button class="pl-btn" on:click={exportLibrary} disabled={!tracks.length}>⬇ Export</button>
    <button class="pl-btn" on:click={() => importInput.click()}>⬆ Import</button>
    <button
      class="pl-btn"
      on:click={cleanUpOrphans}
      disabled={!!busyMessage}
      title="Delete audio left on this device by an import that failed"
    >🧹 Clean up</button>
    <label class="pl-search">
      <span class="pl-search-icon" aria-hidden="true">⌕</span>
      <input
        type="search"
        bind:value={search}
        placeholder="Search title, artist, album…"
        aria-label="Search music"
      />
      {#if search}
        <button class="pl-search-clear" title="Clear search" on:click={() => (search = '')}>×</button>
      {/if}
    </label>
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
    </div>

    <div class="pl-tracks">
      <p class="pl-section-title">
        {selectedPlaylist ? selectedPlaylist.name : 'All music'}
        {#if selectedPlaylist}<span class="pl-count"> — ✓ adds or removes</span>{/if}
      </p>

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
        {#each renderedTracks as track (track.id)}
          {@const available = availableIds.has(track.id)}
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
      {/if}
    </div>
  </div>
</div>
