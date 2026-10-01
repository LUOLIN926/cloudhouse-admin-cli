# CloudHouse Admin CLI

面向管理员与 Agent 的 CloudHouse 招新管理 CLI。纯 ESM，零运行时依赖，Node.js ≥18；命令入口为 `ch`，输出 JSON 信封与稳定退出码。

[网站与文档](https://dayunwu.cn/cli/) · [GitHub 下载](https://github.com/LUOLIN926/cloudhouse-admin-cli/releases) · [命令参考](docs/01-command-reference.md) · [安全说明](SECURITY.md)

## 安装

推荐：`npm install -g cloudhouse-admin-cli@latest`。手动安装和 Agent 提示词见 [安装指南](docs/08-installation.md)。

备用渠道：

从 [v0.3.3 Release](https://github.com/LUOLIN926/cloudhouse-admin-cli/releases/tag/v0.3.3) 下载 `.tgz`，核对 SHA256SUMS 后安装：

```sh
npm install -g ./cloudhouse-admin-cli-0.3.3.tgz
ch --version
ch help
ch capabilities
```

便携 ZIP 解压后通过 `node cloudhouse-admin-cli/bin/ch.mjs --version` 运行。官方 npm 包：cloudhouse-admin-cli；推荐通过 npm 安装。Windows 可用 PowerShell `Get-FileHash` 核对 SHA-256；macOS 可用 `shasum -a 256`，Linux 可用 `sha256sum`。

## 登录与使用

```sh
ch login --profile prod
ch auth status --profile prod --json
ch candidates list --profile prod --json
ch analysis resources --profile prod --json
ch analysis export users --out ./candidates.jsonl --profile prod
```

最后一条示例的资源名请以 `ch analysis resources` 返回的实际目录为准。登录使用终端隐藏输入；自动化可从受保护环境注入 CH_PASSWORD/CH_TOKEN，避免命令行、shell 历史、CI 日志或聊天中出现凭据。请勿提交会话、分析导出、附件或真实业务数据。

默认 profile 为 local；生产须明确指定 prod。部署到其他服务时使用 `--base-url https://your-service.example/api`。公开源码并不授予 CloudHouse 服务访问权；所有服务权限由后端验证。数据分析权限是独立的全量只读权限，不增加业务写权限。资料出题命令要求配套后端，不能仅凭 CLI 版本判断可用。

## Agent 接入

支持 Codex、DeepSeek Harness、OpenCode、OpenClaw 与 pi。所有接入使用同一技能与 CLI，不包含 MCP 服务或账号凭据。

```sh
ch agent install codex --scope user
# 可替换为 dsh / opencode / openclaw / pi；项目范围用 --scope project
```

宿主需启用的步骤由命令返回。详见 [接入指南](docs/03-agent-setup.md) 与 [Agent 契约](docs/02-agent-contract.md)。

## 开发与构建

```sh
npm test
npm run check:security
npm run docs
npm run sync:integrations
npm run build:release
```

测试仅连接本地模拟后端，不需要生产账号。构建输出到 dist/，包含两个 CLI 包、五个接入包、SHA256SUMS、release.json。需要系统 zip 和 npm；Windows 建议 WSL 构建。后端/管理页面不属于本仓库；脱敏接口快照测试不等于在线后端验证。

## 许可

代码采用 [MIT](LICENSE)。CloudHouse 品牌及服务访问权不随软件许可证授予；第三方与品牌说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
