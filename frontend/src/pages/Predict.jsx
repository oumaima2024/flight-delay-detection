import { useState } from "react"
import { predict } from "../api/endpoints"
import FlightForm, { FLIGHT_DEFAULTS } from "../components/FlightForm"
import RiskBadge  from "../components/RiskBadge"
import ErrorBox   from "../components/ErrorBox"

export default function Predict() {
  const [form,    setForm]    = useState({ ...FLIGHT_DEFAULTS })
  const [model,   setModel]   = useState("rf")
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState("")

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function run() {
    setLoading(true); setErr(""); setResult(null)
    try   { const r = await predict(form, model); setResult(r.data) }
    catch (e) { setErr(e.message || "Prediction failed") }
    finally   { setLoading(false) }
  }

  const isHigh   = result?.risk_level?.toLowerCase().includes("high")
  const isMed    = result?.risk_level?.toLowerCase().includes("medium")
  const rColor   = isHigh ? "var(--rose)" : isMed ? "var(--amber)" : "var(--green)"
  const delayPct = result ? parseFloat(result.delay_ratio || 0) * 100 : 0

  return (
    <div className="anim-fade-in" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"1rem", marginBottom:"1.4rem" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Flight Parameters</div>
          <div style={{ display:"flex", gap:".5rem" }}>
            {[["rf","Random Forest"],["gb","Gradient Boost"]].map(([id, label]) => (
              <button key={id} className={`model-tab ${model === id ? "on" : ""}`} onClick={() => setModel(id)}>{label}</button>
            ))}
          </div>
        </div>

        <FlightForm form={form} onChange={update}/>
        <hr className="divider"/>

        <div style={{ display:"flex", gap:".75rem" }}>
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            {loading ? <><span className="spin-ring" style={{ width:15, height:15 }}/>Running…</> : "Run Prediction"}
          </button>
          <button className="btn btn-ghost" onClick={() => { setForm({ ...FLIGHT_DEFAULTS }); setResult(null); setErr("") }}>Reset</button>
        </div>
      </div>

      <ErrorBox msg={err}/>

      {result && (
        <div className="card card-glow anim-fade-up" style={{ borderColor:"rgba(139,92,246,.35)" }}>
          {/* Top row */}
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:"1rem", marginBottom:"1.25rem" }}>
            <div>
              <div className="label" style={{ marginBottom:".4rem" }}>Prediction Result — {result.model}</div>
              <div className="kpi-value" style={{ color:rColor, fontSize:"2.8rem" }}>{result.delay_pct}</div>
              <div style={{ fontSize:".8rem", color:"var(--text-3)", marginTop:".3rem" }}>
                Predicted delayed flights: <strong style={{ color:"var(--text-1)" }}>{result.predicted_arr_del15}</strong>
              </div>
            </div>
            <RiskBadge risk={result.risk_level}/>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom:".3rem", display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:".72rem", color:"var(--text-3)" }}>Delay ratio</span>
            <span style={{ fontSize:".72rem", color:rColor, fontFamily:"var(--font-mono)" }}>{delayPct.toFixed(2)}%</span>
          </div>
          <div className="progress-track" style={{ height:8, marginBottom:"1.4rem" }}>
            <div className="progress-fill" style={{
              width: `${Math.min(delayPct, 100)}%`,
              background: `linear-gradient(90deg,${isHigh ? "#F43F5E,#FB7185" : isMed ? "#F59E0B,#FCD34D" : "#34D399,#6EE7B7"})`,
              boxShadow: `0 0 12px ${rColor}88`,
            }}/>
          </div>

          <hr className="divider" style={{ margin:".75rem 0 1rem" }}/>

          {/* Input echo */}
          <div style={{ display:"flex", gap:"2rem", flexWrap:"wrap" }}>
            {Object.entries(result.input || {}).map(([k, v]) => (
              <div key={k}>
                <div className="label" style={{ marginBottom:".25rem" }}>{k.replace(/_/g, " ")}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:".82rem", color:"var(--p200)", fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
