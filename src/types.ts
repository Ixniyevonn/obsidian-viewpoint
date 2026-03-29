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

export interface ConnectionOutgoing {
    to: string;
    label: string | null;
}

export interface Note {
    title: string;
    short: string;
    long: string;
    width?: number;
    membership: Record<string, string | null>;
    connections: Record<string, { to: string; label: string | null }[]>;
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
    node_order: Record<string, string[]>;
}

// Runtime UI state (not serialized)
export interface FocusState {
    primary: string | null;
    secondary: string | null;
    type: "single" | "dual";
}

export interface ViewportState {
    panX: number;
    panY: number;
    zoom: number;
}

export interface SelectionState {
    nodes: Set<string>;
    connections: Set<number>;
    group: string | null;
}