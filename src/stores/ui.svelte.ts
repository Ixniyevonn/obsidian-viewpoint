// src/stores/ui.svelte.ts

export type RetargetEnd = "source" | "target";

export function createUiStore() {
    let activeDimensionId = $state<string | null>(null);
    let creatingDimension = $state(false);

    // Selection
    let selectedNodeIds = $state<Set<string>>(new Set());

    // Focus
    let focusPrimaryId = $state<string | null>(null);
    let focusSecondaryId = $state<string | null>(null);

    // Connection creation mode
    let connectingFromId = $state<string | null>(null);

    // Connection retarget mode
    let retargetDimId = $state<string | null>(null);
    let retargetIndex = $state<number | null>(null);
    let retargetEnd = $state<RetargetEnd | null>(null);
    // The node that stays fixed (the opposite end from what's being dragged)
    let retargetAnchorId = $state<string | null>(null);
    // The original node at the dragged end (for label preservation)
    let retargetOriginalId = $state<string | null>(null);
    let retargetLabel = $state<string | null>(null);

    // Pending connection deletion
    let pendingDeleteDimId = $state<string | null>(null);
    let pendingDeleteIndex = $state<number | null>(null);

    // World-space cursor position
    let cursorWorldX = $state(0);
    let cursorWorldY = $state(0);

    // Editing
    let editingShortId = $state<string | null>(null);
    let editingLongId = $state<string | null>(null);

    // Clipboard
    let clipboardNodeIds = $state<string[]>([]);
    let clipboardIsCut = $state(false);

    return {
        // --- Dimensions ---
        get activeDimensionId() { return activeDimensionId; },
        set activeDimensionId(id: string | null) { activeDimensionId = id; },

        get creatingDimension() { return creatingDimension; },
        set creatingDimension(v: boolean) { creatingDimension = v; },

        reconcile(dimensionIds: string[]) {
            if (!dimensionIds.length) {
                activeDimensionId = null;
            } else if (!activeDimensionId || !dimensionIds.includes(activeDimensionId)) {
                activeDimensionId = dimensionIds[0];
            }
        },

        cycle(dimensionIds: string[], delta: number) {
            if (!dimensionIds.length) return;
            const idx = activeDimensionId ? dimensionIds.indexOf(activeDimensionId) : -1;
            const next = (idx + delta + dimensionIds.length) % dimensionIds.length;
            activeDimensionId = dimensionIds[next];
        },

        // --- Selection ---
        get selectedNodeIds() { return selectedNodeIds; },

        selectNode(id: string, additive: boolean) {
            if (additive) {
                const next = new Set(selectedNodeIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                selectedNodeIds = next;
            } else {
                selectedNodeIds = new Set([id]);
            }
        },

        clearSelection() {
            if (selectedNodeIds.size > 0) selectedNodeIds = new Set();
        },

        isSelected(id: string) {
            return selectedNodeIds.has(id);
        },

        // --- Focus ---
        get focusPrimaryId() { return focusPrimaryId; },
        get focusSecondaryId() { return focusSecondaryId; },

        setFocus(id: string) {
            focusPrimaryId = id;
            focusSecondaryId = null;
        },

        setDualFocus(id: string) {
            if (!focusPrimaryId || focusPrimaryId === id) {
                focusPrimaryId = id;
                focusSecondaryId = null;
            } else {
                focusSecondaryId = id;
            }
        },

        clearFocus() {
            focusPrimaryId = null;
            focusSecondaryId = null;
        },

        // --- Connection creation ---
        get connectingFromId() { return connectingFromId; },

        startConnection(fromId: string) {
            connectingFromId = fromId;
            pendingDeleteDimId = null;
            pendingDeleteIndex = null;
        },

        completeConnection() {
            connectingFromId = null;
        },

        cancelConnection() {
            connectingFromId = null;
        },

        // --- Connection retarget ---
        get retargetDimId() { return retargetDimId; },
        get retargetIndex() { return retargetIndex; },
        get retargetEnd() { return retargetEnd; },
        get retargetAnchorId() { return retargetAnchorId; },
        get retargetOriginalId() { return retargetOriginalId; },
        get retargetLabel() { return retargetLabel; },

        /**
         * Start retargeting an existing connection.
         * @param end - which end the user grabbed ("source" = first half, "target" = second half)
         * @param anchorId - the node that stays fixed
         * @param originalId - the node being detached (at the dragged end)
         */
        startRetarget(dimId: string, connIndex: number, end: RetargetEnd, anchorId: string, originalId: string, label: string | null) {
            retargetDimId = dimId;
            retargetIndex = connIndex;
            retargetEnd = end;
            retargetAnchorId = anchorId;
            retargetOriginalId = originalId;
            retargetLabel = label;
            connectingFromId = null;
            pendingDeleteDimId = null;
            pendingDeleteIndex = null;
        },

        completeRetarget() {
            retargetDimId = null;
            retargetIndex = null;
            retargetEnd = null;
            retargetAnchorId = null;
            retargetOriginalId = null;
            retargetLabel = null;
        },

        cancelRetarget() {
            retargetDimId = null;
            retargetIndex = null;
            retargetEnd = null;
            retargetAnchorId = null;
            retargetOriginalId = null;
            retargetLabel = null;
        },

        get isRetargeting() {
            return retargetIndex !== null;
        },

        // --- Pending delete ---
        get pendingDeleteDimId() { return pendingDeleteDimId; },
        get pendingDeleteIndex() { return pendingDeleteIndex; },

        markConnectionForDelete(dimId: string, index: number) {
            pendingDeleteDimId = dimId;
            pendingDeleteIndex = index;
        },

        clearPendingDelete() {
            pendingDeleteDimId = null;
            pendingDeleteIndex = null;
        },

        isPendingDelete(dimId: string, index: number) {
            return pendingDeleteDimId === dimId && pendingDeleteIndex === index;
        },

        // --- Cursor ---
        get cursorWorldX() { return cursorWorldX; },
        get cursorWorldY() { return cursorWorldY; },

        updateCursor(wx: number, wy: number) {
            cursorWorldX = wx;
            cursorWorldY = wy;
        },

        // --- Editing ---
        get editingShortId() { return editingShortId; },
        set editingShortId(id: string | null) { editingShortId = id; },

        get editingLongId() { return editingLongId; },
        set editingLongId(id: string | null) { editingLongId = id; },

        // --- Clipboard ---
        get clipboardNodeIds() { return clipboardNodeIds; },
        get clipboardIsCut() { return clipboardIsCut; },

        copyNodes(ids: string[]) {
            clipboardNodeIds = [...ids];
            clipboardIsCut = false;
        },

        cutNodes(ids: string[]) {
            clipboardNodeIds = [...ids];
            clipboardIsCut = true;
        },

        clearClipboard() {
            clipboardNodeIds = [];
            clipboardIsCut = false;
        },

        // --- Bulk reset ---
        cancelAll() {
            connectingFromId = null;
            editingShortId = null;
            pendingDeleteDimId = null;
            pendingDeleteIndex = null;
            retargetDimId = null;
            retargetIndex = null;
            retargetEnd = null;
            retargetAnchorId = null;
            retargetOriginalId = null;
            retargetLabel = null;
        },

        get isDrawingConnection() {
            return connectingFromId !== null || retargetIndex !== null;
        },

        /** The node the ghost line draws FROM — anchor in retarget, or connectingFromId for new */
        get ghostSourceId() {
            if (connectingFromId) return connectingFromId;
            if (retargetAnchorId) return retargetAnchorId;
            return null;
        },
    };
}

export type UiStore = ReturnType<typeof createUiStore>;