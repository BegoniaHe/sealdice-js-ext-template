# Security Guide

## Secrets

The current SealDice JavaScript API has no `registerSecretConfig` or secure extension key store. Do not put API
keys, tokens, passwords, private keys, or long-lived OAuth refresh tokens in ordinary extension config, extension
storage, source files, or a release bundle. Base64, obfuscation, and local encryption with a colocated key do not
make this safe.

Do not publish an extension that requires such credentials until the host provides a secure configuration API with
masked UI, log redaction, access controls, and independent key management.

## Network Permissions

Keep `.sealpack` network permissions minimal. With `network: true`, an empty `networkHosts` list means unrestricted
network access and requires `acknowledgeUnrestrictedNetwork: true`. Use exact hosts or `*.example.com` for a
whitelist; `"*"` is not a supported wildcard.

The current core package sandbox is not yet a mandatory boundary for JavaScript global `fetch`. Treat the manifest
permission as a distribution declaration, not as protection for credentials or a network sandbox.

## Runtime Compatibility

SealDice runs goja, not a browser or Node. The build rejects common unguaranteed globals such as `process`,
`Buffer`, `URL`, `Headers`, streams, and abort APIs. Add a `runtime.allowedGlobals` exception only after the matching
core runtime test has passed.
