# 五类 Agent 快捷接入

先从 https://dayunwu.cn/cli/ 下载 CLI，安装后执行 `ch --version`、`ch login --profile prod`、`ch whoami --profile prod --json`。登录只在本机进行，页面不收集凭据。

## 一条命令准备接入

```bash
ch agent install codex --scope user
ch agent install dsh --scope user
ch agent install opencode --scope project
ch agent install openclaw --scope user
ch agent install pi --scope user
```

默认 scope 为 user，project 使用当前工作目录。重复安装更新 CloudHouse 自有文件，修改过的旧文件备份为 .before-cloudhouse-update；其他技能与宿主配置保留。安装命令只准备本地资源，不自动授予生产权限或重启宿主。

| 宿主 | user 位置 | project 位置 | 启用 |
|---|---|---|---|
| Codex | ~/.config/cloudhouse-cli/agents/codex | .cloudhouse/agents/codex | codex plugin marketplace add <安装目录>，再在插件目录启用 |
| DSH | ~/.config/cloudhouse-cli/agents/dsh | .cloudhouse/agents/dsh | 导入本地插件并启用；详见包内README |
| OpenCode | ~/.config/opencode/skills/cloudhouse-admin | .opencode/skills/cloudhouse-admin | 新会话发现技能 |
| OpenClaw | ~/.openclaw/skills/cloudhouse-admin | skills/cloudhouse-admin | openclaw skills check，启动新会话 |
| pi | ~/.pi/agent/skills/cloudhouse-admin | .pi/skills/cloudhouse-admin | /skill:cloudhouse-admin；独立包可 pi install ./解压目录 |

DSH 插件声明 inject skills，在 apply 中向 ctx.skills 注册 cloudhouse-admin；宿主同时需要 skill 消费者与终端执行能力。只提供本地 CLI 能力，不额外建立 MCP 或公开管理工具服务。

## Agent 示例

“使用 cloudhouse-admin 查询生产环境下一场面试的到场情况。”

先检查身份权限，再运行只读命令。通知补发、账号重置、成绩录入等必须对应用户授权；登录成功不意味着获得全局管理员权限。

## 兼容与验证

宿主版本及验证层次见发布说明。技能发现、CLI mock 调用与真实生产操作分别记录；未做真实生产写入验收。本地安装不修改本机已有 agent 配置，验收使用隔离目录。

官方参考：[Codex插件](https://developers.openai.com/plugins/build/plugins)、[DSH技能](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills)、[OpenCode技能](https://opencode.ai/docs/skills/)、[OpenClaw技能](https://docs.openclaw.ai/tools/skills)、[pi包](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/packages.md)。

## 原生插件启用的具体步骤

Codex 安装命令准备资源后执行（project scope 使用返回的 .cloudhouse/agents/codex 路径）：

```bash
codex plugin marketplace add "$HOME/.config/cloudhouse-cli/agents/codex"
codex plugin add cloudhouse-admin@cloudhouse-admin-local
codex plugin list --json
```

DSH 在当前使用的 cordis.yml 的插件列表中加入下面一项；将 name 替换为安装命令返回目录中的 index.mjs 的绝对路径。保留宿主已有 skills 服务与终端工具，随后通过宿主插件管理界面启用或重新加载该配置。

```yaml
- id: cloudhouse-admin
  name: /absolute/path/to/dsh/index.mjs
```

此处 name 是 Cordis 原生模块导入地址，不额外声明 path 字段。依赖注入为 inject: ['skills']，未提供 skills 服务的 composition 无法启用。

独立 pi ZIP 解压后的 package.json 声明 pi.skills，可直接运行：

```bash
pi install ./cloudhouse-admin-pi
pi list
```

OpenCode 接入 ZIP 中 skills/cloudhouse-admin 复制到 .opencode/skills/；OpenClaw 复制到 ~/.openclaw/skills/，并先确保 ch 位于 PATH。通常更方便的方式是直接使用 ch agent install，它选择对应的原生技能目录。

## 全量只读分析（CLI 0.3.0）

先执行 `ch auth status --profile prod --json`，检查 `data.profile.dataAnalysisEnabled`。开启时使用 `ch analysis resources` 发现字段和实际可用资源，再使用 `ch analysis list/get/export/download --profile prod`。例如：“使用 cloudhouse-admin 导出所有组别的报名记录，分析各轮通过率；保留 JSONL 在我指定的本机路径。”各页不是同一时刻快照，失败导出不能当作完整数据。分析权限不会授权通知、评分或账号管理等写操作。
