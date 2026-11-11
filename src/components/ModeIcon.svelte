<script>
  /**
   * A mode's icon, drawn in the colour of what it sits on. One set for the
   * computer's column of modes and the phone's sheet of them (CLAUDE.md, "one
   * of everything"); a mode added later gets a line here, and until then a
   * plain square.
   */
  export let mode = 'default';
  export let size = 22;

  const PATHS = {
    // Canvas: blocks scattered on a board.
    default: ['M4 4h7v6H4z', 'M14 7h6v5h-6z', 'M6 14h8v6H6z'],
    // Simple Note: cards in two columns.
    simple: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M4 13h7v7H4z', 'M13 10h7v10h-7z'],
    // Single Note: one page of writing.
    single: ['M6 3h9l3 3v15H6z', 'M9 10h6', 'M9 14h6', 'M9 18h4'],
    // Page: a title over blocks.
    page: ['M5 4h14', 'M5 9h6v6H5z', 'M14 9h5', 'M14 12h5', 'M5 19h14'],
    // Habit Tracker: a row of days, some ticked.
    habit: ['M3 8h4v4H3z', 'M10 8h4v4h-4z', 'M17 8h4v4h-4z', 'M4 10l1 1 1.5-2', 'M11 10l1 1 1.5-2', 'M4 17h16'],
    // Task: a list with ticks.
    task: ['M4 6l1.5 1.5L8 5', 'M11 6h9', 'M4 12l1.5 1.5L8 11', 'M11 12h9', 'M5 18h2', 'M11 18h9'],
    // Calendar: a page with a hanging top.
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5', 'M8 14h3v3H8z'],
    // Playlist: notes.
    playlist: ['M9 18V6l10-2v12', 'M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z']
  };

  $: paths = PATHS[mode] || ['M5 5h14v14H5z'];
</script>

<svg class="mode-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#each paths as d}<path {d} />{/each}
</svg>

<style>
  .mode-icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
