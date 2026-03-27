import { TextFileView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import GraphEditor from "../components/GraphEditor.svelte";
import type DimGraphPlugin from "../main";

import { createProjectStore } from "../stores/project.svelte";
import { deserializeProject, serializeProject } from "../utils/helpers";

export const VIEW_TYPE_GRAPH = "dim-graph-view";

export class GraphView extends TextFileView {
    component: ReturnType<typeof mount> | null = null;
    plugin: DimGraphPlugin;
    project = createProjectStore();
    private unsubscribe: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DimGraphPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_GRAPH;
    }

    getDisplayText() {
        return this.file?.basename ?? "Viewpoint";
    }

    getIcon() {
        return "network";
    }

    canAcceptExtension(extension: string) {
        return extension === "viewpoint";
    }

    /**
     * Called by Obsidian when it needs the current file content to save.
     * TextFileView calls this internally; we return serialized YAML.
     */
    getViewData(): string {
        return serializeProject(this.project.project);
    }

    /**
     * Called by Obsidian when a file is loaded or reloaded.
     * @param data - raw file content
     * @param clear - true when switching to a different file (not just reloading)
     */
    setViewData(data: string, clear: boolean): void {
        if (clear) {
            this.project.reset();
        }
        try {
            const parsed = deserializeProject(data);
            this.project.load(parsed);
        } catch (e) {
            console.error("Failed to parse viewpoint file:", e);
            this.project.reset();
        }
    }

    /**
     * Called by Obsidian when unloading the file from the view.
     */
    clear(): void {
        this.project.reset();
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.addClass("dim-graph-container");

        this.component = mount(GraphEditor as any, {
            target: this.contentEl,
            props: {
                app: this.app,
                plugin: this.plugin,
                project: this.project,
                parentComponent: this,
            },
        });

        // When the project store notifies of changes, tell Obsidian to save.
        this.unsubscribe = this.project.subscribe(() => {
            this.requestSave();
        });
    }

    async onClose() {
        this.unsubscribe?.();
        if (this.component) {
            unmount(this.component);
            this.component = null;
        }
    }
}