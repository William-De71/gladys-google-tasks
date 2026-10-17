// -----------------------------------------------------------------------------
// Scene triggers: one event per transition seen between two readings, never a
// periodic snapshot.
//
//   task_added      a task to do appeared in a list (added in Google Tasks,
//                   Gmail, Calendar, the phone…);
//   task_completed  a task to do was marked completed;
//   task_due        a task due today reached the hour set in the
//                   configuration (Google stores a date, no time);
//   task_overdue    a task to do went past its due date (local midnight).
//
// The first reading after a start is a baseline (no event), and the tasks
// the integration itself created or completed (scene and widget actions)
// never raise one: a scene action must not start scenes in turn.
// -----------------------------------------------------------------------------

const TRIGGERS = {
  TASK_ADDED: 'task_added',
  TASK_COMPLETED: 'task_completed',
  TASK_DUE: 'task_due',
  TASK_OVERDUE: 'task_overdue',
};

// Scalars of at most 1 000 characters (limit of a scene event value).
const MAX_VALUE = 1000;
const cut = (text) => String(text ?? '').slice(0, MAX_VALUE);

/**
 * @description The data of a task event, flat and bounded.
 * @param {object} task - The normalized task.
 * @param {object} context - `{ list, listName }`: the device external id and
 *   the list title.
 * @returns {object} The event data.
 */
function taskEventData(task, { list, listName }) {
  return {
    list,
    list_name: cut(listName),
    task_id: cut(task.id),
    title: cut(task.title),
    notes: cut(task.notes),
    due: task.due ?? '',
    is_subtask: Boolean(task.parent),
    url: cut(task.url ?? ''),
  };
}

export { TRIGGERS, taskEventData };
