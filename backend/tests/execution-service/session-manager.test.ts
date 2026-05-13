import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../packages/execution-service/session-manager.js';
import { ProxyManager } from '../../packages/execution-service/proxy-manager.js';
import * as db from '../../packages/shared/db/index.js';

vi.mock('../../packages/shared/db/index.js', () => ({
  getPgPool: vi.fn(),
  cacheDelete: vi.fn(),
  CacheKeys: { session: (id: string) => `session:${id}` }
}));

vi.mock('../../packages/execution-service/proxy-manager.js', () => {
  return {
    ProxyManager: vi.fn(function(this: any) {
      this.getBestProxy = vi.fn();
    }),
  };
});

describe('SessionManager.rotateProxy', () => {
  let sessionManager: SessionManager;
  let mockPoolQuery: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery = vi.fn();
    (db.getPgPool as any).mockReturnValue({ query: mockPoolQuery });
    sessionManager = new SessionManager();
  });

  it('should rotate proxy successfully', async () => {
    const mockProxy = { id: 'new-proxy-id' };
    const mockGetBestProxy = vi.fn().mockResolvedValue(mockProxy);
    (sessionManager as any).proxyManager.getBestProxy = mockGetBestProxy;

    const sessionId = 'test-session-id';
    await sessionManager.rotateProxy(sessionId);

    expect(mockGetBestProxy).toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledWith(
      `UPDATE sessions SET proxy_id = $1 WHERE id = $2`,
      [mockProxy.id, sessionId]
    );
    expect(db.cacheDelete).toHaveBeenCalledWith(`session:${sessionId}`);
  });

  it('should do nothing if no proxy is available', async () => {
    const mockGetBestProxy = vi.fn().mockResolvedValue(null);
    (sessionManager as any).proxyManager.getBestProxy = mockGetBestProxy;

    const sessionId = 'test-session-id';
    await sessionManager.rotateProxy(sessionId);

    expect(mockGetBestProxy).toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(db.cacheDelete).not.toHaveBeenCalled();
  });
});
