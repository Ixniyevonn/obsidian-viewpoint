<script lang="ts">
  import { flip } from "../utils/flip";

  interface Props {
    children?: any;
    width: number;
    height: number;
    x: number;
    y: number;
    cssClass?: string;
    onclick?: (e: MouseEvent) => void;
    ondblclick?: (e: MouseEvent) => void;
    oncontextmenu?: (e: MouseEvent) => void;
    onauxclick?: (e: MouseEvent) => void;
    onpointerdown?: (e: PointerEvent) => void;
  }

  const {
    children,
    width,
    height,
    x,
    y,
    cssClass = "",
    onclick,
    ondblclick,
    oncontextmenu,
    onauxclick,
    onpointerdown,
  }: Props = $props();
</script>

<div
  class="node {cssClass}"
  style:width={`${width}px`}
  style:min-height={`${height}px`}
  style:left={`${x}px`}
  style:top={`${y}px`}
  use:flip={{ x, y }}
  {onclick}
  {ondblclick}
  {oncontextmenu}
  {onauxclick}
  {onpointerdown}
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
