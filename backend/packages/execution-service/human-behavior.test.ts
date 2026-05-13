import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { humanDelay } from './human-behavior';

describe('humanDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(global, 'setTimeout');
    vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should call setTimeout with a delay within the specified bounds', async () => {
    // Mock Math.random to return a predictable value (e.g., 0.5)
    vi.mocked(Math.random).mockReturnValue(0.5);

    const min = 100;
    const max = 200;
    const expectedDelay = min + 0.5 * (max - min); // 150

    const delayPromise = humanDelay(min, max);

    // Fast-forward time
    vi.runAllTimers();

    await delayPromise;

    expect(global.setTimeout).toHaveBeenCalledTimes(1);
    expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), expectedDelay);
  });

  it('should use default bounds if none are provided', async () => {
    vi.mocked(Math.random).mockReturnValue(0);

    const delayPromise = humanDelay();

    vi.runAllTimers();

    await delayPromise;

    expect(global.setTimeout).toHaveBeenCalledTimes(1);
    expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 80); // Default min is 80
  });

  it('should calculate correct delay when random is 1', async () => {
    vi.mocked(Math.random).mockReturnValue(1);

    const delayPromise = humanDelay();

    vi.runAllTimers();

    await delayPromise;

    expect(global.setTimeout).toHaveBeenCalledTimes(1);
    expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 250); // Default max is 250
  });
});
