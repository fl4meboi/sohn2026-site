import { upgradeNaverImageUrl } from './naver-client.mjs';

/**
 * Decode common HTML entities into plain text.
 */
export function decodeHtmlEntities(str = '') {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function stripHtml(html = '') {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract the main SmartEditor ONE (.se-main-container) or legacy (#postViewArea) HTML block
 * using balanced <div> tag counting so nested containers are never truncated.
 */
function extractBalancedContainer(html, markerRegex) {
  const match = markerRegex.exec(html);
  if (!match) return null;

  const startIdx = match.index;
  const openTagEnd = html.indexOf('>', startIdx);
  if (openTagEnd === -1) return null;

  let depth = 1;
  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = openTagEnd + 1;

  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(openTagEnd + 1, m.index);
      }
    } else if (!m[0].endsWith('/>')) {
      depth += 1;
    }
  }
  return null;
}

/**
 * Parse a Naver Blog post HTML page into clean semantic HTML, plain text,
 * image list, reading time, and auto-generated Table of Contents (TOC).
 */
export function parseNaverPostHtml(fullHtml, fallbackDescription = '') {
  let bodyHtml =
    extractBalancedContainer(fullHtml, /<div\b[^>]*class="[^"]*\bse-main-container\b[^"]*"[^>]*>/i) ||
    extractBalancedContainer(fullHtml, /<div\b[^>]*id="postViewArea"[^>]*>/i) ||
    extractBalancedContainer(fullHtml, /<div\b[^>]*class="[^"]*\bpost_ct\b[^"]*"[^>]*>/i);

  if (!bodyHtml) {
    const safeFallback = fallbackDescription
      ? `<p>${escapeHtml(fallbackDescription).replace(/\n/g, '<br>')}</p>`
      : '<p>네이버 블로그 원문에서 내용을 확인해 주세요.</p>';
    return {
      contentHtml: safeFallback,
      plainText: fallbackDescription || '',
      excerpt: makeExcerpt(fallbackDescription || ''),
      images: [],
      toc: [],
      readingMinutes: 1,
    };
  }

  // 1. Remove scripts, styles, hidden inputs, Naver UI buttons/overlays, oglink scripts
  bodyHtml = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<button\b[\s\S]*?<\/button>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '');

  // 2. Collect and normalize images (handling data-lazy-src and w80_blur)
  const images = [];
  bodyHtml = bodyHtml.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const lazyMatch = imgTag.match(/data-lazy-src="([^"]+)"/i);
    const srcMatch = imgTag.match(/\bsrc="([^"]+)"/i);
    const altMatch = imgTag.match(/\balt="([^"]*)"/i);
    const rawUrl = (lazyMatch && lazyMatch[1]) || (srcMatch && srcMatch[1]) || '';
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.includes('ssl.pstatic.net/static/blog/')) {
      return '';
    }
    const upgraded = upgradeNaverImageUrl(rawUrl);
    if (!images.includes(upgraded)) {
      images.push(upgraded);
    }
    const alt = altMatch ? altMatch[1] : '본문 이미지';
    return `<figure class="article-figure"><img src="${upgraded}" alt="${escapeAttr(alt)}" loading="lazy" data-lightbox="true" /></figure>`;
  });

  // 3. Clean Naver SmartEditor wrapper clutter while keeping semantic structure & tables
  bodyHtml = bodyHtml
    // Remove inline event handlers and noisy SmartEditor inline styles/classes
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+data-[a-z0-9_-]+\s*=\s*"[^"]*"/gi, (m) =>
      m.includes('data-lightbox') ? m : ''
    )
    // Convert SmartEditor quotation blocks into semantic blockquotes
    .replace(
      /<div\b[^>]*class="[^"]*se-component\s+se-quotation[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
      '<blockquote class="article-quote">$1</blockquote>'
    )
    // Convert SmartEditor horizontal line into <hr>
    .replace(/<div\b[^>]*class="[^"]*se-horizontalLine[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '<hr class="article-divider" />')
    // Wrap tables in responsive container
    .replace(/<table\b[^>]*>/gi, '<div class="table-scroll"><table class="article-table">')
    .replace(/<\/table>/gi, '</table></div>')
    // Strip noisy style attributes except text-align and color-safe basics? Better: strip all inline styles so our typography stays crisp & consistent
    .replace(/\s+style="[^"]*"/gi, '')
    .replace(/\s+id="SE-[^"]*"/gi, '')
    // Preserve only our own classes
    .replace(/\s+class="([^"]*)"/gi, (_, cls) => {
      const allowed = cls
        .split(/\s+/)
        .filter((c) =>
          [
            'article-figure',
            'article-quote',
            'article-divider',
            'table-scroll',
            'article-table',
            'se-text-paragraph',
            'se-section-title',
          ].includes(c)
        );
      return allowed.length ? ` class="${allowed.join(' ')}"` : '';
    })
    // Ensure external links open safely in new tab
    .replace(/<a\b([^>]*href="https?:\/\/[^"]*"[^>]*)>/gi, (m, attrs) => {
      if (/target=/i.test(attrs)) return m;
      return `<a${attrs} target="_blank" rel="noopener noreferrer">`;
    })
    // Remove empty spans and empty paragraphs
    .replace(/<span\s*>(\s*)<\/span>/gi, '$1')
    .replace(/<p[^>]*>\s*(?:&nbsp;|\u200B|<br\s*\/?>|\s)*<\/p>/gi, '');

  // 4. Promote numbered section headings (e.g., "1. 지원대상", "2. 대출기간", "■ ...", "가. ...") into <h3> with anchor IDs for TOC
  const toc = [];
  let headingCounter = 0;
  bodyHtml = bodyHtml.replace(
    /<p\b[^>]*>([\s\S]*?)<\/p>/gi,
    (full, inner) => {
      const text = stripHtml(inner).trim();
      if (!text) return '';
      const isSectionHeading =
        text.length >= 2 &&
        text.length <= 65 &&
        (/^(?:\d+\.\s+|제\d+조|[①②③④⑤⑥⑦⑧⑨⑩]\s*|[■□▶▷◆◇●○★☆]\s*)/.test(text) ||
          /<(strong|b)\b[^>]*>[\s\S]*?<\/\1>/i.test(inner) && text.length <= 40 && !text.endsWith('.'));

      if (isSectionHeading) {
        headingCounter += 1;
        const id = `sec-${headingCounter}`;
        toc.push({ id, text });
        return `<h3 id="${id}" class="article-heading">${text}</h3>`;
      }
      return `<p>${inner}</p>`;
    }
  );

  // Extract plain text & excerpt
  const plainText = stripHtml(bodyHtml);
  const excerpt = makeExcerpt(plainText || fallbackDescription);
  const charCount = plainText.replace(/\s+/g, '').length;
  const readingMinutes = Math.max(1, Math.round(charCount / 450));

  // Extract date from post if available
  const dateMatch = fullHtml.match(/class="se_publishDate[^"]*"[^>]*>([^<]+)</i);
  const publishDateText = dateMatch ? dateMatch[1].trim() : '';

  return {
    contentHtml: bodyHtml.trim(),
    plainText,
    excerpt,
    images,
    toc,
    readingMinutes,
    publishDateText,
  };
}

export function makeExcerpt(text = '', maxLen = 180) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen).trim()}…`;
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(str = '') {
  return escapeHtml(str);
}

/**
 * Parse Korean/Naver date strings like "2026. 7. 7." or RFC2822 RSS dates into ISO strings.
 */
export function parseNaverDate(rssPubDate, addDateRaw) {
  if (rssPubDate) {
    const d = new Date(rssPubDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  if (addDateRaw) {
    const m = addDateRaw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (m) {
      const [, y, mo, da] = m;
      const d = new Date(`${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}T09:00:00+09:00`);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return new Date().toISOString();
}
