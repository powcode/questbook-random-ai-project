// Configuration constants for Questbook

export const CONFIG = {
  STORAGE_KEY: 'questbook.v1',
  SCHEMA_VERSION: 1,

  // EXP settings
  BASE_EXP: {
    Mudah: 10,
    Sedang: 25,
    Sulit: 50,
  },
  STREAK_BONUS_PER_DAY: 5,
  STREAK_BONUS_CAP_DAYS: 5,
  MAX_STREAK_BONUS: 25,

  // Validation limits
  TITLE_MIN_LENGTH: 1,
  TITLE_MAX_LENGTH: 80,
  DESCRIPTION_MAX_LENGTH: 300,

  // Allowed values
  DIFFICULTIES: ['Mudah', 'Sedang', 'Sulit'],
  DEFAULT_DIFFICULTY: 'Mudah',
  STATUSES: ['active', 'completed'],

  // Toast and banner timings (ms)
  TOAST_AUTO_DISMISS: 3000,
  BANNER_AUTO_DISMISS: 3000,
  BANNER_ANIMATION_DURATION: 400,
  ANIMATION_DURATION_STAMP: 800,

  // AI Configuration (F19, F20)
  AI_MODEL: 'gemini-3.5-flash-lite',
  AI_TIMEOUT_MS: 20000,
  AI_MAX_SENTENCE_LENGTH: 300,
  AI_STORAGE_KEY: 'questbook.ai.v1',
  AI_STUDIO_URL: 'https://aistudio.google.com/app/apikey',
};
