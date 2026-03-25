<script lang="ts">
  import Node from "./Node.svelte";

  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    highlight?: boolean;
    selected?: boolean;
    draggable?: boolean;
    beingDragged?: boolean;
    onRename?: (newName: string) => void;
    onSelect?: (e: MouseEvent) => void;
    onDragStart?: (e: PointerEvent) => void;
  }

  const {
    x,
    y,
    width,
    height,
    name,
    highlight = false,
    selected = false,
    draggable = false,
    beingDragged = false,
    onRename,
    onSelect,
    onDragStart,
  }: Props = $props();

  let isEditing = $state(false);
  let editValue = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

  let didMove = false;
  let downX = 0;
  let downY = 0;
  const CLICK_THRESHOLD = 5;

  function handleBodyPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    didMove = false;
    downX = e.clientX;
    downY = e.clientY;

    if (draggable) {
      onDragStart?.(e);
    }
  }

  function handleBodyPointerMove(e: PointerEvent) {
    if (
      Math.abs(e.clientX - downX) > CLICK_THRESHOLD ||
      Math.abs(e.clientY - downY) > CLICK_THRESHOLD
    ) {
      didMove = true;
    }
  }

  function handleBodyClick(e: MouseEvent) {
    if (e.button !== 0 || didMove) return;
    e.stopPropagation();
    onSelect?.(e);
  }

  function handleLabelClick(e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect?.(e);
  }

  function startEdit(e: MouseEvent) {
    if (!onRename) return;
    e.stopPropagation();
    isEditing = true;
    editValue = name;
    requestAnimationFrame(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function commit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      onRename?.(trimmed);
    }
    isEditing = false;
  }

  function cancel() {
    isEditing = false;
  }

  function onKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      cancel();
    }
  }
</script>

<Node
  {width}
  {height}
  {x}
  {y}
  cssClass="node-group{highlight ? ' group-drop-target' : ''}{selected
    ? ' group-selected'
    : ''}{draggable ? ' group-draggable' : ''}{beingDragged
    ? ' group-being-dragged'
    : ''}"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="group-click-catcher"
    onpointerdown={handleBodyPointerDown}
    onpointermove={handleBodyPointerMove}
    onclick={handleBodyClick}
  ></div>

  {#if isEditing}
    <input
      bind:this={inputEl}
      bind:value={editValue}
      class="group-label-edit"
      onkeydown={onKeydown}
      onblur={commit}
      onclick={(e) => e.stopPropagation()}
      ondblclick={(e) => e.stopPropagation()}
    />
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="group-label" onclick={handleLabelClick} ondblclick={startEdit}>
      {name}
      {#if draggable}
        <span class="drag-indicator" title="Drag to reposition on spectrum"
          >⠿</span
        >
      {/if}
    </div>
  {/if}
</Node>

<style>
  :global(.node-group) {
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    background: var(--background-secondary);
    opacity: 0.5;
    pointer-events: none;
    transition:
      border-color 120ms ease,
      opacity 120ms ease,
      box-shadow 120ms ease;
  }
  :global(.node-group.group-drop-target) {
    border-color: var(--interactive-accent);
    opacity: 0.75;
    border-width: 2px;
  }
  :global(.node-group.group-selected) {
    border-color: var(--interactive-accent);
    opacity: 0.75;
    box-shadow:
      var(--shadow-stationary),
      0 0 0 2px var(--interactive-accent);
  }
  :global(.node-group.group-draggable) {
    cursor: grab;
  }
  :global(.node-group.group-being-dragged) {
    opacity: 0.25;
    pointer-events: none;
  }

  .group-click-catcher {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    cursor: default;
    z-index: 0;
  }

  :global(.node-group.group-draggable) .group-click-catcher {
    cursor: grab;
  }

  .group-label {
    position: relative;
    z-index: 1;
    padding: 8px 12px;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: auto;
    cursor: default;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drag-indicator {
    font-size: 14px;
    color: var(--text-faint);
    opacity: 0.5;
    cursor: grab;
  }

  .group-label-edit {
    position: relative;
    z-index: 1;
    margin: 8px 12px;
    padding: 0;
    font-size: 24px;
    font-weight: 700;
    font-family: inherit;
    color: var(--text-normal);
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--interactive-accent);
    border-radius: 0;
    outline: none;
    width: calc(100% - 24px);
    pointer-events: auto;
    box-sizing: border-box;
  }
</style>
