import type { MarkdownIt } from '../markdown-it-types';
import type { MathOptions } from '../config';
export declare const KATEX_COMMANDS: string[];
export declare const ESCAPED_KATEX_COMMANDS: string;
export declare const ESCAPED_MKATWX_COMMANDS: RegExp;
export declare function normalizeStandaloneBackslashT(s: string, opts?: MathOptions): string;
export declare function hasMarkstreamMathPlugin(md: MarkdownIt): boolean;
interface TolerantBoundaryScanWindowCache {
    lineOffset: number;
    source: string;
    windowStart: number;
}
export declare function getTolerantMathBlockBoundaryStreamKey(markdown: string, scanWindowCache?: TolerantBoundaryScanWindowCache): string | null;
export declare function mayContainTolerantMathBlockBoundaryOpener(markdown: string, scanWindowCache?: TolerantBoundaryScanWindowCache): boolean;
export declare function applyMath(md: MarkdownIt, mathOpts?: MathOptions): void;
