/**
 * 命令注册表。每个命令声明其覆盖的后端端点（契约守护测试的数据源）：
 * api.ts 与后端 Controller 中的每个端点，必须被某条命令的 endpoints 声明，
 * 或由通用兜底 `ch api` 覆盖（fallback: true 的命令不逐条声明）。
 */

const commands = new Map()

export function register(name, spec) {
  commands.set(name, Object.freeze({ name, ...spec }))
  return commands.get(name)
}

export function getRegistry() {
  return commands
}

/** 最长前缀匹配：`ch ai plans list` → 注册键 'ai plans' + 位置参数 ['list'] */
export function resolveCommand(positionals) {
  const maxLen = Math.min(positionals.length, 3)
  for (let n = maxLen; n >= 1; n -= 1) {
    const key = positionals.slice(0, n).join(' ')
    const spec = commands.get(key)
    if (spec) return { key, spec, args: positionals.slice(n) }
  }
  return null
}

/**
 * 渲染帮助文本。
 * @returns {{text:string, missing:boolean}} missing 时由入口转成 exit 2——
 *   查不到子命令却 exit 0 会让 Agent 以为拿到了用法说明。
 */
export function renderHelp(subPath) {
  if (subPath && subPath.length > 0) {
    const key = subPath.join(' ')
    const spec = commands.get(key)
    if (spec) {
      const lines = [
        `${spec.name} — ${spec.summary}`,
        '',
        `用法：${spec.usage}`,
      ]
      if (spec.endpoints && spec.endpoints.length > 0) {
        lines.push('', '覆盖端点：', ...spec.endpoints.map((e) => `  ${e}`))
      }
      return { text: lines.join('\n'), missing: false }
    }
    // `ch help candidates` 这类只给分组名的查询：列出该组的命令，而不是报「未找到」
    const group = [...commands.values()].filter((s) => s.name.split(' ')[0] === subPath[0])
    if (group.length > 0) {
      const lines = [`[分组 ${subPath[0]}]`, ...group.map((s) => `  ${s.name.padEnd(28)} ${s.summary}`)]
      return { text: lines.join('\n'), missing: false }
    }
    return { text: `未找到命令：${key}\n运行 ch help 查看全部命令`, missing: true }
  }

  const groups = new Map()
  for (const spec of commands.values()) {
    const group = spec.name.split(' ')[0]
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(spec)
  }
  const lines = [
    `ch — CloudHouse 招新管理后台 CLI（Agent 优先：stdout 输出 JSON 信封，共 ${commands.size} 条命令）`,
    '',
    '用法：ch [--pretty|--json] [--profile local|prod] [--base-url <url>] <命令> [参数] [--flag 值]',
    '',
    '通用选项：',
    '  --pretty                人类可读表格/键值输出（非 TTY 时默认为 JSON）',
    '  --json                  强制单行 JSON 输出',
    '  --no-pretty             强制单行 JSON（管道/重定向时同样生效）',
    '  --profile <name>        环境 profile：local | prod（未知 profile 直接 exit 2）',
    '  --base-url <url>        直接指定 API 根地址',
    '  --timeout <ms>          单次请求超时，1000–600000，默认 30000（上传 120000）',
    '  --out <path>            下载落盘位置（仅 uploads 的下载类命令）',
    '  --force                 允许覆盖已存在的下载目标',
    '  --allow-profile-mismatch 显式允许跨环境会话（默认拒绝）',
    '  --help                  查看某命令用法，如 ch help candidates list；ch help <分组> 看分组',
    '',
    '参数严格性：',
    '  取值型 flag 缺值（--keyword 后无内容）→ exit 2；未知或不适用 flag → exit 2，不发送请求。',
    '  布尔 flag 接受 true|false|1|0|yes|no|y|n|on|off；--flag=值 可安全传递以 - 开头取值。',
    '  多余位置参数 → exit 2；时间/路径/枚举/正整数在本地预检，不合法即 exit 2。',
    '  --request-id 仅 capabilities 标注的 AI 写动作支持；资料上传/读操作不支持。',
    '',
    '退出码：',
    '  0 成功  1 业务错误  2 用法错误  3 鉴权失效  4 权限不足  5 限流',
    '  6 版本冲突重试耗尽  7 网络不可达/超时  8 功能开关未开  9 端点未实现',
    '',
    '命令：',
  ]
  for (const [group, specs] of groups) {
    lines.push(`  [${group}]`)
    for (const spec of specs) lines.push(`    ${spec.name.padEnd(28)} ${spec.summary}`)
  }
  lines.push('', '任一未被语义化的端点均可用兜底命令调用：', '  ch api <METHOD> <path> [-q k=v] [-d <json|@file>] [-H "Name: value"] [--public]')
  lines.push('', 'ch api 为逃生舱：flag 解析保持宽松，-d @file 直发文件内容，不做本地预检。')
  lines.push('')
  return { text: lines.join('\n'), missing: false }
}
