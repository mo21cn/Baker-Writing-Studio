import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const packageVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

function importProxyPlugin(): Plugin {
  return {
    name: "import-proxy",
    configureServer(server) {
      server.middlewares.use("/api/import-url", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        try {
          // @ts-expect-error Local ESM helper ships without generated declaration file.
          const { fetchImportUrl } = (await import("./server/importUrl.mjs")) as {
            fetchImportUrl: (url: string) => Promise<{
              ok: boolean;
              kind: "wechat" | "generic" | null;
              reason: "invalid-url" | "verification" | "network" | null;
              message: string;
              status: number;
              html: string;
              verification: boolean;
            }>;
          };
          const requestUrl = new URL(request.url ?? "", "http://localhost");
          const articleUrl = requestUrl.searchParams.get("url");

          if (!articleUrl) {
            response.statusCode = 400;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, message: "缺少 url 参数。" }));
            return;
          }

          const result = await fetchImportUrl(articleUrl);
          response.statusCode = result.ok ? 200 : 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              ok: result.ok,
              html: result.html,
              kind: result.kind,
              verification: result.verification,
              reason: result.reason,
              message: result.message,
              status: result.status,
            }),
          );
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              ok: false,
              message: error instanceof Error ? error.message : "服务器内部错误",
            }),
          );
        }
      });

      server.middlewares.use("/api/wechat-image", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        try {
          // @ts-expect-error Local ESM helper ships without generated declaration file.
          const { fetchWechatImage } = (await import("./server/wechatImage.mjs")) as {
            fetchWechatImage: (url: string) => Promise<{
              ok: boolean;
              status: number;
              contentType: string | null;
              bytes: Buffer | null;
            }>;
          };
          const requestUrl = new URL(request.url ?? "", "http://localhost");
          const imageUrl = requestUrl.searchParams.get("url");

          if (!imageUrl) {
            response.statusCode = 400;
            response.end("Missing url parameter");
            return;
          }

          const result = await fetchWechatImage(imageUrl);
          if (!result.ok || !result.bytes) {
            response.statusCode = result.status || 502;
            response.end("Image fetch failed");
            return;
          }

          response.statusCode = 200;
          if (result.contentType) {
            response.setHeader("Content-Type", result.contentType);
          }
          response.end(result.bytes);
        } catch (error) {
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : "Image proxy error");
        }
      });

      server.middlewares.use("/api/import-wechat", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        try {
          // @ts-expect-error Local ESM helper ships without generated declaration file.
          const { fetchWechatHtml } = (await import("./server/wechatFetch.mjs")) as {
            fetchWechatHtml: (url: string) => Promise<{
              ok: boolean;
              reason: "invalid-url" | "verification" | "network" | null;
              message: string;
              status: number;
              html: string;
              verification: boolean;
            }>;
          };
          const requestUrl = new URL(request.url ?? "", "http://localhost");
          const articleUrl = requestUrl.searchParams.get("url");

          if (!articleUrl) {
            response.statusCode = 400;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ ok: false, message: "缺少 url 参数。" }));
            return;
          }

          const result = await fetchWechatHtml(articleUrl);
          response.statusCode = result.ok ? 200 : 502;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              ok: result.ok,
              html: result.html,
              kind: "wechat",
              verification: result.verification,
              reason: result.reason,
              message: result.message,
              status: result.status,
            }),
          );
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              ok: false,
              message: error instanceof Error ? error.message : "服务器内部错误",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), importProxyPlugin()],
  base: "./",
  define: {
    // mathjax-full probes a global `PACKAGE_VERSION` in components/version.js;
    // without it, the CJS build falls back to eval('require') and the app dies
    // with "require is not defined". Bind it to the real version so it stays
    // in sync with package.json instead of a hand-written literal.
    PACKAGE_VERSION: JSON.stringify(packageVersion),
  },
});
