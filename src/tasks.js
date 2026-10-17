// -----------------------------------------------------------------------------
// The tasks still to do, kept in memory per list, and what the integration
// computes from them: counters, due phases, sorting, due dates typed by users.
//
// Google stores a DATE only in `due` ("2026-10-17T00:00:00.000Z": the time
// part is always midnight UTC and ignored, the API can neither read nor set
// a time). The date part is the day the user picked, whatever their time
// zone: it is compared with the current date in the time zone of Gladys (the
// `TZ` variable the supervisor injects into the container).
// -----------------------------------------------------------------------------

const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Due phases of a task, in order. `today` = due today, before the hour of the
// "due" trigger; `due` = due today, that hour passed.
const PHASES = {
  NONE: 'none',
  UPCOMING: 'upcoming',
  TODAY: 'today',
  DUE: 'due',
  OVERDUE: 'overdue',
};

/**
 * @description A valid time zone, or undefined (the system one).
 * @param {unknown} tz - The candidate (`process.env.TZ`).
 * @returns {string|undefined} The time zone.
 * @example
 * safeTimeZone('Europe/Paris'); // -> 'Europe/Paris'
 */
function safeTimeZone(tz) {
  if (typeof tz !== 'string' || tz.trim() === '') {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return undefined;
  }
}

/**
 * @description The local date and hour of an instant.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - The time zone.
 * @returns {{ date: string, hour: number }} `YYYY-MM-DD` and 0-23.
 * @example
 * localClock(Date.parse('2026-10-16T22:30:00Z'), 'Europe/Paris'); // -> { date: '2026-10-17', hour: 0 }
 */
function localClock(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

/**
 * @description A calendar date plus a number of days.
 * @param {string} date - `YYYY-MM-DD`.
 * @param {number} days - Days to add.
 * @returns {string} `YYYY-MM-DD`.
 * @example
 * addDays('2026-10-31', 1); // -> '2026-11-01'
 */
function addDays(date, days) {
  const [, y, m, d] = DATE_REGEX.exec(date);
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * @description Check a calendar date.
 * @param {unknown} value - The candidate.
 * @returns {boolean} A real `YYYY-MM-DD` date.
 * @example
 * isDate('2026-02-30'); // -> false
 */
function isDate(value) {
  const match = DATE_REGEX.exec(String(value ?? ''));
  if (!match) {
    return false;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/**
 * @description The date part of a Google `due`.
 * @param {unknown} due - `2026-10-17T00:00:00.000Z` (or absent).
 * @returns {string|null} `YYYY-MM-DD`.
 */
function dueDateOf(due) {
  const date = typeof due === 'string' ? due.slice(0, 10) : '';
  return isDate(date) ? date : null;
}

/**
 * @description The Google `due` of a calendar date.
 * @param {string} date - `YYYY-MM-DD`.
 * @returns {string} RFC 3339, midnight UTC (the time is ignored by Google).
 */
const dueOfDate = (date) => `${date}T00:00:00.000Z`;

// Words accepted in a free date field, in the four languages.
const TODAY_WORDS = ['today', "aujourd'hui", 'aujourd’hui', 'heute', 'hoy'];
const TOMORROW_WORDS = ['tomorrow', 'demain', 'morgen', 'mañana', 'manana'];

/**
 * @description Read a due date typed by a user or a scene.
 * @param {object} input - `{ when, date }`: `when` is none | today | tomorrow
 *   | next_week | date (default: `date` when given, else none); `date` is
 *   `YYYY-MM-DD`, `DD/MM/YYYY`, today, tomorrow (4 languages) or `+N` days.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @returns {string|null} The date, null for none.
 * @throws {Error} With `code: 'invalid_date'` when the date cannot be read.
 * @example
 * parseDue({ date: '+3' }, '2026-10-17'); // -> '2026-10-20'
 */
function parseDue({ when, date } = {}, today) {
  const text = typeof date === 'string' ? date.trim().toLowerCase() : '';
  const mode = typeof when === 'string' && when ? when : text ? 'date' : 'none';
  if (mode === 'none') {
    return null;
  }
  if (mode === 'today') {
    return today;
  }
  if (mode === 'tomorrow') {
    return addDays(today, 1);
  }
  if (mode === 'next_week') {
    return addDays(today, 7);
  }
  if (TODAY_WORDS.includes(text)) {
    return today;
  }
  if (TOMORROW_WORDS.includes(text)) {
    return addDays(today, 1);
  }
  const relative = /^\+\s*(\d{1,3})$/.exec(text);
  if (relative) {
    return addDays(today, Number(relative[1]));
  }
  if (isDate(text)) {
    return text;
  }
  const european = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  if (european) {
    const candidate = `${european[3]}-${european[2].padStart(2, '0')}-${european[1].padStart(2, '0')}`;
    if (isDate(candidate)) {
      return candidate;
    }
  }
  if (mode === 'date' && !text) {
    return null;
  }
  const error = new Error(`Unreadable due date: ${String(date).slice(0, 40)}`);
  error.code = 'invalid_date';
  throw error;
}

/**
 * @description Keep what the integration needs of a Google task.
 * @param {object} raw - The Task resource.
 * @returns {object} `{ id, title, notes, due, parent, position, url }`.
 */
function normalizeTask(raw) {
  return {
    id: String(raw.id),
    title: String(raw.title ?? '').trim(),
    notes: String(raw.notes ?? ''),
    due: dueDateOf(raw.due),
    parent: raw.parent ? String(raw.parent) : null,
    position: String(raw.position ?? ''),
    url: typeof raw.webViewLink === 'string' ? raw.webViewLink : null,
  };
}

/**
 * @description Whether a Google task is still to do.
 * @param {object} raw - The Task resource.
 * @returns {boolean} Not completed, not deleted.
 */
const isOpen = (raw) => raw.status !== 'completed' && raw.deleted !== true;

/**
 * @description The due phase of a task.
 * @param {object} task - A normalized task.
 * @param {{ date: string, hour: number }} clock - Local date and hour.
 * @param {number} dueHour - Hour of the "due" trigger.
 * @returns {string} A PHASES value.
 */
function phaseOf(task, clock, dueHour) {
  if (!task.due) {
    return PHASES.NONE;
  }
  if (task.due < clock.date) {
    return PHASES.OVERDUE;
  }
  if (task.due > clock.date) {
    return PHASES.UPCOMING;
  }
  return clock.hour >= dueHour ? PHASES.DUE : PHASES.TODAY;
}

/**
 * @description The counters of a list.
 * @param {Map<string, object>} tasks - The open tasks.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @returns {{ pending: number, overdue: number, today: number }} The counters.
 */
function countersOf(tasks, today) {
  let overdue = 0;
  let dueToday = 0;
  for (const task of tasks.values()) {
    if (task.due && task.due < today) {
      overdue += 1;
    } else if (task.due === today) {
      dueToday += 1;
    }
  }
  return { pending: tasks.size, overdue, today: dueToday };
}

/**
 * @description The open tasks in reading order: overdue and dated first (by
 * date), then the undated ones in the order of the list.
 * @param {Iterable<object>} tasks - The open tasks.
 * @returns {object[]} The sorted tasks.
 */
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.due && b.due && a.due !== b.due) {
      return a.due < b.due ? -1 : 1;
    }
    if (Boolean(a.due) !== Boolean(b.due)) {
      return a.due ? -1 : 1;
    }
    return a.position.localeCompare(b.position) || a.title.localeCompare(b.title);
  });
}

/**
 * @description Find the open task a title designates: exact (case and accents
 * ignored) first, then the first one containing it, in reading order.
 * @param {Iterable<object>} tasks - The open tasks.
 * @param {string} title - The title searched.
 * @returns {object|null} The task.
 */
function findByTitle(tasks, title) {
  const fold = (text) =>
    String(text ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const wanted = fold(title);
  if (!wanted) {
    return null;
  }
  const sorted = sortTasks(tasks);
  return (
    sorted.find((task) => fold(task.title) === wanted) ??
    sorted.find((task) => fold(task.title).includes(wanted)) ??
    null
  );
}

export {
  PHASES,
  safeTimeZone,
  localClock,
  addDays,
  isDate,
  dueDateOf,
  dueOfDate,
  parseDue,
  normalizeTask,
  isOpen,
  phaseOf,
  countersOf,
  sortTasks,
  findByTitle,
};
