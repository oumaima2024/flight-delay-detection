export default function Spinner({ text = "Loading…" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: ".75rem",
      color: "var(--text-3)", fontSize: ".85rem", padding: "3rem 2rem",
    }}>
      <span className="spin-ring" />
      {text}
    </div>
  )
}
