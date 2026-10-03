<script lang="ts">
  import type { App, Component } from "obsidian";
  import { tagColorVariable, tagNameFromMarkdown } from "../utils/tags";
  import MarkdownContent from "./MarkdownContent.svelte";

  interface Props {
    tags: string[];
    suggestions: string[];
    app: App;
    sourcePath: string;
    parentComponent: Component;
    onAdd: (tag: string) => void;
    onRemove: (index: number) => void;
  }

  const {
    tags,
    suggestions,
    app,
    sourcePath,
    parentComponent,
    onAdd,
    onRemove,
  }: Props = $props();

  const SUGGESTION_LIMIT = 8;

  let isEditing = $state(false);
  let query = $state("");
  let highlight = $state(-1);
  let inputEl: HTMLInputElement | undefined = $state();

  const filtered = $derived.by(() => {
    const needle = tagNameFromMarkdown(query).toLowerCase();
    return suggestions
      .filter((tag) =>
        tagNameFromMarkdown(tag).toLowerCase().includes(needle),
      )
      .slice(0, SUGGESTION_LIMIT);
  });

  $effect(() => {
    if (isEditing && inputEl) inputEl.focus();
  });

  function startAdd() {
    isEditing = true;
    query = "";
    highlight = -1;
  }

  function close() {
    isEditing = false;
    query = "";
    highlight = -1;
  }

  function addTag(raw: string) {
    const text = raw.trim();
    if (!text) return;
    onAdd(text);
    query = "";
    highlight = -1;
  }

  function commitQuery() {
    const text = query.trim();
    if (!text) {
      close();
      return;
    }
    const name = tagNameFromMarkdown(text).toLowerCase();
    const isPlain = tagNameFromMarkdown(text) === text;
    const match = isPlain
      ? suggestions.find(
          (tag) => tagNameFromMarkdown(tag).toLowerCase() === name,
        )
      : undefined;
    addTag(match ?? text);
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight = Math.min(highlight + 1, filtered.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight = Math.max(highlight - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && filtered[highlight]) addTag(filtered[highlight]);
      else commitQuery();
    } else if (e.key === "Tab" && filtered.length) {
      e.preventDefault();
      addTag(filtered[Math.max(highlight, 0)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function handleBlur() {
    if (isEditing) commitQuery();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tag-list" onpointerdown={(e) => e.stopPropagation()}>
  {#each tags as tag, index (index)}
    <div
      class="tag-chip"
      style={`--tag-color: var(${tagColorVariable(tag)})`}
    >
      <MarkdownContent {app} markdown={tag} {sourcePath} {parentComponent} />
      <button
        class="tag-remove"
        type="button"
        title="Remove tag"
        aria-label="Remove tag"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
      >
        ×
      </button>
    </div>
  {/each}

  {#if isEditing}
    <div class="tag-input-wrapper">
      <input
        bind:this={inputEl}
        class="tag-input"
        bind:value={query}
        placeholder="Tag name"
        oninput={() => (highlight = -1)}
        onkeydown={handleKeydown}
        onblur={handleBlur}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
        oncontextmenu={(e) => e.stopPropagation()}
      />
      {#if filtered.length}
        <div
          class="tag-suggestions"
          onpointerdown={(e) => e.stopPropagation()}
        >
          {#each filtered as suggestion, index (suggestion)}
            <button
              type="button"
              class="tag-suggestion{index === highlight ? ' active' : ''}"
              onmousedown={(e) => e.preventDefault()}
              onclick={(e) => {
                e.stopPropagation();
                addTag(suggestion);
              }}
            >
              {tagNameFromMarkdown(suggestion)}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <button
      class="tag-add"
      type="button"
      title="Add tag"
      aria-label="Add tag"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => {
        e.stopPropagation();
        startAdd();
      }}
    >
      +
    </button>
  {/if}
</div>

<style>
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    padding: 1px 4px 1px 6px;
    border: 1px solid var(--tag-color);
    border-radius: var(--radius-s);
    background: color-mix(in srgb, var(--tag-color) 16%, transparent);
    font-size: var(--font-ui-smaller);
    line-height: 1.7;
  }

  .tag-chip :global(.markdown-rendered),
  .tag-chip :global(.markdown-rendered p) {
    display: inline;
    margin: 0;
  }

  .tag-chip :global(a) {
    color: inherit;
    text-decoration: underline;
  }

  .tag-remove,
  .tag-add,
  .tag-suggestion {
    height: auto;
    min-height: 0;
    box-shadow: none;
  }

  .tag-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-faint);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }

  .tag-chip:hover .tag-remove {
    opacity: 1;
  }

  .tag-remove:hover {
    color: var(--text-error);
  }

  .tag-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-faint);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.5;
  }

  .tag-add:hover {
    opacity: 1;
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .tag-input-wrapper {
    position: relative;
    display: inline-flex;
  }

  .tag-input {
    width: 96px;
    height: 20px;
    padding: 0 4px;
    border: 1px solid var(--interactive-accent);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--font-ui-smaller);
    user-select: text;
  }

  .tag-suggestions {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    min-width: 120px;
    max-height: 180px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-secondary);
    box-shadow: var(--shadow-s);
  }

  .tag-suggestion {
    padding: 3px 6px;
    border: none;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-normal);
    font-size: var(--font-ui-smaller);
    text-align: left;
    cursor: pointer;
  }

  .tag-suggestion:hover,
  .tag-suggestion.active {
    background: var(--background-modifier-hover);
  }
</style>
