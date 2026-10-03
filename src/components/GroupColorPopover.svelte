<script lang="ts">
  import { GROUP_COLOR_KEYS, colorKeyToVariable } from "../utils/color";

  interface Props {
    x: number;
    y: number;
    current?: string;
    onPick: (color: string | null) => void;
    onClose: () => void;
  }

  const { x, y, current, onPick, onClose }: Props = $props();

  let popoverEl: HTMLDivElement | undefined = $state();

  function handleWindowPointerDown(e: PointerEvent) {
    if (popoverEl && !popoverEl.contains(e.target as Node)) onClose();
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  function pick(color: string | null) {
    onPick(color);
    onClose();
  }

  /** Move the popover to the body so fixed positioning is viewport-based. */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }
</script>

<svelte:window
  onpointerdown={handleWindowPointerDown}
  onkeydown={handleWindowKeydown}
/>

<div
  class="group-color-popover"
  bind:this={popoverEl}
  use:portal
  style:left="{x}px"
  style:top="{y}px"
>
  {#each GROUP_COLOR_KEYS as key (key)}
    <button
      type="button"
      class="group-color-swatch{current === key ? ' active' : ''}"
      style:background-color={`var(${colorKeyToVariable(key)})`}
      title={key}
      aria-label={key}
      onclick={() => pick(key)}
    ></button>
  {/each}
  <button type="button" class="group-color-auto" onclick={() => pick(null)}>
    Automatic
  </button>
</div>

<style>
  .group-color-popover {
    position: fixed;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-stationary);
  }
  .group-color-swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 50%;
    cursor: pointer;
  }
  .group-color-swatch.active {
    box-shadow: 0 0 0 2px var(--interactive-accent);
  }
  .group-color-auto {
    margin-left: 4px;
    padding: 2px 8px;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    background: transparent;
    border: none;
    border-radius: var(--radius-s);
    cursor: pointer;
  }
  .group-color-auto:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
</style>
