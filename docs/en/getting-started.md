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

## 3. Write the extension

The entry point is `src/index.ts`. The example:

1. Finds an already loaded extension by id, or creates and registers it.
2. Creates the `seal` command.
3. Replies to `.seal` or `.seal <name>`.

Replace this command or add more command items to `extension.cmdMap`. Keep
runtime calls inside the APIs available for the target you support; TypeScript
will flag APIs that do not exist in that target.

## 4. Build and test it in SealDice

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

## 5. Choose a target

Run `./sealw target list` to see the registered targets. The current choices
are:

| Target             | Choose it when                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- |
| `compat-1.5.x`     | One bundle must support exactly SealDice `1.5.0` and `1.5.1`. This is the default. |
| `1.5.0` or `1.5.1` | You only support one of those exact host versions.                                 |
| `1.6.0`            | You use API additions from SealDice 1.6, such as grouped configuration parameters. |

`compat-1.5.x` does not include 1.6.0. It is a deliberately named, tested set,
not a semantic-version range. Use runtime feature detection when calling API
members marked optional by a compatibility profile.

## 6. Verify before sharing

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

## Common problems

| Symptom                            | What to do                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `Node.js 26.5.0 is required`       | Install and select exactly Node 26.5.0, then rerun the command.                           |
| `Dependencies are not installed`   | Run `./sealw install`.                                                                    |
| An API is missing in TypeScript    | Pick the correct target, or use an API available in the target you claim to support.      |
| SealDice still runs old code       | Upload the new file and reload the script; rebuilding alone is not enough.                |
| `package` rejects a template value | Replace every placeholder in `extension.json` and make `LICENSE` match its license value. |
