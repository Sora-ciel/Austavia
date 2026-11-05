<script>
  /**
   * A picture or a short video in a block. The frame -- where it sits, its
   * size, its colours, its header, dragging, resizing, focus -- is
   * BlockShell's, as for every block (moved onto it 2026-11-04, so that a page
   * can draw it without a frame: PENDING, "Page mode"). What is left here is
   * the picture: choosing it, fitting the block to it, and keeping its shape
   * while the block is resized (BlockShell's `aspect`).
   */
  import { getContext, createEventDispatcher } from 'svelte';
  import BlockShell from './BlockShell.svelte';

  const appDialogs = getContext('appDialogs');
  const dispatch = createEventDispatcher();

  export let id;
  export let initialPosition = { x: 100, y: 100 };
  export let initialSize = { width: 300, height: 200 };
  export let initialBgColor = '#ffffff';
  export let initialTextColor = '#ffffff';
  export let initialSrc = '';
  export let initialResolvedSrc = null;
  export let initialAttachmentRequiresAuth = false;
  export let focused = false;
  export let canvasScale = 1;
  export let placement = 'canvas';

  const HEADER_HEIGHT = 30;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  const DEFAULT_BLOCK_WIDTH = 300;
  const DEFAULT_BLOCK_HEIGHT = 200;
  const MAX_MEDIA_WIDTH = 400;
  const MAX_MEDIA_HEIGHT = 300;

  let shell;
  let size = { ...initialSize };
  let src = initialSrc;
  let resolvedSrc = initialResolvedSrc;
  let attachmentRequiresAuth = initialAttachmentRequiresAuth;
  let aspectRatio = size.width / (size.height - HEADER_HEIGHT);

  $: mediaSrc = typeof src === 'string' ? src : resolvedSrc || '';
  $: hasStorageAttachment = src && typeof src === 'object' && src.type === 'storage';
  let attemptedInitialAutoFit = false;

  const headerHeight = () => shell?.headerHeight() || HEADER_HEIGHT;

  /** The block fitted round media of this size, and saved. */
  function fitTo(naturalWidth, naturalHeight, keys, opts) {
    const { width, height } = getFittedMediaSize(naturalWidth, naturalHeight);
    aspectRatio = width / height;
    size = { width, height: height + headerHeight() };
    shell?.setSize(size);
    shell?.commit(keys, opts, { src });
  }

  async function onMediaChange(e) {
    shell?.ensureFocus();
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/') && file.size > MAX_VIDEO_BYTES) {
      await appDialogs.alert('Video files must be 100MB or smaller to render.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      src = reader.result;
      resolvedSrc = null;
      attachmentRequiresAuth = false;
      attemptedInitialAutoFit = true;

      if (!file.type.startsWith('video/')) {
        const img = new Image();
        img.src = src;
        img.onload = () => fitTo(img.width, img.height, ['src', 'size']);
      } else {
        const videoEl = document.createElement('video');
        videoEl.src = src;
        videoEl.onloadedmetadata = () => fitTo(videoEl.videoWidth, videoEl.videoHeight, ['src', 'size']);
      }
    };

    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function getFittedMediaSize(width, height) {
    if (!width || !height) {
      return { width: DEFAULT_BLOCK_WIDTH, height: DEFAULT_BLOCK_HEIGHT - HEADER_HEIGHT };
    }

    const naturalRatio = width / height;
    let targetWidth = MAX_MEDIA_WIDTH;
    let targetHeight = targetWidth / naturalRatio;

    if (targetHeight > MAX_MEDIA_HEIGHT) {
      targetHeight = MAX_MEDIA_HEIGHT;
      targetWidth = targetHeight * naturalRatio;
    }

    return { width: targetWidth, height: targetHeight };
  }

  function isAtDefaultSize() {
    return (
      Math.abs(size.width - DEFAULT_BLOCK_WIDTH) < 0.5 &&
      Math.abs(size.height - DEFAULT_BLOCK_HEIGHT) < 0.5
    );
  }

  function autoFitFromExistingSource() {
    if (!mediaSrc || attemptedInitialAutoFit || !isAtDefaultSize()) return;

    attemptedInitialAutoFit = true;
    const mediaLooksLikeVideo = mediaSrc.startsWith('data:video') || mediaSrc.endsWith('.mp4');

    if (mediaLooksLikeVideo) {
      const videoEl = document.createElement('video');
      videoEl.src = mediaSrc;
      videoEl.onloadedmetadata = () => fitTo(videoEl.videoWidth, videoEl.videoHeight, ['size'], { pushToHistory: false });
      return;
    }

    const img = new Image();
    img.src = mediaSrc;
    img.onload = () => fitTo(img.width, img.height, ['size'], { pushToHistory: false });
  }

  $: autoFitFromExistingSource();

  // Click on the media content:
  //   - When NOT focused: focus the block (next click will open lightbox)
  //   - When focused: open lightbox if there's a source
  function handleMediaClick() {
    if (!focused) {
      shell?.ensureFocus();
    } else if (mediaSrc) {
      dispatch('lightbox', { src: mediaSrc });
    }
  }
</script>

<BlockShell
  bind:this={shell}
  {id}
  {initialPosition}
  {initialSize}
  {initialBgColor}
  initialTextColor={initialTextColor || '#000000'}
  {focused}
  {canvasScale}
  {placement}
  label="image"
  minWidth={50}
  aspect={aspectRatio}
  fields={{ src }}
  on:update
  on:delete
  on:focusToggle
>
  <svelte:fragment slot="header-controls">
    <label title="Change Image" class="media-btn" data-focus-guard on:click|stopPropagation on:pointerdown|stopPropagation on:touchstart|stopPropagation>
      <input type="file" accept="image/*,video/mp4" on:change={onMediaChange} data-focus-guard />
      <span class="emoji" data-focus-guard>⏏</span>
    </label>
  </svelte:fragment>

  <div class="media-container">
    {#if mediaSrc}
      {#if mediaSrc.startsWith('data:video')}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-media-has-caption -->
        <video
          src={mediaSrc}
          class:clickable={true}
          autoplay loop muted playsinline
          on:click|stopPropagation={handleMediaClick}
        ></video>
      {:else}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <img
          src={mediaSrc}
          alt=""
          class:clickable={true}
          on:click|stopPropagation={handleMediaClick}
        />
      {/if}
    {:else if hasStorageAttachment}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777; text-align:center; padding: 8px;">
        {#if attachmentRequiresAuth}
          Sign in to view this attachment
        {:else}
          Attachment unavailable
        {/if}
      </div>
    {:else}
      <div style="flex-grow:1; display:flex; align-items:center; justify-content:center; color:#777;">
        No image loaded
      </div>
    {/if}
  </div>
</BlockShell>

<style>
  input[type="file"] {
    display: none;
  }

  .media-btn .emoji {
    display: inline-block;
    color: var(--block-media-button-text, var(--block-header-text, var(--text)));
    background: var(--block-media-button-bg, transparent);
    padding: 4px 6px;
    border-radius: var(--block-control-radius, 6px);
    cursor: pointer;
    font-size: 1.25rem;
  }

  .media-container {
    flex: 1 1 0;
    min-height: 0;
    position: relative;
  }

  /* Use absolute fill so height:100% resolves correctly regardless of parent sizing method */
  .media-container img,
  .media-container video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    cursor: default;
  }

  .media-container img.clickable,
  .media-container video.clickable {
    cursor: zoom-in;
  }
</style>
