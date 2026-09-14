<script lang="ts">
    import Node from "./Node.svelte";

    interface Props {
        x: number;
        y: number;
        width: number;
        height: number;
        name: string;
        highlight?: boolean;
        selected?: boolean;
        draggable?: boolean;
        beingDragged?: boolean;
        onRename?: (newName: string) => void;
        onSelect?: (e: MouseEvent) => void;
        onDragStart?: (e: PointerEvent) => void;
    }

    const {
        x,
        y,
        width,
        height,
        name,
        highlight = false,
        selected = false,
        draggable = false,
        beingDragged = false,
        onRename,
        onSelect,
        onDragStart,
    }: Props = $props();

    let isEditing = $state(false);
    let editValue = $state("");
    let inputEl: HTMLInputElement | undefined = $state();

    let didMove = false;
    let downX = 0;
    let downY = 0;
    const CLICK_THRESHOLD = 5;

    function handleBodyPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        didMove = false;
        downX = e.clientX;
        downY = e.clientY;

        if (draggable) {
            onDragStart?.(e);
        }
    }

    function handleBodyPointerMove(e: PointerEvent) {
        if (
            Math.abs(e.clientX - downX) > CLICK_THRESHOLD ||
            Math.abs(e.clientY - downY) > CLICK_THRESHOLD
        ) {
            didMove = true;
        }
    }

    function handleBodyClick(e: MouseEvent) {
        if (e.button !== 0 || didMove) return;
        e.stopPropagation();
        onSelect?.(e);
    }

    function handleLabelClick(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect?.(e);
    }

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
    cssClass="node-group{highlight ? ' group-drop-target' : ''}{selected
        ? ' group-selected'
        : ''}{draggable ? ' group-draggable' : ''}{beingDragged
        ? ' group-being-dragged'
        : ''}"
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="group-click-catcher"
        onpointerdown={handleBodyPointerDown}
        onpointermove={handleBodyPointerMove}
        onclick={handleBodyClick}
    ></div>

    <div class="group-label-wrapper">
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
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                class="group-label"
                onclick={handleLabelClick}
                ondblclick={startEdit}
            >
                {name}
                {#if draggable}
                    <span
                        class="drag-indicator"
                        title="Drag to reposition on spectrum">⠿</span
                    >
                {/if}
            </div>
        {/if}
    </div>
</Node>

<style>
    :global(.node-group) {
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-m);
        /* Use semi-transparent background instead of opacity on the whole element.
       This lets the label z-index escape the stacking context. */
        background: color-mix(
            in srgb,
            var(--background-secondary) 50%,
            transparent
        );
        pointer-events: none;
        transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
    }
    :global(.node-group.group-drop-target) {
        border-color: var(--interactive-accent);
        background: color-mix(
            in srgb,
            var(--background-secondary) 75%,
            transparent
        );
        border-width: 2px;
    }
    :global(.node-group.group-selected) {
        border-color: var(--interactive-accent);
        background: color-mix(
            in srgb,
            var(--background-secondary) 75%,
            transparent
        );
        box-shadow:
            var(--shadow-stationary),
            0 0 0 2px var(--interactive-accent);
    }
    :global(.node-group.group-draggable) {
        cursor: grab;
    }
    :global(.node-group.group-being-dragged) {
        opacity: 0.25;
        pointer-events: none;
    }

    .group-click-catcher {
        position: absolute;
        inset: 0;
        pointer-events: auto;
        cursor: default;
        z-index: 0;
    }

    :global(.node-group.group-draggable) .group-click-catcher {
        cursor: grab;
    }

    /*
   * The wrapper is positioned so the label floats above nodes.
   * pointer-events: none on the wrapper itself so nodes underneath
   * remain clickable; pointer-events: auto on the label text only.
   */
    .group-label-wrapper {
        position: relative;
        z-index: 200;
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
        pointer-events: auto;
        cursor: default;
        display: flex;
        align-items: center;
        gap: 8px;
        /* Dampened inverse-zoom like Obsidian canvas group names:
       blends between no compensation and full 1/zoom.
       zoom=1→1.0, zoom=0.5→~1.3, zoom=0.25→~1.9, zoom=2→~0.85 */
        transform-origin: top left;
        transform: scale(calc(0.7 + 0.3 / var(--zoom, 1)));
    }

    .drag-indicator {
        font-size: 14px;
        color: var(--text-faint);
        opacity: 0.5;
        cursor: grab;
    }

    .group-label-edit {
        display: block;
        padding: 8px 12px;
        font-size: 24px;
        font-weight: 700;
        font-family: inherit;
        color: var(--text-normal);
        background: transparent;
        border: none;
        border-bottom: 2px solid var(--interactive-accent);
        border-radius: 0;
        outline: none;
        width: 100%;
        pointer-events: auto;
        box-sizing: border-box;
        transform-origin: top left;
        transform: scale(calc(0.7 + 0.3 / var(--zoom, 1)));
    }
</style>
