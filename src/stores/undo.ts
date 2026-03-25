import type { ProjectData } from "../types";

export function createUndoManager(maxHistory = 100) {
    const undoStack: string[] = [];
    const redoStack: string[] = [];
    let lastPushTime = 0;
    const MERGE_MS = 400;

    return {
        /**
         * Snapshot current state before a mutation.
         * If called within MERGE_MS of the last push, skips (merges edits).
         */
        snapshot(state: ProjectData) {
            const now = Date.now();
            if (now - lastPushTime < MERGE_MS && undoStack.length > 0) return;
            undoStack.push(JSON.stringify(state));
            if (undoStack.length > maxHistory) undoStack.shift();
            redoStack.length = 0;
            lastPushTime = now;
        },

        /** Force next snapshot to create a new entry (break merge window). */
        fence() {
            lastPushTime = 0;
        },

        undo(current: ProjectData): ProjectData | null {
            if (!undoStack.length) return null;
            redoStack.push(JSON.stringify(current));
            const snap = undoStack.pop()!;
            lastPushTime = 0;
            return JSON.parse(snap);
        },

        redo(current: ProjectData): ProjectData | null {
            if (!redoStack.length) return null;
            undoStack.push(JSON.stringify(current));
            const snap = redoStack.pop()!;
            lastPushTime = 0;
            return JSON.parse(snap);
        },

        get canUndo() { return undoStack.length > 0; },
        get canRedo() { return redoStack.length > 0; },

        clear() {
            undoStack.length = 0;
            redoStack.length = 0;
            lastPushTime = 0;
        },
    };
}

export type UndoManager = ReturnType<typeof createUndoManager>;