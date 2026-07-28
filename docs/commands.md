# `sealw` Command Reference

`./sealw` is a short POSIX shell bootstrap that verifies `.nvmrc` and executes
the dependency-free Node CLI. It accepts no shell fragments: all subprocesses
are started with argument arrays.

| Command                   | Purpose                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `doctor [--json]`         | Validate Node, npm, config and canonical lockfile state.                                     |
| `install [--update-lock]` | Run `npm ci`; `--update-lock` deliberately runs `npm install`.                               |
| `fmt [--check]`, `lint`   | Formatting and lint checks.                                                                  |
| `typecheck --target <id>` | Select exactly one declaration profile.                                                      |
| `test --target <id>       | --all-targets`                                                                               | Run Node unit/mock tests and Node VM bundle smoke tests.                               |
| `check --target <id>      | --all-targets`                                                                               | CI pipeline. `--all-targets` typechecks every profile and smoke-tests each exact host. |
| `watch --target <id>`     | esbuild `context().watch()` development bundle.                                              |
| `build --target <id>`     | Typecheck then create `dist/sealdice-js-ext.js`.                                             |
| `package --target <id>`   | Validate extension metadata, run target checks, build, checksum, and write release manifest. |
| `clean`                   | Removes only `dev/`, `dist/`, `release/`, `.seal/cache/` after realpath checks.              |

Target ids come from `seal.config.json`; run `./sealw target list` to inspect them. The checked-in
default is `compat-1.5.x`, whose members are exactly `1.5.0` and `1.5.1`. A compatibility id is a
named tested set, not an assertion that every release matched by its spelling works. CLI target
selection wins over `SEAL_TARGET`, which wins over `seal.config.json`. `--all-targets` cannot be
combined with `--target`.

The CLI writes a short target-specific tsconfig to `.seal/cache/` for each typecheck or build. It is
generated from the profile registry, so adding an exact version does not require another checked-in
`tsconfig.*.json` file.

## API Commands

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

`update` and `verify` reject a dirty Git core by default. `--allow-dirty` is
only for local investigation. An unpacked source archive requires
`--commit <exact-commit>` on `update`. `inspect` and `verify` never write to
the supplied core directory. API mismatch exits with `4`; configuration or
environment errors exit with `2`; task failures use `3` or `5` for an external
tool failure.

`api update` regenerates all dependent declarations, reports and the compatibility profile after
updating an exact target. The target must first be registered as `kind: "exact"` in
`seal.config.json`; compatibility targets are generated from their declared members and cannot be
scanned directly. `api generate --check` is non-mutating. All profile, declaration and report writes
are atomic. `api probe` is optional and always deletes its temporary copy, including on test failure.

For a distribution release whose core repository does not carry a matching tag,
pass the exact core gitlink to `api update`. The target override must record
release, source, artifact, and runtime provenance. A mismatch between the
source-declared version and the distribution version requires an explicit
`versionMismatch` acknowledgement; otherwise `api update` and `api check` fail.
