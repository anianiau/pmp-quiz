const CONFIG = {
  'pmp-test.jp': {
    lang: 'ja',
    origin: 'https://pmp-test.jp',
    title: 'PMP問題集 - 無料模擬試験アプリ',
    description: 'PMP試験対策の無料問題集。スマホ対応・オフライン利用可。シナリオ型の練習問題でPeople・Process・Business Environmentの頻出パターンを徹底対策。',
    manifest: { name: 'PMP問題集', short_name: 'PMP問題集', description: 'Project Management Professional 試験対策アプリ' },
  },
  'pmp-test.site': {
    lang: 'en',
    origin: 'https://pmp-test.site',
    title: 'Free PMP Practice Questions | Exam Prep Quiz',
    description: '360+ free PMP practice questions covering all PMI exam domains. Scenario-based, mobile-friendly, works offline. No sign-up required — start studying now.',
    manifest: { name: 'PMP Quiz', short_name: 'PMP Quiz', description: 'Project Management Professional exam prep app. Free, offline-ready.' },
  },
};

const FALLBACK = CONFIG['pmp-test.jp'];

// トップページ以外のページ固有メタ情報
const PAGE_META = {
  '/what-is-pmp': {
    ja: null, // HTMLに埋め込み済み（日本語がデフォルト）
    en: { title: 'What is PMP Certification? A Complete Guide 2026 | PMP Quiz', description: 'Learn what PMP certification is, who needs it, exam structure (180 questions, 3 domains), prerequisites, and how to study. Includes free practice questions.' },
  },
  '/what-is-pmp-es': {
    ja: null,
    en: null, // HTMLに埋め込み済み
    lang: 'es',
    canonical: 'https://pmp-test.site/what-is-pmp-es',
  },
  '/what-is-pmp-zh': {
    ja: null,
    en: null, // HTMLに埋め込み済み
    lang: 'zh',
    canonical: 'https://pmp-test.site/what-is-pmp-zh',
  },
  '/what-is-pmp-ko': {
    ja: null,
    en: null, // HTMLに埋め込み済み
    lang: 'ko',
    canonical: 'https://pmp-test.site/what-is-pmp-ko',
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cfg = CONFIG[url.hostname] || FALLBACK;

    // manifest.json
    if (url.pathname === '/manifest.json') {
      const base = await (await env.ASSETS.fetch(request)).json();
      const patched = { ...base, ...cfg.manifest };
      return new Response(JSON.stringify(patched, null, 2), {
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // robots.txt
    if (url.pathname === '/robots.txt') {
      const text = await (await env.ASSETS.fetch(request)).text();
      return new Response(text.replace(/https:\/\/pmp-test\.(jp|site)/g, cfg.origin), {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // sitemap.xml
    if (url.pathname === '/sitemap.xml') {
      let text = await (await env.ASSETS.fetch(request)).text();
      // pmp-test.site固定のURL（es/zh/ko等）はpmp-test.jpのsitemapから除外
      if (cfg.lang === 'ja') {
        text = text.replace(/<url>\s*<loc>https:\/\/pmp-test\.site[^<]*<\/loc>[\s\S]*?<\/url>\s*/g, '');
      }
      text = text.replace(/https:\/\/pmp-test\.(jp|site)/g, cfg.origin);
      return new Response(text, {
        headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // HTMLページ以外はそのまま通す
    const assetRes = await env.ASSETS.fetch(request);
    const contentType = assetRes.headers.get('Content-Type') || '';
    if (!contentType.includes('text/html')) return assetRes;

    // HTMLRewriter でメタタグ・言語を書き換え
    const isTopPage = url.pathname === '/' || url.pathname === '/index.html';
    const pageInfo = PAGE_META[url.pathname] || {};
    const pageMeta = pageInfo[cfg.lang] || null;
    const overrideMeta = isTopPage ? cfg : pageMeta;
    const pageLang = pageInfo.lang || cfg.lang;
    const pageCanonical = pageInfo.canonical || (cfg.origin + url.pathname);
    let rewriter = new HTMLRewriter()
      .on('html', {
        element(el) { el.setAttribute('lang', pageLang); },
      });
    if (overrideMeta) {
      rewriter = rewriter
        .on('title', {
          element(el) { el.setInnerContent(overrideMeta.title); },
        })
        .on('meta[name="description"]', {
          element(el) { el.setAttribute('content', overrideMeta.description); },
        })
        .on('meta[property="og:title"]', {
          element(el) { el.setAttribute('content', overrideMeta.title); },
        })
        .on('meta[property="og:description"]', {
          element(el) { el.setAttribute('content', overrideMeta.description); },
        });
    }
    rewriter = rewriter
      .on('meta[property="og:url"]', {
        element(el) { el.setAttribute('content', pageCanonical); },
      })
      .on('meta[property="og:image"]', {
        element(el) { el.setAttribute('content', cfg.origin + '/ogp.png'); },
      })
      .on('link[rel="canonical"]', {
        element(el) { el.setAttribute('href', pageCanonical); },
      })
      .on('script[type="application/ld+json"]', {
        text(chunk) {
          if (chunk.lastInTextNode) {
            let json = chunk.text
              .replace(/https:\/\/pmp-test\.(jp|site)\//g, cfg.origin + '/')
              .replace(/"inLanguage"\s*:\s*"\w+"/, `"inLanguage": "${pageLang}"`);
            if (cfg.lang !== 'ja') {
              json = json
                .replace(/"name"\s*:\s*"[^"]*"/, `"name": "${cfg.title}"`)
                .replace(/"description"\s*:\s*"[^"]*"/, `"description": "${cfg.description}"`)
                .replace(/"priceCurrency"\s*:\s*"[^"]*"/, `"priceCurrency": "USD"`);
            }
            chunk.replace(json);
          } else {
            chunk.remove();
          }
        },
      })
      .on('head', {
        element(el) {
          // デフォルト言語をクライアントJSに伝える
          el.append(`<script>window.__DEFAULT_LANG='${pageLang}';</script>`, { html: true });
          // hreflang
          const p = url.pathname;
          const hreflang = pageInfo.lang
            ? `<link rel="alternate" hreflang="${pageInfo.lang}" href="https://pmp-test.site${p}" />` +
              `<link rel="alternate" hreflang="x-default" href="https://pmp-test.site${p}" />`
            : `<link rel="alternate" hreflang="ja" href="https://pmp-test.jp${p}" />` +
              `<link rel="alternate" hreflang="en" href="https://pmp-test.site${p}" />` +
              `<link rel="alternate" hreflang="x-default" href="https://pmp-test.site${p}" />`;
          el.append(hreflang, { html: true });
        },
      })
      .on('body', {
        element(el) {
          if (isTopPage && cfg.lang !== 'ja') {
            el.append(
              `<div style="background:var(--card,#fff);border-top:1px solid #e2e8f0;padding:24px;text-align:center">` +
              `<p style="font-size:0.8rem;color:#64748b;margin-bottom:12px">PMP Study Guides — Available in your language</p>` +
              `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;font-size:0.85rem">` +
              `<a href="/what-is-pmp" style="color:#2563eb;font-weight:600">📘 English Guide</a>` +
              `<a href="/what-is-pmp-es" style="color:#2563eb;font-weight:600">📗 Guía en Español</a>` +
              `<a href="/what-is-pmp-zh" style="color:#2563eb;font-weight:600">📙 中文指南</a>` +
              `<a href="/what-is-pmp-ko" style="color:#2563eb;font-weight:600">📕 한국어 가이드</a>` +
              `</div></div>`,
              { html: true }
            );
          }
        },
      });
    // pmp-test.jp → zh/ko/es ボタンを削除、pmp-test.site → ja ボタンを削除
    if (cfg.lang === 'ja') {
      rewriter = rewriter
        .on('button[data-lang="zh"]', { element(el) { el.remove(); } })
        .on('button[data-lang="ko"]', { element(el) { el.remove(); } })
        .on('button[data-lang="es"]', { element(el) { el.remove(); } });
    } else {
      rewriter = rewriter
        .on('button[data-lang="ja"]', { element(el) { el.remove(); } });
    }
    return rewriter.transform(assetRes);
  },
};
