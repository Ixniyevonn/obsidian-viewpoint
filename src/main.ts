import { Menu, normalizePath, Notice, Plugin, TFolder } from "obsidian";
import { emptyProject } from "./stores/project.svelte";
import { serializeProject } from "./utils/helpers";
import { GraphView, VIEW_TYPE_GRAPH } from "./views/GraphView";

interface DimGraphSettings {
    lastOpenedFile: string | null;
    defaultDimension: string | null;
}

const DEFAULT_SETTINGS: DimGraphSettings = {
    lastOpenedFile: null,
    defaultDimension: null,
};

export default class DimGraphPlugin extends Plugin {
    settings!: DimGraphSettings;

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private getActiveGraphView(): GraphView | null {
        const leaf = this.app.workspace.activeLeaf;
        if (leaf?.view instanceof GraphView) return leaf.view;
        return null;
    }

    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_GRAPH, (leaf) => new GraphView(leaf, this));

        this.registerExtensions(["viewpoint"], VIEW_TYPE_GRAPH);
        this.registerHoverLinkSource(VIEW_TYPE_GRAPH, { display: "Viewpoint", defaultMod: true });

        this.addRibbonIcon("network", "Viewpoint", () => {
            this.activateView();
        });

        this.addCommand({
            id: "new-viewpoint",
            name: "New viewpoint",
            callback: () => this.createNewViewpoint(),
        });

        this.addCommand({
            id: "viewpoint-undo",
            name: "Undo",
            checkCallback: (checking) => {
                const view = this.getActiveGraphView();
                if (!view) return false;
                if (checking) return view.project.undo.canUndo;
                view.project.performUndo();
                return true;
            },
        });

        this.addCommand({
            id: "viewpoint-redo",
            name: "Redo",
            checkCallback: (checking) => {
                const view = this.getActiveGraphView();
                if (!view) return false;
                if (checking) return view.project.undo.canRedo;
                view.project.performRedo();
                return true;
            },
        });

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle("New viewpoint")
                            .setIcon("network")
                            .setSection('action-primary')
                            .onClick(() => this.createNewViewpoint(file));
                    });
                }
            })
        );
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GRAPH);
    }

    async activateView() {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH);
        if (existing.length) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE_GRAPH, active: true });
        this.app.workspace.revealLeaf(leaf);
    }

    async createNewViewpoint(folder?: TFolder) {
        try {
            const targetFolder = folder || this.app.fileManager.getNewFileParent(
                this.app.workspace.getActiveFile()?.path || ""
            );

            let fileName = "Untitled.viewpoint";
            let filePath = normalizePath(`${targetFolder.path}/${fileName}`);
            let counter = 1;

            while (await this.app.vault.adapter.exists(filePath)) {
                fileName = `Untitled ${counter}.viewpoint`;
                filePath = normalizePath(`${targetFolder.path}/${fileName}`);
                counter++;
            }

            const data = emptyProject();
            const yml = serializeProject(data);
            const file = await this.app.vault.create(filePath, yml);

            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        } catch (err) {
            console.error(err);
            new Notice("Failed to create new Viewpoint file");
        }
    }
}