function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function jsonLdSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getSiteBaseUrl(req) {
  return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function safeExternalUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function safeCommunityImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\/uploads\/community\/[a-zA-Z0-9._-]+$/.test(trimmed)) return trimmed;
  return safeExternalUrl(trimmed);
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getTextUnit(char) {
  if (!char) return 0;
  if (/\s/.test(char)) return 0.35;
  if (/[\u0020-\u007E]/.test(char)) return 0.58;
  return 1;
}

function wrapTextForSvg(value, maxUnits, maxLines) {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return [];

  const normalizedChars = [...text];
  const lines = [];
  let current = '';
  let currentUnits = 0;
  let consumedChars = 0;

  for (const char of normalizedChars) {
    const nextUnits = currentUnits + getTextUnit(char);
    if (current && nextUnits > maxUnits) {
      lines.push(current.trim());
      consumedChars += [...current].length;
      current = char.trimStart();
      currentUnits = [...current].reduce((sum, token) => sum + getTextUnit(token), 0);
      if (lines.length === maxLines - 1) break;
    } else {
      current += char;
      currentUnits = nextUnits;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current.trim());
    consumedChars += [...current].length;
  }

  const hasOverflow = consumedChars < normalizedChars.length;
  if (hasOverflow && lines.length) {
    lines[lines.length - 1] = truncateText(
      lines[lines.length - 1],
      Math.max(4, lines[lines.length - 1].length - 1),
    );
  }
  return lines.slice(0, maxLines);
}

function formatDurationKorean(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  if (!safeSeconds) return '기록 없음';

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${Math.max(1, minutes)}분`;
}

function renderSvgTextLines(lines, x, y, lineHeight, className) {
  return lines
    .map(
      (line, index) =>
        `<text class="${className}" x="${x}" y="${y + index * lineHeight}">${escapeXml(line)}</text>`,
    )
    .join('');
}

module.exports = {
  escapeHtml,
  escapeXml,
  jsonLdSafe,
  getSiteBaseUrl,
  safeExternalUrl,
  safeCommunityImageUrl,
  truncateText,
  getTextUnit,
  wrapTextForSvg,
  formatDurationKorean,
  renderSvgTextLines,
};
