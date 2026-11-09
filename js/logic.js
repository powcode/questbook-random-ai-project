// Pure business logic functions for Questbook (no DOM manipulation)
import { CONFIG } from './config.js';

/**
 * Calculates EXP threshold required for level L.
 * Formula: 50 * L * (L - 1)
 * Level 1 = 0, Level 2 = 100, Level 3 = 300, Level 4 = 600, etc.
 * @param {number} level
 * @returns {number}
 */
export function calculateLevelThreshold(level) {
  if (level <= 1) return 0;
  return 50 * level * (level - 1);
}

/**
 * Calculates player level from total EXP.
 * Uses a loop to find the highest L where threshold(L) <= totalExp.
 * @param {number} totalExp
 * @returns {number}
 */
export function calculateLevel(totalExp) {
  const exp = Math.max(0, Math.floor(totalExp || 0));
  let level = 1;
  while (calculateLevelThreshold(level + 1) <= exp) {
    level++;
  }
  return level;
}

/**
 * Calculates progress toward next level.
 * Formula: (E - threshold(level)) / (threshold(level + 1) - threshold(level))
 * @param {number} totalExp
 * @param {number} [level]
 * @returns {{ fraction: number, percentage: number, currentLevelExp: number, nextLevelExpNeeded: number }}
 */
export function calculateProgress(totalExp, level = null) {
  const exp = Math.max(0, Math.floor(totalExp || 0));
  const currentLevel = level ?? calculateLevel(exp);
  const currentThreshold = calculateLevelThreshold(currentLevel);
  const nextThreshold = calculateLevelThreshold(currentLevel + 1);

  const range = nextThreshold - currentThreshold;
  const gainedInLevel = exp - currentThreshold;
  const fraction = range > 0 ? gainedInLevel / range : 0;
  const percentage = Math.round(fraction * 100);

  return {
    fraction,
    percentage,
    currentLevelExp: gainedInLevel,
    nextLevelExpNeeded: range,
    currentThreshold,
    nextThreshold,
  };
}

/**
 * Sum of exp_earned across all completed quests.
 * @param {Array} quests
 * @returns {number}
 */
export function calculateTotalExp(quests) {
  if (!Array.isArray(quests)) return 0;
  return quests.reduce((total, q) => {
    if (q && q.status === 'completed' && typeof q.exp_earned === 'number') {
      return total + q.exp_earned;
    }
    return total;
  }, 0);
}

/**
 * Converts a Date or ISO string into local YYYY-MM-DD string.
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function toLocalDateString(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate streak: number of consecutive local calendar days, ending today or yesterday,
 * that have at least one completed quest.
 * @param {Array} quests
 * @param {Date} [refDate=new Date()]
 * @returns {number}
 */
export function calculateStreak(quests, refDate = new Date()) {
  if (!Array.isArray(quests) || quests.length === 0) return 0;

  // Extract unique local dates of completion
  const completionDates = new Set();
  for (const q of quests) {
    if (q && q.status === 'completed' && q.completed_at) {
      const localDate = toLocalDateString(q.completed_at);
      if (localDate) {
        completionDates.add(localDate);
      }
    }
  }

  if (completionDates.size === 0) return 0;

  // Calculate local today and yesterday
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const todayStr = toLocalDateString(today);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  // Check anchor day: must be today or yesterday
  let anchor = null;
  if (completionDates.has(todayStr)) {
    anchor = new Date(today);
  } else if (completionDates.has(yesterdayStr)) {
    anchor = new Date(yesterday);
  } else {
    // Latest completion is older than yesterday
    return 0;
  }

  let streak = 0;
  const cursor = new Date(anchor);

  while (true) {
    const cursorStr = toLocalDateString(cursor);
    if (completionDates.has(cursorStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculates EXP awarded for completing a quest.
 * Formula: Base EXP + (5 * min(streak, 5)).
 * @param {string} difficulty - "Mudah" | "Sedang" | "Sulit"
 * @param {number} [streakIncludingToday=0] - The streak count including this completion (or 0 for base EXP)
 * @returns {number}
 */
export function calculateExpAward(difficulty, streakIncludingToday = 0) {
  const base = CONFIG.BASE_EXP[difficulty] || CONFIG.BASE_EXP[CONFIG.DEFAULT_DIFFICULTY];
  const streakCount = typeof streakIncludingToday === 'number' && !isNaN(streakIncludingToday)
    ? streakIncludingToday
    : 0;
  const effectiveStreak = Math.max(0, Math.min(streakCount, CONFIG.STREAK_BONUS_CAP_DAYS));
  const bonus = CONFIG.STREAK_BONUS_PER_DAY * effectiveStreak;
  return base + bonus;
}

/**
 * Validates quest form input.
 * @param {{ title?: string, description?: string, difficulty?: string, due_date?: string }} data
 * @returns {{ isValid: boolean, errors: Object.<string, string> }}
 */
export function validateQuestInput(data) {
  const errors = {};
  const title = (data?.title || '').trim();
  const desc = data?.description || '';
  const diff = data?.difficulty || CONFIG.DEFAULT_DIFFICULTY;
  const dueDate = data?.due_date || '';

  if (!title) {
    errors.title = 'Judul wajib diisi.';
  } else if (title.length > CONFIG.TITLE_MAX_LENGTH) {
    errors.title = `Judul maksimal ${CONFIG.TITLE_MAX_LENGTH} karakter.`;
  }

  if (desc && desc.length > CONFIG.DESCRIPTION_MAX_LENGTH) {
    errors.description = `Deskripsi maksimal ${CONFIG.DESCRIPTION_MAX_LENGTH} karakter.`;
  }

  if (!CONFIG.DIFFICULTIES.includes(diff)) {
    errors.difficulty = 'Tingkat kesulitan tidak valid.';
  }

  if (dueDate) {
    // Expect YYYY-MM-DD
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(dueDate) || isNaN(Date.parse(dueDate))) {
      errors.due_date = 'Format tenggat waktu tidak valid (YYYY-MM-DD).';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Sorts quests array according to sortBy key.
 * @param {Array} quests
 * @param {'newest'|'oldest'|'difficulty'} sortBy
 * @returns {Array}
 */
export function sortQuests(quests, sortBy = 'newest') {
  if (!Array.isArray(quests)) return [];
  const copy = [...quests];

  const diffWeight = {
    Sulit: 3,
    Sedang: 2,
    Mudah: 1,
  };

  switch (sortBy) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    case 'difficulty':
      return copy.sort((a, b) => (diffWeight[b.difficulty] || 0) - (diffWeight[a.difficulty] || 0));
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

/**
 * Computes deterministic tilt between -0.5 and 0.5 degrees based on quest id.
 * @param {string} id
 * @returns {number}
 */
export function getCardTilt(id) {
  if (!id || typeof id !== 'string') return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  // Normalize between -0.5 and 0.5 deg
  const normalized = ((Math.abs(hash) % 1000) / 1000) - 0.5;
  return Number(normalized.toFixed(2));
}

/**
 * Resolves AI-extracted day, month, year into YYYY-MM-DD string (F19).
 * Date math is purely done here in logic.js, never by the AI.
 * - Year given: use it.
 * - Year not given: use nearest date that is today or later based on local date.
 * - Invalid combination (e.g. 31 Feb): leave date empty and return note.
 * - Date before today (year given): fill it in and return "Tenggat ini sudah lewat."
 * @param {number|null} due_day
 * @param {number|null} due_month
 * @param {number|null} due_year
 * @param {Date} [localRefDate=new Date()]
 * @returns {{ dateStr: string, note: string }}
 */
export function resolveAiDate(due_day, due_month, due_year, localRefDate = new Date()) {
  if (
    due_day === null ||
    due_day === undefined ||
    due_month === null ||
    due_month === undefined ||
    isNaN(due_day) ||
    isNaN(due_month)
  ) {
    return { dateStr: '', note: '' };
  }

  const day = Number(due_day);
  const month = Number(due_month);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { dateStr: '', note: 'Kombinasi tanggal tidak valid.' };
  }

  const todayStr = toLocalDateString(localRefDate);

  if (due_year !== null && due_year !== undefined && !isNaN(due_year)) {
    const year = Number(due_year);
    const candidate = new Date(year, month - 1, day);
    // Validate exact date (checks 31 Feb, leap year 29 Feb, etc)
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) {
      return { dateStr: '', note: 'Kombinasi tanggal tidak valid.' };
    }

    const dateStr = toLocalDateString(candidate);
    let note = '';
    if (dateStr < todayStr) {
      note = 'Tenggat ini sudah lewat.';
    }
    return { dateStr, note };
  }

  // Year not given: use the nearest date that is today or later
  let year = localRefDate.getFullYear();
  let candidate = new Date(year, month - 1, day);

  // If combination is inherently invalid in calendar (e.g. Feb 30/31)
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    // Check if it's leap day (Feb 29)
    if (month === 2 && day === 29) {
      // Find nearest leap year that is today or later
      while (
        new Date(year, 1, 29).getDate() !== 29 ||
        toLocalDateString(new Date(year, 1, 29)) < todayStr
      ) {
        year++;
      }
      return { dateStr: toLocalDateString(new Date(year, 1, 29)), note: '' };
    }
    return { dateStr: '', note: 'Kombinasi tanggal tidak valid.' };
  }

  const candidateStr = toLocalDateString(candidate);
  if (candidateStr < todayStr) {
    year += 1;
    candidate = new Date(year, month - 1, day);
    if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
      return { dateStr: '', note: 'Kombinasi tanggal tidak valid.' };
    }
  }

  return { dateStr: toLocalDateString(candidate), note: '' };
}

/**
 * Validates and normalizes raw AI-extracted fields (F19).
 * @param {Object} aiOutput
 * @param {Date} [localRefDate=new Date()]
 * @returns {{ isValid: boolean, data?: { title: string, difficulty: string, description: string, due_date: string }, notes: Array<string>, error?: string }}
 */
export function validateAiExtractedData(aiOutput, localRefDate = new Date()) {
  const notes = [];

  if (!aiOutput || typeof aiOutput !== 'object') {
    return {
      isValid: false,
      notes: [],
      error: 'AI tidak memberi hasil yang bisa dibaca. Coba lagi atau isi manual.',
    };
  }

  // Title: 1 to 80 characters after trimming
  const rawTitle = typeof aiOutput.title === 'string' ? aiOutput.title.trim() : '';
  if (!rawTitle || rawTitle.length > CONFIG.TITLE_MAX_LENGTH) {
    return {
      isValid: false,
      notes: [],
      error: `Judul dari AI tidak valid (1-${CONFIG.TITLE_MAX_LENGTH} karakter).`,
    };
  }

  // Difficulty: if not one of the three values, use "Sedang" and show a note
  let diff = aiOutput.difficulty;
  if (!CONFIG.DIFFICULTIES.includes(diff)) {
    diff = 'Sedang';
    notes.push('Tingkat kesulitan disesuaikan ke Sedang.');
  }

  // Description: if longer than 300, cut to 300 and show note
  let desc = typeof aiOutput.description === 'string' ? aiOutput.description.trim() : '';
  if (desc.length > CONFIG.DESCRIPTION_MAX_LENGTH) {
    desc = desc.slice(0, CONFIG.DESCRIPTION_MAX_LENGTH);
    notes.push(`Deskripsi dipotong ke ${CONFIG.DESCRIPTION_MAX_LENGTH} karakter.`);
  }

  // Date resolution
  const dateRes = resolveAiDate(
    aiOutput.due_day,
    aiOutput.due_month,
    aiOutput.due_year,
    localRefDate
  );

  if (dateRes.note) {
    notes.push(dateRes.note);
  }

  return {
    isValid: true,
    data: {
      title: rawTitle,
      difficulty: diff,
      description: desc,
      due_date: dateRes.dateStr,
    },
    notes,
  };
}

