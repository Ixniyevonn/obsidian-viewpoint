import { Menu, normalizePath, Notice, Plugin, TFolder } from "obsidian";
import { GraphView, VIEW_TYPE_GRAPH } from "./views/GraphView";

interface DimGraphSettings {
    lastOpenedFile: string | null;
    defaultDimension: string | null;
}

const DEFAULT_SETTINGS: DimGraphSettings = {
    lastOpenedFile: null,
    defaultDimension: null,
};

const DEFAULT_VIEWPOINT_YAML = `meta:
  name: New World
  created: ${new Date().toISOString()}
  modified: ${new Date().toISOString()}
dimensions:
  personal:
    name: Personal
    groups: []
notes: {}
connections: {}
node-order: {}`;

export default class DimGraphPlugin extends Plugin {
    settings!: DimGraphSettings;

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_GRAPH, (leaf) => new GraphView(leaf, this));

        this.registerExtensions(["viewpoint"], VIEW_TYPE_GRAPH);
        this.addCommand({
            id: "new-viewpoint",
            name: "New View",
            callback: () => this.activateView(),
        });

        this.addRibbonIcon("network", "Viewpoint", () => {
            this.activateView();
        });

        this.addCommand({
            id: "new-viewpoint",
            name: "New View",
            callback: () => this.createNewViewpoint(),
        });

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu: Menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle("New View")
                            .setIcon("git-branch")
                            .setSection("new")
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

    // Creates a new .viewpoint file with proper YAML template
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

            const file = await this.app.vault.create(filePath, DEFAULT_VIEWPOINT_YAML);

            // Open it immediately in our editor
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        } catch (err) {
            console.error(err);
            new Notice("Failed to create new View file");
        }
    }
}
