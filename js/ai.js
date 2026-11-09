// Google Gemini API integration for Questbook (F19)
import { CONFIG } from './config.js';
import { loadApiKey } from './storage.js';
import { validateAiExtractedData } from './logic.js';

const SYSTEM_PROMPT = `Extract task fields from the sentence into JSON format. Do not perform date arithmetic or invent details.
JSON schema:
{
  "title": string (short task name in the same language as the sentence),
  "difficulty": "Mudah" (short routine tasks) | "Sulit" (exams, long projects, hard tasks) | "Sedang" (default),
  "due_day": integer 1-31 or null,
  "due_month": integer 1-12 or null,
  "due_year": integer (e.g. 2026, 2027) or null,
  "description": string or null
}`;

/**
 * Call Google Gemini to extract quest fields from a single sentence.
 * Sends key only in x-goog-api-key header.
 * Timeouts after CONFIG.AI_TIMEOUT_MS (20s).
 * @param {string} sentence
 * @param {Date} [localRefDate=new Date()]
 * @returns {Promise<{ ok: boolean, data?: Object, notes?: Array<string>, error?: string }>}
 */
export async function extractQuestFromSentence(sentence, localRefDate = new Date()) {
  const trimmed = (sentence || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Tulis tugas dulu.' };
  }

  // Load API key
  const keyRes = loadApiKey();
  if (!keyRes.ok || !keyRes.apiKey) {
    return { ok: false, error: 'Atur kunci API Gemini di Profil dulu.' };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.AI_MODEL}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT_MS || 20000);

  try {
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\nSentence: "${trimmed}"`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': keyRes.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      return {
        ok: false,
        error: 'Batas pemakaian AI tercapai. Coba lagi nanti, atau isi form secara manual.',
      };
    }

    if (response.status === 400 || response.status === 403) {
      let isKeyError = false;
      try {
        const errJson = await response.json();
        const msg = JSON.stringify(errJson).toLowerCase();
        if (msg.includes('api_key') || msg.includes('key not valid') || msg.includes('permission_denied') || msg.includes('unauthenticated')) {
          isKeyError = true;
        }
      } catch (_) {}

      if (isKeyError || response.status === 403) {
        return {
          ok: false,
          error: 'Kunci API tidak valid. Periksa kembali di Profil.',
        };
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: 'Kunci API tidak valid. Periksa kembali di Profil.' };
      }
      return {
        ok: false,
        error: 'Tidak bisa terhubung ke Gemini. Periksa koneksi internet.',
      };
    }

    const jsonResp = await response.json();
    const candidateText = jsonResp?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return {
        ok: false,
        error: 'AI tidak memberi hasil yang bisa dibaca. Coba lagi atau isi manual.',
      };
    }

    let parsedAi = null;
    try {
      parsedAi = JSON.parse(candidateText);
    } catch (_) {
      return {
        ok: false,
        error: 'AI tidak memberi hasil yang bisa dibaca. Coba lagi atau isi manual.',
      };
    }

    // Pass through pure validation and date resolution in logic.js
    const validated = validateAiExtractedData(parsedAi, localRefDate);
    if (!validated.isValid) {
      return {
        ok: false,
        error: validated.error || 'AI tidak memberi hasil yang bisa dibaca. Coba lagi atau isi manual.',
      };
    }

    return {
      ok: true,
      data: validated.data,
      notes: validated.notes,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        ok: false,
        error: 'Tidak bisa terhubung ke Gemini. Periksa koneksi internet.',
      };
    }
    return {
      ok: false,
      error: 'Tidak bisa terhubung ke Gemini. Periksa koneksi internet.',
    };
  }
}
