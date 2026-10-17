// The whole integration against the fake Gladys of the SDK (which checks the
// discovered devices and the states like the host API does) and a fake Google.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, ACTIONS, SCENE_ACTIONS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { SCOPE } from '../src/auth.js';
import {
  fakeGoogle,
  silent,
  NOW,
  TZ,
  CLIENT_ID,
  CLIENT_SECRET,
  LIST_ID,
  LIST2_ID,
} from './helpers/fakes.js';

const PREFIX = 'ext:test-integration';
const LIST = `${PREFIX}:tasklist:${LIST_ID}`;
const LIST2 = `${PREFIX}:tasklist:${LIST2_ID}`;
const REDIRECT = 'https://my.gladysassistant.com/redirect/oauth';
const CLIENT = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET };
const CONNECTED = {
  ...CLIENT,
  access_token: 'access-0',
  refresh_token: 'refresh-1',
  token_expires_at: String(NOW + 3600000),
  token_client_id: CLIENT_ID,
};
const HOUR = 3600000;

/**
 * @description The integration on a fake Gladys and a fake Google.
 * @param {object} [options] - `{ config, google, clock }`.
 * @returns {Promise<object>} `{ gladys, app, google, clock }`.
 */
async function startApp({ config = CONNECTED, clock = { now: NOW }, google } = {}) {
  const fetchImpl = google ?? fakeGoogle(clock);
  const gladys = createFakeGladys({ config: { ...config } });
  const app = createApp(gladys, {
    fetchImpl,
    now: () => clock.now,
    timeZone: TZ,
    logger: silent,
  });
  await gladys.connect();
  await app.idle();
  return { gladys, app, google: fetchImpl, clock };
}

const create = async (gladys, externalId = LIST) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const assertValid = (content) => {
  assert.deepEqual(validateWidgetContent(content), []);
};

test('without a client, then without a connection: says what to do', async (t) => {
  const first = await startApp({ config: {} });
  t.after(() => first.gladys.fake.shutdown());
  assert.equal(first.gladys.fake.connectionStatus.connected, false);
  assert.match(first.gladys.fake.connectionStatus.message.fr, /Client ID/);
  const second = await startApp({ config: CLIENT });
  t.after(() => second.gladys.fake.shutdown());
  assert.match(second.gladys.fake.connectionStatus.message.en, /Connect with Google/);
  assert.equal(second.google.state.calls.length, 0, 'no call without tokens');
});

test('OAuth: authorization URL, persisted state, code exchange with PKCE, first reading', async (t) => {
  const { gladys, google } = await startApp({ config: CLIENT });
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.oauthAuthorizeUrl('google_account', REDIRECT);
  assert.equal(ack.success, true);
  const url = new URL(ack.data.authorize_url);
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const query = Object.fromEntries(url.searchParams);
  assert.equal(query.client_id, CLIENT_ID);
  assert.equal(query.redirect_uri, REDIRECT);
  assert.equal(query.response_type, 'code');
  assert.equal(query.scope, SCOPE);
  assert.equal(query.access_type, 'offline');
  assert.equal(query.prompt, 'consent');
  assert.equal(query.code_challenge_method, 'S256');
  assert.match(query.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  // Persisted for a restart between "Connect" and the return from Google.
  assert.equal(gladys.fake.config.oauth_state, query.state);
  assert.ok(gladys.fake.config.oauth_code_verifier.length >= 43);

  const refused = await gladys.fake.oauthCallback('google_account', {
    code: 'good-code',
    state: 'forged',
    redirectUri: REDIRECT,
  });
  assert.equal(refused.success, false);
  assert.match(gladys.fake.connectionStatus.message.en, /does not match/);

  const accepted = await gladys.fake.oauthCallback('google_account', {
    code: 'good-code',
    state: query.state,
    redirectUri: REDIRECT,
  });
  assert.equal(accepted.success, true);
  const exchange = google.state.calls.find((call) => call.startsWith('POST /token'));
  assert.ok(exchange);
  assert.equal(gladys.fake.config.refresh_token, 'refresh-1');
  assert.equal(gladys.fake.config.token_client_id, CLIENT_ID);
  assert.equal(gladys.fake.config.oauth_state, '');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /2 list\(s\), 5 task\(s\) to do/);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Google Tasks: My Tasks', 'Google Tasks: Garden'],
  );
});

test('OAuth: the state survives a restart of the container', async (t) => {
  const first = await startApp({ config: CLIENT });
  const ack = await first.gladys.fake.oauthAuthorizeUrl('google_account', REDIRECT);
  const state = new URL(ack.data.authorize_url).searchParams.get('state');
  const saved = { ...first.gladys.fake.config };
  await first.gladys.fake.shutdown();
  const second = await startApp({ config: saved });
  t.after(() => second.gladys.fake.shutdown());
  const result = await second.gladys.fake.oauthCallback('google_account', {
    code: 'good-code',
    state,
    redirectUri: REDIRECT,
  });
  assert.equal(result.success, true);
  assert.equal(second.gladys.fake.connectionStatus.connected, true);
});

test('OAuth: a refused permission and a wrong secret are explained', async (t) => {
  const google = fakeGoogle();
  // Granular consent: Google answers without the Tasks scope.
  const fetchImpl = async (url, options) => {
    const response = await google(url, options);
    if (url.includes('oauth2.googleapis.com/token') && response.status === 200) {
      const body = await response.json();
      return new Response(JSON.stringify({ ...body, scope: 'openid' }), { status: 200 });
    }
    return response;
  };
  /**
   * @description Connect, then come back from Google.
   * @param {object} config - The configuration.
   * @param {Function} fetchFn - The fake Google.
   * @returns {Promise<object>} `{ gladys, result }`.
   */
  async function connectWith(config, fetchFn) {
    const gladys = createFakeGladys({ config: { ...config } });
    createApp(gladys, { fetchImpl: fetchFn, now: () => NOW, timeZone: TZ, logger: silent });
    await gladys.connect();
    t.after(() => gladys.fake.shutdown());
    const ack = await gladys.fake.oauthAuthorizeUrl('google_account', REDIRECT);
    const state = new URL(ack.data.authorize_url).searchParams.get('state');
    const result = await gladys.fake.oauthCallback('google_account', {
      code: 'good-code',
      state,
      redirectUri: REDIRECT,
    });
    return { gladys, result };
  }
  const denied = await connectWith(CLIENT, fetchImpl);
  assert.equal(denied.result.success, false);
  assert.match(denied.gladys.fake.connectionStatus.message.fr, /cochez la case/);
  const wrong = await connectWith({ ...CLIENT, client_secret: 'GOCSPX-wrong' }, fakeGoogle());
  assert.equal(wrong.result.success, false);
  assert.match(wrong.gladys.fake.connectionStatus.message.en, /invalid_client/);
  assert.equal(wrong.gladys.fake.config.refresh_token, undefined);
});

test('first reading: one device per list, valid counters, no event (baseline)', async (t) => {
  const { gladys, google } = await startApp();
  t.after(() => gladys.fake.shutdown());
  // lists + My Tasks (2 pages of the open tasks) + Garden.
  assert.equal(google.apiCalls(), 4);
  assert.ok(google.state.calls.some((call) => call.includes('showCompleted=false')));
  const device = gladys.fake.discoveredDevices[0];
  assert.equal(device.external_id, LIST);
  assert.equal(device.should_poll, false);
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    ['pending', 'overdue', 'due_today'],
  );
  for (const feature of device.features) {
    for (const field of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
    }
    assert.equal(feature.category, 'counter-sensor');
    assert.equal(feature.type, 'integer');
  }
  assert.equal(gladys.fake.sceneEvents.length, 0);
  // States only once the list is created in Gladys, then all of them.
  assert.equal(gladys.fake.states.length, 0);
  await create(gladys);
  assert.equal(gladys.fake.lastState(`${LIST}:pending`), 4);
  assert.equal(gladys.fake.lastState(`${LIST}:overdue`), 1);
  assert.equal(gladys.fake.lastState(`${LIST}:due_today`), 1);
  assert.ok(gladys.fake.widgetRefreshes.includes(WIDGETS.TASKS));
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: LIST,
    transport: 'cloud',
  });
});

test('next readings: only the changes, task added and completed events, only changed states', async (t) => {
  const { gladys, app, google, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await create(gladys);
  const before = gladys.fake.states.length;
  clock.now += 5 * 60000;
  google.add(LIST_ID, { id: 't-new', title: 'Water the plants', due: '2026-10-20T00:00:00.000Z' });
  google.complete(LIST_ID, 't-undated');
  google.remove(LIST2_ID, 'g-1');
  await app.poll();
  const calls = google.state.calls.slice(-3);
  assert.ok(calls.every((call) => !call.includes('tasks?') || call.includes('updatedMin=')));
  const [added] = eventsOf(gladys, TRIGGERS.TASK_ADDED);
  assert.deepEqual(added.data, {
    list: LIST,
    list_name: 'My Tasks',
    task_id: 't-new',
    title: 'Water the plants',
    notes: '',
    due: '2026-10-20',
    is_subtask: false,
    url: 'https://tasks.google.com/task/t-new',
  });
  const completed = eventsOf(gladys, TRIGGERS.TASK_COMPLETED);
  assert.deepEqual(
    completed.map((event) => event.data.title),
    ['Sort the garage'],
    'a deleted task raises nothing',
  );
  // 4 to do -> 4 (one added, one completed): only nothing changed for pending.
  assert.equal(gladys.fake.lastState(`${LIST}:pending`), 4);
  assert.equal(gladys.fake.states.length, before, 'no unchanged state published again');
  // Event data: flat scalars, at most 30 keys.
  for (const event of gladys.fake.sceneEvents) {
    assert.ok(Object.keys(event.data).length <= 30);
    for (const value of Object.values(event.data)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null);
    }
  }
});

test('due phases: "due" at the configured hour, "overdue" after midnight, once', async (t) => {
  const clock = { now: NOW };
  // 10:00 in Paris; due hour 11.
  const { gladys, app } = await startApp({ clock, config: { ...CONNECTED, due_hour: 11 } });
  t.after(() => gladys.fake.shutdown());
  await app.poll();
  assert.equal(eventsOf(gladys, TRIGGERS.TASK_DUE).length, 0, 'before 11:00');
  clock.now = NOW + HOUR + 5 * 60000; // 11:05
  await app.poll();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.TASK_DUE).map((event) => event.data.title),
    ['Buy bread'],
  );
  await app.poll();
  assert.equal(eventsOf(gladys, TRIGGERS.TASK_DUE).length, 1, 'a transition, not a snapshot');
  clock.now = Date.parse('2026-10-17T22:05:00Z'); // 00:05 on the 18th in Paris
  await app.poll();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.TASK_OVERDUE).map((event) => event.data.title),
    ['Buy bread'],
    'the bill was already overdue at the start: no event',
  );
  clock.now = Date.parse('2026-10-18T09:05:00Z'); // 11:05 on the 18th
  await app.poll();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.TASK_DUE).map((event) => event.data.title),
    ['Buy bread', 'Call the plumber'],
  );
});

test('tasks widget: sorted card list, badges, forms; add and complete without scene events', async (t) => {
  const { gladys, app, google, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await create(gladys);
  const ack = await gladys.fake.widgetGet(WIDGETS.TASKS, {
    settings: { list: LIST },
    language: 'fr',
  });
  const content = ack.data.content;
  assertValid(content);
  const list = content.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge?.text ?? null, item.date ?? null]),
    [
      ['Pay the electricity bill', 'En retard', '2026-10-15'],
      ['Buy bread', 'Aujourd’hui', '2026-10-17'],
      ['Call the plumber', 'Demain', '2026-10-18'],
      ['Sort the garage', null, null],
    ],
  );
  assert.equal(list.items[0].description, 'Before the 20th');
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    [WIDGET_ACTIONS.ADD, WIDGET_ACTIONS.COMPLETE, WIDGET_ACTIONS.REFRESH],
  );

  const added = await gladys.fake.widgetAction(
    WIDGETS.TASKS,
    WIDGET_ACTIONS.ADD,
    {},
    { settings: { list: LIST }, values: { title: 'Take the bins out', when: 'tomorrow' } },
  );
  assert.equal(added.data.message.fr, 'Tâche ajoutée : Take the bins out');
  const created = google.state.tasks.get(LIST_ID).at(-1);
  assert.equal(created.due, '2026-10-18T00:00:00.000Z');
  assert.equal(gladys.fake.lastState(`${LIST}:pending`), 5, 'counted at once');

  const done = await gladys.fake.widgetAction(
    WIDGETS.TASKS,
    WIDGET_ACTIONS.COMPLETE,
    {},
    { settings: { list: LIST }, values: { task: 't-today' } },
  );
  assert.equal(done.data.message.en, 'Task completed: Buy bread');
  assert.equal(gladys.fake.lastState(`${LIST}:due_today`), 0);
  clock.now += 60000;
  await app.poll();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'changes made from Gladys raise no event');

  const invalid = await gladys.fake.widgetAction(
    WIDGETS.TASKS,
    WIDGET_ACTIONS.ADD,
    {},
    { settings: { list: LIST }, values: { title: 'X', when: 'date', date: '31/02/2026' } },
  );
  assert.match(invalid.data.message.en, /Unreadable date/);
  const again = await gladys.fake.widgetAction(
    WIDGETS.TASKS,
    WIDGET_ACTIONS.COMPLETE,
    {},
    { settings: { list: LIST }, values: { task: 't-today' } },
  );
  assert.match(again.data.message.en, /no longer to do/);
});

test('widgets: the "due" view, the overview, and every language', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const due = await gladys.fake.widgetGet(WIDGETS.TASKS, {
      settings: { show: 'due' },
      language,
    });
    assertValid(due.data.content);
    const items = due.data.content.components.find((c) => c.type === 'card-list').items;
    assert.equal(items.length, 2, 'overdue and today only');
    const overview = await gladys.fake.widgetGet(WIDGETS.OVERVIEW, { language });
    assertValid(overview.data.content);
    const tiles = overview.data.content.components.filter((c) => c.type === 'value');
    assert.deepEqual(
      tiles.map((tile) => tile.value),
      [5, 1, 1],
    );
    const status = overview.data.content.components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 2);
  }
});

test('scene actions: add, complete by title (idempotent), read, clear', async (t) => {
  const { gladys, google } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const add = await gladys.fake.sceneAction(SCENE_ACTIONS.ADD_TASK, {
    list: LIST2,
    title: 'Mow the lawn',
    notes: 'Front garden',
    when: 'date',
    date: '+3',
  });
  assert.equal(add.success, true);
  assert.deepEqual(Object.keys(add.data.outputs).sort(), ['due', 'task_id', 'title', 'url']);
  assert.equal(add.data.outputs.due, '2026-10-20');

  const complete = await gladys.fake.sceneAction(SCENE_ACTIONS.COMPLETE_TASK, {
    title: 'buy BREAD',
  });
  assert.deepEqual(complete.data.outputs, {
    completed: true,
    title: 'Buy bread',
    list_name: 'My Tasks',
  });
  const again = await gladys.fake.sceneAction(SCENE_ACTIONS.COMPLETE_TASK, { title: 'Buy bread' });
  assert.equal(again.success, true);
  assert.equal(again.data.outputs.completed, false);

  const read = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_TASKS, { scope: 'due' });
  assert.deepEqual(read.data.outputs, {
    count: 1,
    overdue_count: 1,
    today_count: 0,
    titles: 'Pay the electricity bill',
    summary: '1 task(s): Pay the electricity bill',
    next_title: 'Pay the electricity bill',
    next_due: '2026-10-15',
  });
  const garden = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_TASKS, { list: LIST2 });
  assert.equal(garden.data.outputs.count, 2);

  const clear = await gladys.fake.sceneAction(SCENE_ACTIONS.CLEAR_COMPLETED, { list: LIST });
  assert.equal(clear.success, true);
  assert.ok(google.state.calls.some((call) => call === `POST /tasks/v1/lists/${LIST_ID}/clear`));
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a scene action never starts scenes');

  const missing = await gladys.fake.sceneAction(SCENE_ACTIONS.ADD_TASK, { title: '' });
  assert.equal(missing.success, false);
});

test('an expired access token is refreshed once, a 401 is retried once', async (t) => {
  const { gladys, app, google, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  clock.now += 2 * HOUR;
  google.state.expireAccessOnce = true;
  assert.equal(await app.poll(), true);
  const tokenCalls = google.state.calls.filter((call) => call.startsWith('POST /token'));
  assert.equal(tokenCalls.length, 2, 'expired, then after the 401');
  assert.match(gladys.fake.config.access_token, /^access-\d+$/);
});

test('invalid_grant: disconnected, unreachable badge, Google left alone', async (t) => {
  const { gladys, app, google, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await create(gladys);
  google.state.revoked = true;
  clock.now += 2 * HOUR;
  assert.equal(await app.poll(), false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /revoked/);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  const calls = google.state.calls.length;
  await app.poll();
  await gladys.fake.widgetAction(WIDGETS.OVERVIEW, WIDGET_ACTIONS.REFRESH);
  assert.equal(google.state.calls.length, calls, 'no more token request');
  const widget = await gladys.fake.widgetGet(WIDGETS.TASKS, { language: 'en' });
  assert.match(widget.data.content.components[0].text, /not connected/);
});

test('API not enabled in the Cloud project: explained in the status', async (t) => {
  const google = fakeGoogle();
  google.state.apiDisabled = true;
  const { gladys } = await startApp({ google });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /not enabled/);
});

test('configuration actions: test, refresh, diagnostic without secrets, disconnect with revocation', async (t) => {
  const lines = [];
  const logger = { ...silent, info: (line) => lines.push(String(line)) };
  const clock = { now: NOW };
  const google = fakeGoogle(clock);
  const gladys = createFakeGladys({ config: { ...CONNECTED } });
  createApp(gladys, { fetchImpl: google, now: () => clock.now, timeZone: TZ, logger });
  await gladys.connect();
  t.after(() => gladys.fake.shutdown());
  const test1 = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(test1.data.message.en, /2 list\(s\), 5 task\(s\) to do, 1 overdue/);
  const refresh = await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(refresh.data.message.fr, /Google Tasks relu/);
  await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  const diagnostic = lines.filter((line) => line.startsWith('[diagnostic]')).join('\n');
  assert.match(diagnostic, /Europe\/Paris/);
  for (const secret of [CLIENT_SECRET, 'refresh-1', 'access-', 'Buy bread', CLIENT_ID]) {
    assert.ok(!diagnostic.includes(secret), secret);
  }
  const bye = await gladys.fake.action(ACTIONS.DISCONNECT);
  assert.match(bye.data.message.en, /Disconnected/);
  assert.ok(google.state.calls.some((call) => call.startsWith('POST /revoke')));
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('the tokens of another Client ID are dropped', async (t) => {
  const { gladys, google } = await startApp({
    config: { ...CONNECTED, client_id: 'other.apps.googleusercontent.com' },
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(google.apiCalls(), 0);
  assert.equal(gladys.fake.config.refresh_token, '');
  assert.equal(gladys.fake.connectionStatus.connected, false);
});
