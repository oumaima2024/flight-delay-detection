export default function RiskBadge({ risk }) {
  if (!risk) return <span className="badge badge-purple">—</span>
  const r   = risk.toLowerCase()
  const cls = r.includes("high") ? "badge-high" : r.includes("medium") ? "badge-medium" : "badge-low"
  return <span className={`badge ${cls}`}>{risk}</span>
}
