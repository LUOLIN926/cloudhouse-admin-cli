# CloudHouse Admin — dsh

安装 CLI 后运行 `ch agent install dsh --scope user` 或 `--scope project`。

凭据只由本机 CLI 会话或环境提供；本包不含凭据。详见 https://dayunwu.cn/cli/#agents 。

本地 Cordis 配置示例：

```yaml
- id: cloudhouse-admin
  name: /absolute/path/to/dsh/index.mjs
```

在桌面插件管理器导入本目录插件并启用。该插件需要宿主 skills 服务；由模型的 skill 工具发现 cloudhouse-admin，然后通过宿主终端调用 ch。
