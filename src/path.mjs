import { usageError } from './errors.mjs'

/**
 * 路径参数的本地校验与编码。
 *
 * 背景：位置参数此前直接插值进 path 模板（55 处），只有 ai.mjs 的 modelId 与
 * uploads 的 attachmentId 做了 encodeURIComponent。实测 `ch candidates get "42?foo=bar"`
 * 发出的是 `/users/42?foo=bar/info`——new URL() 把尾随的 /info 当成了查询串的值，
 * 请求形状被静默改掉且仍然带 JWT 打向真实端点。
 *
 * 后端所有传统端点的 @PathVariable 都是 Long（UserController / AdminController /
 * InterviewController 等），AI Coding 的 plan/attempt/candidate id 也是 long，
 * 因此数字校验放在本地既拦住了畸形输入，也避免了 Spring 类型转换那套更难读的报错。
 */

/** 数字型路径参数：后端 @PathVariable Long / long */
export function idParam(raw, { label = 'id' } = {}) {
  const text = String(raw ?? '').trim()
  if (text === '') {
    throw usageError(`缺少 ${label}`, `用法见 ch help，${label} 是正整数`)
  }
  if (!/^\d+$/.test(text)) {
    throw usageError(`${label} 必须是正整数（收到：${text}）`, '路径参数只能是数字；若取值里带 ? # / 空格，说明拼错了或需要编码')
  }
  return text
}

/**
 * 字符串型路径参数：允许文本，但必须逐段编码。
 * allowEmpty 给「同一命令里 id 是否必填取决于 action」的多动作命令用
 * （ch ai plans list 不带 id，ch ai plans get <id> 才带），缺失时交回调用方的显式检查。
 */
export function textParam(raw, { label = 'id', allowEmpty = false } = {}) {
  const text = String(raw ?? '')
  if (text.trim() === '') {
    if (allowEmpty && raw === undefined) return undefined
    throw usageError(`缺少 ${label}`)
  }
  return encodeURIComponent(text)
}
