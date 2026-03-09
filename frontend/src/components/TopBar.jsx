export default function TopBar({ title, subtitle, onMenuToggle }) {
  return (
    <header className="topbar">
      <button
        onClick={onMenuToggle}
        style={{
          background: "transparent", border: "1px solid var(--border-dim)",
          color: "var(--text-3)", width: 34, height: 34, borderRadius: 8,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: ".9rem", transition: "all .18s", flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--p500)"; e.currentTarget.style.color = "var(--p300)" }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-dim)"; e.currentTarget.style.color = "var(--text-3)" }}
      >Menu</button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.05rem",
          color: "var(--text-1)", letterSpacing: "-.01em", lineHeight: 1,
        }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: ".72rem", color: "var(--text-3)", marginTop: ".2rem", lineHeight: 1 }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Right side badge */}
      <div className="hide-mobile" style={{
        display: "flex", alignItems: "center", gap: ".5rem",
        background: "var(--bg-surface)", border: "1px solid var(--border-dim)",
        borderRadius: 8, padding: ".35rem .75rem",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
        <span style={{ fontSize: ".72rem", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>v1.0.0</span>
      </div>
    </header>
  )
}
