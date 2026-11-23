# Taiko Web 项目开发与发布规范（AGENTS Rules）

本文件为项目根目录常驻规则，涵盖 **OpenClaw 开发与生产发布流程规范** 与 **本项目架构约束**。

---

## 一、OpenClaw 开发与生产发布规范（强制遵循）

### 1. 双机职责隔离
```text
rococo-oc-workplace (dev, user: openclaw)
  开发、提交并推送 dev 仓库 → GitHub: oc-workspace/taiko
        ↓
rococo-root (prod, user: root)
  隔离目录检出、发布 prod 仓库 → GitHub: oWinnieo/taiko
  构建与部署生产容器 → https://taiko.rococo.dev
```

- **开发机**：`ssh rococo-oc-workplace`，项目根目录 `/work/oc-projects/taiko`。
  - 首次建仓：`cd /work/oc-projects/taiko && source ~/.profile && oc-create-repo`
  - 日常推送：`cd /work/oc-projects/taiko && source ~/.profile && oc-push "提交说明"`
  - 开发机上不执行 `oc-prod-*` 命令。
- **生产发布桥接机**：`ssh rococo-root`，隔离发布根目录 `/opt/docker/for-oc-dev2prod/taiko`。
  - 首次建立隔离检出：`cd /opt/docker/for-oc-dev2prod && source ~/.profile && oc-prod-clone taiko`
  - 若 prod 仓库不存在：`cd /opt/docker/for-oc-dev2prod/taiko && source ~/.profile && oc-prod-create-repo && oc-prod-init`
  - 若 prod 已有 `main`：`cd /opt/docker/for-oc-dev2prod/taiko && source ~/.profile && oc-prod-release "Release YYYY-MM-DD"`（生成 `release/YYYY-MM-DD-HHMMSS` 分支与 PR 地址，在 GitHub 检查差异后合并）。
  - 生产机上不执行 `oc-create-repo` / `oc-push`。

### 2. 每日进度日志必检（强制）
凡使用本流程维护的开发仓库，每个自然日必须使用 `docs/progress/YYYY-MM-DD.md` 记录当天进度；同一天的后续工作继续追加到同一个文件，不得为同一天创建多份日志。

**当天最后一次推送前，必须完成以下检查：**
1. 创建或更新当天的 `docs/progress/YYYY-MM-DD.md`。
2. 更新 `docs/progress/README.md` 中的“当前日志”索引，加入当天日志链接和摘要。
3. 日志至少记录：当天的范围、关键决策、完成内容、提交、测试/构建结果、部署证据、阻塞点和下一步行动（未发生项可省略）。
4. 运行 `git status --short` 和 `git diff --check`，确认当天日志及索引已包含在待推送提交中。
5. 严禁在代码、日志、Markdown 或提交中写入任何密码、GitHub PAT、API Key、Cookie 或敏感连接串。

### 3. 发布前检查清单
执行 `oc-prod-init` 或 `oc-prod-release` 前必须核对：
- `git status --short --branch`（工作区干净）
- `git remote -v`（`origin` → `oc-workspace/taiko`，`prod` → `oWinnieo/taiko`）
- 当前目录位于 `/opt/docker/for-oc-dev2prod/taiko`
- 端口映射位于平台允许区间 `3100-3199`（本项目默认 `3113`），Docker Compose 不使用 `privileged`、`network_mode: host`、`container_name` 或敏感宿主机挂载。

---

## 二、本项目技术与可扩展性约束

1. **渲染与 UI 分离**：演奏主循环与 Canvas 2D 渲染（`src/core/`）必须保持纯 TypeScript、零 React 依赖，确保 60/120fps 低延迟帧率。
2. **高精度音频时钟**：音符滚动与判定必须以 `AudioContext.currentTime` 为唯一基准时钟，禁止用 `setInterval` 驱动判定。
3. **谱面模型双向可扩展**：所有谱面经由规范化的 `ChartDocument` 数据结构表示（`src/core/chart/`），解析（`tjaParser`）与序列化（`tjaSerializer`）分离，为后续可视化谱面编辑器与 `.osu` 扩展预留接口。
4. **平台抽象层隔离**：本地曲库、设置与存档持久化一律通过 `src/platform/PlatformAdapter` 访问，Web 端使用 IndexedDB/localStorage，后续打包桌面端（Tauri 2.0）仅需新增原生适配器，不改动核心业务代码。
5. **跨浏览器音频兼容**：所有 `.ogg` 资源解码须支持原生 Web Audio 优先 + WASM Ogg Vorbis 解码兜底，确保 Chrome/Firefox/Safari 及 macOS WKWebView 均正常发声。
