# SealDice JavaScript Extension Template

面向 SealDice 的 TypeScript 扩展模板。当前内置 `1.5.0`、`1.5.1`、`1.6.0` 三个精确 API
profile，以及覆盖前两个版本的 `compat-1.5.x` profile；后续支持版本由配置注册，而非写死在
CLI 中。它提供可复现的构建、目标 API 声明、profile 驱动 mock、发布校验和 API 漂移维护工具。

`extension.json` 是旧式 JavaScript 扩展的运行时身份来源：运行时扩展 ID、userscript header 与
`.js` 发布文件名由它生成。构建参数和 `.sealpack` 的商店身份、权限与资源清单则放在
[`seal.config.json`](seal.config.json)；两种身份有意分离。先修改 `extension.json`，需要发布扩展包时
再配置 `sealpack.packageId`。

## Quick Start

需要 POSIX shell（macOS/Linux）、Node `26.5.0` 与 npm `12.0.1`。Windows 不受支持，
包括 PowerShell、命令提示符、Git Bash 和 WSL。
已安装
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

> 安全限制：当前 SealDice JavaScript API 没有安全配置或密钥存储能力。不要把 API key、token、
> 密码或其他长期凭据放进 `extension.json`、`seal.config.json`、`src/`、普通扩展配置或
> `storageSet`。需要联网的扩展请先阅读[安全指南](docs/zh/security.md)。

## Target Policy

所有可用 target 都在 [`seal.config.json`](seal.config.json) 的 `sealDice.profiles` 中声明。精确
profile 的 `id` 必须是规范的 [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
版本；兼容 profile 的 `members` 是经过测试的精确版本集合，**不是**对整个 SemVer 范围的自动
承诺。执行 `./sealw target list` 可查看当前注册表。

| 目标              | 使用时机                                          | 验证命令                       |
| ----------------- | ------------------------------------------------- | ------------------------------ |
| `compat-1.5.x`    | 一个 bundle 同时支持已列出的 `1.5.0` 与 `1.5.1`。 | `./sealw check --all-targets`  |
| `1.5.0` / `1.5.1` | 仅支持某个明确宿主版本。                          | `./sealw check --target <id>`  |
| `1.6.0`           | 使用 1.6 新增的配置分组参数等精确 API。           | `./sealw check --target 1.6.0` |

默认 target 是 `compat-1.5.x`，因此直接运行 `./sealw build`、`watch` 或 `typecheck` 都与 npm
脚本一致。`compat-1.5.x` 不包含 1.6 API。`check --all-targets` 对每个注册 profile 做 typecheck，
并对每个精确 mock host 构建和执行实际 bundle smoke；精确目标扩展则应使用对应的 `--target` 检查。

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
./sealw runtime test --core <path> --target <id>|--all-targets
                                                   Load a bundle in the matching SealDice goja runtime
./sealw package --format js|sealpack|both --target <id>
                                                   Verify and create release artifacts
./sealw clean                                   Remove only generated directories
```

`SEAL_TARGET`、`SEAL_CORE_DIR` 和 `SEAL_OFFLINE` 是支持的环境覆盖项；`SEAL_TARGET` 必须引用
注册表中的 profile。npm 与
`package-lock.json` 是唯一的包管理器和 lockfile；依赖变更请使用 `./sealw deps`。
常用 npm 别名为 `npm run dev`、`npm run build`、`npm test` 和 `npm run check`，它们分别对应
兼容目标 watch、build、全目标测试和完整检查。

## Release

`package` 会拒绝模板默认身份、执行完整目标检查、静态 runtime policy 和真实 goja runtime 验证，
并生成 production bundle。它需要与所选 target 匹配的 SealDice core checkout；默认使用
`reference/sealdice-core`，也可通过 `--core <path>` 或 `SEAL_CORE_DIR` 指定。默认格式是 `.js`，
因此旧版 1.5.x 发布流程不变；`.sealpack` 只能使用满足 `sealpack.minSealDice` 的精确 target
（模板默认是 `1.6.0`）。

JavaScript 发布会写入：

```text
release/<extension-id>-<version>.js
release/<extension-id>-<version>.js.sha256
release/manifest.json
```

完成 `extension.json` 和 `LICENSE` 的实际项目替换后运行：

```sh
./sealw package --target compat-1.5.x
```

发布 SealDice 1.6+ 扩展包时，另行设置 `sealpack.packageId`，然后使用：

```sh
./sealw package --format sealpack --target 1.6.0
```

可用 `--format both` 同时生成两种格式。每个产物都有 `.sha256` 文件，`release/manifest.json`
会列出本次选择的所有产物。

手动 GitHub Actions 工作流 **Release SealDice Extension** 会重复上述检查、生成构建来源证明，
并根据其 `format` 输入创建 draft 或正式 GitHub Release。详见[中文发布指南](docs/zh/releasing.md)或
[English release guide](docs/en/releasing.md)。

## API Profiles

`api/profiles/` 是 `Dice.JsInit` 的静态 Go AST 快照，`types/profiles/` 是匹配的 TypeScript
声明，`api/reports/` 是可审阅的 API 表。兼容 profile 是其 `members` 的生成交集：任一成员中
不存在的 API 会在类型中标记为可选，新 API 必须通过运行时特性检测或采用精确目标。

### Adding a SealDice version

1. 在 `seal.config.json` 的 `profiles` 添加一个 `kind: "exact"` 的规范 SemVer id，并填写与该
   target 一致的 `runtimeCoreCommit`；若该版本有特有 TypeScript 合约测试，用 `typecheckInclude`
   声明其位于 `src/` 或 `tests/` 下的 glob。
2. 创建 `api/overrides/<version>.json`，先记录发行版 provenance，再运行
   `./sealw api update --core <path> --target <version>`。
3. 需要单 bundle 兼容时，在一个 `kind: "compatibility"` profile 的 `members` 中加入它。只有所有
   签名兼容或已显式提供 adapter override 时，生成才会通过。
4. 运行 `./sealw check --all-targets`，并提交生成的 `api/`、`types/` 与 `api/reports/` 文件。

配置结构由 JSON Schema 2020-12 校验，跨字段关系由 [Ajv](https://ajv.js.org/) 校验；精确版本
解析和排序由 npm 的 [`semver`](https://github.com/npm/node-semver) 完成。这使新增版本只涉及
配置、证据和生成物，而不需要修改 CLI、tsconfig 映射或 CI 版本列表。

`1.6.0` 来自官方 `sealdice-build` 发布的锁定 core commit，而不是不存在的 core tag。其 release、
source、artifact digest 和观测运行时版本均记录在 override 中。维护流程、来源约束和可选 goja
probe 见[中文 API profile 维护指南](docs/zh/api-profiles.md)或
[English API profile guide](docs/en/api-profiles.md)。

手动 **Refresh SealDice API Profile** 工作流会生成可下载的二进制 patch；选择创建 PR 后才会把
变更推送到仓库。其 target 是自由文本，但 CLI 只接受已在注册表中声明的精确 profile；开始前须先
提交 profile 条目，并在 `api/overrides/<target>.json` 记录发行版 provenance。

## CI

常规 CI 在 `npm ci` 后离线运行 `./sealw check --all-targets`。profile 刷新与发布均为人工触发的
单独工作流。核心 runtime CI 会额外检出每个精确 target 对应的 source commit，并通过 `Dice.JsInit`
加载真实 bundle。
