# CLI 命令参考（0.3.2）

由注册表生成；Agent 指定 `--profile prod --json`。

全局：`--profile`、`--base-url`、`--timeout`、`--pretty`、`--json`、`--no-pretty`、`--help`、`--allow-profile-mismatch`；`ch --version` 离线输出版本。`--request-id` 只在 `ch ai *` 写命令上有效。支持 JSON 载荷的写命令可用 `-d/--data`；`--request-id` 只用于能力目录标注支持的动作。

数据分析需要独立授权，参见 [数据分析指南](07-data-analysis.md)。

## ch api

通用兜底：调用任意 API 端点

```bash
ch api <METHOD> <path> [-q key=value ...] [-d <json|@file>] [-H "Name: value" ...] [--public]
```

参数：`-H`、`--allow-profile-mismatch`、`--base-url`、`-d`、`--help`、`--json`、`--pretty`、`--profile`、`--public`、`-q`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch login

登录并保存会话（token 落盘 0600，含滚动续期自动换存）

```bash
ch login [--studentNo <学号>] [--password <密码>] [--profile local|prod] [--show-token]
```

接口：`POST /auth/login`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--password`、`--pretty`、`--profile`、`--show-token`、`--studentNo`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch whoami

查看当前会话与管理员权限（adminLevel / authorizedGroups）

```bash
ch whoami
```

接口：`GET /admin/profile`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch logout

删除本地会话文件（不影响服务端 token，直至自然过期）

```bash
ch logout
```

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch auth status

查看当前会话与管理员权限（adminLevel / authorizedGroups）

```bash
ch auth status
```

接口：`GET /admin/profile`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch dashboard

招新总览统计（报名/录取/待处理/场次占用）

```bash
ch dashboard [--pretty]
```

接口：`GET /admin/dashboard`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch groups list

组别列表

```bash
ch groups list [--pretty]
```

接口：`GET /groups`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch groups create

创建组别（SUPER/SYSTEM）

```bash
ch groups create --group-name 名称 [--introduction 简介] [--requirement 要求≤65字]
```

接口：`POST /groups`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--group-name`、`--help`、`--introduction`、`--json`、`--pretty`、`--profile`、`--requirement`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch groups update

更新组别

```bash
ch groups update <id> --group-name 名称 [--introduction 简介] [--requirement 要求≤65字]
```

接口：`PUT /groups/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--group-name`、`--help`、`--introduction`、`--json`、`--pretty`、`--profile`、`--requirement`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch groups delete

删除组别（SUPER/SYSTEM）

```bash
ch groups delete <id>
```

接口：`DELETE /groups/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates list

候选人分页列表（后端过滤分页；全部筛选 AND）

```bash
ch candidates list [--page N] [--size N] [--keyword 关键词] [--status 1|2|3] [--second-round-group-id N] [--third-round-group-id N] [--third-round-choice-state ALL|SELECTED|UNSELECTED] [--starred true|false] [--starred-admin-id N] [--starred-by-me true|false]
```

接口：`GET /admin/users/info/page`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--keyword`、`--page`、`--pretty`、`--profile`、`--second-round-group-id`、`--size`、`--starred`、`--starred-admin-id`、`--starred-by-me`、`--status`、`--third-round-choice-state`、`--third-round-group-id`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates list-all

候选人全量列表（旧接口，后端最多返回 200 条）

```bash
ch candidates list-all [--pretty]
```

接口：`GET /admin/users/info`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates get

候选人档案详情

```bash
ch candidates get <userId>
```

接口：`GET /users/{userId}/info`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates application

候选人报名记录

```bash
ch candidates application <userId>
```

接口：`GET /users/{userId}/application`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates interviews

候选人的全部面试记录

```bash
ch candidates interviews <userId>
```

接口：`GET /users/{userId}/interviews`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates evaluations

候选人的全部面评

```bash
ch candidates evaluations <userId>
```

接口：`GET /admin/candidates/{userId}/evaluations`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates starred-admins

特别关注面试官列表（含打星统计）

```bash
ch candidates starred-admins [--pretty]
```

接口：`GET /admin/candidates/starred-admins`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates second-round-groups

候选人二轮自选组别

```bash
ch candidates second-round-groups <userId>
```

接口：`GET /users/{userId}/second-round-groups`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates third-round-choice

候选人三面选组上下文

```bash
ch candidates third-round-choice <userId>
```

接口：`GET /admin/users/{userId}/third-round-choice`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applications list

报名记录分页列表

```bash
ch applications list [--page N] [--size N]
```

接口：`GET /admin/applications/page`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--page`、`--pretty`、`--profile`、`--size`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applications list-all

报名记录全量列表（旧接口，后端最多返回 200 条）

```bash
ch applications list-all [--pretty]
```

接口：`GET /admin/applications`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch second-round-choices

二轮考核组别自选全量列表

```bash
ch second-round-choices [--pretty]
```

接口：`GET /admin/second-round-choices`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates set-third-round-choice

修改候选人三面最终组别（原因必填；version 自动重读重试）

```bash
ch candidates set-third-round-choice <userId> --group-id N --reason 原因 [--version N]
```

接口：`PUT /admin/users/{userId}/third-round-choice`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--group-id`、`--help`、`--json`、`--pretty`、`--profile`、`--reason`、`--timeout`、`--version`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates star

切换对候选人的特别关注标记

```bash
ch candidates star <userId> --starred true|false
```

接口：`POST /admin/candidates/{userId}/star`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--starred`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates update

手动调整成员资料（仅更新传入字段）

```bash
ch candidates update <userId> -d '{"realName":"张三","phone":"138..."}'
```

接口：`PUT /users/{userId}/info`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates application-status

调整报名状态（仅未产生面试记录时可用）

```bash
ch candidates application-status <userId> --status 1|2|3
```

接口：`PATCH /admin/applications/{userId}/status`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates set-second-round-groups

设置候选人二轮考核组别

```bash
ch candidates set-second-round-groups <userId> --group-ids 1,2
```

接口：`PUT /users/{userId}/second-round-groups`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--group-ids`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch candidates unbind-wechat

解除候选人微信绑定（原因必填；后端同时失效其会话）

```bash
ch candidates unbind-wechat <userId> --reason 原因
```

接口：`DELETE /admin/users/{userId}/wechat-binding`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--reason`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch plans list

考核方案列表（一面/二轮/三面方案）

```bash
ch plans list [--round 1|2|3] [--scope-group-id N] [--status 1|2] [--pretty]
```

接口：`GET /admin/interview-plans`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--round`、`--scope-group-id`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch plans create

创建考核方案

```bash
ch plans create --round 1|2|3 --scope-group-id N --assessment-content 内容 [--assessment-image-url U] [--assessment-file-url U] [--assessment-file-name 名] [--pass-text-content T] [--pass-image-url U] [--fail-text-content T] [--fail-image-url U] [--booking-start-time "2026-09-28 14:00"] [--booking-end-time "..."] [--publish-mode REALTIME|SCHEDULED] [--publish-time "..."] [-d json]
```

接口：`POST /admin/interview-plans`。

参数：`--allow-profile-mismatch`、`--assessment-content`、`--assessment-file-name`、`--assessment-file-url`、`--assessment-image-url`、`--base-url`、`--booking-end-time`、`--booking-start-time`、`-d`、`--data`、`--fail-image-url`、`--fail-text-content`、`--help`、`--json`、`--pass-image-url`、`--pass-text-content`、`--pretty`、`--profile`、`--publish-mode`、`--publish-time`、`--round`、`--scope-group-id`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch plans update

更新考核方案（未停用且无场次时可改）

```bash
ch plans update <planId> [--assessment-content 内容] [--status 1|2] [--publish-mode ...] [--publish-time ...] [-d json]
```

接口：`PUT /admin/interview-plans/{planId}`。

参数：`--allow-profile-mismatch`、`--assessment-content`、`--assessment-file-name`、`--assessment-file-url`、`--assessment-image-url`、`--base-url`、`--booking-end-time`、`--booking-start-time`、`-d`、`--data`、`--fail-image-url`、`--fail-text-content`、`--help`、`--json`、`--pass-image-url`、`--pass-text-content`、`--pretty`、`--profile`、`--publish-mode`、`--publish-time`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch plans delete

删除已停用且无场次的考核方案

```bash
ch plans delete <planId>
```

接口：`DELETE /admin/interview-plans/{planId}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots list

面试场次列表

```bash
ch slots list [--round 1|2|3] [--scope-group-id N] [--plan-id N] [--status 1|2] [--pretty]
```

接口：`GET /admin/interview-slots`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--plan-id`、`--pretty`、`--profile`、`--round`、`--scope-group-id`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots qr

场次签到二维码/口令

```bash
ch slots qr <slotId>
```

接口：`GET /admin/interview-slots/{slotId}/checkin-qr`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots create

创建面试场次

```bash
ch slots create --plan-id N --slot-time "2026-09-28 14:00" --location 教学楼A301 --capacity 5
```

接口：`POST /admin/interview-slots`。

参数：`--allow-profile-mismatch`、`--base-url`、`--capacity`、`-d`、`--data`、`--help`、`--json`、`--location`、`--plan-id`、`--pretty`、`--profile`、`--slot-time`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots update

更新面试场次

```bash
ch slots update <slotId> [--slot-time "..."] [--location 地点] [--capacity N] [--status 1|2]
```

接口：`PUT /admin/interview-slots/{slotId}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--capacity`、`-d`、`--data`、`--help`、`--json`、`--location`、`--pretty`、`--profile`、`--slot-time`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots close

关闭场次（停止预约）

```bash
ch slots close <slotId>
```

接口：`PUT /admin/interview-slots/{slotId}/close`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots delete

删除场次

```bash
ch slots delete <slotId>
```

接口：`DELETE /admin/interview-slots/{slotId}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews list

面试名单（按轮次/组别/场次/结果筛选）

```bash
ch interviews list --round 1|2|3 [--group-id N] [--slot-id N] [--result 1|2|3] [--pretty]
```

接口：`GET /admin/interviews`。

参数：`--allow-profile-mismatch`、`--base-url`、`--group-id`、`--help`、`--json`、`--pretty`、`--profile`、`--result`、`--round`、`--slot-id`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews search

跨轮次搜索面试记录与面评关键词

```bash
ch interviews search [--keyword 关键词] [--round N] [--group-id N] [--result 1|2|3] [--pretty]
```

接口：`GET /admin/interviews/search`。

参数：`--allow-profile-mismatch`、`--base-url`、`--group-id`、`--help`、`--json`、`--keyword`、`--pretty`、`--profile`、`--result`、`--round`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews statistics

按轮次/组别的面试统计

```bash
ch interviews statistics [--round N] [--group-id N] [--pretty]
```

接口：`GET /admin/interviews/statistics`。

参数：`--allow-profile-mismatch`、`--base-url`、`--group-id`、`--help`、`--json`、`--pretty`、`--profile`、`--round`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews reschedule-options

管理员改约候选项（可改约的场次）

```bash
ch interviews reschedule-options <interviewId>
```

接口：`GET /admin/interviews/{interviewId}/reschedule-options`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews result

录入/修改单条面试结果

```bash
ch interviews result <interviewId> --result 1|2|3 [--remark 备注]
```

接口：`PATCH /admin/interviews/{interviewId}/result`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--remark`、`--result`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews attendance

补录/修正面试到场状态

```bash
ch interviews attendance <interviewId> --status ARRIVED|LATE|NO_SHOW|NOT_CHECKED_IN|CANCELLED [--reason 原因]
```

接口：`POST /admin/interviews/{interviewId}/attendance`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--reason`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews reschedule

管理员为候选人改约场次

```bash
ch interviews reschedule <interviewId> --slot <slotId>
```

接口：`PUT /admin/interviews/{interviewId}/slot`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--slot`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch interviews batch-result

批量录入面试结果

```bash
ch interviews batch-result -d <json|@file>   # {"round":1,"groupId":2,"results":[{"interviewId":11,"result":1,"remark":"..."}]}
```

接口：`POST /admin/interviews/batch-result`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch evaluations add

提交面试评价（评语必填，评分 0-100 整数选填）

```bash
ch evaluations add <interviewId> --content 评语 [--score 85]
```

接口：`POST /admin/interviews/{interviewId}/evaluations`。

参数：`--allow-profile-mismatch`、`--base-url`、`--content`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--score`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch notifications list

横幅通知列表

```bash
ch notifications list [--scope-type ALL|ROUND|GROUP|ROUND_GROUP|SLOT] [--status 1|2] [--pretty]
```

接口：`GET /admin/notifications`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--scope-type`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch notifications create

发布横幅通知

```bash
ch notifications create --title 标题 --content 内容 --notice-level INFO|WARNING|URGENT --scope-type ALL|ROUND|GROUP|ROUND_GROUP|SLOT [--target-round N] [--target-group-id N] [--target-slot-id N] [--start-time "..."] [--end-time "..."] [--status 1|2]
```

接口：`POST /admin/notifications`。

参数：`--allow-profile-mismatch`、`--base-url`、`--content`、`-d`、`--data`、`--end-time`、`--help`、`--json`、`--notice-level`、`--pretty`、`--profile`、`--scope-type`、`--start-time`、`--status`、`--target-group-id`、`--target-round`、`--target-slot-id`、`--timeout`、`--title`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch notifications update

编辑横幅通知

```bash
ch notifications update <id> [--title ...] [--content ...] [--notice-level ...] [--scope-type ...] [--start-time ...] [--end-time ...]
```

接口：`PUT /admin/notifications/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--content`、`-d`、`--data`、`--end-time`、`--help`、`--json`、`--notice-level`、`--pretty`、`--profile`、`--scope-type`、`--start-time`、`--status`、`--target-group-id`、`--target-round`、`--target-slot-id`、`--timeout`、`--title`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch notifications status

上/下线路横幅通知

```bash
ch notifications status <id> --status 1|2
```

接口：`PATCH /admin/notifications/{id}/status`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch notifications delete

删除横幅通知

```bash
ch notifications delete <id>
```

接口：`DELETE /admin/notifications/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch assistant search

面试官工作台：按学号/姓名搜索候选人

```bash
ch assistant search --keyword 张三
```

接口：`GET /admin/assistant/search`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--keyword`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch assistant profile

面试官工作台：候选人一屏档案（含全部场次与历史评价）

```bash
ch assistant profile <userId>
```

接口：`GET /admin/assistant/candidates/{userId}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch assistant submit

面试官工作台：现场打分提交（结果+评语必填）

```bash
ch assistant submit --interview-id N --result 1|2|3 --evaluation-content 评语 [--score 85] [--starred true|false]
```

接口：`POST /admin/assistant/submit`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--evaluation-content`、`--help`、`--interview-id`、`--json`、`--pretty`、`--profile`、`--result`、`--score`、`--starred`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch uploads image

上传图片（JPG/PNG/WebP，≤2MB）

```bash
ch uploads image <文件路径>
```

接口：`POST /admin/uploads`。

参数：`--allow-profile-mismatch`、`--base-url`、`--file`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch uploads assessment

上传考核附件（PDF/DOC/DOCX/XLS/XLSX/CSV/ZIP/RAR/7Z/TAR/MD，≤10MB）

```bash
ch uploads assessment <文件路径>
```

接口：`POST /admin/uploads/assessment-files`。

参数：`--allow-profile-mismatch`、`--base-url`、`--file`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch uploads ai-attachment

上传 AI Coding 题包附件（≤10MB）

```bash
ch uploads ai-attachment <文件路径>
```

接口：`POST /admin/ai-coding/paper-attachments`。

参数：`--allow-profile-mismatch`、`--base-url`、`--file`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch uploads attachment-download

下载 AI Coding 题包附件到本地文件

```bash
ch uploads attachment-download <attachmentId> --name 文件名 [--out 输出路径]
```

接口：`GET /admin/ai-coding/paper-attachments/{attachmentId}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--force`、`--help`、`--json`、`--name`、`--out`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch accounts list

管理员账号列表

```bash
ch accounts list [--pretty]
```

接口：`GET /admin/accounts`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch accounts create

创建分级管理员账号

```bash
ch accounts create --studentNo 10位学号 --password 密码 [--real-name 姓名] --admin-level SUPER|REGULAR|INTERVIEWER [--authorized-group-ids 1,2]
```

接口：`POST /admin/accounts`。

参数：`--admin-level`、`--allow-profile-mismatch`、`--authorized-group-ids`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--password`、`--pretty`、`--profile`、`--real-name`、`--studentNo`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch accounts batch

批量创建同级别管理员账号

```bash
ch accounts batch --count N --password 初始密码 --admin-level SUPER|REGULAR|INTERVIEWER [--authorized-group-ids 1,2]
```

接口：`POST /admin/accounts/batch`。

参数：`--admin-level`、`--allow-profile-mismatch`、`--authorized-group-ids`、`--base-url`、`--count`、`-d`、`--data`、`--help`、`--json`、`--password`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch accounts update

修改管理员资料/级别/授权组别

```bash
ch accounts update <id> [--real-name 姓名] [--admin-level SUPER|REGULAR|INTERVIEWER] [--authorized-group-ids 1,2]
```

接口：`PUT /admin/accounts/{id}`。

参数：`--admin-level`、`--allow-profile-mismatch`、`--authorized-group-ids`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--real-name`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch accounts reset-password

重置管理员密码

```bash
ch accounts reset-password <id> --password 新密码
```

接口：`PUT /admin/accounts/{id}/password`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--password`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch accounts delete

删除管理员账号（初始管理员与自身由后端拒绝）

```bash
ch accounts delete <id>
```

接口：`DELETE /admin/accounts/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applies list

管理员申请审批列表

```bash
ch applies list [--status 0|1|2] [--pretty]
```

接口：`GET /admin/account-applications`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applies pending-count

未审批申请数量

```bash
ch applies pending-count
```

接口：`GET /admin/account-applications/pending-count`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applies approve

审批通过（自动开通账号，账号=学号，初始密码=学号）

```bash
ch applies approve <id>
```

接口：`POST /admin/account-applications/{id}/approve`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applies reject

驳回申请（原因必填）

```bash
ch applies reject <id> --reason 驳回原因
```

接口：`POST /admin/account-applications/{id}/reject`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--reason`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applies status

按学号查询申请进度（公开接口，免登录）

```bash
ch applies status <studentNo>
```

接口：`GET /account-applications/status`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch applies submit

提交管理员账号申请（公开接口，免登录）

```bash
ch applies submit --studentNo 10位学号 --real-name 姓名 --position-code CAPTAIN|LEADER|MEMBER [--apply-group-id N]
```

接口：`POST /account-applications`。

参数：`--allow-profile-mismatch`、`--apply-group-id`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--position-code`、`--pretty`、`--profile`、`--real-name`、`--studentNo`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch profile get

当前管理员个人资料

```bash
ch profile get
```

接口：`GET /admin/profile`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch profile update

修改个人资料

```bash
ch profile update --real-name 姓名 [--group-id N] [--phone 手机号]
```

接口：`PUT /admin/profile`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--group-id`、`--help`、`--json`、`--phone`、`--pretty`、`--profile`、`--real-name`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch profile change-password

修改当前账号登录密码

```bash
ch profile change-password --password 新密码
```

接口：`PUT /admin/profile/password`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--password`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch ai plans

AI Coding 计划：list/get/create/update/publish/withdraw/starts/publication/credential

```bash
ch ai plans list [--page N] [--page-size N] [--status DRAFT|PUBLISHED] [--group-id N]
  ch ai plans get <id>
  ch ai plans create --name 名 --group-ids 1,2 [--opens-at "..."] [--closes-at "..."] [--publish-at "..."] [--survey-seconds N] [--coding-seconds N] [--reflection-seconds N] [--reflection-mode STATIC|PERSONALIZED] [-d @plan.json]
  ch ai plans update <id> [...同 create...] [--version N]   # version 缺省自动重读
  ch ai plans publish <id>
  ch ai plans withdraw <id> --reason 原因
  ch ai plans starts <id> --paused true|false --reason 原因
  ch ai plans publication <id> --publish-at "..." --reason 原因
  ch ai plans credential <id> <modelId> --api-key sk-... --reason 原因
```

接口：`GET /admin/ai-coding/plans`、`POST /admin/ai-coding/plans`、`GET /admin/ai-coding/plans/{id}`、`PUT /admin/ai-coding/plans/{id}`、`POST /admin/ai-coding/plans/{id}/publish`、`POST /admin/ai-coding/plans/{id}/withdraw`、`PATCH /admin/ai-coding/plans/{id}/starts`、`PATCH /admin/ai-coding/plans/{id}/publication`、`PUT /admin/ai-coding/plans/{id}/models/{modelId}/credential`。

参数：`--allow-profile-mismatch`、`--api-key`、`--base-url`、`--closes-at`、`--coding-seconds`、`-d`、`--data`、`--group-id`、`--group-ids`、`--help`、`--json`、`--name`、`--opens-at`、`--page`、`--page-size`、`--paused`、`--pretty`、`--profile`、`--publish-at`、`--reason`、`--reflection-mode`、`--reflection-seconds`、`--request-id`、`--status`、`--survey-seconds`、`--timeout`、`--version`、`--key-version`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch ai attempts

AI Coding 考次：list/get/grade/void

```bash
ch ai attempts list [--page N] [--page-size N] [--plan-id N] [--group-id N] [--state SURVEY|CODING|REFLECTION|SUBMITTED|VOIDED] [--grade-state UNGRADED|HIDDEN|PUBLISHED|VOIDED] [--keyword 关键词]
  ch ai attempts get <id>
  ch ai attempts grade <id> --score 85 --public-comment 公开评价 --internal-comment 内部评价 [--reason 修正原因]
  ch ai attempts void <id> --reason 原因
```

接口：`GET /admin/ai-coding/attempts`、`GET /admin/ai-coding/attempts/{id}`、`PUT /admin/ai-coding/attempts/{id}/grade`、`POST /admin/ai-coding/attempts/{id}/void`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--grade-state`、`--group-id`、`--help`、`--internal-comment`、`--json`、`--keyword`、`--page`、`--page-size`、`--plan-id`、`--pretty`、`--profile`、`--public-comment`、`--reason`、`--request-id`、`--score`、`--state`、`--timeout`、`--version`、`--expected-revision`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch ai candidates

AI Coding 考生资格：list/retake（安排重考）

```bash
ch ai candidates list [--page N] [--page-size N] [--plan-id N] [--group-id N] [--eligibility NOT_REQUIRED|WAITING_SELECTION|INELIGIBLE|EXEMPT|REQUIRED] [--keyword 关键词]
  ch ai candidates retake <userId> --plan-id N --assignment-version N --opens-at "..." --closes-at "..." --reason 原因
```

接口：`GET /admin/ai-coding/candidates`、`POST /admin/ai-coding/candidates/{userId}/retake`。

参数：`--allow-profile-mismatch`、`--assignment-version`、`--base-url`、`--closes-at`、`-d`、`--data`、`--eligibility`、`--group-id`、`--help`、`--json`、`--keyword`、`--opens-at`、`--page`、`--page-size`、`--plan-id`、`--pretty`、`--profile`、`--reason`、`--request-id`、`--timeout`、`--version`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu status

飞书签到集成状态

```bash
ch feishu status [--pretty]
```

接口：`GET /admin/feishu/status`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu reconcile

触发飞书场次双向对账

```bash
ch feishu reconcile
```

接口：`POST /admin/feishu/reconcile`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu conflicts

飞书同步冲突列表

```bash
ch feishu conflicts [--pretty]
```

接口：`GET /admin/feishu/conflicts`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch checkin launch

创建签到大屏会话（8 小时有效，screenToken 仅经 header 传递，不落盘）

```bash
ch checkin launch
```

接口：`POST /admin/checkin-screens`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch checkin snapshot

读取签到大屏当前快照（screenToken 经 X-Checkin-Screen-Token header，绝不携带管理员 JWT）

```bash
ch checkin snapshot --screen-token <token> [--group-id N ...]
```

接口：`GET /checkin-screens/current`。

参数：`--allow-profile-mismatch`、`--base-url`、`--group-id`、`--help`、`--json`、`--pretty`、`--profile`、`--screen-token`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch second-round-choices page

分页查询二轮组别选择

```bash
ch second-round-choices page [--page N] [--size N]
```

接口：`GET /admin/second-round-choices/page`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--page`、`--pretty`、`--profile`、`--size`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch slots attendance

查看场次到场名单

```bash
ch slots attendance <slotId>
```

接口：`GET /admin/interview-slots/{slotId}/attendance`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu backfill-absence

补推当天缺勤通知（会向真人发送通知，仅全局管理员）

```bash
ch feishu backfill-absence
```

接口：`POST /admin/feishu/notifications/backfill-today-absence`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu refresh-document

刷新飞书场次文档（外部写入，仅全局管理员）

```bash
ch feishu refresh-document
```

接口：`POST /admin/feishu/upcoming-slots-document/refresh`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu deliveries

查询飞书投递队列（最多200条，仅全局管理员）

```bash
ch feishu deliveries [--status QUEUED|SENDING|SENT|FAILED|SKIPPED|RETRY]
```

接口：`GET /admin/feishu/deliveries`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--status`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch feishu requeue

重放失败/跳过投递（可能向真人补发通知，仅全局管理员）

```bash
ch feishu requeue [--ids 1,2] [--all]
```

接口：`POST /admin/feishu/deliveries/requeue`。

参数：`--all`、`--allow-profile-mismatch`、`--base-url`、`--help`、`--ids`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch ai materials

上传/预览出题资料（需新版后端；上传不支持requestId去重）

```bash
ch ai materials upload <file>
ch ai materials get <materialId>
```

接口：`POST /admin/ai-coding/materials`、`GET /admin/ai-coding/materials/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：material-authoring backend (not included in this CLI release)。

## ch ai papers

创建出题任务/查询任务/确认题目（需新版后端）

```bash
ch ai papers generate <planId> <paperId> [--version N] [--request-id ID]
ch ai papers get-generation <planId> <paperId> <jobId>
ch ai papers confirm <planId> <paperId> [--version N] [--request-id ID]
```

接口：`POST /admin/ai-coding/plans/{planId}/papers/{paperId}/generations`、`GET /admin/ai-coding/plans/{planId}/papers/{paperId}/generations/{jobId}`、`POST /admin/ai-coding/plans/{planId}/papers/{paperId}/confirm`。

参数：`--allow-profile-mismatch`、`--base-url`、`-d`、`--data`、`--help`、`--json`、`--pretty`、`--profile`、`--request-id`、`--timeout`、`--version`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：material-authoring backend (not included in this CLI release)。

## ch capabilities

离线机器可读能力目录（含参数、读写、权限、幂等与后端要求）

```bash
ch capabilities [--json]
```

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch agent install

为 agent 安装原生技能/插件（仅本地，不含凭据）

```bash
ch agent install <agent> [--scope user|project]
```

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--scope`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

## ch analysis resources

查询全量只读数据目录、字段、过滤条件及实际后端可用性

```bash
ch analysis resources
```

接口：`GET /admin/analysis/resources`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：backend v36 data-analysis permission (CLI 0.3.0)。

## ch analysis list

按主键游标查询全量业务数据（不推进业务状态）

```bash
ch analysis list <resource> [--cursor 游标] [--size 100] [--filters JSON或@文件]
```

接口：`GET /admin/analysis/resources/{resource}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--cursor`、`--filters`、`--help`、`--json`、`--pretty`、`--profile`、`--size`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：backend v36 data-analysis permission (CLI 0.3.0)。

## ch analysis get

读取单条分析记录，包括题目、答卷和评价（按字段白名单）

```bash
ch analysis get <resource> <id>
```

接口：`GET /admin/analysis/resources/{resource}/{id}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：backend v36 data-analysis permission (CLI 0.3.0)。

## ch analysis export

逐页导出 JSONL，全部成功后原子落盘；多页不是同一时刻快照

```bash
ch analysis export <resource> --out ./data.jsonl [--size 100] [--filters JSON或@文件] [--force]
```

接口：`GET /admin/analysis/resources/{resource}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--filters`、`--force`、`--help`、`--json`、`--out`、`--pretty`、`--profile`、`--size`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：backend v36 data-analysis permission (CLI 0.3.0)。

## ch analysis download

受鉴权下载分析附件到本地；不支持任意 URL 或服务器路径

```bash
ch analysis download <attachmentId> --out ./attachment [--force]
```

接口：`GET /admin/analysis/attachments/{attachmentId}`。

参数：`--allow-profile-mismatch`、`--base-url`、`--force`、`--help`、`--json`、`--out`、`--pretty`、`--profile`、`--timeout`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：backend v36 data-analysis permission (CLI 0.3.0)。

## ch accounts analysis-permission

SYSTEM 开启/关闭管理员数据分析权限（版本冲突须刷新）

```bash
ch accounts analysis-permission <id> --enabled true|false --version N
```

接口：`PUT /admin/accounts/{id}/data-analysis-permission`。

参数：`--allow-profile-mismatch`、`--base-url`、`--enabled`、`--help`、`--json`、`--pretty`、`--profile`、`--timeout`、`--version`。未知、不适用参数及多余位置参数在请求前返回 exit 2。

后端要求：backend v36 data-analysis permission (CLI 0.3.0)。
