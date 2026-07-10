import crypto from 'node:crypto';

export class ChallengeStore {
  constructor({ ttlMs = 5 * 60_000 } = {}) {
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  create(value) {
    const challengeId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      void this.delete(challengeId);
    }, this.ttlMs);
    timeout.unref?.();
    this.items.set(challengeId, { value, timeout });
    return challengeId;
  }

  take(challengeId) {
    const item = this.items.get(challengeId);
    if (!item) return null;
    clearTimeout(item.timeout);
    this.items.delete(challengeId);
    return item.value;
  }

  async delete(challengeId) {
    const item = this.items.get(challengeId);
    if (!item) return;
    clearTimeout(item.timeout);
    this.items.delete(challengeId);
    await item.value?.context?.close?.().catch(() => undefined);
  }

  async closeAll() {
    await Promise.all([...this.items.keys()].map((id) => this.delete(id)));
  }
}
