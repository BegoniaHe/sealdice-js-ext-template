# Maintaining SealDice API Profiles

The profile source of truth is the static scanner result plus the checked-in
override. The scanner uses `go/parser` and `go/ast` only; it never imports,
builds, or changes the supplied core. It records `Dice.JsInit` `Set` bindings,
nested objects, Go function signatures, factory returns, structs, fields,
aliases, container types and `jsbind` tags.

1. Identify the distribution release and its exact source input. For a core
   release this can be a core tag; for a build-repository release it is the
   build tag plus its core gitlink.
2. Obtain an exact, clean core checkout or archive at that source commit.
3. Review `./sealw api inspect --core <path>`.
4. Update `api/overrides/<target>.json` for optional arguments, `error` throws,
   dynamic values, writable fields, or consciously excluded proxy methods.
5. Record the distribution, source, artifact and runtime evidence in the
   override's `provenance` object before updating the profile.
6. Run `./sealw api update --core <path> --target <target>`. This also regenerates all dependent
   declarations, reports and the 1.5 compatibility profile.
7. Review `api/profiles/`, `types/profiles/`, and `api/reports/`.
8. Run `./sealw api diff --from 1.5.0 --to 1.5.1` and
   `./sealw check --all-targets`.

The declaration source is deliberately curated. goja and Go signatures cannot
reliably reveal JavaScript optional parameters, `error` exception semantics, or
application-specific `interface{}` values. The AST output is the drift
baseline, while `types/seal.d.ts` and an override express the public TypeScript
contract.

The compatibility generator retains equal entries and makes members introduced
only in the newer profile optional. It fails for an incompatible signature until
`api/overrides/compat-1.5.x.json` explicitly permits an adapter strategy. A
single bundle must use runtime feature detection for optional APIs.

## Distribution Provenance and SealDice 1.6.0

An API profile has two identities when an upstream publishes from a build
repository: the **distribution identity** and the scanned **source identity**.
They must not be collapsed into a mutable branch or a source-internal version
constant. The profile may additionally record an artifact digest and an
observed runtime version. `api check` validates this tuple offline and rejects
an unacknowledged source/release version mismatch.

The checked-in `1.6.0` profile has the following evidence:

- Distribution: [`sealdice-build v1.6.0`](https://github.com/sealdice/sealdice-build/releases/tag/v1.6.0),
  tag commit `40950761aa2b1d0ecdfff050e69ddbea803cf2bf`, published
  `2026-07-26T16:07:20Z`.
- Source: the build tag's `sealdice-core` gitlink
  [`b06a2d92a7af0b8b33be33390206297edf29c7bd`](https://github.com/sealdice/sealdice-core/commit/b06a2d92a7af0b8b33be33390206297edf29c7bd).
- Artifact: `sealdice-core_1.6.0_linux_amd64.tar.gz`, SHA-256
  `6cd37580dc35d7a1f0b5c2159a692bab1db97c119d738f4a139dd7ef5c3ea549`.
- Runtime: that asset reported `1.6.0+20260726` on `linux-amd64`.

The source commit's `dice/version.go` declares `1.5.1-dev`. This does not make
the official binary a 1.5.1 release; it is a documented build-time version
injection discrepancy and is explicitly acknowledged in
`api/overrides/1.6.0.json`. There is no claim that `sealdice-core` itself has a
`v1.6.0` tag.

The 1.6 profile records seven changed signatures: the six configuration
registrars and `registerTask` add an optional TypeScript `group` argument. It
is an exact target only. `compat-1.5.x` remains derived from `1.5.0` and
`1.5.1`; do not add a 1.5-to-1.6 compatibility package until a separate policy
and runtime review approves it.

The optional goja probe has also passed against the same source commit. It
observed no missing or unexpected members, arity differences, kind differences,
or normalized Go signature differences. The disposable probe test explicitly
stops the event loop created by this core revision before its temporary copy is
removed.

## Runtime Probe

`api probe` copies the supplied core into `mkdtemp`-equivalent Node temporary
storage, inserts only a temporary Go probe test and minimal `go:embed`
placeholders in that copy, then runs `JsInit` through goja. It reports observed
members and compares them with the selected profile. Some historic core trees
cannot compile with a current Go toolchain or lack generated frontend assets;
that is reported as a probe limitation. Static scanning remains the authoritative
maintenance path and normal CI never runs the probe.
