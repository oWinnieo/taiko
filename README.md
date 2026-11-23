# Taiko Web · 太鼓达人复刻版

基于 **Vite + TypeScript + React + Canvas 2D + Web Audio API** 实现的太鼓达人 Web 复刻版，遵循 OpenClaw 开发与生产发布规范，并在架构上预留桌面客户端打包（Tauri 2.0）、曲库扩展与未来谱面编辑器能力。

## 核心特性

- **开箱即玩**：内置 3 首免版权示范曲目（含多难度 梅/竹/松/鬼、大音符、连打、气球、Go-Go Time 与变速）。
- **本地 `.tja` 曲包导入**：支持在选歌页直接拖入 `.tja` + `.ogg/.mp3/.wav` 文件（自动识别 UTF-8 / Shift-JIS 编码），持久化保存至浏览器 IndexedDB。
- **高精度音游引擎**：
  - `AudioContext.currentTime` 主时钟驱动，零漂移。
  - 预解码零延迟鼓声（内置经典鼓声 + 30 套可选音色包），WASM Ogg Vorbis 兜底保障 Safari / macOS WKWebView 兼容。
  - 街机判定窗口（良/可/不可）、双手大音符加成、魂槽与过关/全连/全良王冠。
  - 支持键盘（默认 `D/F/J/K`，可自定义）、底部触控/鼠标鼓面与 Gamepad / TaTaCon 外设。
  - 内置交互式音频延迟校准向导与丰富模组（倍速、AUTO、隐身、咚咔反转、仅咚/仅咔）。

## 文档与规范

- 技术方案：[docs/PLAN.md](./docs/PLAN.md)
- 开发与发布规范：[AGENTS.md](./AGENTS.md)
- 每日进度日志：[docs/progress/README.md](./docs/progress/README.md)

## 本地开发

```bash
npm install
npm run dev
npm test
npm run build
```
