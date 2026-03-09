import { useEffect, useState } from "react"
import { getModelInfo, getFeatures, getCVResults } from "../api/endpoints"
import Spinner  from "../components/Spinner"
import ErrorBox from "../components/ErrorBox"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts"

const F_COLORS = ["#7C3AED","#8B5CF6","#A78BFA","#C4B5FD","#6366F1","#818CF8","#6D28D9","#9333EA","#A855F7","#C026D3","#D946EF","#4338CA","#4F46E5","#7C3AED","#8B5CF6"]

export default function Model() {
  const [info,     setInfo]     = useState(null)
  const [feats,    setFeats]    = useState(null)
  const [cv,       setCv]       = useState(null)
  const [cvModel,  setCvModel]  = useState("rf")
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState("")

  useEffect(() => {
    Promise.all([getModelInfo(), getFeatures(15)])
      .then(([i, f]) => { setInfo(i.data); setFeats(f.data) })
      .catch(e => setErr(e.message || "Failed to load model info"))
      .finally(()  => setLoading(false))
  }, [])

  useEffect(() => {
    getCVResults(cvModel).then(r => setCv(r.data)).catch(() => {})
  }, [cvModel])

  if (loading) return <Spinner text="Loading model info…"/>
  if (err)     return <ErrorBox msg={err}/>

  const featChart = (feats?.features || []).map(f => ({
    name:  f.feature.length > 22 ? f.feature.slice(0, 20) + "…" : f.feature,
    full:  f.feature,
    value: parseFloat((f.importance * 100).toFixed(3)),
  })).reverse()

  return (
    <div className="anim-fade-in" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Model cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.1rem", marginBottom:"1.25rem" }}>
        {["random_forest","gradient_boosting"].map(key => {
          const m     = info?.[key]; if (!m) return null
          const isRF  = key === "random_forest"
          const color = isRF ? "var(--p300)" : "var(--fuchsia)"
          return (
            <div key={key} className="card card-glow" style={{ borderColor: isRF ? "rgba(139,92,246,.25)" : "rgba(217,70,239,.2)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1.1rem" }}>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"1rem", color }}>{isRF ? "Random Forest" : "Gradient Boosting"}</div>
                  <div style={{ fontSize:".72rem", color:"var(--text-3)", marginTop:".2rem", fontFamily:"var(--font-mono)" }}>{m.model_type}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div className="label" style={{ marginBottom:".2rem" }}>Best CV R²</div>
                  <div style={{
                    fontFamily:"var(--font-display)", fontWeight:800, fontSize:"1.8rem", lineHeight:1,
                    color: m.best_cv_r2 > 0.8 ? "var(--green)" : m.best_cv_r2 > 0.6 ? "var(--amber)" : "var(--rose)",
                  }}>{m.best_cv_r2}</div>
                </div>
              </div>
              <hr className="divider" style={{ margin:".75rem 0" }}/>
              <div className="label" style={{ marginBottom:".65rem" }}>Best Hyperparameters</div>
              <div style={{ display:"flex", flexDirection:"column", gap:".38rem" }}>
                {Object.entries(m.best_params || {}).map(([k, v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:".42rem .8rem", borderRadius:8, background:"var(--bg-deep)", border:"1px solid var(--border-dim)" }}>
                    <span style={{ fontSize:".76rem", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>{k}</span>
                    <span style={{ fontSize:".78rem", color, fontWeight:700, fontFamily:"var(--font-mono)" }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Feature importance chart */}
      <div className="card" style={{ marginBottom:"1.25rem" }}>
        <div className="section-title">Feature Importances — Random Forest</div>
        <ResponsiveContainer width="100%" height={Math.max(featChart.length * 30 + 40, 280)}>
          <BarChart data={featChart} layout="vertical" margin={{ left:10, right:40, top:5, bottom:5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" horizontal={false}/>
            <XAxis type="number" tick={{ fill:"var(--text-3)", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`}/>
            <YAxis type="category" dataKey="name" tick={{ fill:"var(--text-2)", fontSize:10 }} axisLine={false} tickLine={false} width={165}/>
            <Tooltip
              contentStyle={{ background:"var(--bg-raised)", border:"1px solid var(--border-mid)", borderRadius:10, fontSize:".78rem" }}
              formatter={(v, n, p) => [`${v}%`, p.payload.full]}
              labelFormatter={() => ""}
            />
            <Bar dataKey="value" radius={4}>
              {featChart.map((_, i) => <Cell key={i} fill={F_COLORS[i % F_COLORS.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* CV results */}
      <div className="card">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:".75rem", marginBottom:"1.1rem" }}>
          <div className="section-title" style={{ marginBottom:0 }}>Cross-Validation Results</div>
          <div style={{ display:"flex", gap:".5rem" }}>
            {[["rf","RF"],["gb","GB"]].map(([id, label]) => (
              <button key={id} className={`model-tab ${cvModel === id ? "on" : ""}`} onClick={() => setCvModel(id)}>{label}</button>
            ))}
          </div>
        </div>
        {cv ? (
          <div style={{ overflowX:"auto" }}>
            <table className="tbl">
              <thead><tr><th>Rank</th><th>Parameters</th><th>Mean R²</th><th>Std R²</th></tr></thead>
              <tbody>
                {cv.results?.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td><span className={i === 0 ? "badge badge-purple" : "badge badge-indigo"}>#{r.rank_test_score}</span></td>
                    <td>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:".3rem" }}>
                        {Object.entries(r.params || {}).map(([k, v]) => (
                          <span key={k} style={{ background:"var(--bg-hover)", border:"1px solid var(--border-dim)", borderRadius:5, padding:".12rem .45rem", fontSize:".68rem", fontFamily:"var(--font-mono)", color:"var(--text-2)" }}>
                            {k.replace("model__", "")}={String(v)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:".8rem", color: r.mean_test_score > 0.8 ? "var(--green)" : r.mean_test_score > 0.6 ? "var(--amber)" : "var(--rose)" }}>
                      {(r.mean_test_score || 0).toFixed(4)}
                    </td>
                    <td className="cd">{(r.std_test_score || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Spinner text="Loading CV results…"/>}
      </div>
    </div>
  )
}
