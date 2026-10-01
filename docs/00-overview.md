# 管理后台 CLI（ch）总览

版本 **0.3.2**，Node.js ≥18，纯 ESM、零运行时依赖。共 98 条命令注册项（AI 多动作命令另列动作），面向管理员与 agent。

## 安装与快速开始

从 https://dayunwu.cn/cli/ 下载 .tgz 或便携 ZIP。

```bash
npm install -g ./cloudhouse-admin-cli-0.3.2.tgz
ch --version
ch capabilities --json
# 输入已有管理员凭据；不要将密码粘贴到 shell 历史
ch login --profile prod
ch whoami --profile prod --json
ch candidates list --profile prod --keyword 张三 --json
ch agent install codex --scope user
```

仓库开发：`npm --prefix cli link`，或 `node cli/bin/ch.mjs`。便携 ZIP 无需全局安装，解压后运行 `node cloudhouse-admin-cli/bin/ch.mjs --help`。所有平台使用同一 Node 包，本轮未提供原生二进制。

## 覆盖与边界

- 分别核算语义命令覆盖、`ch api` 通用可达和 mock 行为测试覆盖；见 [审查报告](04-audit.md) 与 [覆盖表](06-coverage.md)。端点登记不等于参数完整、测试通过或生产已发布。
- 管理员、组别、候选人、报名、方案、场次、面试、评价、通知、现场助手、上传下载、签到、飞书和 AI Coding 均有语义命令；六个原兜底接口已接入。
- 新增资料上传、预览、出题、任务查询、确认共五个端点，需要 material-authoring 新版后端。本轮不发布这些后端改动，旧后端可返回 exit 8/9。
- `capabilities` 的权限描述是调用指引，最终权限与功能开关始终由后端判定。

## 配置与凭据

| 来源 | 作用 |
|---|---|
| --profile local/prod | 默认 local：http://127.0.0.1:8080/api；prod：https://api.dayunwu.cn/api |
| --base-url / CH_BASE_URL / CH_API_BASE | 显式 API 根地址 |
| CH_PROFILE | 默认环境选择 |
| CH_TOKEN | 显式提供调用环境的 token，优先于磁盘会话 |
| CH_STUDENT_NO / CH_PASSWORD | 登录环境变量；避免把密码写进 shell 历史 |
| CH_CONFIG_DIR | 配置与会话目录，默认 ~/.config/cloudhouse-cli |
| CH_AGENT_HOME | agent 安装的用户根目录覆盖，用于隔离测试 |
| CH_CHECKIN_SCREEN_TOKEN | 签到大屏 token，只经 header 发送 |

优先级：flag > 环境 > config.json > 内置。未知 profile 不自动回落。

## 会话、安全与重试

- session.json 权限 0600，配置目录 0700；续期同时更新本进程和匹配的磁盘会话。环境 token 不被写入新会话。
- 磁盘会话的 baseUrl 不匹配时默认 exit 2，阻止凭据发送；跨环境需显式 `--allow-profile-mismatch`。CLI 不自动重新登录。
- stdout 默认管道输出单行 JSON 信封，TTY 默认人类输出；agent 使用 `--json`。10 档语义化 exit code 见契约。
- requestId 只适用于 `ch ai *` 的写命令中 capabilities 标注支持的操作；资料上传例外，其他业务写接口不支持去重。
- 未指定版本的乐观锁冲突最多自动重读重试两次，并更换 requestId；显式版本不自动重试。
- 敏感写操作缺 reason 则本地拒绝；共 9 处，reason ≤200字。外部通知命令需用户明确授权，不用于连通性测试。
- 未知/不适用参数、多余位置参数 exit 2；`ch api` 保留宽松参数解析。非 JSON、无效 JSON 信封、重定向均不会误报成功。

## 文档与验证

[命令参考](01-command-reference.md) · [Agent 契约](02-agent-contract.md) · [五类接入](03-agent-setup.md) · [审查报告](04-audit.md) · [发布说明](05-release.md)

运行 `npm --prefix cli test`。契约测试双向核对前端 API、后端管理端点和注册表，新增端点必须作显式接入决定；行为测试通过本机 mock 后端核对请求，不使用生产数据。

## 全量只读数据分析（0.3.0）

现有管理员在 v36 迁移时统一开启；新建账号默认关闭，仅 SYSTEM 可修改。Web 仅增加授权开关，现有数据范围及写权限保持原样。

```bash
ch auth status --profile prod --json
ch analysis resources --profile prod --json
ch analysis list profiles --profile prod --json
ch analysis export profiles --profile prod --out ./profiles.jsonl
```

分析命令使用独立 API，全量跨组读取受字段白名单控制；权限关闭不会取消其他管理权限。详见 [数据分析指南](07-data-analysis.md)。
