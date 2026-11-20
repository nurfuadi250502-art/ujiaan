export interface RichTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  color?: string; // hex e.g. #DC2626
  highlight?: string; // hex e.g. #FEF08A
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#DC2626',
  blue: '#1D4ED8',
  navy: '#0F1E3D',
  green: '#15803D',
  gray: '#475569',
  grey: '#475569',
  yellow: '#FEF08A',
  amber: '#FDE68A',
};

function normalizeColor(raw: string): string | undefined {
  const c = raw.trim().toLowerCase();
  if (!c || c === 'transparent' || c === 'inherit' || c === 'initial') return undefined;
  if (NAMED_COLORS[c]) return NAMED_COLORS[c];
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toUpperCase();
  }
  const rgb = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const r = Math.min(255, Number(rgb[1])).toString(16).padStart(2, '0');
    const g = Math.min(255, Number(rgb[2])).toString(16).padStart(2, '0');
    const b = Math.min(255, Number(rgb[3])).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }
  return undefined;
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)));
}

export function encodeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Strips all HTML formatting tags (<b>, <i>, <u>, <s>, <sup>, <sub>, <span>, <br>)
 * and returns clean plain text.
 */
export function stripRichHtml(input: string): string {
  if (!input) return '';
  const withNewlines = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li)>/gi, '\n');
  const withoutTags = withNewlines.replace(/<[^>]*>/g, '');
  return decodeHtmlEntities(withoutTags).replace(/\n+$/g, '');
}

/**
 * Normalizes and sanitizes inline rich-HTML produced by contentEditable / Word paste
 * so only safe inline formatting (b, i, u, s, sup, sub, span color/background, br) remains.
 */
export function sanitizeRichHtml(html: string): string {
  if (!html) return '';

  // Remove script/style blocks completely
  let clean = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Convert block wrappers inside single-field editors into line breaks cleanly
  clean = clean
    .replace(/<(?:div|p)\b[^>]*>\s*<br\s*\/?>\s*<\/(?:div|p)>/gi, '<br>')
    .replace(/<\/(?:div|p)>\s*<(?:div|p)\b[^>]*>/gi, '<br>')
    .replace(/<\/?(?:div|p)\b[^>]*>/gi, '');

  // Canonicalize inline semantic tags
  clean = clean
    .replace(/<strong\b[^>]*>/gi, '<b>')
    .replace(/<\/strong>/gi, '</b>')
    .replace(/<em\b[^>]*>/gi, '<i>')
    .replace(/<\/em>/gi, '</i>')
    .replace(/<(?:strike|del)\b[^>]*>/gi, '<s>')
    .replace(/<\/(?:strike|del)>/gi, '</s>');

  // Convert <font color="..."> to <span style="color:...">
  clean = clean
    .replace(/<font\b([^>]*)>/gi, (_m, attrs: string) => {
      const colorMatch = attrs.match(/\bcolor=["']?([^"'\s>]+)/i);
      const color = colorMatch ? normalizeColor(colorMatch[1]) : undefined;
      return color ? `<span style="color:${color}">` : '<span>';
    })
    .replace(/<\/font>/gi, '</span>');

  // Filter allowed tags only
  clean = clean.replace(/<(\/?)([a-z0-9-]+)([^>]*)>/gi, (_full, slash: string, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (tag === 'br') return slash ? '' : '<br>';
    if (tag === 'b' || tag === 'i' || tag === 'u' || tag === 's' || tag === 'sup' || tag === 'sub') {
      return slash ? `</${tag}>` : `<${tag}>`;
    }
    if (tag === 'span') {
      if (slash) return '</span>';
      const styleParts: string[] = [];
      const styleMatch = attrs.match(/\bstyle=["']([^"']*)["']/i);
      if (styleMatch) {
        const styleStr = styleMatch[1];
        const colorM = styleStr.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        const bgM = styleStr.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/i);
        const fwM = styleStr.match(/(?:^|;)\s*font-weight\s*:\s*(bold|[6-9]00)/i);
        const fsM = styleStr.match(/(?:^|;)\s*font-style\s*:\s*italic/i);
        const tdM = styleStr.match(/(?:^|;)\s*text-decoration[^:]*:\s*([^;]+)/i);

        const normColor = colorM ? normalizeColor(colorM[1]) : undefined;
        const normBg = bgM ? normalizeColor(bgM[1]) : undefined;
        if (normColor) styleParts.push(`color:${normColor}`);
        if (normBg) styleParts.push(`background-color:${normBg}`);
        if (fwM) styleParts.push('font-weight:700');
        if (fsM) styleParts.push('font-style:italic');
        if (tdM && /underline/i.test(tdM[1])) styleParts.push('text-decoration:underline');
        if (tdM && /line-through/i.test(tdM[1])) styleParts.push('text-decoration:line-through');
      }
      return styleParts.length > 0 ? `<span style="${styleParts.join(';')}">` : '<span>';
    }
    return '';
  });

  // Clean trailing <br> from contentEditable quirks
  clean = clean.replace(/(?:<br>\s*)+$/i, '');
  // Remove empty spans/tags
  clean = clean.replace(/<span>([^<]*)<\/span>/gi, '$1');
  return clean;
}

interface StyleFrame {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  color?: string;
  highlight?: string;
}

/**
 * Parses sanitized inline HTML (or plain text) into styled RichTextSegments
 * safe for Canvas PDF rendering, DOCX TextRuns, and validation.
 */
export function parseRichTextSegments(input: string): RichTextSegment[] {
  if (!input) return [{ text: '' }];

  const normalized = sanitizeRichHtml(input).replace(/<br\s*\/?>/gi, '\n');
  const tokens = normalized.split(/(<[^>]+>)/g).filter(Boolean);

  const stack: StyleFrame[] = [{}];
  const segments: RichTextSegment[] = [];

  const pushText = (rawText: string) => {
    const text = decodeHtmlEntities(rawText);
    if (!text) return;
    const active = stack[stack.length - 1];
    const prev = segments[segments.length - 1];
    if (
      prev &&
      prev.bold === active.bold &&
      prev.italic === active.italic &&
      prev.underline === active.underline &&
      prev.strike === active.strike &&
      prev.superScript === active.superScript &&
      prev.subScript === active.subScript &&
      prev.color === active.color &&
      prev.highlight === active.highlight
    ) {
      prev.text += text;
    } else {
      segments.push({ text, ...active });
    }
  };

  for (const tok of tokens) {
    if (!tok.startsWith('<')) {
      pushText(tok);
      continue;
    }

    const closeMatch = tok.match(/^<\/([a-z0-9-]+)>$/i);
    if (closeMatch) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const openMatch = tok.match(/^<([a-z0-9-]+)([^>]*)>$/i);
    if (!openMatch) continue;

    const tag = openMatch[1].toLowerCase();
    const attrs = openMatch[2] || '';
    const parent = stack[stack.length - 1];
    const next: StyleFrame = { ...parent };

    if (tag === 'b' || tag === 'strong') next.bold = true;
    else if (tag === 'i' || tag === 'em') next.italic = true;
    else if (tag === 'u') next.underline = true;
    else if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true;
    else if (tag === 'sup') {
      next.superScript = true;
      next.subScript = false;
    } else if (tag === 'sub') {
      next.subScript = true;
      next.superScript = false;
    } else if (tag === 'span') {
      const styleM = attrs.match(/\bstyle=["']([^"']*)["']/i);
      if (styleM) {
        const s = styleM[1];
        const colorM = s.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
        const bgM = s.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/i);
        if (colorM) {
          const nc = normalizeColor(colorM[1]);
          if (nc) next.color = nc;
        }
        if (bgM) {
          const nb = normalizeColor(bgM[1]);
          if (nb) next.highlight = nb;
        }
        if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(s)) next.bold = true;
        if (/font-style\s*:\s*italic/i.test(s)) next.italic = true;
        if (/text-decoration[^:]*:[^;]*underline/i.test(s)) next.underline = true;
        if (/text-decoration[^:]*:[^;]*line-through/i.test(s)) next.strike = true;
      }
    }

    stack.push(next);
  }

  return segments.length > 0 ? segments : [{ text: '' }];
}
