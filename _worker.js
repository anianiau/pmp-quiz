const ORIGIN = 'https://pmp-test.jp';

const TOP_PAGE = {
  title: 'PMP問題集 - 無料模擬試験アプリ',
  description: 'PMP試験対策の無料問題集。スマホ対応・オフライン利用可。シナリオ型の練習問題でPeople・Process・Business Environmentの頻出パターンを徹底対策。',
  manifest: { name: 'PMP問題集', short_name: 'PMP問題集', description: 'Project Management Professional 試験対策アプリ' },
};

const PAGE_META = {
  '/what-is-pmp':    { lang: 'ja' },
  '/what-is-pmp-es': { lang: 'es' },
  '/what-is-pmp-zh': { lang: 'zh' },
  '/what-is-pmp-ko': { lang: 'ko' },
  '/what-is-pmp-id': { lang: 'id' },
  '/preguntas-pmp':  { lang: 'es' },
};

// hreflangグループ: 互いに翻訳関係にあるページ群
const HREFLANG_GROUPS = [
  { ja: '/what-is-pmp', es: '/what-is-pmp-es', ko: '/what-is-pmp-ko', zh: '/what-is-pmp-zh', id: '/what-is-pmp-id', 'x-default': '/what-is-pmp' },
  { ja: '/', es: '/preguntas-pmp', 'x-default': '/' },
];

function getHreflangHtml(pathname) {
  for (const group of HREFLANG_GROUPS) {
    if (Object.values(group).includes(pathname)) {
      return Object.entries(group)
        .map(([lang, path]) => `<link rel="alternate" hreflang="${lang}" href="${ORIGIN}${path}">`)
        .join('');
    }
  }
  return '';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // pmp-test.site → 301リダイレクトでpmp-test.jpに統合
    if (url.hostname === 'pmp-test.site') {
      return Response.redirect(`${ORIGIN}${url.pathname}${url.search}`, 301);
    }

    const pageInfo = PAGE_META[url.pathname] || {};
    const pageLang = pageInfo.lang || 'ja';
    const isTopPage = url.pathname === '/' || url.pathname === '/index.html';

    // manifest.json
    if (url.pathname === '/manifest.json') {
      const base = await (await env.ASSETS.fetch(request)).json();
      const patched = { ...base, ...TOP_PAGE.manifest };
      return new Response(JSON.stringify(patched, null, 2), {
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // 静的ファイル（robots.txt, sitemap.xml等）はそのまま配信
    if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
      return env.ASSETS.fetch(request);
    }

    // HTML以外はそのまま通す
    const assetRes = await env.ASSETS.fetch(request);
    const contentType = assetRes.headers.get('Content-Type') || '';
    if (!contentType.includes('text/html')) return assetRes;

    // HTMLRewriter でメタタグ・言語を書き換え
    let rewriter = new HTMLRewriter()
      .on('html', {
        element(el) { el.setAttribute('lang', pageLang); },
      });

    // トップページのみタイトル・説明を上書き
    if (isTopPage) {
      rewriter = rewriter
        .on('title', {
          element(el) { el.setInnerContent(TOP_PAGE.title); },
        })
        .on('meta[name="description"]', {
          element(el) { el.setAttribute('content', TOP_PAGE.description); },
        })
        .on('meta[property="og:title"]', {
          element(el) { el.setAttribute('content', TOP_PAGE.title); },
        })
        .on('meta[property="og:description"]', {
          element(el) { el.setAttribute('content', TOP_PAGE.description); },
        });
    }

    rewriter = rewriter
      .on('meta[property="og:url"]', {
        element(el) { el.setAttribute('content', ORIGIN + url.pathname); },
      })
      .on('meta[property="og:image"]', {
        element(el) { el.setAttribute('content', ORIGIN + '/ogp.png'); },
      })
      .on('link[rel="canonical"]', {
        element(el) { el.setAttribute('href', ORIGIN + url.pathname); },
      })
      .on('head', {
        element(el) {
          el.append(`<script>window.__DEFAULT_LANG='${pageLang}';</script>`, { html: true });
          el.append(getHreflangHtml(url.pathname), { html: true });
        },
      });

    return rewriter.transform(assetRes);
  },
};
