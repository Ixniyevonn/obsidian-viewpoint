export interface Spectrum {
	name: string;
	poles: [string, string];
	stops: string[];
}

/**
 * One cell where a group is present on the stop grid.
 *
 * A null axis means the axis has no spectrum or the group is not placed on it.
 */
export interface GroupCell {
	x: string | null;
	y: string | null;
}

export interface Group {
	id: string;
	name: string;
	/** The cells where the group is present. An empty list means auto or unplaced. */
	cells: GroupCell[];
	/**
	 * Optional explicit color. A preset key, such as `red` or `red-soft`, or a
	 * custom CSS color, such as `#3b82f6`. Omitted for the default. A group
	 * with more than one cell uses its name color when omitted.
	 */
	color?: string;
	/**
	 * Optional vertical order of the group boxes. The key is the `xFrom,yFrom`
	 * of a box. A lower value sits higher in its row. Omitted for automatic
	 * packing.
	 */
	boxOrder?: Record<string, number>;
}

/** The stops that a note uses inside its group, per spectrum axis. */
export interface Placement {
	x?: string;
	y?: string;
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
	tags?: string[];
	membership: Record<string, string | null>;
	connections: Record<string, { to: string; label: string | null }[]>;
	/** Stop placement inside the group, keyed by dimension ID. */
	placement?: Record<string, Placement>;
}

/** One note copy that the clipboard holds. */
export interface ClipboardNote {
	/** The source note ID. Paste uses it to remap links between the pasted notes. */
	id: string;
	title: string;
	short: string;
	long: string;
	width?: number;
	tags?: string[];
	/** The connections of the source note, keyed by dimension ID. */
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
