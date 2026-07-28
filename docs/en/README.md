# SealDice JavaScript Extension Template

This is a TypeScript starter repository for JavaScript extensions that run in
SealDice. It is not a finished extension. The example registers `.seal [name]`
and is intended to be replaced with your own commands.

## Who should read this

- **Extension authors**: start with [Getting started](getting-started.md), then
  use the [command reference](commands.md) while developing.
- **Maintainers of this template**: use [API profiles](api-profiles.md) only
  when adding or updating SealDice host versions.
- **People publishing an extension**: follow [Releasing](releasing.md).
- **Authors using a network or third-party API**: read the [Security guide](security.md) first.

## Supported environment

This repository supports **macOS and Linux only**. Windows is not supported,
including PowerShell, Command Prompt, Git Bash, and WSL. Do not file or work
around Windows-specific setup issues as supported configurations.

You need a POSIX shell, Node `26.5.0`, and npm `12.0.1`. The repository locks
these versions so that local builds and CI use the same toolchain. `mise` is the
recommended way to install them.

## The normal workflow

1. Install the toolchain and project dependencies.
2. Replace the placeholder values in `extension.json`.
3. Edit files under `src/`.
4. Run `./sealw watch` to write a development bundle.
5. Upload that bundle to SealDice's Script Management page and reload it.
6. Run `./sealw check` before sharing or releasing the extension.

`watch` builds files locally; it does **not** upload or reload them in SealDice.
The manual upload step is expected.

The current SealDice JavaScript API has no secure configuration or extension key store. Do not put API keys,
tokens, passwords, or other long-lived credentials in the project, ordinary extension configuration, or
extension storage.

## Concepts in one minute

- **JavaScript extension metadata**: `extension.json` provides the runtime id,
  displayed name, author, version, userscript header, and `.js` release
  filename.
- **Build and package configuration**: `seal.config.json` declares the static
  build inputs and targets. It also contains the separate `.sealpack` package
  identity, permissions, assets, and store data when publishing for SealDice
  1.6+.
- **Target**: a named SealDice API profile. It controls TypeScript declarations
  and the mock host used in tests.
- **Compatibility target**: a finite, tested list of exact host versions. It is
  not a promise that every release matching a version pattern works.
- **API profile maintenance**: advanced work for template maintainers. Most
  extension authors never need to scan the SealDice core or edit `api/`.

The checked-in `reference/sealdice-core` submodule is not required for ordinary
development, builds, or mock tests. It is also used for API-profile maintenance,
pre-release `runtime test`, and core-backed `.sealpack` validation.
