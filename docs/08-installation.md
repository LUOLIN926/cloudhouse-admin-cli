# 安装 CloudHouse CLI

## 手动安装（推荐 npm）

需要 Node.js 18 或更新版本。官方 npm 包为 cloudhouse-admin-cli，源码仓库为 LUOLIN926/cloudhouse-admin-cli。

```sh
npm install -g cloudhouse-admin-cli@latest
ch --version
ch capabilities
```

固定版本可用 npm install -g cloudhouse-admin-cli@0.3.3。更新时重复安装即可。不要使用 sudo 自动提升权限；全局目录不可写时，使用 Node 版本管理器或用户目录的 npm prefix。

## 交给 Agent 安装

将下面的提示词复制到 Codex、DeepSeek Harness、OpenCode、OpenClaw 或 pi：

```text
请按照 https://dayunwu.cn/cli/docs/08-installation.md 帮我安装官方 CloudHouse CLI。检查 Node.js ≥18，然后通过 npm 安装 cloudhouse-admin-cli@latest，验证 ch --version 和 ch capabilities。识别当前 Agent，运行 ch agent install codex|dsh|opencode|openclaw|pi --scope user（只选当前宿主对应的一项），保留其他配置，按安装结果说明完成宿主启用；无法识别时先询问我。不要自动使用 sudo，不要读取或输出已有凭据。登录交给我在本机终端执行 ch login --profile prod；登录后仅验证 ch whoami --profile prod --json，不执行业务写入。报告版本、安装位置和需要我完成的步骤。
```

这是交给 Agent 执行的安装指引，不是网页远程执行脚本。Codex 和 DSH 插件仍需按宿主流程启用；其他宿主按 [接入指南](03-agent-setup.md) 操作。

## 登录与权限

```sh
ch login --profile prod
ch whoami --profile prod --json
```

密码仅在本机交互输入，不放入聊天、脚本或命令参数。安装 CLI 不授予后台权限；数据分析须管理员已获得独立数据分析权限。Agent 每次业务调用显式指定 profile，解析 JSON 信封及退出码；写操作需先确认具体目标和操作。

## 离线安装与备用下载

无法访问 npm 时，从 [GitHub Releases](https://github.com/LUOLIN926/cloudhouse-admin-cli/releases/latest) 或 [官网备用下载](https://dayunwu.cn/cli/#downloads) 下载 .tgz，核对对应版本 SHA256SUMS，再执行 npm install -g ./cloudhouse-admin-cli-0.3.3.tgz。便携 ZIP 解压后使用 node cloudhouse-admin-cli/bin/ch.mjs --version。历史包不会覆盖。
