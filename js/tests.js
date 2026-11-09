// Automated unit & integration tests for Questbook pure logic & CSV functions
import { CONFIG } from './config.js?v=2';
import {
  calculateLevelThreshold,
  calculateLevel,
  calculateProgress,
  calculateExpAward,
  calculateStreak,
  validateQuestInput,
  resolveAiDate,
  validateAiExtractedData,
} from './logic.js?v=5';
import {
  buildCsv,
  parseCsv,
  validateCsv,
  CSV_HEADER,
} from './csv.js?v=2';

/**
 * Test runner function
 * @returns {Array<{ name: string, category: string, pass: boolean, error?: string, expected?: any, actual?: any }>}
 */
export async function runAutomatedTests() {
  const tests = [];

  function assert(category, name, pass, expected, actual, error = '') {
    tests.push({
      category,
      name,
      pass: Boolean(pass),
      expected,
      actual,
      error: pass ? '' : error || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    });
  }

  // ==========================================
  // Category 1: EXP Values & Streak Bonus
  // ==========================================
  // Base EXP (no streak bonus / streak = 0)
  assert('EXP & Streak Bonus', 'Base EXP: Mudah = 10', calculateExpAward('Mudah', 0) === 10, 10, calculateExpAward('Mudah', 0));
  assert('EXP & Streak Bonus', 'Base EXP: Sedang = 25', calculateExpAward('Sedang', 0) === 25, 25, calculateExpAward('Sedang', 0));
  assert('EXP & Streak Bonus', 'Base EXP: Sulit = 50', calculateExpAward('Sulit', 0) === 50, 50, calculateExpAward('Sulit', 0));

  // With streak bonus (5 * min(streak, 5))
  // Spec example 1: Sulit quest on streak day 3 = 50 + 15 = 65 EXP
  assert('EXP & Streak Bonus', 'Sulit quest on streak day 3 = 65 EXP (Spec Example)', calculateExpAward('Sulit', 3) === 65, 65, calculateExpAward('Sulit', 3));

  // Spec example 2: First ever completion, Mudah (streak 1) = 10 + 5 = 15 EXP
  assert('EXP & Streak Bonus', 'Mudah quest on streak day 1 = 15 EXP (Spec Example)', calculateExpAward('Mudah', 1) === 15, 15, calculateExpAward('Mudah', 1));

  // Sedang on streak day 2 = 25 + 10 = 35 EXP
  assert('EXP & Streak Bonus', 'Sedang quest on streak day 2 = 35 EXP', calculateExpAward('Sedang', 2) === 35, 35, calculateExpAward('Sedang', 2));

  // Capped streak bonus: streak day 5 = max bonus 25
  assert('EXP & Streak Bonus', 'Sulit quest on streak day 5 = 75 EXP (Max bonus)', calculateExpAward('Sulit', 5) === 75, 75, calculateExpAward('Sulit', 5));

  // Capped streak bonus: streak day 10 = max bonus 25 (capped)
  assert('EXP & Streak Bonus', 'Sulit quest on streak day 10 = 75 EXP (Capped at 5 days)', calculateExpAward('Sulit', 10) === 75, 75, calculateExpAward('Sulit', 10));

  // ==========================================
  // Category 2: Streak Rules
  // ==========================================
  const refDate = new Date(2026, 10, 9, 14, 0, 0); // Nov 9, 2026 local
  const todayStr = new Date(2026, 10, 9, 8, 0, 0).toISOString();
  const yestStr = new Date(2026, 10, 8, 23, 30, 0).toISOString();
  const twoDaysAgoStr = new Date(2026, 10, 7, 10, 0, 0).toISOString();
  const threeDaysAgoStr = new Date(2026, 10, 6, 10, 0, 0).toISOString();
  const gapDayStr = new Date(2026, 10, 4, 10, 0, 0).toISOString();

  // Streak ending today: 3 consecutive days
  const streak3Today = [
    { status: 'completed', completed_at: todayStr },
    { status: 'completed', completed_at: yestStr },
    { status: 'completed', completed_at: twoDaysAgoStr },
  ];
  assert('Streak Rules', '3 consecutive calendar days ending today = streak 3', calculateStreak(streak3Today, refDate) === 3, 3, calculateStreak(streak3Today, refDate));

  // Streak ending yesterday: 2 consecutive days (still active)
  const streak2Yesterday = [
    { status: 'completed', completed_at: yestStr },
    { status: 'completed', completed_at: twoDaysAgoStr },
  ];
  assert('Streak Rules', 'Consecutive completions ending yesterday = streak 2', calculateStreak(streak2Yesterday, refDate) === 2, 2, calculateStreak(streak2Yesterday, refDate));

  // Across midnight: completion at 23:30 yesterday and 00:30 today count as 2 distinct days
  const midnightQuests = [
    { status: 'completed', completed_at: new Date(2026, 10, 8, 23, 30, 0).toISOString() },
    { status: 'completed', completed_at: new Date(2026, 10, 9, 0, 30, 0).toISOString() },
  ];
  assert('Streak Rules', 'Across midnight counts as 2 consecutive days', calculateStreak(midnightQuests, refDate) === 2, 2, calculateStreak(midnightQuests, refDate));

  // Streak with gaps: today + gap day (no yesterday, no 2-days-ago)
  const streakWithGap = [
    { status: 'completed', completed_at: todayStr },
    { status: 'completed', completed_at: gapDayStr },
  ];
  assert('Streak Rules', 'Streak resets across gap: today + gap day = streak 1', calculateStreak(streakWithGap, refDate) === 1, 1, calculateStreak(streakWithGap, refDate));

  // No completion yesterday and no completion today (older than yesterday)
  const streakBrokenOld = [
    { status: 'completed', completed_at: threeDaysAgoStr },
  ];
  assert('Streak Rules', 'Latest completion older than yesterday = streak 0', calculateStreak(streakBrokenOld, refDate) === 0, 0, calculateStreak(streakBrokenOld, refDate));

  // Active-only quests do not count toward streak
  const activeOnly = [
    { status: 'active', completed_at: '' },
  ];
  assert('Streak Rules', 'Active-only quests = streak 0', calculateStreak(activeOnly, refDate) === 0, 0, calculateStreak(activeOnly, refDate));

  // ==========================================
  // Category 3: Level Thresholds
  // ==========================================
  // Formula: 50 * L * (L - 1)
  assert('Level Thresholds', 'Threshold Level 1 = 0 EXP', calculateLevelThreshold(1) === 0, 0, calculateLevelThreshold(1));
  assert('Level Thresholds', 'Threshold Level 2 = 100 EXP', calculateLevelThreshold(2) === 100, 100, calculateLevelThreshold(2));
  assert('Level Thresholds', 'Threshold Level 3 = 300 EXP', calculateLevelThreshold(3) === 300, 300, calculateLevelThreshold(3));
  assert('Level Thresholds', 'Threshold Level 4 = 600 EXP', calculateLevelThreshold(4) === 600, 600, calculateLevelThreshold(4));
  assert('Level Thresholds', 'Threshold Level 5 = 1000 EXP', calculateLevelThreshold(5) === 1000, 1000, calculateLevelThreshold(5));
  assert('Level Thresholds', 'Threshold Level 6 = 1500 EXP', calculateLevelThreshold(6) === 1500, 1500, calculateLevelThreshold(6));

  // Level evaluations at exact boundaries
  assert('Level Thresholds', 'Level at 0 EXP = Level 1', calculateLevel(0) === 1, 1, calculateLevel(0));
  assert('Level Thresholds', 'Level at 99 EXP = Level 1', calculateLevel(99) === 1, 1, calculateLevel(99));
  assert('Level Thresholds', 'Level at 100 EXP = Level 2', calculateLevel(100) === 2, 2, calculateLevel(100));
  assert('Level Thresholds', 'Level at 300 EXP = Level 3', calculateLevel(300) === 3, 3, calculateLevel(300));
  assert('Level Thresholds', 'Level at 600 EXP = Level 4', calculateLevel(600) === 4, 4, calculateLevel(600));
  assert('Level Thresholds', 'Level at 1000 EXP = Level 5', calculateLevel(1000) === 5, 5, calculateLevel(1000));
  assert('Level Thresholds', 'Level at 1500 EXP = Level 6', calculateLevel(1500) === 6, 6, calculateLevel(1500));

  // ==========================================
  // Category 4: Progress Calculation
  // ==========================================
  // Spec example: 150 EXP is level 2 with 25% progress
  const prog150 = calculateProgress(150);
  assert('Progress Calculation', 'Progress at 150 EXP is Level 2', calculateLevel(150) === 2, 2, calculateLevel(150));
  assert('Progress Calculation', 'Progress at 150 EXP is exactly 25%', prog150.percentage === 25, 25, prog150.percentage);
  assert('Progress Calculation', 'Progress fraction at 150 EXP is 0.25', prog150.fraction === 0.25, 0.25, prog150.fraction);
  assert('Progress Calculation', 'Progress currentLevelExp at 150 EXP is 50', prog150.currentLevelExp === 50, 50, prog150.currentLevelExp);
  assert('Progress Calculation', 'Progress nextLevelExpNeeded at 150 EXP is 200', prog150.nextLevelExpNeeded === 200, 200, prog150.nextLevelExpNeeded);

  // 0 EXP: Level 1, 0% progress
  const prog0 = calculateProgress(0);
  assert('Progress Calculation', 'Progress at 0 EXP is 0%', prog0.percentage === 0, 0, prog0.percentage);

  // ==========================================
  // Category 5: CSV Round Trip
  // ==========================================
  const roundTripQuests = [
    {
      id: 'qb-rt-1',
      title: 'Misi Rahasia, dengan Koma',
      description: 'Baris satu\r\nBaris dua dengan "tanda kutip ganda"\r\nBaris tiga, dan koma',
      difficulty: 'Sulit',
      status: 'completed',
      created_at: '2026-11-09T08:00:00.000Z',
      completed_at: '2026-11-09T09:00:00.000Z',
      exp_earned: 65,
      due_date: '2026-12-15',
    },
    {
      id: 'qb-rt-2',
      title: 'Quest Biasa',
      description: '',
      difficulty: 'Mudah',
      status: 'active',
      created_at: '2026-11-09T10:00:00.000Z',
      completed_at: '',
      exp_earned: 0,
      due_date: '',
    },
  ];

  const csvBuilt = buildCsv(roundTripQuests);
  const csvParsed = parseCsv(csvBuilt);
  const csvValidated = validateCsv(csvParsed);

  assert('CSV Round Trip', 'CSV round trip validates successfully', csvValidated.isValid === true, true, csvValidated.isValid);
  assert('CSV Round Trip', 'CSV round trip recovers identical number of quests (2)', csvValidated.quests?.length === 2, 2, csvValidated.quests?.length);

  const restoredQ1 = csvValidated.quests?.[0];
  assert('CSV Round Trip', 'Restored Q1 title preserves commas verbatim', restoredQ1?.title === roundTripQuests[0].title, roundTripQuests[0].title, restoredQ1?.title);
  assert('CSV Round Trip', 'Restored Q1 description preserves quotes and newlines verbatim', restoredQ1?.description === roundTripQuests[0].description, roundTripQuests[0].description, restoredQ1?.description);
  assert('CSV Round Trip', 'Restored Q1 difficulty, status, exp_earned match verbatim', restoredQ1?.difficulty === 'Sulit' && restoredQ1?.status === 'completed' && restoredQ1?.exp_earned === 65, true, true);

  // ==========================================
  // Category 6: Rejection of Invalid Rows with Row Number
  // ==========================================
  // Invalid Header
  const badHdr = 'wrong_id,wrong_title\r\n1,2';
  const valHdr = validateCsv(parseCsv(badHdr));
  assert('CSV Row Validation', 'Rejects missing/wrong header', valHdr.isValid === false && valHdr.error?.includes('Header'), true, valHdr.isValid === false);

  // Row 2: Empty title
  const row2EmptyTitle = `${CSV_HEADER}\r\nq1,   ,,Mudah,active,2026-11-09T00:00:00Z,,0,`;
  const valRow2 = validateCsv(parseCsv(row2EmptyTitle));
  assert('CSV Row Validation', 'Rejects empty title naming "Baris 2"', valRow2.isValid === false && valRow2.error?.includes('Baris 2') && valRow2.error?.includes('judul wajib diisi'), true, valRow2.error);

  // Row 3: Title > 80 chars
  const row3LongTitle = `${CSV_HEADER}\r\nq1,Judul Sah,,Mudah,active,2026-11-09T00:00:00Z,,0,\r\nq2,${'A'.repeat(81)},,Mudah,active,2026-11-09T00:00:00Z,,0,`;
  const valRow3 = validateCsv(parseCsv(row3LongTitle));
  assert('CSV Row Validation', 'Rejects title >80 chars naming "Baris 3"', valRow3.isValid === false && valRow3.error?.includes('Baris 3') && valRow3.error?.includes('80 karakter'), true, valRow3.error);

  // Row 4: Duplicate ID
  const row4DupId = `${CSV_HEADER}\r\nq1,Judul 1,,Mudah,active,2026-11-09T00:00:00Z,,0,\r\nq2,Judul 2,,Mudah,active,2026-11-09T00:00:00Z,,0,\r\nq1,Judul 3,,Mudah,active,2026-11-09T00:00:00Z,,0,`;
  const valRow4 = validateCsv(parseCsv(row4DupId));
  assert('CSV Row Validation', 'Rejects duplicate ID naming "Baris 4"', valRow4.isValid === false && valRow4.error?.includes('Baris 4') && valRow4.error?.includes('duplikat'), true, valRow4.error);

  // Row 2: Invalid difficulty
  const row2BadDiff = `${CSV_HEADER}\r\nq1,Judul Sah,,Legendaris,active,2026-11-09T00:00:00Z,,0,`;
  const valRow2Diff = validateCsv(parseCsv(row2BadDiff));
  assert('CSV Row Validation', 'Rejects invalid difficulty naming "Baris 2"', valRow2Diff.isValid === false && valRow2Diff.error?.includes('Baris 2') && valRow2Diff.error?.includes('tingkat kesulitan'), true, valRow2Diff.error);

  // Row 2: Active quest with non-zero exp_earned
  const row2ActiveExp = `${CSV_HEADER}\r\nq1,Judul Sah,,Mudah,active,2026-11-09T00:00:00Z,,50,`;
  const valRow2Exp = validateCsv(parseCsv(row2ActiveExp));
  assert('CSV Row Validation', 'Rejects active quest with non-zero EXP naming "Baris 2"', valRow2Exp.isValid === false && valRow2Exp.error?.includes('Baris 2') && valRow2Exp.error?.includes('exp_earned'), true, valRow2Exp.error);

  // Row 2: Completed quest without completed_at
  const row2NoCompletedAt = `${CSV_HEADER}\r\nq1,Judul Sah,,Mudah,completed,2026-11-09T00:00:00Z,,15,`;
  const valRow2Comp = validateCsv(parseCsv(row2NoCompletedAt));
  assert('CSV Row Validation', 'Rejects completed quest missing completed_at naming "Baris 2"', valRow2Comp.isValid === false && valRow2Comp.error?.includes('Baris 2') && valRow2Comp.error?.includes('completed_at'), true, valRow2Comp.error);

  // ==========================================
  // Category 7: F19 Date Resolution & AI Validation (No AI)
  // ==========================================
  const nov9_2026 = new Date(2026, 10, 9, 10, 0, 0); // 9 Nov 2026
  const apr14_2026 = new Date(2026, 3, 14, 10, 0, 0); // 14 Apr 2026

  // Spec Example 1: on 9 Nov 2026, "14 april" becomes 14 Apr 2027
  const dRes1 = resolveAiDate(14, 4, null, nov9_2026);
  assert('F19 Date Resolution', '"14 april" on 9 Nov 2026 gives 14 Apr 2027 (Spec Example)', dRes1.dateStr === '2027-04-14', '2027-04-14', dRes1.dateStr);

  // Spec Example 2: on 14 Apr 2026, "14 april" becomes 14 Apr 2026
  const dRes2 = resolveAiDate(14, 4, null, apr14_2026);
  assert('F19 Date Resolution', '"14 april" on 14 Apr 2026 gives 14 Apr 2026 (Spec Example)', dRes2.dateStr === '2026-04-14', '2026-04-14', dRes2.dateStr);

  // Spec Example 3: Invalid combination (31 Feb) leaves date empty and shows note
  const dRes3 = resolveAiDate(31, 2, null, nov9_2026);
  assert('F19 Date Resolution', 'Invalid 31 February leaves date empty with note', dRes3.dateStr === '' && dRes3.note.includes('tidak valid'), true, dRes3);

  // Spec Example 4: Date before today with year shows "Tenggat ini sudah lewat."
  const dRes4 = resolveAiDate(1, 1, 2025, nov9_2026);
  assert('F19 Date Resolution', 'Past date with year fills date and shows "Tenggat ini sudah lewat."', dRes4.dateStr === '2025-01-01' && dRes4.note === 'Tenggat ini sudah lewat.', true, dRes4);

  // Validation: Title 1-80 chars valid, invalid rejected
  const valAiValid = validateAiExtractedData({
    title: 'Tugas Kalkulus',
    difficulty: 'Sedang',
    due_day: 14,
    due_month: 4,
    due_year: null,
    description: 'Bab 3 turunan',
  }, nov9_2026);
  assert('F19 AI Output Validation', 'Valid AI output structure accepted', valAiValid.isValid === true && valAiValid.data?.due_date === '2027-04-14', true, valAiValid.isValid);

  const valAiEmptyTitle = validateAiExtractedData({ title: '   ' }, nov9_2026);
  assert('F19 AI Output Validation', 'Empty AI title rejected', valAiEmptyTitle.isValid === false, false, valAiEmptyTitle.isValid);

  const valAiBadDiff = validateAiExtractedData({ title: 'Tugas', difficulty: 'Mytical' }, nov9_2026);
  assert('F19 AI Output Validation', 'Invalid difficulty defaults to "Sedang" with note', valAiBadDiff.isValid === true && valAiBadDiff.data?.difficulty === 'Sedang' && valAiBadDiff.notes.some(n => n.includes('Sedang')), true, valAiBadDiff.data?.difficulty);

  const valAiLongDesc = validateAiExtractedData({ title: 'Tugas', description: 'X'.repeat(350) }, nov9_2026);
  assert('F19 AI Output Validation', 'Description >300 truncated to 300 with note', valAiLongDesc.data?.description.length === 300 && valAiLongDesc.notes.some(n => n.includes('300')), true, valAiLongDesc.data?.description.length);

  return tests;
}
