/**
 * Verification harness for the WeChat → Markdown tool wrapper. Run with:
 *   npx tsx src/core/wechat/verify.ts
 *
 * Uses a small static HTML fixture to exercise the conversion without needing
 * network access or DOMParser. The fixture mimics the structure of a real
 * WeChat article so we can assert title, paragraph, and image extraction.
 */
import { convertWechatHtmlToMarkdown } from "./tool";

interface Check {
  name: string;
  predicate: () => boolean;
  detail: string;
}

const FIXTURE = `<!doctype html>
<html>
<head>
  <title>测试公众号文章 - Mock</title>
</head>
<body>
  <h1 id="activity-name" class="rich_media_title">测试公众号文章标题</h1>
  <div id="js_name" class="profile_meta_value">MockAccount</div>
  <em id="publish_time" class="publish_time">2026-05-01</em>
  <div id="js_content" class="rich_media_content">
    <p>这是第一段正文，包含一个 <strong>粗体</strong> 强调。</p>
    <p>这是第二段，引用公式：<span class="formula">a^2 + b^2 = c^2</span>。</p>
    <p><img data-src="https://example.com/mock.png" /></p>
    <pre><code class="language-javascript">const x = 1;</code></pre>
  </div>
</body>
</html>`;

const result = convertWechatHtmlToMarkdown(FIXTURE, "https://mp.weixin.qq.com/s/test-fixture", {
  includeTitle: true,
});

const checks: Check[] = [
  {
    name: "title extracted",
    predicate: () => result.title.includes("测试公众号文章标题"),
    detail: result.title,
  },
  {
    name: "metadata captured",
    predicate: () => result.meta.accountName === "MockAccount",
    detail: result.meta.accountName,
  },
  {
    name: "heading present",
    predicate: () => /^#\s+测试公众号文章标题/m.test(result.markdown),
    detail: result.markdown.slice(0, 80),
  },
  {
    name: "paragraph present",
    predicate: () => result.markdown.includes("第一段正文"),
    detail: "missing 第一段正文",
  },
  {
    name: "image reference preserved",
    predicate: () => /!\[[^\]]*\]\(\s*https:\/\/example\.com\/mock\.png\s*\)/.test(result.markdown),
    detail: result.markdown,
  },
  {
    name: "code block preserved",
    predicate: () => /```javascript\nconst x = 1;\n```/.test(result.markdown),
    detail: result.markdown,
  },
  {
    name: "no title option drops heading",
    predicate: () => {
      const withoutTitle = convertWechatHtmlToMarkdown(FIXTURE, "", { includeTitle: false });
      return !/^#\s+测试公众号文章标题/m.test(withoutTitle.markdown);
    },
    detail: "heading still present",
  },
];

let failed = 0;
for (const check of checks) {
  const ok = check.predicate();
  if (ok) {
    // eslint-disable-next-line no-console
    console.log(`PASS  ${check.name}`);
  } else {
    failed += 1;
    // eslint-disable-next-line no-console
    console.log(`FAIL  ${check.name}: ${check.detail}`);
  }
}

if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error(`\n${failed} of ${checks.length} wechat checks failed.`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`\nAll ${checks.length} wechat checks passed.`);
