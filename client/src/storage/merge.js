import { mergeRuntime } from "./session.js";

function itemStamp(item) {
  if (!item) return 0;
  const u = Number(item.updatedAt);
  if (u) return u;
  const c = Date.parse(item.createdAt || "");
  return c || 0;
}

function pruneTombstones(map) {
  const cutoff = Date.now() - 180 * 86400000;
  Object.keys(map || {}).forEach(function (id) {
    if (!(map[id] > cutoff)) delete map[id];
  });
  return map;
}

export function mergeTombstones(remoteMap, localMap) {
  const out = {};
  [remoteMap || {}, localMap || {}].forEach(function (m) {
    Object.keys(m).forEach(function (id) {
      const at = Number(m[id]) || 0;
      if (at > (out[id] || 0)) out[id] = at;
    });
  });
  return pruneTombstones(out);
}

export function mergeById(remoteList, localList, deletedMap) {
  const byId = {};
  (remoteList || []).concat(localList || []).forEach(function (item) {
    if (!item || !item.id) return;
    const prev = byId[item.id];
    if (!prev || itemStamp(item) >= itemStamp(prev)) byId[item.id] = item;
  });
  const dels = deletedMap || {};
  return Object.keys(byId)
    .filter(function (id) {
      const at = Number(dels[id]) || 0;
      return !(at && at >= itemStamp(byId[id]));
    })
    .map(function (id) {
      return byId[id];
    });
}

export function mergeState(local, remote) {
  if (!remote || !Array.isArray(remote.entries)) return local;
  const remoteAt = remote.updatedAt || 0;
  const deleted = mergeTombstones(remote.deleted, local.deleted);
  const runtime = mergeRuntime(local, remote);
  return {
    entries: mergeById(remote.entries, local.entries, deleted),
    tasks: mergeById(remote.tasks, local.tasks, deleted),
    agenda: mergeById(remote.agenda, local.agenda, deleted),
    tags: local.tags,
    projects: local.projects,
    subjectsByTag: Object.assign({}, remote.subjectsByTag || {}, local.subjectsByTag || {}),
    deleted,
    runtime: runtime || local.runtime || remote.runtime || {},
    settings:
      remoteAt > (local.updatedAt || 0)
        ? remote.settings || local.settings
        : local.settings || remote.settings || {},
    updatedAt: Math.max(remoteAt, local.updatedAt || 0),
  };
}
