// CSV Builder, Parser, and Validator for Questbook
import { CONFIG } from './config.js';
import { toLocalDateString } from './logic.js';

export const CSV_HEADER = 'id,title,description,difficulty,status,created_at,completed_at,exp_earned,due_date';
export const UTF8_BOM = '\uFEFF';

/**
 * Format a single field for CSV output.
 * Wrap in quotes if it contains comma, double quote, or newline.
 * Doubled quotes for internal quotes.
 * @param {any} value
 * @returns {string}
 */
export function formatCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of quest objects into a valid CSV string.
 * Uses CRLF line endings and starts with a UTF-8 BOM.
 * @param {Array} quests
 * @returns {string}
 */
export function buildCsv(quests) {
  const safeQuests = Array.isArray(quests) ? quests : [];
  const lines = [CSV_HEADER];

  for (const q of safeQuests) {
    const row = [
      formatCsvField(q.id || ''),
      formatCsvField(q.title || ''),
      formatCsvField(q.description || ''),
      formatCsvField(q.difficulty || CONFIG.DEFAULT_DIFFICULTY),
      formatCsvField(q.status || 'active'),
      formatCsvField(q.created_at || ''),
      formatCsvField(q.completed_at || ''),
      formatCsvField(q.exp_earned !== undefined && q.exp_earned !== null ? q.exp_earned : 0),
      formatCsvField(q.due_date || ''),
    ];
    lines.push(row.join(','));
  }

  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Generates the export file name using local date: questbook-YYYY-MM-DD.csv
 * @param {Date} [refDate=new Date()]
 * @returns {string}
 */
export function getExportFilename(refDate = new Date()) {
  const dateStr = toLocalDateString(refDate);
  return `questbook-${dateStr}.csv`;
}

/**
 * Trigger CSV download in browser.
 * @param {Array} quests
 * @param {Date} [refDate=new Date()]
 * @returns {{ filename: string, content: string }}
 */
export function exportCsv(quests, refDate = new Date()) {
  const content = buildCsv(quests);
  const filename = getExportFilename(refDate);

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, content };
}

/**
 * Robust CSV parser that handles:
 * - Quoted fields with commas
 * - Quoted fields with newlines
 * - Escaped double quotes ("")
 * - CRLF and LF line endings
 * - UTF-8 BOM prefix
 * @param {string} text
 * @returns {Array<Array<string>>}
 */
export function parseCsv(text) {
  if (!text || typeof text !== 'string') return [];

  // Strip BOM if present
  let input = text;
  if (input.charCodeAt(0) === 0xFEFF) {
    input = input.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for doubled quote ("")
        if (i + 1 < len && input[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        // Handle CRLF
        if (i + 1 < len && input[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push last field and row if any content remains
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Validate parsed CSV rows against Questbook specifications.
 * @param {Array<Array<string>>} rows
 * @returns {{ isValid: boolean, quests?: Array, error?: string }}
 */
export function validateCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { isValid: false, error: 'Berkas CSV kosong.' };
  }

  // Validate header
  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const expectedHeader = CSV_HEADER.split(',').map((h) => h.toLowerCase());

  if (headerRow.length !== expectedHeader.length || !headerRow.every((h, idx) => h === expectedHeader[idx])) {
    return {
      isValid: false,
      error: 'Header CSV tidak sesuai atau tidak ditemukan.',
    };
  }

  const quests = [];
  const seenIds = new Set();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    // Skip trailing empty row
    if (row.length === 1 && row[0].trim() === '') continue;

    const rowNum = rowIndex + 1; // 1-based line number for user messages

    if (row.length !== expectedHeader.length) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: jumlah kolom tidak sesuai (ditemukan ${row.length}, seharusnya ${expectedHeader.length}).`,
      };
    }

    const [id, title, description, difficulty, status, created_at, completed_at, exp_earned_raw, due_date] = row;

    // Check id
    const cleanId = id.trim();
    if (!cleanId) {
      return { isValid: false, error: `Baris ${rowNum}: id wajib diisi.` };
    }
    if (seenIds.has(cleanId)) {
      return { isValid: false, error: `Baris ${rowNum}: id '${cleanId}' duplikat.` };
    }
    seenIds.add(cleanId);

    // Check title (1-80 chars)
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return { isValid: false, error: `Baris ${rowNum}: judul wajib diisi.` };
    }
    if (cleanTitle.length > CONFIG.TITLE_MAX_LENGTH) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: judul maksimal ${CONFIG.TITLE_MAX_LENGTH} karakter.`,
      };
    }

    // Check description (max 300)
    if (description && description.length > CONFIG.DESCRIPTION_MAX_LENGTH) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: deskripsi maksimal ${CONFIG.DESCRIPTION_MAX_LENGTH} karakter.`,
      };
    }

    // Check difficulty
    if (!CONFIG.DIFFICULTIES.includes(difficulty)) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: tingkat kesulitan harus salah satu dari ${CONFIG.DIFFICULTIES.join(', ')}.`,
      };
    }

    // Check status
    if (!CONFIG.STATUSES.includes(status)) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: status harus 'active' atau 'completed'.`,
      };
    }

    // Check created_at (valid ISO / date)
    if (!created_at || isNaN(Date.parse(created_at))) {
      return { isValid: false, error: `Baris ${rowNum}: created_at tidak valid.` };
    }

    // Check completed_at
    if (status === 'completed') {
      if (!completed_at || isNaN(Date.parse(completed_at))) {
        return {
          isValid: false,
          error: `Baris ${rowNum}: completed_at wajib diisi untuk quest yang selesai.`,
        };
      }
    } else {
      if (completed_at && completed_at.trim() !== '') {
        return {
          isValid: false,
          error: `Baris ${rowNum}: completed_at harus kosong untuk quest aktif.`,
        };
      }
    }

    // Check exp_earned
    const expNum = Number(exp_earned_raw);
    if (!Number.isInteger(expNum) || expNum < 0) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: exp_earned harus bilangan bulat non-negatif.`,
      };
    }
    if (status === 'active' && expNum !== 0) {
      return {
        isValid: false,
        error: `Baris ${rowNum}: exp_earned harus 0 untuk quest aktif.`,
      };
    }

    // Check due_date
    const cleanDue = (due_date || '').trim();
    if (cleanDue) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(cleanDue) || isNaN(Date.parse(cleanDue))) {
        return {
          isValid: false,
          error: `Baris ${rowNum}: tenggat waktu harus berformat YYYY-MM-DD.`,
        };
      }
    }

    quests.push({
      id: cleanId,
      title: cleanTitle,
      description: description || '',
      difficulty,
      status,
      created_at,
      completed_at: completed_at || '',
      exp_earned: expNum,
      due_date: cleanDue,
    });
  }

  return {
    isValid: true,
    quests,
  };
}
