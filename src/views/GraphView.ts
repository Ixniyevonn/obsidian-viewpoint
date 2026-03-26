import { FileView, type TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import GraphEditor from "../components/GraphEditor.svelte";
import type DimGraphPlugin from "../main";

import { createProjectStore } from "../stores/project.svelte";
import { deserializeProject, serializeProject } from "../utils/helpers";

export const VIEW_TYPE_GRAPH = "dim-graph-view";

export class GraphView extends FileView {
    component: ReturnType<typeof mount> | null = null;
    plugin: DimGraphPlugin;
    project = createProjectStore();
    file: TFile | null = null;
    private saving = false;
    private unsubscribe: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: DimGraphPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_GRAPH;
    }

    getDisplayText() {
        return this.project.project.meta.name ?? "Viewpoint";
    }

    getIcon() {
        return "network";
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.addClass("dim-graph-container");

        const state = this.getState() as { file?: string };
        if (state?.file) {
            const f = this.app.vault.getAbstractFileByPath(state.file);
            if (f && "extension" in f) {
                this.file = f as TFile;
                await this.loadFromFile();
            }
        }

        this.component = mount(GraphEditor as any, {
            target: this.contentEl,
            props: {
                app: this.app,
                plugin: this.plugin,
                project: this.project,
                parentComponent: this,
            },
        });

        this.unsubscribe = this.project.subscribe(() => {
            this.saveToFile();
        });
    }

    async onClose() {
        this.unsubscribe?.();
        if (this.component) {
            unmount(this.component);
            this.component = null;
        }
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        const s = state as { file?: string } | null;
        if (s?.file) {
            const f = this.app.vault.getAbstractFileByPath(s.file);
            if (f && "extension" in f) {
                this.file = f as TFile;
                await this.loadFromFile();
            }
        }
        await super.setState(state, result);
    }

    getState(): Record<string, unknown> {
        return { file: this.file?.path ?? null };
    }

    private async loadFromFile() {
        if (!this.file) return;
        try {
            const raw = await this.app.vault.read(this.file);
            const data = deserializeProject(raw);
            this.project.load(data);
        } catch (e) {
            console.error("Failed to load viewpoint file:", e);
        }
    }

    private async saveToFile() {
        if (!this.file || this.saving) return;
        this.saving = true;
        try {
            const current = this.project.project;
            if (current) {
                const yml = serializeProject(current);
                await this.app.vault.modify(this.file, yml);
            }
        } catch (e) {
            console.error("Failed to save viewpoint file:", e);
        } finally {
            this.saving = false;
        }
    }
}