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

For a `.sealpack` release, also replace `sealpack.packageId` in
`seal.config.json`. It is the stable store/package identity in
`author/package` form and is deliberately separate from the userscript `id`.
Review `minSealDice`, the staged script path, explicit asset paths, store
metadata, dependencies, and requested permissions before publishing.

Assets must remain under the project `assets/` directory. Do not add the root `LICENSE` file to the extension
package: SealDice accepts only the defined `.sealpack` top-level layout. Releases also need a matching core
checkout. `package` defaults to `reference/sealdice-core`, accepts `--core /path/to/sealdice-core`, validates the
archive with that core's `InspectArchive`, and loads the bundle through goja.

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

The legacy JavaScript artifact remains available for any configured target:

```sh
./sealw package --target compat-1.5.x
```

To create a SealDice 1.6+ package, select an exact target that satisfies
`sealpack.minSealDice`:

```sh
./sealw package --format sealpack --target 1.6.0
```

For a networked extension, `network: true` with an empty `networkHosts` list means unrestricted network access
and requires `acknowledgeUnrestrictedNetwork: true`. `networkHosts: ["*"]` is not a supported wildcard; use exact
hosts or `*.example.com`. Packaging prints a permission summary. Read the [security guide](security.md) first.

To distribute both forms for that exact target:

```sh
./sealw package --format both --target 1.6.0
```

The command repeats the required checks and writes:

```text
release/<extension-id>-<version>.js
release/<extension-id>-<version>.js.sha256
release/<package-name>@<version>.sealpack
release/<package-name>@<version>.sealpack.sha256
release/manifest.json
```

`manifest.json` records every selected artifact as well as the target profile
and profile hash. Review every SHA-256 before distribution. Upload `.js` files
through the legacy JavaScript script flow; upload `.sealpack` files through the
SealDice 1.6+ package flow or publish them to the extension store. Publish the
checksums and manifest alongside either format when possible.

Do not distribute files from `dev/`. They are development artifacts with a
source map and can change while `watch` is running.

## GitHub release workflow

The manual **Release SealDice Extension** workflow follows the same process.
It requires:

- `target`: a target already registered in `seal.config.json`.
- `format`: `js`, `sealpack`, or `both`. `sealpack` needs an exact target at
  or above `sealpack.minSealDice`.
- `tag`: exactly `v` followed by `extension.json`'s version, for example
  `v1.2.3`.
- `draft`: normally leave this enabled, inspect the generated assets, then
  publish the GitHub release.

The workflow has a `format` input matching the CLI (`js`, `sealpack`, or
`both`). It runs `package`, attests the generated release files, and attaches
the selected artifacts, checksums, and manifest to the release.
