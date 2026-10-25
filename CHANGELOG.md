# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.2.0] - 2026-10-25

### Added

- require Gladys 5.3 and declare catalog keywords ([49a0a5c](https://github.com/William-De71/gladys-google-tasks/commit/49a0a5c933271c52101c56072281d2161b8f22c3))

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([adb13e1](https://github.com/William-De71/gladys-google-tasks/commit/adb13e13fb92ff94e8cf38a11b01e0382e8993a3))

## [0.1.0] - 2026-10-17

### Added

- A device per Google Tasks list with three read-only counters: tasks to do, overdue tasks and tasks due today, computed in the time zone of Gladys.
- Connection with Google OAuth 2.0 and the user's own Google Cloud client (Client ID and Client secret, never shipped with the image): Connect button, minimal `tasks` scope, PKCE, state kept across a container restart, tokens refreshed automatically, a revoked access reported without hammering Google.
- Reading by polling (Google Tasks has no push API): every 5 minutes by default (1 to 60), only the changes since the previous reading, and again 10 seconds after a change made from Gladys.
- Scene triggers: task added, task completed, task due today (at a configurable hour, Google storing a date without time) and task overdue, filtered by list.
- Scene actions: add a task (list, title, notes, due date), complete a task by its title, read the tasks (count, overdue, today, titles, summary, next task) and clear the completed tasks.
- Dashboard widgets: the tasks of a list (due dates, overdue and today badges, notes and link, "Add" and "Complete" forms, Gladys 5.2.0 or later) and an overview of every list.
- Configuration actions: test the connection, read the lists again, diagnostic (an anonymized summary in the logs), disconnect (the access is revoked at Google).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.2.0]: https://github.com/William-De71/gladys-google-tasks/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/William-De71/gladys-google-tasks/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-google-tasks/releases/tag/v0.1.0
