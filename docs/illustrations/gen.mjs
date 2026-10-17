// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// Made-up lists (fixed date: Saturday 17 October 2026, 10:00 in Paris), with
// task titles written in the language of each image, as a user would.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildTasksWidget, buildOverviewWidget } = await load('src/widgets.js');
const { normalizeTask, countersOf, localClock } = await load('src/tasks.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const NOW = Date.parse('2026-10-17T08:00:00Z');
const clock = localClock(NOW, 'Europe/Paris');

const TITLES = {
  lists: {
    en: ['My Tasks', 'Shopping', 'Garden'],
    fr: ['Mes tâches', 'Courses', 'Jardin'],
    de: ['Meine Aufgaben', 'Einkaufen', 'Garten'],
    es: ['Mis tareas', 'Compras', 'Jardín'],
  },
  tasks: {
    en: [
      'Pay the electricity bill',
      'Take the bins out',
      'Book the boiler service',
      'Call the plumber',
      'Order a filter',
      'Sort the garage',
    ],
    fr: [
      'Payer la facture d’électricité',
      'Sortir les poubelles',
      'Réserver l’entretien de la chaudière',
      'Appeler le plombier',
      'Commander un filtre',
      'Ranger le garage',
    ],
    de: [
      'Stromrechnung bezahlen',
      'Mülltonnen rausstellen',
      'Heizungswartung buchen',
      'Klempner anrufen',
      'Filter bestellen',
      'Garage aufräumen',
    ],
    es: [
      'Pagar la factura de la luz',
      'Sacar la basura',
      'Reservar la revisión de la caldera',
      'Llamar al fontanero',
      'Pedir un filtro',
      'Ordenar el garaje',
    ],
  },
  form: {
    en: 'Buy light bulbs',
    fr: 'Acheter des ampoules',
    de: 'Glühbirnen kaufen',
    es: 'Comprar bombillas',
  },
};

const contents = {};
const formValues = {};
for (const language of LANGUAGES) {
  const [title1, title2, title3] = TITLES.lists[language];
  const names = TITLES.tasks[language];
  const raw = [
    { id: 'a', title: names[0], due: '2026-10-15', position: '1', notes: '…' },
    { id: 'b', title: names[1], due: '2026-10-17', position: '2' },
    { id: 'c', title: names[2], due: '2026-10-18', position: '3' },
    { id: 'd', title: names[3], due: '2026-10-22', position: '4' },
    { id: 'e', title: names[4], due: '2026-10-22', position: '5', parent: 'd' },
    { id: 'f', title: names[5], position: '6' },
  ];
  const tasks = new Map(
    raw.map((task) => {
      const normalized = normalizeTask({
        ...task,
        due: task.due ? `${task.due}T00:00:00.000Z` : undefined,
        webViewLink: `https://tasks.google.com/task/${task.id}`,
      });
      return [normalized.id, normalized];
    }),
  );
  const list = { id: 'my-tasks', title: title1, tasks };
  const counters = countersOf(tasks, clock.date);
  contents[language] = {
    tasks: buildTasksWidget({ list, counters, clock, dueHour: 8, show: 'all', language }),
    overview: buildOverviewWidget({
      lists: [
        { title: title1, counters },
        { title: title2, counters: { pending: 3, overdue: 0, today: 1 } },
        { title: title3, counters: { pending: 2, overdue: 0, today: 0 } },
      ],
      language,
      readAt: NOW - 3 * 60000,
      now: NOW,
    }),
  };
  formValues[language] = { title: TITLES.form[language] };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents, formValues }));
