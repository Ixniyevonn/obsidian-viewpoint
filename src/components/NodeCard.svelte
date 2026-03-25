<script lang="ts">
  import type { App, Component } from "obsidian";
  import type { ProjectStore } from "../stores/project.svelte";
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

  // --- Drag state (local, before committing to ui store) ---
  let dragTracking = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  const DRAG_THRESHOLD = 5;

  $effect(() => {
    if (isEditingShort && shortInputEl) {
      editValue = short;
      requestAnimationFrame(() => {
        shortInputEl?.focus();
        shortInputEl?.select();
      });
    }
  });

  function handleClick(e: MouseEvent) {
    if (e.button !== 0) return;

    // Retarget mode: complete retarget to this node
    if (isRetargeting && !isRetargetAnchor) {
      e.stopPropagation();
      const rDimId = ui.retargetDimId;
      const rIdx = ui.retargetIndex;
      const rEnd = ui.retargetEnd;
      const rAnchor = ui.retargetAnchorId;
      const rLabel = ui.retargetLabel;
      if (
        rDimId !== null &&
        rIdx !== null &&
        rEnd !== null &&
        rAnchor !== null
      ) {
        project.removeConnection(rDimId, rIdx);
        if (rEnd === "target") {
          project.addConnection(rDimId, rAnchor, noteId, rLabel);
        } else {
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

    // Connection mode: complete connection
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
    // Left button: start tracking for potential drag
    if (
      e.button === 0 &&
      !isConnectingMode &&
      !isRetargeting &&
      !isEditingShort
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
      // Commit to drag mode
      ui.startDrag(noteId, ui.cursorWorldX, ui.cursorWorldY);
      // Now the GraphEditor handles pointermove/pointerup for the ghost
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
  <h1>{title}</h1>

  {#if isEditingShort}
    <!-- svelte-ignore a11y_autofocus -->
    <textarea
      bind:this={shortInputEl}
      bind:value={editValue}
      class="short-edit"
      onkeydown={handleShortKeydown}
      onblur={handleShortBlur}
      onclick={(e) => e.stopPropagation()}
      ondblclick={(e) => e.stopPropagation()}
      rows="2"
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
</Node>

<style>
  :global(.node-card) {
    padding: 8px 16px;
    background-color: var(--background-primary);
    border-radius: var(--radius-m);
    border: 2px solid rgb(var(--canvas-color));
    box-shadow: var(--shadow-stationary);
    cursor: default;
    user-select: none;
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

  .short-text {
    cursor: text;
    min-height: 1em;
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
    resize: vertical;
    outline: none;
  }
</style>
