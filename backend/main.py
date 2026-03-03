# ══════════════════════════════════════════════════════════════════════════════
# AIRLINE DELAY API — main.py  (single file)
# ══════════════════════════════════════════════════════════════════════════════
# Run:   uvicorn main:app --reload --port 8000
# Test:  pytest main.py -v
# Docs:  http://localhost:8000/docs
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
import joblib, os, numpy as np, pandas as pd

# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class FlightInput(BaseModel):
    year:             int   = Field(..., example=2023)
    month:            int   = Field(..., ge=1, le=12, example=7)
    carrier:          str   = Field(..., example="AA")
    carrier_name:     str   = Field(..., example="American Airlines Inc.")
    airport:          str   = Field(..., example="ATL")
    airport_name:     str   = Field(..., example="Atlanta GA: Hartsfield-Jackson Atlanta International")
    arr_flights:      float = Field(..., example=1500.0)
    arr_del15:        float = Field(0.0,  example=0.0)
    carrier_ct:       float = Field(..., example=120.0)
    weather_ct:       float = Field(..., example=30.0)
    nas_ct:           float = Field(..., example=80.0)
    security_ct:      float = Field(0.0,  example=1.0)
    late_aircraft_ct: float = Field(..., example=150.0)
    arr_cancelled:    float = Field(..., example=20.0)
    arr_diverted:     float = Field(..., example=5.0)

class BatchInput(BaseModel):
    flights: List[FlightInput]

# ══════════════════════════════════════════════════════════════════════════════
# SAFE RMSE HELPER
# ══════════════════════════════════════════════════════════════════════════════

def safe_rmse(y_true, y_pred):
    try:
        from sklearn.metrics import root_mean_squared_error
        return root_mean_squared_error(y_true, y_pred)
    except ImportError:
        return float(np.sqrt(np.mean((np.array(y_true) - np.array(y_pred)) ** 2)))

# ══════════════════════════════════════════════════════════════════════════════
# MODEL LOADING
# ══════════════════════════════════════════════════════════════════════════════

BASE       = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE, "..", "models")

def _load(name):
    path = os.path.join(MODELS_DIR, name)
    if not os.path.exists(path):
        print(f"[WARNING] Not found: {path}")
        return None
    try:
        obj = joblib.load(path)
        print(f"[OK] Loaded: {name}")
        return obj
    except Exception as e:
        print(f"[ERROR] Failed to load {name}: {e}")
        return None

rf_model      = _load("rf_best_model.pkl")
gb_model      = _load("gb_best_model.pkl")
rf_gs         = _load("rf_randomsearch.pkl")
gb_gs         = _load("gb_randomsearch.pkl")
prophet_model = _load("prophet_model.pkl")

# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def get_model(name: str):
    if name == "rf":
        if rf_model is None:
            raise HTTPException(503, "RF model not found. Check models/ folder.")
        return rf_model
    elif name == "gb":
        if gb_model is None:
            raise HTTPException(503, "GB model not found. Check models/ folder.")
        return gb_model
    raise HTTPException(400, "model must be 'rf' or 'gb'")


def risk_level(ratio: float) -> str:
    if ratio > 0.3:  return "High Risk"
    if ratio > 0.15: return "Medium Risk"
    return "Low Risk"


def input_to_df(data: FlightInput) -> pd.DataFrame:
    """
    Mirrors Section 6 feature engineering from the notebook exactly.
    """
    eps = 1e-6
    d   = data.dict()

    d["carrier_ratio"]        = d["carrier_ct"]       / (d["arr_del15"] + eps)
    d["weather_ratio"]        = d["weather_ct"]       / (d["arr_del15"] + eps)
    d["nas_ratio"]            = d["nas_ct"]           / (d["arr_del15"] + eps)
    d["security_ratio"]       = d["security_ct"]      / (d["arr_del15"] + eps)
    d["late_aircraft_ratio"]  = d["late_aircraft_ct"] / (d["arr_del15"] + eps)
    d["cancellation_ratio"]   = d["arr_cancelled"]    / (d["arr_flights"] + eps)
    d["diverted_ratio"]       = d["arr_diverted"]     / (d["arr_flights"] + eps)

    df = pd.DataFrame([d])
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.fillna(0, inplace=True)

    drop = [
        "arr_del15", "delay_ratio", "arr_delay",
        "carrier_delay", "weather_delay", "nas_delay",
        "security_delay", "late_aircraft_delay", "month_name"
    ]
    df.drop(columns=[c for c in drop if c in df.columns], inplace=True)

    for c in ["carrier", "carrier_name", "airport", "airport_name"]:
        if c in df.columns:
            df[c] = df[c].astype(object)

    return df


def load_df() -> pd.DataFrame:
    path = os.path.join(MODELS_DIR, "df.pkl")
    if not os.path.exists(path):
        raise HTTPException(503,
            "df.pkl not found. In your notebook run: joblib.dump(df, 'models/df.pkl')")
    df = joblib.load(path)

    # ── Always re-compute delay_ratio so it's present regardless of
    #    when df.pkl was saved (before or after Section 6) ──────────────────
    eps = 1e-6
    if "delay_ratio" not in df.columns:
        df["delay_ratio"] = df["arr_del15"] / (df["arr_flights"] + eps)

    # Also re-compute the other engineered ratios if missing
    ratio_map = {
        "carrier_ratio":       ("carrier_ct",       "arr_del15"),
        "weather_ratio":       ("weather_ct",        "arr_del15"),
        "nas_ratio":           ("nas_ct",            "arr_del15"),
        "security_ratio":      ("security_ct",       "arr_del15"),
        "late_aircraft_ratio": ("late_aircraft_ct",  "arr_del15"),
        "cancellation_ratio":  ("arr_cancelled",     "arr_flights"),
        "diverted_ratio":      ("arr_diverted",      "arr_flights"),
    }
    for col, (num, den) in ratio_map.items():
        if col not in df.columns and num in df.columns and den in df.columns:
            df[col] = df[num] / (df[den] + eps)

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.fillna(df.mean(numeric_only=True), inplace=True)

    return df


def load_forecast_csv():
    path = os.path.join(MODELS_DIR, "prophet_forecast.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path)
    df["ds"] = pd.to_datetime(df["ds"]).dt.strftime("%Y-%m")
    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        if col in df.columns:
            df[col] = df[col].round(0).astype(int)
    return df


def get_gs_params(gs):
    if gs is None:
        return None, None
    params = {k.replace("model__", ""): v for k, v in gs.best_params_.items()}
    score  = round(float(gs.best_score_), 4)
    return params, score

# ══════════════════════════════════════════════════════════════════════════════
# APP
# ══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title       = "Airline Delay Prediction API",
    description = "Predict flight delays | Compare RF vs GB | SHAP | Prophet",
    version     = "1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════════════════
# 1. HEALTH
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
def root():
    return {
        "status":               "API is running",
        "rf_model_loaded":      rf_model      is not None,
        "gb_model_loaded":      gb_model      is not None,
        "prophet_model_loaded": prophet_model is not None,
        "forecast_csv_ready":   load_forecast_csv() is not None,
        "docs":                 "http://localhost:8000/docs",
    }

@app.get("/health", tags=["Health"])
def health():
    return {
        "status": "ok",
        "models": {
            "random_forest":     rf_model      is not None,
            "gradient_boosting": gb_model      is not None,
            "prophet":           prophet_model is not None,
        },
        "files": {
            "forecast_csv": load_forecast_csv() is not None,
            "df_pkl":       os.path.exists(os.path.join(MODELS_DIR, "df.pkl")),
        }
    }

# ══════════════════════════════════════════════════════════════════════════════
# 2. SINGLE PREDICTION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/predict", tags=["Prediction"])
def predict(data: FlightInput, model: str = "rf"):
    """
    Predict delayed flights (arr_del15) for a single record.
    model: rf = Random Forest (default) | gb = Gradient Boosting
    """
    mdl  = get_model(model)
    df   = input_to_df(data)
    pred = float(mdl.predict(df)[0])
    dr   = pred / (data.arr_flights + 1e-6)

    return {
        "model":               model.upper(),
        "predicted_arr_del15": round(pred, 2),
        "delay_ratio":         round(dr, 4),
        "delay_pct":           f"{dr*100:.1f}%",
        "risk_level":          risk_level(dr),
        "input": {
            "carrier":     data.carrier,
            "airport":     data.airport,
            "month":       data.month,
            "year":        data.year,
            "arr_flights": data.arr_flights,
        }
    }

# ══════════════════════════════════════════════════════════════════════════════
# 3. BATCH PREDICTION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/predict/batch", tags=["Prediction"])
def predict_batch(data: BatchInput, model: str = "rf"):
    """Predict delays for multiple flights at once."""
    mdl     = get_model(model)
    results = []

    for flight in data.flights:
        df   = input_to_df(flight)
        pred = float(mdl.predict(df)[0])
        dr   = pred / (flight.arr_flights + 1e-6)
        results.append({
            "carrier":             flight.carrier,
            "airport":             flight.airport,
            "month":               flight.month,
            "predicted_arr_del15": round(pred, 2),
            "delay_ratio":         round(dr, 4),
            "delay_pct":           f"{dr*100:.1f}%",
            "risk_level":          risk_level(dr),
        })

    return {"model": model.upper(), "count": len(results), "results": results}

# ══════════════════════════════════════════════════════════════════════════════
# 4. COMPARE RF vs GB
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/predict/compare", tags=["Prediction"])
def compare_models(data: FlightInput):
    """Run the same input through both RF and GB and compare."""
    if rf_model is None or gb_model is None:
        raise HTTPException(503, "Both models must be loaded.")

    df      = input_to_df(data)
    rf_pred = float(rf_model.predict(df)[0])
    gb_pred = float(gb_model.predict(df)[0])
    rf_dr   = rf_pred / (data.arr_flights + 1e-6)
    gb_dr   = gb_pred / (data.arr_flights + 1e-6)

    return {
        "input": {
            "carrier":     data.carrier,
            "airport":     data.airport,
            "month":       data.month,
            "arr_flights": data.arr_flights,
        },
        "random_forest": {
            "predicted_arr_del15": round(rf_pred, 2),
            "delay_ratio":         round(rf_dr, 4),
            "delay_pct":           f"{rf_dr*100:.1f}%",
            "risk_level":          risk_level(rf_dr),
        },
        "gradient_boosting": {
            "predicted_arr_del15": round(gb_pred, 2),
            "delay_ratio":         round(gb_dr, 4),
            "delay_pct":           f"{gb_dr*100:.1f}%",
            "risk_level":          risk_level(gb_dr),
        },
        "difference": round(abs(rf_pred - gb_pred), 2),
        "agreement":  "Models agree" if abs(rf_dr - gb_dr) < 0.05
                      else "Models disagree",
    }

# ══════════════════════════════════════════════════════════════════════════════
# 5. MODEL INFO
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/model/info", tags=["Model"])
def model_info():
    """Best hyperparameters and CV score from GridSearchCV (notebook Section 8)."""
    info = {}

    rf_params, rf_score = get_gs_params(rf_gs)
    if rf_params is not None:
        info["random_forest"] = {
            "best_params": rf_params,
            "best_cv_r2":  rf_score,
            "model_type":  "RandomForestRegressor",
        }

    gb_params, gb_score = get_gs_params(gb_gs)
    if gb_params is not None:
        info["gradient_boosting"] = {
            "best_params": gb_params,
            "best_cv_r2":  gb_score,
            "model_type":  "GradientBoostingRegressor",
        }

    if not info:
        raise HTTPException(503, "No GridSearchCV objects loaded.")
    return info

# ══════════════════════════════════════════════════════════════════════════════
# 6. CV RESULTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/model/cv-results", tags=["Model"])
def cv_results(model: str = "rf"):
    """All cross-validation results from GridSearchCV (notebook Section 8)."""
    gs = rf_gs if model == "rf" else gb_gs
    if gs is None:
        raise HTTPException(503, f"{model} GridSearchCV object not loaded.")

    cv_df = (pd.DataFrame(gs.cv_results_)
               [["params", "mean_test_score", "std_test_score", "rank_test_score"]]
               .sort_values("rank_test_score"))
    return {"model": model.upper(), "results": cv_df.to_dict(orient="records")}

# ══════════════════════════════════════════════════════════════════════════════
# 7. FEATURE IMPORTANCE
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/model/feature-importance", tags=["Model"])
def feature_importance(top_n: int = 15):
    """Top N feature importances from the Random Forest model."""
    if rf_model is None:
        raise HTTPException(503, "RF model not loaded.")

    pre    = rf_model.named_steps["pre"]
    rf_mdl = rf_model.named_steps["model"]

    try:
        cat_names = (pre.named_transformers_["cat"]
                       .named_steps["onehot"]
                       .get_feature_names_out())
        n_num     = len(rf_mdl.feature_importances_) - len(cat_names)
        num_names = [f"num_{i}" for i in range(n_num)]
        all_names = list(num_names) + list(cat_names)
    except Exception:
        all_names = [f"feature_{i}"
                     for i in range(len(rf_mdl.feature_importances_))]

    imp_df = (pd.DataFrame({"feature":    all_names,
                             "importance": rf_mdl.feature_importances_})
                .sort_values("importance", ascending=False)
                .head(top_n))
    return {"model": "RF", "top_n": top_n,
            "features": imp_df.to_dict(orient="records")}

# ══════════════════════════════════════════════════════════════════════════════
# 8. SHAP EXPLANATION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/explain", tags=["Explainability"])
def explain(data: FlightInput):
    """SHAP values — mirrors Section 10 of the notebook."""
    try:
        import shap
    except ImportError:
        raise HTTPException(500, "shap not installed. Run: pip install shap")

    if rf_model is None:
        raise HTTPException(503, "RF model not loaded.")

    pre    = rf_model.named_steps["pre"]
    rf_mdl = rf_model.named_steps["model"]

    df  = input_to_df(data)
    X_t = pre.transform(df).astype(np.float64)
    if hasattr(X_t, "toarray"):
        X_t = X_t.toarray()

    try:
        cat_names = (pre.named_transformers_["cat"]
                       .named_steps["onehot"]
                       .get_feature_names_out())
        n_num     = X_t.shape[1] - len(cat_names)
        num_names = [f"num_{i}" for i in range(n_num)]
        all_names = list(num_names) + list(cat_names)
    except Exception:
        all_names = [f"f_{i}" for i in range(X_t.shape[1])]

    explainer   = shap.TreeExplainer(rf_mdl)
    shap_values = explainer.shap_values(X_t)[0]

    top_idx = np.argsort(np.abs(shap_values))[::-1][:10]
    shap_df = pd.DataFrame({
        "feature":    [all_names[i] for i in top_idx],
        "shap_value": [round(float(shap_values[i]), 4) for i in top_idx],
        "impact":     ["increases delay" if shap_values[i] > 0
                       else "decreases delay" for i in top_idx],
    })

    pred = float(rf_model.predict(df)[0])
    ev   = explainer.expected_value
    ev   = float(ev[0]) if hasattr(ev, "__len__") else float(ev)

    return {
        "predicted_arr_del15": round(pred, 2),
        "base_value":          round(ev, 2),
        "top_shap_features":   shap_df.to_dict(orient="records"),
    }

# ══════════════════════════════════════════════════════════════════════════════
# 9. PROPHET FORECAST
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/forecast", tags=["Forecasting"])
def forecast(periods: int = 12):
    """Prophet forecast for nationwide monthly delays (Section 11)."""

    # Option 1 — pre-saved CSV (fastest)
    csv_df = load_forecast_csv()
    if csv_df is not None:
        result = csv_df.tail(periods)
        return {
            "forecast_periods": periods,
            "source":           "cached CSV",
            "unit":             "total delayed flights nationwide",
            "forecast":         result.to_dict(orient="records"),
        }

    # Option 2 — saved Prophet model (fast, no refit)
    if prophet_model is not None:
        future    = prophet_model.make_future_dataframe(periods=periods, freq="ME")
        forecast_ = prophet_model.predict(future)
        result    = forecast_[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(periods).copy()
        result["ds"]         = result["ds"].dt.strftime("%Y-%m")
        result["yhat"]       = result["yhat"].round(0).astype(int)
        result["yhat_lower"] = result["yhat_lower"].round(0).astype(int)
        result["yhat_upper"] = result["yhat_upper"].round(0).astype(int)
        return {
            "forecast_periods": periods,
            "source":           "prophet_model.pkl",
            "unit":             "total delayed flights nationwide",
            "forecast":         result.to_dict(orient="records"),
        }

    # Option 3 — refit from df.pkl (slow fallback)
    try:
        from prophet import Prophet
    except ImportError:
        raise HTTPException(500, "prophet not installed.")

    df = load_df()

    prophet_df = (df.groupby(["year", "month"])["arr_del15"]
                    .sum().reset_index())
    prophet_df["ds"] = pd.to_datetime(
        prophet_df["year"].astype(str) + "-" +
        prophet_df["month"].astype(str).str.zfill(2) + "-01")
    prophet_df = (prophet_df[["ds", "arr_del15"]]
                    .rename(columns={"arr_del15": "y"})
                    .sort_values("ds").reset_index(drop=True))

    m = Prophet(yearly_seasonality=True, weekly_seasonality=False,
                daily_seasonality=False, uncertainty_samples=200)
    m.fit(prophet_df)
    future    = m.make_future_dataframe(periods=periods, freq="ME")
    forecast_ = m.predict(future)

    result = forecast_[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(periods).copy()
    result["ds"]         = result["ds"].dt.strftime("%Y-%m")
    result["yhat"]       = result["yhat"].round(0).astype(int)
    result["yhat_lower"] = result["yhat_lower"].round(0).astype(int)
    result["yhat_upper"] = result["yhat_upper"].round(0).astype(int)

    return {
        "forecast_periods": periods,
        "source":           "refit from df.pkl",
        "unit":             "total delayed flights nationwide",
        "forecast":         result.to_dict(orient="records"),
    }

# ══════════════════════════════════════════════════════════════════════════════
# 10. DATASET STATS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/stats", tags=["Data"])
def stats():
    """Summary statistics from the training data. Requires models/df.pkl"""
    df = load_df()   # delay_ratio is guaranteed to exist after load_df()

    delay_components = ["carrier_ct", "weather_ct", "nas_ct",
                        "security_ct", "late_aircraft_ct"]

    # Only use components that actually exist in the loaded df
    available = [c for c in delay_components if c in df.columns]
    comp      = df[available].mean()
    comp_pct  = (comp / comp.sum() * 100).round(1)

    monthly       = df.groupby("month")["delay_ratio"].mean()
    worst_carrier = df.groupby("carrier_name")["delay_ratio"].mean().idxmax()
    best_carrier  = df.groupby("carrier_name")["delay_ratio"].mean().idxmin()
    worst_airport = df.groupby("airport")["delay_ratio"].mean().idxmax()

    return {
        "dataset": {
            "rows":     int(len(df)),
            "years":    f"{int(df['year'].min())}-{int(df['year'].max())}",
            "carriers": int(df["carrier"].nunique()),
            "airports": int(df["airport"].nunique()),
        },
        "delay_causes_pct": {
            "late_aircraft": float(comp_pct.get("late_aircraft_ct", 0)),
            "carrier":       float(comp_pct.get("carrier_ct",       0)),
            "nas":           float(comp_pct.get("nas_ct",           0)),
            "weather":       float(comp_pct.get("weather_ct",       0)),
            "security":      float(comp_pct.get("security_ct",      0)),
        },
        "insights": {
            "worst_month":         int(monthly.idxmax()),
            "best_month":          int(monthly.idxmin()),
            "worst_carrier":       worst_carrier,
            "best_carrier":        best_carrier,
            "worst_airport":       worst_airport,
            "avg_delay_ratio":     round(float(df["delay_ratio"].mean()), 4),
            "avg_delay_ratio_pct": f"{df['delay_ratio'].mean()*100:.1f}%",
        }
    }

# ══════════════════════════════════════════════════════════════════════════════
# TESTS  (pytest main.py -v)
# ══════════════════════════════════════════════════════════════════════════════

import pytest
from fastapi.testclient import TestClient

@pytest.fixture(scope="module")
def client():
    return TestClient(app)

@pytest.fixture(scope="module")
def flight():
    return {
        "year": 2023, "month": 7,
        "carrier": "AA",
        "carrier_name": "American Airlines Inc.",
        "airport": "ATL",
        "airport_name": "Atlanta GA: Hartsfield-Jackson Atlanta International",
        "arr_flights": 1500.0, "arr_del15": 0.0,
        "carrier_ct": 120.0,   "weather_ct": 30.0,
        "nas_ct": 80.0,        "security_ct": 1.0,
        "late_aircraft_ct": 150.0,
        "arr_cancelled": 20.0, "arr_diverted": 5.0,
    }

@pytest.fixture(scope="module")
def batch(flight):
    f2 = {**flight, "carrier": "DL",
          "carrier_name": "Delta Air Lines Inc.", "month": 1}
    return {"flights": [flight, f2]}

# ── Health ────────────────────────────────────────────────────────────────────

def test_root_200(client):
    assert client.get("/").status_code == 200

def test_root_has_status(client):
    assert "status" in client.get("/").json()

def test_root_shows_prophet(client):
    assert "prophet_model_loaded" in client.get("/").json()

def test_health_200(client):
    assert client.get("/health").status_code == 200

def test_health_rf_loaded(client):
    assert client.get("/health").json()["models"]["random_forest"] is True

def test_health_gb_loaded(client):
    assert client.get("/health").json()["models"]["gradient_boosting"] is True

def test_health_prophet_loaded(client):
    assert client.get("/health").json()["models"]["prophet"] is True

def test_health_has_files(client):
    assert "files" in client.get("/health").json()

# ── Predict RF ────────────────────────────────────────────────────────────────

def test_predict_rf_200(client, flight):
    assert client.post("/predict?model=rf", json=flight).status_code == 200

def test_predict_rf_has_prediction(client, flight):
    assert "predicted_arr_del15" in client.post("/predict?model=rf", json=flight).json()

def test_predict_rf_positive(client, flight):
    assert client.post("/predict?model=rf", json=flight).json()["predicted_arr_del15"] >= 0

def test_predict_rf_model_field(client, flight):
    assert client.post("/predict?model=rf", json=flight).json()["model"] == "RF"

def test_predict_rf_risk_level(client, flight):
    risk = client.post("/predict?model=rf", json=flight).json()["risk_level"]
    assert risk in ["High Risk", "Medium Risk", "Low Risk"]

def test_predict_rf_delay_pct(client, flight):
    assert "%" in client.post("/predict?model=rf", json=flight).json()["delay_pct"]

def test_predict_rf_input_echo(client, flight):
    body = client.post("/predict?model=rf", json=flight).json()
    assert body["input"]["carrier"] == "AA"
    assert body["input"]["airport"] == "ATL"

# ── Predict GB ────────────────────────────────────────────────────────────────

def test_predict_gb_200(client, flight):
    assert client.post("/predict?model=gb", json=flight).status_code == 200

def test_predict_gb_model_field(client, flight):
    assert client.post("/predict?model=gb", json=flight).json()["model"] == "GB"

# ── Validation ────────────────────────────────────────────────────────────────

def test_predict_invalid_model_400(client, flight):
    assert client.post("/predict?model=xyz", json=flight).status_code == 400

def test_predict_missing_body_422(client):
    assert client.post("/predict", json={"year": 2023}).status_code == 422

def test_predict_invalid_month_422(client, flight):
    assert client.post("/predict", json={**flight, "month": 13}).status_code == 422

# ── Batch ─────────────────────────────────────────────────────────────────────

def test_batch_200(client, batch):
    assert client.post("/predict/batch?model=rf", json=batch).status_code == 200

def test_batch_count(client, batch):
    assert client.post("/predict/batch?model=rf", json=batch).json()["count"] == 2

def test_batch_has_risk_level(client, batch):
    for r in client.post("/predict/batch?model=rf", json=batch).json()["results"]:
        assert "risk_level" in r

# ── Compare ───────────────────────────────────────────────────────────────────

def test_compare_200(client, flight):
    assert client.post("/predict/compare", json=flight).status_code == 200

def test_compare_has_both(client, flight):
    body = client.post("/predict/compare", json=flight).json()
    assert "random_forest" in body and "gradient_boosting" in body

def test_compare_has_agreement(client, flight):
    body = client.post("/predict/compare", json=flight).json()
    assert "agreement" in body and body["difference"] >= 0

# ── Model info ────────────────────────────────────────────────────────────────

def test_model_info_200(client):
    assert client.get("/model/info").status_code == 200

def test_model_info_rf_gb(client):
    body = client.get("/model/info").json()
    assert "random_forest" in body and "gradient_boosting" in body

def test_model_info_cv_r2(client):
    assert 0 <= client.get("/model/info").json()["random_forest"]["best_cv_r2"] <= 1

# ── CV results ────────────────────────────────────────────────────────────────

def test_cv_rf_200(client):
    assert client.get("/model/cv-results?model=rf").status_code == 200

def test_cv_gb_200(client):
    assert client.get("/model/cv-results?model=gb").status_code == 200

def test_cv_is_list(client):
    r = client.get("/model/cv-results?model=rf").json()
    assert isinstance(r["results"], list) and len(r["results"]) > 0

# ── Feature importance ────────────────────────────────────────────────────────

def test_feat_imp_200(client):
    assert client.get("/model/feature-importance").status_code == 200

def test_feat_imp_top15(client):
    assert len(client.get("/model/feature-importance").json()["features"]) <= 15

def test_feat_imp_top5(client):
    assert len(client.get("/model/feature-importance?top_n=5").json()["features"]) <= 5

# ── Explain ───────────────────────────────────────────────────────────────────

def test_explain_200(client, flight):
    assert client.post("/explain", json=flight).status_code == 200

def test_explain_has_shap(client, flight):
    feats = client.post("/explain", json=flight).json()["top_shap_features"]
    assert isinstance(feats, list) and len(feats) > 0

def test_explain_shap_fields(client, flight):
    for row in client.post("/explain", json=flight).json()["top_shap_features"]:
        assert "feature" in row and "shap_value" in row and "impact" in row

def test_explain_impact_values(client, flight):
    for row in client.post("/explain", json=flight).json()["top_shap_features"]:
        assert row["impact"] in ["increases delay", "decreases delay"]

def test_explain_missing_422(client):
    assert client.post("/explain", json={"year": 2023}).status_code == 422

# ── Forecast ──────────────────────────────────────────────────────────────────

def test_forecast_200(client):
    assert client.get("/forecast").status_code == 200

def test_forecast_12_periods(client):
    r = client.get("/forecast").json()
    assert r["forecast_periods"] == 12 and len(r["forecast"]) == 12

def test_forecast_6_periods(client):
    assert len(client.get("/forecast?periods=6").json()["forecast"]) == 6

def test_forecast_has_source(client):
    assert "source" in client.get("/forecast").json()

def test_forecast_rows_complete(client):
    for row in client.get("/forecast").json()["forecast"]:
        assert "ds" in row and "yhat" in row
        assert "yhat_lower" in row and "yhat_upper" in row

def test_forecast_bounds_valid(client):
    for row in client.get("/forecast").json()["forecast"]:
        assert row["yhat_lower"] <= row["yhat"] <= row["yhat_upper"]

def test_forecast_ds_format(client):
    import re
    for row in client.get("/forecast").json()["forecast"]:
        assert re.match(r"\d{4}-\d{2}", row["ds"])

# ── Stats ─────────────────────────────────────────────────────────────────────

def test_stats_200(client):
    assert client.get("/stats").status_code == 200

def test_stats_sections(client):
    body = client.get("/stats").json()
    assert "dataset" in body and "delay_causes_pct" in body and "insights" in body

def test_stats_rows_positive(client):
    assert client.get("/stats").json()["dataset"]["rows"] > 0

def test_stats_causes_sum_100(client):
    causes = client.get("/stats").json()["delay_causes_pct"]
    assert abs(sum(causes.values()) - 100.0) < 1.0

def test_stats_carriers(client):
    ins = client.get("/stats").json()["insights"]
    assert "worst_carrier" in ins and "best_carrier" in ins

def test_stats_avg_ratio(client):
    assert 0 <= client.get("/stats").json()["insights"]["avg_delay_ratio"] <= 1