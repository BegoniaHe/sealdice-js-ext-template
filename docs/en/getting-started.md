# Getting Started

This guide takes an extension from a fresh clone to a script that can be tested
in SealDice.

## 1. Check the supported environment

Use macOS or Linux with a POSIX shell. Windows is not supported, including
PowerShell, Command Prompt, Git Bash, and WSL.

The required versions are Node `26.5.0` and npm `12.0.1`. `./sealw` checks the
Node version before it runs, so a newer or older Node release will be rejected.

With [mise](https://mise.jdx.dev/) installed:

```sh
mise install
mise exec -- ./sealw doctor
mise exec -- ./sealw install
```

Without mise, put exactly those Node and npm versions on `PATH`, then run:

```sh
./sealw doctor
./sealw install
```

`doctor` should report `ok: true`. `install` uses `npm ci`, so it installs the
versions recorded in `package-lock.json` without changing that file.

## 2. Give the extension its identity

Edit `extension.json` before changing the example code.

| Field                                   | What it is used for                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                    | Stable runtime identifier and part of the release filename. Use lowercase letters, digits, and hyphens. Do not change it after publishing. |
| `name`                                  | Name shown to users in SealDice.                                                                                                           |
| `author`                                | Author shown in the userscript header.                                                                                                     |
| `version`                               | Semantic version for the extension and release artifact.                                                                                   |
| `description`, `license`, `homepageUrl` | Information shown in the header and release manifest.                                                                                      |

The default values are intentionally rejected by `./sealw package`. They are
safe for local experiments, but cannot be released by mistake.

## 3. Configure the build and package

`seal.config.json` is the static build configuration. It defines the bundle
entry point and filename, registered SealDice targets, default release formats,
and `.sealpack` metadata. It is schema-validated; `sealw` executes built-in
tasks from this configuration and does not run arbitrary project build code.

The default release format is `js`, so existing 1.5.x workflows remain
unchanged. To publish a SealDice 1.6+ extension package, replace the template
value in `sealpack.packageId` with a stable `author/package` id, and review its
assets, store data, permissions, and `minSealDice`. This package id is separate
from the lowercase userscript id in `extension.json`.

The initial package task stages the production bundle at
`sealpack.scriptPath`, the root `README.md`, and explicitly listed `assets/`
paths. It does not claim support for package-provided decks, reply files,
help documents, or templates yet.

`release.artifactPolicy` can reject the final staged `.sealpack` content. Use
`forbiddenPaths` for globs such as `**/*.png` or `assets/**`, and
`forbiddenExtensions` for lowercase suffixes such as `.png`. It constrains
archive paths, not behavior embedded in the bundle.

## 4. Write the extension

The entry point is `src/index.ts`. The example:

1. Finds an already loaded extension by id, or creates and registers it.
2. Creates the `seal` command.
3. Replies to `.seal` or `.seal <name>`.

Replace this command or add more command items to `extension.cmdMap`. Keep
runtime calls inside the APIs available for the target you support; TypeScript
will flag APIs that do not exist in that target.

The current API has no secure configuration or key store. Do not use
`registerStringConfig`, extension storage, or source code for API keys, tokens,
or passwords. See the [security guide](security.md) before building a networked extension.

Use `src/config.ts` for ordinary plugin settings instead of hand-writing each
registration, read, and validation path. `definePluginConfig()` with helpers
such as `integer()` and `option()` generates SealDice registration, fallback
defaults, range or enum validation, and a Markdown table. Read results include
both `values` and `issues` so persisted invalid settings can be handled safely.

## 5. Build and test it in SealDice

For the default compatibility target, run:

```sh
./sealw watch --target compat-1.5.x
```

This continuously writes `dev/sealdice-js-ext.js`. In SealDice:

1. Open the management interface and enable JavaScript extensions.
2. Upload `dev/sealdice-js-ext.js` on the Script Management page.
3. Reload the uploaded script.
4. Send `.seal`, or `.seal Ada`, where the extension can receive commands.

Every saved source change produces a new local file. Upload and reload it again
to use that change. `watch` does not perform either action automatically.

To make a one-off production-style bundle without watching:

```sh
./sealw build --target compat-1.5.x
```

The output is `dist/sealdice-js-ext.js`.

## 6. Choose a target

Run `./sealw target list` to see the registered targets. The current choices
are:

| Target             | Choose it when                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- |
| `compat-1.5.x`     | One bundle must support exactly SealDice `1.5.0` and `1.5.1`. This is the default. |
| `1.5.0` or `1.5.1` | You only support one of those exact host versions.                                 |
| `1.6.0`            | You use API additions from SealDice 1.6, or publish a `.sealpack` package.         |

`compat-1.5.x` does not include 1.6.0. It is a deliberately named, tested set,
not a semantic-version range. Use runtime feature detection when calling API
members marked optional by a compatibility profile.

`.sealpack` export requires an exact target at or above `sealpack.minSealDice`.
It is therefore intentionally unavailable for `compat-1.5.x`.

For a project that only supports one exact version from the beginning, run this
from the template root:

```sh
./sealw init --preset single-target --directory ../my-extension --target 1.6.0
```

It creates a new project without compatibility profiles, other API artifacts,
or `reference/`; the output directory must not already exist.

## 7. Verify before sharing

Run the narrow check while working on one target:

```sh
./sealw check --target 1.6.0
```

Run the full check before distributing a compatibility extension:

```sh
./sealw check --all-targets
```

The full check formats, lints, typechecks every registered profile, tests mock
hosts, executes the built bundle in a Node VM, and verifies checked-in API
artifacts. It does not upload to or start a real SealDice instance.

Before release, run the core-backed runtime verification. It loads the actual bundle through the target
version's `Dice.JsInit` and goja event loop:

```sh
./sealw runtime test --core /path/to/sealdice-core --all-targets
```

Every exact target locks a core commit. The supplied checkout must contain it. `package` runs the same
verification automatically.

## Common problems

| Symptom                            | What to do                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Node.js 26.5.0 is required`       | Install and select exactly Node 26.5.0, then rerun the command.                                                                                |
| `Dependencies are not installed`   | Run `./sealw install`.                                                                                                                         |
| An API is missing in TypeScript    | Pick the correct target, or use an API available in the target you claim to support.                                                           |
| SealDice still runs old code       | Upload the new file and reload the script; rebuilding alone is not enough.                                                                     |
| `package` rejects a template value | Replace every placeholder in `extension.json`, replace `sealpack.packageId` before package export, and make `LICENSE` match its license value. |
