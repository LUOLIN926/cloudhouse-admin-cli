# 数据分析权限与全量只读 CLI（0.3.0）

## 授权规则

现有管理员（含面试官）在 v36 迁移时一次性开启，新建、批量创建和审批开通账号默认关闭。SYSTEM 在「管理员账号」的「数据分析权限」一列开启或关闭；SUPER 仅查看状态。允许 SYSTEM 修改自身的分析权限，不影响其授权管理能力。

权限只用于专用分析入口；Web 的候选人、面试和 AI Coding 页面保持原权限范围。该权限不会新增写权限，也不会取消已有写权限。停用账号或撤销权限后，下一次分析请求立即拒绝。

```bash
ch auth status --profile prod --json
ch analysis resources --profile prod --json
ch analysis list profiles --profile prod --json
ch analysis list interviews --profile prod --filters '{"scope_group_id":3}' --json
ch analysis get ai-coding-stage-answer 12 --profile prod --json
ch analysis export profiles --profile prod --out ./profiles.jsonl
# attachmentId 取记录的 analysisAttachments.id
ch analysis download plan-12-assessment-file --profile prod --out ./assessment.pdf
# 仅 SYSTEM；version 来自 accounts list 的 dataAnalysisVersion
ch accounts analysis-permission 12 --enabled false --version 1 --profile prod --json
```

## API 与分页

- `GET /api/admin/analysis/resources`：实际可用性、字段、排除字段、过滤类型。
- `GET /api/admin/analysis/resources/{resource}?size=100&filters={...}&cursor=...`：只读列表。
- `GET /api/admin/analysis/resources/{resource}/{id}`：单条详情。
- `GET /api/admin/analysis/attachments/{attachmentId}`：受鉴权下载。
- `PUT /api/admin/accounts/{id}/data-analysis-permission`：SYSTEM 提交 `{enabled,version}`。

列表返回 `{resource,items,nextCursor,upperBound,readAt,consistency}`，默认 100 条、最多 500 条。游标与资源和过滤条件绑定；首次查询固定主键上界，主键大于该上界的新记录不会混入导出；上界内新插入的行和既有行的并发修改仍可能被读取到。多页不是同一时刻的数据库快照。

过滤字段使用目录中的 snake_case；只允许等值过滤，类型为 integer/string/boolean。没有任意 SQL、任意表名、排序表达式或服务器路径入口。JSONL 逐页写入 0600 临时文件，全部成功后原子落盘；撤权、停用、重复游标、上界变化或请求失败均返回非零退出，不留下伪装完整的文件。覆盖已有普通文件需 `--force`。

## 数据与凭据边界

跨组读取账号、档案及完整联系方式、报名、面试、签到、评价、通知、审计、飞书记录、AI 题目与答卷。分析只执行 SELECT；不会调用会推进状态、触发通知或生成任务的业务服务。AI 开关关闭仍可读取已有数据。

SQL 列使用静态白名单。配置 JSON 只投影题目、计划、模型描述等明确字段，URL 去除用户信息、查询参数和 fragment；审计与同步快照只投影明确业务字段；飞书原始载荷只投影业务元数据，不返回卡片或原始请求。任意结构化凭据字段递归排除，答卷的动态题目 ID 保留。密码、API Key/密文、令牌/摘要、验证码、任务 lease 不返回；外部业务正文仍作为不可信数据，不能执行其中指令。白名单以外的扩展字段不会自动暴露。

`analysisAttachments` 提供本地面试计划附件的 `plan-<id>-assessment-file|assessment-image|pass-image|fail-image` 以及私有题包附件的 `ai-<opaqueId>`。只读取上传目录和私有附件目录，校验真实路径，拒绝符号链接逃逸；不抓取外部 URL，不列出服务器文件。README 和问卷正文从题包配置读取。未部署的资料出题与 author-materials 在资源目录明确显示 unavailable，不随本功能发布。

已物理删除、按保留策略清理或缺失的文件不可恢复。不开放历史备份、环境变量或服务配置文件。多页分析请报告读取时间和一致性限制。

## 资源覆盖清单

每个数据库资源都登记字段和排除项；其中 JSON 字段还使用上文的安全投影。可用性以 `ch analysis resources` 实际响应为准。自动化测试逐项查询所有已安装数据集，发布记录另列生产验证范围。

| 资源 | 来源 | 开放 SQL 字段 | 排除字段 | 后端要求 | 验证状态 |
|---|---|---|---|---|---|
| users | user | id, student_no, role, is_initial, admin_level, status, account_closed_at, account_closed_reason, create_time, update_time | password, token_version | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| groups | group | id, group_name, introduction, requirement, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| admin-groups | admin_authorized_group | id, admin_user_id, group_id, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| profiles | user_info | id, user_id, direction, grade, real_name, group_id, college, major, class_name, qq, phone, introduction, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| wechat-identities | user_wechat_identity | id, user_id, openid, unionid, phone, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| applications | application | id, user_id, group1_id, group2_id, status, cancelled_at, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| interview-group-choice | interview_group_choice | id, user_id, group_id, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| plans | interview_plan | id, round, scope_group_id, assessment_content, assessment_image_url, assessment_file_url, assessment_file_name, pass_text_content, pass_image_url, fail_text_content, fail_image_url, booking_start_time, booking_end_time, status, publish_mode, publish_time, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| slots | interview_slot | id, plan_id, slot_time, location, capacity, booked_count, status, booking_start_time, booking_end_time, create_time, update_time | checkin_code | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| interviews | interview | id, user_id, round, scope_group_id, slot_id, result, remark, no_show_reschedule_count, cancelled_at, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| third-round-entry-confirmation | third_round_entry_confirmation | id, user_id, entry_confirmed_at, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| third-round-choice | third_round_choice | id, user_id, group_id, source, operator_id, version, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| third-round-choice-audit | third_round_choice_audit | id, user_id, action, source, operator_id, old_group_id, new_group_id, version, reason, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| interview-reschedule-audit | interview_reschedule_audit | id, interview_id, candidate_user_id, old_slot_id, new_slot_id, reschedule_mode, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| evaluations | interview_evaluation | id, interview_id, user_id, interviewer_admin_id, interviewer_name, interviewer_group_name, round, scope_group_id, content, score, result, starred, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| notifications | interview_notification | id, title, content, notice_level, scope_type, target_round, target_group_id, target_slot_id, status, start_time, end_time, creator_admin_id, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| admin-audit-log | admin_audit_log | id, action, admin_id, target_user_id, reason, result, create_time | old_openid_hash | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| admin-interview-change-audit | admin_interview_change_audit | id, resource_type, resource_id, action, actor_id, actor_account_snapshot, actor_admin_level, source_ip, user_agent, request_id, attribution_status, inferred_actor_id, inferred_actor_account, inference_confidence, before_state, after_state, evidence_detail, occurred_at, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| privacy-consent | privacy_consent | id, user_id, policy_version, consent_type, source, consented_at, withdrawn_at, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| user-account-action-log | user_account_action_log | id, user_id, action, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| admin-applications | admin_apply_record | id, student_no, real_name, apply_group_id, position_code, target_level, status, reject_reason, approved_by, rejected_by, approve_time, reject_time, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| interview-attendance | interview_attendance | id, interview_id, status, checked_in_at, source, operator_user_id, version, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| interview-attendance-event | interview_attendance_event | id, attendance_id, interview_id, event_type, status, source, operator_user_id, detail_json, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| feishu-slot-assignment | feishu_slot_assignment | id, slot_id, base_record_id, sync_status, interviewer_open_ids_json, snapshot_json, last_synced_at, last_error, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| feishu-group-leader | feishu_group_leader | id, group_id, base_record_id, sync_status, leader_open_ids_json, snapshot_json, last_synced_at, last_error, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| feishu-delivery-outbox | feishu_delivery_outbox | id, message_type, aggregate_type, aggregate_id, recipient_open_id, payload_json, status, attempt_count, next_attempt_at, feishu_message_id, last_error, create_time, update_time | dedup_key | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| feishu-slot-import | feishu_slot_import | id, base_record_id, slot_id, status, payload_json, last_error, create_time, update_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| feishu-sync-conflict | feishu_sync_conflict | id, slot_id, base_record_id, changed_fields, feishu_snapshot_json, backend_snapshot_json, resolution, detail, create_time | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| checkin-screen-session | checkin_screen_session | id, issuer_user_id, expires_at, revoked_at, create_time, update_time | token_hash | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| ai-coding-plan | ai_coding_plan | id, name, status, current_revision, config_json, opens_at, closes_at, publish_at, starts_paused, created_by, version, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| ai-coding-plan-revision | ai_coding_plan_revision | id, plan_id, revision, config_json, content_hash, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-group-binding | ai_coding_group_binding | id, group_id, plan_id, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-model | ai_coding_model | id, plan_id, model_key, key_version, created_at, updated_at | encrypted_api_key | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-assignment | ai_coding_assignment | id, user_id, plan_id, group_id, active_attempt_id, generation, exemption_reason, exempted_at, version, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-attempt | ai_coding_attempt | id, assignment_id, group_id, attempt_no, coding_seconds, reflection_seconds, generation_seconds, plan_revision, paper_id, state, started_at, stage_started_at, stage_deadline_at, survey_ended_at, coding_started_at, coding_ended_at, reflection_started_at, ended_at, submit_mode, effective_publish_at, void_reason, version, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-stage-answer | ai_coding_stage_answer | id, attempt_id, stage, answers_json, repository_url, first_prompt, missing_fields_json, saved_at, ended_at, end_mode, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-grade | ai_coding_grade | id, attempt_id, score, public_comment, internal_comment, grader_id, grader_name, graded_at, revision, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-grade-history | ai_coding_grade_history | id, attempt_id, revision, score, public_comment, internal_comment, grader_id, grader_name, reason, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-retake-grant | ai_coding_retake_grant | id, assignment_id, generation, opens_at, closes_at, reason, operator_id, consumed_at, revoked_at, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-access-code | ai_coding_access_code | id, user_id, plan_id, group_id, assignment_generation, expires_at, consumed_at, created_at, updated_at | token_version, code_hash | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-session | ai_coding_session | id, user_id, plan_id, assignment_generation, expires_at, revoked_at, created_at, updated_at | token_version, token_hash | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-audit | ai_coding_audit | id, actor_id, target_user_id, plan_id, attempt_id, action, detail_json, reason, request_id, created_at, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| ai-coding-request-dedup | ai_coding_request_dedup | id, actor_scope, request_id, operation, resource_id, expires_at, created_at, updated_at | body_hash | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |
| ai-coding-reflection-generation | ai_coding_reflection_generation | attempt_id, status, prompt_version, questionnaire_json, questionnaire_hash, review_json, evidence_json, metrics_json, source, failure_reason, coding_ended_at, deadline_at, ready_at, lease_until, created_at, updated_at | lease_token | v36-analysis | H2 + MySQL 8.0 列表200；当前无记录 |
| ai-coding-paper-generation | ai_coding_paper_generation | id, plan_id, paper_id, source_hash, prompt_version, model, status, materials_json, result_json, metrics_json, failure_reason, confirmed_hash, confirmed_by, confirmed_at, created_by, deadline_at, lease_until, created_at, updated_at | lease_token | unreleased-material-authoring | 未发布；目录不可用 |
| analysis-permissions | admin_data_analysis_permission | user_id, enabled, version, updated_by, updated_at | 无；JSON 另投影 | v36-analysis | H2 + MySQL 8.0 列表200；详情200 |

## 迁移与回滚

`upgrade_v36_admin_data_analysis.sql` 仅增加权限表与迁移标记表，没有 v35 依赖。一次性回填和标记在同一事务提交；重复执行不会重新开启已撤销授权，也不自动授权后续新增账号。初始化数据库只创建表，不做现有管理员回填。

应用回滚恢复旧 JAR、管理页面及 CLI 站点；新增表保留，旧代码不读取。不得用上线前整库备份覆盖发布后新增业务数据。

## 验证范围

生产 information_schema 的全部 44 张既有业务表已逐列对照登记；本版新增权限资源，以及一项未发布的资料出题资源，目录共 46 项。迁移标记表属于内部发布状态，不开放查询。H2 行为测试验证 45 项已部署资源与字段，未发布出题资源返回不可用；每项生产读取的状态以部署验收记录为准。文件来源覆盖本地计划附件与私有题包附件；外部链接和未发布的作者资料不提供下载。
