<script lang="ts">
  import Node from "./Node.svelte";

  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    highlight?: boolean;
    onRename?: (newName: string) => void;
  }

  const {
    x,
    y,
    width,
    height,
    name,
    highlight = false,
    onRename,
  }: Props = $props();

  let isEditing = $state(false);
  let editValue = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

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
  cssClass="node-group{highlight ? ' group-drop-target' : ''}"
>
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
    <div class="group-label" ondblclick={startEdit}>{name}</div>
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
      opacity 120ms ease;
  }
  :global(.node-group.group-drop-target) {
    border-color: var(--interactive-accent);
    opacity: 0.75;
    border-width: 2px;
  }
  .group-label {
    padding: 8px 12px;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: auto;
    cursor: default;
  }
  .group-label-edit {
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
