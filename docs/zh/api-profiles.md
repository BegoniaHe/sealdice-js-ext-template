# 维护 SealDice API Profile

这是高级维护工作。若你只在 `src/` 中编写扩展命令，选择一个已有 target 后即可停止阅读；你不需要本地 SealDice core
checkout，也不需要使用 `api` 命令。

## Profile 的作用

API profile 记录一个 SealDice 宿主版本暴露出的 JavaScript API，并驱动三类产物：

1. `types/profiles/` 下的 TypeScript 声明。
2. 自动化测试使用的模拟宿主。
3. `api/reports/` 下可审阅的 API 报告。

`seal.config.json` 是 target 注册表。**精确 target** 对应一个具体 SemVer 版本；**兼容 target** 是一组明确、有序的精确
target，绝不是自动的 SemVer 范围。

某成员在兼容集合中缺失时，其声明会标记为可选。扩展代码调用可选 API 前，必须在运行时检测该 API 是否存在。

## 新增或刷新精确版本

1. 在 `seal.config.json` 添加 `kind: "exact"` 条目。
2. 获取与目标 SealDice core commit 精确对应且干净的 checkout 或源码归档。
3. 创建 `api/overrides/<target>.json`，并在更新前记录 release、source、artifact 与 runtime provenance。
4. 先无写入地检查源码：

   ```sh
   ./sealw api inspect --core /path/to/sealdice-core
   ```

5. 生成 profile：

   ```sh
   ./sealw api update --core /path/to/sealdice-core --target <target>
   ```

6. 审阅 `api/profiles/`、`types/profiles/` 和 `api/reports/` 中的变更。
7. 运行：

   ```sh
   ./sealw api diff --from <old-target> --to <target>
   ./sealw check --all-targets
   ```

`api update` 会重建包含该精确 target 的兼容 profile，但不能直接对兼容 target 运行。

## 为什么需要 override 与 provenance

Go 签名不能完整说明 JavaScript 行为，例如可选参数、抛出错误或动态值。静态扫描是 API 漂移基线；已提交的 override 表达经过
审阅的 TypeScript 合约。

Provenance 要精确记录 profile 来自哪个发行版和 source commit。部分 SealDice 发行版来自另一构建仓库，并可能在构建时注入
最终版本号；应明确记录这种差异，而不是假装 source 版本与发行版本相同。

## 可选的运行时 probe

`./sealw api probe` 会将给定 core 复制到临时目录，以 goja 运行 `Dice.JsInit`，并将观测成员与选定 profile 对比。它不会
修改提供的 core 目录，并会清理临时副本。

Probe 是补充验证，不是事实来源。旧 core 可能无法用当前 Go 工具链编译，或缺少生成资源；正常 CI 使用静态 profile，不运行
probe。
