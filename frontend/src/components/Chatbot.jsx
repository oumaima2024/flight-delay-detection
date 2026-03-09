import { useState, useRef, useEffect } from "react"

function Message({ msg }) {
  const isUser = msg.role === "user"
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: ".75rem",
      gap: ".5rem",
      alignItems: "flex-end",
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: "linear-gradient(145deg, #4C1DBF, #7C3AED)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: ".65rem", fontWeight: 800, color: "#fff",
          fontFamily: "var(--font-display)",
        }}>AI</div>
      )}
      <div style={{
        maxWidth: "80%",
        padding: ".6rem .85rem",
        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: isUser
          ? "linear-gradient(135deg, var(--p600), var(--p400))"
          : "var(--bg-raised)",
        border: isUser ? "none" : "1px solid var(--border-mid)",
        color: "var(--text-1)",
        fontSize: ".82rem",
        lineHeight: 1.55,
        boxShadow: isUser ? "0 2px 12px rgba(124,58,237,.35)" : "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: ".5rem", marginBottom: ".75rem" }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: "linear-gradient(145deg, #4C1DBF, #7C3AED)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: ".65rem", fontWeight: 800, color: "#fff",
        fontFamily: "var(--font-display)",
      }}>AI</div>
      <div style={{
        padding: ".6rem .9rem",
        borderRadius: "14px 14px 14px 4px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border-mid)",
        display: "flex", gap: ".3rem", alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--p400)",
            animation: "typingDot .9s ease infinite",
            animationDelay: `${i * 0.2}s`,
            display: "inline-block",
          }} />
        ))}
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  "Which carrier has the worst delays?",
  "What does a SHAP value mean?",
  "How is delay ratio calculated?",
  "What causes most flight delays?",
]

export default function Chatbot() {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hi! I'm your FlightDelay AI assistant. Ask me anything about the dashboard, delay predictions, model results, or airline data.",
  }])
  const [input,   setInput]   = useState("")
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState("")
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function send(text) {
    const content = (text || input).trim()
    if (!content || loading) return

    const userMsg    = { role: "user", content }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput("")
    setLoading(true)
    setError("")

    try {
      const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"

      const res = await fetch(`${backendUrl}/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `Server error ${res.status}`)
      }

      const data  = await res.json()
      const reply = data.reply || "Sorry, I could not generate a response."
      setMessages(prev => [...prev, { role: "assistant", content: reply }])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: .4; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .chat-fab:hover {
          transform: scale(1.08) !important;
          box-shadow: 0 6px 32px rgba(124,58,237,.75), 0 1px 0 rgba(255,255,255,.1) inset !important;
        }
        .chat-suggestion:hover {
          border-color: var(--p500) !important;
          color: var(--p300) !important;
          background: var(--bg-hover) !important;
        }
        .chat-send:hover:not(:disabled) {
          background: linear-gradient(135deg, var(--p500), var(--p300)) !important;
        }
        .chat-clear:hover {
          border-color: var(--border-mid) !important;
          color: var(--text-2) !important;
        }
      `}</style>

      {/* ── Floating button ───────────────────────────────────── */}
      <button
        className="chat-fab"
        onClick={() => setOpen(p => !p)}
        style={{
          position: "fixed", bottom: "1.75rem", right: "1.75rem",
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--p600), var(--p400))",
          border: "none", cursor: "pointer", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 24px rgba(124,58,237,.55), 0 1px 0 rgba(255,255,255,.1) inset",
          transition: "transform .2s, box-shadow .2s",
          fontFamily: "var(--font-display)", fontWeight: 800,
          fontSize: open ? "1rem" : ".75rem", color: "#fff",
        }}
      >
        {open ? "✕" : "AI"}
      </button>

      {/* ── Chat panel ───────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", bottom: "5.5rem", right: "1.75rem",
          width: 360, height: 520,
          background: "var(--bg-deep)",
          border: "1px solid var(--border-mid)",
          borderRadius: 20,
          display: "flex", flexDirection: "column",
          zIndex: 999,
          boxShadow: "0 24px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(139,92,246,.12)",
          animation: "chatSlideUp .25s cubic-bezier(.16,1,.3,1) both",
          overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{
            padding: ".85rem 1.1rem",
            borderBottom: "1px solid var(--border-dim)",
            display: "flex", alignItems: "center", gap: ".65rem",
            background: "var(--bg-surface)", flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(145deg, #4C1DBF, #7C3AED, #D946EF)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: ".7rem", fontWeight: 800, color: "#fff",
              fontFamily: "var(--font-display)",
              boxShadow: "0 4px 12px rgba(124,58,237,.4)",
            }}>AI</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: ".88rem", color: "var(--text-1)" }}>
                FlightDelay Assistant
              </div>
              <div style={{ fontSize: ".65rem", color: "var(--green)", display: "flex", alignItems: "center", gap: ".3rem", marginTop: ".1rem" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block", boxShadow: "0 0 6px var(--green)" }} />
                Online · Powered by Claude
              </div>
            </div>
            <button
              className="chat-clear"
              onClick={() => { setMessages([messages[0]]); setError("") }}
              style={{
                background: "transparent", border: "1px solid var(--border-dim)",
                borderRadius: 6, color: "var(--text-3)", padding: ".22rem .55rem",
                cursor: "pointer", fontSize: ".68rem", transition: "all .15s",
                fontFamily: "var(--font-body)",
              }}
            >Clear</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>

            {/* Suggestion chips */}
            {messages.length === 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginBottom: "1rem" }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="chat-suggestion"
                    onClick={() => send(s)}
                    style={{
                      background: "var(--bg-raised)", border: "1px solid var(--border-dim)",
                      borderRadius: 99, padding: ".28rem .7rem",
                      color: "var(--text-3)", fontSize: ".71rem", cursor: "pointer",
                      transition: "all .15s", fontFamily: "var(--font-body)",
                    }}
                  >{s}</button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && <TypingIndicator />}

            {error && (
              <div style={{
                background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.22)",
                borderRadius: 10, padding: ".6rem .8rem",
                color: "var(--rose)", fontSize: ".75rem", lineHeight: 1.5,
              }}>{error}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: ".7rem",
            borderTop: "1px solid var(--border-dim)",
            background: "var(--bg-surface)", flexShrink: 0,
          }}>
            <div
              className="chat-input-wrap"
              style={{
                display: "flex", gap: ".5rem", alignItems: "flex-end",
                background: "var(--bg-deep)",
                border: "1px solid var(--border-mid)",
                borderRadius: 12, padding: ".5rem .6rem",
                transition: "border-color .2s",
              }}
              onFocusCapture={e => e.currentTarget.style.borderColor = "var(--p500)"}
              onBlurCapture={e  => e.currentTarget.style.borderColor = "var(--border-mid)"}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about the data…"
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "var(--text-1)", fontFamily: "var(--font-body)", fontSize: ".82rem",
                  resize: "none", lineHeight: 1.5, maxHeight: 80, overflowY: "auto",
                }}
              />
              <button
                className="chat-send"
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "none", flexShrink: 0,
                  background: input.trim() && !loading
                    ? "linear-gradient(135deg, var(--p600), var(--p400))"
                    : "var(--bg-hover)",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .2s",
                  opacity: input.trim() && !loading ? 1 : 0.45,
                }}
              >
                {loading
                  ? <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .65s linear infinite", display: "inline-block" }} />
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                }
              </button>
            </div>
            <div style={{ fontSize: ".6rem", color: "var(--text-4)", textAlign: "center", marginTop: ".35rem" }}>
              Enter to send · Shift+Enter for new line
            </div>
          </div>

        </div>
      )}
    </>
  )
}
