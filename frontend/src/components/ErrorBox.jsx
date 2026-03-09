export default function ErrorBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: ".65rem",
      background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.22)",
      borderRadius: 10, padding: ".9rem 1.1rem",
      color: "var(--rose)", fontSize: ".84rem", marginBottom: "1rem",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{msg}</span>
    </div>
  )
}
