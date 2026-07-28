# Maintaining SealDice API Profiles

This is advanced maintenance work. If you only write commands in `src/`, choose
an existing target and stop here; you do not need a local SealDice core checkout
or the `api` commands.

## What a profile does

An API profile records the JavaScript API exposed by one SealDice host version.
It drives three things:

1. TypeScript declarations under `types/profiles/`.
2. The mock host used by automated tests.
3. A reviewable API report under `api/reports/`.

`seal.config.json` is the target registry. An **exact** target has one concrete
SemVer version. A **compatibility** target is an explicit, ordered list of exact
targets. It is never an automatic SemVer range.

When a member is missing from part of a compatibility set, its declaration is
optional. Extension code must feature-detect optional APIs at runtime.

## Add or refresh an exact version

1. Add a new `kind: "exact"` entry to `seal.config.json`, including the matching source commit as `runtimeCoreCommit`.
2. Obtain a clean checkout or source archive for the exact SealDice core commit.
3. Create `api/overrides/<target>.json` and record the release, source,
   artifact, and runtime provenance before updating.
4. Inspect the source without writing to it:

   ```sh
   ./sealw api inspect --core /path/to/sealdice-core
   ```

5. Generate the profile:

   ```sh
   ./sealw api update --core /path/to/sealdice-core --target <target>
   ```

6. Review changed files in `api/profiles/`, `types/profiles/`, and
   `api/reports/`.
7. Run:

   ```sh
   ./sealw api diff --from <old-target> --to <target>
   ./sealw check --all-targets
   ```

`api update` regenerates compatibility profiles that include the updated exact
target. It does not accept a compatibility target directly.

## Why overrides and provenance exist

Go signatures cannot fully describe JavaScript behavior such as optional
arguments, thrown errors, or dynamic values. The static scan is the drift
baseline; the checked-in override describes the deliberate TypeScript contract.

Provenance records exactly which distribution and source commit produced the
profile. Some SealDice releases are built from a different repository and may
inject a final version during the build. Record that mismatch explicitly rather
than pretending the source version and distribution version are identical.

## Optional runtime probe

`./sealw api probe` copies the supplied core to a temporary location, runs
`Dice.JsInit` with goja, and compares observed members with a selected profile.
It never changes the supplied core directory and cleans up its temporary copy.

The probe is an additional check, not the source of truth. Older cores may not
compile with a current Go toolchain or may lack generated assets. Normal CI uses
the static profiles and does not run the probe.
