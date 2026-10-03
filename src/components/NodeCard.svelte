<script lang="ts">
  import type { App, Component } from "obsidian";
  import { setIcon } from "obsidian";
  import {
    MAX_NODE_WIDTH,
    MIN_NODE_WIDTH,
    type ProjectStore,
  } from "../stores/project.svelte";
  import type { UiStore } from "../stores/ui.svelte";
  import { snapNodeWidth } from "../utils/nodeWidth";
  import MarkdownContent from "./MarkdownContent.svelte";
  import Node from "./Node.svelte";
  import TagList from "./TagList.svelte";

  interface Props {
    width: number;
    columnWidths: number[];
    height: number;
    x: number;
    y: number;
    app: App;
    noteId: string;
    title: string;
    short: string;
    long: string;
    tags: string[];
    suggestions: string[];
    parentComponent: Component;
    ui: UiStore;
    project: ProjectStore;
    preview?: boolean;
    onMeasured?: (id: string, height: number) => void;
  }

  const {
    width,
    columnWidths,
    height,
    x,
    y,
    app,
    noteId,
    title,
    short,
    long,
    tags,
    suggestions,
    parentComponent,
    ui,
    project,
    preview = false,
    onMeasured,
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
  let hovered = $state(false);
  let tagEditing = $state(false);
  let tagTransitioning = $state(false);
  const tagExpanded = $derived(tags.length > 0 || hovered || tagEditing);
  const isBeingDragged = $derived(ui.draggingNodeId === noteId);

  let shortInputEl: HTMLTextAreaElement | undefined = $state();
  let editValue = $state("");
  let shortEditStyle = $state("");

  let isEditingTitle = $state(false);
  let titleEditValue = $state("");
  let titleInputEl: HTMLInputElement | undefined = $state();
  let titleWrapperEl: HTMLDivElement | undefined = $state();

  let dragTracking = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  const DRAG_THRESHOLD = 5;

  let isResizing = $state(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  // --- DOM height measurement ---
  let cardEl: HTMLDivElement | undefined = $state();

  /** After every render that could change content height, report actual DOM height */
  $effect(() => {
    if (!cardEl || !onMeasured) return;
    const element = cardEl;
    const report = () => {
      // Hover growth must not change the layout. Only measure the base card.
      if ((hovered || tagTransitioning) && !isEditingShort) return;
      onMeasured(noteId, element.offsetHeight + 4);
    };
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (isEditingShort && shortInputEl) {
      shortInputEl.focus();
      shortInputEl.select();
      autoResizeShort();
    }
  });

  $effect(() => {
    if (isEditingTitle && titleInputEl && titleWrapperEl) {
      titleInputEl.focus();
      titleInputEl.select();
    }
  });

  function captureH1Style() {
    if (!titleWrapperEl) return;
    const h2 = titleWrapperEl.querySelector("h2");
    if (!h2) return;
    const cs = getComputedStyle(h2);
    titleWrapperEl.style.setProperty("--h2-font-size", cs.fontSize);
    titleWrapperEl.style.setProperty("--h2-font-weight", cs.fontWeight);
    titleWrapperEl.style.setProperty("--h2-line-height", cs.lineHeight);
    titleWrapperEl.style.setProperty("--h2-font-family", cs.fontFamily);
    titleWrapperEl.style.setProperty("--h2-letter-spacing", cs.letterSpacing);
    titleWrapperEl.style.setProperty("--h2-min-height", cs.height);
  }

  /**
   * Copy the rendered short-description text style onto the edit textarea.
   *
   * The call runs before the editor replaces the rendered text. As a result,
   * the editor uses the same font metrics and does not move the layout.
   */
  function captureShortStyle() {
    if (!cardEl) return;
    const rendered =
      cardEl.querySelector<HTMLElement>(".short-text .markdown-rendered p") ??
      cardEl.querySelector<HTMLElement>(".short-text .markdown-rendered");
    const placeholder = cardEl.querySelector<HTMLElement>(
      ".short-text .short-placeholder",
    );
    const target =
      rendered ??
      placeholder ??
      cardEl.querySelector<HTMLElement>(".short-text");
    if (!target) return;
    const cs = getComputedStyle(target);
    const parts = [
      `font-size:${cs.fontSize}`,
      `font-family:${cs.fontFamily}`,
      `line-height:${cs.lineHeight}`,
    ];
    if (target !== placeholder) {
      parts.push(`font-weight:${cs.fontWeight}`);
      parts.push(`letter-spacing:${cs.letterSpacing}`);
    }
    shortEditStyle = parts.join(";");
  }

  function autoResizeShort() {
    if (!shortInputEl) return;
    shortInputEl.style.height = "auto";
    const borderHeight = shortInputEl.offsetHeight - shortInputEl.clientHeight;
    shortInputEl.style.height = shortInputEl.scrollHeight + borderHeight + "px";
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
  }

  function handleShortClick(e: MouseEvent) {
    if (e.button !== 0 || isConnectingMode || isRetargeting) return;
    e.stopPropagation();
  }

  function handleShortDblClick(e: MouseEvent) {
    if (e.button !== 0 || isConnectingMode || isRetargeting) return;
    e.stopPropagation();
    startShortEdit();
  }

  function startShortEdit() {
    captureShortStyle();
    editValue = short;
    ui.editingShortId = noteId;
  }

  /** Draw an Obsidian icon inside an element. */
  function iconAction(node: HTMLElement, icon: string) {
    setIcon(node, icon);
    return {
      update(next: string) {
        setIcon(node, next);
      },
    };
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
    titleEditValue = title;
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
    e.stopPropagation();
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    e.preventDefault();
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
    if (e.button !== 0) return;

    if (!isConnectingMode && !isRetargeting) {
      ui.clearPendingDelete();
      ui.selectNode(noteId, e.shiftKey || e.ctrlKey || e.metaKey);
    }

    if (
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

  // --- Resize ---

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
    const vp = cardEl?.closest(".canvas-viewport") as HTMLElement;
    const zoom = vp
      ? parseFloat(vp.style.getPropertyValue("--zoom") || "1")
      : 1;
    const dx = (e.clientX - resizeStartX) / zoom;
    const newWidth = Math.max(
      MIN_NODE_WIDTH,
      Math.min(MAX_NODE_WIDTH, resizeStartWidth + dx),
    );
    project.updateNoteWidth(
      noteId,
      snapNodeWidth(newWidth, columnWidths, zoom),
    );
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
    : ''}{isRetargetAnchor ? ' connecting-source' : ''}{isBeingDragged &&
  !preview
    ? ' dragging'
    : ''}{preview ? ' preview' : ''}{preview && isBeingDragged
    ? ' preview-active'
    : ''}"
  onclick={handleClick}
  ondblclick={handleDblClick}
  oncontextmenu={handleContextMenu}
  onauxclick={handleAuxClick}
  onpointerdown={handlePointerDown}
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
>
  <div class="node-card-inner" bind:this={cardEl}>
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
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <h2 onclick={handleClick} ondblclick={handleTitleDblClick}>{title}</h2>
        {#if !short && !preview}
          <button
            type="button"
            class="title-description-add"
            title="Add description"
            aria-label="Add description"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={(e) => {
              e.stopPropagation();
              startShortEdit();
            }}
          >
            <span use:iconAction={"pencil"}></span>
          </button>
        {/if}
      {/if}
    </div>

    {#if short || isEditingShort}
      <div class="node-body">
        {#if isEditingShort}
          <textarea
            bind:this={shortInputEl}
            bind:value={editValue}
            class="short-edit"
            rows="1"
            style={shortEditStyle}
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
            ondblclick={handleShortDblClick}
          >
            <MarkdownContent
              {app}
              markdown={short}
              sourcePath={project.sourcePath}
              {parentComponent}
            />
          </div>
        {/if}
      </div>
    {/if}

    <div
      class="tag-row"
      class:expanded={tagExpanded}
      class:revealed={tagExpanded && !tagTransitioning}
      class:editing={tagEditing}
      ontransitionstart={(e) => {
        if (e.target === e.currentTarget) tagTransitioning = true;
      }}
      ontransitionend={(e) => {
        if (e.target === e.currentTarget) tagTransitioning = false;
      }}
    >
      <div class="tag-row-inner">
        <TagList
          {tags}
          {suggestions}
          {app}
          sourcePath={project.sourcePath}
          {parentComponent}
          onAdd={(tag) => project.addNoteTag(noteId, tag)}
          onRemove={(index) => project.removeNoteTag(noteId, index)}
          onEditingChange={(value) => (tagEditing = value)}
        />
      </div>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="resize-handle"
    title="Drag to resize; double-click for automatic width"
    onpointerdown={handleResizePointerDown}
    ondblclick={(e) => {
      e.stopPropagation();
      project.updateNoteWidth(noteId, undefined);
    }}
  ></div>
</Node>

<style>
  :global(.node-card) {
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

  :global(.node-card.preview) {
    border-color: transparent;
    outline: 2px dashed var(--interactive-accent);
    outline-offset: -2px;
    opacity: 0.35;
    pointer-events: none;
  }

  :global(.node-card.preview.preview-active) {
    outline-style: solid;
    opacity: 1;
  }

  .node-card-inner {
    padding: 8px 16px 8px;
    display: flex;
    flex-direction: column;
    overflow-wrap: anywhere;
  }

  .node-body {
    margin-top: 8px;
  }

  .tag-row {
    display: grid;
    grid-template-rows: 0fr;
    margin-top: 0;
    transition:
      grid-template-rows 150ms ease,
      margin-top 150ms ease;
  }

  .tag-row.expanded {
    grid-template-rows: 1fr;
    margin-top: 8px;
  }

  .tag-row-inner {
    min-height: 0;
    overflow: hidden;
  }

  .tag-row.revealed .tag-row-inner,
  .tag-row.editing .tag-row-inner {
    overflow: visible;
  }

  :global(.node-card:hover) {
    border-color: var(--text-faint);
    z-index: 5;
  }

  :global(.node-card.selected) {
    border-color: var(--interactive-accent);
    background-color: color-mix(
      in srgb,
      var(--interactive-accent) 10%,
      var(--background-primary)
    );
    outline: 2px solid var(--interactive-accent);
    outline-offset: 1px;
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

  .node-title {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .node-title h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
  }

  .title-description-add {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 100ms ease;
    box-shadow: none;
  }

  .title-description-add :global(svg) {
    width: 14px;
    height: 14px;
  }

  :global(.node-card:hover) .title-description-add,
  .title-description-add:focus-visible {
    opacity: 0.7;
    pointer-events: auto;
  }

  .title-description-add:hover {
    color: var(--text-normal);
    opacity: 1;
  }

  .title-edit {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    box-shadow: inset 0 -2px 0 var(--interactive-accent);
    background: transparent;
    color: var(--text-normal);
    outline: none;
    box-sizing: border-box;
    font-size: var(--h2-font-size, 2em);
    font-weight: var(--h2-font-weight, 700);
    line-height: var(--h2-line-height, 1.2);
    font-family: var(--h2-font-family, inherit);
    letter-spacing: var(--h2-letter-spacing, normal);
    min-height: var(--h2-min-height, auto);
  }

  .node-body {
    min-height: 1.2em;
  }

  .short-text {
    cursor: default;
    min-height: 1.2em;
  }

  .short-text :global(.markdown-rendered > :first-child),
  .short-text :global(.markdown-rendered > div > :first-child) {
    margin-top: 0;
  }

  .short-text :global(.markdown-rendered > :last-child),
  .short-text :global(.markdown-rendered > div > :last-child) {
    margin-bottom: 0;
  }

  .short-edit {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-normal);
    font-family: inherit;
    font-size: inherit;
    line-height: var(--line-height-normal, 1.5);
    resize: none;
    outline: 1px solid var(--interactive-accent);
    outline-offset: 1px;
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
