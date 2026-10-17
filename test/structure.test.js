// -----------------------------------------------------------------------------
// Non-regression of everything users store: the device and feature external
// ids, the fields the Discovery "Update" button compares (category, type,
// unit, min, max, step), and every key of the manifest a scene, a widget or a
// saved configuration refers to.
//
// test/fixtures/discovery.baseline.json was generated from version 0.1.0 (the
// first release). A failure here means existing users would have to delete
// and recreate a device, or would lose a scene or a widget setting: never
// update the baseline without a documented migration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { buildDevice, parseExternalId } from '../src/device.js';
import { WIDGET_ACTIONS } from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { LIST_ID } from './helpers/fakes.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const baseline = read('./fixtures/discovery.baseline.json');
const manifest = read('../gladys-assistant-integration.json');
const gladys = createFakeGladys();

const ETERNAL = [
  'external_id',
  'category',
  'type',
  'unit',
  'min',
  'max',
  'step',
  'read_only',
  'has_feedback',
];
const pick = (feature) =>
  Object.fromEntries(
    ETERNAL.filter((key) => feature[key] !== undefined).map((key) => [key, feature[key]]),
  );
const keys = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list) => new Map((list ?? []).map((entry) => [entry.key, entry]));

test('the device keeps its external ids and the fields Discovery compares, in every language', () => {
  for (const language of LANGUAGES) {
    const device = buildDevice(gladys, { id: LIST_ID, title: 'Renamed list' }, language);
    assert.deepEqual(
      {
        external_id: device.external_id,
        should_poll: device.should_poll,
        params: device.params.map((param) => param.name),
        features: device.features.map(pick),
      },
      baseline.device,
      language,
    );
    assert.equal(device.name, 'Google Tasks: Renamed list');
    assert.deepEqual(parseExternalId(device.features[1].external_id), {
      listId: LIST_ID,
      feature: 'overdue',
    });
  }
});

test('category / type pairs come from the SDK constants (the counter couple of Gladys)', () => {
  const categories = new Set(Object.values(DEVICE_FEATURE_CATEGORIES));
  const types = new Set(
    Object.values(DEVICE_FEATURE_TYPES).flatMap((group) => Object.values(group)),
  );
  for (const feature of buildDevice(gladys, { id: LIST_ID, title: 'x' }, 'en').features) {
    assert.ok(categories.has(feature.category), feature.category);
    assert.ok(types.has(feature.type), feature.type);
    assert.equal(feature.category, DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR);
    assert.equal(feature.type, DEVICE_FEATURE_TYPES.SENSOR.INTEGER);
  }
});

test('no configuration key or action disappears or changes type', () => {
  assert.deepEqual(
    keys(manifest.actions).filter((key) => baseline.manifest.actions.includes(key)),
    baseline.manifest.actions,
  );
  const current = byKey(manifest.config_schema);
  for (const { key, type } of baseline.manifest.config_schema) {
    assert.equal(current.get(key)?.type, type, `config_schema.${key}`);
  }
});

test('scene triggers keep their keys, filters, options and variables', () => {
  const current = byKey(manifest.scene_triggers);
  for (const trigger of baseline.manifest.scene_triggers) {
    const now = current.get(trigger.key);
    assert.ok(now, `scene_triggers.${trigger.key}`);
    const fields = byKey(now.fields);
    for (const { key, options } of trigger.fields) {
      assert.ok(fields.has(key), `${trigger.key}.${key}`);
      const values = (fields.get(key)?.options ?? []).map((option) => option.value);
      options.forEach((value) =>
        assert.ok(values.includes(value), `${trigger.key}.${key}: ${value}`),
      );
    }
    const variables = byKey(now.variables);
    for (const { key, type } of trigger.variables) {
      assert.equal(variables.get(key)?.type, type, `${trigger.key}.variables.${key}`);
    }
  }
});

test('scene actions keep their keys, fields and outputs; widgets their settings and actions', () => {
  const actions = byKey(manifest.scene_actions);
  for (const action of baseline.manifest.scene_actions) {
    const now = actions.get(action.key);
    assert.ok(now, action.key);
    action.fields.forEach((field) => assert.ok(keys(now.fields).includes(field), field));
    const outputs = byKey(now.outputs);
    for (const { key, type } of action.outputs) {
      assert.equal(outputs.get(key)?.type, type, `${action.key}.${key}`);
    }
  }
  const widgets = byKey(manifest.widgets);
  for (const widget of baseline.manifest.widgets) {
    const now = widgets.get(widget.key);
    assert.ok(now, widget.key);
    widget.settings.forEach((key) => assert.ok(keys(now.settings).includes(key), key));
  }
  assert.deepEqual(Object.values(WIDGET_ACTIONS), baseline.manifest.widget_actions);
});
