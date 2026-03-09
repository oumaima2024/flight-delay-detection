import { useState, useEffect } from "react"
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom"
import Sidebar    from "./components/Sidebar"
import TopBar     from "./components/TopBar"
import Chatbot    from "./components/Chatbot"
import Statistics from "./pages/Statistics"
import Predict    from "./pages/Predict"
import Batch      from "./pages/Batch"
import Compare    from "./pages/Compare"
import Explain    from "./pages/Explain"
import Forecast   from "./pages/Forecast"
import Model      from "./pages/Model"

const META = {
  "/":         { title: "Statistics",      subtitle: "Global airline delay overview & KPIs" },
  "/predict":  { title: "Predict",         subtitle: "Single flight delay prediction" },
  "/batch":    { title: "Batch Predict",   subtitle: "Predict delays across multiple flights" },
  "/compare":  { title: "Compare Models",  subtitle: "Random Forest vs Gradient Boosting" },
  "/explain":  { title: "Explain (SHAP)",  subtitle: "Feature-level prediction explanation" },
  "/forecast": { title: "Forecast",        subtitle: "Prophet time-series delay forecast" },
  "/model":    { title: "Model Info",      subtitle: "Hyperparameters, CV scores & feature importance" },
}

function Inner() {
  const [open, setOpen] = useState(true)
  const loc  = useLocation()
  const meta = META[loc.pathname] || { title: "FlightDelay AI", subtitle: "" }

  useEffect(() => {
    if (window.innerWidth < 768) setOpen(false)
  }, [])

  const sidebarW = 248

  return (
    <div className="layout-wrap">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="main-area" style={{ marginLeft: open ? sidebarW : 0 }}>
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuToggle={() => setOpen(p => !p)}
        />
        <div className="page-wrap">
          <Routes>
            <Route path="/"         element={<Statistics />} />
            <Route path="/predict"  element={<Predict />}    />
            <Route path="/batch"    element={<Batch />}      />
            <Route path="/compare"  element={<Compare />}    />
            <Route path="/explain"  element={<Explain />}    />
            <Route path="/forecast" element={<Forecast />}   />
            <Route path="/model"    element={<Model />}      />
          </Routes>
        </div>
      </div>
      <Chatbot />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Inner />
    </BrowserRouter>
  )
}
