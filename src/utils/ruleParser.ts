import type {
  ArabicNumeralStyle,
  ParsedOption,
  ParsedQuestion,
  ParseResult,
  ParserWarning,
  QuestionType,
} from '../types/exam';
import { stripRichHtml } from './richText';

const EASTERN_ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ARABIC_OPTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ'];

export function containsArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function normalizeEasternDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (ch) => String(EASTERN_ARABIC_DIGITS.indexOf(ch)));
}

export function toEasternArabicDigits(numOrStr: number | string): string {
  return String(numOrStr).replace(/\d/g, (d) => EASTERN_ARABIC_DIGITS[Number(d)] ?? d);
}

export function normalizeArabicOptionToIndex(markerChar: string): number {
  const c = markerChar.trim();
  const latinIdx = ['A', 'B', 'C', 'D', 'E'].indexOf(c.toUpperCase());
  if (latinIdx !== -1) return latinIdx;
  if (c === 'أ' || c === 'ا' || c === 'إ' || c === 'آ') return 0;
  if (c === 'ب') return 1;
  if (c === 'ج') return 2;
  if (c === 'د') return 3;
  if (c === 'هـ' || c === 'ه') return 4;
  return -1;
}

export function formatOptionMarkerChar(
  rawLabel: string,
  index: number,
  optionLabelStyle: 'auto' | 'latin' | 'arabic',
  isRtl: boolean
): string {
  if (optionLabelStyle === 'latin') {
    const idx = normalizeArabicOptionToIndex(rawLabel);
    const resolved = idx >= 0 ? idx : index;
    return ['A', 'B', 'C', 'D', 'E'][resolved] || rawLabel;
  }
  if (optionLabelStyle === 'arabic' || (optionLabelStyle === 'auto' && isRtl)) {
    const idx = normalizeArabicOptionToIndex(rawLabel);
    const resolved = idx >= 0 ? idx : index;
    return ARABIC_OPTION_LETTERS[resolved] || rawLabel;
  }
  return rawLabel;
}

export function stripUnderlineMarkup(text: string): string {
  return stripRichHtml(text);
}

export function parseUnderlineSegments(text: string): { text: string; underline: boolean }[] {
  if (!/<u>/i.test(text)) {
    return [{ text, underline: false }];
  }
  const segments: { text: string; underline: boolean }[] = [];
  const regex = /<u>([\s\S]*?)<\/u>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, m.index), underline: false });
    }
    if (m[1]) {
      segments.push({ text: m[1], underline: true });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), underline: false });
  }
  return segments.filter((s) => s.text.length > 0);
}

const QUESTION_START_REGEX =
  /^(?:Soal\s+|السؤال\s+|س\s*)?([0-9٠-٩]{1,3})\s*([.)\]:\-])\s*(.*)$/i;
const OPTION_LINE_REGEX =
  /^([A-Ea-e]|أ|ا|إ|ب|ج|د|هـ|ه)\s*([.)\]:\-])\s*(.+)$/;
const INLINE_OPTIONS_SPLIT_REGEX =
  /\s+(?=(?:[A-Ea-e]|أ|ا|إ|ب|ج|د|هـ|ه)[.)\]:\-]\s+)/g;
const SUBJECT_HEADER_REGEX =
  /^(?:Mata\s+Pelajaran|Mapel|المادة(?:\s+الدراسية)?)\s*[:：]\s*(.+)$/i;
const INSTRUCTION_HEADER_REGEX =
  /^(?:Petunjuk(?:\s+Pengerjaan)?|Instruksi|التعليمات|إرشادات(?:\s+الامتحان)?)\s*[:：]\s*(.*)$/i;
const SECTION_HEADER_STRICT_REGEX =
  /^(?:(?:لالف|الألف|الأول|ألف|الف|الباء|باء|الجيم|جيم|الدال|دال|الهاء|هاء|الواو|واو|القسم\s+\S+|الباب\s+\S+|الفصل\s+\S+)\s*(?:\)|:|：)?\s*.+|(?:أولاً|أولا|ثانياً|ثانيا|ثالثاً|ثالثا|رابعاً|رابعا|خامساً|خامسا)\s*[:：)\-–—]\s*.+|(?:BAB|Bab|Chapter|Bagian|Romawi|Section|Part)\s+(?:[IVX]{1,5}|\d{1,3}|[A-Z])(?:\s*[:.)\-–—]\s*.*|\s*)$)/i;
const SECTION_HEADER_LOOSE_REGEX =
  /^(?:BAB|Bab|Chapter|Bagian|Romawi|Section|Part)\s+(?:[IVX]{1,5}|\d{1,3}|[A-Z])\s+\S.*$/i;
const LETTER_OR_ROMAN_SECTION_REGEX = /^(?:[A-Z]|[IVX]{1,4})\s*[.)]\s+\S+/;
const STIMULUS_HEADER_REGEX =
  /^(?:Bacalah\s+(?:teks|paragraf|wacana|kutipan)|Perhatikan\s+(?:tabel|gambar|teks|data)|Teks\s+\d+|Wacana|اقرأ\s+(?:النص|الفقرة|القطعة)|لاحظ\s+(?:الجدول|الصورة|النص))/i;

function normalizeSectionKey(sectionTitle?: string): string {
  return stripRichHtml(sectionTitle || '').replace(/\s+/g, ' ').trim();
}

function rebuildNumberLabel(existingLabel: string | undefined, num: number): string {
  const raw = (existingLabel || '').trim();
  const usesEastern = /[٠-٩]/.test(raw);
  const numStr = usesEastern ? toEasternArabicDigits(num) : String(num);
  if (!raw) return `${numStr}.`;

  const m = raw.match(/^([^\d٠-٩]*)[0-9٠-٩]+(.*)$/);
  if (m) {
    const prefix = m[1] || '';
    const suffix = m[2] || '.';
    return `${prefix}${numStr}${suffix}`;
  }
  return `${numStr}.`;
}

/**
 * Menyesuaikan ulang nomor soal agar selalu urut kembali dari 1 setiap kali memulai bab/bagian baru.
 */
export function renumberQuestionsBySection(questions: ParsedQuestion[]): ParsedQuestion[] {
  let currentSectionKey: string | null = null;
  let counter = 0;

  return questions.map((q, idx) => {
    const secKey = normalizeSectionKey(q.sectionTitle);
    if (idx === 0 || secKey !== currentSectionKey) {
      currentSectionKey = secKey;
      counter = 1;
    } else {
      counter += 1;
    }

    const updatedLabel = rebuildNumberLabel(q.originalNumberLabel, counter);
    if (q.number === counter && q.originalNumberLabel === updatedLabel) {
      return q;
    }
    return {
      ...q,
      number: counter,
      originalNumberLabel: updatedLabel,
    };
  });
}

function detectSpecialFeatures(text: string): {
  hasTable: boolean;
  hasFormula: boolean;
  hasImageRef: boolean;
} {
  const hasTable = /\|.+\|/.test(text) || /\t.+\t/.test(text);
  const hasFormula =
    /[√∫∑π±×÷≤≥≠≈^]/.test(text) ||
    /\$[^$]+\$/.test(text) ||
    /\b\d+\s*\/\s*\d+\b/.test(text) ||
    /\b[xyz]\s*[+\-=]\s*\d+/i.test(text);
  const hasImageRef =
    /\b(?:perhatikan\s+gambar|amati\s+gambar|lihat\s+gambar|gambar\s+di\s+bawah|\[gambar\])/i.test(text) ||
    /(?:انظر\s+إلى\s+الصورة|لاحظ\s+الصورة|الشكل\s+التالي)/.test(text);
  return { hasTable, hasFormula, hasImageRef };
}

function classifyQuestionType(
  stem: string,
  options: ParsedOption[],
  rawBlock: string
): { type: QuestionType; needsManualReview: boolean; reviewReason?: string } {
  const lower = `${stem} ${rawBlock}`.toLowerCase();

  if (
    options.length === 2 &&
    ((options.some((o) => /benar|true|صحيح|صواب|صح/i.test(o.text)) &&
      options.some((o) => /salah|false|خطأ/i.test(o.text))))
  ) {
    return { type: 'benar_salah', needsManualReview: false };
  }

  if (
    (/\bbenar\s*(?:\/|atau)\s*salah\b/i.test(lower) ||
      /(?:صح\s*(?:أو|\/)\s*خطأ|صحيح\s*(?:أو|\/)\s*خطأ)/.test(rawBlock)) &&
    options.length <= 2
  ) {
    return { type: 'benar_salah', needsManualReview: false };
  }

  if (
    /\bjodohkan\b|\bpasangkanlah\b|\bmenjodohkan\b/i.test(lower) ||
    /(?:صل\s+بين|طابق|زاوج)/.test(rawBlock) ||
    /->|---/.test(rawBlock)
  ) {
    return { type: 'menjodohkan', needsManualReview: false };
  }

  if (
    options.length >= 2 &&
    (/\bpilih(?:lah)?\s+(?:lebih\s+dari\s+satu|dua|beberapa)\b/i.test(lower) ||
      /pilihan\s+ganda\s+kompleks/i.test(lower) ||
      /(?:اختر\s+أكثر\s+من\s+إجابة|إجابتين)/.test(rawBlock) ||
      /\[[\sxX]?\]/.test(rawBlock))
  ) {
    return { type: 'pilihan_ganda_kompleks', needsManualReview: false };
  }

  if (options.length >= 3) {
    const indices = options.map((o) => normalizeArabicOptionToIndex(o.label));
    const isSequential = indices.every((val, idx) => val === idx);
    if (!isSequential) {
      return {
        type: 'pilihan_ganda',
        needsManualReview: true,
        reviewReason: `Urutan opsi pilihan ganda tidak berurutan (${options.map((o) => o.label).join(', ')}).`,
      };
    }
    return { type: 'pilihan_ganda', needsManualReview: false };
  }

  if (options.length > 0 && options.length < 3) {
    return {
      type: 'pilihan_ganda',
      needsManualReview: true,
      reviewReason: `Pilihan jawaban tidak lengkap (hanya terdeteksi ${options.length} opsi: ${options.map((o) => o.label).join(', ')}).`,
    };
  }

  if (
    (/\.{3,}|_{3,}|…/.test(stem) || /(?:املأ\s+الفراغ|أكمل\s+الجملة)/.test(stem)) &&
    stem.length < 180 &&
    !/\b(?:jelaskan|uraikan|sebutkan|mengapa|bagaimana)\b/i.test(lower) &&
    !/(?:اشرح|اذكر|علل|وضح)/.test(stem)
  ) {
    return { type: 'isian_singkat', needsManualReview: false };
  }

  if (/\b(?:analisis|diskusikan|karanglah|tuliskan\s+pendapat|esai)\b/i.test(lower) || /مقال|عبّر/.test(stem)) {
    return { type: 'esai', needsManualReview: false };
  }

  return { type: 'uraian', needsManualReview: false };
}

export function formatNumberStringByStyle(num: number, style: ArabicNumeralStyle): string {
  return style === 'eastern' ? toEasternArabicDigits(num) : String(num);
}

export function parseQuestionsRuleBased(rawText: string): ParseResult {
  const normalized = rawText.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let detectedSubject: string | undefined;
  let globalInstruction: string | undefined;
  let currentSectionTitle: string | undefined;
  let pendingStimulusLines: string[] = [];
  let inStimulusBlock = false;

  const questions: ParsedQuestion[] = [];
  const warnings: ParserWarning[] = [];

  let currentBlock: {
    number: number;
    originalNumberLabel: string;
    sectionTitle?: string;
    stemLines: string[];
    options: ParsedOption[];
    subquestions: string[];
    stimulus?: string;
    rawLines: string[];
  } | null = null;

  const flushCurrent = () => {
    if (!currentBlock) return;
    const stem = currentBlock.stemLines.join('\n').trim();
    const rawBlock = currentBlock.rawLines.join('\n').trim();
    const features = detectSpecialFeatures(rawBlock);
    const classification = classifyQuestionType(stem, currentBlock.options, rawBlock);

    let needsManualReview = classification.needsManualReview;
    let reviewReason = classification.reviewReason;

    if (!stem) {
      needsManualReview = true;
      reviewReason = reviewReason
        ? `${reviewReason} Teks pertanyaan kosong.`
        : 'Teks pertanyaan kosong atau tidak terbaca.';
    }

    const q: ParsedQuestion = {
      id: `q_${questions.length + 1}_${currentBlock.number}`,
      number: currentBlock.number,
      originalNumberLabel: currentBlock.originalNumberLabel,
      sectionTitle: currentBlock.sectionTitle,
      type: classification.type,
      stem,
      options: currentBlock.options,
      stimulus: currentBlock.stimulus,
      subquestions: currentBlock.subquestions.length > 0 ? currentBlock.subquestions : undefined,
      hasTable: features.hasTable,
      hasFormula: features.hasFormula,
      hasImageRef: features.hasImageRef,
      needsManualReview,
      reviewReason,
      rawBlock,
    };

    questions.push(q);

    if (needsManualReview && reviewReason) {
      warnings.push({
        id: `warn_q_${q.id}`,
        severity: 'warning',
        code: 'MANUAL_REVIEW',
        questionNumber: q.number,
        message: `Soal ${q.number ?? '?'}: ${reviewReason}`,
      });
    }

    currentBlock = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (inStimulusBlock && pendingStimulusLines.length > 0) {
        inStimulusBlock = false;
      }
      continue;
    }

    if (!currentBlock) {
      const subjectMatch = trimmed.match(SUBJECT_HEADER_REGEX);
      if (subjectMatch) {
        detectedSubject = subjectMatch[1].trim();
        continue;
      }
      const instrMatch = trimmed.match(INSTRUCTION_HEADER_REGEX);
      if (instrMatch) {
        globalInstruction = instrMatch[1].trim() || undefined;
        continue;
      }
    }

    let nextNonEmpty = '';
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j].trim();
      if (cand) {
        nextNonEmpty = cand;
        break;
      }
    }

    const isLooseSection =
      SECTION_HEADER_LOOSE_REGEX.test(trimmed) &&
      trimmed.length <= 90 &&
      !/[,;]$/.test(trimmed) &&
      (!currentBlock ||
        currentBlock.options.length > 0 ||
        (Boolean(nextNonEmpty) &&
          (QUESTION_START_REGEX.test(nextNonEmpty) || STIMULUS_HEADER_REGEX.test(nextNonEmpty))));

    let isLetterSectionCandidate = false;
    if (LETTER_OR_ROMAN_SECTION_REGEX.test(trimmed)) {
      const nextStartsQuestion = Boolean(nextNonEmpty) && QUESTION_START_REGEX.test(nextNonEmpty);
      if (!currentBlock && nextStartsQuestion) {
        isLetterSectionCandidate = true;
      } else if (currentBlock && currentBlock.options.length === 0 && nextStartsQuestion) {
        isLetterSectionCandidate = true;
      } else if (/^(?:[IVX]{2,4})\s*[.)]\s+\S+/.test(trimmed) && (nextStartsQuestion || !currentBlock)) {
        isLetterSectionCandidate = true;
      } else if (currentBlock && currentBlock.options.length > 0 && nextStartsQuestion) {
        // Deteksi perpindahan bab huruf (misal "B. Essay" setelah soal pilihan ganda A-D)
        const optMatch = trimmed.match(OPTION_LINE_REGEX);
        if (optMatch) {
          const optIdx = normalizeArabicOptionToIndex(optMatch[1]);
          const isNextSequentialOption =
            optIdx === currentBlock.options.length &&
            !currentBlock.options.some((o) => normalizeArabicOptionToIndex(o.label) === optIdx);
          if (!isNextSequentialOption) {
            isLetterSectionCandidate = true;
          }
        } else {
          isLetterSectionCandidate = true;
        }
      }
    }

    if (SECTION_HEADER_STRICT_REGEX.test(trimmed) || isLooseSection || isLetterSectionCandidate) {
      flushCurrent();
      inStimulusBlock = false;
      pendingStimulusLines = [];
      currentSectionTitle = trimmed;
      continue;
    }

    const qMatch = trimmed.match(QUESTION_START_REGEX);
    if (qMatch) {
      flushCurrent();
      inStimulusBlock = false;

      const rawNumStr = qMatch[1];
      const num = parseInt(normalizeEasternDigits(rawNumStr), 10);
      const sep = qMatch[2];
      const prefixMatch = trimmed.match(/^(Soal\s+|السؤال\s+|س\s*)/i);
      const originalLabel = `${prefixMatch ? prefixMatch[1] : ''}${rawNumStr}${sep}`;
      const restText = qMatch[3].trim();

      const attachedStimulus =
        pendingStimulusLines.length > 0 ? pendingStimulusLines.join('\n').trim() : undefined;
      pendingStimulusLines = [];

      currentBlock = {
        number: num,
        originalNumberLabel: originalLabel,
        sectionTitle: currentSectionTitle,
        stemLines: restText ? [restText] : [],
        options: [],
        subquestions: [],
        stimulus: attachedStimulus,
        rawLines: [rawLine],
      };
      continue;
    }

    if (!currentBlock) {
      if (STIMULUS_HEADER_REGEX.test(trimmed) || inStimulusBlock || pendingStimulusLines.length > 0) {
        inStimulusBlock = true;
        pendingStimulusLines.push(trimmed);
      } else {
        pendingStimulusLines.push(trimmed);
      }
      continue;
    }

    currentBlock.rawLines.push(rawLine);

    const inlineParts = trimmed.split(INLINE_OPTIONS_SPLIT_REGEX);
    if (inlineParts.length > 1 && OPTION_LINE_REGEX.test(inlineParts[0].trim())) {
      for (const part of inlineParts) {
        const optMatch = part.trim().match(OPTION_LINE_REGEX);
        if (optMatch) {
          const markerChar = optMatch[1];
          const normalizedLabel = /^[A-Za-z]$/.test(markerChar)
            ? markerChar.toUpperCase()
            : markerChar === 'ه'
            ? 'هـ'
            : markerChar === 'ا'
            ? 'أ'
            : markerChar;
          currentBlock.options.push({
            label: normalizedLabel,
            originalMarker: `${optMatch[1]}${optMatch[2]}`,
            text: optMatch[3].trim(),
          });
        }
      }
      continue;
    }

    const optMatch = trimmed.match(OPTION_LINE_REGEX);
    if (optMatch) {
      const markerChar = optMatch[1];
      const markerSep = optMatch[2];
      const optText = optMatch[3].trim();

      const looksLikeSubquestion =
        /^[a-e]$/.test(markerChar) &&
        markerSep === ')' &&
        /\b(?:sebutkan|jelaskan|uraikan|tuliskan|tentukan)\b/i.test(currentBlock.stemLines.join(' ')) &&
        currentBlock.options.length === 0;

      if (looksLikeSubquestion) {
        currentBlock.subquestions.push(trimmed);
      } else {
        const normalizedLabel = /^[A-Za-z]$/.test(markerChar)
          ? markerChar.toUpperCase()
          : markerChar === 'ه'
          ? 'هـ'
          : markerChar === 'ا'
          ? 'أ'
          : markerChar;
        currentBlock.options.push({
          label: normalizedLabel,
          originalMarker: `${markerChar}${markerSep}`,
          text: optText,
        });
      }
      continue;
    }

    if (currentBlock.options.length > 0) {
      const lastOpt = currentBlock.options[currentBlock.options.length - 1];
      lastOpt.text = `${lastOpt.text}\n${trimmed}`;
    } else {
      currentBlock.stemLines.push(trimmed);
    }
  }

  flushCurrent();

  let currentRunSectionKey: string | null = null;
  let secSeen = new Map<number, number>();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const secKey = normalizeSectionKey(q.sectionTitle) || '__root__';
    if (i === 0 || secKey !== currentRunSectionKey) {
      currentRunSectionKey = secKey;
      secSeen = new Map<number, number>();
    }

    if (q.number !== null) {
      const prevCount = secSeen.get(q.number) ?? 0;
      secSeen.set(q.number, prevCount + 1);
      if (prevCount >= 1) {
        q.needsManualReview = true;
        q.reviewReason = q.reviewReason
          ? `${q.reviewReason} Nomor soal ${q.number} terduplikasi.`
          : `Nomor soal ${q.number} terduplikasi.`;
        warnings.push({
          id: `warn_dup_${q.id}`,
          severity: 'error',
          code: 'DUPLICATE_NUMBER',
          questionNumber: q.number,
          message: `Nomor soal ${q.number} muncul lebih dari satu kali${q.sectionTitle ? ` pada bagian ${q.sectionTitle.slice(0, 24)}` : ''}.`,
        });
      }
    }

    if (i > 0 && q.number !== null && questions[i - 1].number !== null) {
      const sameSection =
        (normalizeSectionKey(questions[i - 1].sectionTitle) || '__root__') === secKey;
      if (sameSection) {
        const expected = (questions[i - 1].number as number) + 1;
        if (q.number > expected) {
          const missingList: number[] = [];
          for (let m = expected; m < q.number; m++) missingList.push(m);
          warnings.push({
            id: `warn_gap_${i}_${expected}_${q.number}`,
            severity: 'warning',
            code: 'MISSING_NUMBER',
            questionNumber: expected,
            message: `Nomor soal melompat dari ${questions[i - 1].number} ke ${q.number} (nomor ${missingList.join(', ')} tidak ditemukan).`,
          });
        }
      }
    }
  }

  const renumberedQuestions = renumberQuestionsBySection(questions);

  if (renumberedQuestions.length === 0 && rawText.trim().length > 0) {
    warnings.push({
      id: 'warn_no_questions',
      severity: 'error',
      code: 'NO_STRUCTURE_DETECTED',
      message: 'Tidak ada nomor soal yang dikenali (gunakan format seperti 1., ١., 1), atau Soal 1.).',
    });
  }

  return {
    detectedSubject,
    globalInstruction,
    questions: renumberedQuestions,
    warnings,
    engine: 'rule-based',
  };
}

export async function parseQuestionsSmart(
  rawText: string,
  preferAI: boolean
): Promise<ParseResult> {
  if (!rawText.trim()) {
    return {
      questions: [],
      warnings: [],
      engine: 'rule-based',
    };
  }

  const ruleResult = parseQuestionsRuleBased(rawText);

  if (!preferAI) {
    return ruleResult;
  }

  try {
    const response = await fetch('/api/ai/parse-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        ...ruleResult,
        fallbackNotice:
          errBody.message ||
          'Layanan AI Gemini sedang tidak tersedia; menggunakan parser berbasis aturan lokal.',
      };
    }

    const aiData = await response.json();
    const aiQuestions: ParsedQuestion[] = Array.isArray(aiData.questions)
      ? aiData.questions.map((q: Record<string, unknown>, idx: number) => ({
          id: `ai_q_${idx + 1}_${String(q.number ?? idx + 1)}`,
          number: typeof q.number === 'number' ? q.number : null,
          originalNumberLabel: String(q.originalNumberLabel || `${idx + 1}.`),
          sectionTitle:
            typeof q.sectionTitle === 'string' && q.sectionTitle.trim()
              ? q.sectionTitle.trim()
              : ruleResult.questions[idx]?.sectionTitle,
          type: (q.type as QuestionType) || 'uraian',
          stem: String(q.stem || ''),
          options: Array.isArray(q.options)
            ? q.options.map((o: Record<string, unknown>) => ({
                label: String(o.label || ''),
                originalMarker: String(o.originalMarker || `${String(o.label || '')}.`),
                text: String(o.text || ''),
              }))
            : [],
          instruction: typeof q.instruction === 'string' && q.instruction ? q.instruction : undefined,
          stimulus: typeof q.stimulus === 'string' && q.stimulus ? q.stimulus : undefined,
          subquestions: Array.isArray(q.subquestions)
            ? q.subquestions.map((s) => String(s))
            : undefined,
          hasTable: Boolean(q.hasTable),
          hasFormula: Boolean(q.hasFormula),
          hasImageRef: Boolean(q.hasImageRef),
          needsManualReview: Boolean(q.needsManualReview),
          reviewReason: typeof q.reviewReason === 'string' && q.reviewReason ? q.reviewReason : undefined,
          rawBlock: String(q.rawBlock || ''),
        }))
      : [];

    const aiWarnings: ParserWarning[] = Array.isArray(aiData.warnings)
      ? aiData.warnings.map((w: Record<string, unknown>, idx: number) => ({
          id: `ai_warn_${idx + 1}`,
          severity:
            w.severity === 'error' || w.severity === 'warning' || w.severity === 'info'
              ? w.severity
              : 'warning',
          code: String(w.code || 'AI_CHECK'),
          questionNumber: typeof w.questionNumber === 'number' ? w.questionNumber : null,
          message: String(w.message || ''),
        }))
      : [];

    const mergedWarnings = [...aiWarnings];
    for (const rw of ruleResult.warnings) {
      if (!mergedWarnings.some((aw) => aw.code === rw.code && aw.questionNumber === rw.questionNumber)) {
        mergedWarnings.push(rw);
      }
    }

    const rawAiSubject = typeof aiData.detectedSubject === 'string' ? aiData.detectedSubject.trim() : '';
    const cleanedAiSubject = rawAiSubject
      .replace(/^(?:Mata\s+Pelajaran|Mapel|المادة(?:\s+الدراسية)?)\s*[:：]\s*/i, '')
      .trim();

    const normalizedAiQuestions = renumberQuestionsBySection(aiQuestions);

    return {
      detectedSubject: cleanedAiSubject || ruleResult.detectedSubject,
      globalInstruction: aiData.globalInstruction || ruleResult.globalInstruction,
      questions: normalizedAiQuestions.length > 0 ? normalizedAiQuestions : ruleResult.questions,
      warnings: mergedWarnings,
      engine: normalizedAiQuestions.length > 0 ? 'gemini-ai' : 'rule-based',
    };
  } catch {
    return {
      ...ruleResult,
      fallbackNotice:
        'Tidak dapat terhubung ke server AI; beralih otomatis ke parser berbasis aturan.',
    };
  }
}
