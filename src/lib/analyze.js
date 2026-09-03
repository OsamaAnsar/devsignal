const topicRules = [
    ["AI & Agents", /\b(ai|llm|agent|model|gpt|inference|rag|embedding)\b/i],
    ["Developer Tools", /\b(cli|sdk|api|framework|library|developer|typescript|javascript)\b/i],
    ["Data & Infrastructure", /\b(database|vector|cloud|distributed|storage|kubernetes|postgres)\b/i],
    ["Security", /\b(security|privacy|vulnerability|auth|encryption)\b/i],
    ["Web & Product", /\b(web|browser|react|product|startup|open source)\b/i]
];
const positive = /\b(fast|better|launch|new|open|improve|success|powerful)\b/i;
const negative = /\b(bug|fail|breach|slow|problem|attack|dead|decline)\b/i;
export function analyzeText(title, description = "") {
    const text = `${title} ${description}`;
    const topic = topicRules.find(([, rule]) => rule.test(text))?.[0] ?? "Other";
    const sentiment = negative.test(text) ? "negative" : positive.test(text) ? "positive" : "neutral";
    return { topic, sentiment };
}
export function makeSignal(input) {
    return { ...input, ...analyzeText(input.title, input.description) };
}
export function summarize(signals) {
    const count = (key) => Object.entries(signals.reduce((a, s) => {
        const value = String(s[key] ?? "Unknown");
        a[value] = (a[value] ?? 0) + 1;
        return a;
    }, {})).sort((a, b) => b[1] - a[1]);
    const topTopic = count("topic")[0];
    const topLanguage = count("language").find(([name]) => name !== "Unknown");
    const leader = [...signals].sort((a, b) => b.score - a.score)[0];
    return [
        `${topTopic?.[0] ?? "Technology"} leads this snapshot with ${topTopic?.[1] ?? 0} signals.`,
        topLanguage ? `${topLanguage[0]} is the most visible language across trending repositories.` : "Language data is still developing.",
        leader ? `Highest-momentum item: “${leader.title}” (${leader.score.toLocaleString()} points/stars).` : "No signals collected."
    ];
}
export const sourceLabel = (source) => source === "Hacker News" ? "HN" : "GH";
