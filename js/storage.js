// Storage manager for Questbook
import { CONFIG } from './config.js';

/**
 * Generate a unique ID using crypto.randomUUID with fallback.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'qb-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Check if a quest object matches the expected schema.
 * @param {any} q
 * @returns {boolean}
 */
function isValidQuestShape(q) {
  if (!q || typeof q !== 'object') return false;
  if (typeof q.id !== 'string' || !q.id.trim()) return false;
  if (typeof q.title !== 'string' || !q.title.trim()) return false;
  if (!CONFIG.DIFFICULTIES.includes(q.difficulty)) return false;
  if (!CONFIG.STATUSES.includes(q.status)) return false;
  if (typeof q.created_at !== 'string' || isNaN(Date.parse(q.created_at))) return false;
  if (typeof q.exp_earned !== 'number' || q.exp_earned < 0) return false;
  return true;
}

/**
 * Load data from localStorage safely.
 * Returns { ok: true, data } or { ok: false, error, corruptedRaw }.
 * Never throws, never overwrites corrupted data.
 */
export function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(CONFIG.STORAGE_KEY);
  } catch (err) {
    return {
      ok: false,
      error: 'Tidak dapat mengakses penyimpanan lokal browser.',
      corruptedRaw: null,
    };
  }

  // First time load: no data stored yet
  if (raw === null) {
    return {
      ok: true,
      data: {
        version: CONFIG.SCHEMA_VERSION,
        quests: [],
      },
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: 'Data penyimpanan rusak (format JSON tidak valid).',
      corruptedRaw: raw,
    };
  }

  // Validate root shape
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.version !== CONFIG.SCHEMA_VERSION ||
    !Array.isArray(parsed.quests)
  ) {
    return {
      ok: false,
      error: 'Data penyimpanan rusak (struktur data tidak sesuai).',
      corruptedRaw: raw,
    };
  }

  // Validate every quest item
  for (let i = 0; i < parsed.quests.length; i++) {
    if (!isValidQuestShape(parsed.quests[i])) {
      return {
        ok: false,
        error: `Data penyimpanan rusak pada quest indeks ${i}.`,
        corruptedRaw: raw,
      };
    }
  }

  return {
    ok: true,
    data: parsed,
  };
}

/**
 * Save data to localStorage.
 * @param {{ version: number, quests: Array }} data
 * @returns {{ ok: boolean, error?: string }}
 */
export function saveData(data) {
  try {
    if (!data || typeof data !== 'object' || !Array.isArray(data.quests)) {
      return { ok: false, error: 'Data yang akan disimpan tidak valid.' };
    }
    const serialized = JSON.stringify(data);
    localStorage.setItem(CONFIG.STORAGE_KEY, serialized);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: 'Gagal menyimpan ke penyimpanan lokal: ' + (err.message || 'Error'),
    };
  }
}

/**
 * Clear data from localStorage.
 */
export function clearData() {
  try {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Load Gemini API key from localStorage (F20).
 * Key is stored separately under questbook.ai.v1.
 * @returns {{ ok: boolean, apiKey: string, error?: string }}
 */
export function loadApiKey() {
  let raw = null;
  try {
    raw = localStorage.getItem(CONFIG.AI_STORAGE_KEY);
  } catch (err) {
    return {
      ok: false,
      apiKey: '',
      error: 'Tidak dapat mengakses penyimpanan kunci API.',
    };
  }

  if (raw === null) {
    return { ok: true, apiKey: '' };
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== CONFIG.SCHEMA_VERSION ||
      typeof parsed.apiKey !== 'string'
    ) {
      return {
        ok: false,
        apiKey: '',
        error: 'Kunci tersimpan tidak terbaca. Atur ulang di Profil.',
      };
    }
    return { ok: true, apiKey: parsed.apiKey };
  } catch (err) {
    return {
      ok: false,
      apiKey: '',
      error: 'Kunci tersimpan tidak terbaca. Atur ulang di Profil.',
    };
  }
}

/**
 * Save Gemini API key to localStorage (F20).
 * @param {string} keyString
 * @returns {{ ok: boolean, error?: string }}
 */
export function saveApiKey(keyString) {
  const trimmed = (keyString || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Kunci tidak boleh kosong.' };
  }

  try {
    const payload = {
      version: CONFIG.SCHEMA_VERSION,
      apiKey: trimmed,
    };
    localStorage.setItem(CONFIG.AI_STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Gagal menyimpan kunci API: ' + (err.message || 'Error') };
  }
}

/**
 * Remove Gemini API key from localStorage (F20).
 * @returns {{ ok: boolean }}
 */
export function removeApiKey() {
  try {
    localStorage.removeItem(CONFIG.AI_STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Mask API key, showing only the last 4 characters (e.g. ••••••••wxyz)
 * @param {string} keyString
 * @returns {string}
 */
export function maskApiKey(keyString) {
  if (!keyString || typeof keyString !== 'string') return '';
  const trimmed = keyString.trim();
  if (trimmed.length <= 4) return '••••••••' + trimmed;
  return '••••••••' + trimmed.slice(-4);
}

