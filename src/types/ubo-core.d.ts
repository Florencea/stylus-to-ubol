declare module "@gorhill/ubo-core" {
  export class StaticNetFilteringEngine {
    static create(): Promise<StaticNetFilteringEngine>;
    deserialize(data: string): Promise<void>;
    match(context: unknown): number;
  }
}

declare module "@gorhill/ubo-core/js/static-filtering-parser.js" {
  export interface AstFilterDomain {
    hn: string;
    not: boolean;
    bad: boolean;
  }

  export class AstFilterParser {
    constructor();
    parse(line: string): void;
    getType(): number;
    isComment(): boolean;
    isFilter(): boolean;
    isNetworkFilter(): boolean;
    isExtendedFilter(): boolean;
    isCosmeticFilter(): boolean;
    isScriptletFilter(): boolean;
    isHtmlFilter(): boolean;
    hasError(): boolean;
    isUnsupported(): boolean;
    getDomainListIterator(): Iterable<AstFilterDomain>;
    getExtFilterDomainIterator(): Iterable<AstFilterDomain>;
    getNodeString(node: number): string;
  }
}
