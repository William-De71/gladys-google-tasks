// -----------------------------------------------------------------------------
// Dashboard widgets (pure functions: the contents are built from the mirror,
// app.js serves them and runs the buttons).
//
//   tasks     the tasks of one list (card list: due date, "Overdue" /
//             "Today" badge, notes and a link in the detail), with the
//             "Add" form, the "Complete" form (a task of the list) and
//             "Refresh". Gladys 5.2.0+ for the forms.
//   overview  every list at a glance: to do / overdue / today tiles and one
//             row per list.
// -----------------------------------------------------------------------------

import { PHASES, addDays, phaseOf, sortTasks } from './tasks.js';
import { t, ago, LANGUAGES } from './i18n.js';

const WIDGETS = { TASKS: 'tasks', OVERVIEW: 'overview' };
const WIDGET_ACTIONS = { ADD: 'add_task', COMPLETE: 'complete_task', REFRESH: 'refresh' };
const SHOW = { ALL: 'all', DUE: 'due' };
// The contents are refreshed on every change (requestWidgetRefresh): the TTL
// only bounds how stale the "read N min ago" caption may get.
const TTL_SECONDS = { tasks: 300, overview: 300, message: 60 };
// A card list shows 8 items at most ("list" display).
const MAX_ITEMS = 8;
// Options of the "Complete" form.
const MAX_OPTIONS = 25;
const WHEN_OPTIONS = [
  ['none', 'whenNone'],
  ['today', 'whenToday'],
  ['tomorrow', 'whenTomorrow'],
  ['next_week', 'whenNextWeek'],
  ['date', 'whenDate'],
];

const clip = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
const allLanguages = (key) => Object.fromEntries(LANGUAGES.map((lang) => [lang, t(key, lang)]));
const sameEverywhere = (text) => Object.fromEntries(LANGUAGES.map((lang) => [lang, text]));

/**
 * @description A content with a single message.
 * @param {string} message - The text.
 * @param {number} [ttl] - Its TTL.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The title shown for a task ("↳ " in front of a subtask).
 * @param {object} task - The task.
 * @param {number} max - The bound.
 * @returns {string} The title.
 */
const taskTitle = (task, max) => clip(`${task.parent ? '↳ ' : ''}${task.title || '—'}`, max);

/**
 * @description The badge of a task, from its due date.
 * @param {object} task - The task.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @param {string} language - The language.
 * @returns {object|undefined} The badge.
 */
function badgeOf(task, today, language) {
  if (!task.due) {
    return undefined;
  }
  if (task.due < today) {
    return { text: t('badgeOverdue', language), color: 'danger' };
  }
  if (task.due === today) {
    return { text: t('badgeToday', language), color: 'warning' };
  }
  if (task.due === addDays(today, 1)) {
    return { text: t('badgeTomorrow', language), color: 'info' };
  }
  return undefined;
}

/**
 * @description The "Add" button and its form.
 * @returns {object} The button.
 */
function addButton() {
  return {
    type: 'button',
    label: allLanguages('buttonAdd'),
    icon: 'plus',
    style: 'primary',
    action: {
      key: WIDGET_ACTIONS.ADD,
      fields: [
        {
          key: 'title',
          type: 'string',
          label: allLanguages('fieldTitle'),
          placeholder: allLanguages('fieldTitlePlaceholder'),
          required: true,
        },
        {
          key: 'when',
          type: 'select',
          label: allLanguages('fieldWhen'),
          options: WHEN_OPTIONS.map(([value, key]) => ({ value, label: allLanguages(key) })),
          default: 'none',
        },
        {
          key: 'date',
          type: 'string',
          label: allLanguages('fieldDate'),
          description: allLanguages('fieldDateDescription'),
          placeholder: sameEverywhere('2026-10-24'),
        },
        { key: 'notes', type: 'string', label: allLanguages('fieldNotes') },
      ],
    },
  };
}

/**
 * @description The "Complete" button: its form lists the tasks to do.
 * @param {object[]} tasks - The sorted tasks.
 * @returns {object} The button.
 */
function completeButton(tasks) {
  return {
    type: 'button',
    label: allLanguages('buttonComplete'),
    icon: 'check',
    action: {
      key: WIDGET_ACTIONS.COMPLETE,
      fields: [
        {
          key: 'task',
          type: 'select',
          label: allLanguages('fieldTask'),
          required: true,
          options: tasks.slice(0, MAX_OPTIONS).map((task) => ({
            value: task.id,
            label: sameEverywhere(taskTitle(task, 40)),
          })),
        },
      ],
    },
  };
}

const refreshButton = () => ({
  type: 'button',
  label: allLanguages('buttonRefresh'),
  icon: 'refresh-cw',
  action: { key: WIDGET_ACTIONS.REFRESH },
});

/**
 * @description The `tasks` widget: the tasks of one list.
 * @param {object} params - `{ list, counters, clock, dueHour, show, language }`.
 * @returns {object} The content.
 */
function buildTasksWidget({ list, counters, clock, dueHour, show, language }) {
  const today = clock.date;
  const sorted = sortTasks(list.tasks.values());
  const shown =
    show === SHOW.DUE
      ? sorted.filter((task) =>
          [PHASES.OVERDUE, PHASES.TODAY, PHASES.DUE].includes(phaseOf(task, clock, dueHour)),
        )
      : sorted;
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: clip(`${list.title} · ${t('caption', language, counters)}`, 80),
    },
  ];
  if (shown.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: shown.slice(0, MAX_ITEMS).map((task) => {
        const badge = badgeOf(task, today, language);
        return {
          title: taskTitle(task, 60),
          ...(task.due ? { date: task.due } : {}),
          ...(badge ? { badge } : {}),
          ...(task.notes ? { description: clip(task.notes, 2000) } : {}),
          ...(task.url ? { links: [{ url: task.url, label: t('openTask', language) }] } : {}),
        };
      }),
    });
  }
  if (shown.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: t(show === SHOW.DUE ? 'nothingDue' : 'nothingToDo', language),
    });
  } else if (shown.length > MAX_ITEMS) {
    components.push({
      type: 'text',
      variant: 'body',
      text: t('moreTasks', language, { count: shown.length - MAX_ITEMS }),
    });
  }
  components.push(addButton());
  if (sorted.length > 0) {
    components.push(completeButton(shown.length > 0 ? shown : sorted));
  }
  components.push(refreshButton());
  return { ttl_seconds: TTL_SECONDS.tasks, components };
}

/**
 * @description The `overview` widget: every list at a glance.
 * @param {object} params - `{ lists, language, readAt, now }`: lists are
 *   `{ title, counters }`.
 * @returns {object} The content.
 */
function buildOverviewWidget({ lists, language, readAt, now }) {
  const totals = lists.reduce(
    (sum, { counters }) => ({
      pending: sum.pending + counters.pending,
      overdue: sum.overdue + counters.overdue,
      today: sum.today + counters.today,
    }),
    { pending: 0, overdue: 0, today: 0 },
  );
  const components = [
    {
      type: 'text',
      variant: 'caption',
      text: t('readAgo', language, { ago: ago(readAt, now, language) }),
    },
    { type: 'value', label: t('tilePending', language), value: totals.pending, icon: 'list' },
    {
      type: 'value',
      label: t('tileOverdue', language),
      value: totals.overdue,
      icon: 'alert-triangle',
      color: totals.overdue > 0 ? 'danger' : 'success',
    },
    {
      type: 'value',
      label: t('tileToday', language),
      value: totals.today,
      icon: 'calendar',
      color: totals.today > 0 ? 'warning' : 'neutral',
    },
  ];
  if (lists.length > 0) {
    components.push({
      type: 'status',
      items: lists.slice(0, 10).map(({ title, counters }) => ({
        label: clip(title, 40),
        value: clip(
          t(
            counters.overdue > 0 ? 'listOverdue' : counters.today > 0 ? 'listToday' : 'listPending',
            language,
            counters,
          ),
          40,
        ),
        color: counters.overdue > 0 ? 'danger' : counters.today > 0 ? 'warning' : 'success',
      })),
    });
  }
  components.push(refreshButton());
  return { ttl_seconds: TTL_SECONDS.overview, components };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  SHOW,
  TTL_SECONDS,
  MAX_ITEMS,
  messageContent,
  buildTasksWidget,
  buildOverviewWidget,
};
