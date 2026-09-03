import { useState } from "react";
import { ArrowUpRight, Search, Sparkles } from "lucide-react";
import type { Signal } from "../types";

type Match = { signal: Signal; similarity: number };
const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

export function AskDevSignal({ signals }: { signals: Signal[] }) {
  const [question, setQuestion] = useState(""); const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const ask = async (value = question) => {
    const query = value.trim(); if (!query || status === "loading") return;
    setQuestion(query); setStatus("loading");
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
      const documents = signals.map(signal => `${signal.title}. ${signal.description ?? ""}. Topic: ${signal.topic}. Source: ${signal.source}`.slice(0, 420));
      const output = await embed([query, ...documents], { pooling: "mean", normalize: true });
      const vectors = output.tolist() as number[][]; const queryVector = vectors[0];
      setMatches(signals.map((signal, index) => ({ signal, similarity: dot(queryVector, vectors[index + 1]) })).sort((a,b)=>b.similarity-a.similarity).slice(0,5));
      setStatus("ready");
    } catch (error) { console.error(error); setStatus("error"); }
  };
  const examples = ["What AI tools are gaining attention?", "What should frontend developers watch?", "Show recent security concerns"];
  const sources = new Set(matches.map(match => match.signal.source)).size;
  return <section className="ask-devsignal"><div className="ask-intro"><div className="section-label"><span>Private semantic AI</span></div><h2>Ask today’s developer web</h2><p>Ask in normal language. A small AI model runs on your device, finds meaning—not just matching words—and returns only evidence from today’s collected sources.</p><div className="ask-examples">{examples.map(example=><button key={example} onClick={()=>void ask(example)}>{example}</button>)}</div></div><div className="ask-panel"><form onSubmit={event=>{event.preventDefault();void ask()}}><Search size={17}/><input value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Ask about a technology, tool or risk…" aria-label="Ask DevSignal"/><button disabled={!question.trim()||status==="loading"}>{status==="loading"?<><Sparkles size={13}/>Finding evidence…</>:"Ask →"}</button></form>{status==="idle"&&<div className="ask-empty"><Sparkles size={21}/><p>Answers stay grounded in DevSignal’s source links. The question and stories never leave your browser.</p></div>}{status==="error"&&<div className="ask-empty"><p>The semantic model could not load. Check your connection and try again.</p></div>}{status==="ready"&&<div className="ask-results"><div className="answer"><span>Evidence summary</span><p>I found {matches.length} closely related items across {sources} source{sources===1?"":"s"}. The strongest evidence is listed below in relevance order.</p></div>{matches.map(({signal,similarity})=><a href={signal.url} target="_blank" rel="noreferrer" key={signal.id}><div><span>{signal.source} · {signal.topic}</span><strong>{signal.title}</strong></div><small>{Math.round(similarity*100)}% match <ArrowUpRight size={12}/></small></a>)}</div>}</div></section>;
}
