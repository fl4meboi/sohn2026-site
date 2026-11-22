import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  fetchRssFeed,
  fetchCategories,
  fetchAllPostHeaders,
  fetchPostHtml,
  downloadPostImage,
  sleep,
} from './lib/naver-client.mjs';
import { parseNaverPostHtml, parseNaverDate } from './lib/html-parser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const BLOG_DATA_PATH = path.join(DATA_DIR, 'blog-data.json');
const SYNC_STATE_PATH = path.join(DATA_DIR, 'sync-state.json');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function runSync(options = {}) {
  const { force = false, quiet = false } = options;
  const log = (...args) => {
    if (!quiet) console.log('[sync]', ...args);
  };

  const config = await readJsonSafe(CONFIG_PATH, null);
  if (!config) throw new Error('Missing config.json');

  const { blogId, sync: syncCfg = {} } = config;
  const delayMs = syncCfg.requestDelayMs ?? 250;
  const maxPostsPerPage = syncCfg.maxPostsPerPage ?? 30;
  const shouldDownloadImages = syncCfg.downloadImages !== false;

  const prevData = await readJsonSafe(BLOG_DATA_PATH, null);
  const prevState = await readJsonSafe(SYNC_STATE_PATH, {
    lastSyncAt: null,
    lastChangeAt: null,
    postHashes: {},
    history: [],
  });

  const prevPostsByLogNo = new Map((prevData?.posts || []).map((p) => [String(p.logNo), p]));
  const startedAt = new Date().toISOString();

  log(`Starting sync for Naver blog "${blogId}"...`);

  // 1. Fetch RSS, Categories, and full Post list in parallel
  const [rssRes, categoriesRes, headersRes] = await Promise.allSettled([
    fetchRssFeed(blogId),
    fetchCategories(blogId),
    fetchAllPostHeaders(blogId, maxPostsPerPage, delayMs),
  ]);

  if (rssRes.status === 'rejected' && headersRes.status === 'rejected') {
    throw new Error(
      `Unable to reach Naver Blog (${rssRes.reason?.message}; ${headersRes.reason?.message})`
    );
  }

  const rss = rssRes.status === 'fulfilled' ? rssRes.value : { profile: {}, items: new Map() };
  const liveCategories =
    categoriesRes.status === 'fulfilled' && categoriesRes.value.length > 0
      ? categoriesRes.value
      : prevData?.categories || [];

  const categoryByNo = new Map(liveCategories.map((c) => [String(c.categoryNo), c]));

  // Merge post headers from PostTitleListAsync and RSS (in case one endpoint has extras)
  const headerMap = new Map();
  if (headersRes.status === 'fulfilled') {
    for (const h of headersRes.value) {
      headerMap.set(h.logNo, h);
    }
  }
  for (const [logNo, rssItem] of rss.items.entries()) {
    if (!headerMap.has(logNo)) {
      headerMap.set(logNo, {
        logNo,
        title: rssItem.title,
        categoryNo: '',
        parentCategoryNo: '',
        addDateRaw: '',
        commentCount: 0,
      });
    }
  }

  const orderedHeaders = Array.from(headerMap.values());
  log(`Discovered ${orderedHeaders.length} posts and ${liveCategories.length} categories.`);

  // 2. Fetch full HTML for each post to detect content edits as well as new posts
  const syncedPosts = [];
  const added = [];
  const updated = [];
  let unchangedCount = 0;

  for (const header of orderedHeaders) {
    const rssItem = rss.items.get(header.logNo);
    const prevPost = prevPostsByLogNo.get(header.logNo);

    let rawHtml = '';
    try {
      rawHtml = await fetchPostHtml(blogId, header.logNo);
    } catch (err) {
      log(`  Warning: failed to fetch full HTML for ${header.logNo}: ${err.message}`);
    }

    const parsed = parseNaverPostHtml(rawHtml, rssItem?.description || prevPost?.excerpt || '');

    // Download images locally so Naver hotlink protection never breaks the site
    let finalHtml = parsed.contentHtml;
    const localImages = [];
    if (shouldDownloadImages && parsed.images.length > 0) {
      for (const imgUrl of parsed.images) {
        try {
          const { localPath } = await downloadPostImage(imgUrl, MEDIA_DIR, header.logNo);
          finalHtml = finalHtml.split(imgUrl).join(`/${localPath}`);
          localImages.push(`/${localPath}`);
        } catch (err) {
          log(`  Image cache skipped (${header.logNo}): ${err.message}`);
          localImages.push(imgUrl);
        }
      }
    } else {
      localImages.push(...parsed.images);
    }

    const categoryObj = categoryByNo.get(String(header.categoryNo));
    const categoryName =
      categoryObj?.name || rssItem?.categoryName || prevPost?.categoryName || '미분류';
    const categoryNo =
      header.categoryNo ||
      liveCategories.find((c) => c.name === categoryName)?.categoryNo ||
      prevPost?.categoryNo ||
      '0';

    const title = header.title || rssItem?.title || prevPost?.title || `게시글 ${header.logNo}`;
    const publishedAt = parseNaverDate(rssItem?.pubDate, header.addDateRaw || prevPost?.publishedAt);
    const tags = rssItem?.tags?.length ? rssItem.tags : prevPost?.tags || [];

    const contentHash = sha256({
      title,
      categoryNo,
      categoryName,
      contentHtml: finalHtml,
      tags,
      images: localImages,
    });

    const prevHash = prevState.postHashes?.[header.logNo] || prevPost?.contentHash;
    const isNew = !prevPost;
    const isUpdated = !isNew && (force || prevHash !== contentHash);

    if (isNew) {
      added.push({ logNo: header.logNo, title });
    } else if (isUpdated) {
      updated.push({ logNo: header.logNo, title });
    } else {
      unchangedCount += 1;
    }

    syncedPosts.push({
      logNo: header.logNo,
      title,
      categoryNo: String(categoryNo),
      categoryName,
      publishedAt,
      updatedAt: isUpdated ? startedAt : prevPost?.updatedAt || publishedAt,
      firstSyncedAt: prevPost?.firstSyncedAt || startedAt,
      url: `https://blog.naver.com/${blogId}/${header.logNo}`,
      excerpt: parsed.excerpt || rssItem?.description || prevPost?.excerpt || '',
      contentHtml: finalHtml,
      plainText: parsed.plainText,
      images: localImages,
      thumbnail: localImages[0] || null,
      toc: parsed.toc,
      tags,
      readingMinutes: parsed.readingMinutes,
      commentCount: header.commentCount || 0,
      contentHash,
      status: isNew ? 'new' : isUpdated ? 'updated' : 'synced',
    });

    if (delayMs > 0) await sleep(delayMs);
  }

  // Sort newest first
  syncedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // 3. Detect removed posts
  const currentLogNos = new Set(syncedPosts.map((p) => p.logNo));
  const removed = [];
  for (const [logNo, prevPost] of prevPostsByLogNo.entries()) {
    if (!currentLogNos.has(logNo)) {
      removed.push({ logNo, title: prevPost.title });
    }
  }

  // 4. Recompute accurate post counts per category
  const countByCat = new Map();
  for (const p of syncedPosts) {
    countByCat.set(p.categoryNo, (countByCat.get(p.categoryNo) || 0) + 1);
  }

  const finalCategories = liveCategories.map((c) => ({
    ...c,
    postCount: countByCat.get(String(c.categoryNo)) ?? c.postCount ?? 0,
  }));

  // Profile metadata (auto-updates if owner edits blog bio/contact info on Naver)
  const profile = {
    blogId,
    blogUrl: `https://blog.naver.com/${blogId}`,
    title: rss.profile?.title || config.siteTitle,
    description: rss.profile?.description || config.siteDescription,
    phone: rss.profile?.phone || config.contact.phone,
    email: rss.profile?.email || config.contact.email,
    hours: config.contact.hours,
  };

  const categoriesHash = sha256(finalCategories);
  const profileHash = sha256(profile);
  const categoriesChanged = prevState.categoriesHash !== categoriesHash;
  const profileChanged = prevState.profileHash !== profileHash;

  const hasChanges =
    force ||
    added.length > 0 ||
    updated.length > 0 ||
    removed.length > 0 ||
    categoriesChanged ||
    profileChanged;

  const nextBlogData = {
    meta: {
      blogId,
      syncedAt: startedAt,
      lastChangedAt: hasChanges ? startedAt : prevData?.meta?.lastChangedAt || startedAt,
      totalPosts: syncedPosts.length,
      totalCategories: finalCategories.length,
      syncSource: 'live',
    },
    profile,
    categories: finalCategories,
    posts: syncedPosts,
  };

  const nextHashes = {};
  for (const p of syncedPosts) {
    nextHashes[p.logNo] = p.contentHash;
  }

  const summary = {
    syncedAt: startedAt,
    hasChanges,
    totalPosts: syncedPosts.length,
    added,
    updated,
    removed,
    unchangedCount,
    categoriesChanged,
    profileChanged,
  };

  const nextHistory = [
    {
      at: startedAt,
      hasChanges,
      added: added.length,
      updated: updated.length,
      removed: removed.length,
      totalPosts: syncedPosts.length,
    },
    ...(prevState.history || []),
  ].slice(0, 50);

  const nextSyncState = {
    lastSyncAt: startedAt,
    lastChangeAt: hasChanges ? startedAt : prevState.lastChangeAt || startedAt,
    categoriesHash,
    profileHash,
    postHashes: nextHashes,
    history: nextHistory,
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(BLOG_DATA_PATH, JSON.stringify(nextBlogData, null, 2), 'utf-8');
  await fs.writeFile(SYNC_STATE_PATH, JSON.stringify(nextSyncState, null, 2), 'utf-8');

  log(
    `Sync complete: ${syncedPosts.length} posts ` +
      `(+${added.length} added, ~${updated.length} updated, -${removed.length} removed, ${unchangedCount} unchanged).`
  );

  return summary;
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  runSync({ force })
    .then((summary) => {
      if (process.env.GITHUB_OUTPUT) {
        return fs.appendFile(
          process.env.GITHUB_OUTPUT,
          `has_changes=${summary.hasChanges}\nadded=${summary.added.length}\nupdated=${summary.updated.length}\nremoved=${summary.removed.length}\n`
        );
      }
    })
    .catch((err) => {
      console.error('[sync] Error:', err.message);
      process.exitCode = 1;
    });
}
