# SealDice JavaScript 扩展模板

这是一个用于开发 SealDice JavaScript 扩展的 TypeScript 模板，不是可直接使用的完整插件。示例会注册
`.seal [名字]` 命令，实际项目应替换成自己的功能。

## 从哪里开始

- **扩展作者**：先阅读[快速开始](getting-started.md)，开发时查阅[命令参考](commands.md)。
- **模板维护者**：只有新增或更新 SealDice 宿主版本时，才需要阅读 [API profile 维护](api-profiles.md)。
- **准备发布扩展的人**：阅读[发布扩展](releasing.md)。
- **需要网络或第三方 API 的作者**：先阅读[安全指南](security.md)。

## 支持的环境

本仓库**仅支持 macOS 和 Linux**。Windows 不受支持，包括 PowerShell、命令提示符、Git Bash 和 WSL；
请不要将 Windows 环境视为可用配置，也不要依赖 Windows 专用变通方案。

需要 POSIX shell、Node `26.5.0` 和 npm `12.0.1`。仓库锁定这些版本，保证本地构建与 CI 使用相同工具链；
建议通过 `mise` 安装。

## 正常开发流程

1. 安装工具链和项目依赖。
2. 替换 `extension.json` 中的占位信息。
3. 修改 `src/` 下的代码。
4. 运行 `./sealw watch` 生成开发脚本。
5. 在 SealDice 的脚本管理页面上传脚本并重新加载。
6. 分享或发布前运行 `./sealw check`。

`watch` 只在本地构建，**不会**自动上传到 SealDice，也不会自动重新加载脚本。手动上传是当前工作流的一部分。

当前 SealDice JavaScript API 没有安全配置或密钥存储能力。不要把 API key、token、密码等长期
凭据写进项目、普通扩展配置或扩展 storage；这不是可接受的临时方案。

## 一分钟理解术语

- **JavaScript 扩展元数据**：`extension.json` 提供运行时 id、显示名、作者、版本、userscript header
  和 `.js` 发布文件名。
- **构建与扩展包配置**：`seal.config.json` 声明静态构建输入与 target；发布 SealDice 1.6+ 扩展包时，
  还在此配置独立的 `.sealpack` 包身份、权限、资源和商店信息。
- **target**：一个有名字的 SealDice API profile，决定 TypeScript 声明与测试使用的模拟宿主。
- **兼容 target**：经过测试的一组精确宿主版本，不代表匹配该版本号形式的所有发行版都可用。
- **API profile 维护**：供模板维护者使用的高级工作；大多数扩展作者无需扫描 SealDice core，也不需要修改 `api/`。

日常开发、构建和 mock 测试不需要已检出的 `reference/sealdice-core` 子模块。它也用于 API profile
维护，以及发布前的 `runtime test` 和 `.sealpack` core 校验。
