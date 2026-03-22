import yaml from "js-yaml";
import type { ProjectData } from "../types";

export function generateId(prefix: string = ""): string {
  const rand = Math.random().toString(36).substring(2, 8);
  const ts = Date.now().toString(36).slice(-4);
  return prefix ? `${prefix}-${ts}${rand}` : `${ts}${rand}`;
}

export function serializeProject(data: ProjectData): string {
  return yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

export function deserializeProject(raw: string): ProjectData {
  return yaml.load(raw) as ProjectData;
}
