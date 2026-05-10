import type { CrawlJob } from '../shared/types/index.js';
interface CrawlResult {
    siteId: string;
    pagesDiscovered: number;
    pagesCrawled: number;
    errors: string[];
    duration: number;
}
export declare class SiteCrawler {
    private siteId;
    private domain;
    constructor(siteId: string, domain: string);
    crawl(job: CrawlJob): Promise<CrawlResult>;
    private persistPage;
    private buildAndCacheSiteGraph;
}
export declare class IncrementalRemapper {
    private crawler;
    constructor(siteId: string, domain: string);
    remapPages(urls: string[]): Promise<void>;
}
export {};
//# sourceMappingURL=crawler.d.ts.map