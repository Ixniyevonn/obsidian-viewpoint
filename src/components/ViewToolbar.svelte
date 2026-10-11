<!-- src/components/ViewToolbar.svelte -->
<script lang="ts">
  import { setIcon } from "obsidian";
  import type { UiStore } from "../stores/ui.svelte";

  interface Props {
    ui: UiStore;
  }

  const { ui }: Props = $props();

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

<div class="view-toolbar">
  <button type="button"
    class="toolbar-button"
    class:active={ui.hideUngrouped}
    aria-pressed={ui.hideUngrouped}
    onclick={() => (ui.hideUngrouped = !ui.hideUngrouped)}
    title={ui.hideUngrouped
      ? "Show ungrouped notes"
      : "Hide ungrouped notes"}
    aria-label={ui.hideUngrouped
      ? "Show ungrouped notes"
      : "Hide ungrouped notes"}
  >
    <span use:iconAction={ui.hideUngrouped ? "eye-off" : "eye"}></span>
  </button>
</div>

<style>
  .view-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-stationary);
    user-select: none;
    pointer-events: auto;
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    color: var(--text-faint);
    cursor: pointer;
    line-height: 1;
  }
  .toolbar-button:hover {
    color: var(--text-muted);
    background: var(--background-modifier-hover);
  }
  .toolbar-button.active {
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }
  .toolbar-button :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
