// -----------------------------------------------------------------------------
// The mirror of the Google task lists, refreshed by polling (Google Tasks has
// no push notification nor webhook).
//
// A reading costs 1 call for the task lists + 1 call per list:
//   - the first reading of a list in this run (and one every FULL_EVERY_MS)
//     reads its tasks still to do (`showCompleted=false`): the baseline;
//   - the next ones only ask what changed since the previous reading
//     (`updatedMin`, completed, hidden and deleted tasks included): a task
//     completed in the Google app is hidden at once, hence `showHidden`.
//     The window starts UPDATED_MIN_MARGIN_MS before the previous call, so a
//     clock drift or a change made during the call is never missed; reading a
//     change twice is harmless.
//
// It returns the changes (task added, task completed) of the readings after
// the baseline; app.js turns them into scene events. The tasks the
// integration itself created or completed (scene and widget actions) are
// applied to the mirror at once and marked quiet: they never raise an event.
// -----------------------------------------------------------------------------

import { isOpen, normalizeTask } from './tasks.js';

const FULL_EVERY_MS = 6 * 60 * 60 * 1000;
const UPDATED_MIN_MARGIN_MS = 2 * 60 * 1000;
const QUIET_MS = 30 * 60 * 1000;

/**
 * @description The mirror of the task lists.
 * @param {object} options - `{ api, now, logger }`.
 * @returns {object} The mirror.
 */
function createMirror({ api, now, logger }) {
  // listId -> { id, title, tasks: Map, updatedMin, fullAt, phases: Map }
  const lists = new Map();
  // taskId -> instant: changes made by the integration itself.
  const quiet = new Map();
  let readAt = 0;

  /** Forget the quiet marks older than QUIET_MS. */
  function pruneQuiet() {
    for (const [id, at] of quiet) {
      if (now() - at > QUIET_MS) {
        quiet.delete(id);
      }
    }
  }

  /**
   * @description Read the tasks of one list.
   * @param {object} list - The mirrored list.
   * @returns {Promise<{ added: object[], completed: object[] }>} The changes.
   */
  async function readList(list) {
    const startedAt = now();
    const changes = { added: [], completed: [] };
    const full = !list.updatedMin || startedAt - list.fullAt >= FULL_EVERY_MS;
    const baseline = list.fullAt === 0;
    if (full) {
      const items = await api.listTasks(list.id);
      const next = new Map();
      for (const raw of items.filter(isOpen)) {
        const task = normalizeTask(raw);
        next.set(task.id, task);
        if (!baseline && !list.tasks.has(task.id) && !quiet.has(task.id)) {
          changes.added.push(task);
        }
      }
      // A task gone from a full reading was completed OR deleted: no event.
      list.tasks = next;
      list.fullAt = startedAt;
    } else {
      const items = await api.listTasks(list.id, { updatedMin: list.updatedMin });
      for (const raw of items) {
        const task = normalizeTask(raw);
        const known = list.tasks.has(task.id);
        if (isOpen(raw)) {
          if (!known && !quiet.has(task.id)) {
            changes.added.push(task);
          }
          list.tasks.set(task.id, task);
        } else {
          if (known && raw.status === 'completed' && raw.deleted !== true && !quiet.has(task.id)) {
            changes.completed.push({ ...list.tasks.get(task.id), ...task });
          }
          list.tasks.delete(task.id);
        }
      }
    }
    list.updatedMin = new Date(startedAt - UPDATED_MIN_MARGIN_MS).toISOString();
    return changes;
  }

  return {
    lists,
    /** @returns {number} The instant of the last complete reading. */
    readAt: () => readAt,

    /**
     * @description Read every list.
     * @returns {Promise<Array<{ list: object, added: object[], completed: object[] }>>}
     *   The changes per list (empty for the baseline).
     */
    async read() {
      pruneQuiet();
      const remote = await api.listTaskLists();
      const seen = new Set();
      for (const item of remote) {
        const id = String(item.id ?? '');
        if (!id) {
          continue;
        }
        seen.add(id);
        const title = String(item.title ?? '').trim() || id;
        const list = lists.get(id);
        if (list) {
          list.title = title;
        } else {
          lists.set(id, {
            id,
            title,
            tasks: new Map(),
            updatedMin: null,
            fullAt: 0,
            phases: new Map(),
          });
        }
      }
      for (const id of [...lists.keys()]) {
        if (!seen.has(id)) {
          logger.info('A task list was deleted in Google Tasks');
          lists.delete(id);
        }
      }
      const result = [];
      for (const list of lists.values()) {
        const changes = await readList(list);
        result.push({ list, ...changes });
      }
      readAt = now();
      return result;
    },

    /**
     * @description A task the integration created: mirrored at once, quiet.
     * @param {string} listId - The list.
     * @param {object} raw - The created Task resource.
     * @returns {object|null} The normalized task.
     */
    created(listId, raw) {
      const task = normalizeTask(raw);
      quiet.set(task.id, now());
      lists.get(listId)?.tasks.set(task.id, task);
      return task;
    },

    /**
     * @description A task the integration completed: mirrored at once, quiet.
     * @param {string} listId - The list.
     * @param {string} taskId - The task.
     */
    completed(listId, taskId) {
      quiet.set(taskId, now());
      lists.get(listId)?.tasks.delete(taskId);
    },

    /** Forget everything (disconnect). */
    clear() {
      lists.clear();
      quiet.clear();
      readAt = 0;
    },
  };
}

export { FULL_EVERY_MS, UPDATED_MIN_MARGIN_MS, createMirror };
