import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PHASES,
  safeTimeZone,
  localClock,
  addDays,
  isDate,
  dueDateOf,
  parseDue,
  normalizeTask,
  phaseOf,
  countersOf,
  sortTasks,
  findByTitle,
} from '../src/tasks.js';

test('local clock: the date and hour of Gladys, across midnight and DST', () => {
  assert.deepEqual(localClock(Date.parse('2026-10-16T22:30:00Z'), 'Europe/Paris'), {
    date: '2026-10-17',
    hour: 0,
  });
  // 25 October 2026: back to winter time in Paris (UTC+1).
  assert.deepEqual(localClock(Date.parse('2026-10-25T23:30:00Z'), 'Europe/Paris'), {
    date: '2026-10-26',
    hour: 0,
  });
  assert.deepEqual(localClock(Date.parse('2026-10-17T03:00:00Z'), 'America/New_York'), {
    date: '2026-10-16',
    hour: 23,
  });
  assert.equal(safeTimeZone('Not/AZone'), undefined);
  assert.equal(safeTimeZone(''), undefined);
  assert.equal(safeTimeZone(' Europe/Paris '), 'Europe/Paris');
});

test('dates: Google due keeps the date part only, real calendar dates', () => {
  assert.equal(dueDateOf('2026-10-17T00:00:00.000Z'), '2026-10-17');
  assert.equal(dueDateOf(undefined), null);
  assert.equal(dueDateOf('garbage'), null);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(isDate('2026-02-30'), false);
  assert.equal(isDate('2026-02-28'), true);
});

test('due dates typed by users: keywords in four languages, +N, two formats', () => {
  const today = '2026-10-17';
  assert.equal(parseDue({}, today), null);
  assert.equal(parseDue({ when: 'none', date: '2026-10-20' }, today), null);
  assert.equal(parseDue({ when: 'today' }, today), today);
  assert.equal(parseDue({ when: 'tomorrow' }, today), '2026-10-18');
  assert.equal(parseDue({ when: 'next_week' }, today), '2026-10-24');
  assert.equal(parseDue({ when: 'date', date: '+3' }, today), '2026-10-20');
  assert.equal(parseDue({ date: '2026-12-25' }, today), '2026-12-25');
  assert.equal(parseDue({ date: '5/1/2027' }, today), '2027-01-05');
  for (const word of ['today', 'Aujourd’hui', "aujourd'hui", 'heute', 'hoy']) {
    assert.equal(parseDue({ date: word }, today), today, word);
  }
  for (const word of ['tomorrow', 'Demain', 'morgen', 'mañana']) {
    assert.equal(parseDue({ date: word }, today), '2026-10-18', word);
  }
  assert.equal(parseDue({ when: 'date', date: '' }, today), null);
  assert.throws(() => parseDue({ date: '31/02/2026' }, today), { code: 'invalid_date' });
  assert.throws(() => parseDue({ date: 'next friday' }, today), { code: 'invalid_date' });
});

test('phases, counters, reading order, search by title', () => {
  const task = (id, title, due, position = '0', parent = null) =>
    normalizeTask({
      id,
      title,
      due: due ? `${due}T00:00:00.000Z` : undefined,
      position,
      parent,
    });
  const tasks = new Map(
    [
      task('a', 'Undated B', null, '2'),
      task('b', 'Undated A', null, '1'),
      task('c', 'Late', '2026-10-10'),
      task('d', 'Today', '2026-10-17'),
      task('e', 'Later', '2026-11-01', '0', 'c'),
    ].map((item) => [item.id, item]),
  );
  const morning = { date: '2026-10-17', hour: 7 };
  const noon = { date: '2026-10-17', hour: 12 };
  assert.equal(phaseOf(tasks.get('d'), morning, 8), PHASES.TODAY);
  assert.equal(phaseOf(tasks.get('d'), noon, 8), PHASES.DUE);
  assert.equal(phaseOf(tasks.get('c'), noon, 8), PHASES.OVERDUE);
  assert.equal(phaseOf(tasks.get('e'), noon, 8), PHASES.UPCOMING);
  assert.equal(phaseOf(tasks.get('a'), noon, 8), PHASES.NONE);
  assert.deepEqual(countersOf(tasks, '2026-10-17'), { pending: 5, overdue: 1, today: 1 });
  assert.deepEqual(
    sortTasks(tasks.values()).map((item) => item.id),
    ['c', 'd', 'e', 'b', 'a'],
  );
  assert.equal(findByTitle(tasks.values(), 'later').id, 'e');
  assert.equal(findByTitle(tasks.values(), 'undated').id, 'b', 'contains: first in reading order');
  assert.equal(findByTitle(tasks.values(), '  TODAY ').id, 'd');
  assert.equal(findByTitle(tasks.values(), 'nothing'), null);
  assert.equal(findByTitle(tasks.values(), ''), null);
});
