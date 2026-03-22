<script lang="ts">
  import Node from "./Node.svelte";

  interface Props {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
  }

  const { x, y, width, height, name }: Props = $props();
</script>

<Node {width} {height} {x} {y} cssClass="node-group">
  <div class="group-label">{name}</div>
</Node>

<style>
  :global(.node-group) {
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    background: var(--background-secondary);
    opacity: 0.5;
    pointer-events: none;
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
