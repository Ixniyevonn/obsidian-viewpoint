<script lang="ts">
    import Node from "./Node.svelte";

    interface Props {
        x: number;
        y: number;
        width: number;
        height: number;
        name: string;
        color?: string;
        preview?: boolean;
        emphasis?: boolean;
        highlight?: boolean;
        selected?: boolean;
        draggable?: boolean;
        beingDragged?: boolean;
        resizableX?: boolean;
        resizableY?: boolean;
        onRename?: (newName: string) => void;
        onSelect?: (e: MouseEvent) => void;
        onDragStart?: (e: PointerEvent) => void;
        onColorClick?: (e: MouseEvent) => void;
        onResizeStart?: (
            axis: "x" | "y",
            edge: "min" | "max",
            e: PointerEvent,
        ) => void;
    }

    const {
        x,
        y,
        width,
        height,
        name,
        color,
        preview = false,
        emphasis = false,
        highlight = false,
        selected = false,
        draggable = false,
        beingDragged = false,
        resizableX = false,
        resizableY = false,
        onRename,
        onSelect,
        onDragStart,
        onColorClick,
        onResizeStart,
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
        if (e.button !== 0 || didMove) return;
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

    function handleHandle(
        e: PointerEvent,
        axis: "x" | "y",
        edge: "min" | "max",
    ) {
        if (e.button !== 0 || !onResizeStart) return;
        e.stopPropagation();
        e.preventDefault();
        onResizeStart(axis, edge, e);
    }
</script>

<Node
    {width}
    {height}
    {x}
    {y}
    cssClass="node-group{highlight ? ' group-drop-target' : ''}{emphasis
        ? ' group-emphasis'
        : ''}{selected
        ? ' group-selected'
        : ''}{draggable ? ' group-draggable' : ''}{beingDragged
        ? ' group-being-dragged'
        : ''}{color ? ' group-complex' : ''}{preview ? ' group-preview' : ''}"
    groupColor={color}
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
                onpointerdown={handleBodyPointerDown}
                onpointermove={handleBodyPointerMove}
            >
                {#if color}
                    <button
                        type="button"
                        class="group-color-dot"
                        style:background-color={`var(${color})`}
                        title="Change group color"
                        aria-label="Change group color"
                        onpointerdown={(e) => e.stopPropagation()}
                        onclick={(e) => {
                            e.stopPropagation();
                            onColorClick?.(e);
                        }}
                    ></button>
                {/if}
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

    {#if resizableX && !preview}
        <div
            class="group-handle handle-x-min"
            title="Drag to span stops"
            onpointerdown={(e) => handleHandle(e, "x", "min")}
        ></div>
        <div
            class="group-handle handle-x-max"
            title="Drag to span stops"
            onpointerdown={(e) => handleHandle(e, "x", "max")}
        ></div>
    {/if}
    {#if resizableY && !preview}
        <div
            class="group-handle handle-y-min"
            title="Drag to span stops"
            onpointerdown={(e) => handleHandle(e, "y", "min")}
        ></div>
        <div
            class="group-handle handle-y-max"
            title="Drag to span stops"
            onpointerdown={(e) => handleHandle(e, "y", "max")}
        ></div>
    {/if}
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
    :global(.node-group.group-emphasis) {
        border-color: color-mix(
            in srgb,
            var(--group-color, var(--interactive-accent)) 65%,
            var(--background-modifier-border)
        );
        background: color-mix(
            in srgb,
            var(--group-color, var(--interactive-accent)) 15%,
            transparent
        );
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
    :global(.node-group.group-complex) {
        border-color: color-mix(
            in srgb,
            var(--group-color) 55%,
            var(--background-modifier-border)
        );
        background: color-mix(
            in srgb,
            var(--group-color) 10%,
            transparent
        );
    }
    :global(.node-group.group-complex.group-selected) {
        border-color: var(--interactive-accent);
        background: color-mix(
            in srgb,
            var(--group-color) 16%,
            transparent
        );
    }
    :global(.node-group.group-complex.group-drop-target) {
        border-color: var(--interactive-accent);
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
        user-select: none;
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

    .group-color-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        padding: 0;
        border: none;
        border-radius: 50%;
        flex: 0 0 auto;
        cursor: pointer;
    }

    :global(.node-group.group-preview) {
        border-color: transparent;
        outline: 2px dashed var(--interactive-accent);
        outline-offset: -1px;
        background: color-mix(
            in srgb,
            var(--group-color, var(--interactive-accent)) 14%,
            transparent
        );
        pointer-events: none;
    }
    :global(.node-group.group-preview) .group-click-catcher,
    :global(.node-group.group-preview) .group-label {
        pointer-events: none;
    }

    .group-handle {
        position: absolute;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(
            in srgb,
            var(--group-color, var(--background-modifier-border)) 14%,
            var(--background-secondary)
        );
        border: 1px solid
            color-mix(
                in srgb,
                var(--group-color, var(--background-modifier-border)) 45%,
                var(--background-modifier-border)
            );
        border-radius: 999px;
        color: var(--text-faint);
        opacity: 0;
        pointer-events: none;
        transition: opacity 100ms ease;
        z-index: 220;
        transform: scale(calc(1 / var(--zoom, 1)));
    }
    .group-handle::before {
        content: "";
        width: 3px;
        height: 11px;
        background-image: radial-gradient(
            circle,
            currentColor 1.2px,
            transparent 1.4px
        );
        background-size: 3px 4px;
        background-repeat: repeat-y;
    }
    :global(.node-group:hover) .group-handle {
        opacity: 1;
        pointer-events: auto;
    }
    .group-handle:hover {
        color: var(--text-muted);
    }
    .group-handle.handle-x-min,
    .group-handle.handle-x-max {
        width: 12px;
        height: 34px;
        top: 50%;
        margin-top: -17px;
        cursor: ew-resize;
    }
    .group-handle.handle-x-min {
        left: -6px;
    }
    .group-handle.handle-x-max {
        right: -6px;
    }
    .group-handle.handle-y-min,
    .group-handle.handle-y-max {
        width: 34px;
        height: 12px;
        left: 50%;
        margin-left: -17px;
        cursor: ns-resize;
    }
    .group-handle.handle-y-min::before,
    .group-handle.handle-y-max::before {
        width: 11px;
        height: 3px;
        background-size: 4px 3px;
        background-repeat: repeat-x;
    }
    .group-handle.handle-y-min {
        top: -6px;
    }
    .group-handle.handle-y-max {
        bottom: -6px;
    }

    :global(.node-group.group-draggable) .group-label {
        cursor: grab;
    }
    :global(.node-group.group-draggable) .group-label:active {
        cursor: grabbing;
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
