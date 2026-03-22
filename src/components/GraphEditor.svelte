<script lang="ts">
  import type { App, Component } from "obsidian";
  import { onMount } from "svelte";
  import type DimGraphPlugin from "../main";
  import type { ProjectStore } from "../stores/project.svelte";
  import { createUiStore } from "../stores/ui.svelte";
  import { generateId } from "../utils/helpers";
  import { layoutEngine } from "../utils/layout";
  import AxisSwitcher from "./AxisSwitcher.svelte";
  import Canvas from "./Canvas.svelte";
  import NodeCard from "./NodeCard.svelte";
  import NodeGroup from "./NodeGroup.svelte";
  import SVGLayer from "./SVGLayer.svelte";

  interface Props {
    app: App;
    plugin: DimGraphPlugin;
    project: ProjectStore;
    parentComponent: Component;
  }

  const { app, plugin, project, parentComponent }: Props = $props();

  const ui = createUiStore();

  let canvasRef: Canvas | undefined = $state();

  $effect(() => {
    ui.reconcile(Object.keys(project.project.dimensions));
  });

  const layout = $derived(layoutEngine(project.project, ui.activeDimensionId));

  // --- Canvas callbacks ---

  function handleEmptyDblClick(worldX: number, worldY: number) {
    const id = generateId("note");
    project.addNote(id, "Untitled");
    ui.selectNode(id, false);
  }

  function handleEmptyClick() {
    if (ui.connectingFromId) {
      ui.cancelConnection();
      return;
    }
    if (ui.isRetargeting) {
      ui.cancelRetarget();
      return;
    }
    ui.clearPendingDelete();
    ui.clearSelection();
    ui.editingShortId = null;
  }

  // --- Track cursor in world space ---

  function handlePointerMove(e: PointerEvent) {
    if (!canvasRef) return;
    const world = canvasRef.clientToWorld(e.clientX, e.clientY);
    ui.updateCursor(world.x, world.y);
  }

  // --- Keyboard shortcuts ---

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.key === "Escape") {
      if (ui.connectingFromId) {
        ui.cancelConnection();
      } else if (ui.isRetargeting) {
        ui.cancelRetarget();
      } else if (ui.pendingDeleteIndex !== null) {
        ui.clearPendingDelete();
      } else if (ui.editingShortId || ui.editingLongId) {
        ui.editingShortId = null;
        ui.editingLongId = null;
      } else if (ui.selectedNodeIds.size > 0) {
        ui.clearSelection();
      } else {
        ui.clearFocus();
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (ui.selectedNodeIds.size > 0) {
        e.preventDefault();
        for (const id of ui.selectedNodeIds) {
          project.removeNote(id);
        }
        ui.clearSelection();
      }
      return;
    }

    if (e.key === "c" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (ui.selectedNodeIds.size > 0) {
        ui.copyNodes([...ui.selectedNodeIds]);
      }
      return;
    }

    if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
      if (ui.selectedNodeIds.size > 0) {
        e.preventDefault();
        const ids = [...ui.selectedNodeIds];
        ui.cutNodes(ids);
        for (const id of ids) {
          project.removeNote(id);
        }
        ui.clearSelection();
      }
      return;
    }

    if (e.key === "g" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!ui.activeDimensionId) return;

      const groupId = generateId("grp");
      project.addGroup(ui.activeDimensionId, groupId, "New Group");

      for (const nodeId of ui.selectedNodeIds) {
        project.setNoteMembership(nodeId, ui.activeDimensionId, groupId);
      }
      return;
    }

    if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const allIds = Object.keys(project.project.notes);
      for (const id of allIds) {
        ui.selectNode(id, true);
      }
      return;
    }
  }

  // --- Scroll-wheel axis switching ---

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) return;
    const dimIds = Object.keys(project.project.dimensions);
    if (!dimIds.length) return;
    e.preventDefault();
    ui.cycle(dimIds, e.deltaY > 0 ? 1 : -1);
  }

  onMount(() => {
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="dim-graph-root" onpointermove={handlePointerMove}>
  <div class="canvas-area">
    <AxisSwitcher {project} {ui} />

    {#if ui.connectingFromId}
      <div class="connection-hint">
        Right-clicked node selected — click another node to connect, or click
        empty space / Esc to cancel
      </div>
    {/if}

    {#if ui.isRetargeting}
      <div class="connection-hint retarget-hint">
        Retargeting {ui.retargetEnd} — click a node to reconnect, or Esc to cancel
      </div>
    {/if}

    {#if ui.pendingDeleteIndex !== null}
      <div class="connection-hint delete-hint">
        Click the red connection to delete, or Esc to cancel
      </div>
    {/if}

    <Canvas
      bind:this={canvasRef}
      onEmptyDblClick={handleEmptyDblClick}
      onEmptyClick={handleEmptyClick}
    >
      {#each Object.entries(layout.groups) as [groupId, g]}
        <NodeGroup
          x={g.x}
          y={g.y}
          width={g.width}
          height={g.height}
          name={g.name}
        />
      {/each}

      <SVGLayer {project} {ui} {layout} />

      {#each Object.entries(layout.nodes) as [noteId, pos] (noteId)}
        <NodeCard
          width={pos.width}
          height={pos.height}
          x={pos.x}
          y={pos.y}
          {app}
          {noteId}
          title={project.project.notes[noteId].title}
          short={project.project.notes[noteId].short}
          long={project.project.notes[noteId].long}
          {parentComponent}
          {ui}
          {project}
        />
      {/each}
    </Canvas>
  </div>
</div>

<style>
  :global(.view-content) {
    padding: 0 !important;
  }
  .dim-graph-root {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .canvas-area {
    flex: 1;
    position: relative;
    background: var(--background-primary);
    overflow: hidden;
  }
  .connection-hint {
    position: absolute;
    bottom: 12px;
    left: 50%;
    translate: -50% 0;
    z-index: 10;
    padding: 6px 16px;
    background: var(--background-secondary);
    border: 1px solid var(--color-green);
    border-radius: var(--radius-m);
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    pointer-events: none;
    opacity: 0.9;
    white-space: nowrap;
  }
  .retarget-hint {
    border-color: var(--color-orange);
    bottom: 40px;
  }
  .delete-hint {
    border-color: var(--color-red);
    bottom: 40px;
  }
</style>
