# OpenClaw 开发与生产发布规范

本规则引用并强化项目根目录 [AGENTS.md](../../AGENTS.md) 中的 OpenClaw 工作流要求：

- **开发操作一律在 `rococo-oc-workplace` 的 `/work/oc-projects/taiko` 进行**，通过 `oc-create-repo` / `oc-push` 推送至 `oc-workspace/taiko`。
- **生产发布一律在 `rococo-root` 的 `/opt/docker/for-oc-dev2prod/taiko` 进行**，通过 `oc-prod-clone` / `oc-prod-create-repo` / `oc-prod-init` / `oc-prod-release` 推送至 `oWinnieo/taiko`。
- **每日推送前必须更新 `docs/progress/YYYY-MM-DD.md` 和 `docs/progress/README.md`**，并执行 `git status --short` 与 `git diff --check`。
- **严禁泄露任何 GitHub token、密码或敏感信息**到仓库、文档或日志中。
- Docker Compose 遵循平台安全限制（端口 `3100-3199`，禁用 `container_name`、`privileged`、`host` 网络与敏感路径挂载）。
