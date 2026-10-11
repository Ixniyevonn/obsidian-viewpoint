<!-- src/components/TabBar.svelte -->
<script lang="ts">
  import type { ProjectStore } from "../stores/project.svelte";
  import type { UiStore } from "../stores/ui.svelte";
  import { flip } from "svelte/animate";
  import { setIcon } from "obsidian";

  interface Props {
    project: ProjectStore;
    ui: UiStore;
    onOpenDialog: (mode: "create" | "edit") => void;
    onEditDimension: (id: string) => void;
    onDimensionContextMenu: (id: string, e: MouseEvent) => void;
  }

  const {
    project,
    ui,
    onOpenDialog,
    onEditDimension,
    onDimensionContextMenu,
  }: Props = $props();

  const dimIds = $derived(Object.keys(project.project.dimensions));
  const dims = $derived(project.project.dimensions);

  let dragId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);

  /**
   * Start a tab drag.
   *
   * @param e - The drag event.
   * @param id - The ID of the dragged dimension.
   */
  function handleDragStart(e: DragEvent, id: string) {
    dragId = id;
    dragOverId = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  /**
   * Accept a drag over a tab and mark it as the drop target.
   *
   * @param e - The drag event.
   * @param id - The ID of the hovered dimension.
   */
  function handleDragOver(e: DragEvent, id: string) {
    if (!dragId || id === dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverId = id;
  }

  /** Clear the drop marker when the pointer leaves a tab. */
  function handleDragLeave(id: string) {
    if (dragOverId === id) dragOverId = null;
  }

  /**
   * Swap the dragged dimension with the drop target.
   *
   * @param e - The drag event.
   * @param id - The ID of the target dimension.
   */
  function handleDrop(e: DragEvent, id: string) {
    e.preventDefault();
    const from = dragId;
    dragId = null;
    dragOverId = null;
    if (from && from !== id) project.swapDimensions(from, id);
  }

  function handleDragEnd() {
    dragId = null;
    dragOverId = null;
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
</script>

<div class="tabbar">
  {#each dimIds as id (id)}
    {@const isActive = id === ui.activeDimensionId}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tab"
      class:active={isActive}
      class:drag-over={dragOverId === id}
      class:dragging={dragId === id}
      draggable="true"
      ondragstart={(e) => handleDragStart(e, id)}
      ondragover={(e) => handleDragOver(e, id)}
      ondragleave={() => handleDragLeave(id)}
      ondrop={(e) => handleDrop(e, id)}
      ondragend={handleDragEnd}
      animate:flip={{ duration: 180 }}
    >
      <button type="button"
        class="tab-label"
        draggable="true"
        onclick={() => (ui.activeDimensionId = id)}
        oncontextmenu={(e) => onDimensionContextMenu(id, e)}
      >
        {dims[id].name}
      </button>
      <div class="tab-edit-slot" aria-hidden={!isActive}>
        <button type="button"
          class="tab-edit"
          tabindex={isActive ? 0 : -1}
          onclick={() => onEditDimension(id)}
          title="Edit dimension"
          aria-label="Edit dimension"
        >
          <span use:iconAction={"pencil"}></span>
        </button>
      </div>
    </div>
  {/each}

  <button type="button"
    class="tabbar-add"
    onclick={() => onOpenDialog("create")}
    title="New dimension"
    aria-label="New dimension">+</button
  >
</div>

<style>
  .tabbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 4px;
    max-width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-stationary);
    user-select: none;
    pointer-events: auto;
  }

  .tab {
    display: grid;
    grid-template-columns: auto 0fr;
    align-items: center;
    border-radius: var(--radius-s);
    border: 1px solid transparent;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      grid-template-columns 180ms ease;
  }
  .tab.active {
    grid-template-columns: auto 1fr;
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }
  .tab.dragging {
    opacity: 0.4;
  }
  .tab.drag-over {
    outline: 2px solid var(--text-normal);
    outline-offset: 1px;
  }

  .tab-label {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: none;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    cursor: pointer;
    white-space: nowrap;
  }
  .tab:not(.active) .tab-label:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
  .tab.active .tab-label {
    color: var(--text-on-accent);
  }

  .tab-edit-slot {
    min-width: 0;
    overflow: hidden;
  }

  .tab-edit {
    display: flex;
    align-items: center;
    justify-content: center;
    height: auto;
    min-height: 0;
    padding: 4px 6px;
    margin-right: 2px;
    border: none;
    box-shadow: none;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-on-accent);
    cursor: pointer;
    line-height: 1;
    white-space: nowrap;
  }
  .tab-edit:hover {
    background: color-mix(in srgb, var(--text-on-accent) 22%, transparent);
  }
  .tab-edit :global(svg) {
    width: 14px;
    height: 14px;
  }

  .tabbar-add {
    padding: 4px 10px;
    margin-left: 4px;
    background: transparent;
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-faint);
    font-size: var(--font-ui-medium);
    cursor: pointer;
    line-height: 1;
  }
  .tabbar-add:hover {
    color: var(--text-muted);
    border-color: var(--text-faint);
  }
</style>
