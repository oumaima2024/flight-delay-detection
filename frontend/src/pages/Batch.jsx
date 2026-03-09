import { useState } from "react"
import { predictBatch } from "../api/endpoints"
import RiskBadge  from "../components/RiskBadge"
import ErrorBox   from "../components/ErrorBox"
import { FLIGHT_DEFAULTS } from "../components/FlightForm"

const BLANK = () => ({ ...FLIGHT_DEFAULTS, _id: Math.random().toString(36).slice(2) })

const ROW_FIELDS = [
  { k:"carrier",          label:"Carrier",  type:"text"   },
  { k:"airport",          label:"Airport",  type:"text"   },
  { k:"month",            label:"Month",    type:"number" },
  { k:"arr_flights",      label:"Flights",  type:"number" },
  { k:"carrier_ct",       label:"Carrier Ct", type:"number" },
  { k:"weather_ct",       label:"Weather Ct", type:"number" },
  { k:"nas_ct",           label:"NAS Ct",   type:"number" },
  { k:"late_aircraft_ct", label:"Late A/C", type:"number" },
]

export default function Batch() {
  const [rows,    setRows]    = useState([BLANK(), BLANK(), BLANK()])
  const [model,   setModel]   = useState("rf")
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState("")

  const addRow    = ()         => setRows(p => [...p, BLANK()])
  const removeRow = id         => setRows(p => p.filter(r => r._id !== id))
  const updateRow = (id, k, v) => setRows(p => p.map(r => r._id === id ? { ...r, [k]: v } : r))

  async function run() {
    setLoading(true); setErr(""); setResults(null)
    try {
      const payload = { flights: rows.map(({ _id, ...r }) => r) }
      const res     = await predictBatch(payload, model)
      setResults(res.data)
    } catch (e) { setErr(e.message || "Batch failed") }
    finally     { setLoading(false) }
  }

  return (
    <div className="anim-fade-in" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"1rem", marginBottom:"1.25rem" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            Batch Flights
            <span className="badge badge-purple" style={{ marginLeft: ".65rem" }}>{rows.length} rows</span>
          </div>
          <div style={{ display:"flex", gap:".5rem" }}>
            {[["rf","RF"],["gb","GB"]].map(([id, label]) => (
              <button key={id} className={`model-tab ${model === id ? "on" : ""}`} onClick={() => setModel(id)}>{label}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid var(--border-dim)" }}>
          <table className="tbl" style={{ minWidth: 780 }}>
            <thead>
              <tr>
                <th>#</th>
                {ROW_FIELDS.map(f => <th key={f.k}>{f.label}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._id}>
                  <td className="cd" style={{ color:"var(--text-4)" }}>{i + 1}</td>
                  {ROW_FIELDS.map(f => (
                    <td key={f.k}>
                      <input
                        className="inp"
                        type={f.type}
                        value={row[f.k] ?? ""}
                        style={{ minWidth: f.type === "text" ? 80 : 65, padding: ".32rem .55rem" }}
                        onChange={e => updateRow(row._id, f.k, f.type === "number" ? Number(e.target.value) : e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button className="btn btn-danger" onClick={() => removeRow(row._id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:"1.1rem", display:"flex", gap:".75rem", flexWrap:"wrap" }}>
          <button className="btn btn-ghost" onClick={addRow}>+ Add Row</button>
          <button className="btn btn-primary" onClick={run} disabled={loading || rows.length === 0}>
            {loading ? <><span className="spin-ring" style={{ width:15, height:15 }}/>Processing…</> : `Run ${rows.length} Flights`}
          </button>
        </div>
      </div>

      <ErrorBox msg={err}/>

      {results && (
        <div className="card anim-fade-up">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:".75rem", marginBottom:"1.1rem" }}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              Results
              <span className="badge badge-purple" style={{ marginLeft: ".6rem" }}>{results.model}</span>
            </div>
            <div style={{ display:"flex", gap:".75rem", fontSize:".76rem" }}>
              <span style={{ color:"var(--rose)"  }}>High: {results.results?.filter(r => r.risk_level?.includes("High")).length   || 0}</span>
              <span style={{ color:"var(--amber)" }}>Medium: {results.results?.filter(r => r.risk_level?.includes("Medium")).length || 0}</span>
              <span style={{ color:"var(--green)" }}>Low: {results.results?.filter(r => r.risk_level?.includes("Low")).length      || 0}</span>
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>Carrier</th><th>Airport</th><th>Month</th><th>Predicted</th><th>Delay %</th><th>Risk</th></tr>
              </thead>
              <tbody>
                {results.results?.map((r, i) => (
                  <tr key={i}>
                    <td className="cd" style={{ color:"var(--text-4)" }}>{i + 1}</td>
                    <td className="hi">{r.carrier}</td>
                    <td className="hi">{r.airport}</td>
                    <td className="cd">{r.month}</td>
                    <td className="cd">{r.predicted_arr_del15}</td>
                    <td style={{ color:"var(--p300)", fontWeight:700, fontFamily:"var(--font-mono)", fontSize:".8rem" }}>{r.delay_pct}</td>
                    <td><RiskBadge risk={r.risk_level}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
