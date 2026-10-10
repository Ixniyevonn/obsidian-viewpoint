<!-- src/components/AxisSwitcher.svelte -->
<script lang="ts">
  import type { ProjectStore } from "../stores/project.svelte";
  import type { UiStore } from "../stores/ui.svelte";
  import { setIcon } from "obsidian";

  interface Props {
    project: ProjectStore;
    ui: UiStore;
    onOpenDialog: (mode: "create" | "edit") => void;
  }

  const { project, ui, onOpenDialog }: Props = $props();

  const MAX_VISIBLE_DIMS = 10;

  const dimIds = $derived(Object.keys(project.project.dimensions));
  const dims = $derived(project.project.dimensions);
  const visibleIds = $derived(dimIds.slice(0, MAX_VISIBLE_DIMS));

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

<div class="axis-switcher">
  {#each visibleIds as id (id)}
    {@const isActive = id === ui.activeDimensionId}
    <button type="button"
      class="axis-pill"
      class:active={isActive}
      onclick={() => (ui.activeDimensionId = id)}
    >
      {dims[id].name}
      {#if dims[id]["x-spectrum"] || dims[id]["y-spectrum"]}
        <span class="spectrum-badge" title="Has spectrum">◈</span>
      {/if}
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

  {#if ui.activeDimensionId}
    <button type="button"
      class="axis-edit"
      onclick={() => onOpenDialog("edit")}
      title="Edit dimension">✎</button
    >
  {/if}

  <button type="button"
    class="axis-toggle"
    class:active={ui.hideUngrouped}
    aria-pressed={ui.hideUngrouped}
    onclick={() => (ui.hideUngrouped = !ui.hideUngrouped)}
    title={ui.hideUngrouped
      ? "Show ungrouped notes"
      : "Hide ungrouped notes"}>
    <span use:iconAction={ui.hideUngrouped ? "eye-off" : "eye"}></span>
  </button>

  <button type="button"
    class="axis-add"
    onclick={() => onOpenDialog("create")}
    title="New dimension">+</button
  >
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
    display: flex;
    align-items: center;
    gap: 4px;
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

  .spectrum-badge {
    font-size: 10px;
    opacity: 0.7;
  }

  .axis-overflow {
    padding: 4px 8px;
    color: var(--text-faint);
    font-size: var(--font-ui-small);
    cursor: default;
  }

  .axis-edit {
    padding: 4px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    color: var(--text-faint);
    font-size: var(--font-ui-small);
    cursor: pointer;
    line-height: 1;
  }
  .axis-edit:hover {
    color: var(--text-muted);
    background: var(--background-modifier-hover);
  }

  .axis-toggle {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    color: var(--text-faint);
    cursor: pointer;
    line-height: 1;
  }
  .axis-toggle:hover {
    color: var(--text-muted);
    background: var(--background-modifier-hover);
  }
  .axis-toggle.active {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }
  .axis-toggle :global(svg) {
    width: 16px;
    height: 16px;
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
</style>
