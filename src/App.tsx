import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Bookmark, Check, Github, Play, Search, Share2, Sparkles } from "lucide-react";
import type { Signal, Snapshot, TrendHistoryDay } from "./types";
import { buildTrendClusters } from "./lib/trends";

const colors = ["#1748d1", "#d94b31", "#8b7653", "#47705b", "#6e6a8d", "#8a8b84"];
const group = (items: Signal[], key: keyof Signal) => Object.entries(items.reduce<Record<string, number>>((a, x) => { const k = String(x[key] ?? "Unknown"); a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
const savedFromStorage = () => { try { return JSON.parse(localStorage.getItem("devsignal-saved") ?? "[]") as string[]; } catch { return []; } };
const readFromStorage = () => { try { return JSON.parse(localStorage.getItem("devsignal-read") ?? "[]") as string[]; } catch { return []; } };
const aiCacheFromStorage = () => { try { return JSON.parse(localStorage.getItem("devsignal-ai-cache-v2") ?? "null") as { generatedAt: string; signals: Signal[] } | null; } catch { return null; } };
const balancedSample = (signals: Signal[], perSource = 6) => { const counts: Record<string, number> = {}; return signals.filter(signal => { counts[signal.source] = (counts[signal.source] ?? 0) + 1; return counts[signal.source] <= perSource; }); };
const toneLabels: Record<Signal["sentiment"], string> = { positive: "Announcements & progress", neutral: "General updates", negative: "Problems & risks" };

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null); const [source, setSource] = useState("All"); const [query, setQuery] = useState("");
  const [history, setHistory] = useState<TrendHistoryDay[]>([]);
  const [localSignals, setLocalSignals] = useState<Signal[] | null>(null); const [localStatus, setLocalStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [localProgress, setLocalProgress] = useState(0); const [localStage, setLocalStage] = useState<"downloading" | "analyzing">("downloading"); const [shared, setShared] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8); const loadMoreRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<"balanced" | "score" | "title">("balanced"); const [savedOnly, setSavedOnly] = useState(false); const [savedIds, setSavedIds] = useState<string[]>(savedFromStorage); const searchRef = useRef<HTMLInputElement>(null);
  const [hideRead, setHideRead] = useState(false); const [readIds, setReadIds] = useState<string[]>(readFromStorage);
  const [selectedTrend, setSelectedTrend] = useState(0);
  const autoAiStarted = useRef(false);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/snapshot.json`).then(r => r.json()).then(setData); }, []);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/history.json`).then(r => r.ok ? r.json() : []).then(setHistory).catch(()=>setHistory([])); }, []);
  useEffect(() => { localStorage.setItem("devsignal-saved", JSON.stringify(savedIds)); }, [savedIds]);
  useEffect(() => { localStorage.setItem("devsignal-read", JSON.stringify(readIds)); }, [readIds]);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.key === "/" && document.activeElement?.tagName !== "INPUT") { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  const signals = localSignals ?? data?.signals ?? [];
  const trendClusters = useMemo(() => buildTrendClusters(signals), [signals]);
  const filtered = useMemo(() => signals.filter(s => (!savedOnly || savedIds.includes(s.id)) && (!hideRead || !readIds.includes(s.id)) && (source === "All" || s.source === source) && `${s.title} ${s.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [signals, source, query, savedOnly, savedIds, hideRead, readIds]);
  const topics = group(filtered, "topic"); const languages = group(filtered.filter(x=>x.language), "language").slice(0,6); const storyTypes = group(filtered, "sentiment").map(item => ({ ...item, name: toneLabels[item.name as Signal["sentiment"]] ?? item.name }));
  const sourceMax = filtered.reduce<Record<string, number>>((max, signal) => ({ ...max, [signal.source]: Math.max(max[signal.source] ?? 0, signal.score) }), {});
  const ranked = [...filtered].sort((a,b)=>sort === "score" ? b.score-a.score : sort === "title" ? a.title.localeCompare(b.title) : (b.score/(sourceMax[b.source]||1))-(a.score/(sourceMax[a.source]||1)));
  const visibleSignals = ranked.slice(0, visibleCount);
  const runLocalAi = async (targets: Signal[]) => {
    if (!targets.length || localStatus === "loading") return;
    setLocalStatus("loading"); setLocalStage("downloading"); setLocalProgress(2);
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const classifier = await pipeline("sentiment-analysis", "Xenova/distilbert-base-uncased-finetuned-sst-2-english", { dtype: "q8", progress_callback: (event: any) => { if (typeof event.progress === "number") setLocalProgress(current => Math.max(current, Math.min(58, Math.round(event.progress * .58)))); } });
      setLocalStage("analyzing"); setLocalProgress(60);
      const results = new Map<string, { label: string; score: number }>(); const batchSize = 8;
      for (let start = 0; start < targets.length; start += batchSize) {
        const batch = targets.slice(start, start + batchSize);
        const raw = await classifier(batch.map(signal => `${signal.title}. ${signal.description ?? ""}`)) as unknown as Array<Array<{ label: string; score: number }> | { label: string; score: number }>;
        batch.forEach((signal, index) => { const result = Array.isArray(raw[index]) ? raw[index][0] : raw[index]; if (result) results.set(signal.id, result); });
        setLocalProgress(60 + Math.round(Math.min(start + batchSize, targets.length) / targets.length * 40));
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      const nextSignals = signals.map(signal => {
        const result = results.get(signal.id); if (!result) return signal;
        const sentiment: Signal["sentiment"] = result.score < .6 ? "neutral" : result.label.toLowerCase() === "positive" ? "positive" : "negative";
        return { ...signal, sentiment, confidence: result.score, aiTake: `This reads as ${toneLabels[sentiment].toLowerCase()}. This describes the wording, not whether the technology is good or bad.` };
      });
      setLocalSignals(nextSignals); if (data) localStorage.setItem("devsignal-ai-cache-v2", JSON.stringify({ generatedAt: data.generatedAt, signals: nextSignals }));
      setLocalProgress(100); setLocalStatus("ready");
    } catch (error) { console.error(error); setLocalStatus("error"); }
  };
  useEffect(() => {
    if (!data || !signals.length || autoAiStarted.current) return;
    const cached = aiCacheFromStorage();
    if (cached?.generatedAt === data.generatedAt && cached.signals.length === data.signals.length) { autoAiStarted.current = true; setLocalSignals(cached.signals); setLocalProgress(100); setLocalStatus("ready"); return; }
    const timer = window.setTimeout(() => { if (autoAiStarted.current) return; autoAiStarted.current = true; void runLocalAi(balancedSample(data.signals)); }, 1200);
    return () => window.clearTimeout(timer);
  }, [data, signals.length]);
  useEffect(() => setVisibleCount(8), [source, query, sort, savedOnly, hideRead]);
  useEffect(() => {
    const target = loadMoreRef.current; if (!target || visibleCount >= filtered.length) return;
    const observer = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting) setVisibleCount(count => Math.min(count + 8, filtered.length)); }, { rootMargin: "280px" });
    observer.observe(target); return () => observer.disconnect();
  }, [visibleCount, filtered.length]);
  if (!data) return <main className="loading">Reading the signal…</main>;
  const progressCount = filtered.filter(signal => signal.sentiment === "positive").length;
  const riskCount = filtered.filter(signal => signal.sentiment === "negative").length;
  const progressShare = filtered.length ? Math.round((progressCount / filtered.length) * 100) : 0;
  const analyzedCount = filtered.filter(signal => typeof signal.confidence === "number").length;
  const activeSummary = localStatus === "ready" ? [
    `${progressShare}% of the current stories are written as announcements, launches or progress.`,
    `${riskCount} stor${riskCount === 1 ? "y discusses" : "ies discuss"} problems, risks or setbacks that may deserve a closer look.`,
    `${analyzedCount} items in this view were analyzed privately on this device—no prompt or headline left the browser.`
  ] : data.summary;
  const sources = ["All", ...Array.from(new Set(data.signals.map(signal => signal.source)))];
  const sourceHealth = group(data.signals, "source");
  const activeTrend = trendClusters[Math.min(selectedTrend, Math.max(0, trendClusters.length - 1))];
  const previousTrend = history.length > 1 ? history.at(-2)?.trends.find(trend => trend.name === activeTrend?.name) : undefined;
  const trendChange = previousTrend && activeTrend ? activeTrend.momentum - previousTrend.momentum : null;
  const toggleSaved = (id: string) => setSavedIds(ids => ids.includes(id) ? ids.filter(saved => saved !== id) : [...ids, id]);
  const shareBrief = async () => {
    const text = `Today’s DevSignal: ${activeSummary.join(" ")}\n\n${window.location.origin}${import.meta.env.BASE_URL}`;
    if (navigator.share) await navigator.share({ title: "Today’s DevSignal", text, url: window.location.href });
    else await navigator.clipboard.writeText(text);
    setShared(true); window.setTimeout(() => setShared(false), 1800);
  };
  const hnCount = data.signals.filter(s=>s.source === "Hacker News").length;
  const sourceCount = new Set(data.signals.map(signal => signal.source)).size;
  return <div className="shell">
    <header><a className="brand" href="#">DevSignal<span>developer news, simplified</span></a><div className="edition">Updated · {new Date(data.generatedAt).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}</div><nav><a href="#dashboard">Trends</a><a href="#signals">Stories</a><a aria-label="GitHub repository" href="https://github.com/OsamaAnsar/devsignal"><Github size={17}/></a></nav></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="kicker">One daily view of developer news</div><h1>See what developers are<br/>talking about today.</h1><p>DevSignal brings popular stories, projects, packages and articles from developer communities into one page—so you can spot trends without checking eight different websites.</p><a className="jump" href="#signals">Browse today’s top stories <span>↓</span></a></div><aside className="method"><span>What you’re looking at</span><dl><div><dt>{data.signals.length}</dt><dd>stories and projects</dd></div><div><dt>{sourceCount}</dt><dd>websites checked</dd></div><div><dt>{hnCount}</dt><dd>from Hacker News</dd></div></dl><p>We refresh the data automatically, group similar subjects, and keep every original source link. Nothing here is sponsored.</p></aside></section>
      <section className="how-it-works" aria-labelledby="how-title"><div><div className="section-label"><span>New here?</span></div><h2 id="how-title">Use DevSignal in three steps</h2></div><ol><li><b>1</b><div><strong>Scan the trends</strong><span>The charts show which topics and tools appear most often today.</span></div></li><li><b>2</b><div><strong>Filter what matters</strong><span>Search, choose a source, or change the ranking to narrow the list.</span></div></li><li><b>3</b><div><strong>Open or save a story</strong><span>Each result opens the original website. Use the bookmark to keep it for later.</span></div></li></ol></section>
      <section className="insights"><div className="section-label"><span>{localStatus === "ready" ? "Live AI briefing" : localStatus === "loading" ? "AI trend scan starting" : data.mode === "openai" ? "AI briefing" : "Daily briefing"}</span><div className="brief-actions"><small>{localStatus === "ready" ? "Analyzed privately in this browser · cached for this edition" : localStatus === "loading" ? `${localStage === "downloading" ? "Downloading private AI model" : "Analyzing a balanced source sample"} · ${localProgress}%` : data.mode === "openai" ? `Analyzed by ${data.model ?? "OpenAI"} · source links retained` : localStatus === "error" ? "AI unavailable · the evidence-based dashboard still works" : "AI analysis starts automatically after the page loads"}</small><button onClick={shareBrief}>{shared ? <Check size={13}/> : <Share2 size={13}/>} {shared ? "Ready to share" : "Share brief"}</button></div></div><div className="insight-grid">{activeSummary.map((x,i)=><article key={x}><b>{i+1}</b><p>{x}</p></article>)}</div></section>
      {activeTrend && <section className="observatory"><div className="section-head"><div><div className="section-label"><span>Live trend observatory</span></div><h2>See technologies move</h2><p className="section-help">Each circle connects related evidence across websites. Higher means more momentum; farther right means broader adoption.</p></div><span className="history-note">{history.length > 1 ? `${history.length} daily observations saved` : "Day 1 baseline · movement tracking has started"}</span></div><div className="radar-layout"><div className="trend-radar" aria-label="Technology momentum radar"><span className="axis-y">More momentum ↑</span><span className="axis-x">Emerging → Established</span>{trendClusters.map((cluster,index)=><button key={cluster.name} className={selectedTrend===index?"active":""} style={{left:`${Math.max(10,Math.min(86,cluster.maturity))}%`,bottom:`${Math.max(15,Math.min(82,cluster.momentum))}%`,width:`${Math.min(96,52+cluster.signals.length*3)}px`,height:`${Math.min(96,52+cluster.signals.length*3)}px`}} onClick={()=>setSelectedTrend(index)} aria-label={`${cluster.name}: ${cluster.momentum} momentum`}><b>{cluster.momentum}</b><span>{cluster.name}</span></button>)}</div><aside className="trend-evidence"><div><span className={`phase ${activeTrend.phase.toLowerCase()}`}>{activeTrend.phase}</span><small>{activeTrend.momentum}/100 momentum {trendChange !== null && `· ${trendChange >= 0 ? "+" : ""}${trendChange} since yesterday`}</small></div><h3>{activeTrend.name}</h3><p>{activeTrend.explanation}</p><dl><div><dt>{activeTrend.signals.length}</dt><dd>related items</dd></div><div><dt>{activeTrend.sources.length}</dt><dd>independent sources</dd></div><div><dt>{activeTrend.maturity}%</dt><dd>source reach</dd></div></dl><div className="evidence-links">{activeTrend.signals.slice(0,3).map(signal=><a key={signal.id} href={signal.url} target="_blank" rel="noreferrer"><span>{signal.source}</span>{signal.title}<ArrowUpRight size={12}/></a>)}</div><button className="view-cluster" onClick={()=>{setQuery(activeTrend.query);document.querySelector("#signals")?.scrollIntoView()}}>View matching stories ↓</button></aside></div></section>}
      <section id="dashboard" className="dashboard"><div className="section-head"><div><div className="section-label"><span>01 / Today’s trends</span></div><h2>What is getting attention</h2><p className="section-help">These charts summarize the stories currently shown by your filters.</p></div><div className="filters"><div className="search"><Search size={15}/><input ref={searchRef} aria-label="Search stories" placeholder="Search stories  /" value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Show stories from" value={source} onChange={event=>setSource(event.target.value)}>{sources.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Sort stories" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="balanced">Best from each source</option><option value="score">Most popular first</option><option value="title">Title A–Z</option></select><button className={savedOnly?"active":""} onClick={()=>setSavedOnly(value=>!value)}><Bookmark size={12}/>{savedIds.length} saved</button></div></div>
        <div className={`ai-pulse ${localStatus === "ready" ? "active" : ""}`}><div><Sparkles size={17}/><span>Story type</span></div><strong>{progressShare}%</strong><p>are announcements, launches or progress updates—not a quality rating</p><span className="privacy-dot">{localStatus === "ready" ? `${analyzedCount} items checked by AI on this device` : "AI classification starts automatically"}</span></div>
        <div className="source-health"><span>Stories by website</span>{sourceHealth.map(item=><i key={item.name}><b/>{item.name} <em>{item.value}</em></i>)}</div>
        <div className="charts"><article className="wide"><h3>Topic momentum</h3><ResponsiveContainer width="100%" height={260}><BarChart data={topics} layout="vertical" margin={{left:20}}><CartesianGrid stroke="#d7d4ca" horizontal={false}/><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={125} tick={{fill:"#62645e",fontSize:12}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/><Bar dataKey="value" radius={0}>{topics.map((_,i)=><Cell fill={colors[i%colors.length]} key={i}/>)}</Bar></BarChart></ResponsiveContainer></article>
        <article><h3>What kind of stories are these?</h3><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={storyTypes} dataKey="value" innerRadius={55} outerRadius={82} paddingAngle={1}>{storyTypes.map((_,i)=><Cell fill={colors[(i+3)%colors.length]} key={i}/>)}</Pie><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/></PieChart></ResponsiveContainer><div className="legend">{storyTypes.map((x,i)=><span key={x.name}><i style={{background:colors[(i+3)%colors.length]}}/>{x.name} {x.value}</span>)}</div></article>
        <article><h3>Trending languages</h3><ResponsiveContainer width="100%" height={230}><AreaChart data={languages}><defs><linearGradient id="g"><stop offset="0" stopColor="#1748d1" stopOpacity=".5"/><stop offset="1" stopColor="#1748d1" stopOpacity=".02"/></linearGradient></defs><XAxis dataKey="name" tick={{fill:"#62645e",fontSize:11}} axisLine={false} tickLine={false}/><YAxis hide/><Tooltip contentStyle={{background:"#f7f5ef",border:"1px solid #171914"}}/><Area type="monotone" dataKey="value" stroke="#1748d1" fill="url(#g)"/></AreaChart></ResponsiveContainer></article></div>
      </section>
      <section id="signals" className="signals"><div className="section-head"><div><div className="section-label"><span>02 / Stories and projects</span></div><h2>Open the original sources</h2><p className="section-help">The number on the right is the popularity reported by that website—for example, points, stars or reactions.</p></div><div className="local-ai"><button onClick={()=>void runLocalAi(filtered)} disabled={localStatus === "loading" || !filtered.length}><Sparkles size={13}/>{localStatus === "loading" ? `${localStage === "downloading" ? "Downloading model" : "Analyzing stories"} ${localProgress}%` : localStatus === "ready" ? "Refresh this view with AI" : "Retry AI analysis"}</button>{localStatus === "loading" && <i><span style={{width:`${localProgress}%`}}/></i>}<small>{localStatus === "error" ? "AI could not load; the regular dashboard remains available." : "Automatic · private · cached for today"}</small></div></div>
        <div className="reading-controls"><span>{filtered.length} signals in view</span><button className={hideRead ? "active" : ""} onClick={()=>setHideRead(value=>!value)}>{hideRead ? "Showing unread only" : `${readIds.length} read · hide them`}</button>{(readIds.length > 0 || savedIds.length > 0) && <button onClick={()=>{setReadIds([]);setSavedIds([]);setSavedOnly(false);setHideRead(false)}}>Reset reading list</button>}</div>
        <div className="signal-list">{visibleSignals.map((s,i)=><article className={`signal-row ${readIds.includes(s.id) ? "read" : ""} ${s.kind === "video" ? "video" : ""}`} key={s.id}><a href={s.url} target="_blank" rel="noreferrer" onClick={()=>setReadIds(ids=>ids.includes(s.id)?ids:[...ids,s.id])}><b>{String(i+1).padStart(2,"0")}</b><div className="signal-copy">{s.imageUrl&&<div className="video-thumb"><img src={s.imageUrl} alt="" loading="lazy"/><span><Play size={14} fill="currentColor"/> Watch</span></div>}<span className="source">{s.source}{s.kind === "video" ? " · Video" : ""}</span><h3>{s.title}</h3><p>{s.description || `${s.topic} signal from ${s.source}.`}</p>{s.aiTake&&<p className="ai-take"><span>AI take</span>{s.aiTake}{typeof s.confidence === "number" && <small>{Math.round(s.confidence*100)}% confidence</small>}</p>}<div><mark>{s.topic}</mark>{s.language&&<mark>{s.language}</mark>}</div></div><aside><strong>{s.score.toLocaleString()}</strong><small>{s.metric ?? (s.source==="Hacker News"?"points":"stars")}</small><ArrowUpRight/></aside></a><button className={`save-signal ${savedIds.includes(s.id)?"saved":""}`} aria-label={savedIds.includes(s.id)?"Remove from saved":"Save for later"} title={savedIds.includes(s.id)?"Remove from saved":"Save for later"} onClick={()=>toggleSaved(s.id)}><Bookmark size={14} fill={savedIds.includes(s.id)?"currentColor":"none"}/></button></article>)}</div><div className="load-more" ref={loadMoreRef}>{visibleCount < filtered.length ? <><i/><span>Scroll for more · {Math.min(visibleCount, filtered.length)} of {filtered.length}</span></> : <span>{filtered.length ? `All ${filtered.length} signals loaded` : "No signals match this filter"}</span>}</div></section>
    </main><footer><span>DevSignal</span><p>Built by Osama Ansar · Public data, collected responsibly.</p><a href="https://github.com/OsamaAnsar/devsignal">Source & methodology <ArrowUpRight size={14}/></a></footer>
  </div>;
}
