import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      ...headers,
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

function decodeXmlEntities(str = '') {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function extractXmlTag(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

/**
 * Fetch and parse the Naver Blog RSS feed.
 * Provides blog title, description, exact RFC2822 pubDates, categories, excerpts, and tags.
 */
export async function fetchRssFeed(blogId) {
  const url = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
  const xml = await fetchText(url);

  const channelMatch = xml.match(/<channel>([\s\S]*?)<item>/i);
  const channelHeader = channelMatch ? channelMatch[1] : xml;

  const profile = {
    title: extractXmlTag(channelHeader, 'title'),
    description: extractXmlTag(channelHeader, 'description'),
    link: `https://blog.naver.com/${blogId}`,
    pubDate: extractXmlTag(channelHeader, 'pubDate'),
  };

  // Auto-extract phone & email from blog description if present
  const phoneMatch = profile.description.match(/0\d{1,2}-\d{3,4}-\d{4}/);
  const emailMatch = profile.description.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (phoneMatch) profile.phone = phoneMatch[0];
  if (emailMatch) profile.email = emailMatch[0];

  const items = new Map();
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[1];
    const guid = extractXmlTag(block, 'guid') || extractXmlTag(block, 'link');
    const logNoMatch = guid.match(/\/(\d+)(?:\?|$)/);
    if (!logNoMatch) continue;
    const logNo = logNoMatch[1];
    const tagRaw = extractXmlTag(block, 'tag');
    const tags = tagRaw
      ? tagRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    items.set(logNo, {
      logNo,
      title: extractXmlTag(block, 'title'),
      categoryName: extractXmlTag(block, 'category'),
      description: extractXmlTag(block, 'description'),
      pubDate: extractXmlTag(block, 'pubDate'),
      tags,
      url: `https://blog.naver.com/${blogId}/${logNo}`,
    });
  }

  return { profile, items };
}

/**
 * Fetch the live category tree from Naver's mobile blog API.
 */
export async function fetchCategories(blogId) {
  const url = `https://m.blog.naver.com/api/blogs/${encodeURIComponent(blogId)}/category-list`;
  const text = await fetchText(url, {
    'User-Agent': MOBILE_UA,
    Referer: `https://m.blog.naver.com/${blogId}`,
    Accept: 'application/json',
  });
  const json = JSON.parse(text);
  const list = json?.result?.mylogCategoryList ?? [];

  return list
    .filter((c) => !c.divisionLine && c.openYN !== false && !c.categoryBlocked)
    .map((c, idx) => ({
      categoryNo: String(c.categoryNo),
      name: c.categoryName,
      parentCategoryNo: c.parentCategoryNo ? String(c.parentCategoryNo) : null,
      postCount: Number(c.postCnt || 0),
      order: idx,
    }));
}

/**
 * Fetch ALL post headers using PostTitleListAsync pagination.
 * Handles Naver's non-standard \' escaping inside JSON strings.
 */
export async function fetchAllPostHeaders(blogId, countPerPage = 30, delayMs = 200) {
  const allPosts = [];
  let page = 1;
  let totalCount = Infinity;

  while (allPosts.length < totalCount) {
    const url =
      `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}` +
      `&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=&countPerPage=${countPerPage}`;

    const raw = await fetchText(url, {
      Referer: `https://blog.naver.com/PostList.naver?blogId=${blogId}`,
    });
    // Fix Naver's invalid JSON escape \'
    const sanitizedJson = raw.replace(/\\'/g, "'");
    const data = JSON.parse(sanitizedJson);

    totalCount = Number(data.totalCount || 0);
    const list = data.postList || [];
    if (list.length === 0) break;

    for (const p of list) {
      let decodedTitle = p.title || '';
      try {
        decodedTitle = decodeURIComponent(decodedTitle.replace(/\+/g, ' '));
      } catch {
        decodedTitle = decodedTitle.replace(/\+/g, ' ');
      }
      allPosts.push({
        logNo: String(p.logNo),
        title: decodedTitle.trim(),
        categoryNo: String(p.categoryNo || ''),
        parentCategoryNo: String(p.parentCategoryNo || ''),
        addDateRaw: (p.addDate || '').trim(),
        commentCount: Number(p.commentCount || 0),
      });
    }

    if (list.length < countPerPage) break;
    page += 1;
    if (delayMs > 0) await sleep(delayMs);
  }

  return allPosts;
}

/**
 * Fetch the full HTML of a single Naver blog post.
 * Prefers mobile view (clean SmartEditor ONE markup), falls back to desktop PostView.
 */
export async function fetchPostHtml(blogId, logNo) {
  const mobileUrl = `https://m.blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(logNo)}`;
  try {
    const html = await fetchText(mobileUrl, {
      'User-Agent': MOBILE_UA,
      Referer: `https://m.blog.naver.com/${blogId}`,
    });
    if (html.includes('se-main-container') || html.includes('postViewArea') || html.includes('__se_module_data')) {
      return html;
    }
  } catch {
    // Fallback below
  }

  const desktopUrl = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}`;
  return fetchText(desktopUrl, {
    'User-Agent': DESKTOP_UA,
    Referer: `https://blog.naver.com/${blogId}`,
  });
}

/**
 * Download an image from Naver's CDN (with Referer header to avoid 403)
 * and cache it locally under mediaDir/<logNo>/<hash>.<ext>.
 */
export async function downloadPostImage(imageUrl, mediaDir, logNo) {
  const normalizedUrl = upgradeNaverImageUrl(imageUrl);
  const hash = crypto.createHash('sha1').update(normalizedUrl).digest('hex').slice(0, 12);

  let ext = '.jpg';
  try {
    const parsed = new URL(normalizedUrl);
    const urlExt = path.extname(parsed.pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(urlExt)) {
      ext = urlExt === '.jpeg' ? '.jpg' : urlExt;
    }
  } catch {
    // keep default .jpg
  }

  const postMediaDir = path.join(mediaDir, String(logNo));
  await fs.mkdir(postMediaDir, { recursive: true });
  const fileName = `${hash}${ext}`;
  const filePath = path.join(postMediaDir, fileName);
  const relativePath = `assets/media/${logNo}/${fileName}`;

  try {
    await fs.access(filePath);
    return { localPath: relativePath, downloaded: false };
  } catch {
    // Need to download
  }

  const res = await fetch(normalizedUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      Referer: 'https://m.blog.naver.com/',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Image HTTP ${res.status}: ${normalizedUrl}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return { localPath: relativePath, downloaded: true };
}

export function upgradeNaverImageUrl(url) {
  if (!url) return '';
  let clean = url.trim().replace(/&amp;/g, '&');
  if (clean.startsWith('//')) clean = `https:${clean}`;
  // Upgrade blurred lazy-load thumbnails (?type=w80_blur) to crisp w966
  clean = clean.replace(/([?&])type=w\d+_blur/i, '$1type=w966');
  return clean;
}
