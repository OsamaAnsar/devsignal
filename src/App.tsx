import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Bookmark, Check, Github, Search, Share2, Sparkles } from "lucide-react";
import type { Signal, Snapshot } from "./types";

const colors = ["#1748d1", "#d94b31", "#8b7653", "#47705b", "#6e6a8d", "#8a8b84"];
const group = (items: Signal[], key: keyof Signal) => Object.entries(items.reduce<Record<string, number>>((a, x) => { const k = String(x[key] ?? "Unknown"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
const savedFromStorage = () => { try { return JSON.parse(localStorage.getItem("devsignal-saved") ?? "[]") as string[]; } catch { return []; } };
const readFromStorage = () => { try { return JSON.parse(localStorage.getItem("devsignal-read") ?? "[]") as string[]; } catch { return []; } };

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null); const [source, setSource] = useState("All"); const [query, setQuery] = useState("");
  const [localSignals, setLocalSignals] = useState<Signal[] | null>(null); const [localStatus, setLocalStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [localProgress, setLocalProgress] = useState(0); const [shared, setShared] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8); const loadMoreRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<"balanced" | "score" | "title">("balanced"); const [savedOnly, setSavedOnly] = useState(false); const [savedIds, setSavedIds] = useState<string[]>(savedFromStorage); const searchRef = useRef<HTMLInputElement>(null);
  const [hideRead, setHideRead] = useState(false); const [readIds, setReadIds] = useState<string[]>(readFromStorage);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/snapshot.json`).then(r => r.json()).then(setData); }, []);
  useEffect(() => { localStorage.setItem("devsignal-saved", JSON.stringify(savedIds)); }, [savedIds]);
  useEffect(() => { localStorage.setItem("devsignal-read", JSON.stringify(readIds)); }, [readIds]);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.key === "/" && document.activeElement?.tagName !== "INPUT") { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  const signals = localSignals ?? data?.signals ?? [];
  const filtered = useMemo(() => signals.filter(s => (!savedOnly || savedIds.includes(s.id)) && (!hideRead || !readIds.includes(s.id)) && (source === "All" || s.source === source) && `${s.title} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [signals, source, query, savedOnly, savedIds, hideRead, readIds]);
  const topics = group(filtered, "topic"); const languages = group(filtered.filter(x=>x.language), "language").slice(0,6); const sentiment = group(filtered, "sentiment");
  const sourceMax = filtered.reduce<Record<string, number>>((max, signal) => ({ ...max, [signal.source]: Math.max(max[signal.source] ?? 0, signal.score) }), {});
  const ranked = [...filtered].sort((a,b)=>sort === "score" ? b.score-a.score : sort === "title" ? a.title.localeCompare(b.title) : (b.score/(sourceMax[b.source]||1))-(a.score/(sourceMax[a.source]||1)));
  const visibleSignals = ranked.slice(0, visibleCount);
  useEffect(() => setVisibleCount(8), [source, query, sort, savedOnly, hideRead]);
  useEffect(() => {
    const target = loadMoreRef.current; if (!target || visibleCount >= filtered.length) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) setVisibleCount(count => Math.min(count + 8, filtered.length)); }, { rootMargin: "280px" });
    observer.observe(target); return () => observer.disconnect();
  }, [visibleCount, filtered.length]);
  if (!data) return <main className="loading">Reading the signal…</main>;
  const positiveCount = filtered.filter(signal => signal.sentiment === "positive").length;
  const negativeCount = filtered.filter(signal => signal.sentiment === "negative").length;
  const pulse = filtered.length ? Math.round((positiveCount / filtered.length) * 100) : 0;
  const analyzedCount = filtered.filter(signal => typeof signal.confidence === "number").length;
  const activeSummary = localStatus === "ready" ? [
    `The local model reads ${pulse}% of today’s signals as positive.`,
    `${negativeCount} signal${negativeCount === 1 ? "" : "s"} carry negative language and may deserve a closer look.`,
    `${analyzedCount} items in this view were analyzed privately on this device—no prompt or headline left the browser.`
  ] : data.summary;
  const sources = ["All", ...Array.from(new Set(data.signals.map(signal => signal.source)))];
  const sourceHealth = group(data.signals, "source");
  const toggleSaved = (id: string) => setSavedIds(ids => ids.includes(id) ? ids.filter(saved => saved !== id) : [...ids, id]);
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
      const targets = filtered;
      const raw = await classifier(targets.map(signal => `${signal.title}. ${signal.description ?? ""}`)) as unknown as Array<Array<{ label: string; score: number }> | { label: string; score: number }>;
      const results = new Map(targets.map((signal, index) => [signal.id, Array.isArray(raw[index]) ? raw[index][0] : raw[index]]));
      setLocalSignals(signals.map(signal => {
        const result = results.get(signal.id); if (!result) return signal;
        const sentiment = result.score < .6 ? "neutral" : result.label.toLowerCase() === "positive" ? "positive" : "negative";
        return { ...signal, sentiment, confidence: result.score, aiTake: `The local model reads the language around this signal as ${sentiment}.` };
      }));
      setLocalProgress(100); setLocalStatus("ready");
    } catch (error) { console.error(error); setLocalStatus("error"); }
  };
  const hnCount = data.signals.filter(s=>s.source === "Hacker News").length;
  const sourceCount = new Set(data.signals.map(signal => signal.source)).size;
  return <div className="shell">
    <header><a className="brand" href="#">DevSignal<span>developer news, simplified</span></a><div className="edition">Updated · {new Date(data.generatedAt).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}</div><nav><a href="#dashboard">Trends</a><a href="#signals">Stories</a><a aria-label="GitHub repository" href="https://github.com/OsamaAnsar/devsignal"><Github size={17}/></a></nav></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="kicker">One daily view of developer news</div><h1>See what developers are<br/>talking about today.</h1><p>DevSignal brings popular stories, projects, packages and articles from developer communities into one page—so you can spot trends without checking eight different websites.</p><a className="jump" href="#signals">Browse today’s top stories <span>↓</span></a></div><aside className="method"><span>What you’re looking at</span><dl><div><dt>{data.signals.length}</dt><dd>stories and projects</dd></div><div><dt>{sourceCount}</dt><dd>websites checked</dd></div><div><dt>{hnCount}</dt><dd>from Hacker News</dd></div></dl><p>We refresh the data automatically, group similar subjects, and keep every original source link. Nothing here is sponsored.</p></aside></section>
      <section className="how-it-works" aria-labelledby="how-title"><div><div className="section-label"><span>New here?</span></div><h2 id="how-title">Use DevSignal in three steps</h2></div><ol><li><b>1</b><div><strong>Scan the trends</strong><span>The charts show which topics and tools appear most often today.</span></div></li><li><b>2</b><div><strong>Filter what matters</strong><span>Search, choose a source, or change the ranking to narrow the list.</span></div></li><li><b>3</b><div><strong>Open or save a story</strong><span>Each result opens the original website. Use the bookmark to keep it for later.</span></div></li></ol></section>
      <section className="insights"><div className="section-label"><span>{localStatus === "ready" ? "Local AI active" : data.mode === "openai" ? "AI briefing" : "Automated briefing"}</span><div className="brief-actions"><small>{localStatus === "ready" ? "Sentiment analyzed privately in this browser" : data.mode === "openai" ? `Analyzed by ${data.model ?? "OpenAI"} · source links retained` : "Keyword fallback · free local AI is available below"}</small><button onClick={shareBrief}>{shared ? <Check size={13}/> : <Share2 size={13}/>} {shared ? "Ready to share" : "Share brief"}</button></div></div><div className="insight-grid">{activeSummary.map((x,i)=><article key={x}><b>{i+1}</b><p>{x}</p></article>)}</div></section>
      <section id="dashboard" className="dashboard"><div className="section-head"><div><div className="section-label"><span>01 / Today’s trends</span></div><h2>What is getting attention</h2><p className="section-help">These charts summarize the stories currently shown by your filters.</p></div><div className="filters"><div className="search"><Search size={15}/><input ref={searchRef} aria-label="Search stories" placeholder="Search stories  /" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Show stories from" value={source} onChange={event=>setSource(event.target.value)}>{sources.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Sort stories" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="balanced">Best from each source</option><option value="score">Most popular first</option><option value="title">Title A–Z</option></select><button className={savedOnly?"active":""} onClick={()=>setSavedOnly(value=>!value)}><Bookmark size={12}/>{savedIds.length} saved</button></div></div>
        <div className={`ai-pulse ${localStatus === "ready" ? "active" : ""}`}><div><Sparkles size={17}/><span>Tone of today’s stories</span></div><strong>{pulse}%</strong><p>{localStatus === "ready" ? "use positive language in the current view" : "are currently classified as positive"}</p><span className="privacy-dot">{localStatus === "ready" ? `${analyzedCount} items checked by AI on this device` : "Optional AI available below"}</span></div>
        <div className="source-health"><span>Stories by website</span>{sourceHealth.map(item=><i key={item.name}><b/>{item.name} <em>{item.value}</em></i>)}</div>
        <div className="charts"><article className="wide"><h3>Topic momentum</h3><ResponsiveContainer width="100%" height={260}><BarChart data={topics} layout="vertical" margin={{left:20}}><CartesianGrid stroke="#d7d4ca" horizontal={false}/><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={125} tick={{fill:"#62645e",fontSize:12}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/><Bar dataKey="value" radius={0}>{topics.map((_,i)=><Cell fill={colors[i%colors.length]} key={i}/>)}</Bar></BarChart></ResponsiveContainer></article>
        <article><h3>Sentiment mix</h3><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={sentiment} dataKey="value" innerRadius={55} outerRadius={82} paddingAngle={1}>{sentiment.map((_,i)=><Cell fill={colors[(i+3)%colors.length]} key={i}/>)}</Pie><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/></PieChart></ResponsiveContainer><div className="legend">{sentiment.map((x,i)=><span key={x.name}><i style={{background:colors[(i+3)%colors.length]}}/>{x.name} {x.value}</span>)}</div></article>
        <article><h3>Trending languages</h3><ResponsiveContainer width="100%" height={230}><AreaChart data={languages}><defs><linearGradient id="g"><stop offset="0" stopColor="#1748d1" stopOpacity=".5"/><stop offset="1" stopColor="#1748d1" stopOpacity=".02"/></linearGradient></defs><XAxis dataKey="name" tick={{fill:"#62645e",fontSize:11}} axisLine={false} tickLine={false}/><YAxis hide/><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/><Area type="monotone" dataKey="value" stroke="#1748d1" fill="url(#g)"/></AreaChart></ResponsiveContainer></article></div>
      </section>
      <section id="signals" className="signals"><div className="section-head"><div><div className="section-label"><span>02 / Stories and projects</span></div><h2>Open the original sources</h2><p className="section-help">The number on the right is the popularity reported by that website—for example, points, stars or reactions.</p></div><div className="local-ai"><button onClick={runLocalAi} disabled={localStatus === "loading" || !filtered.length}><Sparkles size={13}/>{localStatus === "loading" ? `Downloading AI ${localProgress}%` : localStatus === "ready" ? "Check these stories again" : "Analyze tone with free AI"}</button>{localStatus === "loading" && <i><span style={{width:`${localProgress}%`}}/></i>}<small>{localStatus === "error" ? "Could not load the model. Click to retry." : "Optional · private · runs in your browser"}</small></div></div>
        <div className="reading-controls"><span>{filtered.length} signals in view</span><button className={hideRead ? "active" : ""} onClick={()=>setHideRead(value=>!value)}>{hideRead ? "Showing unread only" : `${readIds.length} read · hide them`}</button>{(readIds.length > 0 || savedIds.length > 0) && <button onClick={()=>{setReadIds([]);setSavedIds([]);setSavedOnly(false);setHideRead(false)}}>Reset reading list</button>}</div>
        <div className="signal-list">{visibleSignals.map((s,i)=><article className={`signal-row ${readIds.includes(s.id) ? "read" : ""}`} key={s.id}><a href={s.url} target="_blank" rel="noreferrer" onClick={()=>setReadIds(ids=>ids.includes(s.id)?ids:[...ids,s.id])}><b>{String(i+1).padStart(2,"0")}</b><div><span className="source">{s.source}</span><h3>{s.title}</h3><p>{s.description || `${s.topic} signal from ${s.source}.`}</p>{s.aiTake&&<p className="ai-take"><span>AI take</span>{s.aiTake}{typeof s.confidence === "number" && <small>{Math.round(s.confidence*100)}% confidence</small>}</p>}<div><mark>{s.topic}</mark>{s.language&&<mark>{s.language}</mark>}</div></div><aside><strong>{s.score.toLocaleString()}</strong><small>{s.metric ?? (s.source==="Hacker News"?"points":"stars")}</small><ArrowUpRight/></aside></a><button className={`save-signal ${savedIds.includes(s.id)?"saved":""}`} aria-label={savedIds.includes(s.id)?"Remove from saved":"Save for later"} title={savedIds.includes(s.id)?"Remove from saved":"Save for later"} onClick={()=>toggleSaved(s.id)}><Bookmark size={14} fill={savedIds.includes(s.id)?"currentColor":"none"}/></button></article>)}</div><div className="load-more" ref={loadMoreRef}>{visibleCount < filtered.length ? <><i/><span>Scroll for more · {Math.min(visibleCount, filtered.length)} of {filtered.length}</span></> : <span>{filtered.length ? `All ${filtered.length} signals loaded` : "No signals match this filter"}</span>}</div></section>
    </main><footer><span>DevSignal</span><p>Built by Osama Ansar · Public data, collected responsibly.</p><a href="https://github.com/OsamaAnsar/devsignal">Source & methodology <ArrowUpRight size={14}/></a></footer>
  </div>;
}
