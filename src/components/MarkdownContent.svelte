<script lang="ts">
  import { Component, MarkdownRenderer, type App } from "obsidian";

  interface Props {
    app: App;
    markdown: string;
    sourcePath?: string;
    parentComponent: Component;
  }

  const { app, markdown, sourcePath = "", parentComponent }: Props = $props();

  let el: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!el) return;
    el.empty();
    MarkdownRenderer.render(app, markdown, el, sourcePath, parentComponent);
  });
</script>

<div class="markdown-rendered" bind:this={el}></div>
