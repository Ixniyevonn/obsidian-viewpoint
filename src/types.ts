export interface Spectrum {
    name: string;
    poles: [string, string];
    stops: string[];
}

export interface Group {
    id: string;
    name: string;
    x: string | null;
    y: string | null;
}

export interface Dimension {
    name: string;
    "x-spectrum"?: Spectrum;
    "y-spectrum"?: Spectrum;
    groups: Group[];
}

export interface Note {
    title: string;
    short: string;
    long: string;
    membership: Record<string, string | null>; // dimensionId -> groupId | null
}

export interface Connection {
    from: string;
    to: string;
    label: string | null;
}

export interface ProjectMeta {
    name: string;
    created: string;
    modified: string;
}

export interface ProjectData {
    meta: ProjectMeta;
    dimensions: Record<string, Dimension>;
    notes: Record<string, Note>;
    connections: Record<string, Connection[]>; // dimensionId -> connections
    node_order: Record<string, string[]>; // "dimensionId:groupId" -> noteIds
}

// Runtime UI state (not serialized)
export interface FocusState {
    primary: string | null; // noteId or groupId
    secondary: string | null; // for dual focus
    type: "single" | "dual";
}

export interface ViewportState {
    panX: number;
    panY: number;
    zoom: number;
}

export interface SelectionState {
    nodes: Set<string>;
    connections: Set<number>; // index into current dimension's connection list
    group: string | null;
}
