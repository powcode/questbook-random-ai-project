// UI Controller for Questbook
import { CONFIG } from './config.js';
import { loadApiKey, maskApiKey } from './storage.js';
import {
  sortQuests,
  getCardTilt,
  toLocalDateString,
  calculateTotalExp,
  calculateLevel,
  calculateProgress,
  calculateStreak,
} from './logic.js';

/**
 * Initializes ARIA Tab pattern for Quest Board.
 */
export function initBoardTabs() {
  const tablist = document.querySelector('.quest-tablist');
  if (!tablist) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

  function activateTab(tabToActivate, setFocus = true) {
    tabs.forEach((tab) => {
      const isSelected = tab === tabToActivate;
      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');

      const panelId = tab.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      if (panel) {
        if (isSelected) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      }
    });

    if (setFocus) {
      tabToActivate.focus();
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      activateTab(tab, false);
    });

    tab.addEventListener('keydown', (e) => {
      let targetIndex = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        targetIndex = (index + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        targetIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        targetIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        targetIndex = tabs.length - 1;
      }

      if (targetIndex !== null) {
        activateTab(tabs[targetIndex], true);
      }
    });
  });
}

/**
 * Render Empty State HTML
 * @param {'active'|'completed'} type
 * @returns {string}
 */
function createEmptyStateHtml(type) {
  if (type === 'active') {
    return `
      <div class="empty-state" data-empty-type="active">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
        <h2 class="empty-state-title">Belum Ada Quest Aktif</h2>
        <p class="empty-state-text">Papan quest masih kosong. Ambil pena dan mulai petualangan barumu!</p>
        <button type="button" class="btn btn-primary btn-empty-create" aria-haspopup="dialog">
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
            <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          <span>Buat Quest Baru</span>
        </button>
      </div>
    `;
  }

  return `
    <div class="empty-state" data-empty-type="completed">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1 14.5l-3.5-3.5 1.41-1.41L11 13.67l5.59-5.59L18 9.5 11 16.5z"/>
      </svg>
      <h2 class="empty-state-title">Belum Ada Quest Selesai</h2>
      <p class="empty-state-text">Selesaikan quest di papan aktif untuk mengumpulkan EXP, meraih streak, dan naik level!</p>
    </div>
  `;
}

/**
 * Render Quest Board
 * @param {Array} quests
 * @param {Function} [onCreateQuest] - callback when clicking create quest from empty state
 * @param {'newest'|'oldest'|'difficulty'} [sortBy='newest']
 */
export function renderBoard(quests, onCreateQuest, sortBy = 'newest') {
  const activeContainer = document.getElementById('active-quests-container');
  const completedContainer = document.getElementById('completed-quests-container');
  const countActiveEl = document.getElementById('count-active');
  const countCompletedEl = document.getElementById('count-completed');

  if (!activeContainer || !completedContainer) return;

  const activeQuests = sortQuests((quests || []).filter((q) => q.status === 'active'), sortBy);
  const completedQuests = sortQuests((quests || []).filter((q) => q.status === 'completed'), sortBy);

  if (countActiveEl) countActiveEl.textContent = String(activeQuests.length);
  if (countCompletedEl) countCompletedEl.textContent = String(completedQuests.length);

  // Render Active Panel
  if (activeQuests.length === 0) {
    activeContainer.innerHTML = createEmptyStateHtml('active');
    const emptyBtn = activeContainer.querySelector('.btn-empty-create');
    if (emptyBtn && onCreateQuest) {
      emptyBtn.addEventListener('click', onCreateQuest);
    }
  } else {
    activeContainer.innerHTML = activeQuests.map((q) => renderQuestCard(q)).join('');
  }

  // Render Completed Panel
  if (completedQuests.length === 0) {
    completedContainer.innerHTML = createEmptyStateHtml('completed');
  } else {
    completedContainer.innerHTML = completedQuests.map((q) => renderQuestCard(q)).join('');
  }
}

/**
 * Render individual Quest Card HTML
 * @param {Object} q
 * @returns {string}
 */
export function renderQuestCard(q) {
  const tilt = getCardTilt(q.id);
  const isCompleted = q.status === 'completed';
  const diffClass = `badge-${(q.difficulty || 'mudah').toLowerCase()}`;
  const todayStr = toLocalDateString(new Date());

  // Check overdue for active quests
  const isOverdue = !isCompleted && q.due_date && q.due_date < todayStr;

  return `
    <article
      class="quest-card ${isCompleted ? 'quest-card-completed' : 'quest-card-active'}"
      data-id="${escapeHtml(q.id)}"
      data-status="${escapeHtml(q.status)}"
      style="transform: rotate(${tilt}deg)"
    >
      ${isCompleted ? `<span class="stamp-completed" aria-hidden="true">SELESAI</span>` : ''}

      <div>
        <div class="quest-card-top">
          <h3 class="quest-card-title">${escapeHtml(q.title)}</h3>
          <span class="badge ${diffClass}" aria-label="Tingkat kesulitan ${escapeHtml(q.difficulty)}">${escapeHtml(q.difficulty)}</span>
        </div>

        ${q.description ? `<p class="quest-card-desc">${escapeHtml(q.description)}</p>` : ''}

        ${
          q.due_date
            ? `
          <div class="quest-card-meta ${isOverdue ? 'overdue' : ''}">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10z"/>
            </svg>
            <span>${isOverdue ? 'Lewat tenggat: ' : 'Tenggat: '}${escapeHtml(q.due_date)}</span>
          </div>
        `
            : ''
        }
      </div>

      <div class="quest-card-actions">
        ${
          !isCompleted
            ? `
          <button type="button" class="btn-card-action btn-card-complete" data-action="complete" data-id="${escapeHtml(q.id)}" aria-label="Selesaikan quest ${escapeHtml(q.title)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>Selesaikan</span>
          </button>
          <button type="button" class="btn-card-action btn-card-edit" data-action="edit" data-id="${escapeHtml(q.id)}" aria-label="Ubah quest ${escapeHtml(q.title)}">
            <span>Ubah</span>
          </button>
          <button type="button" class="btn-card-action btn-card-delete" data-action="delete" data-id="${escapeHtml(q.id)}" aria-label="Hapus quest ${escapeHtml(q.title)}">
            <span>Hapus</span>
          </button>
        `
            : `
          <span class="exp-earned-tag">+${q.exp_earned} EXP</span>
          <button type="button" class="btn-card-action btn-card-reopen" data-action="reopen" data-id="${escapeHtml(q.id)}" aria-label="Buka kembali quest ${escapeHtml(q.title)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
            <span>Buka kembali</span>
          </button>
          <button type="button" class="btn-card-action btn-card-edit" data-action="edit" data-id="${escapeHtml(q.id)}" aria-label="Ubah quest ${escapeHtml(q.title)}">
            <span>Ubah</span>
          </button>
          <button type="button" class="btn-card-action btn-card-delete" data-action="delete" data-id="${escapeHtml(q.id)}" aria-label="Hapus quest ${escapeHtml(q.title)}">
            <span>Hapus</span>
          </button>
        `
        }
      </div>
    </article>
  `;
}

/**
 * Render Character Profile Screen
 * @param {Array} quests
 */
export function renderProfile(quests) {
  const safeQuests = Array.isArray(quests) ? quests : [];

  const totalExp = calculateTotalExp(safeQuests);
  const level = calculateLevel(totalExp);
  const progress = calculateProgress(totalExp, level);
  const streak = calculateStreak(safeQuests);
  const completedCount = safeQuests.filter((q) => q.status === 'completed').length;

  // DOM Elements
  const levelNumEl = document.getElementById('profile-level-number');
  const expTextEl = document.getElementById('profile-exp-text');
  const progressbarEl = document.getElementById('profile-progressbar');
  const progressbarFillEl = document.getElementById('profile-progressbar-fill');
  const totalExpEl = document.getElementById('profile-total-exp');
  const streakEl = document.getElementById('profile-streak');
  const completedCountEl = document.getElementById('profile-completed-count');

  if (levelNumEl) levelNumEl.textContent = String(level);
  if (expTextEl) {
    expTextEl.textContent = `${progress.currentLevelExp} / ${progress.nextLevelExpNeeded} EXP`;
  }

  if (progressbarEl) {
    progressbarEl.setAttribute('aria-valuenow', String(progress.percentage));
    progressbarEl.setAttribute('aria-valuemin', '0');
    progressbarEl.setAttribute('aria-valuemax', '100');
    progressbarEl.setAttribute(
      'aria-valuetext',
      `${progress.currentLevelExp} / ${progress.nextLevelExpNeeded} EXP (${progress.percentage}%)`
    );
  }

  if (progressbarFillEl) {
    progressbarFillEl.style.width = `${progress.percentage}%`;
  }

  if (totalExpEl) totalExpEl.textContent = String(totalExp);
  if (streakEl) streakEl.textContent = `${streak} Hari`;
  if (completedCountEl) completedCountEl.textContent = String(completedCount);

  // Render Gemini API Key settings (F20)
  renderApiKeyUI();
}

/**
 * Render Gemini API Key settings UI in Profile (F20).
 */
export function renderApiKeyUI() {
  const container = document.getElementById('ai-key-status-display');
  const labelEl = document.getElementById('label-api-key');
  if (!container) return;

  const keyRes = loadApiKey();

  if (!keyRes.ok) {
    container.innerHTML = `
      <div class="field-error" style="display:block; margin-bottom: 8px;">
        ${escapeHtml(keyRes.error || 'Kunci tersimpan tidak terbaca. Atur ulang di Profil.')}
      </div>
    `;
    if (labelEl) labelEl.textContent = 'Atur Ulang Kunci API';
    return;
  }

  if (keyRes.apiKey) {
    const masked = maskApiKey(keyRes.apiKey);
    container.innerHTML = `
      <div class="ai-key-card">
        <div class="ai-key-card-info">
          <span class="ai-key-card-label">Kunci Tersimpan</span>
          <span class="ai-key-card-masked">${escapeHtml(masked)}</span>
        </div>
        <button type="button" id="btn-remove-api-key" class="btn btn-danger btn-card-action">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          <span>Hapus Kunci</span>
        </button>
      </div>
    `;
    if (labelEl) labelEl.textContent = 'Ganti Kunci API';
  } else {
    container.innerHTML = `
      <p style="font-size: var(--font-size-small); color: var(--color-umber); margin-bottom: 8px;">
        Belum ada kunci API yang disimpan.
      </p>
    `;
    if (labelEl) labelEl.textContent = 'Atur Kunci API';
  }
}

/**
 * Initialize character counters and input listeners for Form Quest.
 */
export function initFormControls() {
  const titleInput = document.getElementById('quest-title');
  const titleCounter = document.getElementById('title-char-counter');
  const descInput = document.getElementById('quest-description');
  const descCounter = document.getElementById('desc-char-counter');

  function updateTitleCounter() {
    if (!titleInput || !titleCounter) return;
    const len = titleInput.value.length;
    titleCounter.textContent = `${len} / 80`;
    titleCounter.classList.toggle('near-limit', len >= 70 && len < 80);
    titleCounter.classList.toggle('at-limit', len >= 80);
    if (len > 0 && titleInput.getAttribute('aria-invalid') === 'true') {
      clearFieldError('title');
    }
  }

  function updateDescCounter() {
    if (!descInput || !descCounter) return;
    const len = descInput.value.length;
    descCounter.textContent = `${len} / 300`;
    descCounter.classList.toggle('near-limit', len >= 270 && len < 300);
    descCounter.classList.toggle('at-limit', len >= 300);
    if (len <= 300 && descInput.getAttribute('aria-invalid') === 'true') {
      clearFieldError('description');
    }
  }

  if (titleInput) {
    titleInput.addEventListener('input', updateTitleCounter);
  }
  if (descInput) {
    descInput.addEventListener('input', updateDescCounter);
  }

  // AI sentence counter (F19)
  const aiSentenceInput = document.getElementById('ai-sentence-input');
  const aiCharCounter = document.getElementById('ai-char-counter');
  function updateAiCounter() {
    if (!aiSentenceInput || !aiCharCounter) return;
    const len = aiSentenceInput.value.length;
    aiCharCounter.textContent = `${len} / 300`;
    aiCharCounter.classList.toggle('near-limit', len >= 270 && len < 300);
    aiCharCounter.classList.toggle('at-limit', len >= 300);
    const aiError = document.getElementById('ai-error');
    if (len > 0 && aiError) {
      aiError.textContent = '';
    }
  }

  if (aiSentenceInput) {
    aiSentenceInput.addEventListener('input', updateAiCounter);
  }
}

/**
 * Set validation error on a form field.
 * @param {'title'|'description'|'difficulty'|'due_date'} field
 * @param {string} message
 */
export function setFieldError(field, message) {
  let inputEl = null;
  let errorEl = null;

  if (field === 'title') {
    inputEl = document.getElementById('quest-title');
    errorEl = document.getElementById('title-error');
  } else if (field === 'description') {
    inputEl = document.getElementById('quest-description');
    errorEl = document.getElementById('desc-error');
  } else if (field === 'due_date') {
    inputEl = document.getElementById('quest-due-date');
    errorEl = document.getElementById('duedate-error');
  }

  if (inputEl) {
    inputEl.setAttribute('aria-invalid', 'true');
  }
  if (errorEl) {
    errorEl.textContent = message || '';
  }
}

/**
 * Clear validation error on a single form field.
 * @param {'title'|'description'|'due_date'} field
 */
export function clearFieldError(field) {
  let inputEl = null;
  let errorEl = null;

  if (field === 'title') {
    inputEl = document.getElementById('quest-title');
    errorEl = document.getElementById('title-error');
  } else if (field === 'description') {
    inputEl = document.getElementById('quest-description');
    errorEl = document.getElementById('desc-error');
  } else if (field === 'due_date') {
    inputEl = document.getElementById('quest-due-date');
    errorEl = document.getElementById('duedate-error');
  }

  if (inputEl) {
    inputEl.removeAttribute('aria-invalid');
  }
  if (errorEl) {
    errorEl.textContent = '';
  }
}

/**
 * Clear all form validation errors and reset counters.
 */
export function clearAllFieldErrors() {
  clearFieldError('title');
  clearFieldError('description');
  clearFieldError('due_date');

  const titleCounter = document.getElementById('title-char-counter');
  const descCounter = document.getElementById('desc-char-counter');
  if (titleCounter) {
    titleCounter.textContent = '0 / 80';
    titleCounter.className = 'char-counter';
  }
  if (descCounter) {
    descCounter.textContent = '0 / 300';
    descCounter.className = 'char-counter';
  }
}

// Dialog openers tracking
let questDialogOpener = null;
let confirmDialogOpener = null;
let confirmResolver = null;

/**
 * Initialize dialog listeners (Esc, cancel, close buttons).
 */
export function initDialogs() {
  const questDialog = document.getElementById('quest-dialog');
  const confirmDialog = document.getElementById('confirm-dialog');
  const btnCloseQuest = document.getElementById('btn-close-quest-dialog');
  const btnCancelQuest = document.getElementById('btn-cancel-quest');
  const btnCloseConfirm = document.getElementById('btn-close-confirm-dialog');
  const btnCancelConfirm = document.getElementById('btn-cancel-confirm');
  const btnAcceptConfirm = document.getElementById('btn-accept-confirm');

  if (questDialog) {
    questDialog.addEventListener('close', () => {
      clearAllFieldErrors();
      if (questDialogOpener && typeof questDialogOpener.focus === 'function' && document.body.contains(questDialogOpener)) {
        questDialogOpener.focus();
      }
      questDialogOpener = null;
    });

    if (btnCloseQuest) {
      btnCloseQuest.addEventListener('click', () => questDialog.close());
    }
    if (btnCancelQuest) {
      btnCancelQuest.addEventListener('click', () => questDialog.close());
    }
  }

  if (confirmDialog) {
    confirmDialog.addEventListener('close', () => {
      if (confirmResolver) {
        confirmResolver(false);
        confirmResolver = null;
      }
      if (confirmDialogOpener && typeof confirmDialogOpener.focus === 'function' && document.body.contains(confirmDialogOpener)) {
        confirmDialogOpener.focus();
      }
      confirmDialogOpener = null;
    });

    if (btnCloseConfirm) {
      btnCloseConfirm.addEventListener('click', () => confirmDialog.close());
    }
    if (btnCancelConfirm) {
      btnCancelConfirm.addEventListener('click', () => confirmDialog.close());
    }
    if (btnAcceptConfirm) {
      btnAcceptConfirm.addEventListener('click', () => {
        if (confirmResolver) {
          confirmResolver(true);
          confirmResolver = null;
        }
        confirmDialog.close();
      });
    }
  }
}

/**
 * Open Form Quest dialog.
 * @param {HTMLElement} openerElement
 * @param {Object} [quest] - Existing quest for edit mode, or null for create
 */
export function openQuestDialog(openerElement, quest = null) {
  const dialog = document.getElementById('quest-dialog');
  if (!dialog) return;

  questDialogOpener = openerElement;

  // Form inputs
  const titleEl = document.getElementById('quest-dialog-title');
  const idInput = document.getElementById('quest-id');
  const titleInput = document.getElementById('quest-title');
  const descInput = document.getElementById('quest-description');
  const dueDateInput = document.getElementById('quest-due-date');
  const diffRadios = Array.from(document.querySelectorAll('input[name="difficulty"]'));
  const diffHint = document.getElementById('difficulty-disabled-hint');

  clearAllFieldErrors();

  if (quest) {
    if (titleEl) titleEl.textContent = 'Ubah Quest';
    if (idInput) idInput.value = quest.id || '';
    if (titleInput) titleInput.value = quest.title || '';
    if (descInput) descInput.value = quest.description || '';
    if (dueDateInput) dueDateInput.value = quest.due_date || '';

    // Set selected difficulty
    const targetDiff = quest.difficulty || 'Mudah';
    diffRadios.forEach((r) => {
      r.checked = r.value === targetDiff;
    });

    // If completed: difficulty is disabled (EXP already recorded)
    const isCompleted = quest.status === 'completed';
    diffRadios.forEach((r) => {
      r.disabled = isCompleted;
    });
    if (diffHint) {
      diffHint.hidden = !isCompleted;
    }
  } else {
    // Create new quest mode
    if (titleEl) titleEl.textContent = 'Buat Quest Baru';
    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (dueDateInput) dueDateInput.value = '';

    diffRadios.forEach((r) => {
      r.checked = r.value === 'Mudah';
      r.disabled = false;
    });
    if (diffHint) {
      diffHint.hidden = true;
    }
  }

  // AI section reset (F19)
  const aiInputSection = document.getElementById('ai-input-section');
  const aiSentenceInput = document.getElementById('ai-sentence-input');
  const aiCharCounter = document.getElementById('ai-char-counter');
  const btnFillAi = document.getElementById('btn-fill-ai');
  const aiMissingNotice = document.getElementById('ai-key-missing-notice');
  const aiNotice = document.getElementById('ai-notice');
  const aiError = document.getElementById('ai-error');
  const aiReviewNote = document.getElementById('ai-review-note');
  const aiExtraNotes = document.getElementById('ai-review-extra-notes');

  if (aiSentenceInput) aiSentenceInput.value = '';
  if (aiCharCounter) {
    aiCharCounter.textContent = '0 / 300';
    aiCharCounter.className = 'char-counter';
  }
  if (aiError) aiError.textContent = '';
  if (aiReviewNote) aiReviewNote.hidden = true;
  if (aiExtraNotes) aiExtraNotes.innerHTML = '';

  if (aiInputSection) {
    aiInputSection.hidden = Boolean(quest);
  }

  const keyState = loadApiKey();
  const hasKey = keyState.ok && Boolean(keyState.apiKey);

  if (btnFillAi) {
    btnFillAi.disabled = !hasKey;
    btnFillAi.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
      </svg>
      <span>Isi dengan AI</span>
    `;
  }
  if (aiMissingNotice) {
    aiMissingNotice.hidden = hasKey;
    aiMissingNotice.textContent = 'Atur kunci API di Profil dulu.';
  }
  if (aiNotice) {
    aiNotice.hidden = !hasKey;
  }

  // Trigger counter updates
  if (titleInput) titleInput.dispatchEvent(new Event('input'));
  if (descInput) descInput.dispatchEvent(new Event('input'));

  dialog.showModal();

  // Focus title field as required by F1
  if (titleInput) {
    titleInput.focus();
  }
}

/**
 * Close Form Quest dialog.
 */
export function closeQuestDialog() {
  const dialog = document.getElementById('quest-dialog');
  if (dialog && dialog.open) {
    dialog.close();
  }
}

/**
 * Show Confirmation dialog.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.submessage]
 * @param {string} [options.confirmText="Konfirmasi"]
 * @param {boolean} [options.isDanger=false]
 * @param {HTMLElement} [options.opener]
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog({
  title = 'Konfirmasi',
  message,
  submessage = '',
  confirmText = 'Konfirmasi',
  isDanger = false,
  opener = null,
}) {
  const dialog = document.getElementById('confirm-dialog');
  const titleEl = document.getElementById('confirm-dialog-title');
  const msgEl = document.getElementById('confirm-message');
  const subMsgEl = document.getElementById('confirm-submessage');
  const acceptBtn = document.getElementById('btn-accept-confirm');
  const cancelBtn = document.getElementById('btn-cancel-confirm');

  if (!dialog) return Promise.resolve(false);

  confirmDialogOpener = opener;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (subMsgEl) {
    if (submessage) {
      subMsgEl.textContent = submessage;
      subMsgEl.removeAttribute('hidden');
    } else {
      subMsgEl.textContent = '';
      subMsgEl.setAttribute('hidden', '');
    }
  }

  if (acceptBtn) {
    acceptBtn.textContent = confirmText;
    acceptBtn.classList.toggle('btn-danger', isDanger);
    acceptBtn.classList.toggle('btn-primary', !isDanger);
  }

  return new Promise((resolve) => {
    let settled = false;

    function cleanupAndResolve(value) {
      if (settled) return;
      settled = true;

      acceptBtn?.removeEventListener('click', onAccept);
      cancelBtn?.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);

      if (dialog.open) {
        dialog.close();
      }

      if (
        confirmDialogOpener &&
        typeof confirmDialogOpener.focus === 'function' &&
        document.body.contains(confirmDialogOpener)
      ) {
        confirmDialogOpener.focus();
      }
      confirmDialogOpener = null;

      resolve(value);
    }

    const onAccept = () => cleanupAndResolve(true);
    const onCancel = () => cleanupAndResolve(false);
    const onClose = () => cleanupAndResolve(false);

    acceptBtn?.addEventListener('click', onAccept);
    cancelBtn?.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);

    dialog.showModal();
    if (cancelBtn) {
      cancelBtn.focus();
    }
  });
}

/**
 * Show a toast notification.
 * Success toasts: role="status", auto-dismisses in 3 seconds.
 * Error toasts: role="alert", stays until dismissed by user.
 * @param {Object} options
 * @param {string} options.message
 * @param {'success'|'error'} [options.type='success']
 * @returns {HTMLElement} The created toast element
 */
export function showToast({ message, type = 'success' }) {
  const container = document.getElementById('toast-container');
  if (!container) return null;

  const isSuccess = type === 'success';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', isSuccess ? 'status' : 'alert');

  let autoDismissTimer = null;

  function dismiss() {
    if (autoDismissTimer) clearTimeout(autoDismissTimer);
    toast.classList.remove('is-visible');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 200);
  }

  // Icons
  const iconSvg = isSuccess
    ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="var(--color-forest)" aria-hidden="true">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>`
    : `<svg viewBox="0 0 24 24" width="20" height="20" fill="var(--color-crimson)" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <span class="toast-message">${escapeHtml(message)}</span>
    ${
      !isSuccess
        ? `<button type="button" class="btn-toast-dismiss" aria-label="Tutup pemberitahuan">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>`
        : ''
    }
  `;

  if (!isSuccess) {
    const dismissBtn = toast.querySelector('.btn-toast-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', dismiss);
    }
  }

  container.appendChild(toast);

  // Trigger transition (or instant if reduced motion)
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    toast.classList.add('is-visible');
  } else {
    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });
  }

  // Success auto-dismisses after 3 seconds
  if (isSuccess) {
    autoDismissTimer = setTimeout(dismiss, CONFIG.TOAST_AUTO_DISMISS || 3000);
  }

  return toast;
}

// Active banner timer tracking
let bannerDismissTimer = null;

/**
 * Show level-up banner sliding down from top.
 * Auto-hides after 3 seconds, or closes earlier when user clicks close.
 * @param {number} newLevel
 */
export function showLevelUpBanner(newLevel) {
  const container = document.getElementById('levelup-banner-container');
  if (!container) return;

  // Clear existing banner if present
  if (bannerDismissTimer) {
    clearTimeout(bannerDismissTimer);
    bannerDismissTimer = null;
  }
  container.innerHTML = '';

  const banner = document.createElement('div');
  banner.className = 'levelup-banner';
  banner.id = 'active-levelup-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');

  function closeBanner() {
    if (bannerDismissTimer) {
      clearTimeout(bannerDismissTimer);
      bannerDismissTimer = null;
    }
    banner.classList.remove('is-visible');
    setTimeout(() => {
      if (banner.parentElement) banner.remove();
    }, CONFIG.BANNER_ANIMATION_DURATION || 400);
  }

  banner.innerHTML = `
    <div class="banner-inner">
      <div class="banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
      </div>
      <div class="banner-content">
        <span class="banner-tag">NAIK LEVEL!</span>
        <p class="banner-message">Selamat! Anda telah mencapai <strong>Level ${newLevel}</strong>!</p>
      </div>
      <button type="button" class="btn-banner-close" id="btn-close-banner" aria-label="Tutup pemberitahuan naik level">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  `;

  const closeBtn = banner.querySelector('#btn-close-banner');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeBanner);
  }

  container.appendChild(banner);

  // Trigger transition (or instant if reduced motion)
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    banner.classList.add('is-visible');
  } else {
    requestAnimationFrame(() => {
      banner.classList.add('is-visible');
    });
  }

  // Auto-hide after 3 seconds
  bannerDismissTimer = setTimeout(closeBanner, CONFIG.BANNER_AUTO_DISMISS || 3000);
}

/**
 * Announce message to assistive technology via aria-live.
 * @param {string} message
 */
export function announceLive(message) {
  const el = document.getElementById('live-announcements');
  if (el) {
    el.textContent = '';
    setTimeout(() => {
      el.textContent = message;
    }, 50);
  }
}

/**
 * Play wax-seal stamp animation and floating EXP label.
 * Resolves within ~800ms (or immediately if reduced motion is requested).
 * @param {HTMLElement} cardElement
 * @param {number} expEarned
 * @returns {Promise<void>}
 */
export function playCompletionAnimation(cardElement, expEarned) {
  if (!cardElement) return Promise.resolve();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    return Promise.resolve();
  }

  let stamp = cardElement.querySelector('.stamp-completed');
  if (!stamp) {
    stamp = document.createElement('span');
    stamp.className = 'stamp-completed stamp-animating';
    stamp.setAttribute('aria-hidden', 'true');
    stamp.textContent = 'SELESAI';
    cardElement.appendChild(stamp);
  } else {
    stamp.classList.add('stamp-animating');
  }

  const floatEl = document.createElement('div');
  floatEl.className = 'floating-exp';
  floatEl.textContent = `+${expEarned} EXP`;
  floatEl.setAttribute('aria-hidden', 'true');
  cardElement.appendChild(floatEl);

  return new Promise((resolve) => {
    setTimeout(() => {
      if (floatEl.parentElement) floatEl.remove();
      resolve();
    }, CONFIG.ANIMATION_DURATION_STAMP || 800);
  });
}

/**
 * Render corrupted data alert banner with "Impor CSV" recovery button.
 * @param {string} errorMsg
 * @param {Function} onRecoverImport
 */
export function renderCorruptedDataState(errorMsg, onRecoverImport) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Avoid duplicate banners
  if (document.querySelector('.corrupted-data-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'corrupted-data-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <div class="corrupted-inner">
      <svg class="corrupted-icon" viewBox="0 0 24 24" width="36" height="36" fill="var(--color-crimson)" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <div class="corrupted-text">
        <h2 class="corrupted-title">Data Penyimpanan Rusak</h2>
        <p class="corrupted-desc">${escapeHtml(errorMsg || 'Data lokal tidak dapat dibaca karena format tidak sesuai.')}</p>
        <p class="corrupted-subdesc">Data tidak ditimpa secara otomatis. Silakan pulihkan menggunakan berkas cadangan CSV.</p>
      </div>
      <button type="button" class="btn btn-primary btn-recover" id="btn-recover-import">
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          <path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
        </svg>
        <span>Impor CSV</span>
      </button>
    </div>
  `;

  const btn = banner.querySelector('#btn-recover-import');
  if (btn && onRecoverImport) {
    btn.addEventListener('click', onRecoverImport);
  }

  mainContent.prepend(banner);
}

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
