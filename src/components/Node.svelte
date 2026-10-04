<script lang="ts">
  import { flip } from "../utils/flip";

  interface Props {
    children?: any;
    width: number;
    height: number;
    x: number;
    y: number;
    cssClass?: string;
    groupColor?: string;
    onclick?: (e: MouseEvent) => void;
    ondblclick?: (e: MouseEvent) => void;
    oncontextmenu?: (e: MouseEvent) => void;
    onauxclick?: (e: MouseEvent) => void;
    onpointerdown?: (e: PointerEvent) => void;
    onpointerenter?: (e: PointerEvent) => void;
    onpointerleave?: (e: PointerEvent) => void;
  }

  const {
    children,
    width,
    height,
    x,
    y,
    cssClass = "",
    groupColor,
    onclick,
    ondblclick,
    oncontextmenu,
    onauxclick,
    onpointerdown,
    onpointerenter,
    onpointerleave,
  }: Props = $props();
</script>

<div
  class="node {cssClass}"
  style:width={`${width}px`}
  style:min-height={`${height}px`}
  style:left={`${x}px`}
  style:top={`${y}px`}
  style:--group-color={groupColor ? groupColor : undefined}
  use:flip={{ x, y, width, minHeight: height }}
  {onclick}
  {ondblclick}
  {oncontextmenu}
  {onauxclick}
  {onpointerdown}
  {onpointerenter}
  {onpointerleave}
>
  {@render children?.()}
</div>

<style>
  .node {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    flex-direction: column;
  }
</style>
