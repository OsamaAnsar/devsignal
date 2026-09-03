import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Check, Github, Search, Share2, Sparkles } from "lucide-react";
import type { Signal, Snapshot } from "./types";

const colors = ["#1748d1", "#d94b31", "#8b7653", "#47705b", "#6e6a8d", "#8a8b84"];
const group = (items: Signal[], key: keyof Signal) => Object.entries(items.reduce<Record<string, number>>((a, x) => { const k = String(x[key] ?? "Unknown"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null); const [source, setSource] = useState("All"); const [query, setQuery] = useState("");
  const [localSignals, setLocalSignals] = useState<Signal[] | null>(null); const [localStatus, setLocalStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [localProgress, setLocalProgress] = useState(0); const [shared, setShared] = useState(false);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/snapshot.json`).then(r => r.json()).then(setData); }, []);
  const signals = localSignals ?? data?.signals ?? [];
  const filtered = useMemo(() => signals.filter(s => (source === "All" || s.source === source) && `${s.title} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [signals, source, query]);
  const topics = group(filtered, "topic"); const languages = group(filtered.filter(x=>x.language), "language").slice(0,6); const sentiment = group(filtered, "sentiment");
  const sourceMax = filtered.reduce<Record<string, number>>((max, signal) => ({ ...max, [signal.source]: Math.max(max[signal.source] ?? 0, signal.score) }), {});
  const top = [...filtered].sort((a,b)=>(b.score/(sourceMax[b.source]||1))-(a.score/(sourceMax[a.source]||1))).slice(0,8);
  if (!data) return <main className="loading">Reading the signal…</main>;
  const positiveCount = signals.filter(signal => signal.sentiment === "positive").length;
  const negativeCount = signals.filter(signal => signal.sentiment === "negative").length;
  const pulse = signals.length ? Math.round((positiveCount / signals.length) * 100) : 0;
  const activeSummary = localStatus === "ready" ? [
    `The local model reads ${pulse}% of today’s signals as positive.`,
    `${negativeCount} signal${negativeCount === 1 ? "" : "s"} carry negative language and may deserve a closer look.`,
    `All ${signals.length} items were analyzed privately on this device—no prompt or headline left the browser.`
  ] : data.summary;
  const sources = ["All", ...Array.from(new Set(data.signals.map(signal => signal.source)))];
  const shareBrief = async () => {
    const text = `Today’s DevSignal: ${activeSummary.join(" ")}\n\n${window.location.origin}${import.meta.env.BASE_URL}`;
    if (navigator.share) await navigator.share({ title: "Today’s DevSignal", text, url: window.location.href });
    else await navigator.clipboard.writeText(text);
    setShared(true); window.setTimeout(() => setShared(false), 1800);
  };
  const runLocalAi = async () => {
    setLocalStatus("loading"); setLocalProgress(1);
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const classifier = await pipeline("sentiment-analysis", "Xenova/distilbert-base-uncased-finetuned-sst-2-english", { dtype: "q8", progress_callback: (event: any) => { if (typeof event.progress === "number") setLocalProgress(Math.round(event.progress)); } });
      const raw = await classifier(data.signals.map(signal => `${signal.title}. ${signal.description ?? ""}`)) as unknown as Array<Array<{ label: string; score: number }> | { label: string; score: number }>;
      setLocalSignals(data.signals.map((signal, index) => {
        const result = Array.isArray(raw[index]) ? raw[index][0] : raw[index];
        const sentiment = result.score < .6 ? "neutral" : result.label.toLowerCase() === "positive" ? "positive" : "negative";
        return { ...signal, sentiment, confidence: result.score, aiTake: `The local model reads the language around this signal as ${sentiment}.` };
      }));
      setLocalProgress(100); setLocalStatus("ready");
    } catch (error) { console.error(error); setLocalStatus("error"); }
  };
  const hnCount = data.signals.filter(s=>s.source === "Hacker News").length;
  const sourceCount = new Set(data.signals.map(signal => signal.source)).size;
  return <div className="shell">
    <header><a className="brand" href="#">DevSignal<span>tech field notes</span></a><div className="edition">Daily edition · {new Date(data.generatedAt).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}</div><nav><a href="#dashboard">Overview</a><a href="#signals">Index</a><a aria-label="GitHub repository" href="https://github.com/OsamaAnsar/devsignal"><Github size={17}/></a></nav></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="kicker">Independent technology intelligence</div><h1>A quieter way to read<br/>the developer internet.</h1><p>DevSignal collects the developer web—from Hacker News and GitHub to npm, Reddit and independent communities—and turns it into one considered daily brief.</p><a className="jump" href="#dashboard">Read today’s signal <span>↓</span></a></div><aside className="method"><span>Today’s sample</span><dl><div><dt>{data.signals.length}</dt><dd>signals reviewed</dd></div><div><dt>{sourceCount}</dt><dd>active sources</dd></div><div><dt>{hnCount}</dt><dd>Hacker News stories</dd></div></dl><p>Collected automatically. Classified with {data.mode === "openai" ? "OpenAI" : "transparent keyword rules"}. Every item links to its source.</p></aside></section>
      <section className="insights"><div className="section-label"><span>{localStatus === "ready" ? "Local AI active" : data.mode === "openai" ? "AI briefing" : "Automated briefing"}</span><div className="brief-actions"><small>{localStatus === "ready" ? "Sentiment analyzed privately in this browser" : data.mode === "openai" ? `Analyzed by ${data.model ?? "OpenAI"} · source links retained` : "Keyword fallback · free local AI is available below"}</small><button onClick={shareBrief}>{shared ? <Check size={13}/> : <Share2 size={13}/>} {shared ? "Ready to share" : "Share brief"}</button></div></div><div className="insight-grid">{activeSummary.map((x,i)=><article key={x}><b>{i+1}</b><p>{x}</p></article>)}</div></section>
      <section id="dashboard" className="dashboard"><div className="section-head"><div><div className="section-label"><span>01 / Overview</span></div><h2>What the feed is saying</h2></div><div className="filters"><div className="search"><Search size={15}/><input aria-label="Search signals" placeholder="Search the index" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Filter by source" value={source} onChange={event=>setSource(event.target.value)}>{sources.map(item=><option key={item}>{item}</option>)}</select></div></div>
        <div className={`ai-pulse ${localStatus === "ready" ? "active" : ""}`}><div><Sparkles size={17}/><span>AI signal pulse</span></div><strong>{pulse}%</strong><p>{localStatus === "ready" ? "positive language detected by the local model" : "baseline positive signals—run local AI to recalculate"}</p><span className="privacy-dot">{localStatus === "ready" ? "On-device analysis complete" : "Private · zero API cost"}</span></div>
        <div className="charts"><article className="wide"><h3>Topic momentum</h3><ResponsiveContainer width="100%" height={260}><BarChart data={topics} layout="vertical" margin={{left:20}}><CartesianGrid stroke="#d7d4ca" horizontal={false}/><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={125} tick={{fill:"#62645e",fontSize:12}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/><Bar dataKey="value" radius={0}>{topics.map((_,i)=><Cell fill={colors[i%colors.length]} key={i}/>)}</Bar></BarChart></ResponsiveContainer></article>
        <article><h3>Sentiment mix</h3><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={sentiment} dataKey="value" innerRadius={55} outerRadius={82} paddingAngle={1}>{sentiment.map((_,i)=><Cell fill={colors[(i+3)%colors.length]} key={i}/>)}</Pie><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/></PieChart></ResponsiveContainer><div className="legend">{sentiment.map((x,i)=><span key={x.name}><i style={{background:colors[(i+3)%colors.length]}}/>{x.name} {x.value}</span>)}</div></article>
        <article><h3>Trending languages</h3><ResponsiveContainer width="100%" height={230}><AreaChart data={languages}><defs><linearGradient id="g"><stop offset="0" stopColor="#1748d1" stopOpacity=".5"/><stop offset="1" stopColor="#1748d1" stopOpacity=".02"/></linearGradient></defs><XAxis dataKey="name" tick={{fill:"#62645e",fontSize:11}} axisLine={false} tickLine={false}/><YAxis hide/><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/><Area type="monotone" dataKey="value" stroke="#1748d1" fill="url(#g)"/></AreaChart></ResponsiveContainer></article></div>
      </section>
      <section id="signals" className="signals"><div className="section-head"><div><div className="section-label"><span>02 / Index</span></div><h2>Eight things worth opening</h2></div><div className="local-ai"><button onClick={runLocalAi} disabled={localStatus === "loading" || localStatus === "ready"}><Sparkles size={13}/>{localStatus === "loading" ? `Loading model ${localProgress}%` : localStatus === "ready" ? "Local AI active" : "Run free local AI"}</button>{localStatus === "loading" && <i><span style={{width:`${localProgress}%`}}/></i>}<small>{localStatus === "error" ? "Could not load the model. Click to retry." : "DistilBERT · no key · on your device"}</small></div></div><div className="signal-list">{top.map((s,i)=><a href={s.url} target="_blank" rel="noreferrer" key={s.id}><b>{String(i+1).padStart(2,"0")}</b><div><span className="source">{s.source}</span><h3>{s.title}</h3><p>{s.description || `${s.topic} signal from ${s.source}.`}</p>{s.aiTake&&<p className="ai-take"><span>AI take</span>{s.aiTake}{typeof s.confidence === "number" && <small>{Math.round(s.confidence*100)}% confidence</small>}</p>}<div><mark>{s.topic}</mark>{s.language&&<mark>{s.language}</mark>}</div></div><aside><strong>{s.score.toLocaleString()}</strong><small>{s.metric ?? (s.source==="Hacker News"?"points":"stars")}</small><ArrowUpRight/></aside></a>)}</div></section>
    </main><footer><span>DevSignal</span><p>Built by Osama Ansar · Public data, collected responsibly.</p><a href="https://github.com/OsamaAnsar/devsignal">Source & methodology <ArrowUpRight size={14}/></a></footer>
  </div>;
}
