export const BACKUP_FILENAME = "diario-tarefas-backup.json";
export const IDB_NAME = "focusly-v2";
export const IDB_STORE = "meta";
export const IDB_STATE_KEY = "state";
export const IDB_FOLDER_KEY = "backup-folder-handle";
export const AUTO_BACKUP_DEBOUNCE_MS = 20000;
export const AUTO_BACKUP_DEADLINE_MS = 120000;

export function emptyState() {
  return {
    entries: [],
    tasks: [],
    agenda: [],
    tags: [],
    projects: [],
    subjectsByTag: {},
    deleted: {},
    settings: {},
    runtime: {},
    updatedAt: 0,
  };
}
