import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS } from '../src/events.js';
import { SCENE_ACTIONS, SCOPES, ACTIONS } from '../src/app.js';
import { WIDGETS, SHOW } from '../src/widgets.js';
import { POLL_MINUTES, DUE_HOUR, AUTO_LANGUAGE, ACCOUNT_FIELD } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Google Tasks');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-google-tasks:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-google-tasks/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-google-tasks');
});

test('cloud transport only, no permission, Gladys 5.2.0 for the widget forms', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /GLADYS_PREFER_LOCAL/);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  assert.match(source('../src/widgets.js'), /fields:/, 'button forms: Gladys 5.2.0');
  assert.equal(manifest.gladys_version, '>=5.2.0');
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((x) => x.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((x) => x.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((x) => x.key).sort(), Object.values(WIDGETS).sort());
  assert.deepEqual(
    manifest.actions.map((x) => x.key),
    Object.values(ACTIONS),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(\\s*WIDGETS\\.${key}`), key);
    assert.match(app, new RegExp(`onWidgetAction\\(\\s*WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(\\s*SCENE_ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(\\s*ACTIONS\\.${key}`), key);
  }
  for (const key of Object.keys(TRIGGERS)) {
    assert.match(app, new RegExp(`TRIGGERS\\.${key}`), key);
  }
});

test('mirrors the bounds and values of the code', () => {
  const config = byKey(manifest.config_schema);
  for (const [key, bounds] of [
    ['poll_minutes', POLL_MINUTES],
    ['due_hour', DUE_HOUR],
  ]) {
    for (const bound of ['min', 'max', 'default']) {
      assert.equal(config.get(key)[bound], bounds[bound], `${key}.${bound}`);
    }
  }
  assert.equal(config.get(ACCOUNT_FIELD).type, 'oauth2');
  assert.equal(config.get('client_id').type, 'string');
  assert.equal(config.get('client_secret').type, 'secret');
  const getTasks = byKey(byKey(manifest.scene_actions).get('get_tasks').fields);
  assert.deepEqual(values(getTasks.get('scope')).sort(), Object.values(SCOPES).sort());
  const show = byKey(byKey(manifest.widgets).get('tasks').settings).get('show');
  assert.deepEqual(values(show).sort(), Object.values(SHOW).sort());
  // The task list filter of the triggers is the `list` key of the event data.
  for (const trigger of manifest.scene_triggers) {
    const list = byKey(trigger.fields).get('list');
    assert.equal(list.source, 'devices', trigger.key);
  }
});

test('the redirect URI given to users is the one Gladys sends', () => {
  const intro = byKey(manifest.config_schema).get('intro');
  for (const language of LANGUAGES) {
    assert.ok(
      intro.description[language].includes('https://my.gladysassistant.com/redirect/oauth'),
      language,
    );
  }
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok((action.outputs ?? []).length <= 20, action.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('no Google host other than the documented ones in the code', () => {
  const hosts = new Set();
  for (const file of ['auth.js', 'tasks-api.js', 'sync.js', 'config.js', 'widgets.js', 'app.js']) {
    for (const [, host] of source(`../src/${file}`).matchAll(/https:\/\/([a-z0-9.-]+)/g)) {
      hosts.add(host);
    }
  }
  assert.deepEqual([...hosts].sort(), [
    'accounts.google.com',
    'developers.google.com',
    'my.gladysassistant.com',
    'oauth2.googleapis.com',
    'tasks.googleapis.com',
    // the scope is a URL
    'www.googleapis.com',
  ]);
});
