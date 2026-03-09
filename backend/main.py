# ══════════════════════════════════════════════════════════════════════════════
# AIRLINE DELAY API — main.py  (single file)
# ══════════════════════════════════════════════════════════════════════════════
# Run:   uvicorn main:app --reload --port 8000
# Test:  pytest main.py -v
# Docs:  http://localhost:8000/docs
# ══════════════════════════════════════════════════════════════════════════════

import os
import httpx
import joblib
import numpy  as np
import pandas as pd

from dotenv                  import load_dotenv
from fastapi                 import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic                import BaseModel, Field
from typing                  import List

load_dotenv()   # reads backend/.env automatically

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

# ── Chat schemas (NEW) ────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role:    str    # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

# ══════════════════════════════════════════════════════════════════════════════
# SAFE RMSE HELPER  (fixes sklearn >= 1.4 deprecation)
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
    print(f"[OK] Loaded: {name}")
    return joblib.load(path)

rf_model      = _load("rf_best_model.pkl")
gb_model      = _load("gb_best_model.pkl")
rf_gs         = _load("rf_randomsearch.pkl")
gb_gs         = _load("gb_randomsearch.pkl")
prophet_model = _load("prophet_model.pkl")

# ══════════════════════════════════════════════════════════════════════════════
# GROQ CONFIG (NEW)
# ══════════════════════════════════════════════════════════════════════════════

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def build_system_prompt() -> str:
    """Build a rich system prompt injecting live stats from the dataset."""
    base = """You are an expert AI data analyst embedded in the FlightDelay AI platform.
You have DIRECT ACCESS to the real dataset and must answer questions with actual numbers and facts.
Never tell the user to "navigate to a section" — answer the question yourself using the data below.
Be concise, specific, and data-driven. Use real numbers in every answer."""

    try:
        df  = load_df()
        eps = 1e-6

        # ── KPIs ──────────────────────────────────────────────────────────
        total_flights   = int(df["arr_flights"].sum())
        total_delayed   = int(df["arr_del15"].sum())
        delay_rate      = round(total_delayed / (total_flights + eps) * 100, 1)
        on_time_rate    = round(100 - delay_rate, 1)
        years           = f"{int(df['year'].min())}–{int(df['year'].max())}"
        n_carriers      = int(df["carrier"].nunique())
        n_airports      = int(df["airport"].nunique())

        # ── Worst / best carriers ─────────────────────────────────────────
        car = (df.groupby("carrier_name")
                 .agg(flights=("arr_flights","sum"), delayed=("arr_del15","sum"))
                 .assign(rate=lambda x: (x["delayed"]/(x["flights"]+eps)*100).round(1))
                 .sort_values("rate", ascending=False))
        worst5_carriers = "\n".join(
            f"  • {row.Index}: {row.rate}% delay rate"
            for row in car.head(5).itertuples())
        best5_carriers  = "\n".join(
            f"  • {row.Index}: {row.rate}% delay rate"
            for row in car.tail(5).itertuples())

        # ── Worst / best airports ─────────────────────────────────────────
        apt = (df.groupby("airport")
                 .agg(flights=("arr_flights","sum"), delayed=("arr_del15","sum"))
                 .assign(rate=lambda x: (x["delayed"]/(x["flights"]+eps)*100).round(1))
                 .sort_values("rate", ascending=False))
        worst5_airports = "\n".join(
            f"  • {row.Index}: {row.rate}% delay rate"
            for row in apt.head(5).itertuples())
        best5_airports  = "\n".join(
            f"  • {row.Index}: {row.rate}% delay rate"
            for row in apt.tail(5).itertuples())

        # ── Delay causes ──────────────────────────────────────────────────
        cause_cols = {"Late Aircraft": "late_aircraft_ct", "Carrier": "carrier_ct",
                      "NAS": "nas_ct", "Weather": "weather_ct", "Security": "security_ct"}
        totals  = {k: df[v].sum() for k, v in cause_cols.items() if v in df.columns}
        total_c = sum(totals.values()) + eps
        causes  = "\n".join(f"  • {k}: {v/total_c*100:.1f}%" for k, v in
                            sorted(totals.items(), key=lambda x: -x[1]))

        # ── Monthly trend ─────────────────────────────────────────────────
        mon = (df.groupby("month")
                 .agg(flights=("arr_flights","sum"), delayed=("arr_del15","sum"))
                 .assign(rate=lambda x: (x["delayed"]/(x["flights"]+eps)*100).round(1)))
        worst_month = int(mon["rate"].idxmax())
        best_month  = int(mon["rate"].idxmin())
        month_names = {1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",
                       7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"}

        # ── Model CV scores ───────────────────────────────────────────────
        model_info = ""
        if rf_gs is not None:
            rf_r2 = round(float(rf_gs.best_score_), 4)
            rf_params = {k.replace("model__",""):v for k,v in rf_gs.best_params_.items()}
            model_info += f"\n- Random Forest: CV R²={rf_r2}, best params={rf_params}"
        if gb_gs is not None:
            gb_r2 = round(float(gb_gs.best_score_), 4)
            gb_params = {k.replace("model__",""):v for k,v in gb_gs.best_params_.items()}
            model_info += f"\n- Gradient Boosting: CV R²={gb_r2}, best params={gb_params}"

        # ── Feature importances from RF ───────────────────────────────────
        feat_info = ""
        if rf_model is not None:
            try:
                pre    = rf_model.named_steps["pre"]
                rf_mdl = rf_model.named_steps["model"]
                cat_names = pre.named_transformers_["cat"].named_steps["onehot"].get_feature_names_out()
                n_num     = len(rf_mdl.feature_importances_) - len(cat_names)
                num_names = [f"num_{i}" for i in range(n_num)]
                all_names = list(num_names) + list(cat_names)
                imp = sorted(zip(all_names, rf_mdl.feature_importances_), key=lambda x: -x[1])[:8]
                feat_info = "\n".join(f"  * {n}: {v:.4f}" for n, v in imp)
            except Exception:
                feat_info = "  (could not extract feature names)"

        # ── Sample predictions per carrier (RF model) ─────────────────────
        sample_preds = ""
        if rf_model is not None:
            try:
                carrier_medians = (df.groupby(["carrier","carrier_name"])
                    .agg(
                        arr_flights     =("arr_flights",     "median"),
                        carrier_ct      =("carrier_ct",      "median"),
                        weather_ct      =("weather_ct",      "median"),
                        nas_ct          =("nas_ct",          "median"),
                        security_ct     =("security_ct",     "median"),
                        late_aircraft_ct=("late_aircraft_ct","median"),
                        arr_cancelled   =("arr_cancelled",   "median"),
                        arr_diverted    =("arr_diverted",    "median"),
                    ).reset_index())

                rows = []
                for _, row in carrier_medians.iterrows():
                    fi = FlightInput(
                        year=2023, month=7,
                        carrier=str(row["carrier"]),
                        carrier_name=str(row["carrier_name"]),
                        airport="ATL",
                        airport_name="Atlanta GA: Hartsfield-Jackson Atlanta International",
                        arr_flights=float(row["arr_flights"]),
                        arr_del15=0.0,
                        carrier_ct=float(row["carrier_ct"]),
                        weather_ct=float(row["weather_ct"]),
                        nas_ct=float(row["nas_ct"]),
                        security_ct=float(row["security_ct"]),
                        late_aircraft_ct=float(row["late_aircraft_ct"]),
                        arr_cancelled=float(row["arr_cancelled"]),
                        arr_diverted=float(row["arr_diverted"]),
                    )
                    df_in = input_to_df(fi)
                    pred  = float(rf_model.predict(df_in)[0])
                    dr    = pred / (float(row["arr_flights"]) + eps)
                    rows.append((str(row["carrier_name"]), round(dr*100,1), risk_level(dr)))

                rows.sort(key=lambda x: -x[1])
                sample_preds = "\n".join(
                    f"  * {name}: RF predicts {pct}% delay ratio -> {risk}"
                    for name, pct, risk in rows)
            except Exception as e2:
                sample_preds = f"  (prediction error: {e2})"

        data_section = f"""

===========================================
REAL DATASET FACTS (answer from these)
===========================================
Period: {years} | Carriers: {n_carriers} | Airports: {n_airports}
Total flights: {total_flights:,}
Total delayed 15+ min: {total_delayed:,}
Overall delay rate: {delay_rate}%
On-time rate: {on_time_rate}%

WORST 5 CARRIERS (historical):
{worst5_carriers}

BEST 5 CARRIERS (historical):
{best5_carriers}

WORST 5 AIRPORTS (historical):
{worst5_airports}

BEST 5 AIRPORTS (historical):
{best5_airports}

DELAY CAUSES:
{causes}

SEASONAL: worst month={month_names[worst_month]}, best month={month_names[best_month]}

ML MODEL PERFORMANCE:{model_info}

TOP 8 FEATURE IMPORTANCES (RF model):
{feat_info}

RF MODEL PREDICTIONS PER CARRIER (median inputs, Jul 2023):
{sample_preds}
==========================================="""

        return base + data_section

    except Exception as e:
        # Fallback if df.pkl not loaded yet
        return base + f"\n\n[Note: Live data unavailable — {e}]"

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
            "df.pkl not found. In notebook run: joblib.dump(df, 'models/df.pkl')")
    return joblib.load(path)


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
    description = "Predict flight delays | Compare RF vs GB | SHAP | Prophet | Chat",
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
        "groq_configured":      GROQ_API_KEY  is not None,
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
        },
        "chat": {
            "groq_configured": GROQ_API_KEY is not None,
        }
    }

# ══════════════════════════════════════════════════════════════════════════════
# 2. SINGLE PREDICTION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/predict", tags=["Prediction"])
def predict(data: FlightInput, model: str = "rf"):
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
    csv_df = load_forecast_csv()
    if csv_df is not None:
        result = csv_df.tail(periods)
        return {
            "forecast_periods": periods,
            "source":           "cached CSV",
            "unit":             "total delayed flights nationwide",
            "forecast":         result.to_dict(orient="records"),
        }

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
    df = load_df()

    delay_components = ["carrier_ct", "weather_ct", "nas_ct",
                        "security_ct", "late_aircraft_ct"]
    comp     = df[delay_components].mean()
    comp_pct = (comp / comp.sum() * 100).round(1)

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
            "late_aircraft": float(comp_pct["late_aircraft_ct"]),
            "carrier":       float(comp_pct["carrier_ct"]),
            "nas":           float(comp_pct["nas_ct"]),
            "weather":       float(comp_pct["weather_ct"]),
            "security":      float(comp_pct["security_ct"]),
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
# 11. DETAILED STATISTICS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/statistics", tags=["Data"])
def statistics():
    df  = load_df()
    eps = 1e-6

    total_flights   = int(df["arr_flights"].sum())
    total_delayed   = int(df["arr_del15"].sum())
    total_cancelled = int(df["arr_cancelled"].sum()) if "arr_cancelled" in df.columns else 0
    total_diverted  = int(df["arr_diverted"].sum())  if "arr_diverted"  in df.columns else 0
    total_records   = int(len(df))

    overall_delay_rate    = round(total_delayed   / (total_flights + eps) * 100, 2)
    overall_cancel_rate   = round(total_cancelled / (total_flights + eps) * 100, 2)
    overall_diverted_rate = round(total_diverted  / (total_flights + eps) * 100, 2)
    on_time_rate          = round(100 - overall_delay_rate - overall_cancel_rate, 2)

    cause_cols = {
        "carrier":       "carrier_ct",
        "weather":       "weather_ct",
        "nas":           "nas_ct",
        "security":      "security_ct",
        "late_aircraft": "late_aircraft_ct",
    }
    cause_totals = {}
    for label, col in cause_cols.items():
        if col in df.columns:
            cause_totals[label] = int(df[col].sum())
    total_cause = sum(cause_totals.values()) + eps
    cause_pct   = {k: round(v / total_cause * 100, 1) for k, v in cause_totals.items()}

    agg_dict = {"arr_flights": "sum", "arr_del15": "sum"}
    if "arr_cancelled" in df.columns:
        agg_dict["arr_cancelled"] = "sum"
    carrier_grp = df.groupby("carrier_name").agg(agg_dict).reset_index()
    carrier_grp["delay_rate"] = (carrier_grp["arr_del15"] / (carrier_grp["arr_flights"] + eps) * 100).round(2)
    if "arr_cancelled" in carrier_grp.columns:
        carrier_grp["cancel_rate"] = (carrier_grp["arr_cancelled"] / (carrier_grp["arr_flights"] + eps) * 100).round(2)
    carrier_grp = carrier_grp.sort_values("delay_rate", ascending=False)

    top5_worst = carrier_grp.head(5)[["carrier_name","delay_rate","arr_flights","arr_del15"]].rename(
        columns={"arr_flights":"total_flights","arr_del15":"total_delayed"}).to_dict(orient="records")
    top5_best  = carrier_grp.tail(5)[["carrier_name","delay_rate","arr_flights","arr_del15"]].rename(
        columns={"arr_flights":"total_flights","arr_del15":"total_delayed"}).to_dict(orient="records")

    airport_grp = df.groupby("airport").agg(
        arr_flights=("arr_flights","sum"),
        arr_del15  =("arr_del15",  "sum"),
    ).reset_index()
    airport_grp["delay_rate"] = (airport_grp["arr_del15"] / (airport_grp["arr_flights"] + eps) * 100).round(2)
    airport_grp = airport_grp.sort_values("delay_rate", ascending=False)

    top5_worst_airports = airport_grp.head(5).rename(
        columns={"arr_flights":"total_flights","arr_del15":"total_delayed"}).to_dict(orient="records")
    top5_best_airports  = airport_grp.tail(5).rename(
        columns={"arr_flights":"total_flights","arr_del15":"total_delayed"}).to_dict(orient="records")

    monthly = df.groupby("month").agg(
        total_flights=("arr_flights","sum"),
        total_delayed=("arr_del15",  "sum"),
    ).reset_index()
    monthly["delay_rate"] = (monthly["total_delayed"] / (monthly["total_flights"] + eps) * 100).round(2)

    yearly = df.groupby("year").agg(
        total_flights=("arr_flights","sum"),
        total_delayed=("arr_del15",  "sum"),
    ).reset_index()
    yearly["delay_rate"] = (yearly["total_delayed"] / (yearly["total_flights"] + eps) * 100).round(2)

    return {
        "kpis": {
            "total_flights":         total_flights,
            "total_delayed":         total_delayed,
            "total_cancelled":       total_cancelled,
            "total_diverted":        total_diverted,
            "total_records":         total_records,
            "overall_delay_rate":    f"{overall_delay_rate}%",
            "overall_cancel_rate":   f"{overall_cancel_rate}%",
            "overall_diverted_rate": f"{overall_diverted_rate}%",
            "on_time_rate":          f"{on_time_rate}%",
            "years_covered":         f"{int(df['year'].min())}-{int(df['year'].max())}",
            "num_carriers":          int(df["carrier"].nunique()),
            "num_airports":          int(df["airport"].nunique()),
        },
        "delay_causes": {
            "totals":      cause_totals,
            "percentages": cause_pct,
        },
        "carriers": {
            "worst_5": top5_worst,
            "best_5":  top5_best,
        },
        "airports": {
            "worst_5": top5_worst_airports,
            "best_5":  top5_best_airports,
        },
        "trends": {
            "monthly": monthly.to_dict(orient="records"),
            "yearly":  yearly.to_dict(orient="records"),
        },
    }

# ══════════════════════════════════════════════════════════════════════════════
# 12. CHAT — Groq (NEW)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/chat", tags=["Chat"])
async def chat(req: ChatRequest):
    """
    Proxy chat to Groq API (llama-3.3-70b — free).
    GROQ_API_KEY stays on the server, never exposed to the browser.
    Add GROQ_API_KEY=gsk_... to your backend/.env file.
    """
    if not GROQ_API_KEY:
        raise HTTPException(
            503,
            "GROQ_API_KEY not configured. "
            "Create backend/.env and add: GROQ_API_KEY=gsk_your_key_here"
        )

    payload = {
        "model":       "llama-3.3-70b-versatile",
        "max_tokens":  1024,
        "temperature": 0.7,
        "messages":    [{"role": "system", "content": build_system_prompt()}]
                     + [{"role": m.role, "content": m.content} for m in req.messages],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json=payload,
        )

    if res.status_code != 200:
        detail = res.json().get("error", {}).get("message", "Groq API error")
        raise HTTPException(res.status_code, detail)

    reply = res.json()["choices"][0]["message"]["content"]
    return {"reply": reply}

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
def test_root_200(client):                assert client.get("/").status_code == 200
def test_root_has_status(client):         assert "status" in client.get("/").json()
def test_root_shows_prophet(client):      assert "prophet_model_loaded" in client.get("/").json()
def test_root_shows_groq(client):         assert "groq_configured" in client.get("/").json()
def test_health_200(client):              assert client.get("/health").status_code == 200
def test_health_rf_loaded(client):        assert client.get("/health").json()["models"]["random_forest"] is True
def test_health_gb_loaded(client):        assert client.get("/health").json()["models"]["gradient_boosting"] is True
def test_health_prophet_loaded(client):   assert client.get("/health").json()["models"]["prophet"] is True
def test_health_has_files(client):        assert "files" in client.get("/health").json()
def test_health_has_chat(client):         assert "chat" in client.get("/health").json()

# ── Predict RF ────────────────────────────────────────────────────────────────
def test_predict_rf_200(client, flight):  assert client.post("/predict?model=rf", json=flight).status_code == 200
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
    assert body["input"]["carrier"] == "AA" and body["input"]["airport"] == "ATL"

# ── Predict GB ────────────────────────────────────────────────────────────────
def test_predict_gb_200(client, flight):  assert client.post("/predict?model=gb", json=flight).status_code == 200
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
def test_batch_200(client, batch):        assert client.post("/predict/batch?model=rf", json=batch).status_code == 200
def test_batch_count(client, batch):      assert client.post("/predict/batch?model=rf", json=batch).json()["count"] == 2
def test_batch_has_risk_level(client, batch):
    for r in client.post("/predict/batch?model=rf", json=batch).json()["results"]:
        assert "risk_level" in r

# ── Compare ───────────────────────────────────────────────────────────────────
def test_compare_200(client, flight):     assert client.post("/predict/compare", json=flight).status_code == 200
def test_compare_has_both(client, flight):
    body = client.post("/predict/compare", json=flight).json()
    assert "random_forest" in body and "gradient_boosting" in body
def test_compare_has_agreement(client, flight):
    body = client.post("/predict/compare", json=flight).json()
    assert "agreement" in body and body["difference"] >= 0

# ── Model info ────────────────────────────────────────────────────────────────
def test_model_info_200(client):          assert client.get("/model/info").status_code == 200
def test_model_info_rf_gb(client):
    body = client.get("/model/info").json()
    assert "random_forest" in body and "gradient_boosting" in body
def test_model_info_cv_r2(client):
    assert 0 <= client.get("/model/info").json()["random_forest"]["best_cv_r2"] <= 1

# ── CV results ────────────────────────────────────────────────────────────────
def test_cv_rf_200(client):               assert client.get("/model/cv-results?model=rf").status_code == 200
def test_cv_gb_200(client):               assert client.get("/model/cv-results?model=gb").status_code == 200
def test_cv_is_list(client):
    r = client.get("/model/cv-results?model=rf").json()
    assert isinstance(r["results"], list) and len(r["results"]) > 0

# ── Feature importance ────────────────────────────────────────────────────────
def test_feat_imp_200(client):            assert client.get("/model/feature-importance").status_code == 200
def test_feat_imp_top15(client):          assert len(client.get("/model/feature-importance").json()["features"]) <= 15
def test_feat_imp_top5(client):           assert len(client.get("/model/feature-importance?top_n=5").json()["features"]) <= 5

# ── Explain ───────────────────────────────────────────────────────────────────
def test_explain_200(client, flight):     assert client.post("/explain", json=flight).status_code == 200
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
def test_forecast_200(client):            assert client.get("/forecast").status_code == 200
def test_forecast_12_periods(client):
    r = client.get("/forecast").json()
    assert r["forecast_periods"] == 12 and len(r["forecast"]) == 12
def test_forecast_6_periods(client):      assert len(client.get("/forecast?periods=6").json()["forecast"]) == 6
def test_forecast_has_source(client):     assert "source" in client.get("/forecast").json()
def test_forecast_rows_complete(client):
    for row in client.get("/forecast").json()["forecast"]:
        assert "ds" in row and "yhat" in row and "yhat_lower" in row and "yhat_upper" in row
def test_forecast_bounds_valid(client):
    for row in client.get("/forecast").json()["forecast"]:
        assert row["yhat_lower"] <= row["yhat"] <= row["yhat_upper"]
def test_forecast_ds_format(client):
    import re
    for row in client.get("/forecast").json()["forecast"]:
        assert re.match(r"\d{4}-\d{2}", row["ds"])

# ── Stats ─────────────────────────────────────────────────────────────────────
def test_stats_200(client):               assert client.get("/stats").status_code == 200
def test_stats_sections(client):
    body = client.get("/stats").json()
    assert "dataset" in body and "delay_causes_pct" in body and "insights" in body
def test_stats_rows_positive(client):     assert client.get("/stats").json()["dataset"]["rows"] > 0
def test_stats_causes_sum_100(client):
    causes = client.get("/stats").json()["delay_causes_pct"]
    assert abs(sum(causes.values()) - 100.0) < 1.0
def test_stats_carriers(client):
    ins = client.get("/stats").json()["insights"]
    assert "worst_carrier" in ins and "best_carrier" in ins
def test_stats_avg_ratio(client):
    assert 0 <= client.get("/stats").json()["insights"]["avg_delay_ratio"] <= 1

# ── Statistics ────────────────────────────────────────────────────────────────
def test_statistics_200(client):          assert client.get("/statistics").status_code == 200
def test_statistics_kpis(client):         assert "kpis" in client.get("/statistics").json()

# ── Chat ──────────────────────────────────────────────────────────────────────
def test_chat_missing_key(client):
    original = os.environ.pop("GROQ_API_KEY", None)
    res = client.post("/chat", json={"messages": [{"role": "user", "content": "hello"}]})
    assert res.status_code in [200, 503]
    if original:
        os.environ["GROQ_API_KEY"] = original