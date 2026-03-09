import { useEffect, useState } from "react"
import { getStatistics } from "../api/endpoints"
import Spinner  from "../components/Spinner"
import ErrorBox from "../components/ErrorBox"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"

const MO         = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const PIE_COLORS = ["#7C3AED","#A78BFA","#D946EF","#6366F1","#2DD4BF"]

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border-mid)", borderRadius:10, padding:".7rem 1rem", fontSize:".78rem", boxShadow:"0 8px 32px rgba(0,0,0,.5)" }}>
      <div style={{ color:"var(--text-3)", marginBottom:".3rem", fontWeight:600 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:"var(--text-1)" }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}{p.name?.includes("Rate") ? "%" : ""}</strong>
        </div>
      ))}
    </div>
  )
}

function KpiCard({ label, value, sub, color, delay = 0 }) {
  return (
    <div className="kpi-card anim-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="shine" style={{ background: color }} />
      <div className="label" style={{ marginBottom: ".4rem" }}>{label}</div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: "1.1rem",
        letterSpacing: "-.01em",
        lineHeight: 1.2,
        color,
      }}>{value}</div>
      {sub && <div style={{ fontSize: ".72rem", color: "var(--text-3)", marginTop: ".35rem" }}>{sub}</div>}
    </div>
  )
}

export default function Statistics() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState("")

  useEffect(() => {
    getStatistics()
      .then(r  => setData(r.data))
      .catch(e => setErr(e.message || "Failed to load statistics"))
      .finally(()  => setLoading(false))
  }, [])

  if (loading) return <Spinner text="Fetching statistics…" />
  if (err)     return <ErrorBox msg={err} />

  const { kpis, delay_causes, carriers, airports, trends } = data
  const monthly   = (trends?.monthly || []).map(r => ({ name: MO[(r.month || 1) - 1], "Delay Rate": r.delay_rate }))
  const yearly    = (trends?.yearly  || []).map(r => ({ name: String(r.year),           "Delay Rate": r.delay_rate }))
  const causeData = Object.entries(delay_causes?.percentages || {}).map(([k, v]) => ({
    name:  k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    value: v,
  }))

  return (
    <div className="anim-fade-in">
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:"1rem", marginBottom:"1.5rem" }}>
        {[
          { label:"Total Flights",  value: Number(kpis.total_flights).toLocaleString(),   sub: kpis.years_covered,       color:"var(--p300)",    delay:0   },
          { label:"Total Delayed",  value: Number(kpis.total_delayed).toLocaleString(),   sub: kpis.overall_delay_rate,  color:"var(--rose)",    delay:60  },
          { label:"On-Time Rate",   value: kpis.on_time_rate,  sub:"On schedule",                                        color:"var(--green)",   delay:120 },
          { label:"Cancellations",  value: Number(kpis.total_cancelled).toLocaleString(), sub: kpis.overall_cancel_rate, color:"var(--amber)",   delay:180 },
          { label:"Carriers",       value: kpis.num_carriers,  sub:"Active airlines",                                    color:"var(--p200)",    delay:240 },
          { label:"Airports",       value: kpis.num_airports,  sub:"US airports",                                        color:"var(--fuchsia)", delay:300 },
        ].map((k,i) => <KpiCard key={i} {...k} />)}
      </div>

      {/* Monthly + Pie */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:"1.1rem", marginBottom:"1.1rem" }}>
        <div className="card card-glow">
          <div className="section-title">Monthly Delay Rate</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthly} margin={{ top:5, right:10, left:-20, bottom:0 }}>
              <defs>
                <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#7C3AED" stopOpacity=".55"/>
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
              <XAxis dataKey="name" tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false} unit="%"/>
              <Tooltip content={<TT/>}/>
              <Area type="monotone" dataKey="Delay Rate" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#gA)"
                dot={{ r:3, fill:"#8B5CF6", strokeWidth:0 }} activeDot={{ r:5, fill:"#C4B5FD" }}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-title">Delay Causes</div>
          <div style={{ display:"flex", justifyContent:"center" }}>
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={causeData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {causeData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={{ background:"var(--bg-raised)", border:"1px solid var(--border-mid)", borderRadius:10, fontSize:".78rem" }} formatter={v => [`${v}%`]}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:".35rem", marginTop:".5rem" }}>
            {causeData.map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:".4rem" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:PIE_COLORS[i], display:"inline-block", flexShrink:0 }}/>
                  <span style={{ fontSize:".74rem", color:"var(--text-2)" }}>{c.name}</span>
                </div>
                <span style={{ fontSize:".74rem", color:PIE_COLORS[i], fontWeight:700, fontFamily:"var(--font-mono)" }}>{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Yearly + Worst carriers */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.1rem", marginBottom:"1.1rem" }}>
        <div className="card">
          <div className="section-title">Yearly Delay Rate</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={yearly} margin={{ top:5, right:10, left:-20, bottom:0 }}>
              <defs>
                <linearGradient id="gBr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#7C3AED"/>
                  <stop offset="100%" stopColor="#4C1DBF"/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false}/>
              <XAxis dataKey="name" tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false} unit="%"/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="Delay Rate" fill="url(#gBr)" radius={[5,5,0,0]} maxBarSize={40}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-title">Worst 5 Carriers</div>
          <div style={{ display:"flex", flexDirection:"column", gap:".75rem" }}>
            {(carriers?.worst_5 || []).slice(0,5).map((c,i) => (
              <div key={i}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:".28rem" }}>
                  <span style={{ fontSize:".78rem", color:"var(--text-2)" }}>{(c.carrier_name || "").split(" ").slice(0,3).join(" ")}</span>
                  <span style={{ fontSize:".78rem", color:"var(--p300)", fontWeight:700, fontFamily:"var(--font-mono)" }}>{c.delay_rate}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width:`${Math.min(c.delay_rate * 2.5, 100)}%`, background:"linear-gradient(90deg,var(--p700),var(--fuchsia))" }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Best carriers & airports */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.1rem" }}>
        {[
          { title:"Best 5 Carriers", items: carriers?.best_5  || [], nameKey:"carrier_name" },
          { title:"Best 5 Airports", items: airports?.best_5  || [], nameKey:"airport"       },
        ].map(({ title, items, nameKey }) => (
          <div key={title} className="card">
            <div className="section-title" style={{ color:"var(--green)" }}>{title}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:".45rem" }}>
              {items.map((item, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:".48rem .8rem", borderRadius:9, background:"rgba(52,211,153,.05)", border:"1px solid rgba(52,211,153,.12)" }}>
                  <span style={{ fontSize:".8rem", color:"var(--text-2)" }}>
                    {nameKey === "carrier_name" ? (item.carrier_name || "").split(" ").slice(0,3).join(" ") : item.airport}
                  </span>
                  <span style={{ color:"var(--green)", fontWeight:700, fontFamily:"var(--font-mono)", fontSize:".78rem" }}>{item.delay_rate}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
