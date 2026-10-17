// -----------------------------------------------------------------------------
// The Google Tasks integration, wired to a Gladys client.
//
// `createApp(gladys)` registers every handler on the client it receives:
// `new GladysIntegration()` in production (index.js), the fake Gladys of the
// SDK in the tests. Nothing here connects: the caller does, once the
// handlers are registered.
//
// Data flow: Google Tasks has no push API, so the lists are read every
// `poll_minutes` by an internal timer (sync.js), and again a few seconds
// after a change made from Gladys. Each reading publishes the counters that
// changed, the scene events of the transitions and a widget refresh.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import {
  ACCOUNT_FIELD,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  normalizeConfig,
  readLanguage,
} from './config.js';
import {
  AuthError,
  buildAuthorizeUrl,
  createPkce,
  createTokenManager,
  exchangeCode,
  revokeToken,
} from './auth.js';
import { createTasksClient, TasksApiError } from './tasks-api.js';
import { createMirror } from './sync.js';
import {
  PHASES,
  countersOf,
  dueOfDate,
  findByTitle,
  localClock,
  parseDue,
  phaseOf,
  safeTimeZone,
  sortTasks,
} from './tasks.js';
import { idsOf, parseExternalId, buildDevice, buildStates } from './device.js';
import { TRIGGERS, taskEventData } from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  SHOW,
  messageContent,
  buildTasksWidget,
  buildOverviewWidget,
} from './widgets.js';
import { t, all, each } from './i18n.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  REFRESH: 'refresh',
  DIAGNOSTIC: 'diagnostic',
  DISCONNECT: 'disconnect',
};
const SCENE_ACTIONS = {
  ADD_TASK: 'add_task',
  COMPLETE_TASK: 'complete_task',
  GET_TASKS: 'get_tasks',
  CLEAR_COMPLETED: 'clear_completed',
};
// Scopes of the get_tasks scene action.
const SCOPES = { ALL: 'all', DUE: 'due', OVERDUE: 'overdue', TODAY: 'today' };

const MINUTE = 60 * 1000;
// Unchanged counters again every hour, so the dashboard never shows them as outdated.
const HEARTBEAT_MS = 60 * MINUTE;
const RETRY_MS = 5 * MINUTE;
// The reading after a change made from Gladys.
const SOON_MS = 10 * 1000;
const WIDGET_REFRESH_MIN_MS = 10 * 1000;
const MAX_TITLE = 1024;
const MAX_NOTES = 8192;

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.now] - Clock.
 * @param {string} [options.timeZone] - Time zone (default: TZ).
 * @param {object} [options.logger] - Logger.
 * @returns {object} What the tests look into.
 */
export function createApp(
  gladys,
  { fetchImpl = fetch, now = Date.now, timeZone = process.env.TZ, logger = sdkLogger } = {},
) {
  const zone = safeTimeZone(timeZone);
  let config = normalizeConfig();
  let lastLanguage = 'en';
  let createdDevices = new Set();
  let createdFeatures = new Set();
  let lastStatus = null;
  let pollTimer = null;
  let soonTimer = null;
  let retryTimer = null;
  let starting = Promise.resolve();
  let queue = Promise.resolve();
  let offered = '';
  let lastError = null;
  let pendingAuth = { state: '', verifier: '' };
  const transports = new Map();
  const widgetRefreshedAt = new Map();

  const tokens = createTokenManager({
    fetchImpl,
    now,
    getClient: () => ({ clientId: config.clientId, clientSecret: config.clientSecret }),
    saveTokens: async (next) => {
      await gladys.setConfig({
        [INTERNAL_KEYS.accessToken]: next.accessToken,
        [INTERNAL_KEYS.refreshToken]: next.refreshToken,
        [INTERNAL_KEYS.expiresAt]: next.expiresAt ? String(next.expiresAt) : '',
        [INTERNAL_KEYS.tokenClientId]: next.clientId,
      });
    },
  });
  const api = createTasksClient({ tokens, fetchImpl, now });
  const mirror = createMirror({ api, now, logger });

  // --- Helpers ---------------------------------------------------------------------

  const clock = () => localClock(now(), zone);
  const connected = () => tokens.hasGrant() && !tokens.lost;

  /**
   * @description Run one reading or change at a time (the mirror is shared).
   * @param {Function} task - `async () => value`.
   * @returns {Promise<unknown>} Its result.
   */
  function exclusive(task) {
    const run = queue.catch(() => {}).then(task);
    queue = run.catch(() => {});
    return run;
  }

  /**
   * @description The language of the texts written outside a widget request.
   * @returns {string} The language.
   */
  function textLanguage() {
    return config.language === AUTO_LANGUAGE ? lastLanguage : config.language;
  }

  /**
   * @description Remember the language of a widget request.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^(en|fr|de|es)$/.test(next) || next === lastLanguage) {
      return;
    }
    lastLanguage = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} isConnected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(isConnected, message) {
    const signature = JSON.stringify([isConnected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(isConnected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Ask Gladys to refresh a widget (at most once every 10 s).
   * @param {string} key - The widget key.
   */
  function refreshWidget(key) {
    const last = widgetRefreshedAt.get(key) ?? 0;
    if (now() - last < WIDGET_REFRESH_MIN_MS) {
      return;
    }
    widgetRefreshedAt.set(key, now());
    try {
      gladys.requestWidgetRefresh(key);
    } catch (err) {
      logger.debug?.(`Widget refresh not sent: ${err.message}`);
    }
  }

  const refreshWidgets = () => Object.values(WIDGETS).forEach(refreshWidget);

  /**
   * @description Refresh the external ids of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
      createdFeatures = new Set(
        devices.flatMap((device) => (device.features ?? []).map((feature) => feature.external_id)),
      );
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description The list a `source: "devices"` value points at; empty = the
   * first list (the default list of Google Tasks comes first).
   * @param {unknown} deviceExternalId - The value.
   * @param {object} [options] - `{ fallback }`: false = null when empty.
   * @returns {object|null} The mirrored list.
   */
  function resolveList(deviceExternalId, { fallback = true } = {}) {
    const parsed = parseExternalId(deviceExternalId);
    if (parsed && mirror.lists.has(parsed.listId)) {
      return mirror.lists.get(parsed.listId);
    }
    if (parsed || !fallback) {
      return null;
    }
    return mirror.lists.values().next().value ?? null;
  }

  /**
   * @description The totals of every list.
   * @returns {{ lists: number, pending: number, overdue: number, today: number }} The totals.
   */
  function totals() {
    const { date } = clock();
    const sum = { lists: mirror.lists.size, pending: 0, overdue: 0, today: 0 };
    for (const list of mirror.lists.values()) {
      const counters = countersOf(list.tasks, date);
      sum.pending += counters.pending;
      sum.overdue += counters.overdue;
      sum.today += counters.today;
    }
    return sum;
  }

  // --- Publishing ---------------------------------------------------------------------

  /**
   * @description Offer a device per list on the Discovery screen, when the
   * lists or their names changed (or when forced by a scan).
   * @param {boolean} [force] - Even if unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const language = textLanguage();
    const devices = [...mirror.lists.values()].map((list) => buildDevice(gladys, list, language));
    const signature = JSON.stringify(devices.map((device) => [device.external_id, device.name]));
    if (!force && signature === offered) {
      return devices.length;
    }
    await gladys.publishDiscoveredDevices(devices);
    offered = signature;
    return devices.length;
  }

  /**
   * @description Publish the counters that changed (or are an hour old).
   * @param {string} [onlyList] - One list, everything again (device created).
   * @returns {Promise<void>}
   */
  async function publishStates(onlyList) {
    const { date } = clock();
    const states = [];
    for (const list of mirror.lists.values()) {
      if (onlyList && list.id !== onlyList) {
        continue;
      }
      states.push(...buildStates(gladys, list.id, countersOf(list.tasks, date), createdFeatures));
    }
    if (onlyList) {
      gladys.forgetPublishedStates(idsOf(gladys, onlyList).device);
    }
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    }
  }

  /**
   * @description Publish the transport badge of the created lists, on change:
   * cloud, or unreachable once the Google access is lost.
   * @returns {Promise<void>}
   */
  async function publishTransports() {
    const transport = connected() ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE;
    const entries = [];
    for (const list of mirror.lists.values()) {
      const externalId = idsOf(gladys, list.id).device;
      if (createdDevices.has(externalId) && transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await gladys.publishTransports(entries);
      entries.forEach((entry) => transports.set(entry.external_id, entry.transport));
    } catch (err) {
      logger.warn(`Unable to publish the transport: ${err.message}`);
    }
  }

  /**
   * @description Publish a scene event, never failing the caller.
   * @param {string} key - The trigger.
   * @param {object} data - The data.
   */
  function fire(key, data) {
    logger.info(`Scene event ${key}`);
    gladys
      .publishSceneEvent(key, data)
      .catch((err) => logger.warn(`Unable to publish the scene event ${key}: ${err.message}`));
  }

  /**
   * @description The due phases of every task, and their transitions:
   * upcoming/today -> due (the hour of the trigger passed) fires task_due,
   * a dated task going past its date fires task_overdue. A task seen for the
   * first time only gets its phase.
   */
  function evaluatePhases() {
    const now_ = clock();
    for (const list of mirror.lists.values()) {
      const context = { list: idsOf(gladys, list.id).device, listName: list.title };
      const next = new Map();
      for (const task of list.tasks.values()) {
        const phase = phaseOf(task, now_, config.dueHour);
        const before = list.phases.get(task.id);
        next.set(task.id, phase);
        if (before === undefined || before === phase) {
          continue;
        }
        if (phase === PHASES.DUE && [PHASES.UPCOMING, PHASES.TODAY].includes(before)) {
          fire(TRIGGERS.TASK_DUE, taskEventData(task, context));
        } else if (
          phase === PHASES.OVERDUE &&
          [PHASES.UPCOMING, PHASES.TODAY, PHASES.DUE].includes(before)
        ) {
          fire(TRIGGERS.TASK_OVERDUE, taskEventData(task, context));
        }
      }
      list.phases = next;
    }
  }

  /**
   * @description Everything after a reading or a change: devices, counters,
   * transports, widgets.
   * @returns {Promise<void>}
   */
  async function publishAll() {
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the lists: ${err.message}`),
    );
    await publishStates().catch((err) =>
      logger.warn(`Unable to publish the states: ${err.message}`),
    );
    await publishTransports();
    refreshWidgets();
  }

  // --- Reading ---------------------------------------------------------------------------

  /**
   * @description Log an error and show it in the connection status.
   * @param {Error} err - The error.
   * @param {string} what - What failed.
   * @returns {Promise<void>}
   */
  async function handleError(err, what) {
    lastError = { at: now(), what, message: String(err.message).slice(0, 200) };
    if (err instanceof AuthError && err.reauth) {
      await handleAuthLost(err);
      return;
    }
    logger.warn(`${what} failed: ${err.message}`);
    if (err instanceof TasksApiError && err.apiDisabled) {
      await reportStatus(false, all('statusApiDisabled'));
    } else if (err instanceof TasksApiError && err.rateLimited) {
      await reportStatus(true, all('statusQuota'));
    } else {
      await reportStatus(false, all('statusUnreachable'));
    }
  }

  /**
   * @description The Google access is dead (revoked, expired): stop calling
   * Google until the user connects again.
   * @param {Error} err - The error.
   * @returns {Promise<void>}
   */
  async function handleAuthLost(err) {
    logger.error(`Google access lost: ${err.message}. Click "Connect with Google" again.`);
    stopTimers();
    await reportStatus(false, all('statusReauth'));
    await publishTransports();
    refreshWidgets();
  }

  /**
   * @description Read Google Tasks and publish what changed.
   * @returns {Promise<boolean>} True when the reading succeeded.
   */
  function poll() {
    return exclusive(async () => {
      if (!connected()) {
        return false;
      }
      let results;
      try {
        results = await mirror.read();
      } catch (err) {
        await handleError(err, 'Reading Google Tasks');
        return false;
      }
      lastError = null;
      for (const { list, added, completed } of results) {
        const context = { list: idsOf(gladys, list.id).device, listName: list.title };
        added.forEach((task) => fire(TRIGGERS.TASK_ADDED, taskEventData(task, context)));
        completed.forEach((task) => fire(TRIGGERS.TASK_COMPLETED, taskEventData(task, context)));
      }
      evaluatePhases();
      const sum = totals();
      await reportStatus(true, all('statusConnected', sum));
      await publishAll();
      return true;
    });
  }

  /** Read again a few seconds after a change made from Gladys. */
  function pollSoon() {
    clearTimeout(soonTimer);
    soonTimer = setTimeout(() => poll().catch(() => {}), SOON_MS);
    soonTimer.unref?.();
  }

  /** Stop the timers. */
  function stopTimers() {
    clearInterval(pollTimer);
    clearTimeout(soonTimer);
    clearTimeout(retryTimer);
    pollTimer = null;
  }

  /**
   * @description Check the configuration, read, then read on a timer.
   * @returns {Promise<void>}
   */
  async function start() {
    stopTimers();
    if (!config.clientId || !config.clientSecret) {
      await reportStatus(false, all('statusNoClient'));
      return;
    }
    if (!tokens.hasGrant()) {
      await reportStatus(false, all('statusNotConnected'));
      return;
    }
    if (tokens.lost) {
      await reportStatus(false, all('statusReauth'));
      return;
    }
    const ok = await poll();
    if (!ok && tokens.lost) {
      return;
    }
    if (!ok && mirror.readAt() === 0) {
      // Never read yet (Google unreachable at boot): try again soon.
      retryTimer = setTimeout(() => startIfReady().catch(() => {}), RETRY_MS);
      retryTimer.unref?.();
    }
    pollTimer = setInterval(() => poll().catch(() => {}), config.pollMinutes * MINUTE);
    pollTimer.unref?.();
  }

  /**
   * @description Start, one at a time.
   * @returns {Promise<void>}
   */
  function startIfReady() {
    starting = starting.catch(() => {}).then(start);
    return starting;
  }

  // --- OAuth2 ---------------------------------------------------------------------------

  gladys.onOAuthAuthorizeUrl(async (key, redirectUri) => {
    if (key !== ACCOUNT_FIELD) {
      throw new Error(`Unknown account field: ${key}`);
    }
    if (!config.clientId || !config.clientSecret) {
      throw new Error(t('statusNoClient', textLanguage()));
    }
    if (!redirectUri) {
      throw new Error('Gladys gave no redirect URI: update Gladys');
    }
    const { state, verifier, challenge } = createPkce();
    pendingAuth = { state, verifier };
    // Persisted: the container may restart between "Connect" and the return
    // from Google (the memory alone would then refuse a valid answer).
    await gladys.setConfig({
      [INTERNAL_KEYS.oauthState]: state,
      [INTERNAL_KEYS.oauthVerifier]: verifier,
    });
    logger.info(`Google authorization started (redirect URI ${redirectUri})`);
    return buildAuthorizeUrl({ clientId: config.clientId, redirectUri, state, challenge });
  });

  gladys.onOAuthCallback(async (key, { code, state, redirectUri }) => {
    try {
      if (key !== ACCOUNT_FIELD) {
        throw new Error(`Unknown account field: ${key}`);
      }
      let expected = pendingAuth;
      if (!expected.state) {
        const stored = normalizeConfig(await gladys.getConfig()).pendingAuth;
        expected = stored;
      }
      if (!expected.state || expected.state !== state) {
        lastStatus = null;
        await reportStatus(false, all('connectState'));
        throw new Error('OAuth state mismatch');
      }
      const next = await exchangeCode({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        code,
        verifier: expected.verifier,
        redirectUri,
        fetchImpl,
        now,
      });
      pendingAuth = { state: '', verifier: '' };
      await gladys.setConfig({ [INTERNAL_KEYS.oauthState]: '', [INTERNAL_KEYS.oauthVerifier]: '' });
      await tokens.adopt({ ...next, clientId: config.clientId });
      logger.info('Connected to Google Tasks');
      mirror.clear();
      lastStatus = null;
      await startIfReady();
    } catch (err) {
      // The SDK turns the exception into a refused connection without
      // logging it: say why here.
      logger.error(`Google connection failed: ${err.message}`);
      if (err instanceof AuthError) {
        lastStatus = null;
        await reportStatus(
          false,
          err.code === 'scope_denied'
            ? all('connectScope')
            : all('connectFailed', { reason: err.code || 'error' }),
        );
      }
      throw err;
    }
  });

  // --- Devices --------------------------------------------------------------------------

  gladys.onSetValue(async () => {
    throw new Error('The Google Tasks counters are read-only');
  });

  gladys.onScanRequest(async () => {
    if (connected()) {
      await poll();
    }
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} task list(s) offered`);
  });

  // Gladys drops the states of a feature that does not exist yet: publish
  // them all once the list is created, and refresh the widgets.
  gladys.onDeviceCreated(async (device) => {
    await refreshCreatedDevices();
    const parsed = parseExternalId(device.external_id);
    if (parsed && mirror.lists.has(parsed.listId)) {
      await publishStates(parsed.listId).catch((err) =>
        logger.warn(`Unable to publish the states: ${err.message}`),
      );
      transports.delete(device.external_id);
      await publishTransports();
    }
    widgetRefreshedAt.clear();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(async (device) => {
    transports.delete(device.external_id);
    await refreshCreatedDevices();
  });

  // --- Changes made from Gladys -------------------------------------------------------------

  /**
   * @description Create a task (widget form or scene action).
   * @param {object} list - The mirrored list.
   * @param {object} input - `{ title, notes, when, date }`.
   * @returns {Promise<object>} The created task.
   */
  async function addTask(list, { title, notes, when, date }) {
    const cleanTitle = String(title ?? '').trim();
    if (!cleanTitle) {
      const error = new Error('A task needs a title');
      error.code = 'title_required';
      throw error;
    }
    const due = parseDue({ when, date }, clock().date);
    const body = {
      title: cleanTitle.slice(0, MAX_TITLE),
      ...(notes && String(notes).trim() ? { notes: String(notes).trim().slice(0, MAX_NOTES) } : {}),
      ...(due ? { due: dueOfDate(due) } : {}),
    };
    return exclusive(async () => {
      const raw = await api.insertTask(list.id, body);
      const task = mirror.created(list.id, raw);
      // Its phase is known from now on: no due event for the task just created today.
      list.phases.set(task.id, phaseOf(task, clock(), config.dueHour));
      await publishAll();
      pollSoon();
      return task;
    });
  }

  /**
   * @description Complete a task (widget form or scene action).
   * @param {object} list - The mirrored list.
   * @param {object} task - The task.
   * @returns {Promise<void>}
   */
  async function completeTask(list, task) {
    await exclusive(async () => {
      await api.completeTask(list.id, task.id);
      mirror.completed(list.id, task.id);
      list.phases.delete(task.id);
      await publishAll();
      pollSoon();
    });
  }

  /**
   * @description A toast for a failed change.
   * @param {Error} err - The error.
   * @param {string} what - What failed.
   * @returns {Promise<object>} The message.
   */
  async function failureToast(err, what) {
    if (err.code === 'title_required') {
      return all('titleRequired');
    }
    if (err.code === 'invalid_date') {
      return all('invalidDate');
    }
    await handleError(err, what);
    return all(err instanceof AuthError ? 'statusReauth' : 'actionFailed');
  }

  // --- Dashboard widgets ----------------------------------------------------------------

  gladys.onWidgetGet(WIDGETS.TASKS, async ({ settings = {}, language }) => {
    rememberLanguage(language);
    if (!connected()) {
      return messageContent(t('notConnected', language));
    }
    const list = resolveList(settings.list);
    if (!list) {
      return messageContent(t('noList', language));
    }
    const now_ = clock();
    return buildTasksWidget({
      list,
      counters: countersOf(list.tasks, now_.date),
      clock: now_,
      dueHour: config.dueHour,
      show: settings.show === SHOW.DUE ? SHOW.DUE : SHOW.ALL,
      language,
    });
  });

  gladys.onWidgetAction(
    WIDGETS.TASKS,
    async (actionKey, params, { settings = {}, values } = {}) => {
      if (actionKey === WIDGET_ACTIONS.REFRESH) {
        const ok = await poll();
        return ok ? all('refreshDone', totals()) : all('refreshFailed');
      }
      if (!connected()) {
        return all('notConnected');
      }
      const list = resolveList(settings.list);
      if (!list) {
        return all('noList');
      }
      if (actionKey === WIDGET_ACTIONS.ADD) {
        try {
          const task = await addTask(list, values ?? {});
          return each((lang) => t('taskAdded', lang, { title: task.title }));
        } catch (err) {
          return failureToast(err, 'Adding a task');
        }
      }
      if (actionKey === WIDGET_ACTIONS.COMPLETE) {
        const task = list.tasks.get(String(values?.task ?? ''));
        if (!task) {
          return all('taskNotFound');
        }
        try {
          await completeTask(list, task);
          return each((lang) => t('taskCompleted', lang, { title: task.title }));
        } catch (err) {
          return failureToast(err, 'Completing a task');
        }
      }
      throw new Error(`Unknown action ${actionKey}`);
    },
  );

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language }) => {
    rememberLanguage(language);
    if (!connected()) {
      return messageContent(t('notConnected', language));
    }
    if (mirror.lists.size === 0) {
      return messageContent(t('noList', language));
    }
    const { date } = clock();
    return buildOverviewWidget({
      lists: [...mirror.lists.values()].map((list) => ({
        title: list.title,
        counters: countersOf(list.tasks, date),
      })),
      language,
      readAt: mirror.readAt(),
      now: now(),
    });
  });

  gladys.onWidgetAction(WIDGETS.OVERVIEW, async (actionKey) => {
    if (actionKey !== WIDGET_ACTIONS.REFRESH) {
      throw new Error(`Unknown action ${actionKey}`);
    }
    const ok = await poll();
    return ok ? all('refreshDone', totals()) : all('refreshFailed');
  });

  // --- Scene actions -----------------------------------------------------------------------
  // They never fire a scene event: the mirror is updated at once and the
  // changed tasks are quiet (sync.js).

  /** @throws {Error} When Google is not connected. */
  function requireConnection() {
    if (!connected()) {
      throw new Error('Google Tasks is not connected: open the configuration of the integration');
    }
  }

  gladys.onSceneAction(SCENE_ACTIONS.ADD_TASK, async (fields = {}) => {
    requireConnection();
    const list = resolveList(fields.list);
    if (!list) {
      throw new Error('Unknown task list: scan the integration again');
    }
    const task = await addTask(list, fields);
    return { task_id: task.id, title: task.title, due: task.due ?? '', url: task.url ?? '' };
  });

  gladys.onSceneAction(SCENE_ACTIONS.COMPLETE_TASK, async (fields = {}) => {
    requireConnection();
    const lists = fields.list
      ? [resolveList(fields.list, { fallback: false })].filter(Boolean)
      : [...mirror.lists.values()];
    for (const list of lists) {
      const task = findByTitle(list.tasks.values(), fields.title);
      if (task) {
        await completeTask(list, task);
        return { completed: true, title: task.title, list_name: list.title };
      }
    }
    // Idempotent: nothing left to complete is not an error.
    return { completed: false, title: '', list_name: '' };
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_TASKS, async (fields = {}) => {
    requireConnection();
    const lists = fields.list
      ? [resolveList(fields.list, { fallback: false })].filter(Boolean)
      : [...mirror.lists.values()];
    const now_ = clock();
    const today = now_.date;
    const scope = Object.values(SCOPES).includes(fields.scope) ? fields.scope : SCOPES.ALL;
    const keep = {
      [SCOPES.ALL]: () => true,
      [SCOPES.DUE]: (task) => Boolean(task.due) && task.due <= today,
      [SCOPES.OVERDUE]: (task) => Boolean(task.due) && task.due < today,
      [SCOPES.TODAY]: (task) => task.due === today,
    }[scope];
    const tasks = sortTasks(lists.flatMap((list) => [...list.tasks.values()]).filter(keep));
    const language = textLanguage();
    const titles = tasks.map((task) => task.title || '—').join(', ');
    return {
      count: tasks.length,
      overdue_count: tasks.filter((task) => task.due && task.due < today).length,
      today_count: tasks.filter((task) => task.due === today).length,
      titles: titles.slice(0, 10000),
      summary: (tasks.length === 0
        ? t('summaryNone', language)
        : t('summaryTasks', language, { count: tasks.length, titles })
      ).slice(0, 10000),
      next_title: tasks[0]?.title ?? '',
      next_due: tasks[0]?.due ?? '',
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.CLEAR_COMPLETED, async (fields = {}) => {
    requireConnection();
    const lists = fields.list
      ? [resolveList(fields.list, { fallback: false })].filter(Boolean)
      : [...mirror.lists.values()];
    if (fields.list && lists.length === 0) {
      throw new Error('Unknown task list: scan the integration again');
    }
    // Only completed tasks are hidden: the tasks to do, hence the mirror and
    // the counters, do not change.
    await exclusive(async () => {
      for (const list of lists) {
        await api.clearCompleted(list.id);
      }
    });
  });

  // --- Configuration screen actions -------------------------------------------------------

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.clientId || !config.clientSecret) {
      return all('statusNoClient');
    }
    if (!tokens.hasGrant()) {
      return all('statusNotConnected');
    }
    if (tokens.lost) {
      return all('statusReauth');
    }
    const ok = await poll();
    if (!ok) {
      if (tokens.lost) {
        return all('statusReauth');
      }
      return each((lang) => `${t('refreshFailed', lang)} ${lastError?.message ?? ''}`.trim());
    }
    return all('testResult', { ...totals(), calls: api.calls().count });
  });

  gladys.onAction(ACTIONS.REFRESH, async () => {
    if (!connected()) {
      return all(tokens.lost ? 'statusReauth' : 'statusNotConnected');
    }
    const ok = await poll();
    await publishDiscoveredDevices(true).catch(() => {});
    return ok ? all('refreshDone', totals()) : all('refreshFailed');
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    // Gladys passes no DEBUG variable to the container: this writes an
    // anonymized summary in the logs (Settings -> Supervision) instead. No
    // token, no task title.
    const token = tokens.tokens;
    const iso = (instant) => (instant ? new Date(instant).toISOString() : 'never');
    const calls = api.calls();
    const now_ = clock();
    logger.info(`[diagnostic] gladys-google-tasks ${version}, Node ${process.version}`);
    logger.info(
      `[diagnostic] client ID ${config.clientId ? `set (${config.clientId.length} characters, ${config.clientId.endsWith('.apps.googleusercontent.com') ? 'Google format' : 'UNEXPECTED format'})` : 'missing'}, secret ${config.clientSecret ? 'set' : 'missing'}; connected ${connected()}, access lost ${tokens.lost}, tokens of the same client ${!token.clientId || token.clientId === config.clientId}`,
    );
    logger.info(
      `[diagnostic] access token until ${iso(token.expiresAt)}, refresh token ${token.refreshToken ? 'present' : 'absent'}, pending authorization ${Boolean(pendingAuth.state)}`,
    );
    logger.info(
      `[diagnostic] time zone ${zone ?? 'system'} (TZ=${process.env.TZ ?? 'unset'}), local date ${now_.date} ${now_.hour}h, due hour ${config.dueHour}, every ${config.pollMinutes} min, last reading ${iso(mirror.readAt())}`,
    );
    logger.info(
      `[diagnostic] ${calls.count} API call(s) on ${calls.day || '-'} (UTC), last ${iso(calls.last)}; last error ${lastError ? `${lastError.what} at ${iso(lastError.at)}: ${lastError.message}` : 'none'}`,
    );
    for (const list of mirror.lists.values()) {
      const counters = countersOf(list.tasks, now_.date);
      const externalId = idsOf(gladys, list.id).device;
      logger.info(
        `[diagnostic] list …${list.id.slice(-6)}: ${counters.pending} to do, ${counters.overdue} overdue, ${counters.today} today, created in Gladys ${createdDevices.has(externalId)}, full read ${iso(list.fullAt)}`,
      );
    }
    return all('diagnosticDone');
  });

  gladys.onAction(ACTIONS.DISCONNECT, async () => {
    stopTimers();
    const { refreshToken } = tokens.tokens;
    const revoked = await revokeToken(refreshToken, fetchImpl);
    logger.info(`Disconnected from Google (revocation ${revoked ? 'confirmed' : 'not confirmed'})`);
    await tokens.clear();
    mirror.clear();
    lastStatus = null;
    await reportStatus(false, all('statusNotConnected'));
    await publishTransports();
    refreshWidgets();
    return all('disconnected');
  });

  // --- Configuration ------------------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      lastLanguage = readLanguage(raw, lastLanguage);
    } catch (err) {
      if (fallback) {
        config = { ...normalizeConfig(fallback), tokens: config.tokens };
      }
      logger.error('Unable to read the configuration', err);
    }
    tokens.setTokens(config.tokens);
    if (config.pendingAuth.state && !pendingAuth.state) {
      pendingAuth = config.pendingAuth;
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const before = JSON.stringify([
      config.clientId,
      config.clientSecret,
      config.pollMinutes,
      config.dueHour,
    ]);
    const clientBefore = config.clientId;
    await loadConfig(rawConfig);
    if (clientBefore && clientBefore !== config.clientId && tokens.hasGrant()) {
      // The tokens belong to the previous OAuth client.
      logger.info('Client ID changed: connect again');
      await tokens.clear();
      mirror.clear();
    }
    const after = JSON.stringify([
      config.clientId,
      config.clientSecret,
      config.pollMinutes,
      config.dueHour,
    ]);
    if (before !== after) {
      lastStatus = null;
      await startIfReady();
    }
  });

  // --- Connection lifecycle -----------------------------------------------------------------

  gladys.on('connected', async () => {
    await loadConfig();
    const { clientId } = tokens.tokens;
    if (clientId && config.clientId && clientId !== config.clientId) {
      logger.info('The stored tokens belong to another Client ID: connect again');
      await tokens.clear();
    }
    await refreshCreatedDevices();
    lastStatus = null;
    await startIfReady();
  });

  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopTimers();
  });

  return {
    mirror,
    tokens,
    api,
    poll,
    evaluatePhases,
    stop: stopTimers,
    idle: () => queue,
  };
}

export { ACTIONS, SCENE_ACTIONS, SCOPES };
