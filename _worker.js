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
      const text = await (await env.ASSETS.fetch(request)).text();
      return new Response(text.replace(/https:\/\/pmp-test\.(jp|site)/g, cfg.origin), {
        headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // HTMLページ以外はそのまま通す
    const assetRes = await env.ASSETS.fetch(request);
    const contentType = assetRes.headers.get('Content-Type') || '';
    if (!contentType.includes('text/html')) return assetRes;

    // HTMLRewriter でメタタグ・言語を書き換え
    return new HTMLRewriter()
      .on('html', {
        element(el) { el.setAttribute('lang', cfg.lang); },
      })
      .on('title', {
        element(el) { el.setInnerContent(cfg.title); },
      })
      .on('meta[name="description"]', {
        element(el) { el.setAttribute('content', cfg.description); },
      })
      .on('meta[property="og:title"]', {
        element(el) { el.setAttribute('content', cfg.title); },
      })
      .on('meta[property="og:description"]', {
        element(el) { el.setAttribute('content', cfg.description); },
      })
      .on('meta[property="og:url"]', {
        element(el) { el.setAttribute('content', cfg.origin + '/'); },
      })
      .on('meta[property="og:image"]', {
        element(el) { el.setAttribute('content', cfg.origin + '/ogp.png'); },
      })
      .on('link[rel="canonical"]', {
        element(el) { el.setAttribute('href', cfg.origin + '/'); },
      })
      .on('script[type="application/ld+json"]', {
        text(chunk) {
          if (chunk.lastInTextNode) {
            let json = chunk.text
              .replace(/https:\/\/pmp-test\.(jp|site)\//g, cfg.origin + '/')
              .replace(/"inLanguage"\s*:\s*"\w+"/, `"inLanguage": "${cfg.lang}"`);
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
          el.append(`<script>window.__DEFAULT_LANG='${cfg.lang}';</script>`, { html: true });
          // hreflang
          el.append(
            `<link rel="alternate" hreflang="ja" href="https://pmp-test.jp/" />` +
            `<link rel="alternate" hreflang="en" href="https://pmp-test.site/" />` +
            `<link rel="alternate" hreflang="ko" href="https://pmp-test.site/" />` +
            `<link rel="alternate" hreflang="x-default" href="https://pmp-test.site/" />`,
            { html: true }
          );
        },
      })
      .transform(assetRes);
  },
};
