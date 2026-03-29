<script lang="ts">
  import type { App, Component } from "obsidian";
  import {
    MAX_NODE_WIDTH,
    MIN_NODE_WIDTH,
    type ProjectStore,
  } from "../stores/project.svelte";
  import type { UiStore } from "../stores/ui.svelte";
  import MarkdownContent from "./MarkdownContent.svelte";
  import Node from "./Node.svelte";

  interface Props {
    width: number;
    height: number;
    x: number;
    y: number;
    app: App;
    noteId: string;
    title: string;
    short: string;
    long: string;
    parentComponent: Component;
    ui: UiStore;
    project: ProjectStore;
  }

  const {
    width,
    height,
    x,
    y,
    app,
    noteId,
    title,
    short,
    long,
    parentComponent,
    ui,
    project,
  }: Props = $props();

  const isSelected = $derived(ui.isSelected(noteId));
  const isFocused = $derived(
    ui.focusPrimaryId === noteId || ui.focusSecondaryId === noteId,
  );
  const isConnectingSource = $derived(ui.connectingFromId === noteId);
  const isConnectingMode = $derived(ui.connectingFromId !== null);
  const isRetargeting = $derived(ui.isRetargeting);
  const isRetargetAnchor = $derived(ui.retargetAnchorId === noteId);
  const isEditingShort = $derived(ui.editingShortId === noteId);
  const isBeingDragged = $derived(ui.draggingNodeId === noteId);

  let shortInputEl: HTMLTextAreaElement | undefined = $state();
  let editValue = $state("");

  // --- Title editing ---
  let isEditingTitle = $state(false);
  let titleEditValue = $state("");
  let titleInputEl: HTMLInputElement | undefined = $state();
  let titleWrapperEl: HTMLDivElement | undefined = $state();

  // --- Drag state ---
  let dragTracking = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  const DRAG_THRESHOLD = 5;

  // --- Resize state ---
  let isResizing = $state(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  $effect(() => {
    if (isEditingShort && shortInputEl) {
      editValue = short;
      requestAnimationFrame(() => {
        shortInputEl?.focus();
        shortInputEl?.select();
        autoResizeShort();
      });
    }
  });

  $effect(() => {
    if (isEditingTitle && titleInputEl && titleWrapperEl) {
      titleEditValue = title;
      requestAnimationFrame(() => {
        titleInputEl?.focus();
        titleInputEl?.select();
      });
    }
  });

  function captureH1Style() {
    if (!titleWrapperEl) return;
    const h1 = titleWrapperEl.querySelector("h1");
    if (!h1) return;
    const cs = getComputedStyle(h1);
    titleWrapperEl.style.setProperty("--h1-font-size", cs.fontSize);
    titleWrapperEl.style.setProperty("--h1-font-weight", cs.fontWeight);
    titleWrapperEl.style.setProperty("--h1-line-height", cs.lineHeight);
    titleWrapperEl.style.setProperty("--h1-font-family", cs.fontFamily);
    titleWrapperEl.style.setProperty("--h1-letter-spacing", cs.letterSpacing);
    titleWrapperEl.style.setProperty("--h1-min-height", cs.height);
  }

  function autoResizeShort() {
    if (!shortInputEl) return;
    shortInputEl.style.height = "auto";
    shortInputEl.style.height = shortInputEl.scrollHeight + "px";
  }

  function handleClick(e: MouseEvent) {
    if (e.button !== 0) return;

    if (isRetargeting && !isRetargetAnchor) {
      e.stopPropagation();
      const rDimId = ui.retargetDimId;
      const rEnd = ui.retargetEnd;
      const rAnchor = ui.retargetAnchorId;
      const rOriginalId = ui.retargetOriginalId;
      const rLabel = ui.retargetLabel;

      if (rDimId && rEnd && rAnchor && rOriginalId !== null) {
        if (rEnd === "target") {
          project.removeConnection(rDimId, rAnchor, rOriginalId);
          project.addConnection(rDimId, rAnchor, noteId, rLabel);
        } else {
          project.removeConnection(rDimId, rOriginalId, rAnchor);
          project.addConnection(rDimId, noteId, rAnchor, rLabel);
        }
      }
      ui.completeRetarget();
      return;
    }

    if (isRetargeting && isRetargetAnchor) {
      e.stopPropagation();
      ui.cancelRetarget();
      return;
    }

    if (isConnectingMode && ui.connectingFromId !== noteId) {
      e.stopPropagation();
      if (ui.activeDimensionId) {
        project.addConnection(
          ui.activeDimensionId,
          ui.connectingFromId!,
          noteId,
        );
      }
      ui.completeConnection();
      return;
    }

    if (isConnectingMode && ui.connectingFromId === noteId) {
      e.stopPropagation();
      ui.cancelConnection();
      return;
    }

    e.stopPropagation();
    ui.clearPendingDelete();

    if (e.shiftKey) {
      ui.selectNode(noteId, true);
      return;
    }

    ui.selectNode(noteId, false);
  }

  function handleShortClick(e: MouseEvent) {
    if (e.button !== 0 || isConnectingMode || isRetargeting) return;
    e.stopPropagation();
    if (!e.shiftKey) {
      ui.selectNode(noteId, false);
    }
    ui.editingShortId = noteId;
  }

  function handleDblClick(e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ui.editingLongId = noteId;
  }

  function handleTitleDblClick(e: MouseEvent) {
    if (e.button !== 0 || isConnectingMode || isRetargeting) return;
    e.stopPropagation();
    captureH1Style();
    isEditingTitle = true;
  }

  function commitTitleEdit() {
    const trimmed = titleEditValue.trim();
    if (trimmed && trimmed !== title) {
      project.updateNodeTitle(noteId, trimmed);
    }
    isEditingTitle = false;
  }

  function cancelTitleEdit() {
    isEditingTitle = false;
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitleEdit();
    } else if (e.key === "Escape") {
      cancelTitleEdit();
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    ui.startConnection(noteId);
  }

  function handleAuxClick(e: MouseEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      ui.setDualFocus(noteId);
    } else {
      ui.setFocus(noteId);
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.button === 1) {
      e.preventDefault();
      return;
    }
    if (
      e.button === 0 &&
      !isConnectingMode &&
      !isRetargeting &&
      !isEditingShort &&
      !isEditingTitle &&
      !isResizing
    ) {
      dragTracking = true;
      dragStartClientX = e.clientX;
      dragStartClientY = e.clientY;
      window.addEventListener("pointermove", onDragPointerMove);
      window.addEventListener("pointerup", onDragPointerUp);
    }
  }

  function onDragPointerMove(e: PointerEvent) {
    if (!dragTracking) return;
    const dx = e.clientX - dragStartClientX;
    const dy = e.clientY - dragStartClientY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
      dragTracking = false;
      ui.startDrag(noteId, ui.cursorWorldX, ui.cursorWorldY);
      window.removeEventListener("pointermove", onDragPointerMove);
      window.removeEventListener("pointerup", onDragPointerUp);
    }
  }

  function onDragPointerUp(_e: PointerEvent) {
    dragTracking = false;
    window.removeEventListener("pointermove", onDragPointerMove);
    window.removeEventListener("pointerup", onDragPointerUp);
  }

  function commitShortEdit() {
    const trimmed = editValue.trim();
    if (trimmed !== short) {
      project.updateNoteShort(noteId, trimmed);
    }
    ui.editingShortId = null;
  }

  function cancelShortEdit() {
    ui.editingShortId = null;
  }

  function handleShortKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitShortEdit();
    } else if (e.key === "Escape") {
      cancelShortEdit();
    }
    e.stopPropagation();
  }

  function handleShortBlur() {
    commitShortEdit();
  }

  // --- Resize handle ---

  function handleResizePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = width;
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", onResizeUp);
  }

  function onResizeMove(e: PointerEvent) {
    if (!isResizing) return;
    // Account for canvas zoom: 1 CSS pixel of mouse movement = 1/zoom world pixels
    const vp = document.querySelector(".canvas-viewport") as HTMLElement;
    const zoom = vp
      ? parseFloat(vp.style.getPropertyValue("--zoom") || "1")
      : 1;
    const dx = (e.clientX - resizeStartX) / zoom;
    const newWidth = Math.max(
      MIN_NODE_WIDTH,
      Math.min(MAX_NODE_WIDTH, resizeStartWidth + dx),
    );
    project.updateNoteWidth(noteId, newWidth);
  }

  function onResizeUp(_e: PointerEvent) {
    isResizing = false;
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeUp);
  }
</script>

<Node
  {width}
  {height}
  {x}
  {y}
  cssClass="node-card{isSelected ? ' selected' : ''}{isFocused
    ? ' focused'
    : ''}{isConnectingSource ? ' connecting-source' : ''}{isConnectingMode &&
  !isConnectingSource
    ? ' connect-target'
    : ''}{isRetargeting && !isRetargetAnchor
    ? ' connect-target'
    : ''}{isRetargetAnchor ? ' connecting-source' : ''}{isBeingDragged
    ? ' dragging'
    : ''}"
  onclick={handleClick}
  ondblclick={handleDblClick}
  oncontextmenu={handleContextMenu}
  onauxclick={handleAuxClick}
  onpointerdown={handlePointerDown}
>
  <div class="node-title" bind:this={titleWrapperEl}>
    {#if isEditingTitle}
      <input
        bind:this={titleInputEl}
        bind:value={titleEditValue}
        class="title-edit"
        onkeydown={handleTitleKeydown}
        onblur={commitTitleEdit}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <h1 ondblclick={handleTitleDblClick}>{title}</h1>
    {/if}
  </div>

  <div class="node-body">
    {#if isEditingShort}
      <textarea
        bind:this={shortInputEl}
        bind:value={editValue}
        class="short-edit"
        onkeydown={handleShortKeydown}
        onblur={handleShortBlur}
        oninput={autoResizeShort}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
      ></textarea>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="short-text"
        onclick={handleShortClick}
        ondblclick={(e) => e.stopPropagation()}
      >
        {#if short}
          <MarkdownContent {app} markdown={short} {parentComponent} />
        {:else}
          <span class="short-placeholder">Click to add description…</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Resize handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onpointerdown={handleResizePointerDown}></div>
</Node>

<style>
  :global(.node-card) {
    padding: 8px 16px 12px;
    background-color: var(--background-primary);
    border-radius: var(--radius-m);
    border: 2px solid rgb(var(--canvas-color));
    box-shadow: var(--shadow-stationary);
    cursor: default;
    user-select: none;
    position: relative;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  :global(.node-card:hover) {
    border-color: var(--text-faint);
  }

  :global(.node-card.selected) {
    border-color: var(--interactive-accent);
    box-shadow:
      var(--shadow-stationary),
      0 0 0 2px var(--interactive-accent);
  }

  :global(.node-card.focused) {
    border-color: var(--color-yellow);
    box-shadow:
      var(--shadow-stationary),
      0 0 0 2px var(--color-yellow);
  }

  :global(.node-card.selected.focused) {
    border-color: var(--color-yellow);
    box-shadow:
      var(--shadow-stationary),
      0 0 0 2px var(--color-yellow),
      0 0 0 4px var(--interactive-accent);
  }

  :global(.node-card.connecting-source) {
    border-color: var(--color-green);
    box-shadow:
      var(--shadow-stationary),
      0 0 0 2px var(--color-green);
  }

  :global(.node-card.connect-target) {
    cursor: crosshair;
  }

  :global(.node-card.connect-target:hover) {
    border-color: var(--color-green);
  }

  :global(.node-card:active) {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-stationary), var(--shadow-border-accent);
  }

  :global(.node-card.dragging) {
    opacity: 0.3;
    pointer-events: none;
  }

  .node-title h1 {
    margin: 0;
    padding: 0;
  }

  .title-edit {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    border-bottom: 2px solid var(--interactive-accent);
    border-radius: 0;
    background: transparent;
    color: var(--text-normal);
    outline: none;
    box-sizing: border-box;
    font-size: var(--h1-font-size, 2em);
    font-weight: var(--h1-font-weight, 700);
    line-height: var(--h1-line-height, 1.2);
    font-family: var(--h1-font-family, inherit);
    letter-spacing: var(--h1-letter-spacing, normal);
    min-height: var(--h1-min-height, auto);
  }

  .node-body {
    min-height: 1.2em;
  }

  .short-text {
    cursor: text;
    min-height: 1.2em;
  }

  .short-placeholder {
    color: var(--text-faint);
    font-style: italic;
    font-size: var(--font-ui-small);
  }

  .short-edit {
    width: 100%;
    padding: 4px;
    border: 1px solid var(--interactive-accent);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    font-family: inherit;
    resize: none;
    outline: none;
    overflow: hidden;
    box-sizing: border-box;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: var(--interactive-accent);
    opacity: 0.3;
    border-radius: 0 var(--radius-m) var(--radius-m) 0;
  }
</style>
