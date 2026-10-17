# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Google Tasks**: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to Google through the official Google Tasks API v1 and OAuth 2.0 (the
user's own Google Cloud client). Only dependency: the SDK (`fetch` is native).
Transport: cloud only.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js          SDK wiring only (new GladysIntegration + createApp)
src/app.js        every handler, registered before connect(): OAuth, start, polling
                  timer, publishing, scene events, widgets, scene and config actions
src/auth.js       Google OAuth 2.0 (authorize URL, PKCE, code exchange, single-flight
                  refresh, final stop on invalid_grant, revoke)
src/tasks-api.js  Tasks API v1 client (lists, tasks, insert, patch, clear; call counter)
src/sync.js       in-memory mirror of the lists: full reading, then `updatedMin` changes;
                  added / completed tasks; quiet marks for the changes made by Gladys
src/tasks.js      pure helpers: local date in TZ, due phases, counters, sorting,
                  due dates typed by users, search by title
src/device.js     one device per task list, three counter features
src/events.js     scene trigger keys and event data
src/widgets.js    `tasks` and `overview` widgets (pure builders)
src/config.js / i18n.js   configuration, runtime texts (en / fr / de / es)
```

## Google facts (from the documentation, to re-check when in doubt)

- OAuth: `https://accounts.google.com/o/oauth2/v2/auth` with `access_type=offline`
  and `prompt=consent` (a refresh token), scope `https://www.googleapis.com/auth/tasks`
  only, PKCE S256; token `https://oauth2.googleapis.com/token`; the refresh answer
  carries no new refresh token; granular consent can drop the Tasks scope (checked).
- Refresh tokens die after 7 days for an External app left in **Testing**, after
  6 months unused, on revocation; `invalid_grant` is final: never retry it.
- Redirect URI: the one Gladys sends (`https://my.gladysassistant.com/redirect/oauth`,
  or the instance itself over HTTPS). Google refuses plain `http://` and raw IPs.
- Tasks API: no push. `due` is a DATE (time ignored). `tasks.list` max 100 per page;
  completed tasks of first-party clients need `showHidden=true`; `updatedMin` +
  `showDeleted` give the changes. `tasks.clear` hides the completed tasks.
  Default quota: 50 000 requests a day per project.

## Rules

- **External ids are forever**: `gladys.externalIds('tasklist', <Google list id>)`,
  feature keys, config, action, widget, widget action, scene trigger and action keys.
  `test/structure.test.js` compares them to `test/fixtures/discovery.baseline.json`
  (0.1.0): never update the baseline without a documented migration.
- **Polling by an internal timer** (`poll_minutes`), never `should_poll`; every
  reading and every change go through `exclusive()` (one at a time).
- **States**: `publishChangedStates` with a one-hour heartbeat, only for the
  created features; everything again in `onDeviceCreated`, then a widget refresh.
- **Scene events** on transitions only; the first reading after a start is a
  baseline. A scene or widget action never fires an event (quiet marks in sync.js).
- **Secrets**: never log a token, the Client secret, the Client ID or a task title.
  Gladys passes no DEBUG variable to the container: the **Diagnostic** action
  writes the anonymized summary to the logs instead.
- **Time**: "today" and "overdue" use the `TZ` the supervisor injects (`localClock`).
- **The container rootfs is read-only**; this integration writes nothing to disk
  (tokens and the pending OAuth state live in the Gladys config via `setConfig`).
- **Four languages** everywhere (manifest, `src/i18n.js`, docs, README);
  `test/i18n.test.js` checks it.
- **Widget images**: after any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
