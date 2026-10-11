<!-- src/components/TagFilterMenu.svelte -->
<script lang="ts">
  import { setIcon } from "obsidian";
  import type { UiStore } from "../stores/ui.svelte";
  import { tagColorVariable, tagNameFromMarkdown } from "../utils/tags";

  interface Props {
    /** One raw tag text for each visible tag name. */
    tags: string[];
    ui: UiStore;
  }

  const { tags, ui }: Props = $props();

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

{#if tags.length > 0}
  <div class="tag-filter-menu">
    <div class="tag-filter-header">
      <span class="tag-filter-title">Tags</span>
      <button
        type="button"
        class="tag-filter-reset"
        class:visible={ui.hasTagFilters}
        title="Clear tag filters"
        aria-label="Clear tag filters"
        onclick={() => ui.clearTagFilters()}
      >
        <span use:iconAction={"rotate-ccw"}></span>
      </button>
    </div>
    <div class="tag-filter-list">
      {#each tags as tag (tag)}
        {@const name = tagNameFromMarkdown(tag)}
        {@const key = name.toLowerCase()}
        <button
          type="button"
          class="tag-filter-item"
          class:active={ui.activeTagFilters.has(key)}
          title={name}
          onclick={() => ui.toggleTagFilter(key)}
        >
          <span
            class="tag-filter-dot"
            style:background-color={`var(${tagColorVariable(tag)})`}
          ></span>
          <span class="tag-filter-name">{name}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .tag-filter-menu {
    display: flex;
    flex-direction: column;
    width: 180px;
    max-width: 60vw;
    max-height: 60vh;
    box-sizing: border-box;
    padding: 8px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-stationary);
    user-select: none;
    pointer-events: auto;
  }

  .tag-filter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 4px 6px;
  }

  .tag-filter-title {
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
  }

  .tag-filter-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    height: auto;
    min-height: 0;
    padding: 2px 4px;
    background: transparent;
    border: 1px solid transparent;
    box-shadow: none;
    border-radius: var(--radius-s);
    color: var(--text-faint);
    cursor: pointer;
    line-height: 1;
    visibility: hidden;
  }
  .tag-filter-reset.visible {
    visibility: visible;
  }
  .tag-filter-reset:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
  .tag-filter-reset :global(svg) {
    width: 14px;
    height: 14px;
  }

  .tag-filter-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
  }

  .tag-filter-item {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    height: auto;
    min-height: 0;
    padding: 3px 6px;
    border: none;
    box-shadow: none;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    text-align: left;
    cursor: pointer;
  }
  .tag-filter-item:hover {
    background: var(--background-modifier-hover);
  }
  .tag-filter-item.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .tag-filter-dot {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .tag-filter-item.active .tag-filter-dot {
    box-shadow: 0 0 0 2px var(--text-on-accent);
  }

  .tag-filter-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
