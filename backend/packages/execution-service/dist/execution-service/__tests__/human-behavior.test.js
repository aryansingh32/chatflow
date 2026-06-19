import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { humanDelay, humanType, humanClick, humanScroll } from '../human-behavior';
describe('human-behavior', () => {
    let mockPage;
    let mockLocator;
    beforeEach(() => {
        vi.useFakeTimers({
            toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
        });
        mockPage = {
            keyboard: {
                type: vi.fn().mockResolvedValue(undefined),
                press: vi.fn().mockResolvedValue(undefined),
            },
            mouse: {
                move: vi.fn().mockResolvedValue(undefined),
                down: vi.fn().mockResolvedValue(undefined),
                up: vi.fn().mockResolvedValue(undefined),
                wheel: vi.fn().mockResolvedValue(undefined),
            },
        };
        mockLocator = {
            first: vi.fn().mockReturnThis(),
            scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
            click: vi.fn().mockResolvedValue(undefined),
            boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 50 }),
        };
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.restoreAllMocks();
    });
    describe('humanDelay', () => {
        it('should wait for a random time between min and max', async () => {
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const promise = humanDelay(100, 200);
            await vi.runAllTimersAsync();
            await promise;
            expect(randomSpy).toHaveBeenCalled();
        });
    });
    describe('humanType', () => {
        it('should scroll into view, click, clear, and type text with bursts', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const text = 'hello world';
            const promise = humanType(mockPage, mockLocator, text);
            await vi.runAllTimersAsync();
            await promise;
            expect(mockLocator.first).toHaveBeenCalled();
            expect(mockLocator.scrollIntoViewIfNeeded).toHaveBeenCalled();
            expect(mockPage.mouse.move).toHaveBeenCalled();
            expect(mockPage.mouse.down).toHaveBeenCalled();
            expect(mockPage.mouse.up).toHaveBeenCalled();
            expect(mockLocator.fill).toHaveBeenCalledWith('');
            expect(mockPage.keyboard.type).toHaveBeenCalled();
        });
        it('should simulate mistakes during typing', async () => {
            let randomCalls = 0;
            vi.spyOn(Math, 'random').mockImplementation(() => {
                randomCalls++;
                // The first few random calls are for humanDelay, humanClick (which has many calls), humanDelay...
                // We only want the random call for the typing mistake to be < 0.02.
                // It's safer to just return a sequence or force the condition.
                // Let's just always return 0.01.
                return 0.01;
            });
            const text = 'a';
            const promise = humanType(mockPage, mockLocator, text);
            await vi.runAllTimersAsync();
            await promise;
            // When random is 0.01, chance of mistake (< 0.02) triggers.
            // typed wrong character, then backspace, then the correct character.
            expect(mockPage.keyboard.type).toHaveBeenCalledTimes(2);
            expect(mockPage.keyboard.press).toHaveBeenCalledWith('Backspace');
        });
    });
    describe('humanClick', () => {
        it('should click directly if boundingBox is null', async () => {
            mockLocator.boundingBox = vi.fn().mockResolvedValue(null);
            const promise = humanClick(mockPage, mockLocator);
            await vi.runAllTimersAsync();
            await promise;
            expect(mockLocator.click).toHaveBeenCalled();
            expect(mockPage.mouse.move).not.toHaveBeenCalled();
        });
        it('should perform a bezier path mouse movement if boundingBox exists', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const promise = humanClick(mockPage, mockLocator);
            await vi.runAllTimersAsync();
            await promise;
            expect(mockLocator.click).not.toHaveBeenCalled();
            expect(mockPage.mouse.move).toHaveBeenCalled();
            expect(mockPage.mouse.down).toHaveBeenCalled();
            expect(mockPage.mouse.up).toHaveBeenCalled();
        });
    });
    describe('humanScroll', () => {
        it('should scroll into view if locator is provided', async () => {
            const promise = humanScroll(mockPage, mockLocator);
            await vi.runAllTimersAsync();
            await promise;
            expect(mockLocator.first).toHaveBeenCalled();
            expect(mockLocator.scrollIntoViewIfNeeded).toHaveBeenCalled();
            expect(mockPage.mouse.wheel).not.toHaveBeenCalled();
        });
        it('should perform variable speed scrolling if no locator is provided', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const promise = humanScroll(mockPage, undefined, 'down');
            await vi.runAllTimersAsync();
            await promise;
            expect(mockLocator.first).not.toHaveBeenCalled();
            expect(mockPage.mouse.wheel).toHaveBeenCalled();
            expect(mockPage.mouse.move).not.toHaveBeenCalled();
        });
        it('should randomly move mouse during scrolling without locator', async () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const promise = humanScroll(mockPage, undefined, 'up');
            await vi.runAllTimersAsync();
            await promise;
            expect(mockPage.mouse.wheel).toHaveBeenCalled();
            expect(mockPage.mouse.move).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=human-behavior.test.js.map