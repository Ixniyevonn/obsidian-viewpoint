<script lang="ts">
  import { Component, Keymap, MarkdownRenderer, type App } from "obsidian";
  import { isPlainText } from "../utils/plainText";

  interface Props {
    app: App;
    markdown: string;
    sourcePath?: string;
    parentComponent: Component;
  }

  const { app, markdown, sourcePath = "", parentComponent }: Props = $props();

  let el: HTMLDivElement | undefined = $state();
  let renderedContent: HTMLDivElement | null = null;
  let renderedComponent: Component | null = null;
  let renderedKey = "";

  /** Remove the rendered text and its Obsidian component. */
  function releaseRendered() {
    if (renderedComponent) parentComponent.removeChild(renderedComponent);
    renderedContent?.remove();
    renderedComponent = null;
    renderedContent = null;
  }

  /**
   * Render the Markdown text.
   *
   * A parent render can run this effect again with the same text. In that case
   * the effect skips the render. The Obsidian renderer is slow, and a large
   * file has many cards.
   */
  $effect(() => {
    if (!el) return;
    const container = el;
    const text = markdown;
    const path = sourcePath;
    const key = `${path}\u0000${text}`;
    if (
      key === renderedKey &&
      renderedContent &&
      container.contains(renderedContent)
    ) {
      return;
    }
    renderedKey = key;
    releaseRendered();
    const content = document.createElement("div");
    container.replaceChildren(content);
    renderedContent = content;
    if (isPlainText(text)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      content.appendChild(paragraph);
      return;
    }
    const component = new Component();
    parentComponent.addChild(component);
    renderedComponent = component;
    void MarkdownRenderer.render(app, text, content, path, component)
      .catch(error => console.error("Failed to render Viewpoint Markdown", error));
  });

  $effect(() => () => releaseRendered());

  $effect(() => {
    if (!el) return;
    const container = el;
    const path = sourcePath;
    const anchor = (event: Event) => event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a") : null;
    const stopCardAction = (event: Event) => {
      if (anchor(event)) event.stopPropagation();
    };
    const open = (event: MouseEvent) => {
      const link = anchor(event);
      if (!link) return;
      event.stopPropagation();
      if (!link.classList.contains("internal-link")) return;
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      const target = link.getAttribute("data-href") ?? link.getAttribute("href");
      if (target) void app.workspace.openLinkText(target, path,
        event.button === 1 ? "tab" : Keymap.isModEvent(event));
    };
    const hover = (event: MouseEvent) => {
      const link = anchor(event);
      if (!link?.classList.contains("internal-link")) return;
      if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return;
      app.workspace.trigger("hover-link", {
        event, source: "dim-graph-view", hoverParent: parentComponent,
        targetEl: link, linktext: link.getAttribute("data-href") ?? link.getAttribute("href"),
        sourcePath: path,
      });
    };
    container.addEventListener("click", open, true);
    container.addEventListener("auxclick", open, true);
    container.addEventListener("mouseover", hover);
    for (const type of ["pointerdown", "dblclick", "contextmenu"]) {
      container.addEventListener(type, stopCardAction, true);
    }
    return () => {
      container.removeEventListener("click", open, true);
      container.removeEventListener("auxclick", open, true);
      container.removeEventListener("mouseover", hover);
      for (const type of ["pointerdown", "dblclick", "contextmenu"]) {
        container.removeEventListener(type, stopCardAction, true);
      }
    };
  });
</script>

<div class="markdown-rendered" bind:this={el}></div>
