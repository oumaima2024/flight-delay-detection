import { useState } from "react"
import { compareModels } from "../api/endpoints"
import FlightForm, { FLIGHT_DEFAULTS } from "../components/FlightForm"
import RiskBadge  from "../components/RiskBadge"
import ErrorBox   from "../components/ErrorBox"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:"var(--bg-raised)", border:"1px solid var(--border-mid)", borderRadius:10, padding:".7rem 1rem", fontSize:".78rem" }}>
      <div style={{ color:"var(--text-3)", marginBottom:".3rem", fontWeight:600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.fill }}>{p.name}: <strong style={{ color:"var(--text-1)" }}>{p.value}</strong></div>
      ))}
    </div>
  )
}

export default function Compare() {
  const [form,    setForm]    = useState({ ...FLIGHT_DEFAULTS })
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState("")

  async function run() {
    setLoading(true); setErr(""); setResult(null)
    try   { const r = await compareModels(form); setResult(r.data) }
    catch (e) { setErr(e.message || "Comparison failed") }
    finally   { setLoading(false) }
  }

  const barData = result ? [
    { metric:"Predicted Delays", "Random Forest": result.random_forest?.predicted_arr_del15,                       "Gradient Boost": result.gradient_boosting?.predicted_arr_del15 },
    { metric:"Delay %",          "Random Forest": parseFloat(result.random_forest?.delay_ratio    || 0) * 100,     "Gradient Boost": parseFloat(result.gradient_boosting?.delay_ratio || 0) * 100 },
  ] : []

  return (
    <div className="anim-fade-in" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="section-title">Flight Parameters</div>
        <FlightForm form={form} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}/>
        <hr className="divider"/>
        <div style={{ display:"flex", gap:".75rem" }}>
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            {loading ? <><span className="spin-ring" style={{ width:15, height:15 }}/>Comparing…</> : "Compare RF vs GB"}
          </button>
          <button className="btn btn-ghost" onClick={() => { setForm({ ...FLIGHT_DEFAULTS }); setResult(null); setErr("") }}>Reset</button>
        </div>
      </div>

      <ErrorBox msg={err}/>

      {result && (
        <div className="anim-fade-up">
          {/* Agreement banner */}
          <div style={{
            padding:".85rem 1.2rem", borderRadius:11, marginBottom:"1.25rem",
            background: result.agreement?.includes("agree") && !result.agreement?.includes("dis") ? "rgba(52,211,153,.07)" : "rgba(245,158,11,.07)",
            border:     `1px solid ${result.agreement?.includes("agree") && !result.agreement?.includes("dis") ? "rgba(52,211,153,.25)" : "rgba(245,158,11,.25)"}`,
            display:"flex", alignItems:"center", gap:".75rem", fontSize:".875rem",
          }}>
            <span style={{ fontSize:"1.1rem" }}>
              {result.agreement?.includes("agree") && !result.agreement?.includes("dis") ? "OK" : "!"}
            </span>
            <strong style={{ color:"var(--text-1)" }}>{result.agreement}</strong>
            <span style={{ color:"var(--text-3)", marginLeft:".5rem" }}>
              Difference: <strong style={{ color:"var(--p300)", fontFamily:"var(--font-mono)" }}>{result.difference}</strong> flights
            </span>
          </div>

          {/* Model cards */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.1rem", marginBottom:"1.1rem" }}>
            {[
              { key:"random_forest",    label:"Random Forest",     color:"var(--p300)",    bg:"rgba(139,92,246,.08)" },
              { key:"gradient_boosting",label:"Gradient Boosting", color:"var(--fuchsia)", bg:"rgba(217,70,239,.06)" },
            ].map(m => {
              const d   = result[m.key]
              const isH = d?.risk_level?.toLowerCase().includes("high")
              const isM = d?.risk_level?.toLowerCase().includes("medium")
              return (
                <div key={m.key} className="card" style={{ background: m.bg, borderColor:`${m.color}33` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem" }}>
                    <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:".95rem", color:m.color }}>{m.label}</span>
                    <RiskBadge risk={d?.risk_level}/>
                  </div>
                  <div className="kpi-value" style={{ color:m.color, marginBottom:".35rem" }}>{d?.delay_pct}</div>
                  <div style={{ fontSize:".78rem", color:"var(--text-3)" }}>
                    Delayed: <strong style={{ color:"var(--text-1)" }}>{d?.predicted_arr_del15}</strong> flights
                  </div>
                  <div style={{ marginTop:"1rem" }}>
                    <div className="progress-track" style={{ height:5 }}>
                      <div className="progress-fill" style={{
                        width:      `${Math.min(parseFloat(d?.delay_ratio || 0) * 100, 100)}%`,
                        background: m.color,
                        boxShadow:  `0 0 8px ${m.color}88`,
                      }}/>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Side-by-side table + chart */}
          <div className="card">
            <div className="section-title">Side-by-Side Comparison</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", marginBottom:".6rem" }}>
              <span className="label">Metric</span>
              <span className="label" style={{ textAlign:"center", color:"var(--p300)"    }}>Random Forest</span>
              <span className="label" style={{ textAlign:"center", color:"var(--fuchsia)" }}>Gradient Boost</span>
            </div>
            {[
              ["Predicted Delays", result.random_forest?.predicted_arr_del15, result.gradient_boosting?.predicted_arr_del15],
              ["Delay Ratio",      result.random_forest?.delay_ratio,         result.gradient_boosting?.delay_ratio],
              ["Delay %",          result.random_forest?.delay_pct,           result.gradient_boosting?.delay_pct],
            ].map(([label, rf, gb], i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", padding:".6rem .85rem", borderRadius:8, marginBottom:".4rem", background:"var(--bg-deep)", border:"1px solid var(--border-dim)" }}>
                <span style={{ fontSize:".78rem", color:"var(--text-3)" }}>{label}</span>
                <span style={{ textAlign:"center", fontFamily:"var(--font-mono)", fontSize:".82rem", color:"var(--p300)",    fontWeight:700 }}>{rf}</span>
                <span style={{ textAlign:"center", fontFamily:"var(--font-mono)", fontSize:".82rem", color:"var(--fuchsia)", fontWeight:700 }}>{gb}</span>
              </div>
            ))}
            <hr className="divider"/>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barGap={6} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" vertical={false}/>
                <XAxis dataKey="metric" tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<TT/>}/>
                <Bar dataKey="Random Forest"  fill="#8B5CF6" radius={[5,5,0,0]}/>
                <Bar dataKey="Gradient Boost" fill="#D946EF" radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
