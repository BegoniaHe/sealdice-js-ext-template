# SealDice JavaScript Extension Template

面向 SealDice `1.5.0`、`1.5.1` 与 `1.6.0` 的 TypeScript 扩展模板。它提供可复现的
构建、目标 API 声明、profile 驱动 mock、发布校验和 API 漂移维护工具。

`extension.json` 是扩展身份的唯一来源：运行时扩展 ID、userscript header、发布文件名和
release manifest 都由它生成。先修改它，再开始开发。

## Quick Start

需要 POSIX shell（macOS/Linux）、Node `26.5.0` 与 npm `12.0.1`。已安装
[mise](https://mise.jdx.dev/) 时，下面的命令会使用仓库锁定的工具链；否则先让同版本的
`node` 和 `npm` 出现在 `PATH` 中再直接运行 `./sealw`。

```sh
mise install
mise exec -- ./sealw doctor
mise exec -- ./sealw install

# 修改 extension.json 和 src/ 后，持续生成可上传的开发产物。
mise exec -- ./sealw watch --target compat-1.5.x
```

`watch` 写入 `dev/sealdice-js-ext.js`。在 SealDice 管理界面启用 JS 扩展后，将此文件上传到
脚本管理并重新加载脚本；核心也提供受认证的 `js/upload` 与 `js/reload` API。开发产物写入
采用原子替换，上传时不会读到半个 bundle。

## Target Policy

| 目标              | 使用时机                                                | 验证命令                       |
| ----------------- | ------------------------------------------------------- | ------------------------------ |
| `compat-1.5.x`    | 一个 bundle 同时支持 `1.5.0` 与 `1.5.1`；推荐默认选择。 | `./sealw check --all-targets`  |
| `1.5.0` / `1.5.1` | 仅支持某个明确宿主版本。                                | `./sealw check --target <id>`  |
| `1.6.0`           | 使用 1.6 新增的配置分组参数等精确 API。                 | `./sealw check --target 1.6.0` |

`compat-1.5.x` 不包含 1.6 API。`check --all-targets` 对兼容声明做 typecheck，并对每个精确
mock host 构建和执行实际 bundle smoke；精确目标扩展则应使用对应的 `--target` 检查。

## Daily Commands

```text
./sealw doctor [--json]                         Diagnose toolchain, config and extension metadata
./sealw fmt [--check]                           Format or verify formatting
./sealw lint                                    Run ESLint
./sealw typecheck --target <id>                 Typecheck one API profile
./sealw test --target <id>|--all-targets        Run Node, mock-host and bundle tests
./sealw check --target <id>|--all-targets       Run formatting, lint, typechecks and tests
./sealw watch --target <id>                     Rebuild dev/sealdice-js-ext.js on source changes
./sealw build --target <id>                     Build dist/sealdice-js-ext.js
./sealw package --target <id>                   Verify and create release artifacts
./sealw clean                                   Remove only generated directories
```

`SEAL_TARGET`、`SEAL_CORE_DIR` 和 `SEAL_OFFLINE` 是支持的环境覆盖项。npm 与
`package-lock.json` 是唯一的包管理器和 lockfile；依赖变更请使用 `./sealw deps`。
常用 npm 别名为 `npm run dev`、`npm run build`、`npm test` 和 `npm run check`，它们分别对应
兼容目标 watch、build、全目标测试和完整检查。

## Release

`package` 会拒绝模板默认身份、执行完整目标检查、生成 production bundle，并写入：

```text
release/<extension-id>-<version>.js
release/<extension-id>-<version>.js.sha256
release/manifest.json
```

完成 `extension.json` 和 `LICENSE` 的实际项目替换后运行：

```sh
./sealw package --target compat-1.5.x
```

手动 GitHub Actions 工作流 **Release SealDice Extension** 会重复上述检查、生成构建来源证明，
并创建 draft 或正式 GitHub Release。详见 [`docs/releasing.md`](docs/releasing.md)。

## API Profiles

`api/profiles/` 是 `Dice.JsInit` 的静态 Go AST 快照，`types/profiles/` 是匹配的 TypeScript
声明，`api/reports/` 是可审阅的 API 表。`compat-1.5.x` 是两个 1.5 profile 的生成交集；新 API
必须通过运行时特性检测或采用精确目标。

`1.6.0` 来自官方 `sealdice-build` 发布的锁定 core commit，而不是不存在的 core tag。其 release、
source、artifact digest 和观测运行时版本均记录在 override 中。维护流程、来源约束和可选 goja
probe 见 [`docs/api-profiles.md`](docs/api-profiles.md)。

手动 **Refresh SealDice API Profile** 工作流会生成可下载的二进制 patch；选择创建 PR 后才会把
变更推送到仓库。开始前须先在 `api/overrides/<target>.json` 记录发行版 provenance。

## CI

常规 CI 在 `npm ci` 后离线运行 `./sealw check --all-targets`。它不拉取或编译 SealDice core；
profile 刷新与发布均为人工触发的单独工作流。
