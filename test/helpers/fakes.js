// Fakes for the tests: Google (OAuth token endpoint + Tasks API v1) behind a
// `fetch`, following the documented requests and resources. Tests never
// touch the network.

import { TOKEN_URL, REVOKE_URL, SCOPE } from '../../src/auth.js';
import { API_BASE } from '../../src/tasks-api.js';

// Saturday 17 October 2026, 10:00 in Paris (08:00 UTC).
const NOW = Date.parse('2026-10-17T08:00:00Z');
const TZ = 'Europe/Paris';
const CLIENT_ID = '123456789012-abcdefghij.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-test-secret';
const LIST_ID = 'MDk1NjQ5MDQ2NzY3ODgwNzQ2MTE6MDow';
const LIST2_ID = 'TjNfZ2FyZGVuX2xpc3RfaWQ';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A fake Google, as a `fetch`.
 * @param {object} clock - `{ now }`, shared with the app.
 * @returns {Function} The fetch, with `state`, helpers and counters.
 */
function fakeGoogle(clock = { now: NOW }) {
  const state = {
    lists: [
      { id: LIST_ID, title: 'My Tasks' },
      { id: LIST2_ID, title: 'Garden' },
    ],
    tasks: new Map([
      [
        LIST_ID,
        [
          {
            id: 't-overdue',
            title: 'Pay the electricity bill',
            status: 'needsAction',
            due: '2026-10-15T00:00:00.000Z',
            position: '00000000000000000001',
            notes: 'Before the 20th',
          },
          {
            id: 't-today',
            title: 'Buy bread',
            status: 'needsAction',
            due: '2026-10-17T00:00:00.000Z',
            position: '00000000000000000002',
          },
          {
            id: 't-tomorrow',
            title: 'Call the plumber',
            status: 'needsAction',
            due: '2026-10-18T00:00:00.000Z',
            position: '00000000000000000003',
          },
          {
            id: 't-undated',
            title: 'Sort the garage',
            status: 'needsAction',
            position: '00000000000000000004',
          },
          {
            id: 't-done',
            title: 'Old task',
            status: 'completed',
            hidden: true,
            completed: '2026-10-10T09:00:00.000Z',
            position: '00000000000000000005',
          },
        ],
      ],
      [LIST2_ID, [{ id: 'g-1', title: 'Prune the roses', status: 'needsAction', position: '1' }]],
    ]),
    revoked: false,
    expireAccessOnce: false,
    apiDisabled: false,
    calls: [],
    nextId: 1,
    accessCount: 0,
  };
  const stamp = () => new Date(clock.now).toISOString();
  for (const tasks of state.tasks.values()) {
    tasks.forEach((task) => {
      task.updated = '2026-10-01T00:00:00.000Z';
      task.webViewLink = `https://tasks.google.com/task/${task.id}`;
    });
  }

  const json = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const parsed = new URL(url);
    state.calls.push(`${method} ${parsed.pathname}${parsed.search}`);
    if (url === TOKEN_URL) {
      const form = new URLSearchParams(options.body);
      if (form.get('client_secret') !== CLIENT_SECRET) {
        return json(401, { error: 'invalid_client', error_description: 'Unauthorized' });
      }
      if (form.get('grant_type') === 'authorization_code') {
        if (form.get('code') !== 'good-code' || !form.get('code_verifier')) {
          return json(400, { error: 'invalid_grant', error_description: 'Bad Request' });
        }
        state.accessCount += 1;
        return json(200, {
          access_token: `access-${state.accessCount}`,
          expires_in: 3599,
          refresh_token: 'refresh-1',
          scope: form.get('code_scope') ?? SCOPE,
          token_type: 'Bearer',
        });
      }
      if (state.revoked) {
        return json(400, {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        });
      }
      state.accessCount += 1;
      return json(200, {
        access_token: `access-${state.accessCount}`,
        expires_in: 3599,
        scope: SCOPE,
        token_type: 'Bearer',
      });
    }
    if (url === REVOKE_URL) {
      return json(200, {});
    }
    if (!url.startsWith(API_BASE)) {
      throw new Error(`Unexpected URL ${url}`);
    }
    if (!/^Bearer access-\d+$/.test(options.headers?.Authorization ?? '')) {
      return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    }
    if (state.expireAccessOnce) {
      state.expireAccessOnce = false;
      return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    }
    if (state.apiDisabled) {
      return json(403, {
        error: {
          code: 403,
          message: 'Google Tasks API has not been used in project 1 before or it is disabled.',
          status: 'PERMISSION_DENIED',
          errors: [{ reason: 'accessNotConfigured' }],
        },
      });
    }
    const path = parsed.pathname.replace('/tasks/v1', '');
    const query = parsed.searchParams;
    if (method === 'GET' && path === '/users/@me/lists') {
      return json(200, {
        kind: 'tasks#taskLists',
        items: state.lists.map((list) => ({ ...list })),
      });
    }
    const match = /^\/lists\/([^/]+)\/(tasks|clear)(?:\/([^/]+))?$/.exec(path);
    if (!match) {
      return json(404, { error: { code: 404, message: 'Not Found' } });
    }
    const listId = decodeURIComponent(match[1]);
    const tasks = state.tasks.get(listId);
    if (!tasks) {
      return json(404, { error: { code: 404, message: 'Task list not found' } });
    }
    if (match[2] === 'clear' && method === 'POST') {
      tasks.forEach((task) => {
        if (task.status === 'completed') {
          task.hidden = true;
          task.updated = stamp();
        }
      });
      return json(204);
    }
    if (method === 'GET') {
      const updatedMin = query.get('updatedMin');
      const items = tasks.filter((task) => {
        if (updatedMin) {
          return task.updated >= updatedMin;
        }
        if (task.deleted || (task.hidden && query.get('showHidden') !== 'true')) {
          return false;
        }
        return query.get('showCompleted') !== 'false' || task.status !== 'completed';
      });
      // Pages of 2 to exercise the pagination.
      const start = Number(query.get('pageToken') ?? 0);
      const page = items.slice(start, start + 2);
      return json(200, {
        kind: 'tasks#tasks',
        items: page.map((task) => ({ ...task })),
        ...(start + 2 < items.length ? { nextPageToken: String(start + 2) } : {}),
      });
    }
    if (method === 'POST') {
      const body = JSON.parse(options.body);
      const task = {
        id: `new-${state.nextId++}`,
        title: body.title,
        notes: body.notes,
        due: body.due,
        status: 'needsAction',
        position: '00000000000000000000',
        updated: stamp(),
      };
      task.webViewLink = `https://tasks.google.com/task/${task.id}`;
      tasks.push(task);
      return json(200, { ...task });
    }
    if (method === 'PATCH') {
      const task = tasks.find((candidate) => candidate.id === decodeURIComponent(match[3]));
      if (!task) {
        return json(404, { error: { code: 404, message: 'Task not found' } });
      }
      Object.assign(task, JSON.parse(options.body), { updated: stamp() });
      if (task.status === 'completed') {
        task.completed = stamp();
      }
      return json(200, { ...task });
    }
    return json(405, { error: { code: 405, message: 'Method Not Allowed' } });
  };

  Object.assign(fetchImpl, {
    state,
    /** Add a task as the Google app would. */
    add(listId, task) {
      const full = {
        status: 'needsAction',
        position: '00000000000000000009',
        ...task,
        updated: stamp(),
        webViewLink: `https://tasks.google.com/task/${task.id}`,
      };
      state.tasks.get(listId).push(full);
      return full;
    },
    /** Complete a task as the Google app does (hidden at once). */
    complete(listId, id) {
      const task = state.tasks.get(listId).find((candidate) => candidate.id === id);
      Object.assign(task, {
        status: 'completed',
        hidden: true,
        completed: stamp(),
        updated: stamp(),
      });
    },
    /** Delete a task. */
    remove(listId, id) {
      const task = state.tasks.get(listId).find((candidate) => candidate.id === id);
      Object.assign(task, { deleted: true, updated: stamp() });
    },
    apiCalls: () => state.calls.filter((call) => call.includes('/tasks/v1')).length,
  });
  return fetchImpl;
}

export { NOW, TZ, CLIENT_ID, CLIENT_SECRET, LIST_ID, LIST2_ID, silent, fakeGoogle };
