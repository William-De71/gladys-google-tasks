// -----------------------------------------------------------------------------
// Google Tasks API v1 client (https://developers.google.com/workspace/tasks/reference/rest).
//
// Only the documented methods and fields are used:
//   - tasklists.list  GET  /tasks/v1/users/@me/lists           (maxResults ≤ 1000)
//   - tasks.list      GET  /tasks/v1/lists/{list}/tasks        (maxResults ≤ 100,
//                     showCompleted, showHidden, showDeleted, showAssigned,
//                     updatedMin, pageToken)
//   - tasks.insert    POST /tasks/v1/lists/{list}/tasks
//   - tasks.patch     PATCH /tasks/v1/lists/{list}/tasks/{task}
//   - tasks.clear     POST /tasks/v1/lists/{list}/clear
//
// Every call is counted (the default quota of a Google Cloud project is
// 50 000 requests a day, shared by everything using the same client), times
// out after 15 s and retries once with a fresh token after a 401.
// -----------------------------------------------------------------------------

const API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const REQUEST_TIMEOUT_MS = 15000;
const TASKS_PAGE_SIZE = 100;
const LISTS_PAGE_SIZE = 1000;
// A safety net against a pagination loop: 100 pages of 100 tasks.
const MAX_PAGES = 100;

/** An error of the Tasks API. */
class TasksApiError extends Error {
  /**
   * @param {string} message - The message.
   * @param {object} [options] - `{ status, reason }`.
   */
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'TasksApiError';
    this.status = status;
    this.reason = reason;
  }

  /** @returns {boolean} The daily or per-minute quota is exhausted. */
  get rateLimited() {
    return (
      this.status === 429 ||
      (this.status === 403 && /rateLimit|quota|userRateLimit/i.test(this.reason))
    );
  }

  /** @returns {boolean} The Tasks API is not enabled in the Cloud project. */
  get apiDisabled() {
    return this.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(this.reason);
  }
}

/**
 * @description The Tasks API client.
 * @param {object} options - `{ tokens, fetchImpl, now }`.
 * @returns {object} The client.
 */
function createTasksClient({ tokens, fetchImpl, now = Date.now }) {
  let calls = { day: '', count: 0, last: 0 };

  /** Count a call (per UTC day: Google resets the quota at midnight Pacific time). */
  function count() {
    const day = new Date(now()).toISOString().slice(0, 10);
    calls = { day, count: calls.day === day ? calls.count + 1 : 1, last: now() };
  }

  /**
   * @description One authorized request.
   * @param {string} method - The HTTP method.
   * @param {string} path - The path under /tasks/v1.
   * @param {object} [options] - `{ query, body }`.
   * @returns {Promise<object>} The JSON answer ({} when empty).
   */
  async function request(method, path, { query, body } = {}) {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accessToken = await tokens.getAccessToken(attempt > 0);
      count();
      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TasksApiError(`Google Tasks unreachable: ${err.message}`);
      }
      if (response.status === 401 && attempt === 0) {
        continue;
      }
      const text = await response.text().catch(() => '');
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      if (response.ok) {
        return json ?? {};
      }
      const error = json?.error ?? {};
      const reason = [
        error.status,
        ...(Array.isArray(error.errors) ? error.errors.map((e) => e?.reason) : []),
        ...(Array.isArray(error.details) ? error.details.map((d) => d?.reason) : []),
      ]
        .filter(Boolean)
        .join(',');
      throw new TasksApiError(
        `Google Tasks ${method} ${path.replace(/\/lists\/[^/]+/, '/lists/…')}: HTTP ${response.status}${
          error.message ? ` (${String(error.message).slice(0, 160)})` : ''
        }`,
        { status: response.status, reason },
      );
    }
    throw new TasksApiError('Google Tasks refused the access token twice', { status: 401 });
  }

  /**
   * @description Follow the pages of a list method.
   * @param {string} path - The path.
   * @param {object} query - The query.
   * @returns {Promise<object[]>} Every item.
   */
  async function paginate(path, query) {
    const items = [];
    let pageToken;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answer = await request('GET', path, { query: { ...query, pageToken } });
      items.push(...(Array.isArray(answer.items) ? answer.items : []));
      pageToken = answer.nextPageToken;
      if (!pageToken) {
        return items;
      }
    }
    return items;
  }

  const listPath = (listId) => `/lists/${encodeURIComponent(listId)}`;

  return {
    /** @returns {{ day: string, count: number, last: number }} The calls of the day. */
    calls: () => ({ ...calls }),

    /** @returns {Promise<object[]>} The task lists of the account. */
    listTaskLists: () => paginate('/users/@me/lists', { maxResults: LISTS_PAGE_SIZE }),

    /**
     * @description The tasks of a list.
     * @param {string} listId - The task list id.
     * @param {object} [options] - `{ updatedMin }` (RFC 3339): changes only,
     *   completed, hidden and deleted tasks included; without it, the tasks
     *   still to do.
     * @returns {Promise<object[]>} The tasks.
     */
    listTasks: (listId, { updatedMin } = {}) =>
      paginate(`${listPath(listId)}/tasks`, {
        maxResults: TASKS_PAGE_SIZE,
        showAssigned: true,
        ...(updatedMin
          ? { updatedMin, showCompleted: true, showHidden: true, showDeleted: true }
          : { showCompleted: false }),
      }),

    /**
     * @description Create a task.
     * @param {string} listId - The task list id.
     * @param {object} task - `{ title, notes?, due? }` (due: RFC 3339, date only).
     * @returns {Promise<object>} The created task.
     */
    insertTask: (listId, task) => request('POST', `${listPath(listId)}/tasks`, { body: task }),

    /**
     * @description Mark a task completed.
     * @param {string} listId - The task list id.
     * @param {string} taskId - The task id.
     * @returns {Promise<object>} The updated task.
     */
    completeTask: (listId, taskId) =>
      request('PATCH', `${listPath(listId)}/tasks/${encodeURIComponent(taskId)}`, {
        body: { status: 'completed' },
      }),

    /**
     * @description Hide the completed tasks of a list (tasks.clear).
     * @param {string} listId - The task list id.
     * @returns {Promise<void>}
     */
    clearCompleted: async (listId) => {
      await request('POST', `${listPath(listId)}/clear`);
    },
  };
}

export { API_BASE, TasksApiError, createTasksClient };
