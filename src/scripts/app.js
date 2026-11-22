(() => {
  // Toast helper
  let toastTimer = null;
  function showToast(message) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // Mobile nav toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mainNav = document.getElementById('main-nav');
  if (menuBtn && mainNav) {
    menuBtn.addEventListener('click', () => {
      mainNav.classList.toggle('open');
    });
  }

  // Copy-to-clipboard buttons
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(value);
        showToast(`복사되었습니다: ${value}`);
      } catch {
        showToast(value);
      }
    });
  });

  // Archive search, filter & sort
  const searchInput = document.getElementById('archive-search');
  const sortSelect = document.getElementById('archive-sort');
  const filterButtons = document.querySelectorAll('[data-filter-cat]');
  const postGrid = document.getElementById('archive-post-grid');
  const countLabel = document.getElementById('archive-count');

  if (postGrid) {
    const cards = Array.from(postGrid.querySelectorAll('.post-card'));
    let activeCat = 'all';

    function applyFilter() {
      const q = (searchInput?.value || '').trim().toLowerCase();
      const sort = sortSelect?.value || 'newest';

      const matched = cards.filter((card) => {
        const cat = card.dataset.categoryNo || '';
        const text = (card.dataset.searchText || '').toLowerCase();
        const catOk = activeCat === 'all' || cat === activeCat;
        const qOk = !q || text.includes(q);
        return catOk && qOk;
      });

      matched.sort((a, b) => {
        if (sort === 'oldest') {
          return Number(a.dataset.timestamp || 0) - Number(b.dataset.timestamp || 0);
        }
        if (sort === 'title') {
          return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'ko');
        }
        return Number(b.dataset.timestamp || 0) - Number(a.dataset.timestamp || 0);
      });

      cards.forEach((c) => (c.style.display = 'none'));
      matched.forEach((c) => {
        c.style.display = '';
        postGrid.appendChild(c);
      });

      let emptyEl = document.getElementById('archive-empty-state');
      if (matched.length === 0) {
        if (!emptyEl) {
          emptyEl = document.createElement('div');
          emptyEl.id = 'archive-empty-state';
          emptyEl.className = 'empty-state';
          emptyEl.innerHTML =
            '<p style="margin:0 0 6px;font-weight:700;color:#0F172A;">조건에 맞는 게시글이 없습니다.</p><p style="margin:0;font-size:13.5px;">다른 검색어나 카테고리를 선택해 주세요.</p>';
          postGrid.appendChild(emptyEl);
        }
      } else if (emptyEl) {
        emptyEl.remove();
      }

      if (countLabel) {
        countLabel.textContent = `총 ${matched.length}건의 자료`;
      }
    }

    searchInput?.addEventListener('input', applyFilter);
    sortSelect?.addEventListener('change', applyFilter);

    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCat = btn.getAttribute('data-filter-cat') || 'all';
        filterButtons.forEach((b) => b.classList.toggle('active', b === btn));
        applyFilter();
      });
    });

    // Keyboard shortcut '/' focuses search
    document.addEventListener('keydown', (e) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInput?.focus();
      }
    });
  }

  // Interactive consultation inquiry helper
  const inquiryForm = document.getElementById('inquiry-form');
  if (inquiryForm) {
    const emailTarget = inquiryForm.dataset.email || 'sohn2026@naver.com';

    function buildInquiryText() {
      const company = document.getElementById('inq-company')?.value.trim() || '(미입력)';
      const contact = document.getElementById('inq-contact')?.value.trim() || '(미입력)';
      const topic = document.getElementById('inq-topic')?.value || '정책자금 상담';
      const amount = document.getElementById('inq-amount')?.value.trim() || '협의 희망';
      const detail = document.getElementById('inq-detail')?.value.trim() || '';

      return [
        `[정책자금·금융 컨설팅 상담 요청]`,
        `- 기업명/성함: ${company}`,
        `- 연락처: ${contact}`,
        `- 상담 분야: ${topic}`,
        `- 희망 자금 규모: ${amount}`,
        `- 문의 내용:`,
        detail || '(상세 내용 상담 시 안내)',
      ].join('\n');
    }

    inquiryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const company = document.getElementById('inq-company')?.value.trim() || '기업';
      const topic = document.getElementById('inq-topic')?.value || '정책자금 상담';
      const subject = encodeURIComponent(`[상담신청] ${topic} - ${company}`);
      const body = encodeURIComponent(buildInquiryText());
      window.location.href = `mailto:${emailTarget}?subject=${subject}&body=${body}`;
      showToast('이메일 작성 창을 열었습니다.');
    });

    const copyInquiryBtn = document.getElementById('copy-inquiry-btn');
    copyInquiryBtn?.addEventListener('click', async () => {
      const text = buildInquiryText();
      try {
        await navigator.clipboard.writeText(text);
        showToast('상담 요청 내용이 복사되었습니다. 문자나 메일로 붙여넣어 주세요.');
      } catch {
        showToast('복사에 실패했습니다.');
      }
    });
  }

  // Lightbox for article images
  const lightboxImages = document.querySelectorAll('img[data-lightbox="true"]');
  if (lightboxImages.length > 0) {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = '<img alt="확대 이미지" />';
    document.body.appendChild(lightbox);
    const lbImg = lightbox.querySelector('img');

    lightboxImages.forEach((img) => {
      img.addEventListener('click', () => {
        lbImg.src = img.src;
        lightbox.classList.add('open');
      });
    });

    lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') lightbox.classList.remove('open');
    });
  }

  // Table of Contents scroll spy
  const tocLinks = Array.from(document.querySelectorAll('.toc-list a'));
  if (tocLinks.length > 0) {
    const headings = tocLinks
      .map((a) => document.getElementById(a.getAttribute('href')?.slice(1) || ''))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            tocLinks.forEach((a) =>
              a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`)
            );
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    headings.forEach((h) => observer.observe(h));
  }

  // Live Sync button (active when served by local Node server)
  const syncBtn = document.getElementById('trigger-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      const origText = syncBtn.textContent;
      syncBtn.disabled = true;
      syncBtn.textContent = '동기화 중...';
      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        if (!res.ok) throw new Error('정적 호스팅 모드에서는 GitHub Actions가 자동 동기화합니다.');
        const data = await res.json();
        if (data.hasChanges) {
          showToast(
            `동기화 완료! 신규 ${data.added.length}건, 수정 ${data.updated.length}건. 페이지를 새로고침합니다.`
          );
          setTimeout(() => window.location.reload(), 1200);
        } else {
          showToast('최신 상태입니다. 변경된 게시글이 없습니다.');
        }
      } catch (err) {
        showToast(err.message);
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = origText;
      }
    });
  }
})();
