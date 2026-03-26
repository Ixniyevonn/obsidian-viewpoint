<!-- src/components/SpectrumOverlay.svelte -->
<script lang="ts">
  import type { SpectrumLayout } from "../utils/layout";

  interface Props {
    xSpectrum?: SpectrumLayout;
    ySpectrum?: SpectrumLayout;
  }

  const { xSpectrum, ySpectrum }: Props = $props();
</script>

{#if xSpectrum || ySpectrum}
  <svg
    class="spectrum-overlay"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 1 1"
  >
    {#if xSpectrum}
      {@const firstStop = xSpectrum.stops[0]}
      {@const lastStop = xSpectrum.stops[xSpectrum.stops.length - 1]}
      <!-- X axis line -->
      <line
        x1={firstStop.position}
        y1={-30}
        x2={lastStop.position}
        y2={-30}
        class="axis-line"
      />
      <!-- Pole labels -->
      <text
        x={firstStop.position - 12}
        y={-26}
        text-anchor="end"
        class="pole-label zoom-text zoom-anchor-end"
      >
        {xSpectrum.poles[0]}
      </text>
      <text
        x={lastStop.position + 12}
        y={-26}
        text-anchor="start"
        class="pole-label zoom-text zoom-anchor-start"
      >
        {xSpectrum.poles[1]}
      </text>
      <!-- Spectrum name -->
      <text
        x={(firstStop.position + lastStop.position) / 2}
        y={-48}
        text-anchor="middle"
        class="spectrum-name zoom-text"
      >
        {xSpectrum.name}
      </text>
      <!-- Stop ticks and labels -->
      {#each xSpectrum.stops as stop}
        <line
          x1={stop.position}
          y1={-38}
          x2={stop.position}
          y2={-22}
          class="stop-tick"
        />
        <text
          x={stop.position}
          y={-10}
          text-anchor="middle"
          class="stop-label zoom-text"
        >
          {stop.name}
        </text>
      {/each}
    {/if}

    {#if ySpectrum}
      {@const firstStop = ySpectrum.stops[0]}
      {@const lastStop = ySpectrum.stops[ySpectrum.stops.length - 1]}
      <!-- Y axis line -->
      <line
        x1={-30}
        y1={firstStop.position}
        x2={-30}
        y2={lastStop.position}
        class="axis-line"
      />
      <!-- Pole labels (horizontal, above/below axis ends) -->
      <text
        x={-30}
        y={firstStop.position - 16}
        text-anchor="middle"
        class="pole-label zoom-text"
      >
        {ySpectrum.poles[0]}
      </text>
      <text
        x={-30}
        y={lastStop.position + 24}
        text-anchor="middle"
        class="pole-label zoom-text"
      >
        {ySpectrum.poles[1]}
      </text>
      <!-- Spectrum name (horizontal, to the left of the axis) -->
      <text
        x={-56}
        y={(firstStop.position + lastStop.position) / 2}
        text-anchor="middle"
        class="spectrum-name zoom-text"
      >
        {ySpectrum.name}
      </text>
      <!-- Stop ticks and labels (to the RIGHT of the axis line, horizontal) -->
      {#each ySpectrum.stops as stop}
        <line
          x1={-38}
          y1={stop.position}
          x2={-22}
          y2={stop.position}
          class="stop-tick"
        />
        <text
          x={-10}
          y={stop.position + 4}
          text-anchor="start"
          class="stop-label zoom-text zoom-anchor-start"
        >
          {stop.name}
        </text>
      {/each}
    {/if}
  </svg>
{/if}

<style>
  .spectrum-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 0;
  }

  .axis-line {
    stroke: var(--text-faint);
    stroke-width: 1.5;
    stroke-dasharray: 6 3;
    opacity: 0.5;
  }

  .stop-tick {
    stroke: var(--text-faint);
    stroke-width: 1.5;
    opacity: 0.5;
  }

  /*
   * Inverse-zoom scaling directly on SVG <text>.
   * transform-box: fill-box makes transform-origin relative to the
   * text's own bbox, so the scale pivots around the text position
   * set by x/y attributes. Default pivot is center.
   * Capped at 3x so labels don't explode at extreme zoom-out.
   */
  .zoom-text {
    transform-box: fill-box;
    transform-origin: center center;
    transform: scale(min(calc(1 / var(--zoom, 1)), 3));
  }

  /* Anchor-aware origins so scaled text stays pinned to its x/y position */
  .zoom-anchor-end {
    transform-origin: right center;
  }

  .zoom-anchor-start {
    transform-origin: left center;
  }

  .pole-label {
    fill: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font-interface);
    opacity: 0.7;
  }

  .spectrum-name {
    fill: var(--text-faint);
    font-size: 11px;
    font-family: var(--font-interface);
    font-weight: 500;
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stop-label {
    fill: var(--text-faint);
    font-size: 11px;
    font-family: var(--font-interface);
    opacity: 0.5;
  }
</style>
