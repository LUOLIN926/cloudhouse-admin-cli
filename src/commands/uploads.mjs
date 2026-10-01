import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { textParam } from '../path.mjs'
import { flagString, flagOn } from '../payload.mjs'

const MAX_IMAGE_SIZE = 2 * 1024 * 1024
const MAX_ASSESSMENT_SIZE = 10 * 1024 * 1024

/**
 * 决定附件落盘位置。
 * 之前是 `path.resolve(flags.get('out') || name)` 直接写：--name 是调用方（服务端按名
 * 返回内容）给的，`--name ../../x.txt` 实测把远端内容写到了 cwd 之外；同名文件还会被
 * 静默覆盖。现在默认名取 basename、必须落在 cwd 内，显式 --out 才允许落在别处，
 * 覆盖必须 --force。
 */
function resolveDownloadTarget({ name, out, force }) {
  if (out !== undefined && out !== false && out !== true && String(out).trim() !== '') {
    const explicit = path.resolve(String(out))
    if (!force && fs.existsSync(explicit)) {
      throw usageError(`目标文件已存在：${explicit}`, '确认要覆盖请加 --force')
    }
    return explicit
  }
  const base = path.basename(String(name).trim())
  if (base === '' || base === '.' || base === '..') {
    throw usageError(`无法从 --name 推出安全文件名：${name}`, '请用 --out 指定完整输出路径')
  }
  const target = path.resolve(process.cwd(), base)
  if (!force && fs.existsSync(target)) {
    throw usageError(`目标文件已存在：${target}`, '确认要覆盖请加 --force，或用 --out 换个路径')
  }
  return target
}

const IMAGE_MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** 与 admin-web lib/assessmentFile.ts 的允许清单一致 */
const ASSESSMENT_MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
}

/** 读取待上传文件并做本地预检（格式/大小），失败按用法错误处理 */
function readUploadFile(ctx, { mimeByExtension, maxSize, label }) {
  const filePath = ctx.positionals[0] || flagString(ctx, 'file')
  if (!filePath) throw usageError('缺少待上传文件路径', `用法：${label}`)
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw usageError(`文件不存在：${filePath}`)
  }
  if (!stat.isFile()) throw usageError(`不是普通文件：${filePath}`)
  if (stat.size === 0) throw usageError('文件不能为空')
  if (stat.size > maxSize) {
    throw usageError(
      `文件大小 ${(stat.size / 1024 / 1024).toFixed(2)}MB 超过上限 ${maxSize / 1024 / 1024}MB`,
      '管理台上传同样受限；请先压缩或裁剪',
    )
  }
  const extension = path.extname(filePath).toLowerCase()
  const mime = mimeByExtension[extension]
  if (!mime) {
    throw usageError(`不支持的文件格式 ${extension || '（无扩展名）'}`, `允许：${Object.keys(mimeByExtension).join(' ')}`)
  }
  const buffer = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), fileName)
  return { form, fileName, size: stat.size }
}

/** 相对资源地址（/uploads/**）拼成绝对地址，便于跨域部署下直接使用 */
function absoluteUrl(baseUrl, url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return url
  try {
    return new URL(url, baseUrl.replace(/\/api\/?$/, '/')).toString()
  } catch {
    return url
  }
}

register('uploads image', {
  summary: '上传图片（JPG/PNG/WebP，≤2MB）',
  usage: 'ch uploads image <文件路径>',
  endpoints: ['POST /admin/uploads'],
  run: async (ctx) => {
    const { form, fileName, size } = readUploadFile(ctx, {
      mimeByExtension: IMAGE_MIME_BY_EXTENSION,
      maxSize: MAX_IMAGE_SIZE,
      label: 'ch uploads image <文件路径>',
    })
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/uploads', formData: form })
    return { ...data, fileName, size, absoluteUrl: absoluteUrl(ctx.config.baseUrl, data && data.url) }
  },
})

register('uploads assessment', {
  summary: '上传考核附件（PDF/DOC/DOCX/XLS/XLSX/CSV/ZIP/RAR/7Z/TAR/MD，≤10MB）',
  usage: 'ch uploads assessment <文件路径>',
  endpoints: ['POST /admin/uploads/assessment-files'],
  run: async (ctx) => {
    const { form, fileName, size } = readUploadFile(ctx, {
      mimeByExtension: ASSESSMENT_MIME_BY_EXTENSION,
      maxSize: MAX_ASSESSMENT_SIZE,
      label: 'ch uploads assessment <文件路径>',
    })
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/uploads/assessment-files', formData: form })
    return { ...data, size, absoluteUrl: absoluteUrl(ctx.config.baseUrl, data && data.url) }
  },
})

register('uploads ai-attachment', {
  summary: '上传 AI Coding 题包附件（≤10MB）',
  usage: 'ch uploads ai-attachment <文件路径>',
  endpoints: ['POST /admin/ai-coding/paper-attachments'],
  run: async (ctx) => {
    const { form, fileName, size } = readUploadFile(ctx, {
      mimeByExtension: ASSESSMENT_MIME_BY_EXTENSION,
      maxSize: MAX_ASSESSMENT_SIZE,
      label: 'ch uploads ai-attachment <文件路径>',
    })
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/ai-coding/paper-attachments', formData: form })
    return data
  },
})

register('uploads attachment-download', {
  summary: '下载 AI Coding 题包附件到本地文件',
  usage: 'ch uploads attachment-download <attachmentId> --name 文件名 [--out 输出路径]',
  endpoints: ['GET /admin/ai-coding/paper-attachments/{attachmentId}'],
  run: async (ctx) => {
    const [attachmentId] = ctx.positionals
    if (!attachmentId) throw usageError('缺少 attachmentId', '用法：ch uploads attachment-download <attachmentId> --name 文件名')
    const name = flagString(ctx, 'name', { required: true, label: '--name 附件名（服务端按名返回）' })
    const { buffer, contentType } = await ctx.client.request({
      method: 'GET',
      path: `/admin/ai-coding/paper-attachments/${textParam(attachmentId, { label: 'attachmentId' })}`,
      query: [['name', name]],
      raw: true,
    })
    const outPath = resolveDownloadTarget({ name, out: ctx.flags.get('out'), force: flagOn(ctx, 'force') })
    const temp = `${outPath}.partial-${crypto.randomUUID()}`
    try {
      fs.writeFileSync(temp, buffer, { flag: 'wx', mode: 0o600 })
      if (flagOn(ctx, 'force')) fs.renameSync(temp, outPath)
      else { fs.linkSync(temp, outPath); fs.unlinkSync(temp) }
    } finally { try { fs.unlinkSync(temp) } catch {} }
    return { savedTo: outPath, bytes: buffer.length, contentType }
  },
})
