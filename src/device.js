// -----------------------------------------------------------------------------
// The "Google Tasks: <list>" devices.
//
// One device per Google task list, offered on the Discovery screen, with
// three read-only counters (`counter-sensor` + `integer`, the counter couple
// of Gladys, icon "plus"): the tasks to do, the overdue ones, the ones due
// today. They feed the dashboard tiles, the history and the scene conditions
// ("more than 3 overdue tasks"); the tasks themselves are in the widgets.
//
// External ids: ext:<selector>:tasklist:<Google list id>[:<feature>]. The
// Google id never changes when the list is renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const DEVICE_TYPE = 'tasklist';
// Google allows 20 000 tasks to do per list.
const COUNTER = {
  category: CATEGORIES.COUNTER_SENSOR,
  type: TYPES.SENSOR.INTEGER,
  min: 0,
  max: 20000,
};

// Every feature: its key (forever), its name, its state from the counters.
const FEATURES = [
  { key: 'pending', name: 'featurePending', state: (c) => c.pending },
  { key: 'overdue', name: 'featureOverdue', state: (c) => c.overdue },
  { key: 'due_today', name: 'featureToday', state: (c) => c.today },
];

/**
 * @description The external ids of a list.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} listId - The Google list id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, listId) => gladys.externalIds(DEVICE_TYPE, listId);

/**
 * @description The list id and feature key an external id stands for.
 * @param {unknown} externalId - A device or feature external id.
 * @returns {{ listId: string, feature: string|null }|null} Its parts.
 * @example
 * parseExternalId('ext:google-tasks:tasklist:MDk1NjQ5:overdue');
 */
function parseExternalId(externalId) {
  const match = /:tasklist:([A-Za-z0-9_-]+)(?::([a-z0-9_]+))?$/.exec(String(externalId ?? ''));
  return match ? { listId: match[1], feature: match[2] ?? null } : null;
}

/**
 * @description The name of a list device.
 * @param {string} title - The list title.
 * @returns {string} The name.
 */
const listName = (title) => `Google Tasks: ${title}`.slice(0, 80);

/**
 * @description Build the device of a list.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {{ id: string, title: string }} list - The list.
 * @param {string} language - The language of the feature names.
 * @returns {object} The discovered device.
 */
function buildDevice(gladys, list, language) {
  const ids = idsOf(gladys, list.id);
  return {
    name: listName(list.title),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'GOOGLE_TASKS_LIST_ID', value: list.id }],
    features: FEATURES.map((feature) => ({
      name: t(feature.name, language),
      external_id: ids.feature(feature.key),
      read_only: true,
      has_feedback: false,
      keep_history: true,
      ...COUNTER,
    })),
  };
}

/**
 * @description The states of a list.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} listId - The list id.
 * @param {{ pending: number, overdue: number, today: number }} counters - Its counters.
 * @param {Set<string>|null} [only] - Feature external ids to keep (the created ones).
 * @returns {Array<{ device_feature_external_id: string, state: number }>} The states.
 */
function buildStates(gladys, listId, counters, only = null) {
  const ids = idsOf(gladys, listId);
  return FEATURES.map((feature) => ({
    device_feature_external_id: ids.feature(feature.key),
    state: feature.state(counters),
  })).filter((state) => !only || only.has(state.device_feature_external_id));
}

export { DEVICE_TYPE, FEATURES, idsOf, parseExternalId, listName, buildDevice, buildStates };
