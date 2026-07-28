# 发布扩展

只在扩展已经能在 SealDice 中正常运行，并且已确定支持哪个 API target 后，再进行本流程。

## 1. 准备元数据

替换 `extension.json` 的全部默认值：

- `id` 是稳定的运行时 id，也是发布文件名的一部分。一旦用户可能已安装扩展，就不要再修改它。
- 按语义化版本递增 `version`。
- 填写真实的名称、作者、描述、license 和主页 URL。
- 让根目录 `LICENSE` 文件与 `extension.json` 的 `license` 一致。

`./sealw package` 会故意拒绝模板默认 id、名称、作者和主页，避免只改了一部分信息就发布了改名副本。

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

```sh
./sealw package --target compat-1.5.x
```

命令会重复必要检查，并写入：

```text
release/<extension-id>-<version>.js
release/<extension-id>-<version>.js.sha256
release/manifest.json
```

检查 `manifest.json`：其中的 id、版本、target profile、profile hash 和 SHA-256 必须与准备分发的文件一致。将 `.js` 上传到
SealDice；有条件时一并发布 checksum 与 manifest。

不要分发 `dev/` 中的文件。它们是开发产物，含 source map，并且 `watch` 运行时可能继续变动。

## GitHub 发布工作流

手动触发 **Release SealDice Extension** 工作流时，需要填写：

- `target`：已在 `seal.config.json` 注册的 target。
- `tag`：必须精确等于 `v` 加 `extension.json` 的版本，例如 `v1.2.3`。
- `draft`：通常保持开启，检查生成附件后再公开发布 GitHub Release。

工作流会运行 `package`、为 JavaScript 产物生成 attestation，并将 bundle、checksum 和 manifest 附到 GitHub Release。
