import type { Signal, Source } from "../types";
export declare function analyzeText(title: string, description?: string): {
    readonly topic: string;
    readonly sentiment: "positive" | "neutral" | "negative";
};
export declare function makeSignal(input: Omit<Signal, "topic" | "sentiment">): Signal;
export declare function summarize(signals: Signal[]): string[];
export declare const sourceLabel: (source: Source) => "HN" | "GH";
