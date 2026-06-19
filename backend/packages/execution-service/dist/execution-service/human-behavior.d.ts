import { Page, Locator } from 'playwright';
export declare function humanDelay(min?: number, max?: number): Promise<void>;
export declare function humanType(page: Page, locator: Locator, text: string): Promise<void>;
export declare function humanClick(page: Page, locator: Locator): Promise<void>;
export declare function humanScroll(page: Page, locator?: Locator, direction?: 'up' | 'down'): Promise<void>;
//# sourceMappingURL=human-behavior.d.ts.map