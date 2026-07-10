import { fallback, REASON } from './status.js';

export class LoginQueue {
  constructor({ maxConcurrent = 2, maxQueue = 10 } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.waiting = [];
  }

  get size() {
    return this.waiting.length;
  }

  get running() {
    return this.active;
  }

  async run(task) {
    if (this.active >= this.maxConcurrent && this.waiting.length >= this.maxQueue) {
      return fallback(
        REASON.QUEUE_FULL,
        'ESPN login is busy right now. Wait a minute and try again.',
      );
    }

    if (this.active >= this.maxConcurrent) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
