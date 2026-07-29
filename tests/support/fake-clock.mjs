function delayValue(delay) {
  const numeric = Number(delay);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.floor(numeric);
}

export class FakeClock {
  #cancelled = new Set();
  #nextIdentifier = 1;
  #now;
  #timers = new Map();

  constructor(now = 0) {
    this.#now = Number(now);
  }

  get now() {
    return this.#now;
  }

  clearInterval(identifier) {
    this.#cancelled.add(identifier);
    this.#timers.delete(identifier);
  }

  clearTimeout(identifier) {
    this.#cancelled.add(identifier);
    this.#timers.delete(identifier);
  }

  pending() {
    return this.#timers.size;
  }

  runAll(limit = 1_000) {
    let executed = 0;
    while (this.#timers.size > 0) {
      if (executed >= limit)
        throw new Error(`FakeClock exceeded ${limit} scheduled callbacks`);
      const timer = this.#nextTimer();
      this.advanceBy(timer.due - this.#now);
      executed += 1;
    }
  }

  setInterval(callback, delay, ...argumentsList) {
    return this.#schedule(callback, delay, argumentsList, true);
  }

  setTimeout(callback, delay, ...argumentsList) {
    return this.#schedule(callback, delay, argumentsList, false);
  }

  advanceBy(milliseconds) {
    const target = this.#now + delayValue(milliseconds);
    while (true) {
      const timer = this.#nextTimer();
      if (!timer || timer.due > target) break;
      this.#now = timer.due;
      this.#timers.delete(timer.identifier);
      timer.callback(...timer.argumentsList);
      if (timer.interval && !this.#cancelled.has(timer.identifier))
        this.#timers.set(timer.identifier, {
          ...timer,
          due: this.#now + Math.max(1, timer.delay),
        });
    }
    this.#now = target;
  }

  assertNoPending() {
    if (this.#timers.size > 0) {
      const identifiers = [...this.#timers.keys()].join(', ');
      throw new Error(`FakeClock still has pending timers: ${identifiers}`);
    }
  }

  #nextTimer() {
    return [...this.#timers.values()].sort(
      (left, right) =>
        left.due - right.due || left.identifier - right.identifier,
    )[0];
  }

  #schedule(callback, delay, argumentsList, interval) {
    if (typeof callback !== 'function')
      throw new TypeError('FakeClock callback must be a function');
    const identifier = this.#nextIdentifier;
    this.#nextIdentifier += 1;
    this.#cancelled.delete(identifier);
    const normalizedDelay = delayValue(delay);
    this.#timers.set(identifier, {
      argumentsList,
      callback,
      delay: normalizedDelay,
      due: this.#now + normalizedDelay,
      identifier,
      interval,
    });
    return identifier;
  }
}
