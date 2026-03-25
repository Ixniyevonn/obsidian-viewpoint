<script lang="ts">
  import Node from "./Node.svelte";

  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    highlight?: boolean;
  }

  const { x, y, width, height, name, highlight = false }: Props = $props();
</script>

<Node
  {width}
  {height}
  {x}
  {y}
  cssClass="node-group{highlight ? ' group-drop-target' : ''}"
>
  <div class="group-label">{name}</div>
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
  }
</style>
