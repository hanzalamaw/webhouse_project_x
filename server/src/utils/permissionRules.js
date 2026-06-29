export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "export"];

/** Normalize permission picks with implied dependencies. */
export function normalizePermissions(matrix) {
  const out = {};
  for (const [moduleId, actions] of Object.entries(matrix || {})) {
    const set = new Set((actions || []).map(String));
    if (set.has("delete") || set.has("edit") || set.has("create") || set.has("export")) {
      set.add("view");
    }
    out[moduleId] = PERMISSION_ACTIONS.filter((a) => set.has(a));
  }
  return out;
}

export function flattenPermissions(matrix) {
  const rows = [];
  for (const [moduleId, actions] of Object.entries(normalizePermissions(matrix))) {
    for (const action of actions) {
      rows.push({ moduleId: Number(moduleId), action });
    }
  }
  return rows;
}
