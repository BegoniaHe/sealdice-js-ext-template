# 发布扩展

只在扩展已经能在 SealDice 中正常运行，并且已确定支持哪个 API target 后，再进行本流程。

## 1. 准备元数据

替换 `extension.json` 的全部默认值：

- `id` 是稳定的运行时 id，也是发布文件名的一部分。一旦用户可能已安装扩展，就不要再修改它。
- 按语义化版本递增 `version`。
- 填写真实的名称、作者、描述、license 和主页 URL。
- 让根目录 `LICENSE` 文件与 `extension.json` 的 `license` 一致。

`./sealw package` 会故意拒绝模板默认 id、名称、作者和主页，避免只改了一部分信息就发布了改名副本。

发布 `.sealpack` 时，还要替换 `seal.config.json` 中的 `sealpack.packageId`。它是稳定的
`作者/包名` 商店/包身份，和 userscript `id` 有意分离。发布前检查 `minSealDice`、脚本目标路径、显式
assets、商店信息、依赖和权限声明。

## 2. 验证所支持的 target

只发布给一个精确 SealDice 版本时：

```sh
./sealw check --target 1.6.0
```

发布兼容扩展时，验证所有已注册 target：

```sh
./sealw check --all-targets
```

只能声称 target 列出的宿主版本。例如，本仓库中的 `compat-1.5.x` 仅表示 1.5.0 和 1.5.1，不能理解为所有当前或未来
1.5 发行版。

## 3. 生成发布文件

旧式 JavaScript 产物对所有已注册 target 保持可用：

```sh
./sealw package --target compat-1.5.x
```

要生成 SealDice 1.6+ 扩展包，选择满足 `sealpack.minSealDice` 的精确 target：

```sh
./sealw package --format sealpack --target 1.6.0
```

同一精确 target 同时发布两种形式：

```sh
./sealw package --format both --target 1.6.0
```

命令会重复必要检查，并写入：

```text
release/<extension-id>-<version>.js
release/<extension-id>-<version>.js.sha256
release/<package-name>@<version>.sealpack
release/<package-name>@<version>.sealpack.sha256
release/manifest.json
```

`manifest.json` 会列出所有选择的产物、target profile 和 profile hash。分发前逐个检查 SHA-256：`.js` 继续按旧
JavaScript 脚本流程上传；`.sealpack` 应通过 SealDice 1.6+ 的扩展包流程上传，或发布到扩展商店。两种格式都应尽量一并发布
checksum 与 manifest。

不要分发 `dev/` 中的文件。它们是开发产物，含 source map，并且 `watch` 运行时可能继续变动。

## GitHub 发布工作流

手动触发 **Release SealDice Extension** 工作流时，需要填写：

- `target`：已在 `seal.config.json` 注册的 target。
- `format`：`js`、`sealpack` 或 `both`；`sealpack` 需要不低于
  `sealpack.minSealDice` 的精确 target。
- `tag`：必须精确等于 `v` 加 `extension.json` 的版本，例如 `v1.2.3`。
- `draft`：通常保持开启，检查生成附件后再公开发布 GitHub Release。

工作流提供和 CLI 相同的 `format` 输入（`js`、`sealpack` 或 `both`）。它会运行 `package`、为生成的
发布文件创建 attestation，并将所选产物、checksum 和 manifest 附到 GitHub Release。
