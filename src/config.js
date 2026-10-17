// -----------------------------------------------------------------------------
// Configuration of the Google Tasks integration.
//
// Fields of the config_schema:
//   - `client_id` / `client_secret`  the OAuth client ("Web application") the
//                                    user created in their own Google Cloud
//                                    project: never shipped with the image;
//   - `google_account`               the Connect button (oauth2 field);
//   - `poll_minutes`                 how often Google is read (no push API);
//   - `due_hour`                     the local hour at which a task due today
//                                    raises the "due" scene trigger (Google
//                                    stores no time for a task);
//   - `language`                     language of the texts written outside a
//                                    widget request (`auto` = the language of
//                                    the last widget displayed).
//
// Internal keys, outside the config_schema (never shown in the UI): the
// tokens, the pending OAuth request (state + PKCE verifier, kept across a
// container restart between "Connect" and the return from Google) and the
// language of the last widget request.
// -----------------------------------------------------------------------------

// Minutes. Each reading costs 1 call + 1 per task list (50 000 a day by default).
const POLL_MINUTES = { min: 1, max: 60, default: 5 };
// Local hour (0-23) of the "due" trigger for the tasks due today.
const DUE_HOUR = { min: 0, max: 23, default: 8 };
const ACCOUNT_FIELD = 'google_account';
const LANGUAGES = ['en', 'fr', 'de', 'es'];
const AUTO_LANGUAGE = 'auto';

const INTERNAL_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  expiresAt: 'token_expires_at',
  tokenClientId: 'token_client_id',
  oauthState: 'oauth_state',
  oauthVerifier: 'oauth_code_verifier',
  language: 'last_language',
};

/**
 * @description Read a bounded integer field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('6', POLL_MINUTES); // -> 6
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || raw === null || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description Read a trimmed string.
 * @param {unknown} raw - The raw value.
 * @returns {string} The string, '' when absent.
 * @example
 * readString(' abc '); // -> 'abc'
 */
function readString(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * @description Read a stored instant (ms).
 * @param {unknown} raw - The raw value.
 * @returns {number} The instant, 0 when absent.
 * @example
 * readInstant('1760000000000'); // -> 1760000000000
 */
function readInstant(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The config.
 * @example
 * normalizeConfig({ client_id: 'abc' }).clientId; // -> 'abc'
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    clientId: readString(config.client_id),
    clientSecret: readString(config.client_secret),
    pollMinutes: readNumber(config.poll_minutes, POLL_MINUTES),
    dueHour: readNumber(config.due_hour, DUE_HOUR),
    language: LANGUAGES.includes(config.language) ? config.language : AUTO_LANGUAGE,
    tokens: {
      accessToken: readString(config[INTERNAL_KEYS.accessToken]),
      refreshToken: readString(config[INTERNAL_KEYS.refreshToken]),
      expiresAt: readInstant(config[INTERNAL_KEYS.expiresAt]),
      clientId: readString(config[INTERNAL_KEYS.tokenClientId]),
    },
    pendingAuth: {
      state: readString(config[INTERNAL_KEYS.oauthState]),
      verifier: readString(config[INTERNAL_KEYS.oauthVerifier]),
    },
  };
}

/**
 * @description Read the stored language of the last widget request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && LANGUAGES.includes(language) ? language : fallback;
}

export {
  POLL_MINUTES,
  DUE_HOUR,
  ACCOUNT_FIELD,
  LANGUAGES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  readNumber,
  readString,
  normalizeConfig,
  readLanguage,
};
