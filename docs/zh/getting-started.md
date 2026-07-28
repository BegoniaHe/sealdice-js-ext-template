# 快速开始

本指南会带你从刚克隆的仓库走到可在 SealDice 中测试的脚本。

## 1. 确认环境受支持

请使用带 POSIX shell 的 macOS 或 Linux。Windows 不受支持，包括 PowerShell、命令提示符、Git Bash 和
WSL。

项目要求 Node `26.5.0` 与 npm `12.0.1`。`./sealw` 启动前会检查 Node 版本，因此版本过高或过低都会被拒绝。

已安装 [mise](https://mise.jdx.dev/) 时，运行：

```sh
mise install
mise exec -- ./sealw doctor
mise exec -- ./sealw install
```

没有 mise 时，请让上述精确版本的 Node 与 npm 出现在 `PATH` 中，再运行：

```sh
./sealw doctor
./sealw install
```

`doctor` 应报告 `ok: true`。`install` 使用 `npm ci`，会严格按 `package-lock.json` 安装依赖，不会修改 lockfile。

## 2. 先设置扩展身份

先编辑 `extension.json`，再改示例代码。

| 字段                                    | 用途                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`                                    | 稳定的运行时标识，也是发布文件名的一部分。只能使用小写字母、数字和连字符；发布后不要修改。 |
| `name`                                  | 在 SealDice 中向用户展示的扩展名称。                                                       |
| `author`                                | 写入 userscript header 的作者。                                                            |
| `version`                               | 扩展和发布产物使用的语义化版本。                                                           |
| `description`、`license`、`homepageUrl` | 写入 header 与发布 manifest 的信息。                                                       |

默认内容会被 `./sealw package` 故意拒绝。它们适合本地试验，但不能因忘记替换而被误发布。

## 3. 配置构建与扩展包

`seal.config.json` 是静态构建配置：它声明 bundle 入口和文件名、SealDice target、默认发布格式及
`.sealpack` 元数据。配置会经过 schema 校验；`sealw` 只根据它调度内置任务，不会执行任意项目构建代码。

默认发布格式是 `js`，因此原有 1.5.x 工作流不变。需要发布 SealDice 1.6+ 扩展包时，将
`sealpack.packageId` 的模板值替换为稳定的 `作者/包名`，并检查 assets、商店信息、权限和
`minSealDice`。这个包 ID 与 `extension.json` 的小写 userscript id 是两个不同身份。

初版打包任务只会将 production bundle 放到 `sealpack.scriptPath`，并加入根目录 `README.md` 和显式声明的
`assets/` 路径；不会假称已支持牌堆、回复、帮助文档或模板等包内资源。

## 4. 编写扩展

入口文件是 `src/index.ts`。示例会：

1. 按 id 查找已加载的扩展；不存在时创建并注册。
2. 创建 `seal` 命令。
3. 对 `.seal` 或 `.seal <名字>` 作出回复。

替换此命令，或继续向 `extension.cmdMap` 添加命令。只调用所选 target 中存在的 API；TypeScript 会提示当前
target 不支持的 API。

当前 API 不提供安全配置或密钥存储。不要使用 `registerStringConfig`、扩展 storage 或源码保存 API key、
token 或密码；联网扩展的限制和权限语义见[安全指南](security.md)。

## 5. 构建并在 SealDice 中测试

默认兼容 target 的持续构建命令为：

```sh
./sealw watch --target compat-1.5.x
```

它会持续写入 `dev/sealdice-js-ext.js`。接着在 SealDice 中：

1. 打开管理界面并启用 JavaScript 扩展。
2. 在脚本管理页面上传 `dev/sealdice-js-ext.js`。
3. 重新加载已上传脚本。
4. 在扩展可接收命令的位置发送 `.seal` 或 `.seal Ada`。

每次保存源码都会生成新的本地文件。要让改动生效，仍需再次上传并重新加载；`watch` 不会自动完成这两步。

只需单次构建 production 风格的 bundle 时，运行：

```sh
./sealw build --target compat-1.5.x
```

产物位于 `dist/sealdice-js-ext.js`。

## 6. 选择 target

通过 `./sealw target list` 查看已注册 target。目前可选项如下：

| Target             | 适用场景                                                               |
| ------------------ | ---------------------------------------------------------------------- |
| `compat-1.5.x`     | 一个 bundle 同时支持**恰好** SealDice `1.5.0` 和 `1.5.1`。这是默认值。 |
| `1.5.0` 或 `1.5.1` | 只支持其中一个确定宿主版本。                                           |
| `1.6.0`            | 使用 SealDice 1.6 新增 API，或发布 `.sealpack` 扩展包。                |

`compat-1.5.x` 不包括 1.6.0。它是明确命名并经过测试的版本集合，不是语义化版本范围。兼容 profile 中标记为可选的
API，必须在运行时进行特性检测后再调用。

导出 `.sealpack` 必须选择不低于 `sealpack.minSealDice` 的精确 target，因此不能使用 `compat-1.5.x`。

## 7. 分享前验证

开发单一 target 时，运行较快的检查：

```sh
./sealw check --target 1.6.0
```

发布兼容扩展前，检查全部 target：

```sh
./sealw check --all-targets
```

完整检查会执行格式化检查、lint、每个 profile 的类型检查、模拟宿主测试、Node VM 中的 bundle 冒烟测试，以及已提交
API 产物检查。它不会上传到真实 SealDice，也不会启动真实实例。

在发布前还必须运行 core-backed runtime 验证。它使用目标版本的 `Dice.JsInit` 和 goja event loop 加载
实际 bundle：

```sh
./sealw runtime test --core /path/to/sealdice-core --all-targets
```

每个精确 target 都锁定了一个 core commit；传入的 checkout 必须包含它。`package` 会自动执行同一验证。

## 常见问题

| 现象                             | 处理方式                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 26.5.0 is required`     | 安装并切换到精确的 Node 26.5.0，再重新运行命令。                                                                            |
| `Dependencies are not installed` | 运行 `./sealw install`。                                                                                                    |
| TypeScript 提示 API 不存在       | 选择正确 target，或仅使用你声称支持的 target 中存在的 API。                                                                 |
| SealDice 仍在运行旧代码          | 重新上传新文件并重新加载脚本；仅重新构建不足以生效。                                                                        |
| `package` 拒绝模板值             | 替换 `extension.json` 的所有占位值；发布扩展包时还要替换 `sealpack.packageId`，并让根目录 `LICENSE` 与其中的 license 一致。 |
