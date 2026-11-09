// Entry point and router for Questbook
import {
  loadData,
  saveData,
  clearData,
  generateId,
  saveApiKey,
  removeApiKey,
} from './storage.js';
import { exportCsv, parseCsv, validateCsv } from './csv.js';
import { extractQuestFromSentence } from './ai.js';
import {
  validateQuestInput,
  calculateTotalExp,
  calculateLevel,
  calculateStreak,
  calculateExpAward,
} from './logic.js';
import {
  initBoardTabs,
  renderBoard,
  renderProfile,
  renderApiKeyUI,
  initFormControls,
  initDialogs,
  openQuestDialog,
  closeQuestDialog,
  showConfirmDialog,
  showToast,
  setFieldError,
  clearAllFieldErrors,
  announceLive,
  playCompletionAnimation,
  showLevelUpBanner,
  renderCorruptedDataState,
} from './ui.js';

const VALID_ROUTES = ['#quests', '#profile'];
const DEFAULT_ROUTE = '#quests';

// App state in memory
let appData = { version: 1, quests: [] };
let currentSort = 'newest'; // Lasts until reload, not saved to localStorage (F17)

/**
 * Handle form submission for creating or editing a quest.
 * @param {Event} e
 */
function handleQuestFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('quest-id').value;
  const title = document.getElementById('quest-title').value;
  const description = document.getElementById('quest-description').value;
  const diffInput = document.querySelector('input[name="difficulty"]:checked');
  const difficulty = diffInput ? diffInput.value : 'Mudah';
  const dueDate = document.getElementById('quest-due-date').value;

  const validation = validateQuestInput({
    title,
    description,
    difficulty,
    due_date: dueDate,
  });

  if (!validation.isValid) {
    clearAllFieldErrors();
    if (validation.errors.title) {
      setFieldError('title', validation.errors.title);
      document.getElementById('quest-title')?.focus();
    } else if (validation.errors.description) {
      setFieldError('description', validation.errors.description);
      document.getElementById('quest-description')?.focus();
    } else if (validation.errors.due_date) {
      setFieldError('due_date', validation.errors.due_date);
      document.getElementById('quest-due-date')?.focus();
    }
    return;
  }

  // Create new quest
  if (!id) {
    const newQuest = {
      id: generateId(),
      title: title.trim(),
      description: description.trim(),
      difficulty,
      status: 'active',
      created_at: new Date().toISOString(),
      completed_at: '',
      exp_earned: 0,
      due_date: dueDate || '',
    };

    appData.quests.unshift(newQuest);
    saveData(appData);
    refreshUI();
    closeQuestDialog();
    showToast({ message: 'Quest baru diterima!', type: 'success' });
  } else {
    // Edit mode (T14)
    const quest = appData.quests.find((q) => q.id === id);
    if (quest) {
      quest.title = title.trim();
      quest.description = description.trim();
      if (quest.status === 'active') {
        quest.difficulty = difficulty;
      }
      quest.due_date = dueDate || '';
      saveData(appData);
      refreshUI();
      closeQuestDialog();
      showToast({ message: 'Quest berhasil diperbarui!', type: 'success' });
    }
  }
}

/**
 * Handle clicks on quest card action buttons (complete, edit, delete, reopen).
 * @param {Event} e
 */
async function handleCardActionClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const questId = btn.dataset.id;
  const quest = appData.quests.find((q) => q.id === questId);
  if (!quest) return;

  if (action === 'complete') {
    if (quest.status === 'completed') return;

    btn.disabled = true;
    const card = btn.closest('.quest-card');

    const expBefore = calculateTotalExp(appData.quests);
    const levelBefore = calculateLevel(expBefore);

    // Mark completed
    quest.status = 'completed';
    quest.completed_at = new Date().toISOString();

    // Calculate streak and EXP
    const streak = calculateStreak(appData.quests);
    const expAwarded = calculateExpAward(quest.difficulty, streak);
    quest.exp_earned = expAwarded;

    const expAfter = calculateTotalExp(appData.quests);
    const levelAfter = calculateLevel(expAfter);

    // Announce to screen readers
    announceLive(`Quest selesai, +${expAwarded} EXP.`);

    // Animation feedback
    await playCompletionAnimation(card, expAwarded);

    saveData(appData);
    refreshUI();

    // Check level-up
    if (levelAfter > levelBefore) {
      showLevelUpBanner(levelAfter);
    }
  } else if (action === 'edit') {
    openQuestDialog(btn, quest);
  } else if (action === 'delete') {
    const isCompleted = quest.status === 'completed';
    const submessage = isCompleted
      ? 'EXP yang diperoleh dari quest ini akan dihapus.'
      : '';

    const confirmed = await showConfirmDialog({
      title: 'Hapus Quest',
      message: 'Hapus quest ini?',
      submessage,
      confirmText: 'Hapus',
      isDanger: true,
      opener: btn,
    });

    if (confirmed) {
      appData.quests = appData.quests.filter((q) => q.id !== questId);
      saveData(appData);
      refreshUI();
      showToast({ message: 'Quest telah dihapus.', type: 'success' });
    }
  } else if (action === 'reopen') {
    quest.status = 'active';
    quest.completed_at = '';
    quest.exp_earned = 0;

    saveData(appData);
    refreshUI();
    // Do NOT show level-up banner even if level changes
    announceLive('Quest dibuka kembali.');
    showToast({ message: 'Quest dibuka kembali.', type: 'success' });
  }
}

/**
 * Refresh both quest board and character profile views.
 */
function refreshUI() {
  const btnCreate = document.getElementById('btn-create-quest');
  renderBoard(
    appData.quests,
    () => {
      if (btnCreate) btnCreate.click();
    },
    currentSort
  );
  renderProfile(appData.quests);
}

/**
 * Initialize application state and UI.
 */
function initApp() {
  const loadRes = loadData();
  if (loadRes.ok) {
    appData = loadRes.data;
  } else {
    // Corrupted data handling (F7)
    renderCorruptedDataState(loadRes.error, () => {
      const fileInput = document.getElementById('input-import-csv');
      if (fileInput) fileInput.click();
    });
    showToast({
      message: loadRes.error || 'Data penyimpanan rusak. Silakan pulihkan dengan Impor CSV.',
      type: 'error',
    });
  }

  initBoardTabs();
  initFormControls();
  initDialogs();

  // Wire "Buat Quest" button in header
  const btnCreate = document.getElementById('btn-create-quest');
  if (btnCreate) {
    btnCreate.addEventListener('click', () => {
      openQuestDialog(btnCreate, null);
    });
  }

  // Wire quest form submission
  const questForm = document.getElementById('quest-form');
  if (questForm) {
    questForm.addEventListener('submit', handleQuestFormSubmit);
  }

  // Wire "Isi dengan AI" button (F19)
  const btnFillAi = document.getElementById('btn-fill-ai');
  if (btnFillAi) {
    btnFillAi.addEventListener('click', async () => {
      const sentenceInput = document.getElementById('ai-sentence-input');
      const errEl = document.getElementById('ai-error');
      const reviewNote = document.getElementById('ai-review-note');
      const extraNotesEl = document.getElementById('ai-review-extra-notes');
      const titleInput = document.getElementById('quest-title');
      const descInput = document.getElementById('quest-description');
      const dueDateInput = document.getElementById('quest-due-date');
      const diffRadios = Array.from(document.querySelectorAll('input[name="difficulty"]'));

      const sentence = (sentenceInput?.value || '').trim();
      if (!sentence) {
        if (errEl) errEl.textContent = 'Tulis tugas dulu.';
        sentenceInput?.focus();
        return;
      }

      if (errEl) errEl.textContent = '';
      if (reviewNote) reviewNote.hidden = true;

      // Disable button and show loading state
      btnFillAi.disabled = true;
      const originalHtml = btnFillAi.innerHTML;
      btnFillAi.innerHTML = '<span>Memproses...</span>';

      try {
        const result = await extractQuestFromSentence(sentence);

        if (!result.ok) {
          if (errEl) errEl.textContent = result.error || 'Gagal memproses kalimat.';
          btnFillAi.disabled = false;
          btnFillAi.innerHTML = originalHtml;
          return;
        }

        // Fill form fields
        if (titleInput) {
          titleInput.value = result.data.title || '';
          titleInput.dispatchEvent(new Event('input'));
        }
        if (descInput) {
          descInput.value = result.data.description || '';
          descInput.dispatchEvent(new Event('input'));
        }
        if (dueDateInput) {
          dueDateInput.value = result.data.due_date || '';
        }

        // Set difficulty
        const targetDiff = result.data.difficulty || 'Sedang';
        diffRadios.forEach((r) => {
          r.checked = r.value === targetDiff;
        });

        // Show review note
        if (reviewNote) {
          reviewNote.hidden = false;
          if (extraNotesEl) {
            if (result.notes && result.notes.length > 0) {
              extraNotesEl.innerHTML = result.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('');
            } else {
              extraNotesEl.innerHTML = '';
            }
          }
        }

        // Move focus to Judul
        if (titleInput) {
          titleInput.focus();
        }
      } catch (err) {
        if (errEl) errEl.textContent = 'Tidak bisa terhubung ke Gemini. Periksa koneksi internet.';
      } finally {
        btnFillAi.disabled = false;
        btnFillAi.innerHTML = originalHtml;
      }
    });
  }

  // Wire card action button delegation
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.addEventListener('click', handleCardActionClick);
  }

  // Wire Export CSV button
  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportCsv(appData.quests);
      showToast({ message: 'Berkas CSV berhasil diekspor!', type: 'success' });
    });
  }

  // Wire Import CSV button and file input
  const btnImport = document.getElementById('btn-import-csv');
  const inputImport = document.getElementById('input-import-csv');
  if (btnImport && inputImport) {
    btnImport.addEventListener('click', () => {
      inputImport.click();
    });
    inputImport.addEventListener('change', handleCsvFileSelect);
  }

  // Wire Sort Select control (F17)
  const selectSort = document.getElementById('select-sort-quests');
  if (selectSort) {
    selectSort.value = currentSort;
    selectSort.addEventListener('change', (e) => {
      currentSort = e.target.value;
      refreshUI();
    });
  }

  // Wire Reset Data button (F18)
  const btnReset = document.getElementById('btn-reset-data');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        title: 'Reset Semua Data',
        message: 'Reset semua data quest dan kemajuan petualangan?',
        submessage: 'Semua quest dan EXP akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.',
        confirmText: 'Reset Semua Data',
        isDanger: true,
        opener: btnReset,
      });

      if (confirmed) {
        appData.quests = [];
        clearData();
        refreshUI();
        showToast({ message: 'Semua data telah direset.', type: 'success' });
      }
    });
  }

  // Wire Save API Key form (F20)
  const formApiKey = document.getElementById('form-save-api-key');
  if (formApiKey) {
    formApiKey.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('input-api-key');
      const errEl = document.getElementById('api-key-error');
      const val = (input?.value || '').trim();

      if (!val) {
        if (input) input.setAttribute('aria-invalid', 'true');
        if (errEl) errEl.textContent = 'Kunci tidak boleh kosong.';
        input?.focus();
        return;
      }

      const saveRes = saveApiKey(val);
      if (saveRes.ok) {
        if (input) {
          input.value = '';
          input.removeAttribute('aria-invalid');
        }
        if (errEl) errEl.textContent = '';
        renderApiKeyUI();
        showToast({ message: 'Kunci API Gemini berhasil disimpan!', type: 'success' });
      } else {
        if (errEl) errEl.textContent = saveRes.error || 'Gagal menyimpan kunci.';
      }
    });
  }

  // Wire Remove API Key delegated click (F20)
  const profileSection = document.getElementById('profile');
  if (profileSection) {
    profileSection.addEventListener('click', async (e) => {
      const btnRemove = e.target.closest('#btn-remove-api-key');
      if (!btnRemove) return;

      const confirmed = await showConfirmDialog({
        title: 'Hapus Kunci API',
        message: 'Hapus kunci API Gemini yang tersimpan?',
        submessage: 'Fitur pembuatan quest dengan AI tidak dapat digunakan hingga Anda memasukkan kunci baru.',
        confirmText: 'Hapus Kunci',
        isDanger: true,
        opener: btnRemove,
      });

      if (confirmed) {
        removeApiKey();
        renderApiKeyUI();
        showToast({ message: 'Kunci API telah dihapus.', type: 'success' });
      }
    });
  }

  refreshUI();
}

/**
 * Handle CSV file selection and processing.
 * @param {Event} e
 */
async function handleCsvFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const fileInput = e.target;
  const processingToast = showToast({ message: 'Memproses file...', type: 'success' });

  try {
    const text = await file.text();
    fileInput.value = '';

    const rows = parseCsv(text);
    const validation = validateCsv(rows);

    if (!validation.isValid) {
      if (processingToast && processingToast.parentElement) processingToast.remove();
      showToast({ message: validation.error, type: 'error' });
      return;
    }

    if (processingToast && processingToast.parentElement) processingToast.remove();

    const openerBtn = document.getElementById('btn-import-csv') || document.body;
    const confirmed = await showConfirmDialog({
      title: 'Impor CSV',
      message: 'Data sekarang akan diganti. Lanjutkan?',
      submessage: 'Semua quest yang ada saat ini akan digantikan dengan data dari berkas CSV.',
      confirmText: 'Lanjutkan',
      isDanger: true,
      opener: openerBtn,
    });

    if (confirmed) {
      appData.quests = validation.quests;
      saveData(appData);

      // Remove corrupted banner if it was present
      const corruptedBanner = document.querySelector('.corrupted-data-banner');
      if (corruptedBanner) corruptedBanner.remove();

      refreshUI();
      showToast({ message: `${validation.quests.length} quest berhasil diimpor.`, type: 'success' });
    }
  } catch (err) {
    if (processingToast && processingToast.parentElement) processingToast.remove();
    showToast({ message: 'Gagal membaca berkas CSV: ' + err.message, type: 'error' });
  }
}

/**
 * Handle client-side hash routing.
 */
function handleRouting() {
  let hash = window.location.hash || DEFAULT_ROUTE;

  if (!VALID_ROUTES.includes(hash)) {
    // Unknown hash falls back to #quests
    window.location.replace(DEFAULT_ROUTE);
    return;
  }

  // Update navigation links aria-current
  const navQuests = document.getElementById('nav-quests');
  const navProfile = document.getElementById('nav-profile');

  if (navQuests && navProfile) {
    if (hash === '#quests') {
      navQuests.setAttribute('aria-current', 'page');
      navProfile.removeAttribute('aria-current');
    } else {
      navProfile.setAttribute('aria-current', 'page');
      navQuests.removeAttribute('aria-current');
    }
  }

  // Toggle visible sections
  const questsSection = document.getElementById('quests');
  const profileSection = document.getElementById('profile');

  if (questsSection && profileSection) {
    if (hash === '#quests') {
      questsSection.removeAttribute('hidden');
      profileSection.setAttribute('hidden', '');
    } else {
      profileSection.removeAttribute('hidden');
      questsSection.setAttribute('hidden', '');
    }
  }
}

// Wire routing events
window.addEventListener('hashchange', handleRouting);
window.addEventListener('DOMContentLoaded', () => {
  initApp();
  handleRouting();
});

// If DOM is already ready when module executes
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initApp();
  handleRouting();
}

