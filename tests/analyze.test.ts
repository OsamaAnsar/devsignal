import { describe, expect, it } from "vitest"; import { analyzeText, makeSignal, summarize } from "../src/lib/analyze";
describe("signal analysis",()=>{
  it("classifies AI topics",()=>expect(analyzeText("A new LLM agent framework").topic).toBe("AI & Agents"));
  it("prioritizes negative sentiment",()=>expect(analyzeText("Security breach in a fast API").sentiment).toBe("negative"));
  it("creates complete signals",()=>expect(makeSignal({id:"1",title:"TypeScript SDK",url:"x",source:"Hacker News",score:1}).topic).toBe("Developer Tools"));
  it("summarizes the strongest signal",()=>expect(summarize([makeSignal({id:"1",title:"AI model launch",url:"x",source:"Hacker News",score:42})])[2]).toContain("42"));
});
