// -----------------------------------------------------------------------------
// Entry point of the Google Tasks external integration.
//
// Brings the Google Tasks lists of a Google account into Gladys:
//   - devices: one per task list, with three counters (to do, overdue, due
//     today), see src/device.js;
//   - scene triggers: task added, completed, due, overdue (src/events.js);
//   - scene actions: add, complete, read the tasks, clear the completed ones;
//   - dashboard widgets: the tasks of a list (add / complete forms) and an
//     overview of every list (src/widgets.js).
//
// Sign-in: OAuth 2.0 with the user's own Google Cloud client (src/auth.js).
// Data: the Google Tasks API, read every few minutes (src/sync.js): Google
// offers no push notification for Tasks.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the time zone of Gladys: "today" and "overdue" follow it)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Google Tasks integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
