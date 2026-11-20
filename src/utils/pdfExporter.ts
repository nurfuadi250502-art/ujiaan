import { jsPDF } from 'jspdf';
import type {
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
import { formatQuestionNumberLabel } from './accuracyValidator';
import {
  formatOptionMarkerChar,
  toEasternArabicDigits,
} from './ruleParser';
import { parseRichTextSegments, stripRichHtml, type RichTextSegment } from './richText';

function getPdfDimensionsMm(paperSize: FormatConfig['paperSize']): [number, number] {
  switch (paperSize) {
    case 'F4':
      return [215, 330];
    case 'Letter':
      return [215.9, 279.4];
    case 'A4':
    default:
      return [210, 297];
  }
}

function resolveCanvasFontStack(fontFamily: FormatConfig['fontFamily']): string {
  switch (fontFamily) {
    case 'Amiri':
      return '"Amiri", "Noto Naskh Arabic", serif';
    case 'Noto Naskh Arabic':
      return '"Noto Naskh Arabic", "Amiri", serif';
    case 'Traditional Arabic':
      return '"Traditional Arabic", "Amiri", "Noto Naskh Arabic", serif';
    case 'Times New Roman':
      return '"Times New Roman", "Amiri", Times, serif';
    case 'Georgia':
      return 'Georgia, "Amiri", serif';
    case 'Calibri':
      return 'Calibri, "DM Sans", "Noto Naskh Arabic", sans-serif';
    case 'Arial':
      return 'Arial, Helvetica, "Noto Naskh Arabic", sans-serif';
    case 'Plus Jakarta Sans':
    default:
      return '"Plus Jakarta Sans", "Noto Naskh Arabic", sans-serif';
  }
}

interface RichToken {
  text: string;
  isSpace: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superScript: boolean;
  subScript: boolean;
  color?: string;
  highlight?: string;
}

interface WrappedRichLine {
  tokens: RichToken[];
  widthPx: number;
  spaceCount: number;
}

function buildFontString(
  baseFontPx: number,
  fontStack: string,
  opts: { bold?: boolean; italic?: boolean; superScript?: boolean; subScript?: boolean },
  allowItalic = true
): string {
  const weight = opts.bold ? '700' : '400';
  const style = opts.italic && allowItalic ? 'italic' : 'normal';
  const size = opts.superScript || opts.subScript ? Math.round(baseFontPx * 0.72) : baseFontPx;
  return `${style} ${weight} ${size}px ${fontStack}`;
}

function splitSegmentsIntoParagraphs(
  htmlOrText: string,
  baseOpts?: { bold?: boolean; italic?: boolean }
): RichToken[][] {
  const segs: RichTextSegment[] = parseRichTextSegments(htmlOrText);
  const paragraphs: RichToken[][] = [[]];

  for (const seg of segs) {
    const subLines = seg.text.split('\n');
    subLines.forEach((lineText, lineIdx) => {
      if (lineIdx > 0) {
        paragraphs.push([]);
      }
      if (!lineText) return;
      // Split into spaces vs non-space runs so inline formatting inside a word stays attached
      const parts = lineText.split(/( +)/);
      for (const part of parts) {
        if (!part) continue;
        paragraphs[paragraphs.length - 1].push({
          text: part,
          isSpace: /^ +$/.test(part),
          bold: Boolean(baseOpts?.bold || seg.bold),
          italic: Boolean(baseOpts?.italic || seg.italic),
          underline: Boolean(seg.underline),
          strike: Boolean(seg.strike),
          superScript: Boolean(seg.superScript),
          subScript: Boolean(seg.subScript),
          color: seg.color,
          highlight: seg.highlight,
        });
      }
    });
  }

  return paragraphs;
}

/**
 * Word-wraps rich HTML/text into lines while preserving inline Bold, Italic, Underline,
 * Strike, Super/Subscript, Color, and Highlight across both LTR and RTL scripts.
 */
function wrapRichParagraphs(
  ctx: CanvasRenderingContext2D,
  htmlOrText: string,
  maxWidthPx: number,
  baseFontPx: number,
  fontStack: string,
  isRtl: boolean,
  baseOpts?: { bold?: boolean; italic?: boolean }
): WrappedRichLine[] {
  const paragraphs = splitSegmentsIntoParagraphs(htmlOrText, baseOpts);
  const lines: WrappedRichLine[] = [];
  const allowItalic = !isRtl;

  const measureTok = (tok: RichToken): number => {
    ctx.font = buildFontString(baseFontPx, fontStack, tok, allowItalic);
    return ctx.measureText(tok.text).width;
  };

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push({ tokens: [], widthPx: 0, spaceCount: 0 });
      continue;
    }

    // Group adjacent non-space tokens into indivisible word clusters so mid-word formatting never splits
    const groups: { tokens: RichToken[]; isSpace: boolean; width: number }[] = [];
    for (const tok of para) {
      const w = measureTok(tok);
      if (tok.isSpace) {
        groups.push({ tokens: [tok], isSpace: true, width: w });
      } else {
        const prev = groups[groups.length - 1];
        if (prev && !prev.isSpace) {
          prev.tokens.push(tok);
          prev.width += w;
        } else {
          groups.push({ tokens: [tok], isSpace: false, width: w });
        }
      }
    }

    let currentTokens: RichToken[] = [];
    let currentWidth = 0;

    for (const grp of groups) {
      if (grp.isSpace) {
        if (currentTokens.length === 0) continue; // Trim leading space on wrapped line
        currentTokens.push(...grp.tokens);
        currentWidth += grp.width;
        continue;
      }

      if (currentTokens.length > 0 && currentWidth + grp.width > maxWidthPx) {
        // Trim trailing space before pushing line
        while (currentTokens.length > 0 && currentTokens[currentTokens.length - 1].isSpace) {
          const popped = currentTokens.pop()!;
          currentWidth -= measureTok(popped);
        }
        const spaceCount = currentTokens.filter((t) => t.isSpace).length;
        lines.push({ tokens: currentTokens, widthPx: Math.max(0, currentWidth), spaceCount });
        currentTokens = [...grp.tokens];
        currentWidth = grp.width;
      } else {
        currentTokens.push(...grp.tokens);
        currentWidth += grp.width;
      }
    }

    while (currentTokens.length > 0 && currentTokens[currentTokens.length - 1].isSpace) {
      const popped = currentTokens.pop()!;
      currentWidth -= measureTok(popped);
    }
    const spaceCount = currentTokens.filter((t) => t.isSpace).length;
    lines.push({ tokens: currentTokens, widthPx: Math.max(0, currentWidth), spaceCount });
  }

  return lines;
}

/**
 * Draws a single wrapped rich line accurately on Canvas.
 * For Arabic/RTL lines with uniform text font/color, draws the shaped whole string in one pass
 * via HarfBuzz and overlays highlight/underline/strikethrough spans at exact measured offsets.
 */
function drawRichLine(
  ctx: CanvasRenderingContext2D,
  line: WrappedRichLine,
  opts: {
    boxLeftPx: number;
    boxWidthPx: number;
    yPx: number;
    baseFontPx: number;
    fontStack: string;
    isRtl: boolean;
    align: 'left' | 'center' | 'right' | 'justify';
    isLastLineInParagraph: boolean;
    defaultColor?: string;
    scalePx: number;
  }
): void {
  const {
    boxLeftPx,
    boxWidthPx,
    yPx,
    baseFontPx,
    fontStack,
    isRtl,
    align,
    isLastLineInParagraph,
    defaultColor = '#0F172A',
    scalePx,
  } = opts;
  if (line.tokens.length === 0) return;

  const allowItalic = !isRtl;
  const fullPlainText = line.tokens.map((t) => t.text).join('');

  // Check if Arabic/RTL line shares uniform font & text color (common case where whole-line HarfBuzz shaping is ideal)
  const firstNonSpace = line.tokens.find((t) => !t.isSpace) || line.tokens[0];
  const uniformFontAndColor = line.tokens.every(
    (t) =>
      t.isSpace ||
      (t.bold === firstNonSpace.bold &&
        t.superScript === firstNonSpace.superScript &&
        t.subScript === firstNonSpace.subScript &&
        (t.color || defaultColor) === (firstNonSpace.color || defaultColor))
  );

  // Determine effective horizontal anchor
  let startX = boxLeftPx;
  let extraSpacePerGap = 0;
  if (align === 'center') {
    startX = isRtl
      ? boxLeftPx + boxWidthPx / 2 + line.widthPx / 2
      : boxLeftPx + (boxWidthPx - line.widthPx) / 2;
  } else if (align === 'right') {
    startX = boxLeftPx + boxWidthPx;
  } else if (align === 'left') {
    startX = isRtl ? boxLeftPx + Math.min(boxWidthPx, line.widthPx) : boxLeftPx;
  } else if (align === 'justify') {
    if (!isLastLineInParagraph && line.spaceCount > 0 && line.widthPx < boxWidthPx) {
      extraSpacePerGap = (boxWidthPx - line.widthPx) / line.spaceCount;
    }
    startX = isRtl ? boxLeftPx + boxWidthPx : boxLeftPx;
  }

  ctx.save();
  ctx.textBaseline = 'top';

  if (isRtl && uniformFontAndColor && extraSpacePerGap === 0) {
    // Whole-string RTL HarfBuzz draw + exact span highlight/underline/strike
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    const anchorX =
      align === 'center' ? boxLeftPx + boxWidthPx / 2 : align === 'left' ? boxLeftPx + line.widthPx : startX;
    if (align === 'center') ctx.textAlign = 'center';

    const fontStr = buildFontString(baseFontPx, fontStack, firstNonSpace, false);
    ctx.font = fontStr;
    const totalW = ctx.measureText(fullPlainText).width;
    const rightEdgeX = align === 'center' ? anchorX + totalW / 2 : anchorX;

    // 1. Highlights + decorations by measuring character prefix offsets on the whole shaped string
    let charCursor = 0;
    for (const tok of line.tokens) {
      const startOff = ctx.measureText(fullPlainText.slice(0, charCursor)).width;
      const endOff = ctx.measureText(fullPlainText.slice(0, charCursor + tok.text.length)).width;
      const segRightX = rightEdgeX - startOff;
      const segLeftX = rightEdgeX - endOff;
      const segW = Math.max(0, segRightX - segLeftX);

      if (tok.highlight && segW > 0) {
        ctx.fillStyle = tok.highlight;
        ctx.fillRect(segLeftX, yPx, segW, baseFontPx * 1.18);
      }
      charCursor += tok.text.length;
    }

    // 2. Text
    ctx.textAlign = 'right';
    ctx.fillStyle = firstNonSpace.color || defaultColor;
    const yDraw = firstNonSpace.superScript
      ? yPx - baseFontPx * 0.22
      : firstNonSpace.subScript
      ? yPx + baseFontPx * 0.2
      : yPx;
    ctx.fillText(fullPlainText, rightEdgeX, yDraw);

    // 3. Underlines & Strikes
    charCursor = 0;
    for (const tok of line.tokens) {
      if ((tok.underline || tok.strike) && tok.text.trim()) {
        const startOff = ctx.measureText(fullPlainText.slice(0, charCursor)).width;
        const endOff = ctx.measureText(fullPlainText.slice(0, charCursor + tok.text.length)).width;
        const x1 = rightEdgeX - startOff;
        const x2 = rightEdgeX - endOff;
        ctx.strokeStyle = tok.color || defaultColor;
        ctx.lineWidth = Math.max(1.2, 0.28 * scalePx);
        if (tok.underline) {
          const uy = yPx + baseFontPx * 1.05;
          ctx.beginPath();
          ctx.moveTo(x1, uy);
          ctx.lineTo(x2, uy);
          ctx.stroke();
        }
        if (tok.strike) {
          const sy = yPx + baseFontPx * 0.54;
          ctx.beginPath();
          ctx.moveTo(x1, sy);
          ctx.lineTo(x2, sy);
          ctx.stroke();
        }
      }
      charCursor += tok.text.length;
    }

    ctx.restore();
    return;
  }

  // Token-by-token layout (LTR full rich text or RTL mixed color/bold tokens)
  ctx.direction = isRtl ? 'rtl' : 'ltr';
  ctx.textAlign = isRtl ? 'right' : 'left';
  let cursorX = startX;

  for (const tok of line.tokens) {
    ctx.font = buildFontString(baseFontPx, fontStack, tok, allowItalic);
    const tokW = ctx.measureText(tok.text).width + (tok.isSpace ? extraSpacePerGap : 0);
    const leftX = isRtl ? cursorX - tokW : cursorX;

    if (tok.highlight && tokW > 0) {
      ctx.fillStyle = tok.highlight;
      ctx.fillRect(leftX, yPx, tokW, baseFontPx * 1.18);
    }

    const yDraw = tok.superScript
      ? yPx - baseFontPx * 0.22
      : tok.subScript
      ? yPx + baseFontPx * 0.2
      : yPx;

    if (!tok.isSpace) {
      ctx.fillStyle = tok.color || defaultColor;
      ctx.fillText(tok.text, cursorX, yDraw);
    }

    if (tok.underline && tok.text.trim()) {
      const uy = yDraw + baseFontPx * (tok.superScript || tok.subScript ? 0.78 : 1.04);
      ctx.strokeStyle = tok.color || defaultColor;
      ctx.lineWidth = Math.max(1.1, 0.26 * scalePx);
      ctx.beginPath();
      ctx.moveTo(leftX, uy);
      ctx.lineTo(leftX + tokW, uy);
      ctx.stroke();
    }

    if (tok.strike && tok.text.trim()) {
      const sy = yDraw + baseFontPx * (tok.superScript || tok.subScript ? 0.38 : 0.52);
      ctx.strokeStyle = tok.color || defaultColor;
      ctx.lineWidth = Math.max(1.1, 0.26 * scalePx);
      ctx.beginPath();
      ctx.moveTo(leftX, sy);
      ctx.lineTo(leftX + tokW, sy);
      ctx.stroke();
    }

    cursorX = isRtl ? cursorX - tokW : cursorX + tokW;
  }

  ctx.restore();
}

/**
 * Draws a centered or single-line rich-text phrase inside a fixed horizontal box (for headers & table cells).
 */
function drawRichSingleLineInBox(
  ctx: CanvasRenderingContext2D,
  htmlText: string,
  opts: {
    boxLeftPx: number;
    boxWidthPx: number;
    yCenterOrTopPx: number;
    baseline: 'top' | 'middle';
    baseFontPx: number;
    fontStack: string;
    isRtl: boolean;
    align: 'left' | 'center' | 'right';
    bold?: boolean;
    defaultColor?: string;
    scalePx: number;
  }
): void {
  const {
    boxLeftPx,
    boxWidthPx,
    yCenterOrTopPx,
    baseline,
    baseFontPx,
    fontStack,
    isRtl,
    align,
    bold,
    defaultColor = '#020617',
    scalePx,
  } = opts;
  const wrapped = wrapRichParagraphs(
    ctx,
    htmlText,
    Math.max(40, boxWidthPx),
    baseFontPx,
    fontStack,
    isRtl,
    { bold }
  );
  const line = wrapped[0];
  if (!line) return;
  const topY = baseline === 'middle' ? yCenterOrTopPx - baseFontPx * 0.52 : yCenterOrTopPx;
  drawRichLine(ctx, line, {
    boxLeftPx,
    boxWidthPx,
    yPx: topY,
    baseFontPx,
    fontStack,
    isRtl,
    align,
    isLastLineInParagraph: true,
    defaultColor,
    scalePx,
  });
}

/**
 * High-DPI Canvas-to-PDF renderer supporting BOTH KMI Latin (LTR) and KMI Arabic (RTL)
 * with complete Word-style inline formatting preservation.
 */
async function exportUnifiedCanvasPdf(params: {
  template: TemplateDocument;
  identity: ExamIdentity;
  format: FormatConfig;
  questions: ParsedQuestion[];
  logoDataUrl?: string;
}): Promise<void> {
  const { template, identity, format, questions, logoDataUrl } = params;
  const [pageW, pageH] = getPdfDimensionsMm(format.paperSize);
  const isRtl = format.direction === 'rtl';
  const effectiveLogo = logoDataUrl || template.logoDataUrl;
  const isKmiArabicPreset =
    isRtl && (format.arabicTemplateStyle ?? 'pesantren-kmi') === 'pesantren-kmi';
  const isKmiLatinPreset =
    !isRtl &&
    !effectiveLogo &&
    (template.id === 'tpl_kmi_latin' ||
      (format.arabicTemplateStyle ?? 'pesantren-kmi') === 'pesantren-kmi');

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const MM_TO_PX = 3.7795 * 2.5;
  const PT_TO_PX = (1 / 72) * 96 * 2.5;
  const pxW = Math.round(pageW * MM_TO_PX);
  const pxH = Math.round(pageH * MM_TO_PX);
  const leftPx = format.marginLeft * MM_TO_PX;
  const rightPx = format.marginRight * MM_TO_PX;
  const topPx = format.marginTop * MM_TO_PX;
  const bottomPx = format.marginBottom * MM_TO_PX;
  const rightEdge = pxW - rightPx;
  const contentW = pxW - leftPx - rightPx;
  const maxY = pxH - bottomPx - 12 * MM_TO_PX;

  const fontStack = resolveCanvasFontStack(format.fontFamily);
  const pages: HTMLCanvasElement[] = [];

  const createPageCanvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.fillStyle = '#0F172A';
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    return { canvas, ctx };
  };

  let { canvas, ctx } = createPageCanvas();
  pages.push(canvas);
  let y = topPx;

  const ensureSpace = (neededPx: number) => {
    if (y + neededPx > maxY) {
      const next = createPageCanvas();
      canvas = next.canvas;
      ctx = next.ctx;
      pages.push(canvas);
      y = topPx;
    }
  };

  if (isKmiArabicPreset) {
    const arLabels = identity.tableLabels || ARABIC_KMI_TABLE_LABELS;
    const rawYear = (identity.academicYear || ARABIC_KMI_IDENTITY_DEFAULTS.academicYear).trim();
    const yearDigits =
      format.arabicNumeralStyle === 'eastern' ? toEasternArabicDigits(rawYear) : rawYear;
    const yearLine = yearDigits.startsWith('عام') ? yearDigits : `عام ${yearDigits}`;

    const headerLines =
      identity.headerLines && identity.headerLines.length > 0
        ? identity.headerLines
        : [
            identity.examType || template.headerTitle,
            identity.schoolName || template.headerSubtitle,
            yearLine,
          ];

    const headerFontPx = Math.round(13 * PT_TO_PX);
    for (const hLine of headerLines) {
      drawRichSingleLineInBox(ctx, hLine, {
        boxLeftPx: leftPx,
        boxWidthPx: contentW,
        yCenterOrTopPx: y,
        baseline: 'top',
        baseFontPx: headerFontPx,
        fontStack,
        isRtl: true,
        align: 'center',
        bold: true,
        scalePx: MM_TO_PX,
      });
      y += 6.2 * MM_TO_PX;
    }
    y += 2 * MM_TO_PX;

    const colRightW = contentW * 0.31;
    const colMidW = contentW * 0.43;
    const colLeftW = contentW * 0.26;
    const row1H = 12 * MM_TO_PX;
    const row2H = 6.8 * MM_TO_PX;
    const row3H = 6.8 * MM_TO_PX;
    const extraRowH = identity.includeStudentFields ? 6.8 * MM_TO_PX : 0;
    const totalTableH = row1H + row2H + row3H + extraRowH;

    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 0.28 * MM_TO_PX;
    ctx.strokeRect(leftPx, y, contentW, totalTableH);

    // Heavy bottom border
    ctx.lineWidth = 0.6 * MM_TO_PX;
    ctx.beginPath();
    ctx.moveTo(leftPx, y + totalTableH);
    ctx.lineTo(rightEdge, y + totalTableH);
    ctx.stroke();

    ctx.lineWidth = 0.28 * MM_TO_PX;
    const xDiv1 = rightEdge - colRightW;
    const xDiv2 = xDiv1 - colMidW;
    ctx.beginPath();
    ctx.moveTo(xDiv1, y);
    ctx.lineTo(xDiv1, y + row1H + row2H);
    ctx.moveTo(xDiv2, y);
    ctx.lineTo(xDiv2, y + row1H + row2H);
    ctx.moveTo(leftPx, y + row1H / 2);
    ctx.lineTo(leftPx + colLeftW, y + row1H / 2);
    ctx.moveTo(leftPx, y + row1H);
    ctx.lineTo(rightEdge, y + row1H);
    ctx.moveTo(leftPx, y + row1H + row2H);
    ctx.lineTo(rightEdge, y + row1H + row2H);
    ctx.moveTo(leftPx + contentW / 2, y + row1H + row2H);
    ctx.lineTo(leftPx + contentW / 2, y + totalTableH);
    ctx.stroke();

    const tblFontPx = Math.round(11 * PT_TO_PX);
    // Row 1
    drawRichSingleLineInBox(ctx, arLabels.subject, {
      boxLeftPx: rightEdge - 17 * MM_TO_PX,
      boxWidthPx: 14 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'right',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: rightEdge - 20 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.subjectFormalName || '', {
      boxLeftPx: xDiv1 + 2 * MM_TO_PX,
      boxWidthPx: colRightW - 22 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    drawRichSingleLineInBox(ctx, arLabels.day, {
      boxLeftPx: xDiv1 - 21 * MM_TO_PX,
      boxWidthPx: 18 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'right',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: xDiv1 - 24 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.examDay || 'السبت', {
      boxLeftPx: xDiv2 + 2 * MM_TO_PX,
      boxWidthPx: colMidW - 26 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    drawRichSingleLineInBox(ctx, identity.hijriDate || '١٩ محرم ١٤٤٨', {
      boxLeftPx: leftPx + 2 * MM_TO_PX,
      boxWidthPx: colLeftW - 4 * MM_TO_PX,
      yCenterOrTopPx: y + row1H * 0.25,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.examDate || '٤ يوليو ٢٠٢٦', {
      boxLeftPx: leftPx + 2 * MM_TO_PX,
      boxWidthPx: colLeftW - 4 * MM_TO_PX,
      yCenterOrTopPx: y + row1H * 0.75,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    // Row 2
    const r2Y = y + row1H + row2H / 2;
    drawRichSingleLineInBox(ctx, arLabels.classLabel, {
      boxLeftPx: rightEdge - 17 * MM_TO_PX,
      boxWidthPx: 14 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'right',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: rightEdge - 20 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.className, {
      boxLeftPx: xDiv1 + 2 * MM_TO_PX,
      boxWidthPx: colRightW - 22 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    drawRichSingleLineInBox(ctx, arLabels.period, {
      boxLeftPx: xDiv1 - 21 * MM_TO_PX,
      boxWidthPx: 18 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'right',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: xDiv1 - 24 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.sessionPeriod || 'الثانية', {
      boxLeftPx: xDiv2 + 2 * MM_TO_PX,
      boxWidthPx: colMidW - 26 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    drawRichSingleLineInBox(ctx, identity.duration, {
      boxLeftPx: leftPx + 2 * MM_TO_PX,
      boxWidthPx: colLeftW - 4 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    // Row 3 (Bold Teacher Row)
    const r3Y = y + row1H + row2H + row3H / 2;
    drawRichSingleLineInBox(ctx, arLabels.teacher, {
      boxLeftPx: leftPx + contentW * 0.5 + 2 * MM_TO_PX,
      boxWidthPx: contentW * 0.5 - 4 * MM_TO_PX,
      yCenterOrTopPx: r3Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.teacherName, {
      boxLeftPx: leftPx + 2 * MM_TO_PX,
      boxWidthPx: contentW * 0.5 - 4 * MM_TO_PX,
      yCenterOrTopPx: r3Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: true,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });

    if (identity.includeStudentFields) {
      const r4Y = y + row1H + row2H + row3H + extraRowH / 2;
      drawRichSingleLineInBox(ctx, 'اسم الطالب : .........................', {
        boxLeftPx: leftPx + contentW * 0.5 + 2 * MM_TO_PX,
        boxWidthPx: contentW * 0.5 - 5 * MM_TO_PX,
        yCenterOrTopPx: r4Y,
        baseline: 'middle',
        baseFontPx: tblFontPx,
        fontStack,
        isRtl: true,
        align: 'right',
        scalePx: MM_TO_PX,
      });
      drawRichSingleLineInBox(ctx, 'رقم الجلوس : .......................', {
        boxLeftPx: leftPx + 2 * MM_TO_PX,
        boxWidthPx: contentW * 0.5 - 5 * MM_TO_PX,
        yCenterOrTopPx: r4Y,
        baseline: 'middle',
        baseFontPx: tblFontPx,
        fontStack,
        isRtl: true,
        align: 'right',
        scalePx: MM_TO_PX,
      });
    }

    y += totalTableH + 5 * MM_TO_PX;

    if (identity.instructions.trim()) {
      const instrFontPx = Math.round(10 * PT_TO_PX);
      const instrLines = wrapRichParagraphs(
        ctx,
        identity.instructions.trim(),
        contentW,
        instrFontPx,
        fontStack,
        true
      );
      instrLines.forEach((line, lIdx) => {
        ensureSpace(5 * MM_TO_PX);
        drawRichLine(ctx, line, {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yPx: y,
          baseFontPx: instrFontPx,
          fontStack,
          isRtl: true,
          align: 'right',
          isLastLineInParagraph: lIdx === instrLines.length - 1,
          scalePx: MM_TO_PX,
        });
        y += 4.8 * MM_TO_PX;
      });
      y += 2 * MM_TO_PX;
    }
  } else if (isKmiLatinPreset) {
    // Exact English/Latin KMI Header (4 centered bold lines)
    const enLabels = identity.tableLabels || LATIN_KMI_TABLE_LABELS;
    const headerLines =
      identity.headerLines && identity.headerLines.length > 0
        ? identity.headerLines
        : [
            identity.examType || LATIN_KMI_IDENTITY_DEFAULTS.examType,
            identity.schoolAddress || LATIN_KMI_IDENTITY_DEFAULTS.schoolAddress,
            identity.schoolName || LATIN_KMI_IDENTITY_DEFAULTS.schoolName,
            identity.academicYear || LATIN_KMI_IDENTITY_DEFAULTS.academicYear,
          ];

    const headerFontPx = Math.round(12 * PT_TO_PX);
    for (const hLine of headerLines) {
      drawRichSingleLineInBox(ctx, hLine, {
        boxLeftPx: leftPx,
        boxWidthPx: contentW,
        yCenterOrTopPx: y,
        baseline: 'top',
        baseFontPx: headerFontPx,
        fontStack,
        isRtl: false,
        align: 'center',
        bold: true,
        scalePx: MM_TO_PX,
      });
      y += 5.1 * MM_TO_PX;
    }
    y += 1.5 * MM_TO_PX;

    // Exact 3-Row KMI Latin Bordered Identity Table (34% | 40% | 26%, Row 3 50% | 50%)
    const col1W = contentW * 0.34;
    const col2W = contentW * 0.4;
    const col3W = contentW * 0.26;
    const row1H = 11 * MM_TO_PX;
    const row2H = 6.2 * MM_TO_PX;
    const row3H = 6.2 * MM_TO_PX;
    const extraRowH = identity.includeStudentFields ? 6.2 * MM_TO_PX : 0;
    const totalTableH = row1H + row2H + row3H + extraRowH;

    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 0.28 * MM_TO_PX;
    ctx.strokeRect(leftPx, y, contentW, totalTableH);

    // Heavy bottom border matching PDF sample
    ctx.lineWidth = 0.65 * MM_TO_PX;
    ctx.beginPath();
    ctx.moveTo(leftPx, y + totalTableH);
    ctx.lineTo(rightEdge, y + totalTableH);
    ctx.stroke();

    ctx.lineWidth = 0.28 * MM_TO_PX;
    const xDiv1 = leftPx + col1W;
    const xDiv2 = xDiv1 + col2W;
    ctx.beginPath();
    // Vertical dividers for rows 1 & 2
    ctx.moveTo(xDiv1, y);
    ctx.lineTo(xDiv1, y + row1H + row2H);
    ctx.moveTo(xDiv2, y);
    ctx.lineTo(xDiv2, y + row1H + row2H);
    // Stacked date divider inside right column of Row 1
    ctx.moveTo(xDiv2, y + row1H / 2);
    ctx.lineTo(rightEdge, y + row1H / 2);
    // Horizontal divider below Row 1 & Row 2
    ctx.moveTo(leftPx, y + row1H);
    ctx.lineTo(rightEdge, y + row1H);
    ctx.moveTo(leftPx, y + row1H + row2H);
    ctx.lineTo(rightEdge, y + row1H + row2H);
    // 50% / 50% vertical divider for Row 3 (TEACHER | UST. FAREL)
    ctx.moveTo(leftPx + contentW / 2, y + row1H + row2H);
    ctx.lineTo(leftPx + contentW / 2, y + totalTableH);
    ctx.stroke();

    const tblFontPx = Math.round(10.5 * PT_TO_PX);
    // Row 1 Left: SUBJECT : ENGLISH LESSON
    drawRichSingleLineInBox(ctx, enLabels.subject, {
      boxLeftPx: leftPx + 2.5 * MM_TO_PX,
      boxWidthPx: 20 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: leftPx + 22.5 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.subjectFormalName || '', {
      boxLeftPx: leftPx + 26 * MM_TO_PX,
      boxWidthPx: col1W - 28 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });

    // Row 1 Mid: DAY : WEDNESDAY
    drawRichSingleLineInBox(ctx, enLabels.day, {
      boxLeftPx: xDiv1 + 2.5 * MM_TO_PX,
      boxWidthPx: 18 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: xDiv1 + 20.5 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.examDay || 'WEDNESDAY', {
      boxLeftPx: xDiv1 + 24.5 * MM_TO_PX,
      boxWidthPx: col2W - 26.5 * MM_TO_PX,
      yCenterOrTopPx: y + row1H / 2,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });

    // Row 1 Right Stacked Dates
    drawRichSingleLineInBox(ctx, identity.hijriDate || '23 MUHARRAM 1448', {
      boxLeftPx: xDiv2 + 1.5 * MM_TO_PX,
      boxWidthPx: col3W - 3 * MM_TO_PX,
      yCenterOrTopPx: y + row1H * 0.25,
      baseline: 'middle',
      baseFontPx: Math.round(9.5 * PT_TO_PX),
      fontStack,
      isRtl: false,
      align: 'center',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.examDate || '8 JULI 2026', {
      boxLeftPx: xDiv2 + 1.5 * MM_TO_PX,
      boxWidthPx: col3W - 3 * MM_TO_PX,
      yCenterOrTopPx: y + row1H * 0.75,
      baseline: 'middle',
      baseFontPx: Math.round(9.5 * PT_TO_PX),
      fontStack,
      isRtl: false,
      align: 'center',
      scalePx: MM_TO_PX,
    });

    // Row 2: CLASS : THREE | PERIOD : SECOND | 90 minutes
    const r2Y = y + row1H + row2H / 2;
    drawRichSingleLineInBox(ctx, enLabels.classLabel, {
      boxLeftPx: leftPx + 2.5 * MM_TO_PX,
      boxWidthPx: 20 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: leftPx + 22.5 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.className, {
      boxLeftPx: leftPx + 26 * MM_TO_PX,
      boxWidthPx: col1W - 28 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });

    drawRichSingleLineInBox(ctx, enLabels.period, {
      boxLeftPx: xDiv1 + 2.5 * MM_TO_PX,
      boxWidthPx: 18 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, ':', {
      boxLeftPx: xDiv1 + 20.5 * MM_TO_PX,
      boxWidthPx: 3 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.sessionPeriod || 'SECOND', {
      boxLeftPx: xDiv1 + 24.5 * MM_TO_PX,
      boxWidthPx: col2W - 26.5 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'left',
      bold: true,
      scalePx: MM_TO_PX,
    });

    drawRichSingleLineInBox(ctx, identity.duration, {
      boxLeftPx: xDiv2 + 1.5 * MM_TO_PX,
      boxWidthPx: col3W - 3 * MM_TO_PX,
      yCenterOrTopPx: r2Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });

    // Row 3: TEACHER | UST. FAREL
    const r3Y = y + row1H + row2H + row3H / 2;
    drawRichSingleLineInBox(ctx, enLabels.teacher, {
      boxLeftPx: leftPx + 2 * MM_TO_PX,
      boxWidthPx: contentW * 0.5 - 4 * MM_TO_PX,
      yCenterOrTopPx: r3Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.teacherName, {
      boxLeftPx: leftPx + contentW * 0.5 + 2 * MM_TO_PX,
      boxWidthPx: contentW * 0.5 - 4 * MM_TO_PX,
      yCenterOrTopPx: r3Y,
      baseline: 'middle',
      baseFontPx: tblFontPx,
      fontStack,
      isRtl: false,
      align: 'center',
      bold: true,
      scalePx: MM_TO_PX,
    });

    if (identity.includeStudentFields) {
      const r4Y = y + row1H + row2H + row3H + extraRowH / 2;
      drawRichSingleLineInBox(ctx, 'NAME : ....................................', {
        boxLeftPx: leftPx + 3 * MM_TO_PX,
        boxWidthPx: contentW * 0.5 - 6 * MM_TO_PX,
        yCenterOrTopPx: r4Y,
        baseline: 'middle',
        baseFontPx: Math.round(9.5 * PT_TO_PX),
        fontStack,
        isRtl: false,
        align: 'left',
        scalePx: MM_TO_PX,
      });
      drawRichSingleLineInBox(ctx, 'NUMBER : ..............................', {
        boxLeftPx: leftPx + contentW * 0.5 + 3 * MM_TO_PX,
        boxWidthPx: contentW * 0.5 - 6 * MM_TO_PX,
        yCenterOrTopPx: r4Y,
        baseline: 'middle',
        baseFontPx: Math.round(9.5 * PT_TO_PX),
        fontStack,
        isRtl: false,
        align: 'left',
        scalePx: MM_TO_PX,
      });
    }

    y += totalTableH + 4.5 * MM_TO_PX;

    if (identity.instructions.trim()) {
      const instrFontPx = Math.round(9.5 * PT_TO_PX);
      const instrLines = wrapRichParagraphs(
        ctx,
        identity.instructions.trim(),
        contentW,
        instrFontPx,
        fontStack,
        false
      );
      instrLines.forEach((line, lIdx) => {
        ensureSpace(5 * MM_TO_PX);
        drawRichLine(ctx, line, {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yPx: y,
          baseFontPx: instrFontPx,
          fontStack,
          isRtl: false,
          align: 'left',
          isLastLineInParagraph: lIdx === instrLines.length - 1,
          scalePx: MM_TO_PX,
        });
        y += 4.6 * MM_TO_PX;
      });
      y += 2 * MM_TO_PX;
    }
  } else {
    // Standard / Uploaded Kop Sekolah with optional logo
    let logoImg: HTMLImageElement | null = null;
    if (effectiveLogo) {
      logoImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = effectiveLogo;
      });
    }

    const kopHeightPx = 20 * MM_TO_PX;
    if (logoImg) {
      const logoSize = 16 * MM_TO_PX;
      const logoX = isRtl ? rightEdge - logoSize : leftPx;
      ctx.drawImage(logoImg, logoX, y, logoSize, logoSize);
    }

    const kopBoxLeft = leftPx + (logoImg && !isRtl ? 20 * MM_TO_PX : 0);
    const kopBoxW = contentW - (logoImg ? 20 * MM_TO_PX : 0);

    drawRichSingleLineInBox(
      ctx,
      template.headerTitle || (isRtl ? 'وِزَارَةُ الشُّؤُونِ الدِّينِيَّةِ' : 'DINAS PENDIDIKAN'),
      {
        boxLeftPx: kopBoxLeft,
        boxWidthPx: kopBoxW,
        yCenterOrTopPx: y + 1 * MM_TO_PX,
        baseline: 'top',
        baseFontPx: Math.round(11 * PT_TO_PX),
        fontStack,
        isRtl,
        align: 'center',
        bold: true,
        defaultColor: '#1E293B',
        scalePx: MM_TO_PX,
      }
    );
    drawRichSingleLineInBox(ctx, identity.schoolName, {
      boxLeftPx: kopBoxLeft,
      boxWidthPx: kopBoxW,
      yCenterOrTopPx: y + 6.5 * MM_TO_PX,
      baseline: 'top',
      baseFontPx: Math.round(14 * PT_TO_PX),
      fontStack,
      isRtl,
      align: 'center',
      bold: true,
      defaultColor: '#020617',
      scalePx: MM_TO_PX,
    });
    drawRichSingleLineInBox(ctx, identity.schoolAddress, {
      boxLeftPx: kopBoxLeft,
      boxWidthPx: kopBoxW,
      yCenterOrTopPx: y + 13 * MM_TO_PX,
      baseline: 'top',
      baseFontPx: Math.round(9 * PT_TO_PX),
      fontStack,
      isRtl,
      align: 'center',
      defaultColor: '#334155',
      scalePx: MM_TO_PX,
    });

    y += kopHeightPx;
    ctx.strokeStyle = '#0F1E3D';
    ctx.lineWidth = 0.8 * MM_TO_PX;
    ctx.beginPath();
    ctx.moveTo(leftPx, y);
    ctx.lineTo(rightEdge, y);
    ctx.stroke();
    ctx.lineWidth = 0.3 * MM_TO_PX;
    ctx.beginPath();
    ctx.moveTo(leftPx, y + 1.1 * MM_TO_PX);
    ctx.lineTo(rightEdge, y + 1.1 * MM_TO_PX);
    ctx.stroke();

    y += 5 * MM_TO_PX;

    drawRichSingleLineInBox(
      ctx,
      isRtl
        ? `${stripRichHtml(identity.examType)} — العام الدراسي ${stripRichHtml(identity.academicYear)}`
        : `${stripRichHtml(identity.examType).toUpperCase()} — TAHUN AJARAN ${stripRichHtml(identity.academicYear)}`,
      {
        boxLeftPx: leftPx,
        boxWidthPx: contentW,
        yCenterOrTopPx: y,
        baseline: 'top',
        baseFontPx: Math.round(12 * PT_TO_PX),
        fontStack,
        isRtl,
        align: 'center',
        bold: true,
        scalePx: MM_TO_PX,
      }
    );
    y += 7 * MM_TO_PX;

    const countStr = isRtl ? `${toEasternArabicDigits(questions.length)} سؤالاً` : `${questions.length} Soal`;
    const rows: [string, string, string, string][] = isRtl
      ? [
          ['المادة الدراسية', identity.subjectFormalName, 'اليوم والتاريخ', identity.examDate],
          ['الفصل / الفصل الدراسي', `${identity.className} / ${identity.semester}`, 'الزمن / المدة', identity.duration],
          ['اسم المدرس', identity.teacherName, 'عدد الأسئلة', countStr],
          ...(identity.includeStudentFields
            ? [['اسم الطالب', '................................', 'رقم الجلوس', '.....................'] as [string, string, string, string]]
            : []),
        ]
      : [
          ['Mata Pelajaran', identity.subjectFormalName, 'Hari / Tanggal', identity.examDate],
          ['Kelas / Semester', `${identity.className} / ${identity.semester}`, 'Alokasi Waktu', identity.duration],
          ['Guru Pengampu', identity.teacherName, 'Jumlah Soal', countStr],
          ...(identity.includeStudentFields
            ? [['Nama Peserta', '................................', 'Nomor Peserta', '.....................'] as [string, string, string, string]]
            : []),
        ];

    const rowH = 7.2 * MM_TO_PX;
    const halfW = contentW / 2;
    const stdTblPx = Math.round(9.5 * PT_TO_PX);

    rows.forEach((r) => {
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 0.25 * MM_TO_PX;
      ctx.strokeRect(leftPx, y, contentW, rowH);
      ctx.beginPath();
      ctx.moveTo(leftPx + halfW, y);
      ctx.lineTo(leftPx + halfW, y + rowH);
      ctx.stroke();

      const midY = y + rowH / 2;
      if (isRtl) {
        drawRichSingleLineInBox(ctx, r[0], {
          boxLeftPx: rightEdge - halfW * 0.36,
          boxWidthPx: halfW * 0.34,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: true,
          align: 'right',
          bold: true,
          scalePx: MM_TO_PX,
        });
        drawRichSingleLineInBox(ctx, `: ${r[1]}`, {
          boxLeftPx: rightEdge - halfW + 2 * MM_TO_PX,
          boxWidthPx: halfW * 0.58,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: true,
          align: 'right',
          scalePx: MM_TO_PX,
        });
        drawRichSingleLineInBox(ctx, r[2], {
          boxLeftPx: rightEdge - halfW - halfW * 0.36,
          boxWidthPx: halfW * 0.34,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: true,
          align: 'right',
          bold: true,
          scalePx: MM_TO_PX,
        });
        drawRichSingleLineInBox(ctx, `: ${r[3]}`, {
          boxLeftPx: leftPx + 2 * MM_TO_PX,
          boxWidthPx: halfW * 0.58,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: true,
          align: 'right',
          scalePx: MM_TO_PX,
        });
      } else {
        drawRichSingleLineInBox(ctx, r[0], {
          boxLeftPx: leftPx + 2.5 * MM_TO_PX,
          boxWidthPx: halfW * 0.35,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: false,
          align: 'left',
          bold: true,
          scalePx: MM_TO_PX,
        });
        drawRichSingleLineInBox(ctx, `: ${r[1]}`, {
          boxLeftPx: leftPx + halfW * 0.38,
          boxWidthPx: halfW * 0.58,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: false,
          align: 'left',
          scalePx: MM_TO_PX,
        });
        drawRichSingleLineInBox(ctx, r[2], {
          boxLeftPx: leftPx + halfW + 2.5 * MM_TO_PX,
          boxWidthPx: halfW * 0.35,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: false,
          align: 'left',
          bold: true,
          scalePx: MM_TO_PX,
        });
        drawRichSingleLineInBox(ctx, `: ${r[3]}`, {
          boxLeftPx: leftPx + halfW + halfW * 0.38,
          boxWidthPx: halfW * 0.58,
          yCenterOrTopPx: midY,
          baseline: 'middle',
          baseFontPx: stdTblPx,
          fontStack,
          isRtl: false,
          align: 'left',
          scalePx: MM_TO_PX,
        });
      }
      y += rowH;
    });

    y += 4.5 * MM_TO_PX;

    if (identity.instructions.trim()) {
      const instrFontPx = Math.round(9.5 * PT_TO_PX);
      drawRichSingleLineInBox(
        ctx,
        isRtl ? 'إرشادات الامتحان:' : 'PETUNJUK PENGERJAAN:',
        {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yCenterOrTopPx: y,
          baseline: 'top',
          baseFontPx: instrFontPx,
          fontStack,
          isRtl,
          align: isRtl ? 'right' : 'left',
          bold: true,
          scalePx: MM_TO_PX,
        }
      );
      y += 5.2 * MM_TO_PX;

      const instrLines = wrapRichParagraphs(
        ctx,
        identity.instructions.trim(),
        contentW,
        instrFontPx,
        fontStack,
        isRtl
      );
      instrLines.forEach((line, lIdx) => {
        ensureSpace(5.5 * MM_TO_PX);
        drawRichLine(ctx, line, {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yPx: y,
          baseFontPx: instrFontPx,
          fontStack,
          isRtl,
          align: isRtl ? 'right' : 'left',
          isLastLineInParagraph: lIdx === instrLines.length - 1,
          scalePx: MM_TO_PX,
        });
        y += 5 * MM_TO_PX;
      });
      y += 2 * MM_TO_PX;
    }

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 0.3 * MM_TO_PX;
    ctx.beginPath();
    ctx.moveTo(leftPx, y);
    ctx.lineTo(rightEdge, y);
    ctx.stroke();
    y += 6 * MM_TO_PX;
  }

  // Questions Rendering (Rich Text + Per-Question Alignment)
  const bodyFontPx = Math.round(format.fontSize * PT_TO_PX);
  const lineH = bodyFontPx * Math.max(1.32, format.lineSpacing);
  const qSpacePx = format.questionSpacing * 0.35 * MM_TO_PX;
  const optSpacePx = format.optionSpacing * 0.35 * MM_TO_PX;
  const questionInsetPx = isKmiArabicPreset || isKmiLatinPreset ? 4.5 * MM_TO_PX : 0;
  const numColPx = 8 * MM_TO_PX;
  const optIndentPx = 8 * MM_TO_PX;

  let lastSectionTitle: string | undefined;
  questions.forEach((q, idx) => {
    const qAlign: 'left' | 'center' | 'right' | 'justify' =
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

    if (q.sectionTitle && q.sectionTitle !== lastSectionTitle) {
      if (idx > 0) y += 2.8 * MM_TO_PX;
      const secLines = wrapRichParagraphs(
        ctx,
        q.sectionTitle,
        contentW,
        bodyFontPx,
        fontStack,
        isRtl,
        { bold: true }
      );
      ensureSpace(secLines.length * lineH + lineH);
      secLines.forEach((sLine, sIdx) => {
        drawRichLine(ctx, sLine, {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yPx: y,
          baseFontPx: bodyFontPx,
          fontStack,
          isRtl,
          align: isRtl ? 'right' : 'left',
          isLastLineInParagraph: sIdx === secLines.length - 1,
          defaultColor: '#020617',
          scalePx: MM_TO_PX,
        });
        y += lineH;
      });
      y += 1 * MM_TO_PX;
      lastSectionTitle = q.sectionTitle;
    }

    const label = formatQuestionNumberLabel(
      q,
      idx,
      format.numberFormat,
      format.arabicNumeralStyle,
      isRtl
    );

    const stemBoxWidth = contentW - questionInsetPx - numColPx;
    const stemLines = wrapRichParagraphs(
      ctx,
      q.stem,
      stemBoxWidth,
      bodyFontPx,
      fontStack,
      isRtl,
      { bold: format.stemBold, italic: format.stemItalic && !isRtl }
    );

    const estH =
      (q.stimulus ? 12 * MM_TO_PX : 0) +
      Math.max(1, stemLines.length) * lineH +
      q.options.length * (lineH + optSpacePx) +
      qSpacePx;

    if (estH < maxY - topPx) {
      ensureSpace(Math.min(estH, 32 * MM_TO_PX));
    } else {
      ensureSpace(lineH * 2);
    }

    if (q.stimulus) {
      const stimLines = wrapRichParagraphs(
        ctx,
        q.stimulus,
        contentW,
        bodyFontPx,
        fontStack,
        isRtl,
        { italic: !isRtl }
      );
      stimLines.forEach((sLine, sIdx) => {
        ensureSpace(lineH);
        drawRichLine(ctx, sLine, {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yPx: y,
          baseFontPx: bodyFontPx,
          fontStack,
          isRtl,
          align: qAlign,
          isLastLineInParagraph: sIdx === stimLines.length - 1,
          defaultColor: '#1E293B',
          scalePx: MM_TO_PX,
        });
        y += lineH;
      });
      y += 2 * MM_TO_PX;
    }

    // Number + Stem
    const baseEdge = isRtl ? rightEdge - questionInsetPx : leftPx + questionInsetPx;
    ctx.save();
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    ctx.textAlign = isRtl ? 'right' : 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0F172A';
    ctx.font = `${isKmiArabicPreset || isKmiLatinPreset ? '400' : '700'} ${bodyFontPx}px ${fontStack}`;
    ctx.fillText(label, baseEdge, y);
    ctx.restore();

    const stemBoxLeft = isRtl ? leftPx : baseEdge + numColPx;
    if (stemLines.length === 0) {
      y += lineH;
    } else {
      stemLines.forEach((sLine, sIdx) => {
        ensureSpace(lineH);
        drawRichLine(ctx, sLine, {
          boxLeftPx: stemBoxLeft,
          boxWidthPx: stemBoxWidth,
          yPx: y,
          baseFontPx: bodyFontPx,
          fontStack,
          isRtl,
          align: qAlign,
          isLastLineInParagraph: sIdx === stemLines.length - 1,
          scalePx: MM_TO_PX,
        });
        y += lineH;
      });
    }

    // Options
    if (q.options.length > 0) {
      y += optSpacePx;
      const optBoxW = contentW - questionInsetPx - optIndentPx - 8 * MM_TO_PX;
      q.options.forEach((opt, oIdx) => {
        const optChar = formatOptionMarkerChar(opt.label, oIdx, format.optionLabelStyle, isRtl);
        const wrappedOpt = wrapRichParagraphs(ctx, opt.text, optBoxW, bodyFontPx, fontStack, isRtl);
        ensureSpace(Math.max(1, wrappedOpt.length) * lineH + optSpacePx);

        const optX = isRtl ? baseEdge - optIndentPx : baseEdge + optIndentPx;
        ctx.save();
        ctx.direction = isRtl ? 'rtl' : 'ltr';
        ctx.textAlign = isRtl ? 'right' : 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#0F172A';
        ctx.font = `700 ${bodyFontPx}px ${fontStack}`;
        ctx.fillText(`${optChar}.`, optX, y);
        ctx.restore();

        const optBoxLeft = isRtl ? leftPx : optX + 7 * MM_TO_PX;
        wrappedOpt.forEach((oLine, oLineIdx) => {
          drawRichLine(ctx, oLine, {
            boxLeftPx: optBoxLeft,
            boxWidthPx: optBoxW,
            yPx: y,
            baseFontPx: bodyFontPx,
            fontStack,
            isRtl,
            align: qAlign,
            isLastLineInParagraph: oLineIdx === wrappedOpt.length - 1,
            scalePx: MM_TO_PX,
          });
          y += lineH;
        });
        y += optSpacePx;
      });
    }

    // Subquestions
    if (q.subquestions && q.subquestions.length > 0) {
      const subBoxW = contentW - questionInsetPx - optIndentPx;
      const subBoxLeft = isRtl ? leftPx : baseEdge + optIndentPx;
      q.subquestions.forEach((sub) => {
        const wrappedSub = wrapRichParagraphs(ctx, sub, subBoxW, bodyFontPx, fontStack, isRtl);
        ensureSpace(Math.max(1, wrappedSub.length) * lineH);
        wrappedSub.forEach((subLine, slIdx) => {
          drawRichLine(ctx, subLine, {
            boxLeftPx: subBoxLeft,
            boxWidthPx: subBoxW,
            yPx: y,
            baseFontPx: bodyFontPx,
            fontStack,
            isRtl,
            align: qAlign,
            isLastLineInParagraph: slIdx === wrappedSub.length - 1,
            scalePx: MM_TO_PX,
          });
          y += lineH;
        });
      });
    }

    y += qSpacePx;
  });

  // Footer
  const totalPages = pages.length;
  pages.forEach((pgCanvas, idx) => {
    const pCtx = pgCanvas.getContext('2d')!;
    pCtx.direction = isRtl ? 'rtl' : 'ltr';
    if (isKmiArabicPreset || isKmiLatinPreset) {
      const closing =
        identity.closingText !== undefined
          ? identity.closingText
          : isKmiArabicPreset
          ? '--مع أطيب تمنياتنا بالتوفيق و النجاح--'
          : '';
      if (closing.trim() && idx === totalPages - 1) {
        drawRichSingleLineInBox(pCtx, closing, {
          boxLeftPx: leftPx,
          boxWidthPx: contentW,
          yCenterOrTopPx: pxH - Math.max(14, format.marginBottom) * MM_TO_PX,
          baseline: 'top',
          baseFontPx: Math.round(12 * PT_TO_PX),
          fontStack,
          isRtl,
          align: 'center',
          bold: true,
          scalePx: MM_TO_PX,
        });
      }
      if (totalPages > 1) {
        pCtx.font = `400 ${Math.round(8.5 * PT_TO_PX)}px ${fontStack}`;
        pCtx.fillStyle = '#64748B';
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'bottom';
        pCtx.fillText(
          isRtl
            ? `الصفحة ${toEasternArabicDigits(idx + 1)} من ${toEasternArabicDigits(totalPages)}`
            : `Page ${idx + 1} of ${totalPages}`,
          pxW / 2,
          pxH - Math.max(6, format.marginBottom - 7) * MM_TO_PX
        );
      }
    } else {
      pCtx.font = `400 ${Math.round(8.5 * PT_TO_PX)}px ${fontStack}`;
      pCtx.fillStyle = '#64748B';
      pCtx.textAlign = isRtl ? 'left' : 'right';
      pCtx.textBaseline = 'bottom';
      const subLabel = stripRichHtml(identity.subjectFormalName || '').trim();
      const footerText = isRtl
        ? `${subLabel ? `${subLabel} · ` : ''}الصفحة ${toEasternArabicDigits(idx + 1)} من ${toEasternArabicDigits(totalPages)}`
        : `${subLabel ? `${subLabel} · ` : ''}Halaman ${idx + 1} dari ${totalPages}`;
      pCtx.fillText(
        footerText,
        isRtl ? leftPx : rightEdge,
        pxH - Math.max(8, format.marginBottom - 6) * MM_TO_PX
      );
    }
  });

  // Assemble into crisp multi-page PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
  });

  pages.forEach((pgCanvas, idx) => {
    if (idx > 0) pdf.addPage([pageW, pageH]);
    const imgData = pgCanvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
  });

  const rawSub = stripRichHtml(identity.subjectCode || identity.subjectFormalName || 'Ujian').trim();
  const safeSubject = rawSub.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Dokumen';
  const rawClass = stripRichHtml(identity.className || 'Kelas').trim();
  const safeClass = rawClass.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Kelas';
  pdf.save(`Soal_${safeSubject}_${safeClass}.pdf`);
}

export async function exportDocumentToPdf(params: {
  template: TemplateDocument;
  identity: ExamIdentity;
  format: FormatConfig;
  questions: ParsedQuestion[];
  logoDataUrl?: string;
}): Promise<void> {
  await exportUnifiedCanvasPdf(params);
}
