import { useState } from "react"
import { explainPred } from "../api/endpoints"
import FlightForm, { FLIGHT_DEFAULTS } from "../components/FlightForm"
import ErrorBox from "../components/ErrorBox"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts"

export default function Explain() {
  const [form,    setForm]    = useState({ ...FLIGHT_DEFAULTS })
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState("")

  async function run() {
    setLoading(true); setErr(""); setResult(null)
    try   { const r = await explainPred(form); setResult(r.data) }
    catch (e) { setErr(e.message || "Explanation failed") }
    finally   { setLoading(false) }
  }

  const chartData = (result?.top_shap_features || [])
    .slice(0, 10)
    .map(f => ({
      feature: f.feature.length > 22 ? f.feature.slice(0, 20) + "…" : f.feature,
      full:    f.feature,
      value:   f.shap_value,
      pos:     f.shap_value > 0,
    }))
    .sort((a, b) => a.value - b.value)

  return (
    <div className="anim-fade-in" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <div className="section-title">SHAP Explanation</div>
          <p style={{ fontSize:".8rem", color:"var(--text-3)", lineHeight:1.6 }}>
            Positive values push the prediction <em>higher</em> (more delays). Negative values push it <em>lower</em>.
          </p>
        </div>
        <FlightForm form={form} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}/>
        <hr className="divider"/>
        <div style={{ display:"flex", gap:".75rem" }}>
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            {loading ? <><span className="spin-ring" style={{ width:15, height:15 }}/>Analyzing…</> : "Explain Prediction"}
          </button>
          <button className="btn btn-ghost" onClick={() => { setForm({ ...FLIGHT_DEFAULTS }); setResult(null); setErr("") }}>Reset</button>
        </div>
      </div>

      <ErrorBox msg={err}/>

      {result && (
        <div className="anim-fade-up">
          {/* KPI row */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"1rem", marginBottom:"1.25rem" }}>
            {[
              { label:"Predicted Delays", value: result.predicted_arr_del15,         color:"var(--p300)"    },
              { label:"Base Value (avg)", value: result.base_value,                  color:"var(--text-2)"  },
              { label:"Features Shown",   value: result.top_shap_features?.length,   color:"var(--fuchsia)" },
            ].map((k, i) => (
              <div key={i} className="card">
                <div className="label" style={{ marginBottom:".3rem" }}>{k.label}</div>
                <div style={{ fontFamily:"var(--font-display)", fontSize:"1.8rem", fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Waterfall chart */}
          <div className="card" style={{ marginBottom:"1.25rem" }}>
            <div className="section-title">Feature Impact</div>
            <div style={{ fontSize:".75rem", color:"var(--text-3)", marginBottom:"1rem" }}>
              <span style={{ display:"inline-block", width:10, height:10, borderRadius:2, background:"var(--rose)",  marginRight:4, verticalAlign:"middle" }}/> Increases delay &nbsp;
              <span style={{ display:"inline-block", width:10, height:10, borderRadius:2, background:"var(--green)", marginRight:4, verticalAlign:"middle" }}/> Decreases delay
            </div>
            <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36 + 40, 220)}>
              <BarChart data={chartData} layout="vertical" margin={{ left:10, right:35, top:5, bottom:5 }}>
                <XAxis type="number" tick={{ fill:"var(--text-3)", fontSize:11 }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="feature" tick={{ fill:"var(--text-2)", fontSize:11 }} axisLine={false} tickLine={false} width={160}/>
                <Tooltip
                  contentStyle={{ background:"var(--bg-raised)", border:"1px solid var(--border-mid)", borderRadius:10, fontSize:".78rem" }}
                  formatter={(v, n, p) => [v.toFixed(4), p.payload.full]}
                  labelFormatter={() => ""}
                />
                <ReferenceLine x={0} stroke="var(--border-mid)" strokeWidth={1.5}/>
                <Bar dataKey="value" radius={4}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.pos ? "rgba(244,63,94,.8)" : "rgba(52,211,153,.8)"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="card">
            <div className="section-title">Feature Details</div>
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>#</th><th>Feature</th><th>SHAP Value</th><th>Impact</th></tr></thead>
                <tbody>
                  {result.top_shap_features?.map((f, i) => (
                    <tr key={i}>
                      <td className="cd" style={{ color:"var(--text-4)" }}>{i + 1}</td>
                      <td style={{ fontFamily:"var(--font-mono)", fontSize:".76rem", color:"var(--text-1)" }}>{f.feature}</td>
                      <td style={{ fontFamily:"var(--font-mono)", fontWeight:700, color: f.shap_value > 0 ? "var(--rose)" : "var(--green)", fontSize:".8rem" }}>
                        {f.shap_value > 0 ? "+" : ""}{f.shap_value}
                      </td>
                      <td>
                        <span className={`badge ${f.impact.includes("increases") ? "badge-high" : "badge-low"}`}>{f.impact}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
