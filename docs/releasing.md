# Releasing an Extension

1. 将 [`extension.json`](../extension.json) 的 `id`、`name`、`author`、`version`、
   `description`、`license` 和 `homepageUrl` 改为真实项目值。`id` 是运行时扩展唯一标识和
   发布文件名的一部分，发布后不要随意更改。
2. 确认根目录 [`LICENSE`](../LICENSE) 与 `extension.json` 的 `license` 一致。
3. 为所支持的 API 策略运行 `./sealw check --target <id>`，兼容 1.5 扩展使用
   `./sealw check --all-targets`。
4. 运行 `./sealw package --target <id>`。该命令会重复必要检查，因此不会从未验证的源码直接
   生成 release。
5. 核对 `release/manifest.json` 中的 `id`、版本、profile hash 和 SHA-256，再上传 `.js`、
   `.sha256` 与 manifest。

GitHub 上使用 **Release SealDice Extension** 手动工作流时，`target` 必须与 package 命令一致，
`tag` 通常使用 `v` 加 extension version。工作流先运行 package，再为 `.js` 生成 provenance
attestation，最后创建 GitHub Release；在草稿中检查附件后再发布。

模板默认身份只能用于本地开发。`package` 会拒绝它，避免将示例名称、作者或主页作为实际扩展发布。
