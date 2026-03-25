<!-- src/components/AxisSwitcher.svelte -->
<script lang="ts">
  import type { ProjectStore } from "../stores/project.svelte";
  import type { UiStore } from "../stores/ui.svelte";
  import { generateId } from "../utils/helpers";

  interface Props {
    project: ProjectStore;
    ui: UiStore;
  }

  const { project, ui }: Props = $props();

  /** Maximum number of dimension pills shown in the switcher. */
  const MAX_VISIBLE_DIMS = 10;

  const dimIds = $derived(Object.keys(project.project.dimensions));
  const dims = $derived(project.project.dimensions);
  const visibleIds = $derived(dimIds.slice(0, MAX_VISIBLE_DIMS));

  // --- creation state ---
  let newName = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

  function startCreate() {
    ui.creatingDimension = true;
    newName = "";
    requestAnimationFrame(() => inputEl?.focus());
  }

  function confirmCreate() {
    const name = newName.trim();
    if (!name) {
      ui.creatingDimension = false;
      return;
    }
    const id = generateId("dim");
    project.addDimension(id, name);
    ui.activeDimensionId = id;
    ui.creatingDimension = false;
    newName = "";
  }

  function cancelCreate() {
    ui.creatingDimension = false;
    newName = "";
  }

  function onInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") confirmCreate();
    else if (e.key === "Escape") cancelCreate();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Tab" && !e.altKey && !e.shiftKey) {
      if (e.ctrlKey) {
        e.preventDefault();
        ui.cycle(dimIds, -1);
      } else {
        e.preventDefault();
        ui.cycle(dimIds, 1);
      }
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="axis-switcher">
  {#each visibleIds as id (id)}
    {@const isActive = id === ui.activeDimensionId}
    <button
      class="axis-pill"
      class:active={isActive}
      onclick={() => (ui.activeDimensionId = id)}
    >
      {dims[id].name}
    </button>
  {/each}

  {#if dimIds.length > MAX_VISIBLE_DIMS}
    <span
      class="axis-overflow"
      title="{dimIds.length - MAX_VISIBLE_DIMS} more dimensions not shown"
    >
      +{dimIds.length - MAX_VISIBLE_DIMS}
    </span>
  {/if}

  {#if ui.creatingDimension}
    <input
      bind:this={inputEl}
      bind:value={newName}
      class="axis-input"
      placeholder="Dimension name…"
      onkeydown={onInputKeydown}
      onblur={cancelCreate}
    />
  {:else}
    <button class="axis-add" onclick={startCreate} title="New dimension"
      >+</button
    >
  {/if}
</div>

<style>
  .axis-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    position: absolute;
    top: 8px;
    left: 50%;
    translate: -50% 0;
    z-index: 10;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-stationary);
    user-select: none;
  }

  .axis-pill {
    padding: 4px 14px;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    cursor: pointer;
    white-space: nowrap;
    transition: all 120ms ease;
  }
  .axis-pill:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
  .axis-pill.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 600;
    border-color: var(--interactive-accent);
  }

  .axis-overflow {
    padding: 4px 8px;
    color: var(--text-faint);
    font-size: var(--font-ui-small);
    cursor: default;
  }

  .axis-add {
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
  .axis-add:hover {
    color: var(--text-muted);
    border-color: var(--text-faint);
  }

  .axis-input {
    padding: 4px 10px;
    border: 1px solid var(--interactive-accent);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    width: 140px;
    outline: none;
  }
</style>
