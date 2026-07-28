# Releasing an Extension

Use this guide only after the extension works in SealDice and its supported API
target is known.

## 1. Prepare the metadata

Replace all default values in `extension.json`:

- `id` is the stable runtime id and part of the release filename. Keep it once
  users may have installed the extension.
- Increment `version` using semantic versioning.
- Fill in a real name, author, description, license, and homepage URL.
- Make the root `LICENSE` file agree with `extension.json`.

`./sealw package` deliberately rejects the template id, name, author, and
homepage. This prevents publishing a renamed copy incompletely.

## 2. Verify the supported target

For one exact SealDice version:

```sh
./sealw check --target 1.6.0
```

For a compatibility release, verify every registered target:

```sh
./sealw check --all-targets
```

Only claim the host versions listed by the target. For example,
`compat-1.5.x` means exactly 1.5.0 and 1.5.1 in this repository; it does not
mean all present and future 1.5 releases.

## 3. Create the release files

```sh
./sealw package --target compat-1.5.x
```

The command repeats the required checks and writes:

```text
release/<extension-id>-<version>.js
release/<extension-id>-<version>.js.sha256
release/manifest.json
```

Review `manifest.json`: its id, version, target profile, profile hash, and
SHA-256 must match the files you plan to distribute. Upload the `.js` file to
SealDice; publish the checksum and manifest alongside it when possible.

Do not distribute files from `dev/`. They are development artifacts with a
source map and can change while `watch` is running.

## GitHub release workflow

The manual **Release SealDice Extension** workflow follows the same process.
It requires:

- `target`: a target already registered in `seal.config.json`.
- `tag`: exactly `v` followed by `extension.json`'s version, for example
  `v1.2.3`.
- `draft`: normally leave this enabled, inspect the generated assets, then
  publish the GitHub release.

The workflow runs `package`, attests the JavaScript artifact, and attaches the
bundle, checksum, and manifest to the release.
