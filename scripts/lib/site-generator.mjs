import fs from 'node:fs/promises';
import path from 'node:path';
import { escapeHtml, escapeAttr } from './html-parser.mjs';

const ICONS = {
  building:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>',
  factory:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>',
  briefcase:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  award:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
  'trending-up':
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  newspaper:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8Z"/></svg>',
  phone:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  folder:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
};

function formatDateKo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function formatDateTimeKo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderLayout({ title, description, activeNav, prefix, data, bodyHtml }) {
  const { profile, categories, meta } = data;
  const pageTitle = title ? `${title} | ${profile.title}` : profile.title;
  const metaDesc = description || profile.description.replace(/\n+/g, ' ').slice(0, 160);

  const navItems = [
    { id: 'home', label: '홈', href: `${prefix}index.html` },
    { id: 'about', label: '연구소 소개', href: `${prefix}about.html` },
    { id: 'archive', label: '정책자금 자료실', href: `${prefix}index.html#archive` },
    { id: 'consulting', label: '상담신청', href: `${prefix}consulting.html` },
  ];

  const footerCategoryLinks = categories
    .map(
      (c) =>
        `<li><a href="${prefix}category/${escapeAttr(c.categoryNo)}.html">${escapeHtml(c.name)} (${c.postCount})</a></li>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(metaDesc)}" />
  <meta property="og:title" content="${escapeAttr(pageTitle)}" />
  <meta property="og:description" content="${escapeAttr(metaDesc)}" />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="${prefix}assets/styles/main.css" />
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${prefix}index.html">
        <span class="brand-mark">정책</span>
        <span class="brand-text">
          <span class="brand-title">${escapeHtml(profile.title)}</span>
          <span class="brand-sub">SME &amp; Venture Policy Fund Institute</span>
        </span>
      </a>

      <nav class="main-nav" id="main-nav" aria-label="주요 메뉴">
        ${navItems
          .map(
            (n) =>
              `<a href="${n.href}" class="${activeNav === n.id ? 'active' : ''}">${n.label}</a>`
          )
          .join('')}
      </nav>

      <div class="header-actions">
        <a class="btn btn-primary btn-sm" href="tel:${escapeAttr(profile.phone)}">
          ${ICONS.phone}
          <span>${escapeHtml(profile.phone)}</span>
        </a>
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="메뉴 열기">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </div>
  </header>

  <main>
    ${bodyHtml}
  </main>

  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <p class="footer-title">${escapeHtml(profile.title)}</p>
          <p style="margin:0 0 14px;font-size:13.5px;line-height:1.7;">
            중소·벤처기업 정책자금 정보와 자료 제공, 정책자금 신청 사업계획서 작성 지원, 재무·대출·투자 금융 컨설팅을 지원합니다.
          </p>
          <p style="margin:0;font-size:13.5px;color:#CBD5E1;">
            전화: <a href="tel:${escapeAttr(profile.phone)}" style="color:#fff;font-weight:600;">${escapeHtml(profile.phone)}</a> ·
            이메일: <a href="mailto:${escapeAttr(profile.email)}" style="color:#fff;font-weight:600;">${escapeHtml(profile.email)}</a>
          </p>
        </div>

        <div>
          <p class="footer-heading">카테고리</p>
          <ul class="footer-links">
            ${footerCategoryLinks}
          </ul>
        </div>

        <div>
          <p class="footer-heading">바로가기 &amp; 연동</p>
          <ul class="footer-links">
            <li><a href="${prefix}about.html">연구소 소개</a></li>
            <li><a href="${prefix}consulting.html">컨설팅 상담신청</a></li>
            <li><a href="${escapeAttr(profile.blogUrl)}" target="_blank" rel="noopener noreferrer">네이버 블로그 원문 보기 ↗</a></li>
            <li><a href="${prefix}rss.xml">RSS 피드</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} ${escapeHtml(profile.title)}. 네이버 블로그(<code>${escapeHtml(profile.blogId)}</code>) 기반 자동 연동 웹사이트.</span>
        <div class="sync-footer-controls">
          <span>최근 동기화: ${escapeHtml(formatDateTimeKo(meta.syncedAt))}</span>
          <button type="button" id="trigger-sync-btn" class="btn btn-ghost-light btn-sm">지금 동기화</button>
        </div>
      </div>
    </div>
  </footer>

  <script src="${prefix}assets/scripts/app.js"></script>
</body>
</html>`;
}

function renderPostCard(post, prefix) {
  const ts = new Date(post.publishedAt).getTime() || 0;
  const searchText = `${post.title} ${post.categoryName} ${post.excerpt} ${(post.tags || []).join(' ')} ${post.plainText || ''}`.slice(0, 600);
  const statusBadge =
    post.status === 'new'
      ? '<span class="badge badge-new">NEW</span>'
      : post.status === 'updated'
      ? '<span class="badge badge-updated">UPDATED</span>'
      : '';

  const thumbUrl = post.thumbnail
    ? post.thumbnail.startsWith('/')
      ? `${prefix}${post.thumbnail.slice(1)}`
      : post.thumbnail
    : null;

  return `<article class="post-card"
    data-category-no="${escapeAttr(post.categoryNo)}"
    data-timestamp="${ts}"
    data-title="${escapeAttr(post.title)}"
    data-search-text="${escapeAttr(searchText)}">
    ${
      thumbUrl
        ? `<a class="post-card-thumb" href="${prefix}posts/${escapeAttr(post.logNo)}.html">
            <img src="${escapeAttr(thumbUrl)}" alt="${escapeAttr(post.title)}" loading="lazy" />
          </a>`
        : ''
    }
    <div class="post-card-body">
      <div class="post-card-meta">
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="badge badge-cat">${escapeHtml(post.categoryName)}</span>
          ${statusBadge}
        </div>
        <span class="post-date">${formatDateKo(post.publishedAt)}</span>
      </div>
      <h3 class="post-card-title">
        <a href="${prefix}posts/${escapeAttr(post.logNo)}.html">${escapeHtml(post.title)}</a>
      </h3>
      <p class="post-card-excerpt">${escapeHtml(post.excerpt)}</p>
      <div class="post-card-footer">
        <span>약 ${post.readingMinutes || 1}분 소요</span>
        <a class="post-read-more" href="${prefix}posts/${escapeAttr(post.logNo)}.html">자세히 보기 →</a>
      </div>
    </div>
  </article>`;
}

function renderConsultingBlock(profile) {
  return `<div class="consulting-grid">
    <div class="contact-panel">
      <h3>정책자금·금융 컨설팅 무료 상담</h3>
      <p>
        중소·벤처기업 및 소상공인 대표님의 기업 현황에 맞는 최적의 정책자금(시설자금·운전자금·온렌딩 대출)과 사업계획서 작성, 투자·재무 전략을 친절하게 안내해 드립니다.
      </p>

      <div class="contact-item">
        <div>
          <div class="contact-item-label">직통 전화 상담</div>
          <div class="contact-item-value"><a href="tel:${escapeAttr(profile.phone)}">${escapeHtml(profile.phone)}</a></div>
        </div>
        <button type="button" class="btn btn-ghost-light btn-sm" data-copy="${escapeAttr(profile.phone)}">번호 복사</button>
      </div>

      <div class="contact-item">
        <div>
          <div class="contact-item-label">이메일 문의</div>
          <div class="contact-item-value"><a href="mailto:${escapeAttr(profile.email)}">${escapeHtml(profile.email)}</a></div>
        </div>
        <button type="button" class="btn btn-ghost-light btn-sm" data-copy="${escapeAttr(profile.email)}">메일 복사</button>
      </div>

      <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">
        ${escapeHtml(profile.hours || '언제든지 편안하게 문의해 주세요.')}
      </p>
    </div>

    <div class="inquiry-card">
      <h3>간편 상담 요청서 작성</h3>
      <p class="helper">항목을 입력하면 이메일 발송 또는 문자·카카오톡 전송용 요약문이 자동으로 생성됩니다.</p>

      <form id="inquiry-form" data-email="${escapeAttr(profile.email)}">
        <div class="form-grid">
          <div class="form-group">
            <label for="inq-company">기업명 / 성함</label>
            <input id="inq-company" class="form-control" type="text" placeholder="예: (주)한국테크 홍길동" required />
          </div>
          <div class="form-group">
            <label for="inq-contact">연락처</label>
            <input id="inq-contact" class="form-control" type="tel" placeholder="예: 010-0000-0000" required />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="inq-topic">상담 희망 분야</label>
            <select id="inq-topic" class="form-control">
              <option value="운전자금 / 온렌딩 대출">운전자금 / 온렌딩 대출</option>
              <option value="시설자금">시설자금</option>
              <option value="정책자금 사업계획서 작성 지원">정책자금 사업계획서 작성 지원</option>
              <option value="특허 / 기업인증 (벤처·이노비즈 등)">특허 / 기업인증 (벤처·이노비즈 등)</option>
              <option value="투자 유치 및 재무 컨설팅">투자 유치 및 재무 컨설팅</option>
              <option value="기타 금융 컨설팅">기타 금융 컨설팅</option>
            </select>
          </div>
          <div class="form-group">
            <label for="inq-amount">희망 자금 규모 (선택)</label>
            <input id="inq-amount" class="form-control" type="text" placeholder="예: 3억 원 내외" />
          </div>
        </div>

        <div class="form-group">
          <label for="inq-detail">문의 내용</label>
          <textarea id="inq-detail" class="form-control" rows="4" placeholder="업종, 업력, 자금 용도 등 간단한 현황을 적어 주시면 더욱 정확한 상담이 가능합니다."></textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">이메일로 상담 신청</button>
          <button type="button" id="copy-inquiry-btn" class="btn btn-outline">내용 복사 (문자/카톡용)</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderHomePage(data, config) {
  const { profile, categories, posts, meta } = data;
  const catMeta = config.categoryMeta || {};

  const categoryCardsHtml = categories
    .map((c) => {
      const m = catMeta[c.categoryNo] || {};
      const iconSvg = ICONS[m.icon] || ICONS.folder;
      const summary = m.summary || `${c.name} 관련 최신 정책자금 정보 및 안내 자료를 확인하세요.`;
      const isEmpty = c.postCount === 0;
      const href =
        c.categoryNo === '7'
          ? 'about.html'
          : c.categoryNo === '1'
          ? 'consulting.html'
          : `category/${escapeAttr(c.categoryNo)}.html`;

      return `<a class="category-card ${isEmpty ? 'is-empty' : ''}" href="${href}">
        <div class="category-card-top">
          <span class="category-icon">${iconSvg}</span>
          <span class="category-count ${isEmpty ? 'upcoming' : ''}">${isEmpty ? '준비 중' : `${c.postCount}건`}</span>
        </div>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(summary)}</p>
        <span class="category-card-link">${isEmpty ? '업데이트 예정' : '자료 살펴보기 →'}</span>
      </a>`;
    })
    .join('');

  const filterPillsHtml = [
    `<button type="button" class="filter-pill active" data-filter-cat="all">전체 (${posts.length})</button>`,
    ...categories
      .filter((c) => c.postCount > 0)
      .map(
        (c) =>
          `<button type="button" class="filter-pill" data-filter-cat="${escapeAttr(c.categoryNo)}">${escapeHtml(c.name)} (${c.postCount})</button>`
      ),
  ].join('');

  const bodyHtml = `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <div class="sync-pill">
            <span class="sync-dot"></span>
            <span>네이버 블로그 실시간 연동 · 총 ${meta.totalPosts}개 자료</span>
          </div>
          <h1>중소·벤처기업을 위한<br><span class="accent">정책자금 &amp; 금융 컨설팅</span> 허브</h1>
          <p class="hero-desc">
            한국 중소벤처기업 정책자금연구소는 시설자금·운전자금·온렌딩 대출 등 최신 정책금융 자료를 체계적으로 정리하고, 사업계획서 작성부터 재무·대출·투자 컨설팅까지 원스톱으로 지원합니다.
          </p>
          <div class="hero-actions">
            <a class="btn btn-gold" href="#archive">정책자금 자료실 보기</a>
            <a class="btn btn-ghost-light" href="consulting.html">1:1 무료 상담 신청</a>
            <a class="btn btn-ghost-light" href="${escapeAttr(profile.blogUrl)}" target="_blank" rel="noopener noreferrer">네이버 블로그 ↗</a>
          </div>
        </div>

        <aside class="hero-card">
          <p class="hero-card-title">핵심 컨설팅 영역</p>
          <ul class="hero-service-list">
            <li><span class="bullet">01</span><span><strong>정책자금 정보·자료 제공</strong> — 시설자금, 운전자금, 소상공인 자금, 산업은행 온렌딩 대출</span></li>
            <li><span class="bullet">02</span><span><strong>사업계획서 작성 지원</strong> — 심사 기준에 맞춘 정책자금 신청 전략 및 서류 고도화</span></li>
            <li><span class="bullet">03</span><span><strong>재무·대출·투자 컨설팅</strong> — 기업 신용등급 관리, 정책금융 및 민간 투자 연계</span></li>
          </ul>
          <div class="hero-contact-strip">
            <span>문의전화 <a href="tel:${escapeAttr(profile.phone)}">${escapeHtml(profile.phone)}</a></span>
            <span>이메일 <a href="mailto:${escapeAttr(profile.email)}">${escapeHtml(profile.email)}</a></span>
          </div>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <div class="section-kicker">CATEGORIES</div>
            <h2 class="section-title">분야별 정책자금 아카이브</h2>
            <p class="section-subtitle">네이버 블로그에 새 카테고리와 글이 등록되면 이 영역에 자동으로 반영됩니다.</p>
          </div>
        </div>
        <div class="category-grid">
          ${categoryCardsHtml}
        </div>
      </div>
    </section>

    <section class="section section-alt" id="archive">
      <div class="container">
        <div class="section-header">
          <div>
            <div class="section-kicker">KNOWLEDGE ARCHIVE</div>
            <h2 class="section-title">전체 정책자금 자료실</h2>
            <p class="section-subtitle">키워드 검색(단축키 <code>/</code>)과 카테고리 필터로 필요한 정책자금 정보를 빠르게 찾아보세요.</p>
          </div>
        </div>

        <div class="archive-toolbar">
          <div class="search-row">
            <div class="search-input-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="archive-search" class="search-input" type="search" placeholder="예: 온렌딩, 시설자금, 운전자금, 소상공인, 산업은행..." autocomplete="off" />
            </div>
            <select id="archive-sort" class="sort-select" aria-label="정렬 기준">
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="title">제목순</option>
            </select>
          </div>
          <div class="filter-pills">
            ${filterPillsHtml}
          </div>
        </div>

        <div class="archive-meta-row">
          <span id="archive-count">총 ${posts.length}건의 자료</span>
          <span>최근 동기화: ${escapeHtml(formatDateTimeKo(meta.syncedAt))}</span>
        </div>

        <div class="post-grid" id="archive-post-grid">
          ${posts.map((p) => renderPostCard(p, '')).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <div>
            <div class="section-kicker">CONSULTING PROCESS</div>
            <h2 class="section-title">체계적인 정책자금 컨설팅 절차</h2>
          </div>
          <a class="btn btn-outline btn-sm" href="about.html">연구소 소개 자세히 보기 →</a>
        </div>
        <div class="process-grid">
          <div class="process-card">
            <div class="process-num">STEP 01</div>
            <h3>기업 현황 진단</h3>
            <p>재무제표, 업력, 신용등급, 보유 인증 및 자금 필요 시기를 정밀하게 분석합니다.</p>
          </div>
          <div class="process-card">
            <div class="process-num">STEP 02</div>
            <h3>맞춤 자금 매칭</h3>
            <p>중진공·소진공·산업은행 온렌딩 등 가장 유리한 금리와 한도의 정책자금을 선별합니다.</p>
          </div>
          <div class="process-card">
            <div class="process-num">STEP 03</div>
            <h3>사업계획서 고도화</h3>
            <p>심사기관 평가 항목에 맞춘 논리적 사업계획서 작성 및 발표·실사 준비를 지원합니다.</p>
          </div>
          <div class="process-card">
            <div class="process-num">STEP 04</div>
            <h3>자금 실행 및 사후관리</h3>
            <p>대출 실행 이후 추가 정책자금, 기업인증, 투자 연계까지 지속적인 금융 파트너가 됩니다.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-alt" id="consulting">
      <div class="container">
        <div class="section-header">
          <div>
            <div class="section-kicker">CONTACT &amp; INQUIRY</div>
            <h2 class="section-title">컨설팅 상담신청</h2>
          </div>
        </div>
        ${renderConsultingBlock(profile)}
      </div>
    </section>
  `;

  return renderLayout({
    title: '',
    description: profile.description,
    activeNav: 'home',
    prefix: '',
    data,
    bodyHtml,
  });
}

function renderPostPage(post, index, data) {
  const { posts, profile } = data;
  const prevPost = index < posts.length - 1 ? posts[index + 1] : null;
  const nextPost = index > 0 ? posts[index - 1] : null;
  const related = posts
    .filter((p) => p.categoryNo === post.categoryNo && p.logNo !== post.logNo)
    .slice(0, 3);

  // Rewrite root-relative media paths inside contentHtml to ../assets/media/... for subpath compatibility
  const renderedContentHtml = (post.contentHtml || '').replace(
    /src="\/assets\//g,
    'src="../assets/'
  );

  const tocHtml =
    post.toc && post.toc.length > 0
      ? `<div class="sidebar-card">
          <h4>목차</h4>
          <ul class="toc-list">
            ${post.toc
              .map((item) => `<li><a href="#${escapeAttr(item.id)}">${escapeHtml(item.text)}</a></li>`)
              .join('')}
          </ul>
        </div>`
      : '';

  const relatedHtml =
    related.length > 0
      ? `<section class="section section-alt">
          <div class="container">
            <div class="section-header">
              <div>
                <div class="section-kicker">RELATED GUIDES</div>
                <h2 class="section-title">같은 분야의 다른 자료</h2>
              </div>
              <a class="btn btn-outline btn-sm" href="../category/${escapeAttr(post.categoryNo)}.html">${escapeHtml(post.categoryName)} 전체 보기 →</a>
            </div>
            <div class="post-grid">
              ${related.map((p) => renderPostCard(p, '../')).join('')}
            </div>
          </div>
        </section>`
      : '';

  const bodyHtml = `
    <div class="page-banner">
      <div class="container">
        <nav class="breadcrumb" aria-label="경로">
          <a href="../index.html">홈</a>
          <span>›</span>
          <a href="../category/${escapeAttr(post.categoryNo)}.html">${escapeHtml(post.categoryName)}</a>
          <span>›</span>
          <span>게시글</span>
        </nav>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="article-meta-bar">
          <span class="badge badge-cat">${escapeHtml(post.categoryName)}</span>
          <span>작성일: ${formatDateKo(post.publishedAt)}</span>
          ${
            post.updatedAt && post.updatedAt !== post.publishedAt
              ? `<span>최종 수정 반영: ${formatDateKo(post.updatedAt)}</span>`
              : ''
          }
          <span>예상 읽기 시간: 약 ${post.readingMinutes || 1}분</span>
        </div>
      </div>
    </div>

    <div class="container article-layout">
      <div>
        <article class="article-main">
          <div class="article-content">
            ${renderedContentHtml}
          </div>

          ${
            post.tags && post.tags.length > 0
              ? `<div class="article-tags">
                  ${post.tags.map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('')}
                </div>`
              : ''
          }

          <div class="article-source-bar">
            <span>이 글은 네이버 블로그 원문과 자동 동기화됩니다.</span>
            <a class="btn btn-outline btn-sm" href="${escapeAttr(post.url)}" target="_blank" rel="noopener noreferrer">네이버 블로그 원문 보기 ↗</a>
          </div>
        </article>

        <nav class="article-nav" aria-label="이전/다음 게시글">
          ${
            prevPost
              ? `<a class="article-nav-card" href="${escapeAttr(prevPost.logNo)}.html">
                  <span class="article-nav-label">← 이전 글</span>
                  <span class="article-nav-title">${escapeHtml(prevPost.title)}</span>
                </a>`
              : '<div></div>'
          }
          ${
            nextPost
              ? `<a class="article-nav-card" href="${escapeAttr(nextPost.logNo)}.html" style="text-align:right;">
                  <span class="article-nav-label">다음 글 →</span>
                  <span class="article-nav-title">${escapeHtml(nextPost.title)}</span>
                </a>`
              : '<div></div>'
          }
        </nav>
      </div>

      <aside class="article-sidebar">
        ${tocHtml}
        <div class="sidebar-card" style="background:var(--navy-900);color:#fff;border-color:var(--navy-900);">
          <h4 style="color:var(--gold-400);">이 자금이 궁금하신가요?</h4>
          <p style="margin:0 0 14px;font-size:13.5px;color:#CBD5E1;line-height:1.6;">
            우리 기업의 지원 자격, 예상 한도 및 사업계획서 준비 방향을 무료로 안내해 드립니다.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <a class="btn btn-gold btn-sm" href="../consulting.html">상담 신청하기</a>
            <a class="btn btn-ghost-light btn-sm" href="tel:${escapeAttr(profile.phone)}">${escapeHtml(profile.phone)}</a>
          </div>
        </div>
      </aside>
    </div>

    ${relatedHtml}
  `;

  return renderLayout({
    title: post.title,
    description: post.excerpt,
    activeNav: 'archive',
    prefix: '../',
    data,
    bodyHtml,
  });
}

function renderCategoryPage(category, data, config) {
  const catMeta = (config.categoryMeta || {})[category.categoryNo] || {};
  const catPosts = data.posts.filter((p) => String(p.categoryNo) === String(category.categoryNo));

  const bodyHtml = `
    <div class="page-banner">
      <div class="container">
        <nav class="breadcrumb">
          <a href="../index.html">홈</a>
          <span>›</span>
          <span>카테고리</span>
          <span>›</span>
          <span>${escapeHtml(category.name)}</span>
        </nav>
        <h1>${escapeHtml(category.name)}</h1>
        <p style="margin:0;color:#CBD5E1;max-width:640px;">
          ${escapeHtml(catMeta.summary || `${category.name} 관련 정책자금 안내 및 최신 자료 모음입니다.`)}
        </p>
      </div>
    </div>

    <section class="section">
      <div class="container">
        <div class="archive-meta-row">
          <span>총 ${catPosts.length}건의 자료</span>
          <a class="btn btn-outline btn-sm" href="../index.html#archive">전체 자료실로 돌아가기</a>
        </div>
        <div class="post-grid">
          ${
            catPosts.length > 0
              ? catPosts.map((p) => renderPostCard(p, '../')).join('')
              : `<div class="empty-state">
                  <p style="margin:0 0 8px;font-weight:700;color:#0F172A;">아직 등록된 자료가 없습니다.</p>
                  <p style="margin:0 0 18px;font-size:14px;">네이버 블로그 <strong>${escapeHtml(category.name)}</strong> 카테고리에 새 글이 올라오면 자동으로 표시됩니다.</p>
                  <a class="btn btn-primary btn-sm" href="../consulting.html">관련 상담 먼저 문의하기</a>
                </div>`
          }
        </div>
      </div>
    </section>
  `;

  return renderLayout({
    title: category.name,
    description: catMeta.summary || `${category.name} 정책자금 자료`,
    activeNav: 'archive',
    prefix: '../',
    data,
    bodyHtml,
  });
}

function renderAboutPage(data) {
  const { profile, posts } = data;
  const aboutPosts = posts.filter((p) => p.categoryNo === '7' || p.categoryName.includes('소개'));

  const bodyHtml = `
    <div class="page-banner">
      <div class="container">
        <nav class="breadcrumb">
          <a href="index.html">홈</a>
          <span>›</span>
          <span>연구소 소개</span>
        </nav>
        <h1>${escapeHtml(profile.title)} 소개</h1>
        <p style="margin:0;color:#CBD5E1;max-width:680px;">
          중소·벤처기업의 지속 가능한 성장을 위해 정책자금 정보 제공, 사업계획서 작성 지원, 재무·대출·투자 금융 컨설팅을 수행합니다.
        </p>
      </div>
    </div>

    <section class="section">
      <div class="container" style="max-width:860px;">
        ${
          aboutPosts.length > 0
            ? aboutPosts
                .map(
                  (p) => `<article class="article-main" style="margin-bottom:24px;">
                    <h2 style="margin:0 0 16px;color:var(--navy-900);">${escapeHtml(p.title)}</h2>
                    <div class="article-content">${(p.contentHtml || '').replace(/src="\/assets\//g, 'src="assets/')}</div>
                    <div class="article-source-bar">
                      <span>최종 동기화: ${formatDateKo(p.updatedAt || p.publishedAt)}</span>
                      <a class="btn btn-outline btn-sm" href="${escapeAttr(p.url)}" target="_blank" rel="noopener noreferrer">네이버 블로그 원문 ↗</a>
                    </div>
                  </article>`
                )
                .join('')
            : `<article class="article-main">
                <div class="article-content">
                  <p>${escapeHtml(profile.description).replace(/\n/g, '<br>')}</p>
                </div>
              </article>`
        }
      </div>
    </section>
  `;

  return renderLayout({
    title: '연구소 소개',
    description: profile.description,
    activeNav: 'about',
    prefix: '',
    data,
    bodyHtml,
  });
}

function renderConsultingPage(data) {
  const { profile, posts } = data;
  const consultingPosts = posts.filter(
    (p) => p.categoryNo === '1' || p.categoryName.includes('상담')
  );

  const bodyHtml = `
    <div class="page-banner">
      <div class="container">
        <nav class="breadcrumb">
          <a href="index.html">홈</a>
          <span>›</span>
          <span>컨설팅 상담신청</span>
        </nav>
        <h1>정책자금·금융 컨설팅 상담신청</h1>
        <p style="margin:0;color:#CBD5E1;max-width:680px;">
          정책자금 신청, 사업계획서 작성 지원, 중소기업 재무·대출·투자 컨설팅에 대해 언제든지 편안하게 문의해 주세요.
        </p>
      </div>
    </div>

    <section class="section">
      <div class="container">
        ${renderConsultingBlock(profile)}
        ${
          consultingPosts.length > 0
            ? `<div style="margin-top:36px;">
                ${consultingPosts
                  .map(
                    (p) => `<article class="article-main">
                      <h2 style="margin:0 0 16px;color:var(--navy-900);">${escapeHtml(p.title)}</h2>
                      <div class="article-content">${(p.contentHtml || '').replace(/src="\/assets\//g, 'src="assets/')}</div>
                    </article>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>
    </section>
  `;

  return renderLayout({
    title: '컨설팅 상담신청',
    description: '정책자금, 대출, 투자, 금융 컨설팅 상담신청 안내',
    activeNav: 'consulting',
    prefix: '',
    data,
    bodyHtml,
  });
}

function renderRssXml(data) {
  const { profile, posts } = data;
  const items = posts
    .slice(0, 30)
    .map(
      (p) => `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${escapeHtml(p.url)}</link>
      <guid>${escapeHtml(p.url)}</guid>
      <category><![CDATA[${p.categoryName}]]></category>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${p.excerpt}]]></description>
    </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[${profile.title}]]></title>
    <link>${escapeHtml(profile.blogUrl)}</link>
    <description><![CDATA[${profile.description}]]></description>
    <language>ko</language>
    <lastBuildDate>${new Date(data.meta.syncedAt).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

async function copyDirIfExists(srcDir, destDir) {
  try {
    await fs.access(srcDir);
  } catch {
    return;
  }
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirIfExists(src, dest);
    } else {
      await fs.copyFile(src, dest);
    }
  }
}

export async function generateSite({ rootDir, data, config }) {
  const distDir = path.join(rootDir, 'dist');
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(path.join(distDir, 'posts'), { recursive: true });
  await fs.mkdir(path.join(distDir, 'category'), { recursive: true });
  await fs.mkdir(path.join(distDir, 'assets', 'styles'), { recursive: true });
  await fs.mkdir(path.join(distDir, 'assets', 'scripts'), { recursive: true });

  // Copy static assets & cached media images
  await fs.copyFile(
    path.join(rootDir, 'src', 'styles', 'main.css'),
    path.join(distDir, 'assets', 'styles', 'main.css')
  );
  await fs.copyFile(
    path.join(rootDir, 'src', 'scripts', 'app.js'),
    path.join(distDir, 'assets', 'scripts', 'app.js')
  );
  await copyDirIfExists(
    path.join(rootDir, 'data', 'media'),
    path.join(distDir, 'assets', 'media')
  );

  // Write root pages
  await fs.writeFile(path.join(distDir, 'index.html'), renderHomePage(data, config), 'utf-8');
  await fs.writeFile(path.join(distDir, 'about.html'), renderAboutPage(data), 'utf-8');
  await fs.writeFile(path.join(distDir, 'consulting.html'), renderConsultingPage(data), 'utf-8');

  // Write category pages
  for (const cat of data.categories) {
    await fs.writeFile(
      path.join(distDir, 'category', `${cat.categoryNo}.html`),
      renderCategoryPage(cat, data, config),
      'utf-8'
    );
  }

  // Write individual post pages
  for (let i = 0; i < data.posts.length; i += 1) {
    const post = data.posts[i];
    await fs.writeFile(
      path.join(distDir, 'posts', `${post.logNo}.html`),
      renderPostPage(post, i, data),
      'utf-8'
    );
  }

  // Write RSS & JSON data for integrations
  await fs.writeFile(path.join(distDir, 'rss.xml'), renderRssXml(data), 'utf-8');
  if (config.customDomain && config.customDomain.trim()) {
    await fs.writeFile(path.join(distDir, 'CNAME'), `${config.customDomain.trim()}\n`, 'utf-8');
  }
  await fs.writeFile(
    path.join(distDir, 'blog-data.json'),
    JSON.stringify(
      {
        meta: data.meta,
        profile: data.profile,
        categories: data.categories,
        posts: data.posts.map(({ contentHtml, plainText, ...rest }) => rest),
      },
      null,
      2
    ),
    'utf-8'
  );

  return {
    distDir,
    pagesGenerated: 3 + data.categories.length + data.posts.length,
  };
}
