import api from "./client"

// Health
export const getHealth = () => api.get("/health")

// Data / Stats
export const getStats      = () => api.get("/stats")         // /stats  — simple summary
export const getStatistics = () => api.get("/statistics")    // /statistics — full KPIs used by Statistics page

// Model
export const getModelInfo = ()          => api.get("/model/info")
export const getFeatures  = (t = 15)   => api.get("/model/feature-importance?top_n=" + t)
export const getCVResults = (m = "rf")  => api.get("/model/cv-results?model=" + m)

// Forecast
export const getForecast = (p = 12) => api.get("/forecast?periods=" + p)

// Predictions
export const predict       = (d, m = "rf") => api.post("/predict?model=" + m, d)
export const predictBatch  = (d, m = "rf") => api.post("/predict/batch?model=" + m, d)
export const compareModels = (d)           => api.post("/predict/compare", d)
export const explainPred   = (d)           => api.post("/explain", d)
