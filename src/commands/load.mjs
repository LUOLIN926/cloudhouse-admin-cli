/**
 * 命令装配：导入所有命令模块完成注册。
 * 注册表本体在 index.mjs（不依赖任何命令模块，避免 ESM 循环初始化）。
 * 新增命令模块时在此追加一行 import。
 */
import './api.mjs'
import './auth.mjs'
import './dashboard.mjs'
import './groups.mjs'
import './candidates.mjs'
import './plans.mjs'
import './slots.mjs'
import './interviews.mjs'
import './evaluations.mjs'
import './notifications.mjs'
import './assistant.mjs'
import './uploads.mjs'
import './accounts.mjs'
import './applies.mjs'
import './profile.mjs'
import './ai.mjs'
import './feishu.mjs'
import './checkin.mjs'
import './extended.mjs'
import './agent.mjs'

import './analysis.mjs'
