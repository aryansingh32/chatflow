import { describe, it } from 'node:test';
import assert from 'node:assert';
import { humanDelay, humanScroll } from './human-behavior.js';
import type { Page, Locator } from 'playwright';

describe('humanDelay', () => {
  it('should wait within default bounds', async () => {
    // using node:test mock timers would be cleaner but overriding setTimeout is simple
    const originalSetTimeout = global.setTimeout;
    let timeoutCb: Function | undefined;
    let delayMs = 0;
    (global as any).setTimeout = (cb: Function, ms: number) => {
      timeoutCb = cb;
      delayMs = ms;
    };

    const promise = humanDelay();
    timeoutCb?.();
    await promise;

    assert.ok(delayMs >= 80 && delayMs <= 250);
    global.setTimeout = originalSetTimeout;
  });
});

describe('humanScroll', () => {
  it('should scroll locator into view if locator is provided', async () => {
    let scrolled = false;
    const mockLocator = {
      first: () => ({
        scrollIntoViewIfNeeded: async () => {
          scrolled = true;
        }
      })
    } as unknown as Locator;

    const mockPage = {} as unknown as Page;

    const originalSetTimeout = global.setTimeout;
    (global as any).setTimeout = (cb: Function) => cb();

    try {
      await humanScroll(mockPage, mockLocator);
      assert.strictEqual(scrolled, true);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should use page.mouse.wheel if no locator is provided', async () => {
    let wheelCalled = 0;
    const mockPage = {
      mouse: {
        wheel: async (deltaX: number, deltaY: number) => {
          wheelCalled++;
          assert.strictEqual(deltaX, 0);
          assert.ok(deltaY > 0);
        },
        move: async () => {}
      }
    } as unknown as Page;

    const originalSetTimeout = global.setTimeout;
    (global as any).setTimeout = (cb: Function) => cb();

    try {
      await humanScroll(mockPage);
      assert.ok(wheelCalled >= 3 && wheelCalled <= 7);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });

  it('should scroll up if direction is "up"', async () => {
    let wheelCalled = 0;
    const mockPage = {
      mouse: {
        wheel: async (deltaX: number, deltaY: number) => {
          wheelCalled++;
          assert.strictEqual(deltaX, 0);
          assert.ok(deltaY < 0);
        },
        move: async () => {}
      }
    } as unknown as Page;

    const originalSetTimeout = global.setTimeout;
    (global as any).setTimeout = (cb: Function) => cb();

    try {
      await humanScroll(mockPage, undefined, 'up');
      assert.ok(wheelCalled >= 3 && wheelCalled <= 7);
    } finally {
      global.setTimeout = originalSetTimeout;
    }
  });
});
