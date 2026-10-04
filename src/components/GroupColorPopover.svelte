<script lang="ts">
  import { GROUP_COLOR_OPTIONS, isGroupColorKey } from "../utils/color";

  interface Props {
    x: number;
    y: number;
    current?: string;
    onPick: (color: string | null) => void;
    onClose: () => void;
  }

  const { x, y, current, onPick, onClose }: Props = $props();

  let popoverEl: HTMLDivElement | undefined = $state();

  /** The stored custom color, or a neutral value for the color input. */
  const customValue = $derived(
    isGroupColorKey(current) || !current ? "#888888" : current,
  );
  /** True when the group uses a custom color. */
  const customActive = $derived(!!current && !isGroupColorKey(current));

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
  <div class="group-color-grid">
    {#each GROUP_COLOR_OPTIONS as option (option.key)}
      <button
        type="button"
        class="group-color-swatch{current === option.key ? ' active' : ''}"
        style:background-color={option.css}
        title={option.label}
        aria-label={option.label}
        onclick={() => pick(option.key)}
      ></button>
    {/each}
  </div>
  <div class="group-color-actions">
    <label
      class="group-color-custom{customActive ? ' active' : ''}"
      style:background={customActive ? current : undefined}
      title="Custom color"
    >
      <input
        type="color"
        value={customValue}
        aria-label="Custom color"
        onchange={(e) => pick(e.currentTarget.value)}
      />
    </label>
    <button type="button" class="group-color-auto" onclick={() => pick(null)}>
      Automatic
    </button>
  </div>
</div>

<style>
  .group-color-popover {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-stationary);
  }
  .group-color-grid {
    display: grid;
    grid-template-rows: repeat(2, 20px);
    grid-auto-flow: column;
    grid-auto-columns: 20px;
    gap: 6px;
  }
  .group-color-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .group-color-swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 50%;
    cursor: pointer;
  }
  .group-color-swatch.active,
  .group-color-custom.active {
    box-shadow: 0 0 0 2px var(--interactive-accent);
  }
  .group-color-custom {
    position: relative;
    width: 20px;
    height: 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 50%;
    cursor: pointer;
    background: conic-gradient(
      from 0deg,
      #f00,
      #ff0,
      #0f0,
      #0ff,
      #00f,
      #f0f,
      #f00
    );
  }
  .group-color-custom input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    opacity: 0;
    cursor: pointer;
  }
  .group-color-auto {
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
