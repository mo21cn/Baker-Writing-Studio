# 贡献指南

感谢你愿意为 Baker Writing Studio 花时间。这份文档说明本地怎么跑起来、改完要检查什么、以及提交信息怎么写。

## 开始之前

项目使用 **Node.js 22** 与 **Rust 1.77+**。桌面版还需要：

| 平台 | 额外依赖 |
|------|----------|
| Windows | [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/)，勾选「使用 C++ 的桌面开发」（含 MSVC 与 Windows SDK）；运行时需 Microsoft Edge WebView2 |
| macOS | Xcode Command Line Tools |

```bash
git clone https://github.com/mo21cn/Read2MD-Studio.git
cd Read2MD-Studio
npm install
```

## 本地运行

```bash
npm run dev                 # Web 版，http://127.0.0.1:3000/
npm run tauri:dev           # 桌面版，原生窗口
```

## 提交前必过

```bash
npx tsc -b                # 类型检查
npm run lint              # ESLint
npm test                  # 单元测试（Vitest）
npm run verify:version    # package.json / tauri.conf.json / Cargo.toml 三处版本号一致
```

`npm run verify:version` 是 CI 的硬闸：版本号在三个文件里各写一份，改版本时用 `npm run version:sync` 同步。

## 代码约定

- **分层**：`src/components/` 只做组合与交互，业务规则一律放进 `src/core/`。React 组件不直接碰 DOM 之外的逻辑。
- **命名**：`src/` 下的源码文件用 camelCase（`saveFile.ts`、`assetStorage.ts`），`scripts/` 下的可执行脚本用 kebab-case（`sync-version.mjs`）；组件与类型用 PascalCase，常量用 UPPER_SNAKE。
- **注释**：解释「为什么」，不复述「做了什么」。代码能说明的自己会说。
- **行尾**：仓库统一 CRLF（`core.autocrlf=true`）。新增文件请与所在目录保持一致。
- **新增依赖**：先确认没有现成方案；引入前在 PR 里说明理由与体积影响。

## 提交信息

按模块拆分，一个 commit 只做一件事：

```text
feat(desktop): 增加 save_bytes 命令，走原生保存对话框写文件
fix(theme): 修复导出时 H2 编号重复
docs(readme): 补充 macOS 构建依赖
```

常用前缀：`feat` / `fix` / `docs` / `chore` / `refactor` / `perf` / `test` / `build` / `ci`。

## 提 Issue

用仓库的 Issue 模板（Bug 反馈 / 功能建议）。报 Bug 时请附上：

- 系统与版本（桌面版可附安装包文件名里的版本号）
- 复现步骤
- 预期与实际表现
- 截图或录屏

## Pull Request

1. 从默认分支 `main` 切出分支
2. 改动尽量小而聚焦，一个 PR 一件事
3. 确认上面四个检查命令全绿
4. 在 PR 描述里写清「改了什么」与「为什么」

## 翻译

界面目前只提供中文。国际化字符串集中在 `src/i18n/locales/zh.json`，新增文案时同步补 key，不要把中文硬编码进组件。

## 行为准则

参与即表示同意 [行为准则](CODE_OF_CONDUCT.md)。

## 许可

提交即表示同意你的贡献以 [Apache License 2.0](LICENSE) 授权。
