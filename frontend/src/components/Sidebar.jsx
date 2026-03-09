import { NavLink, useLocation } from "react-router-dom"

const ROUTES = [
  { to: "/",         label: "Statistics" },
  { to: "/predict",  label: "Predict"    },
  { to: "/batch",    label: "Batch"      },
  { to: "/compare",  label: "Compare"    },
  { to: "/explain",  label: "Explain"    },
  { to: "/forecast", label: "Forecast"   },
  { to: "/model",    label: "Model Info" },
]

export default function Sidebar({ open, onClose }) {
  const loc = useLocation()

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 199 }}
          className="block md:hidden"
        />
      )}

      <aside className={`sidebar ${open ? "" : "sidebar-hidden"}`}>
        {/* Logo */}
        <div style={{
          padding: "1.5rem 1.25rem 1.1rem",
          borderBottom: "1px solid var(--border-dim)",
          display: "flex", alignItems: "center", gap: ".8rem",
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: "linear-gradient(145deg, #4C1DBF, #7C3AED, #D946EF)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.1rem",
            boxShadow: "0 4px 20px rgba(124,58,237,.5), 0 1px 0 rgba(255,255,255,.1) inset",
          }}>FD</div>
          <div>
            <div style={{
              fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: ".95rem", color: "var(--text-1)", letterSpacing: "-.01em",
            }}>FlightDelay</div>
            <div className="label" style={{ letterSpacing: ".12em", marginTop: ".1rem" }}>AI Platform</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "1rem .75rem", flex: 1, display: "flex", flexDirection: "column", gap: ".15rem" }}>
          <div className="label" style={{ padding: ".2rem .5rem", marginBottom: ".4rem" }}>Menu</div>

          {ROUTES.map(r => {
            const isActive = r.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(r.to)
            return (
              <NavLink
                key={r.to}
                to={r.to}
                end={r.to === "/"}
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={onClose}
              >
                <span className="nav-dot" />
                <span>{r.label}</span>
                {isActive && (
                  <span style={{
                    marginLeft: "auto", width: 5, height: 5, borderRadius: "50%",
                    background: "var(--p400)", boxShadow: "0 0 8px var(--p400)",
                  }} />
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Status footer */}
        <div style={{
          padding: "1rem 1.25rem",
          borderTop: "1px solid var(--border-dim)",
          display: "flex", alignItems: "center", gap: ".6rem",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--green)", flexShrink: 0,
            boxShadow: "0 0 8px var(--green)",
            animation: "pulse2 2.5s ease infinite",
          }} />
          <div>
            <div style={{ fontSize: ".72rem", color: "var(--text-2)", fontWeight: 500 }}>API Connected</div>
            <div className="label" style={{ fontSize: ".6rem" }}>localhost:8000</div>
          </div>
        </div>
      </aside>
    </>
  )
}
