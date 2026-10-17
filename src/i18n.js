// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback), the four languages of the Gladys interface.
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, widget contents, toasts, scene summaries, messages
// of the Configuration screen.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // features
  featurePending: {
    en: 'Tasks to do',
    fr: 'Tâches à faire',
    de: 'Offene Aufgaben',
    es: 'Tareas pendientes',
  },
  featureOverdue: {
    en: 'Overdue tasks',
    fr: 'Tâches en retard',
    de: 'Überfällige Aufgaben',
    es: 'Tareas atrasadas',
  },
  featureToday: {
    en: 'Tasks due today',
    fr: 'Tâches pour aujourd’hui',
    de: 'Heute fällige Aufgaben',
    es: 'Tareas para hoy',
  },

  // connection status (Configuration screen)
  statusNoClient: {
    en: 'Enter the Client ID and Client secret of your Google Cloud OAuth client, save, then click Connect.',
    fr: 'Saisissez le Client ID et le Client secret de votre client OAuth Google Cloud, enregistrez, puis cliquez sur Connecter.',
    de: 'Gib Client-ID und Clientschlüssel deines Google-Cloud-OAuth-Clients ein, speichere und klicke dann auf Verbinden.',
    es: 'Introduce el Client ID y el Client secret de tu cliente OAuth de Google Cloud, guarda y pulsa Conectar.',
  },
  statusNotConnected: {
    en: 'Not connected: click "Connect with Google".',
    fr: 'Non connecté : cliquez sur « Se connecter avec Google ».',
    de: 'Nicht verbunden: Klicke auf „Mit Google verbinden“.',
    es: 'Sin conectar: pulsa «Conectar con Google».',
  },
  statusConnected: {
    en: 'Connected to Google Tasks: {lists} list(s), {pending} task(s) to do.',
    fr: 'Connecté à Google Tasks : {lists} liste(s), {pending} tâche(s) à faire.',
    de: 'Mit Google Tasks verbunden: {lists} Liste(n), {pending} offene Aufgabe(n).',
    es: 'Conectado a Google Tasks: {lists} lista(s), {pending} tarea(s) pendiente(s).',
  },
  statusReauth: {
    en: 'Google revoked the access (or the app is still in "Testing": 7 days). Click "Connect with Google" again.',
    fr: 'Google a révoqué l’accès (ou l’application est encore en « Test » : 7 jours). Cliquez à nouveau sur « Se connecter avec Google ».',
    de: 'Google hat den Zugriff widerrufen (oder die App ist noch im „Test“: 7 Tage). Klicke erneut auf „Mit Google verbinden“.',
    es: 'Google revocó el acceso (o la app sigue en «Prueba»: 7 días). Vuelve a pulsar «Conectar con Google».',
  },
  statusUnreachable: {
    en: 'Google Tasks unreachable, new try in a few minutes.',
    fr: 'Google Tasks injoignable, nouvel essai dans quelques minutes.',
    de: 'Google Tasks nicht erreichbar, neuer Versuch in ein paar Minuten.',
    es: 'Google Tasks inaccesible, nuevo intento en unos minutos.',
  },
  statusApiDisabled: {
    en: 'The Google Tasks API is not enabled in your Google Cloud project: enable it, then wait a few minutes.',
    fr: 'L’API Google Tasks n’est pas activée dans votre projet Google Cloud : activez-la, puis patientez quelques minutes.',
    de: 'Die Google Tasks API ist in deinem Google-Cloud-Projekt nicht aktiviert: Aktiviere sie und warte ein paar Minuten.',
    es: 'La API de Google Tasks no está activada en tu proyecto de Google Cloud: actívala y espera unos minutos.',
  },
  statusQuota: {
    en: 'Google Tasks quota reached: the readings resume later.',
    fr: 'Quota Google Tasks atteint : les lectures reprendront plus tard.',
    de: 'Google-Tasks-Kontingent erreicht: Die Abfragen werden später fortgesetzt.',
    es: 'Cuota de Google Tasks alcanzada: las lecturas se reanudarán más tarde.',
  },
  connectState: {
    en: 'This Google answer does not match the last "Connect" click. Click it again, once, and keep only that tab.',
    fr: 'Cette réponse de Google ne correspond pas au dernier clic sur « Connecter ». Recliquez une seule fois et gardez uniquement cet onglet.',
    de: 'Diese Google-Antwort passt nicht zum letzten Klick auf „Verbinden“. Klicke erneut, nur einmal, und behalte nur diesen Tab.',
    es: 'Esta respuesta de Google no corresponde al último clic en «Conectar». Vuelve a pulsar una sola vez y conserva solo esa pestaña.',
  },
  connectScope: {
    en: 'The Google Tasks permission was not granted: connect again and tick the "tasks" checkbox.',
    fr: 'L’autorisation Google Tasks n’a pas été accordée : reconnectez-vous et cochez la case « tâches ».',
    de: 'Die Google-Tasks-Berechtigung wurde nicht erteilt: Verbinde dich erneut und setze das Häkchen bei „Aufgaben“.',
    es: 'No se concedió el permiso de Google Tasks: vuelve a conectarte y marca la casilla «tareas».',
  },
  connectFailed: {
    en: 'Google refused the connection ({reason}). Check the Client ID, the Client secret and the redirect URI.',
    fr: 'Google a refusé la connexion ({reason}). Vérifiez le Client ID, le Client secret et l’URI de redirection.',
    de: 'Google hat die Verbindung abgelehnt ({reason}). Prüfe Client-ID, Clientschlüssel und Weiterleitungs-URI.',
    es: 'Google rechazó la conexión ({reason}). Comprueba el Client ID, el Client secret y la URI de redirección.',
  },

  // configuration actions
  testResult: {
    en: 'Connected: {lists} list(s), {pending} task(s) to do, {overdue} overdue. {calls} API call(s) today.',
    fr: 'Connecté : {lists} liste(s), {pending} tâche(s) à faire, {overdue} en retard. {calls} appel(s) API aujourd’hui.',
    de: 'Verbunden: {lists} Liste(n), {pending} offene Aufgabe(n), {overdue} überfällig. {calls} API-Aufruf(e) heute.',
    es: 'Conectado: {lists} lista(s), {pending} tarea(s) pendiente(s), {overdue} atrasada(s). {calls} llamada(s) API hoy.',
  },
  refreshDone: {
    en: 'Google Tasks read again: {lists} list(s), {pending} task(s) to do.',
    fr: 'Google Tasks relu : {lists} liste(s), {pending} tâche(s) à faire.',
    de: 'Google Tasks neu gelesen: {lists} Liste(n), {pending} offene Aufgabe(n).',
    es: 'Google Tasks leído de nuevo: {lists} lista(s), {pending} tarea(s) pendiente(s).',
  },
  refreshFailed: {
    en: 'Google Tasks could not be read.',
    fr: 'Impossible de lire Google Tasks.',
    de: 'Google Tasks konnte nicht gelesen werden.',
    es: 'No se pudo leer Google Tasks.',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the logs of the integration (no token, no task title).',
    fr: 'Diagnostic écrit dans les journaux de l’intégration (sans jeton ni titre de tâche).',
    de: 'Diagnose in die Protokolle der Integration geschrieben (ohne Token und Aufgabentitel).',
    es: 'Diagnóstico escrito en los registros de la integración (sin token ni título de tarea).',
  },
  disconnected: {
    en: 'Disconnected from Google: the access was revoked and the tokens deleted.',
    fr: 'Déconnecté de Google : l’accès a été révoqué et les jetons supprimés.',
    de: 'Von Google getrennt: Der Zugriff wurde widerrufen und die Token gelöscht.',
    es: 'Desconectado de Google: se revocó el acceso y se borraron los tokens.',
  },

  // widget and scene results
  taskAdded: {
    en: 'Task added: {title}',
    fr: 'Tâche ajoutée : {title}',
    de: 'Aufgabe hinzugefügt: {title}',
    es: 'Tarea añadida: {title}',
  },
  taskCompleted: {
    en: 'Task completed: {title}',
    fr: 'Tâche terminée : {title}',
    de: 'Aufgabe erledigt: {title}',
    es: 'Tarea completada: {title}',
  },
  taskNotFound: {
    en: 'This task is no longer to do (already completed or deleted).',
    fr: 'Cette tâche n’est plus à faire (déjà terminée ou supprimée).',
    de: 'Diese Aufgabe ist nicht mehr offen (bereits erledigt oder gelöscht).',
    es: 'Esta tarea ya no está pendiente (ya completada o eliminada).',
  },
  titleRequired: {
    en: 'Enter a title.',
    fr: 'Saisissez un titre.',
    de: 'Gib einen Titel ein.',
    es: 'Introduce un título.',
  },
  invalidDate: {
    en: 'Unreadable date: use YYYY-MM-DD, DD/MM/YYYY, today, tomorrow or +3.',
    fr: 'Date illisible : utilisez AAAA-MM-JJ, JJ/MM/AAAA, aujourd’hui, demain ou +3.',
    de: 'Unlesbares Datum: Nutze JJJJ-MM-TT, TT/MM/JJJJ, heute, morgen oder +3.',
    es: 'Fecha ilegible: usa AAAA-MM-DD, DD/MM/AAAA, hoy, mañana o +3.',
  },
  actionFailed: {
    en: 'Google Tasks refused the change, try again later.',
    fr: 'Google Tasks a refusé la modification, réessayez plus tard.',
    de: 'Google Tasks hat die Änderung abgelehnt, versuche es später erneut.',
    es: 'Google Tasks rechazó el cambio, inténtalo más tarde.',
  },
  notConnected: {
    en: 'Google Tasks is not connected: open the configuration of the integration.',
    fr: 'Google Tasks n’est pas connecté : ouvrez la configuration de l’intégration.',
    de: 'Google Tasks ist nicht verbunden: Öffne die Konfiguration der Integration.',
    es: 'Google Tasks no está conectado: abre la configuración de la integración.',
  },
  noList: {
    en: 'No task list yet: wait for the first reading of Google Tasks.',
    fr: 'Aucune liste de tâches pour l’instant : attendez la première lecture de Google Tasks.',
    de: 'Noch keine Aufgabenliste: Warte auf das erste Lesen von Google Tasks.',
    es: 'Aún no hay listas de tareas: espera la primera lectura de Google Tasks.',
  },

  // widgets
  caption: {
    en: '{pending} to do · {overdue} overdue · {today} today',
    fr: '{pending} à faire · {overdue} en retard · {today} aujourd’hui',
    de: '{pending} offen · {overdue} überfällig · {today} heute',
    es: '{pending} pendientes · {overdue} atrasadas · {today} hoy',
  },
  nothingToDo: {
    en: 'Nothing to do in this list.',
    fr: 'Rien à faire dans cette liste.',
    de: 'In dieser Liste ist nichts zu tun.',
    es: 'Nada pendiente en esta lista.',
  },
  nothingDue: {
    en: 'Nothing due today nor overdue.',
    fr: 'Rien pour aujourd’hui ni en retard.',
    de: 'Heute nichts fällig und nichts überfällig.',
    es: 'Nada para hoy ni atrasado.',
  },
  moreTasks: {
    en: '+ {count} more task(s) in Google Tasks.',
    fr: '+ {count} autre(s) tâche(s) dans Google Tasks.',
    de: '+ {count} weitere Aufgabe(n) in Google Tasks.',
    es: '+ {count} tarea(s) más en Google Tasks.',
  },
  badgeOverdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasada' },
  badgeToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  badgeTomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  openTask: { en: 'Open', fr: 'Ouvrir', de: 'Öffnen', es: 'Abrir' },
  buttonAdd: { en: 'Add', fr: 'Ajouter', de: 'Hinzufügen', es: 'Añadir' },
  buttonComplete: { en: 'Complete', fr: 'Terminer', de: 'Erledigen', es: 'Completar' },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  fieldTitle: { en: 'Title', fr: 'Titre', de: 'Titel', es: 'Título' },
  fieldTitlePlaceholder: {
    en: 'Buy bread',
    fr: 'Acheter du pain',
    de: 'Brot kaufen',
    es: 'Comprar pan',
  },
  fieldWhen: { en: 'Due', fr: 'Échéance', de: 'Fällig', es: 'Vencimiento' },
  fieldDate: { en: 'Other date', fr: 'Autre date', de: 'Anderes Datum', es: 'Otra fecha' },
  fieldDateDescription: {
    en: 'With "Other date": YYYY-MM-DD, DD/MM/YYYY or +3 (days).',
    fr: 'Avec « Autre date » : AAAA-MM-JJ, JJ/MM/AAAA ou +3 (jours).',
    de: 'Mit „Anderes Datum“: JJJJ-MM-TT, TT/MM/JJJJ oder +3 (Tage).',
    es: 'Con «Otra fecha»: AAAA-MM-DD, DD/MM/AAAA o +3 (días).',
  },
  fieldNotes: { en: 'Notes', fr: 'Notes', de: 'Notizen', es: 'Notas' },
  fieldTask: { en: 'Task', fr: 'Tâche', de: 'Aufgabe', es: 'Tarea' },
  whenNone: { en: 'No date', fr: 'Sans date', de: 'Kein Datum', es: 'Sin fecha' },
  whenToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  whenTomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  whenNextWeek: {
    en: 'In a week',
    fr: 'Dans une semaine',
    de: 'In einer Woche',
    es: 'En una semana',
  },
  whenDate: { en: 'Other date', fr: 'Autre date', de: 'Anderes Datum', es: 'Otra fecha' },
  tilePending: { en: 'To do', fr: 'À faire', de: 'Offen', es: 'Pendientes' },
  tileOverdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasadas' },
  tileToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  listOverdue: {
    en: '{pending} · {overdue} overdue',
    fr: '{pending} · {overdue} en retard',
    de: '{pending} · {overdue} überfällig',
    es: '{pending} · {overdue} atrasadas',
  },
  listToday: {
    en: '{pending} · {today} today',
    fr: '{pending} · {today} aujourd’hui',
    de: '{pending} · {today} heute',
    es: '{pending} · {today} hoy',
  },
  listPending: {
    en: '{pending} to do',
    fr: '{pending} à faire',
    de: '{pending} offen',
    es: '{pending} pendientes',
  },
  readAgo: {
    en: 'Read {ago}',
    fr: 'Lu {ago}',
    de: 'Gelesen {ago}',
    es: 'Leído {ago}',
  },
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },

  // scene summaries
  summaryNone: {
    en: 'No task.',
    fr: 'Aucune tâche.',
    de: 'Keine Aufgabe.',
    es: 'Ninguna tarea.',
  },
  summaryTasks: {
    en: '{count} task(s): {titles}',
    fr: '{count} tâche(s) : {titles}',
    de: '{count} Aufgabe(n): {titles}',
    es: '{count} tarea(s): {titles}',
  },
};

/**
 * @description A text in a language, with `{name}` substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('taskAdded', 'fr', { title: 'Pain' }); // -> 'Tâche ajoutée : Pain'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const text = entry[language] ?? entry.en;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined || values[name] === null ? match : String(values[name]),
  );
}

/**
 * @description A text built per language, at most 200 characters (toasts and
 * connection messages are cut there by Gladys).
 * @param {Function} build - `(language) => string`.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function each(build) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const text = build(language);
      return [language, text.length > 200 ? `${text.slice(0, 199)}…` : text];
    }),
  );
}

/**
 * @description The text of a key in every language.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return each((language) => t(key, language, values));
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 120) {
    return t('ago_minutes', language, { n: minutes });
  }
  return t('ago_hours', language, { n: Math.floor(minutes / 60) });
}

export { LANGUAGES, TEXTS, t, all, each, ago };
