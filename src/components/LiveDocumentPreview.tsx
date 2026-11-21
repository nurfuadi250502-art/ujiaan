import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
  RemoveFormatting,
  Undo2,
  Redo2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Printer,
  Download,
  Palette,
  MousePointer2,
  Hand,
  PenTool,
  Type,
  ImagePlus,
  Square,
  Minus,
  Grid,
  Columns2,
  Maximize2,
  Minimize2,
  GripVertical,
  Eraser,
} from 'lucide-react';
import type {
  CanvasElement,
  CanvasToolMode,
  ExamIdentity,
  FormatConfig,
  ParsedQuestion,
  TemplateDocument,
} from '../types/exam';
import {
  ARABIC_KMI_IDENTITY_DEFAULTS,
  ARABIC_KMI_TABLE_LABELS,
  LATIN_KMI_IDENTITY_DEFAULTS,
  LATIN_KMI_TABLE_LABELS,
} from '../data/defaults';
import { formatQuestionNumberLabel } from '../utils/accuracyValidator';
import {
  formatOptionMarkerChar,
  renumberQuestionsBySection,
  toEasternArabicDigits,
} from '../utils/ruleParser';
import { sanitizeRichHtml, stripRichHtml } from '../utils/richText';
import { CanvasLayerOverlay } from './CanvasLayerOverlay';

interface LiveDocumentPreviewProps {
  template: TemplateDocument;
  identity: ExamIdentity;
  format: FormatConfig;
  questions: ParsedQuestion[];
  logoDataUrl?: string;
  onChangeIdentity?: (next: ExamIdentity) => void;
  onChangeFormatConfig?: (next: FormatConfig) => void;
  onChangeQuestions?: (next: ParsedQuestion[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onPrint?: () => void;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  isExportingDocx?: boolean;
  isFullscreenCanvas?: boolean;
  onToggleFullscreenCanvas?: () => void;
}

function getPaperSizeMm(paperSize: FormatConfig['paperSize']): { w: number; h: number } {
  switch (paperSize) {
    case 'F4':
      return { w: 215, h: 330 };
    case 'Letter':
      return { w: 215.9, h: 279.4 };
    case 'A4':
    default:
      return { w: 210, h: 297 };
  }
}

const MM_TO_PX = 3.7795;

const TEXT_COLORS = [
  { label: 'Hitam Teks', value: '#0F172A' },
  { label: 'Biru Navy', value: '#0F1E3D' },
  { label: 'Biru', value: '#1D4ED8' },
  { label: 'Merah', value: '#DC2626' },
  { label: 'Hijau', value: '#15803D' },
  { label: 'Ungu', value: '#7E22CE' },
  { label: 'Abu-abu', value: '#475569' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Tanpa Sorot', value: 'transparent' },
  { label: 'Kuning', value: '#FEF08A' },
  { label: 'Hijau Stabilo', value: '#BBF7D0' },
  { label: 'Biru Muda', value: '#BAE6FD' },
  { label: 'Merah Muda', value: '#FECDD3' },
  { label: 'Oranye Muda', value: '#FED7AA' },
];

function estimateQuestionHeightMm(
  q: ParsedQuestion,
  format: FormatConfig,
  hasNewSectionHeader: boolean
): number {
  const paper = getPaperSizeMm(format.paperSize);
  const contentWidthMm = Math.max(80, paper.w - format.marginLeft - format.marginRight);
  const avgCharsPerLine = Math.max(
    32,
    Math.floor((contentWidthMm / (format.fontSize * 0.3527)) * 1.85)
  );
  const lineHeightMm = format.fontSize * 0.3527 * format.lineSpacing;

  let h = hasNewSectionHeader ? lineHeightMm + 4 : 0;
  if (q.stimulus) {
    const stimLines = Math.max(1, Math.ceil(stripRichHtml(q.stimulus).length / avgCharsPerLine));
    h += stimLines * lineHeightMm + 4;
  }
  const stemLines = Math.max(
    1,
    Math.ceil(stripRichHtml(q.stem).length / Math.max(20, avgCharsPerLine - 5))
  );
  h += stemLines * lineHeightMm;

  if (q.options.length > 0) {
    if (format.optionColumns === 2) {
      const rows = Math.ceil(q.options.length / 2);
      h += rows * (lineHeightMm + format.optionSpacing * 0.264);
    } else {
      for (const opt of q.options) {
        const optLines = Math.max(
          1,
          Math.ceil(stripRichHtml(opt.text).length / Math.max(18, avgCharsPerLine - 10))
        );
        h += optLines * lineHeightMm + format.optionSpacing * 0.264;
      }
    }
  }

  if (q.subquestions && q.subquestions.length > 0) {
    for (const sub of q.subquestions) {
      const subLines = Math.max(
        1,
        Math.ceil(stripRichHtml(sub).length / Math.max(18, avgCharsPerLine - 10))
      );
      h += subLines * lineHeightMm + format.optionSpacing * 0.264;
    }
  }

  h += format.questionSpacing * 0.264;
  return h;
}

interface EditableRichFieldProps {
  value: string;
  onCommit?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  dir?: 'ltr' | 'rtl';
  inline?: boolean;
  onFieldFocus?: (el: HTMLElement) => void;
}

const EditableRichField: React.FC<EditableRichFieldProps> = ({
  value,
  onCommit,
  readOnly = false,
  placeholder,
  className = '',
  style,
  dir,
  inline = false,
  onFieldFocus,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);
  const safeHtml = sanitizeRichHtml(value || '');

  useEffect(() => {
    if (readOnly) return;
    const el = ref.current;
    if (!el || isFocusedRef.current) return;
    if (el.innerHTML !== safeHtml) {
      el.innerHTML = safeHtml;
    }
  }, [safeHtml, readOnly]);

  if (readOnly) {
    const Tag = inline ? 'span' : 'div';
    return (
      <Tag
        dir={dir}
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: safeHtml || '' }}
      />
    );
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      dir={dir}
      data-placeholder={placeholder}
      onFocus={(e) => {
        isFocusedRef.current = true;
        onFieldFocus?.(e.currentTarget);
      }}
      onInput={(e) => {
        const cleaned = sanitizeRichHtml(e.currentTarget.innerHTML);
        onCommit?.(cleaned);
      }}
      onBlur={(e) => {
        isFocusedRef.current = false;
        const cleaned = sanitizeRichHtml(e.currentTarget.innerHTML);
        if (e.currentTarget.innerHTML !== cleaned) {
          e.currentTarget.innerHTML = cleaned;
        }
        onCommit?.(cleaned);
      }}
      onPaste={(e) => {
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const plain = e.clipboardData.getData('text/plain');
        const toInsert = html
          ? sanitizeRichHtml(html)
          : plain
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\r?\n/g, '<br>');
        document.execCommand('insertHTML', false, toInsert);
        const cleaned = sanitizeRichHtml(e.currentTarget.innerHTML);
        onCommit?.(cleaned);
      }}
      style={{
        ...style,
        display: inline ? 'inline-block' : undefined,
      }}
      className={`editable-rich-field min-w-[24px] min-h-[1em] rounded-[2px] transition-colors hover:bg-sky-50/50 focus:bg-sky-50/70 focus:outline-none focus:ring-1 focus:ring-sky-400 ${className}`}
    />
  );
};

export const LiveDocumentPreview: React.FC<LiveDocumentPreviewProps> = ({
  template,
  identity,
  format,
  questions,
  logoDataUrl,
  onChangeIdentity,
  onChangeFormatConfig,
  onChangeQuestions,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onPrint,
  onExportDocx,
  onExportPdf,
  isExportingDocx = false,
  isFullscreenCanvas = false,
  onToggleFullscreenCanvas,
}) => {
  const [zoom, setZoom] = useState<number>(0.85);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [marginPreset, setMarginPreset] = useState<'custom' | 'normal' | 'narrow' | 'wide'>('custom');
  const [toolMode, setToolMode] = useState<CanvasToolMode>('select');
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [drawColor, setDrawColor] = useState<string>('#0F1E3D');
  const [drawWidthMm, setDrawWidthMm] = useState<number>(0.55);
  const [selectedCanvasElId, setSelectedCanvasElId] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [showMarginGuides, setShowMarginGuides] = useState<boolean>(false);
  const [pageLayoutMode, setPageLayoutMode] = useState<'single' | 'spread'>('single');
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    superscript: false,
    subscript: false,
  });

  const activeEditableElRef = useRef<HTMLElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasImageInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const paper = getPaperSizeMm(format.paperSize);
  const isRtl = format.direction === 'rtl';
  const effectiveLogo = logoDataUrl || template.logoDataUrl;
  const isKmiArabicPreset =
    isRtl && (format.arabicTemplateStyle ?? 'pesantren-kmi') === 'pesantren-kmi';
  const isKmiLatinPreset =
    !isRtl &&
    !effectiveLogo &&
    (template.id === 'tpl_kmi_latin' ||
      (format.arabicTemplateStyle ?? 'pesantren-kmi') === 'pesantren-kmi');

  const pageWidthPx = Math.round(paper.w * MM_TO_PX);
  const pageHeightPx = Math.round(paper.h * MM_TO_PX);

  // Track Word-style active inline format state whenever cursor/selection moves
  useEffect(() => {
    const syncCommandStates = () => {
      try {
        setActiveFormats({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
          superscript: document.queryCommandState('superscript'),
          subscript: document.queryCommandState('subscript'),
        });
      } catch {
        // Ignore when selection is outside editable element
      }
    };
    document.addEventListener('selectionchange', syncCommandStates);
    return () => document.removeEventListener('selectionchange', syncCommandStates);
  }, []);

  // Spacebar temporary Hand/Pan mode & Delete selected canvas object
  useEffect(() => {
    const isTypingInDom = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingInDom(e.target)) {
        e.preventDefault();
        setIsSpaceHeld(true);
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedCanvasElId &&
        !isTypingInDom(e.target)
      ) {
        e.preventDefault();
        const nextEls = (format.canvasElements || []).filter((x) => x.id !== selectedCanvasElId);
        onChangeFormatConfig?.({ ...format, canvasElements: nextEls });
        setSelectedCanvasElId(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedCanvasElId, format, onChangeFormatConfig]);

  const execRibbonCommand = (command: string, value?: string) => {
    try {
      document.execCommand('styleWithCSS', false, command === 'foreColor' || command === 'hiliteColor' ? 'true' : 'false');
    } catch {
      // Ignore if unsupported
    }
    document.execCommand(command, false, value);
    const el = activeEditableElRef.current;
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        superscript: document.queryCommandState('superscript'),
        subscript: document.queryCommandState('subscript'),
      });
    } catch {
      // Ignore
    }
  };

  const applyAlignmentAction = (align: 'left' | 'center' | 'right' | 'justify') => {
    if (activeQuestionId && onChangeQuestions) {
      onChangeQuestions(
        questions.map((q) => (q.id === activeQuestionId ? { ...q, alignment: align } : q))
      );
    } else if (onChangeFormatConfig) {
      onChangeFormatConfig({ ...format, alignment: align });
    }
  };

  const formatAcademicYearLine = (rawYear: string) => {
    const clean = (rawYear || '').trim();
    if (!clean) return 'عام ١٤٤٨/٢٠٢٦';
    const converted =
      format.arabicNumeralStyle === 'eastern' ? toEasternArabicDigits(clean) : clean;
    return converted.startsWith('عام') ? converted : `عام ${converted}`;
  };

  const resolvedHeaderLines = useMemo(() => {
    if (identity.headerLines && identity.headerLines.length > 0) {
      return identity.headerLines;
    }
    if (isKmiArabicPreset) {
      return [
        identity.examType || ARABIC_KMI_IDENTITY_DEFAULTS.examType,
        identity.schoolName || ARABIC_KMI_IDENTITY_DEFAULTS.schoolName,
        formatAcademicYearLine(identity.academicYear || ARABIC_KMI_IDENTITY_DEFAULTS.academicYear),
      ];
    }
    if (isKmiLatinPreset) {
      return [
        identity.examType || LATIN_KMI_IDENTITY_DEFAULTS.examType,
        identity.schoolAddress || LATIN_KMI_IDENTITY_DEFAULTS.schoolAddress,
        identity.schoolName || LATIN_KMI_IDENTITY_DEFAULTS.schoolName,
        identity.academicYear || LATIN_KMI_IDENTITY_DEFAULTS.academicYear,
      ];
    }
    return [];
  }, [identity, isKmiArabicPreset, isKmiLatinPreset, format.arabicNumeralStyle]);

  const activeTableLabels = useMemo(() => {
    if (identity.tableLabels) return identity.tableLabels;
    return isRtl ? ARABIC_KMI_TABLE_LABELS : LATIN_KMI_TABLE_LABELS;
  }, [identity.tableLabels, isRtl]);

  const updateHeaderLine = (idx: number, html: string) => {
    if (!onChangeIdentity) return;
    const nextLines = [...resolvedHeaderLines];
    nextLines[idx] = html;
    onChangeIdentity({ ...identity, headerLines: nextLines });
  };

  const addHeaderLine = () => {
    if (!onChangeIdentity) return;
    onChangeIdentity({
      ...identity,
      headerLines: [...resolvedHeaderLines, isRtl ? 'سطر جديد' : 'NEW HEADER LINE'],
    });
  };

  const removeHeaderLine = (idx: number) => {
    if (!onChangeIdentity || resolvedHeaderLines.length <= 1) return;
    onChangeIdentity({
      ...identity,
      headerLines: resolvedHeaderLines.filter((_, i) => i !== idx),
    });
  };

  const updateTableLabel = (key: keyof typeof LATIN_KMI_TABLE_LABELS, html: string) => {
    if (!onChangeIdentity) return;
    onChangeIdentity({
      ...identity,
      tableLabels: { ...activeTableLabels, [key]: html },
    });
  };

  const updateQuestion = (qId: string, patch: Partial<ParsedQuestion>) => {
    if (!onChangeQuestions) return;
    onChangeQuestions(questions.map((q) => (q.id === qId ? { ...q, ...patch } : q)));
  };

  const getSectionKey = (title?: string) =>
    stripRichHtml(title || '').replace(/\s+/g, ' ').trim();

  const buildNextSectionHeading = (existingQuestions: ParsedQuestion[]) => {
    const distinctSections: string[] = [];
    let lastKey: string | null = null;
    for (const q of existingQuestions) {
      const key = getSectionKey(q.sectionTitle);
      if (key && key !== lastKey) {
        distinctSections.push(key);
        lastKey = key;
      } else if (!key) {
        lastKey = '';
      }
    }
    const idx = distinctSections.length;
    if (isRtl) {
      const arabicPrefixes = ['لالف )', 'الباء )', 'الجيم )', 'الدال )', 'الهاء )', 'الواو )'];
      const prefix = arabicPrefixes[idx] || `القسم ${toEasternArabicDigits(idx + 1)} )`;
      return `${prefix} أجب عن الأسئلة الآتية`;
    }
    const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[idx] || String(idx + 1);
    return `${letter}. Answer the following questions !!!`;
  };

  const updateSectionHeading = (startIdx: number, oldHeading: string | undefined, newHeading: string) => {
    if (!onChangeQuestions) return;
    const oldKey = getSectionKey(oldHeading);
    const next = [...questions];
    for (let i = startIdx; i < next.length; i++) {
      if (i > startIdx && getSectionKey(next[i].sectionTitle) !== oldKey) break;
      next[i] = { ...next[i], sectionTitle: newHeading };
    }
    onChangeQuestions(renumberQuestionsBySection(next));
  };

  const handleInsertSection = () => {
    if (!onChangeQuestions) return;
    const nextHeading = buildNextSectionHeading(questions);
    const newQ: ParsedQuestion = {
      id: `q_manual_${Date.now()}`,
      number: 1,
      originalNumberLabel: isRtl ? '١.' : '1.',
      sectionTitle: nextHeading,
      type: 'uraian',
      stem: isRtl ? 'السؤال الجديد ...' : 'New question 1...',
      options: [],
      hasFormula: false,
      hasTable: false,
      hasImageRef: false,
      needsManualReview: false,
      rawBlock: '',
    };
    onChangeQuestions(renumberQuestionsBySection([...questions, newQ]));
    setActiveQuestionId(newQ.id);
  };

  const handleSplitSectionAt = (startIdx: number) => {
    if (!onChangeQuestions || startIdx < 0 || startIdx >= questions.length) return;
    const oldKey = getSectionKey(questions[startIdx].sectionTitle);
    const nextHeading = buildNextSectionHeading(questions.slice(0, startIdx));
    const next = [...questions];
    for (let i = startIdx; i < next.length; i++) {
      if (i > startIdx && getSectionKey(next[i].sectionTitle) !== oldKey) break;
      next[i] = { ...next[i], sectionTitle: nextHeading };
    }
    onChangeQuestions(renumberQuestionsBySection(next));
  };

  const handleInsertQuestion = () => {
    if (!onChangeQuestions) return;
    const activeIdx = activeQuestionId
      ? questions.findIndex((q) => q.id === activeQuestionId)
      : -1;
    const anchorIdx = activeIdx >= 0 ? activeIdx : questions.length - 1;
    const anchorQ = anchorIdx >= 0 ? questions[anchorIdx] : undefined;
    const newQ: ParsedQuestion = {
      id: `q_manual_${Date.now()}`,
      number: 1,
      originalNumberLabel: isRtl ? '١.' : '1.',
      sectionTitle: anchorQ?.sectionTitle,
      type: 'uraian',
      stem: isRtl ? 'اكتب نص السؤال هنا...' : 'Write your question here...',
      options: [],
      hasFormula: false,
      hasTable: false,
      hasImageRef: false,
      needsManualReview: false,
      rawBlock: '',
    };
    const next = [...questions];
    if (anchorIdx >= 0) {
      next.splice(anchorIdx + 1, 0, newQ);
    } else {
      next.push(newQ);
    }
    onChangeQuestions(renumberQuestionsBySection(next));
    setActiveQuestionId(newQ.id);
  };

  const handleAddOptionToQuestion = (targetId?: string) => {
    if (!onChangeQuestions || questions.length === 0) return;
    const qTarget =
      questions.find((q) => q.id === (targetId || activeQuestionId)) ||
      questions[questions.length - 1];
    if (!qTarget) return;
    const letters = 'ABCDEFGHIJ';
    const nextLabel = letters[qTarget.options.length] || String(qTarget.options.length + 1);
    onChangeQuestions(
      questions.map((q) =>
        q.id === qTarget.id
          ? {
              ...q,
              type: 'pilihan_ganda',
              options: [
                ...q.options,
                {
                  label: nextLabel,
                  originalMarker: `${nextLabel}.`,
                  text: isRtl ? 'خيار جديد' : `Pilihan ${nextLabel}`,
                },
              ],
            }
          : q
      )
    );
  };

  const handleMoveQuestion = (idx: number, dir: -1 | 1) => {
    if (!onChangeQuestions) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    const next = [...questions];
    const moved = { ...next[idx] };
    const neighbor = { ...next[targetIdx] };
    if (getSectionKey(moved.sectionTitle) !== getSectionKey(neighbor.sectionTitle)) {
      moved.sectionTitle = neighbor.sectionTitle;
    }
    next[idx] = neighbor;
    next[targetIdx] = moved;
    onChangeQuestions(renumberQuestionsBySection(next));
  };

  const handleDeleteQuestion = (qId: string) => {
    if (!onChangeQuestions) return;
    onChangeQuestions(renumberQuestionsBySection(questions.filter((q) => q.id !== qId)));
    if (activeQuestionId === qId) setActiveQuestionId(null);
  };

  const handleReorderQuestion = (fromIdx: number, toIdx: number) => {
    if (!onChangeQuestions || fromIdx === toIdx) return;
    if (fromIdx < 0 || fromIdx >= questions.length || toIdx < 0 || toIdx >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(fromIdx, 1);
    const targetNeighbor = next[Math.min(toIdx, next.length - 1)];
    if (targetNeighbor && getSectionKey(moved.sectionTitle) !== getSectionKey(targetNeighbor.sectionTitle)) {
      moved.sectionTitle = targetNeighbor.sectionTitle;
    }
    next.splice(toIdx, 0, moved);
    onChangeQuestions(renumberQuestionsBySection(next));
  };

  const canvasElements = format.canvasElements || [];

  const updateCanvasElements = (nextEls: CanvasElement[]) => {
    onChangeFormatConfig?.({ ...format, canvasElements: nextEls });
  };

  const handleAddCanvasElement = (el: CanvasElement) => {
    updateCanvasElements([...canvasElements, el]);
    setSelectedCanvasElId(el.id);
    if (toolMode === 'pan') setToolMode('select');
  };

  const handleUpdateCanvasElement = (updated: CanvasElement) => {
    updateCanvasElements(canvasElements.map((x) => (x.id === updated.id ? updated : x)));
  };

  const handleDeleteCanvasElement = (id: string) => {
    updateCanvasElements(canvasElements.filter((x) => x.id !== id));
    if (selectedCanvasElId === id) setSelectedCanvasElId(null);
  };

  const addQuickCanvasObject = (kind: 'text' | 'box' | 'line') => {
    const id = `cv_${kind}_${Date.now()}`;
    const targetPage = Math.min(activePageIndex, Math.max(0, pages.length - 1));
    if (kind === 'text') {
      handleAddCanvasElement({
        id,
        pageIndex: targetPage,
        kind: 'text',
        xMm: Math.max(20, paper.w - 75),
        yMm: 22,
        wMm: 52,
        hMm: 14,
        text: isRtl ? 'الدرجة: ٢٠' : 'Catatan / Skor: 20',
        fontSizePt: 11,
        color: '#0F172A',
        bgColor: 'rgba(255,255,255,0.92)',
        borderColor: '#0F1E3D',
        bold: true,
        align: 'center',
      });
    } else if (kind === 'box') {
      handleAddCanvasElement({
        id,
        pageIndex: targetPage,
        kind: 'box',
        xMm: 22,
        yMm: Math.round(paper.h * 0.55),
        wMm: paper.w - 44,
        hMm: 34,
        strokeColor: '#0F172A',
        fillColor: 'transparent',
        strokeWidthMm: 0.4,
        dashed: true,
      });
    } else {
      handleAddCanvasElement({
        id,
        pageIndex: targetPage,
        kind: 'line',
        xMm: 22,
        yMm: Math.round(paper.h * 0.5),
        wMm: paper.w - 44,
        hMm: 2,
        strokeColor: '#0F172A',
        strokeWidthMm: 0.5,
        dashed: false,
      });
    }
    setToolMode('select');
  };

  const handleUploadCanvasImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const compressedUrl = c.toDataURL('image/webp', 0.86);
        const aspect = img.height / Math.max(1, img.width);
        const targetW = 68;
        const targetH = Math.max(16, Math.min(120, Math.round(targetW * aspect)));
        const targetPage = Math.min(activePageIndex, Math.max(0, pages.length - 1));
        handleAddCanvasElement({
          id: `cv_img_${Date.now()}`,
          pageIndex: targetPage,
          kind: 'image',
          xMm: Math.round((paper.w - targetW) / 2),
          yMm: Math.round(paper.h * 0.42),
          wMm: targetW,
          hMm: targetH,
          dataUrl: compressedUrl,
        });
        setToolMode('select');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFitToWidth = () => {
    const vp = canvasViewportRef.current;
    if (!vp) return;
    const availW = Math.max(320, vp.clientWidth - 64);
    const cols = pageLayoutMode === 'spread' && pages.length > 1 ? 2 : 1;
    const neededW = pageWidthPx * cols + (cols === 2 ? 28 : 0);
    const computed = Math.max(0.42, Math.min(1.45, Number((availW / neededW).toFixed(2))));
    setZoom(computed);
  };

  const effectiveToolMode: CanvasToolMode = isSpaceHeld ? 'pan' : toolMode;

  const handleBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const isMiddle = e.button === 1;
    if (effectiveToolMode !== 'pan' && !isMiddle) {
      if (e.target === e.currentTarget) {
        setSelectedCanvasElId(null);
      }
      return;
    }
    const vp = canvasViewportRef.current;
    if (!vp) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = vp.scrollLeft;
    const origTop = vp.scrollTop;

    const onMove = (mv: PointerEvent) => {
      vp.scrollLeft = origLeft - (mv.clientX - startX);
      vp.scrollTop = origTop - (mv.clientY - startY);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom((z) => Math.max(0.4, Math.min(1.8, Number((z + delta).toFixed(2)))));
    }
  };

  const { pages, layoutAudit } = useMemo(() => {
    const usableHeightMm = paper.h - format.marginTop - format.marginBottom - 14;
    const instrLines = identity.instructions
      ? stripRichHtml(identity.instructions)
          .split('\n')
          .filter((l) => l.trim()).length
      : 0;
    const headerHeightMm =
      isKmiArabicPreset || isKmiLatinPreset
        ? 48 + resolvedHeaderLines.length * 4 + (instrLines > 0 ? 8 + instrLines * 4.5 : 0)
        : 26 +
          10 +
          (identity.includeStudentFields ? 28 : 22) +
          (instrLines > 0 ? 10 + instrLines * 4.5 : 0) +
          8;

    const paginated: { items: { question: ParsedQuestion; globalIndex: number }[] }[] = [];
    let currentItems: { question: ParsedQuestion; globalIndex: number }[] = [];
    let currentUsedMm = headerHeightMm;
    let splitWarnings = 0;
    let oversizedItems = 0;

    questions.forEach((q, idx) => {
      const prevSection = idx > 0 ? questions[idx - 1].sectionTitle : undefined;
      const hasNewSection = Boolean(q.sectionTitle && q.sectionTitle !== prevSection);
      const qHeight = estimateQuestionHeightMm(q, format, hasNewSection);
      if (qHeight > usableHeightMm) {
        oversizedItems++;
      }

      if (currentItems.length > 0 && currentUsedMm + qHeight > usableHeightMm) {
        paginated.push({ items: currentItems });
        currentItems = [{ question: q, globalIndex: idx }];
        currentUsedMm = qHeight;
        splitWarnings++;
      } else {
        currentItems.push({ question: q, globalIndex: idx });
        currentUsedMm += qHeight;
      }
    });

    if (currentItems.length > 0 || paginated.length === 0) {
      paginated.push({ items: currentItems });
    }

    return {
      pages: paginated,
      layoutAudit: {
        totalPages: paginated.length,
        pageBreakCount: splitWarnings,
        oversizedItems,
        marginTight: format.marginLeft < 12 || format.marginRight < 12 || format.marginTop < 12,
      },
    };
  }, [
    questions,
    format,
    paper.h,
    identity,
    isKmiArabicPreset,
    isKmiLatinPreset,
    resolvedHeaderLines.length,
  ]);

  const fontStack =
    format.fontFamily === 'Amiri'
      ? '"Amiri", "Noto Naskh Arabic", serif'
      : format.fontFamily === 'Noto Naskh Arabic'
      ? '"Noto Naskh Arabic", "Amiri", serif'
      : format.fontFamily === 'Traditional Arabic'
      ? '"Traditional Arabic", "Amiri", "Noto Naskh Arabic", serif'
      : format.fontFamily === 'Times New Roman'
      ? '"Times New Roman", "Amiri", Times, serif'
      : format.fontFamily === 'Georgia'
      ? 'Georgia, "Amiri", serif'
      : format.fontFamily === 'Calibri'
      ? 'Calibri, "DM Sans", "Noto Naskh Arabic", sans-serif'
      : format.fontFamily === 'Arial'
      ? 'Arial, Helvetica, "Noto Naskh Arabic", sans-serif'
      : '"Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';

  const qCountDisplay = isRtl
    ? `${toEasternArabicDigits(questions.length)} سؤالاً`
    : `${questions.length} Soal`;

  const applyMarginPreset = (preset: 'normal' | 'narrow' | 'wide') => {
    if (!onChangeFormatConfig) return;
    setMarginPreset(preset);
    if (preset === 'normal') {
      onChangeFormatConfig({ ...format, marginTop: 20, marginRight: 20, marginBottom: 20, marginLeft: 20 });
    } else if (preset === 'narrow') {
      onChangeFormatConfig({ ...format, marginTop: 12, marginRight: 12, marginBottom: 12, marginLeft: 12 });
    } else if (preset === 'wide') {
      onChangeFormatConfig({ ...format, marginTop: 25, marginRight: 25, marginBottom: 25, marginLeft: 25 });
    }
  };

  const renderPageContent = (
    pageIndex: number,
    pageItems: { question: ParsedQuestion; globalIndex: number }[],
    totalPages: number,
    readOnly: boolean
  ) => {
    const canEdit = !readOnly && Boolean(onChangeIdentity || onChangeQuestions);

    return (
      <div
        key={`${readOnly ? 'print' : 'edit'}_${pageIndex}`}
        dir={isRtl ? 'rtl' : 'ltr'}
        onMouseDown={() => {
          if (!readOnly) setActivePageIndex(pageIndex);
        }}
        className={`print-page bg-white text-slate-950 border border-slate-300/90 relative flex flex-col justify-between ${
          readOnly
            ? ''
            : 'shadow-[0_12px_32px_rgba(15,30,61,0.12)] transition-shadow'
        }`}
        style={{
          width: `${pageWidthPx}px`,
          minHeight: `${pageHeightPx}px`,
          height: `${pageHeightPx}px`,
          paddingTop: `${format.marginTop * MM_TO_PX}px`,
          paddingRight: `${format.marginRight * MM_TO_PX}px`,
          paddingBottom: `${format.marginBottom * MM_TO_PX}px`,
          paddingLeft: `${format.marginLeft * MM_TO_PX}px`,
          fontFamily: fontStack,
          fontSize: `${format.fontSize}pt`,
          lineHeight: format.lineSpacing,
        }}
      >
        {/* Optional Canvas Margin Guides */}
        {!readOnly && showMarginGuides && (
          <div
            className="no-print pointer-events-none absolute border border-dashed border-sky-400/70"
            style={{
              top: `${format.marginTop * MM_TO_PX}px`,
              right: `${format.marginRight * MM_TO_PX}px`,
              bottom: `${format.marginBottom * MM_TO_PX}px`,
              left: `${format.marginLeft * MM_TO_PX}px`,
            }}
          />
        )}

        {/* Freeform Canvas Elements & Drawing Overlay Layer */}
        <CanvasLayerOverlay
          pageIndex={pageIndex}
          pageWidthMm={paper.w}
          pageHeightMm={paper.h}
          mmToPx={MM_TO_PX}
          zoom={zoom}
          elements={canvasElements}
          toolMode={effectiveToolMode}
          drawColor={drawColor}
          drawWidthMm={drawWidthMm}
          selectedId={selectedCanvasElId}
          readOnly={readOnly}
          onSelectElement={setSelectedCanvasElId}
          onChangeElement={handleUpdateCanvasElement}
          onAddElement={handleAddCanvasElement}
          onDeleteElement={handleDeleteCanvasElement}
        />

        <div className="overflow-visible relative z-10">
          {/* Header Mode 1: KMI Arabic (RTL) */}
          {pageIndex === 0 && isKmiArabicPreset && (
            <div className="mb-3">
              <div className="group/hdr relative text-center leading-snug mb-2.5 text-slate-950">
                {canEdit && (
                  <button
                    type="button"
                    onClick={addHeaderLine}
                    className="no-print opacity-0 group-hover/hdr:opacity-100 transition-opacity absolute -top-2 right-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-sans font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded"
                    title="Tambah baris kop"
                  >
                    <Plus className="w-3 h-3" /> Baris
                  </button>
                )}
                {resolvedHeaderLines.map((lineHtml, lIdx) => (
                  <div key={lIdx} className="group/hline relative flex items-center justify-center">
                    <EditableRichField
                      value={lineHtml}
                      readOnly={!canEdit}
                      dir="rtl"
                      onFieldFocus={(el) => {
                        activeEditableElRef.current = el;
                        setActiveQuestionId(null);
                      }}
                      onCommit={(html) => updateHeaderLine(lIdx, html)}
                      className="text-[13pt] font-bold text-center w-full"
                    />
                    {canEdit && resolvedHeaderLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeHeaderLine(lIdx)}
                        className="no-print opacity-0 group-hover/hline:opacity-100 transition-opacity p-0.5 text-rose-500 hover:text-rose-700 ml-1"
                        title="Hapus baris"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Exact 3-Row KMI Arabic Bordered Identity Table */}
              <table className="w-full border-collapse text-[11pt] border border-slate-950 border-b-[2.5px]">
                <colgroup>
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '26%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td rowSpan={2} className="border border-slate-950 px-2.5 py-1 align-middle">
                      <div className="grid grid-cols-[3.6rem_0.75rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.subject}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('subject', html)}
                          className="font-medium"
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.subjectFormalName}
                          readOnly={!canEdit}
                          dir="rtl"
                          placeholder="المادة"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) =>
                            onChangeIdentity?.({ ...identity, subjectFormalName: html })
                          }
                          className="text-center font-medium"
                        />
                      </div>
                    </td>
                    <td rowSpan={2} colSpan={2} className="border border-slate-950 px-3 py-1 align-middle">
                      <div className="grid grid-cols-[4rem_0.75rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.day}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('day', html)}
                          className="font-medium"
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.examDay || 'السبت'}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, examDay: html })}
                          className="text-center font-medium"
                        />
                      </div>
                    </td>
                    <td className="border border-slate-950 px-2 py-0.5 text-center leading-tight">
                      <EditableRichField
                        value={identity.hijriDate || '١٩ محرم ١٤٤٨'}
                        readOnly={!canEdit}
                        dir="rtl"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, hijriDate: html })}
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-950 px-2 py-0.5 text-center leading-tight">
                      <EditableRichField
                        value={identity.examDate || '٤ يوليو ٢٠٢٦'}
                        readOnly={!canEdit}
                        dir="rtl"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, examDate: html })}
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-950 px-2.5 py-1 align-middle">
                      <div className="grid grid-cols-[3.6rem_0.75rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.classLabel}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('classLabel', html)}
                          className="font-medium"
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.className}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, className: html })}
                          className="text-center font-medium"
                        />
                      </div>
                    </td>
                    <td colSpan={2} className="border border-slate-950 px-3 py-1 align-middle">
                      <div className="grid grid-cols-[4rem_0.75rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.period}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('period', html)}
                          className="font-medium"
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.sessionPeriod || 'الثانية'}
                          readOnly={!canEdit}
                          dir="rtl"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) =>
                            onChangeIdentity?.({ ...identity, sessionPeriod: html })
                          }
                          className="text-center font-medium"
                        />
                      </div>
                    </td>
                    <td className="border border-slate-950 px-2 py-1 text-center font-medium">
                      <EditableRichField
                        value={identity.duration}
                        readOnly={!canEdit}
                        dir="rtl"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, duration: html })}
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="border border-slate-950 px-2 py-1 text-center font-bold">
                      <EditableRichField
                        value={activeTableLabels.teacher}
                        readOnly={!canEdit}
                        dir="rtl"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => updateTableLabel('teacher', html)}
                        className="text-center font-bold"
                      />
                    </td>
                    <td colSpan={2} className="border border-slate-950 px-2 py-1 text-center font-bold">
                      <EditableRichField
                        value={identity.teacherName}
                        readOnly={!canEdit}
                        dir="rtl"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, teacherName: html })}
                        className="text-center font-bold"
                      />
                    </td>
                  </tr>
                  {identity.includeStudentFields && (
                    <tr>
                      <td colSpan={2} className="border border-slate-950 px-2.5 py-1">
                        اسم الطالب : ....................................
                      </td>
                      <td colSpan={2} className="border border-slate-950 px-2.5 py-1">
                        رقم الجلوس : ............................
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {identity.instructions.trim() && (
                <div className="border border-slate-400 bg-slate-50/50 px-3 py-1.5 mt-2 text-[10pt]">
                  <EditableRichField
                    value={identity.instructions}
                    readOnly={!canEdit}
                    dir="rtl"
                    onFieldFocus={(el) => {
                      activeEditableElRef.current = el;
                      setActiveQuestionId(null);
                    }}
                    onCommit={(html) => onChangeIdentity?.({ ...identity, instructions: html })}
                    className="whitespace-pre-line text-slate-900"
                  />
                </div>
              )}
            </div>
          )}

          {/* Header Mode 2: KMI Latin / English (LTR) */}
          {pageIndex === 0 && isKmiLatinPreset && (
            <div className="mb-3">
              <div className="group/hdr relative text-center leading-tight mb-2 text-slate-950">
                {canEdit && (
                  <button
                    type="button"
                    onClick={addHeaderLine}
                    className="no-print opacity-0 group-hover/hdr:opacity-100 transition-opacity absolute -top-2 right-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-sans font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded"
                    title="Tambah baris kop"
                  >
                    <Plus className="w-3 h-3" /> Baris
                  </button>
                )}
                {resolvedHeaderLines.map((lineHtml, lIdx) => (
                  <div key={lIdx} className="group/hline relative flex items-center justify-center">
                    <EditableRichField
                      value={lineHtml}
                      readOnly={!canEdit}
                      dir="ltr"
                      onFieldFocus={(el) => {
                        activeEditableElRef.current = el;
                        setActiveQuestionId(null);
                      }}
                      onCommit={(html) => updateHeaderLine(lIdx, html)}
                      className="text-[12pt] font-bold text-center w-full"
                    />
                    {canEdit && resolvedHeaderLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeHeaderLine(lIdx)}
                        className="no-print opacity-0 group-hover/hline:opacity-100 transition-opacity p-0.5 text-rose-500 hover:text-rose-700 ml-1"
                        title="Hapus baris"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Exact 3-Row KMI Latin Bordered Identity Table (34% | 40% | 26%, Row 3 50% | 50%) */}
              <table className="w-full border-collapse text-[10.5pt] border border-slate-950 border-b-[2.5px]">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '26%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <td rowSpan={2} className="border border-slate-950 px-2.5 py-1 align-middle font-bold">
                      <div className="grid grid-cols-[4.6rem_0.65rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.subject}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('subject', html)}
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.subjectFormalName}
                          readOnly={!canEdit}
                          dir="ltr"
                          placeholder="SUBJECT"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) =>
                            onChangeIdentity?.({ ...identity, subjectFormalName: html })
                          }
                        />
                      </div>
                    </td>
                    <td rowSpan={2} colSpan={2} className="border border-slate-950 px-2.5 py-1 align-middle font-bold">
                      <div className="grid grid-cols-[4.2rem_0.65rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.day}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('day', html)}
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.examDay || 'WEDNESDAY'}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, examDay: html })}
                        />
                      </div>
                    </td>
                    <td className="border border-slate-950 px-2 py-0.5 text-center text-[9.5pt] leading-tight">
                      <EditableRichField
                        value={identity.hijriDate || '23 MUHARRAM 1448'}
                        readOnly={!canEdit}
                        dir="ltr"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, hijriDate: html })}
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-950 px-2 py-0.5 text-center text-[9.5pt] leading-tight">
                      <EditableRichField
                        value={identity.examDate || '8 JULI 2026'}
                        readOnly={!canEdit}
                        dir="ltr"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, examDate: html })}
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-950 px-2.5 py-1 align-middle font-bold">
                      <div className="grid grid-cols-[4.6rem_0.65rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.classLabel}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('classLabel', html)}
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.className}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, className: html })}
                        />
                      </div>
                    </td>
                    <td colSpan={2} className="border border-slate-950 px-2.5 py-1 align-middle font-bold">
                      <div className="grid grid-cols-[4.2rem_0.65rem_1fr] items-center">
                        <EditableRichField
                          value={activeTableLabels.period}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => updateTableLabel('period', html)}
                        />
                        <span className="text-center">:</span>
                        <EditableRichField
                          value={identity.sessionPeriod || 'SECOND'}
                          readOnly={!canEdit}
                          dir="ltr"
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) =>
                            onChangeIdentity?.({ ...identity, sessionPeriod: html })
                          }
                        />
                      </div>
                    </td>
                    <td className="border border-slate-950 px-2 py-1 text-center font-bold">
                      <EditableRichField
                        value={identity.duration}
                        readOnly={!canEdit}
                        dir="ltr"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, duration: html })}
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="border border-slate-950 px-2 py-1 text-center font-bold">
                      <EditableRichField
                        value={activeTableLabels.teacher}
                        readOnly={!canEdit}
                        dir="ltr"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => updateTableLabel('teacher', html)}
                        className="text-center font-bold"
                      />
                    </td>
                    <td colSpan={2} className="border border-slate-950 px-2 py-1 text-center font-bold">
                      <EditableRichField
                        value={identity.teacherName}
                        readOnly={!canEdit}
                        dir="ltr"
                        onFieldFocus={(el) => {
                          activeEditableElRef.current = el;
                          setActiveQuestionId(null);
                        }}
                        onCommit={(html) => onChangeIdentity?.({ ...identity, teacherName: html })}
                        className="text-center font-bold"
                      />
                    </td>
                  </tr>
                  {identity.includeStudentFields && (
                    <tr>
                      <td colSpan={2} className="border border-slate-950 px-2.5 py-1 text-[9.5pt]">
                        NAME : ....................................
                      </td>
                      <td colSpan={2} className="border border-slate-950 px-2.5 py-1 text-[9.5pt]">
                        NUMBER : ..............................
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {identity.instructions.trim() && (
                <div className="border border-slate-400 bg-slate-50/50 px-3 py-1.5 mt-2 text-[9.5pt]">
                  <EditableRichField
                    value={identity.instructions}
                    readOnly={!canEdit}
                    dir="ltr"
                    onFieldFocus={(el) => {
                      activeEditableElRef.current = el;
                      setActiveQuestionId(null);
                    }}
                    onCommit={(html) => onChangeIdentity?.({ ...identity, instructions: html })}
                    className="whitespace-pre-line text-slate-900"
                  />
                </div>
              )}
            </div>
          )}

          {/* Header Mode 3: Standard Kop + Logo (when uploaded logo or custom standard layout chosen) */}
          {pageIndex === 0 && !isKmiArabicPreset && !isKmiLatinPreset && (
            <div className="mb-4">
              <div className="flex items-center gap-4 pb-2.5 border-b-[3px] border-double border-slate-900">
                {effectiveLogo && (
                  <img
                    src={effectiveLogo}
                    alt="Logo Sekolah"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 object-contain shrink-0"
                  />
                )}
                <div className="flex-1 text-center leading-tight">
                  <p className="text-[10.5pt] font-bold tracking-wide uppercase text-slate-800">
                    {template.headerTitle ||
                      (isRtl ? 'وِزَارَةُ الشُّؤُونِ الدِّينِيَّةِ' : 'LEMBAGA PENDIDIKAN')}
                  </p>
                  <EditableRichField
                    value={identity.schoolName}
                    readOnly={!canEdit}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    onFieldFocus={(el) => {
                      activeEditableElRef.current = el;
                      setActiveQuestionId(null);
                    }}
                    onCommit={(html) => onChangeIdentity?.({ ...identity, schoolName: html })}
                    className="text-[13.5pt] font-bold uppercase text-slate-950 mt-0.5 text-center"
                  />
                  <EditableRichField
                    value={identity.schoolAddress}
                    readOnly={!canEdit}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    onFieldFocus={(el) => {
                      activeEditableElRef.current = el;
                      setActiveQuestionId(null);
                    }}
                    onCommit={(html) => onChangeIdentity?.({ ...identity, schoolAddress: html })}
                    className="text-[8.5pt] text-slate-700 mt-0.5 text-center"
                  />
                </div>
              </div>

              <div className="text-center my-3">
                <EditableRichField
                  value={identity.examType}
                  readOnly={!canEdit}
                  dir={isRtl ? 'rtl' : 'ltr'}
                  onFieldFocus={(el) => {
                    activeEditableElRef.current = el;
                    setActiveQuestionId(null);
                  }}
                  onCommit={(html) => onChangeIdentity?.({ ...identity, examType: html })}
                  className="text-[11pt] font-bold uppercase tracking-wide text-center"
                />
              </div>

              <table className="w-full border-collapse text-[9.5pt] mb-3">
                <tbody>
                  <tr>
                    <td className="border border-slate-400 px-2 py-1 font-bold w-[18%]">
                      {isRtl ? 'المادة الدراسية' : 'Mata Pelajaran'}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 font-bold w-[34%]">
                      <div className="flex items-center gap-1">
                        <span>:</span>
                        <EditableRichField
                          value={identity.subjectFormalName}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) =>
                            onChangeIdentity?.({ ...identity, subjectFormalName: html })
                          }
                          className="flex-1"
                        />
                      </div>
                    </td>
                    <td className="border border-slate-400 px-2 py-1 font-bold w-[18%]">
                      {isRtl ? 'اليوم والتاريخ' : 'Hari / Tanggal'}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 w-[30%]">
                      <div className="flex items-center gap-1">
                        <span>:</span>
                        <EditableRichField
                          value={identity.examDate}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, examDate: html })}
                          className="flex-1"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-400 px-2 py-1 font-bold">
                      {isRtl ? 'الفصل / المستوى' : 'Kelas / Semester'}
                    </td>
                    <td className="border border-slate-400 px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span>:</span>
                        <EditableRichField
                          value={identity.className}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, className: html })}
                          className="flex-1"
                        />
                      </div>
                    </td>
                    <td className="border border-slate-400 px-2 py-1 font-bold">
                      {isRtl ? 'الزمن / المدة' : 'Alokasi Waktu'}
                    </td>
                    <td className="border border-slate-400 px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span>:</span>
                        <EditableRichField
                          value={identity.duration}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, duration: html })}
                          className="flex-1"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-400 px-2 py-1 font-bold">
                      {isRtl ? 'اسم المدرس' : 'Guru Pengampu'}
                    </td>
                    <td className="border border-slate-400 px-2 py-1">
                      <div className="flex items-center gap-1">
                        <span>:</span>
                        <EditableRichField
                          value={identity.teacherName}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(null);
                          }}
                          onCommit={(html) => onChangeIdentity?.({ ...identity, teacherName: html })}
                          className="flex-1"
                        />
                      </div>
                    </td>
                    <td className="border border-slate-400 px-2 py-1 font-bold">
                      {isRtl ? 'عدد الأسئلة' : 'Jumlah Soal'}
                    </td>
                    <td className="border border-slate-400 px-2 py-1 tabular-nums">: {qCountDisplay}</td>
                  </tr>
                </tbody>
              </table>

              {identity.instructions.trim() && (
                <div className="border border-slate-300 bg-slate-50/70 px-3 py-2 mb-3 text-[9pt]">
                  <EditableRichField
                    value={identity.instructions}
                    readOnly={!canEdit}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    onFieldFocus={(el) => {
                      activeEditableElRef.current = el;
                      setActiveQuestionId(null);
                    }}
                    onCommit={(html) => onChangeIdentity?.({ ...identity, instructions: html })}
                    className="whitespace-pre-line text-slate-800"
                  />
                </div>
              )}
            </div>
          )}

          {/* Question List */}
          {pageItems.length === 0 && pageIndex === 0 ? (
            <div
              dir="ltr"
              className="border border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-400 font-sans text-sm"
            >
              Belum ada soal pada dokumen. Klik <strong>+ Soal</strong> di toolbar atas atau ketik soal di panel kiri lalu klik <strong>ANALISIS SOAL</strong>.
            </div>
          ) : (
            <div
              style={{
                textAlign:
                  format.alignment === 'justify'
                    ? 'justify'
                    : format.alignment === 'center'
                    ? 'center'
                    : format.alignment === 'right'
                    ? 'right'
                    : isRtl
                    ? 'right'
                    : 'left',
              }}
            >
              {pageItems.map(({ question: q, globalIndex }, itemIdx) => {
                const prevQ =
                  itemIdx > 0
                    ? pageItems[itemIdx - 1].question
                    : globalIndex > 0
                    ? questions[globalIndex - 1]
                    : undefined;
                const showSectionHeader =
                  Boolean(q.sectionTitle) && q.sectionTitle !== prevQ?.sectionTitle;

                const label = formatQuestionNumberLabel(
                  q,
                  globalIndex,
                  format.numberFormat,
                  format.arabicNumeralStyle,
                  isRtl
                );

                const effectiveQAlign =
                  q.alignment ||
                  (format.alignment === 'justify'
                    ? 'justify'
                    : format.alignment === 'center'
                    ? 'center'
                    : format.alignment === 'right'
                    ? 'right'
                    : isRtl
                    ? 'right'
                    : 'left');

                return (
                  <React.Fragment key={q.id}>
                    {showSectionHeader && q.sectionTitle && (
                      <div className={globalIndex === 0 ? 'mt-1 mb-1' : 'mt-2.5 mb-1'}>
                        <EditableRichField
                          value={q.sectionTitle}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(q.id);
                          }}
                          onCommit={(html) => updateSectionHeading(globalIndex, q.sectionTitle, html)}
                          className="font-bold text-slate-950"
                        />
                      </div>
                    )}

                    <div
                      draggable={canEdit && effectiveToolMode === 'select'}
                      onDragStart={(e) => {
                        setDragFromIdx(globalIndex);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        if (dragFromIdx === null || dragFromIdx === globalIndex) return;
                        e.preventDefault();
                        setDragOverIdx(globalIndex);
                      }}
                      onDragLeave={() => {
                        if (dragOverIdx === globalIndex) setDragOverIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragFromIdx !== null && dragFromIdx !== globalIndex) {
                          handleReorderQuestion(dragFromIdx, globalIndex);
                        }
                        setDragFromIdx(null);
                        setDragOverIdx(null);
                      }}
                      onDragEnd={() => {
                        setDragFromIdx(null);
                        setDragOverIdx(null);
                      }}
                      style={{
                        marginBottom: `${format.questionSpacing}px`,
                        textAlign: effectiveQAlign,
                      }}
                      className={`group/q relative break-inside-avoid transition-colors ${
                        dragOverIdx === globalIndex
                          ? 'ring-2 ring-sky-500 bg-sky-50/50 rounded'
                          : canEdit && activeQuestionId === q.id
                          ? 'bg-sky-50/30 rounded'
                          : ''
                      }`}
                    >
                      {canEdit && (
                        <div
                          dir="ltr"
                          className="no-print opacity-0 group-hover/q:opacity-100 focus-within:opacity-100 transition-opacity absolute -top-5 right-0 z-30 flex items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded px-1 py-0.5 text-[10px] font-sans"
                        >
                          <span
                            className="p-0.5 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
                            title="Seret untuk memindah urutan soal di kanvas"
                          >
                            <GripVertical className="w-3 h-3" />
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleAddOptionToQuestion(q.id)}
                            className="px-1.5 py-0.5 text-sky-700 hover:bg-sky-50 rounded"
                            title="Tambah opsi jawaban"
                          >
                            + Opsi
                          </button>
                          {!showSectionHeader && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSplitSectionAt(globalIndex)}
                              className="px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-50 rounded"
                              title="Mulai bab/bagian baru dari soal ini (nomor ulang dari 1)"
                            >
                              + Bab Baru
                            </button>
                          )}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleMoveQuestion(globalIndex, -1)}
                            disabled={globalIndex === 0}
                            className="p-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 rounded"
                            title="Pindah ke atas"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleMoveQuestion(globalIndex, 1)}
                            disabled={globalIndex === questions.length - 1}
                            className="p-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 rounded"
                            title="Pindah ke bawah"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-0.5 text-rose-600 hover:bg-rose-50 rounded"
                            title="Hapus soal ini"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {q.stimulus && (
                        <div
                          className={`text-slate-800 bg-slate-50/60 border border-slate-200 px-2.5 py-1.5 mb-1.5 ${
                            isRtl ? '' : 'italic'
                          }`}
                        >
                          <EditableRichField
                            value={q.stimulus}
                            readOnly={!canEdit}
                            dir={isRtl ? 'rtl' : 'ltr'}
                            onFieldFocus={(el) => {
                              activeEditableElRef.current = el;
                              setActiveQuestionId(q.id);
                            }}
                            onCommit={(html) => updateQuestion(q.id, { stimulus: html })}
                            className="whitespace-pre-line"
                          />
                        </div>
                      )}

                      <div
                        className={
                          format.numberPosition === 'left-hang'
                            ? `flex items-start gap-2 ${
                                isKmiArabicPreset ? 'pr-4' : isKmiLatinPreset ? 'pl-4' : ''
                              }`
                            : 'block'
                        }
                      >
                        <EditableRichField
                          inline
                          value={label}
                          readOnly={!canEdit}
                          dir={isRtl ? 'rtl' : 'ltr'}
                          onFieldFocus={(el) => {
                            activeEditableElRef.current = el;
                            setActiveQuestionId(q.id);
                          }}
                          onCommit={(html) =>
                            updateQuestion(q.id, { originalNumberLabel: stripRichHtml(html) })
                          }
                          className={
                            format.numberPosition === 'left-hang'
                              ? `${
                                  isKmiArabicPreset || isKmiLatinPreset ? 'font-normal' : 'font-bold'
                                } shrink-0 min-w-[24px] tabular-nums`
                              : `font-bold ${isRtl ? 'ml-1.5' : 'mr-1.5'} tabular-nums`
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <EditableRichField
                            value={q.stem}
                            readOnly={!canEdit}
                            dir={isRtl ? 'rtl' : 'ltr'}
                            onFieldFocus={(el) => {
                              activeEditableElRef.current = el;
                              setActiveQuestionId(q.id);
                            }}
                            onCommit={(html) =>
                              updateQuestion(q.id, {
                                stem: html,
                                needsManualReview: false,
                                reviewReason: undefined,
                              })
                            }
                            style={{
                              fontWeight: format.stemBold ? 700 : 400,
                              fontStyle: format.stemItalic && !isRtl ? 'italic' : 'normal',
                            }}
                            className="whitespace-pre-line"
                          />
                        </div>
                      </div>

                      {q.options.length > 0 && (
                        <div
                          className={`${
                            format.optionColumns === 2
                              ? 'grid grid-cols-2 gap-x-4 mt-1'
                              : 'mt-1'
                          } ${isRtl ? 'pr-9' : 'pl-9'}`}
                        >
                          {q.options.map((opt, oIdx) => {
                            const optChar = formatOptionMarkerChar(
                              opt.label,
                              oIdx,
                              format.optionLabelStyle,
                              isRtl
                            );
                            return (
                              <div
                                key={`${q.id}_opt_${oIdx}`}
                                className="group/opt flex items-start gap-2"
                                style={{ marginBottom: `${format.optionSpacing}px` }}
                              >
                                <span className="font-bold shrink-0 min-w-[20px]">{optChar}.</span>
                                <div className="flex-1 min-w-0">
                                  <EditableRichField
                                    value={opt.text}
                                    readOnly={!canEdit}
                                    dir={isRtl ? 'rtl' : 'ltr'}
                                    onFieldFocus={(el) => {
                                      activeEditableElRef.current = el;
                                      setActiveQuestionId(q.id);
                                    }}
                                    onCommit={(html) => {
                                      const nextOpts = q.options.map((o, idx2) =>
                                        idx2 === oIdx ? { ...o, text: html } : o
                                      );
                                      updateQuestion(q.id, { options: nextOpts });
                                    }}
                                    className="whitespace-pre-line"
                                  />
                                </div>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      const nextOpts = q.options.filter((_, idx2) => idx2 !== oIdx);
                                      updateQuestion(q.id, { options: nextOpts });
                                    }}
                                    className="no-print opacity-0 group-hover/opt:opacity-100 text-rose-500 hover:text-rose-700 p-0.5"
                                    title="Hapus opsi"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {q.subquestions && q.subquestions.length > 0 && (
                        <div className={`mt-1 space-y-0.5 ${isRtl ? 'pr-9' : 'pl-9'}`}>
                          {q.subquestions.map((sub, sIdx) => (
                            <EditableRichField
                              key={sIdx}
                              value={sub}
                              readOnly={!canEdit}
                              dir={isRtl ? 'rtl' : 'ltr'}
                              onFieldFocus={(el) => {
                                activeEditableElRef.current = el;
                                setActiveQuestionId(q.id);
                              }}
                              onCommit={(html) => {
                                const nextSubs = (q.subquestions || []).map((s, idx2) =>
                                  idx2 === sIdx ? html : s
                                );
                                updateQuestion(q.id, { subquestions: nextSubs });
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {isKmiArabicPreset || isKmiLatinPreset ? (
          <div className="pt-2 text-center">
            {(pageIndex === totalPages - 1 || totalPages === 1) && (
              <EditableRichField
                value={
                  identity.closingText !== undefined
                    ? identity.closingText
                    : isKmiArabicPreset
                    ? '--مع أطيب تمنياتنا بالتوفيق و النجاح--'
                    : ''
                }
                readOnly={!canEdit}
                dir={isRtl ? 'rtl' : 'ltr'}
                placeholder={canEdit ? (isRtl ? 'أضف الخاتمة...' : '') : ''}
                onFieldFocus={(el) => {
                  activeEditableElRef.current = el;
                  setActiveQuestionId(null);
                }}
                onCommit={(html) => onChangeIdentity?.({ ...identity, closingText: html })}
                className="text-[12pt] font-bold text-slate-950 text-center"
              />
            )}
            {totalPages > 1 && (
              <p className="text-[8.5pt] text-slate-500 mt-1 tabular-nums">
                {isRtl
                  ? `الصفحة ${toEasternArabicDigits(pageIndex + 1)} من ${toEasternArabicDigits(totalPages)}`
                  : `Page ${pageIndex + 1} of ${totalPages}`}
              </p>
            )}
          </div>
        ) : (
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[8.5pt] text-slate-500">
            <span>
              {stripRichHtml(identity.examType)}
              {stripRichHtml(identity.subjectFormalName)
                ? ` · ${stripRichHtml(identity.subjectFormalName)}`
                : ''}
            </span>
            <span className="tabular-nums font-medium">
              {isRtl
                ? `الصفحة ${toEasternArabicDigits(pageIndex + 1)} من ${toEasternArabicDigits(totalPages)}`
                : `Halaman ${pageIndex + 1} dari ${totalPages}`}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="print-reset-layout flex flex-col h-full bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
      {/* Dynamic Print Page Size CSS */}
      <style>{`@media print { @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; } }`}</style>

      {/* Microsoft Word-Style Ribbon Toolbar */}
      <div className="no-print bg-white border-b border-slate-200 px-3 py-2 space-y-1.5 select-none">
        {/* Row 1: Undo/Redo, Font, Inline Word Styles, Color & Highlight */}
        <div className="flex flex-wrap items-center gap-1">
          {onUndo && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-35"
              title="Urungkan (Undo)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-35"
              title="Ulangi (Redo)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="w-px h-4 bg-slate-200 mx-0.5" />

          {/* Font Family & Size */}
          <select
            value={format.fontFamily}
            onChange={(e) =>
              onChangeFormatConfig?.({
                ...format,
                fontFamily: e.target.value as FormatConfig['fontFamily'],
              })
            }
            className="px-2 py-1 text-xs border border-slate-200 rounded bg-slate-50 text-slate-800 max-w-[140px]"
            title="Jenis Huruf (Font)"
          >
            <option value="Times New Roman">Times New Roman</option>
            <option value="Amiri">Amiri (Arab)</option>
            <option value="Noto Naskh Arabic">Noto Naskh Arabic</option>
            <option value="Traditional Arabic">Traditional Arabic</option>
            <option value="Calibri">Calibri</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
          </select>

          <select
            value={format.fontSize}
            onChange={(e) =>
              onChangeFormatConfig?.({
                ...format,
                fontSize: Number(e.target.value),
              })
            }
            className="px-1.5 py-1 text-xs font-mono border border-slate-200 rounded bg-slate-50 text-slate-800 w-16"
            title="Ukuran Huruf (pt)"
          >
            {[9, 10, 10.5, 11, 12, 13, 14, 15, 16].map((sz) => (
              <option key={sz} value={sz}>
                {sz}pt
              </option>
            ))}
          </select>

          <div className="w-px h-4 bg-slate-200 mx-0.5" />

          {/* Inline Word Format Commands */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('bold')}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.bold ? 'bg-[#0F1E3D] text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Tebal (Bold)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('italic')}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.italic ? 'bg-[#0F1E3D] text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Miring (Italic)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('underline')}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.underline
                ? 'bg-[#0F1E3D] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Garis Bawah (Underline)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('strikeThrough')}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.strikeThrough
                ? 'bg-[#0F1E3D] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Coret (Strikethrough)"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('superscript')}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.superscript
                ? 'bg-[#0F1E3D] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Pangkat Atas (Superscript)"
          >
            <Superscript className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('subscript')}
            className={`p-1.5 rounded transition-colors ${
              activeFormats.subscript
                ? 'bg-[#0F1E3D] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            title="Indeks Bawah (Subscript)"
          >
            <Subscript className="w-3.5 h-3.5" />
          </button>

          {/* Text Color Popover */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowColorMenu((v) => !v);
                setShowHighlightMenu(false);
              }}
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 inline-flex items-center gap-0.5"
              title="Warna Teks"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            {showColorMenu && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 flex items-center gap-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      execRibbonCommand('foreColor', c.value);
                      setShowColorMenu(false);
                    }}
                    className="w-5 h-5 rounded-full border border-slate-300"
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Highlight Popover */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowHighlightMenu((v) => !v);
                setShowColorMenu(false);
              }}
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 inline-flex items-center gap-0.5"
              title="Sorot Teks (Highlight)"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>
            {showHighlightMenu && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 flex items-center gap-1">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      execRibbonCommand('hiliteColor', c.value);
                      setShowHighlightMenu(false);
                    }}
                    className="w-5 h-5 rounded border border-slate-300 text-[9px] flex items-center justify-center"
                    style={{
                      backgroundColor: c.value === 'transparent' ? '#FFFFFF' : c.value,
                    }}
                    title={c.label}
                  >
                    {c.value === 'transparent' ? '×' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execRibbonCommand('removeFormat')}
            className="p-1.5 rounded text-slate-700 hover:bg-slate-100"
            title="Hapus Format Teks (Clear Formatting)"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-200 mx-0.5" />

          {/* Alignment Buttons */}
          {(
            [
              ['left', AlignLeft, 'Rata Kiri'],
              ['center', AlignCenter, 'Rata Tengah'],
              ['right', AlignRight, 'Rata Kanan'],
              ['justify', AlignJustify, 'Rata Kiri-Kanan'],
            ] as const
          ).map(([alignVal, Icon, title]) => {
            const currentAlign =
              (activeQuestionId && questions.find((q) => q.id === activeQuestionId)?.alignment) ||
              format.alignment;
            return (
              <button
                key={alignVal}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyAlignmentAction(alignVal)}
                className={`p-1.5 rounded transition-colors ${
                  currentAlign === alignVal
                    ? 'bg-[#0F1E3D] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                title={title}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        {/* Row 2: Layout, Paper, Insert Elements, Zoom & Direct Print/Export */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <select
              value={format.lineSpacing}
              onChange={(e) =>
                onChangeFormatConfig?.({ ...format, lineSpacing: Number(e.target.value) })
              }
              className="px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-slate-50 text-slate-700"
              title="Spasi Baris"
            >
              <option value={1.15}>Spasi 1.15</option>
              <option value={1.35}>Spasi 1.35</option>
              <option value={1.5}>Spasi 1.50</option>
              <option value={1.6}>Spasi 1.60</option>
              <option value={1.75}>Spasi 1.75</option>
            </select>

            <select
              value={format.paperSize}
              onChange={(e) =>
                onChangeFormatConfig?.({
                  ...format,
                  paperSize: e.target.value as FormatConfig['paperSize'],
                })
              }
              className="px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-slate-50 text-slate-700"
              title="Ukuran Kertas"
            >
              <option value="A4">Kertas A4</option>
              <option value="F4">Kertas F4</option>
              <option value="Letter">Letter</option>
            </select>

            <select
              value={marginPreset}
              onChange={(e) =>
                applyMarginPreset(e.target.value as 'normal' | 'narrow' | 'wide')
              }
              className="px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-slate-50 text-slate-700"
              title="Margin Halaman"
            >
              <option value="custom">Margin ({format.marginTop}mm)</option>
              <option value="normal">Margin Normal (20mm)</option>
              <option value="narrow">Margin Sempit (12mm)</option>
              <option value="wide">Margin Lebar (25mm)</option>
            </select>

            <button
              type="button"
              onClick={() =>
                onChangeFormatConfig?.({
                  ...format,
                  direction: isRtl ? 'ltr' : 'rtl',
                  arabicNumeralStyle: isRtl ? 'western' : 'eastern',
                  optionLabelStyle: isRtl ? 'auto' : 'arabic',
                })
              }
              className="px-2 py-1 text-[11px] font-semibold border border-slate-200 rounded bg-slate-50 text-slate-800 hover:bg-slate-100"
              title="Ganti Arah Dokumen LTR / RTL"
            >
              {isRtl ? 'RTL (Arab)' : 'LTR (Latin)'}
            </button>

            <div className="w-px h-4 bg-slate-200 mx-0.5" />

            <button
              type="button"
              onClick={handleInsertSection}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#0F1E3D] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded"
            >
              <Plus className="w-3 h-3" /> Bagian
            </button>
            <button
              type="button"
              onClick={handleInsertQuestion}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#0F1E3D] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded"
            >
              <Plus className="w-3 h-3" /> Soal
            </button>
            <button
              type="button"
              onClick={() => handleAddOptionToQuestion()}
              disabled={questions.length === 0}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded disabled:opacity-40"
            >
              <Plus className="w-3 h-3" /> Opsi
            </button>
          </div>

          {/* Right Status + Zoom + Direct Print/Export */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 hidden sm:inline tabular-nums">
              {layoutAudit.totalPages} Hal
            </span>
            {layoutAudit.oversizedItems === 0 && !layoutAudit.marginTight ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                Siap Cetak
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {layoutAudit.marginTight ? 'Margin <12mm' : `${layoutAudit.oversizedItems} soal panjang`}
              </span>
            )}

            <div className="flex items-center gap-0.5 ml-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                className="p-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                title="Perkecil Preview"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-[11px] font-mono tabular-nums w-10 text-center text-slate-700">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                className="p-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                title="Perbesar Preview"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(0.85)}
                className="p-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {onToggleFullscreenCanvas && (
              <button
                type="button"
                onClick={onToggleFullscreenCanvas}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                title={isFullscreenCanvas ? 'Keluar dari Mode Fokus Kanvas' : 'Perluas Kanvas Layar Penuh'}
              >
                {isFullscreenCanvas ? (
                  <Minimize2 className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{isFullscreenCanvas ? 'Perkecil' : 'Fokus'}</span>
              </button>
            )}

            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded"
                title="Print langsung ke printer fisik / PDF"
              >
                <Printer className="w-3 h-3" /> Print
              </button>
            )}
            {onExportDocx && (
              <button
                type="button"
                onClick={onExportDocx}
                disabled={isExportingDocx || questions.length === 0}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-[#0F1E3D] hover:bg-[#172B4D] disabled:opacity-40 rounded"
                title="Unduh Word (.docx)"
              >
                <Download className="w-3 h-3" /> Word
              </button>
            )}
            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                disabled={questions.length === 0}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 rounded"
                title="Unduh PDF"
              >
                <Download className="w-3 h-3" /> PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas Studio Body (Left Tool Dock + Dot-Grid Drafting Board) */}
      <div className="no-print relative flex-1 min-h-0 flex overflow-hidden">
        {/* Vertical Canvas Tool Dock */}
        <div className="w-12 shrink-0 bg-white border-r border-slate-200 py-2.5 flex flex-col items-center gap-1.5 z-20 select-none overflow-y-auto">
          <button
            type="button"
            onClick={() => setToolMode('select')}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              effectiveToolMode === 'select'
                ? 'bg-[#0F1E3D] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Pilih, Edit Teks & Geser Elemen"
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setToolMode('pan')}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              effectiveToolMode === 'pan'
                ? 'bg-[#0F1E3D] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Geser Kanvas (atau tahan tombol Spasi + Seret)"
          >
            <Hand className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setToolMode(toolMode === 'draw' ? 'select' : 'draw')}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              effectiveToolMode === 'draw'
                ? 'bg-sky-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Pena Gambar / Coretan Bebas di Kertas"
          >
            <PenTool className="w-4 h-4" />
          </button>

          <div className="w-6 h-px bg-slate-200 my-0.5" />

          <button
            type="button"
            onClick={() => addQuickCanvasObject('text')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
            title="Tambah Kotak Teks Mengambang di Kanvas"
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => canvasImageInputRef.current?.click()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
            title="Sisipkan Gambar / Diagram Soal ke Kanvas"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
          <input
            ref={canvasImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleUploadCanvasImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => addQuickCanvasObject('box')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
            title="Tambah Kotak Jawaban / Bingkai di Kanvas"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => addQuickCanvasObject('line')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
            title="Tambah Garis Pemisah di Kanvas"
          >
            <Minus className="w-4 h-4" />
          </button>

          <div className="w-6 h-px bg-slate-200 my-0.5" />

          <button
            type="button"
            onClick={() => setShowMarginGuides((v) => !v)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              showMarginGuides
                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Tampilkan / Sembunyikan Garis Bantu Margin"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setPageLayoutMode((m) => (m === 'single' ? 'spread' : 'single'))}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              pageLayoutMode === 'spread'
                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={pageLayoutMode === 'spread' ? 'Tampilan 1 Kolom' : 'Tampilan 2 Halaman Berdampingan'}
          >
            <Columns2 className="w-4 h-4" />
          </button>

          {canvasElements.length > 0 && (
            <button
              type="button"
              onClick={() => {
                updateCanvasElements(canvasElements.filter((el) => el.pageIndex !== activePageIndex));
                setSelectedCanvasElId(null);
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 transition-colors mt-auto"
              title="Bersihkan Semua Elemen Kanvas di Halaman Aktif"
            >
              <Eraser className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dot-Grid Drafting Board Viewport */}
        <div
          ref={canvasViewportRef}
          onPointerDown={handleBoardPointerDown}
          onWheel={handleCanvasWheel}
          className={`flex-1 overflow-auto relative p-8 pb-16 ${
            effectiveToolMode === 'pan'
              ? 'cursor-grab active:cursor-grabbing select-none'
              : effectiveToolMode === 'draw'
              ? 'cursor-crosshair'
              : ''
          }`}
          style={{
            backgroundColor: '#E9EEF5',
            backgroundImage: 'radial-gradient(#CBD5E1 1.15px, transparent 1.15px)',
            backgroundSize: '20px 20px',
          }}
        >
          {/* Floating Pen Controls when Pen Tool Active */}
          {effectiveToolMode === 'draw' && (
            <div className="sticky top-2 left-1/2 -translate-x-1/2 z-30 w-fit mx-auto mb-4 bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">Pena Kanvas:</span>
              {['#0F1E3D', '#0F172A', '#DC2626', '#1D4ED8', '#15803D'].map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setDrawColor(col)}
                  className={`w-4 h-4 rounded-full border ${
                    drawColor === col ? 'ring-2 ring-sky-500 ring-offset-1 border-white' : 'border-slate-300'
                  }`}
                  style={{ backgroundColor: col }}
                />
              ))}
              <select
                value={drawWidthMm}
                onChange={(e) => setDrawWidthMm(Number(e.target.value))}
                className="px-1.5 py-0.5 text-[11px] border border-slate-200 rounded bg-slate-50"
              >
                <option value={0.35}>Tipis</option>
                <option value={0.55}>Sedang</option>
                <option value={1.0}>Tebal</option>
              </select>
              <button
                type="button"
                onClick={() => setToolMode('select')}
                className="px-2 py-0.5 bg-[#0F1E3D] text-white rounded text-[11px] font-medium"
              >
                Selesai
              </button>
            </div>
          )}

          <div
            className={`mx-auto flex ${
              pageLayoutMode === 'spread' && pages.length > 1
                ? 'flex-wrap justify-center items-start gap-7'
                : 'flex-col items-center gap-7'
            }`}
          >
            {pages.map((page, idx) => (
              <div
                key={idx}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className="shrink-0 flex flex-col items-start gap-1.5"
              >
                <div className="flex items-center justify-between w-full px-0.5 text-[11px] font-sans text-slate-500 select-none">
                  <span className={activePageIndex === idx ? 'font-semibold text-[#0F1E3D]' : ''}>
                    Halaman {idx + 1} · {format.paperSize} ({paper.w}×{paper.h} mm)
                  </span>
                  <span className="font-mono tabular-nums text-[10px]">
                    {page.items.length} soal
                  </span>
                </div>
                <div
                  style={{
                    width: `${pageWidthPx * zoom}px`,
                    height: `${pageHeightPx * zoom}px`,
                  }}
                  className="relative"
                >
                  <div
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {renderPageContent(idx, page.items, pages.length, false)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Floating Canvas Bottom Navigator & Quick Zoom Bar */}
          <div className="sticky bottom-3 left-0 right-0 z-30 flex justify-center pointer-events-none mt-4">
            <div className="pointer-events-auto bg-white/95 backdrop-blur border border-slate-200 shadow-lg rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                {pages.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActivePageIndex(idx);
                      pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums transition-colors ${
                      activePageIndex === idx
                        ? 'bg-[#0F1E3D] text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Hal {idx + 1}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
                className="p-1 rounded hover:bg-slate-100 text-slate-700"
                title="Perkecil"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono tabular-nums text-[11px] text-slate-700 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
                className="p-1 rounded hover:bg-slate-100 text-slate-700"
                title="Perbesar"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitToWidth}
                className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700"
                title="Sesuaikan Lebar Kanvas"
              >
                Pas Layar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Print-Only Full-Scale Container */}
      <div className="hidden print-only-container">
        {pages.map((page, idx) => renderPageContent(idx, page.items, pages.length, true))}
      </div>
    </div>
  );
};
