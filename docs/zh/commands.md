# 命令参考

请在仓库根目录运行命令。`./sealw` 是项目入口；它会在启动 Node CLI 前验证 Node `26.5.0`。

## 日常命令

| 命令                                                            | 用途                                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `./sealw doctor [--json]`                                       | 检查工具链、配置、元数据和 lockfile 状态。                                         |
| `./sealw install [--update-lock]`                               | 安装依赖。默认运行可复现的 `npm ci`；仅在有意修改依赖时使用 `--update-lock`。      |
| `./sealw watch [--target <id>]`                                 | 源码变更时重建 `dev/sealdice-js-ext.js`。不会上传或重新加载脚本。                  |
| `./sealw build [--target <id>]`                                 | 类型检查并构建 `dist/sealdice-js-ext.js`。                                         |
| `./sealw typecheck [--target <id>]`                             | 使用一个 API profile 检查 TypeScript。                                             |
| `./sealw test [--target <id>\|--all-targets]`                   | 执行单元测试、模拟宿主测试和 bundle 冒烟测试。                                     |
| `./sealw check [--target <id>\|--all-targets]`                  | 执行格式化、lint、类型检查、测试和 API 产物检查。                                  |
| `./sealw fmt [--check]`                                         | 格式化项目文件，或只检查格式。                                                     |
| `./sealw lint`                                                  | 运行 ESLint。                                                                      |
| `./sealw package [--format js\|sealpack\|both] [--target <id>]` | 执行检查并创建 `.js`、`.sealpack` 或两种格式；`.sealpack` 需要精确的 1.6+ target。 |
| `./sealw clean`                                                 | 仅删除生成目录 `dev/`、`dist/`、`release/` 和 `.seal/cache/`。                     |

常用 npm 别名为 `npm run dev`、`npm run build`、`npm test` 与 `npm run check`。

## Target

```sh
./sealw target list
./sealw target show
./sealw target check 1.6.0
```

target 的选择优先级依次为：`--target <id>`、`SEAL_TARGET` 环境变量、`seal.config.json` 中的
`defaultTarget`。`--all-targets` 不能和 `--target` 同时使用。

发布兼容 bundle 时使用 `--all-targets`；只支持一个确定宿主版本时，使用对应的精确 target 以获得更快反馈。

## 依赖

修改依赖时请使用包装命令，保证 npm 及其 lockfile 是唯一的包管理事实来源：

```sh
./sealw deps add package-name
./sealw deps add package-name --dev
./sealw deps remove package-name
./sealw deps status
./sealw deps update
```

## API profile 命令

这些命令供模板维护者使用，不是普通扩展开发流程。使用前请阅读 [API profile 维护](api-profiles.md)。

```text
./sealw api list
./sealw api inspect --core /path/to/sealdice-core
./sealw api verify --core /path/to/sealdice-core --target 1.5.0
./sealw api update --core /path/to/sealdice-core --target 1.5.0
./sealw api generate --all-targets [--check]
./sealw api diff --from 1.5.0 --to 1.5.1
./sealw api check [--json]
./sealw api probe --core /path/to/sealdice-core --target 1.5.0
```

`api update` 会修改已提交的 API 产物。它只接受已注册的精确 target，默认拒绝有未提交修改的 core checkout，且要求目标
override 中有 provenance 信息。不要为了开发一个扩展命令而运行它。
