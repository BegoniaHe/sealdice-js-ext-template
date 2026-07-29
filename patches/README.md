# SealDice Core patches

These patches are deliberately stored as reviewable, unapplied files: this
template never edits `reference/sealdice-core`.

Both `sealdice-core` patches target the Core commit
`b06a2d92a7af0b8b33be33390206297edf29c7bd` and should be applied in numeric
order:

- `0001-start-js-event-loop-before-js-init-returns.patch` removes the startup
  window in which `Dice.JsInit()` returns before the background event loop has
  marked itself running.
- `0002-bound-js-module-load-wait.patch` replaces the unbounded
  `EventLoop.RequireModule()` wait with a Core-owned, cancellable 30-second
  request. A delayed callback observes cancellation and does not load the
  script later.

Apply it only in a separately maintained Core checkout after review:

```sh
git -C /path/to/sealdice-core apply --check \
  /path/to/sealdice-js-ext-template/patches/sealdice-core/0001-start-js-event-loop-before-js-init-returns.patch
git -C /path/to/sealdice-core apply \
  /path/to/sealdice-js-ext-template/patches/sealdice-core/0001-start-js-event-loop-before-js-init-returns.patch
```

The template runtime harness retains its own short timeout, so a future
event-loop failure is diagnosed rather than hanging indefinitely even when a
Core patch is not installed.
