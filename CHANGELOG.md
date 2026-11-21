# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 修复

- **桌面版本地图片无法显示**：`asset://` 协议的作用域写成了 `$APPDATA/baker-writing-studio/**`，而图片实际写在 `$APPDATA/read2md-studio/assets/{docId}/`，作用域不覆盖，桌面端预览里的本地图片会全部 403。作用域已改为 `$APPDATA/read2md-studio/assets/**`，并新增 `src/core/assets/assetScope.test.ts` 把作用域与落盘目录绑在一起，防止再次漂移。
  > 已发布的 v0.3.0 安装包包含此缺陷，需要用修复后的版本重新构建。

### 文档

- 重写 `README.md`（中文）与 `README-EN.md`：完整的使用说明、真实的下载资产名、真实的数据存放位置，移除已不存在的组件（`Toolbar.tsx` / `ViewTabs.tsx`）与「中英文切换」等失实描述
- 新增 `CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、Issue 模板与主界面截图 `docs/screenshot.png`

## [0.3.0] — 2026-11-21

首个 Baker Writing Studio 正式版本，也是首个**提供 Windows 桌面安装包**的版本。

### 新增

- **Windows 桌面版**：NSIS 安装包 `Baker-Writing-Studio_0.3.0_x64-setup.exe`（x64，5.73 MB），随 Release 发布
- **桌面端原生保存对话框**：导出 Markdown、表格、LaTeX、Word、长图与主题统一走系统保存对话框；新增 Rust 命令 `save_bytes`（路径恒来自原生对话框）
- **统一落盘出口** `src/core/export/saveFile.ts`：Web 走浏览器下载，桌面端交给 Rust 写盘
- **三个独立工具**：公众号 → MD、表格转换 → MD/LaTeX、LaTeX → LaTeX/Word（`.docx` 含原生 OMML 公式）
- **本地 Markdown 导入**：文档侧栏「导入 MD」按钮，支持 `.md` / `.markdown` 一键建档
- **全局翻译**：预览区页眉「译成英文 / 译成中文」，代码块、公式、链接与 HTML 标签占位符保护，支持取消与还原原文
- **活动栏 + 状态栏布局**：左侧四个工具入口，底部状态栏显示文档名、字数、状态与主题
- **可拖拽分栏**：编辑器与预览区比例可调，工具页与编辑器共用画布
- **主题自定义**：token 微调、标题级别增删、JSON 导入导出、预设保存

### 变更

- **品牌重塑**：更名为 Baker Writing Studio；手绘 chef-hat 标识、黑白灰主题、深色侧栏
- **界面锁定中文**：移除原「中文 / English」切换，界面文案统一为中文
- **打包目标按平台拆分**：`bundle.targets` 不再混列 NSIS 与 DMG，改由 `scripts/build-desktop.mjs` 按当前平台显式传入 `--bundles`
- **CI**：新增 Windows 安装包工作流（构建 + 上传 artifact + 可选发布 Release）；修复原有工作流指向不存在的标签与 Release 的问题

### 修复

- 公众号导入：列表项丢失、display 公式空白、引用块 raw HTML 泄漏
- 复制到公众号：桌面版改用原生剪贴板 API，含 Mermaid 的长文复制更稳定
- Mermaid：预览即时渲染，复制到公众号时栅格化为图片
- 预览区 HTML 消毒，堵住 XSS 通道
- 删除桌面壳中已废弃的 Codex 集成模块与其命令

### 移除

- 桌面壳的 Codex 桥接模块（`codex.rs` / `codex_usage.rs`）及其 7 个命令
- 废弃的 `en.json` 语言包（界面已锁定中文）
- `withGlobalTauri` 全局注入（源码零使用，只增加攻击面）

## [0.1.0] — 上游 Read2MD Studio 首发

- Markdown 编辑 / 预览 / 主题、公众号复制、URL 导入、图片本地化、macOS dmg 首版

> 0.1.0 与 0.2.0 为上游 [ingeniousfrog/Read2MD-Studio](https://github.com/ingeniousfrog/Read2MD-Studio) 的版本历史；Baker Writing Studio 从 0.3.0 起独立演进。

[0.3.0]: https://github.com/mo21cn/Read2MD-Studio/releases/tag/v0.3.0
