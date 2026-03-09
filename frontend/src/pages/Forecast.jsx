import { useEffect, useState } from "react"
import { getForecast } from "../api/endpoints"
import Spinner  from "../components/Spinner"
import ErrorBox from "../components/ErrorBox"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border-mid)", borderRadius:10, padding:".7rem 1rem", fontSize:".78rem" }}>
      <div style={{ color:"var(--text-3)", marginBottom:".3rem", fontWeight:600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.stroke || "var(--p300)" }}>
          {p.name}: <strong style={{ color:"var(--text-1)" }}>{Number(p.value).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  )
}

export default function Forecast() {
  const [periods, setPeriods] = useState(12)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState("")

  function load(p) {
    setLoading(true); setErr("")
    getForecast(p)
      .then(r  => setData(r.data))
      .catch(e => setErr(e.message || "Failed to load forecast"))
      .finally(()  => setLoading(false))
  }
  useEffect(() => load(periods), [])

  const chartData = (data?.forecast || []).map(r => ({
    ds:       r.ds,
    Forecast: r.yhat,
    Lower:    r.yhat_lower,
    Upper:    r.yhat_upper,
  }))
  const peak = chartData.reduce((a, b) => b.Forecast > a.Forecast ? b : a, { Forecast: 0 })
  const avg  = chartData.length ? Math.round(chartData.reduce((s, r) => s + r.Forecast, 0) / chartData.length) : 0

  return (
    <div className="anim-fade-in" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Controls */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"1rem" }}>
          <div>
            <div className="section-title" style={{ marginBottom:".2rem" }}>Prophet Forecast</div>
            <p style={{ fontSize:".78rem", color:"var(--text-3)" }}>Nationwide monthly delayed flights · {data?.source}</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:".5rem" }}>
            {[6, 12, 18, 24].map(p => (
              <button key={p} className={`model-tab ${periods === p ? "on" : ""}`} onClick={() => { setPeriods(p); load(p) }}>{p}mo</button>
            ))}
          </div>
        </div>
      </div>

      {loading && <Spinner text="Loading forecast…"/>}
      <ErrorBox msg={err}/>

      {!loading && data && (
        <div className="anim-fade-up">
          {/* KPI row */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(165px,1fr))", gap:"1rem", marginBottom:"1.25rem" }}>
            {[
              { label:"Periods",       value: data.forecast_periods,                     color:"var(--p300)"    },
              { label:"Peak Month",    value: peak.ds || "—",                             color:"var(--fuchsia)" },
              { label:"Peak Forecast", value: Number(peak.Forecast || 0).toLocaleString(), color:"var(--rose)"   },
              { label:"Avg Forecast",  value: avg.toLocaleString(),                       color:"var(--amber)"   },
            ].map((k, i) => (
              <div key={i} className="kpi-card">
                <div className="shine" style={{ background: k.color }}/>
                <div className="label" style={{ marginBottom:".35rem" }}>{k.label}</div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"1.5rem", color:k.color, lineHeight:1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="card card-glow" style={{ marginBottom:"1.25rem" }}>
            <div className="section-title">Monthly Delay Forecast with Confidence Interval</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top:10, right:20, left:-20, bottom:0 }}>
                <defs>
                  <linearGradient id="gFc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#7C3AED" stopOpacity=".55"/>
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="gBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#4C1DBF" stopOpacity=".2"/>
                    <stop offset="100%" stopColor="#4C1DBF" stopOpacity=".03"/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)"/>
                <XAxis dataKey="ds" tick={{ fill:"var(--text-3)", fontSize:10 }} axisLine={false} tickLine={false} interval={Math.floor(chartData.length / 6)}/>
                <YAxis tick={{ fill:"var(--text-3)", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}/>
                <Tooltip content={<TT/>}/>
                <Area type="monotone" dataKey="Upper"    name="Upper"    stroke="none"     fill="url(#gBand)" fillOpacity={1}/>
                <Area type="monotone" dataKey="Lower"    name="Lower"    stroke="none"     fill="var(--bg-deep)" fillOpacity={1}/>
                <Area type="monotone" dataKey="Forecast" name="Forecast" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#gFc)"
                  dot={{ r:3, fill:"#8B5CF6", strokeWidth:0 }} activeDot={{ r:5, fill:"#C4B5FD" }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="card">
            <div className="section-title">Forecast Table</div>
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead>
                  <tr><th>Month</th><th>Forecast</th><th>Lower</th><th>Upper</th><th>Confidence Range</th></tr>
                </thead>
                <tbody>
                  {data.forecast?.map((r, i) => {
                    const maxY = Math.max(...(data.forecast || []).map(d => d.yhat), 1)
                    return (
                      <tr key={i}>
                        <td className="hi cd">{r.ds}</td>
                        <td style={{ color:"var(--p300)", fontWeight:700, fontFamily:"var(--font-mono)", fontSize:".8rem" }}>{r.yhat?.toLocaleString()}</td>
                        <td className="cd">{r.yhat_lower?.toLocaleString()}</td>
                        <td className="cd">{r.yhat_upper?.toLocaleString()}</td>
                        <td>
                          <div style={{ display:"flex", alignItems:"center", gap:".5rem" }}>
                            <div className="progress-track" style={{ width:80, flexShrink:0 }}>
                              <div className="progress-fill" style={{ width:`${(r.yhat / maxY * 100).toFixed(0)}%`, background:"linear-gradient(90deg,var(--p700),var(--fuchsia))" }}/>
                            </div>
                            <span style={{ fontSize:".7rem", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>±{Math.round((r.yhat_upper - r.yhat_lower) / 2).toLocaleString()}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
