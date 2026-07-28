# Command Reference

Run commands from the repository root. `./sealw` is the project entry point; it
verifies Node `26.5.0` before starting the Node-based CLI.

## Everyday commands

| Command                                                         | Use it for                                                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `./sealw doctor [--json]`                                       | Confirm the toolchain, configuration, metadata, and lockfile state.                                                                     |
| `./sealw install [--update-lock]`                               | Install dependencies. Without the flag it runs reproducible `npm ci`; use `--update-lock` only when deliberately changing dependencies. |
| `./sealw watch [--target <id>]`                                 | Rebuild `dev/sealdice-js-ext.js` when source files change. It does not upload or reload the script.                                     |
| `./sealw build [--target <id>]`                                 | Typecheck and build `dist/sealdice-js-ext.js`.                                                                                          |
| `./sealw typecheck [--target <id>]`                             | Check TypeScript against one API profile.                                                                                               |
| `./sealw test [--target <id>\|--all-targets]`                   | Run unit tests, mock-host tests, and a bundle smoke test.                                                                               |
| `./sealw check [--target <id>\|--all-targets]`                  | Run formatting, linting, typechecking, tests, and API-artifact checks.                                                                  |
| `./sealw fmt [--check]`                                         | Format project files, or only verify their formatting.                                                                                  |
| `./sealw lint`                                                  | Run ESLint.                                                                                                                             |
| `./sealw package [--format js\|sealpack\|both] [--target <id>]` | Run checks and create `.js`, `.sealpack`, or both. `.sealpack` requires an exact 1.6+ target.                                           |
| `./sealw clean`                                                 | Remove generated `dev/`, `dist/`, `release/`, and `.seal/cache/` directories only.                                                      |

The equivalent common npm aliases are `npm run dev`, `npm run build`, `npm test`,
and `npm run check`.

## Targets

```sh
./sealw target list
./sealw target show
./sealw target check 1.6.0
```

Target selection has this order: `--target <id>`, then `SEAL_TARGET`, then the
`defaultTarget` in `seal.config.json`. `--all-targets` and `--target` cannot be
used together.

Use `--all-targets` when you publish a compatibility bundle. Otherwise use the
single exact target that you support to keep local feedback fast.

## Dependencies

Use the wrapper when modifying dependencies so npm and its lockfile remain the
only package-management source of truth:

```sh
./sealw deps add package-name
./sealw deps add package-name --dev
./sealw deps remove package-name
./sealw deps status
./sealw deps update
```

## API-profile commands

These are for template maintainers, not ordinary extension development. Read
[API profiles](api-profiles.md) before using them.

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

`api update` changes checked-in API artifacts. It accepts exact registered
targets only, rejects a dirty core checkout by default, and requires provenance
information in the target override. Do not run it merely to develop an
extension command.
