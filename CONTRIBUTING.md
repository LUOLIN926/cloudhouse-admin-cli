# 参与贡献

请先说明问题、复现步骤与预期行为。使用虚构数据，不提供真实账号、密码、令牌、附件或业务导出。漏洞按 SECURITY.md 私密报告。

Node.js ≥18；无运行时依赖。运行 npm test、npm run check:security。接口变更须同步 test-support/api-contract.json、命令能力、公共文档与必要回归测试；接口快照必须经真实后端契约核验，不得仅照注册表生成后冒充覆盖证据。

修改统一 skills/cloudhouse-admin 后运行 npm run sync:integrations；文档和五类接入包共用这一份技能。下载包只能从经过审查的干净 Git 提交构建，不能包含本机会话或业务数据。提交贡献即同意按 MIT 许可贡献代码。
