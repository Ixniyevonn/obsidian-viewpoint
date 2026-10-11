<!-- src/components/DimensionDialog.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Dimension, Spectrum } from "../types";

  interface Props {
    existing: Dimension | null;
    onConfirm: (
      name: string,
      xSpectrum: Spectrum | null,
      ySpectrum: Spectrum | null,
    ) => void;
    onCancel: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  }

  const { existing, onConfirm, onCancel, onDuplicate, onDelete }: Props =
    $props();

  let nameInputEl = $state<HTMLInputElement | undefined>(undefined);

  let name = $state(existing?.name ?? "");

  let xEnabled = $state(!!existing?.["x-spectrum"]);
  let xName = $state(existing?.["x-spectrum"]?.name ?? "");
  let xPoleA = $state(existing?.["x-spectrum"]?.poles[0] ?? "");
  let xPoleB = $state(existing?.["x-spectrum"]?.poles[1] ?? "");
  let xStops = $state<string[]>(
    existing?.["x-spectrum"]?.stops ? [...existing["x-spectrum"].stops] : [""],
  );

  let yEnabled = $state(!!existing?.["y-spectrum"]);
  let yName = $state(existing?.["y-spectrum"]?.name ?? "");
  let yPoleA = $state(existing?.["y-spectrum"]?.poles[0] ?? "");
  let yPoleB = $state(existing?.["y-spectrum"]?.poles[1] ?? "");
  let yStops = $state<string[]>(
    existing?.["y-spectrum"]?.stops ? [...existing["y-spectrum"].stops] : [""],
  );

  let dragAxis = $state<"x" | "y" | null>(null);
  let dragFromIdx = $state(-1);
  let dragOverIdx = $state(-1);

  let showDiscardConfirm = $state(false);
  let showDeleteConfirm = $state(false);

  function formSnapshot(): string {
    return JSON.stringify({
      name,
      xEnabled,
      xName,
      xPoleA,
      xPoleB,
      xStops,
      yEnabled,
      yName,
      yPoleA,
      yPoleB,
      yStops,
    });
  }

  const initialSnapshot = formSnapshot();
  const isDirty = $derived(formSnapshot() !== initialSnapshot);

  onMount(() => nameInputEl?.focus());

  function requestClose() {
    if (isDirty) {
      showDiscardConfirm = true;
    } else {
      onCancel();
    }
  }

  function keepEditing() {
    showDiscardConfirm = false;
  }

  function confirmDiscard() {
    showDiscardConfirm = false;
    onCancel();
  }

  function requestDelete() {
    showDeleteConfirm = true;
  }

  function cancelDelete() {
    showDeleteConfirm = false;
  }

  function confirmDelete() {
    showDeleteConfirm = false;
    onDelete();
  }

  function buildSpectrum(
    enabled: boolean,
    sName: string,
    poleA: string,
    poleB: string,
    stops: string[],
  ): Spectrum | null {
    if (!enabled) return null;
    const filtered = stops.map((s) => s.trim()).filter(Boolean);
    if (
      !sName.trim() ||
      !poleA.trim() ||
      !poleB.trim() ||
      filtered.length === 0
    )
      return null;
    return {
      name: sName.trim(),
      poles: [poleA.trim(), poleB.trim()],
      stops: filtered,
    };
  }

  function handleConfirm() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const xs = buildSpectrum(xEnabled, xName, xPoleA, xPoleB, xStops);
    const ys = buildSpectrum(yEnabled, yName, yPoleA, yPoleB, yStops);
    onConfirm(trimmed, xs, ys);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (showDeleteConfirm) cancelDelete();
      else if (showDiscardConfirm) keepEditing();
      else requestClose();
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      if (showDiscardConfirm || showDeleteConfirm) return;
      e.preventDefault();
      handleConfirm();
    }
  }

  function addStop(axis: "x" | "y") {
    if (axis === "x") xStops = [...xStops, ""];
    else yStops = [...yStops, ""];
  }

  function removeStop(axis: "x" | "y", idx: number) {
    if (axis === "x") {
      xStops = xStops.filter((_, i) => i !== idx);
      if (xStops.length === 0) xStops = [""];
    } else {
      yStops = yStops.filter((_, i) => i !== idx);
      if (yStops.length === 0) yStops = [""];
    }
  }

  function updateStop(axis: "x" | "y", idx: number, value: string) {
    if (axis === "x") {
      xStops[idx] = value;
    } else {
      yStops[idx] = value;
    }
  }

  function handleDragStart(axis: "x" | "y", idx: number) {
    dragAxis = axis;
    dragFromIdx = idx;
  }

  function handleDragOver(e: DragEvent, idx: number) {
    e.preventDefault();
    dragOverIdx = idx;
  }

  function handleDrop(e: DragEvent, axis: "x" | "y", idx: number) {
    e.preventDefault();
    if (dragAxis !== axis || dragFromIdx < 0) return;
    const stops = axis === "x" ? [...xStops] : [...yStops];
    const [item] = stops.splice(dragFromIdx, 1);
    stops.splice(idx, 0, item);
    if (axis === "x") xStops = stops;
    else yStops = stops;
    dragAxis = null;
    dragFromIdx = -1;
    dragOverIdx = -1;
  }

  function handleDragEnd() {
    dragAxis = null;
    dragFromIdx = -1;
    dragOverIdx = -1;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dialog-backdrop"
  onclick={requestClose}
  onkeydown={handleKeydown}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dialog"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="dialog-header">
      <h2>{existing ? "Edit Dimension" : "New Dimension"}</h2>
      {#if existing}
        <div class="dialog-header-actions">
          <button
            type="button"
            class="header-btn"
            onclick={onDuplicate}
            title="Duplicate dimension">Duplicate</button
          >
          <button
            type="button"
            class="header-btn danger"
            onclick={requestDelete}
            title="Delete dimension">Delete</button
          >
        </div>
      {/if}
    </div>

    <label class="field">
      <span class="field-label">Name</span>
      <input
        bind:this={nameInputEl}
        bind:value={name}
        class="field-input"
        placeholder="Dimension name…"
      />
    </label>

    <!-- X Spectrum -->
    <div class="spectrum-section">
      <label class="toggle-row">
        <input type="checkbox" bind:checked={xEnabled} />
        <span>X-Spectrum (horizontal axis)</span>
      </label>

      {#if xEnabled}
        <div class="spectrum-config">
          <label class="field">
            <span class="field-label">Spectrum name</span>
            <input
              bind:value={xName}
              class="field-input"
              placeholder="e.g. Scale"
            />
          </label>
          <div class="poles-row">
            <label class="field pole">
              <span class="field-label">Left pole</span>
              <input
                bind:value={xPoleA}
                class="field-input"
                placeholder="e.g. Individual"
              />
            </label>
            <span class="pole-arrow pole-arrow-x" aria-hidden="true">
              <svg aria-hidden="true" viewBox="0 0 24 12" width="24" height="12">
                <line x1="3" y1="6" x2="21" y2="6" />
                <polyline points="7,2 3,6 7,10" />
                <polyline points="17,2 21,6 17,10" />
              </svg>
            </span>
            <label class="field pole">
              <span class="field-label">Right pole</span>
              <input
                bind:value={xPoleB}
                class="field-input"
                placeholder="e.g. Collective"
              />
            </label>
          </div>
          <div class="stops-section">
            <span class="field-label">Stops (ordered left → right)</span>
            {#each xStops as stop, i}
              <div
                class="stop-row"
                class:drag-over={dragAxis === "x" &&
                  dragOverIdx === i &&
                  dragFromIdx !== i}
                ondragover={(e) => handleDragOver(e, i)}
                ondrop={(e) => handleDrop(e, "x", i)}
              >
                <span
                  class="drag-handle"
                  title="Drag to reorder"
                  draggable="true"
                  ondragstart={() => handleDragStart("x", i)}
                  ondragend={handleDragEnd}>⠿</span
                >
                <input
                  class="field-input stop-input"
                  draggable="false"
                  value={stop}
                  oninput={(e) =>
                    updateStop("x", i, (e.target as HTMLInputElement).value)}
                  placeholder={`Stop ${i + 1}`}
                />
                <button type="button"
                  class="stop-remove"
                  onclick={() => removeStop("x", i)}
                  title="Remove stop"
                  disabled={xStops.length <= 1}>×</button
                >
              </div>
            {/each}
            <button type="button" class="stop-add" onclick={() => addStop("x")}
              >+ Add stop</button
            >
          </div>
        </div>
      {/if}
    </div>

    <!-- Y Spectrum -->
    <div class="spectrum-section">
      <label class="toggle-row">
        <input type="checkbox" bind:checked={yEnabled} />
        <span>Y-Spectrum (vertical axis)</span>
      </label>

      {#if yEnabled}
        <div class="spectrum-config">
          <label class="field">
            <span class="field-label">Spectrum name</span>
            <input
              bind:value={yName}
              class="field-input"
              placeholder="e.g. Complexity"
            />
          </label>
          <div class="poles-row">
            <label class="field pole">
              <span class="field-label">Top pole</span>
              <input
                bind:value={yPoleA}
                class="field-input"
                placeholder="e.g. Simple"
              />
            </label>
            <span class="pole-arrow pole-arrow-y" aria-hidden="true">
              <svg aria-hidden="true" viewBox="0 0 12 24" width="12" height="24">
                <line x1="6" y1="3" x2="6" y2="21" />
                <polyline points="2,7 6,3 10,7" />
                <polyline points="2,17 6,21 10,17" />
              </svg>
            </span>
            <label class="field pole">
              <span class="field-label">Bottom pole</span>
              <input
                bind:value={yPoleB}
                class="field-input"
                placeholder="e.g. Complex"
              />
            </label>
          </div>
          <div class="stops-section">
            <span class="field-label">Stops (ordered top → bottom)</span>
            {#each yStops as stop, i}
              <div
                class="stop-row"
                class:drag-over={dragAxis === "y" &&
                  dragOverIdx === i &&
                  dragFromIdx !== i}
                ondragover={(e) => handleDragOver(e, i)}
                ondrop={(e) => handleDrop(e, "y", i)}
              >
                <span
                  class="drag-handle"
                  title="Drag to reorder"
                  draggable="true"
                  ondragstart={() => handleDragStart("y", i)}
                  ondragend={handleDragEnd}>⠿</span
                >
                <input
                  class="field-input stop-input"
                  draggable="false"
                  value={stop}
                  oninput={(e) =>
                    updateStop("y", i, (e.target as HTMLInputElement).value)}
                  placeholder={`Stop ${i + 1}`}
                />
                <button type="button"
                  class="stop-remove"
                  onclick={() => removeStop("y", i)}
                  title="Remove stop"
                  disabled={yStops.length <= 1}>×</button
                >
              </div>
            {/each}
            <button type="button" class="stop-add" onclick={() => addStop("y")}
              >+ Add stop</button
            >
          </div>
        </div>
      {/if}
    </div>

    <div class="dialog-actions">
      <button type="button" class="btn-cancel" onclick={requestClose}>Cancel</button>
      <button type="button"
        class="btn-confirm"
        onclick={handleConfirm}
        disabled={!name.trim()}
      >
        {existing ? "Save" : "Create"}
      </button>
    </div>
  </div>

  {#if showDiscardConfirm}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="confirm-backdrop"
      onclick={(e) => {
        e.stopPropagation();
        keepEditing();
      }}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        onclick={(e) => e.stopPropagation()}
        onkeydown={handleKeydown}
      >
        <p id="discard-title" class="confirm-message">
          Discard the unsaved changes to this dimension?
        </p>
        <div class="dialog-actions">
          <button type="button" class="btn-cancel" onclick={keepEditing}>
            Keep editing
          </button>
          <button type="button" class="btn-danger" onclick={confirmDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showDeleteConfirm}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="confirm-backdrop"
      onclick={(e) => {
        e.stopPropagation();
        cancelDelete();
      }}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onclick={(e) => e.stopPropagation()}
        onkeydown={handleKeydown}
      >
        <p id="delete-title" class="confirm-message">
          Delete this dimension and its groups? The notes stay.
        </p>
        <div class="dialog-actions">
          <button type="button" class="btn-cancel" onclick={cancelDelete}>
            Cancel
          </button>
          <button type="button" class="btn-danger" onclick={confirmDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-l, 12px);
    padding: 24px;
    width: 480px;
    max-width: 90vw;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 16px;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.2em;
  }

  .dialog-header-actions {
    display: flex;
    gap: 6px;
  }

  .header-btn {
    padding: 4px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    cursor: pointer;
  }
  .header-btn:hover {
    color: var(--text-normal);
  }
  .header-btn.danger {
    color: var(--text-error);
    border-color: var(--text-error);
  }
  .header-btn.danger:hover {
    background: var(--color-red);
    color: var(--text-on-accent);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .field-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: 500;
  }

  .field-input {
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: var(--font-ui-small);
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    min-width: 0;
  }
  .field-input:focus {
    border-color: var(--interactive-accent);
  }

  .spectrum-section {
    margin: 16px 0;
    padding: 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    background: var(--background-secondary);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: var(--font-ui-small);
    font-weight: 500;
    color: var(--text-normal);
  }

  .spectrum-config {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .poles-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin-bottom: 12px;
  }

  .pole {
    flex: 1;
    min-width: 0;
  }

  .pole-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: flex-end;
    flex-shrink: 0;
    color: var(--text-faint);
    line-height: 0;
  }
  .pole-arrow-x {
    margin-bottom: 21px;
  }
  .pole-arrow-y {
    margin-bottom: 17px;
  }
  .pole-arrow svg {
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stops-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stop-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    border: 1px solid transparent;
    border-radius: var(--radius-s);
    transition: border-color 100ms ease;
  }
  .stop-row.drag-over {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .drag-handle {
    cursor: grab;
    color: var(--text-faint);
    font-size: 14px;
    line-height: 1;
    user-select: none;
    padding: 0 2px;
  }
  .drag-handle:active {
    cursor: grabbing;
  }

  .stop-input {
    flex: 1;
    min-width: 0;
  }

  .stop-remove {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 18px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--radius-s);
    line-height: 1;
  }
  .stop-remove:hover:not(:disabled) {
    color: var(--color-red);
    background: var(--background-modifier-hover);
  }
  .stop-remove:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .stop-add {
    align-self: flex-start;
    background: none;
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    padding: 4px 12px;
    cursor: pointer;
    margin-top: 4px;
  }
  .stop-add:hover {
    border-color: var(--text-faint);
    color: var(--text-normal);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .btn-cancel,
  .btn-confirm {
    padding: 6px 16px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-small);
    cursor: pointer;
    border: 1px solid var(--background-modifier-border);
  }
  .btn-cancel {
    background: var(--background-secondary);
    color: var(--text-muted);
  }
  .btn-cancel:hover {
    color: var(--text-normal);
  }
  .btn-confirm {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
    font-weight: 600;
  }
  .btn-confirm:hover:not(:disabled) {
    filter: brightness(1.1);
  }
  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .confirm-backdrop {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
  }

  .confirm-dialog {
    width: 320px;
    max-width: 84vw;
    padding: 20px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  .confirm-message {
    margin: 0 0 16px;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
  }

  .btn-danger {
    padding: 6px 16px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-small);
    cursor: pointer;
    background: var(--color-red);
    color: var(--text-on-accent);
    border: 1px solid var(--color-red);
    font-weight: 600;
  }
  .btn-danger:hover {
    filter: brightness(1.1);
  }
</style>
