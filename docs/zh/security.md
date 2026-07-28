# 安全指南

## 密钥与凭据

当前 SealDice JavaScript API 没有 `registerSecretConfig`，也没有可供扩展使用的加密密钥存储。
`registerStringConfig`、`extension.storageSet`、项目文件和发布 bundle 都不适合保存 API key、token、
密码、私钥或长期 OAuth refresh token。

不要把值以 Base64、简单加密或混淆后写入这些位置；密钥和解密材料同处时不构成保护。需要这类凭据的扩展
应暂停发布，直到宿主提供具有 UI 掩码、日志脱敏、访问控制和独立密钥管理的安全配置 API。

## 网络权限

`.sealpack` 的网络权限必须最小化。`network: false` 时不得声明 host。`network: true` 配合非空
`networkHosts` 时，只能使用精确 host 或 `*.example.com`；`"*"` 不是支持的值。

`network: true` 配合空列表表示不限制 host。模板要求额外填写
`acknowledgeUnrestrictedNetwork: true`，并在打包时输出醒目的摘要。不要把无限制网络与明文凭据一起发布。

当前核心的 package sandbox API 尚未成为 JavaScript 全局 `fetch` 的强制边界。权限字段应被视为
待宿主完整接线前的发布声明，而不是保护凭据或阻止恶意脚本出网的安全边界。

## 运行时兼容性

SealDice 使用 goja，不是浏览器或 Node。构建会拒绝常见的未保证 global，例如 `process`、`Buffer`、
`URL`、`Headers`、stream 和 abort API。只有在目标 core 的 runtime 测试通过后，才可以用
`runtime.allowedGlobals` 记录经过审阅的例外。
