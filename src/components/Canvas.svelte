<script lang="ts">
  interface Props {
    children?: any;
    minZoom?: number;
    maxZoom?: number;
    zoomSpeed?: number;
    onEmptyDblClick?: (worldX: number, worldY: number) => void;
    onEmptyClick?: () => void;
  }

  const {
    children,
    minZoom = 0.1,
    maxZoom = 5,
    zoomSpeed = 0.002,
    onEmptyDblClick,
    onEmptyClick,
  }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let panX = $state(0);
  let panY = $state(0);
  let zoom = $state(1);

  // Pan state
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let didMove = false;

  const transform = $derived(`translate(${panX}px, ${panY}px) scale(${zoom})`);

  function toWorld(clientX: number, clientY: number) {
    if (!containerEl) return { x: 0, y: 0 };
    const rect = containerEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  }

  function isEmptySpace(target: EventTarget | null): boolean {
    if (!containerEl) return false;
    // The viewport itself or the world layer (which has no intrinsic clickable area)
    return target === containerEl;
  }

  function onPointerDown(e: PointerEvent) {
    const isMiddle = e.button === 1;
    const isLeftOnEmpty = e.button === 0 && isEmptySpace(e.target);

    if (!isMiddle && !isLeftOnEmpty) return;

    e.preventDefault();
    isPanning = true;
    didMove = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = panX;
    panOriginY = panY;
    containerEl?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove = true;
    panX = panOriginX + dx;
    panY = panOriginY + dy;
  }

  function onPointerUp(e: PointerEvent) {
    if (!isPanning) return;
    const wasPanning = isPanning;
    isPanning = false;
    containerEl?.releasePointerCapture(e.pointerId);

    // Left click on empty space without dragging → notify parent
    if (wasPanning && !didMove && e.button === 0) {
      onEmptyClick?.();
    }
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const rect = containerEl!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const oldZoom = zoom;
    const delta = -e.deltaY * zoomSpeed;
    const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * (1 + delta)));

    const scale = newZoom / oldZoom;
    panX = cx - scale * (cx - panX);
    panY = cy - scale * (cy - panY);
    zoom = newZoom;
  }

  function onDblClick(e: MouseEvent) {
    if (!isEmptySpace(e.target)) return;
    const world = toWorld(e.clientX, e.clientY);
    onEmptyDblClick?.(world.x, world.y);
  }

  /** Programmatic: smoothly pan so world-space (wx, wy) is at container center */
  export function panTo(
    wx: number,
    wy: number,
    targetZoom?: number,
    durationMs = 300,
  ) {
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const z = targetZoom ?? zoom;
    const targetPanX = rect.width / 2 - wx * z;
    const targetPanY = rect.height / 2 - wy * z;

    if (durationMs <= 0) {
      panX = targetPanX;
      panY = targetPanY;
      zoom = z;
      return;
    }

    const startPanX = panX;
    const startPanY = panY;
    const startZoom = zoom;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - (1 - t) * (1 - t);
      panX = startPanX + (targetPanX - startPanX) * ease;
      panY = startPanY + (targetPanY - startPanY) * ease;
      zoom = startZoom + (z - startZoom) * ease;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  export function getViewport() {
    return { panX, panY, zoom };
  }

  export function clientToWorld(clientX: number, clientY: number) {
    return toWorld(clientX, clientY);
  }

  function onAuxClick(e: MouseEvent) {
    if (e.button === 1) e.preventDefault();
  }
</script>

<div
  class="canvas-viewport"
  bind:this={containerEl}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  ondblclick={onDblClick}
  onauxclick={onAuxClick}
  oncontextmenu={(e) => e.preventDefault()}
  role="application"
  style:--px={panX}
  style:--py={panY}
  style:--zoom={zoom}
>
  <div
    class="canvas-world"
    style:zoom
    style:translate="{panX / zoom}px {panY / zoom}px"
  >
    {@render children?.()}
  </div>
</div>

<style>
  .canvas-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    cursor: grab;
    touch-action: none;

    background-color: var(--background-primary);
    background-image: radial-gradient(
      circle,
      var(--background-modifier-border) calc(1px * var(--zoom)),
      transparent 1px
    );
    background-size: calc(20px * var(--zoom)) calc(20px * var(--zoom));
    background-position: calc(var(--px) * 1px) calc(var(--py) * 1px);
  }
  .canvas-viewport:active {
    cursor: grabbing;
  }
  .canvas-world {
    position: absolute;
    top: 0;
    left: 0;
    will-change: transform;
  }
</style>
