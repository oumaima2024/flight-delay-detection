# Flight Delay Detection — FastAPI ML Backend

Predict, explain, and forecast airline delays using machine learning.

---

## Overview

This project exposes a production-ready REST API built with **FastAPI** that serves multiple ML models trained on the **Airline Delay Cause** dataset (US domestic flights, 2003–2023).

It covers the full ML lifecycle:
- Exploratory Data Analysis & feature engineering
- Multi-model training with hyperparameter tuning (GridSearchCV)
- Model serving via REST API
- SHAP explainability
- Time-series forecasting with Prophet

---

## Features

| Feature | Detail |
|---|---|
| Prediction | Single & batch flight delay prediction |
| Models | Random Forest, Gradient Boosting, LightGBM, CatBoost |
| Comparison | RF vs GB side-by-side with risk level |
| Explainability | SHAP values per prediction |
| Forecasting | Prophet monthly nationwide delay forecast |
| Stats | Dataset insights & delay cause breakdown |
| Tests | 50+ pytest unit tests included |

---

## Project Structure

```
flight-delay-detection/
├── backend/
│   └── main.py          # FastAPI app — all endpoints + tests
├── models/              # Trained model files (not tracked in git)
│   ├── rf_best_model.pkl
│   ├── gb_best_model.pkl
│   ├── rf_randomsearch.pkl
│   ├── gb_randomsearch.pkl
│   ├── lgb_pipeline.pkl
│   ├── catboost_model.cbm
│   ├── stage1_classifier.pkl
│   ├── stage2_regressor.pkl
│   ├── prophet_model.pkl
│   ├── prophet_forecast.csv
│   ├── feature_meta.json
│   └── df.pkl
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/flight-delay-detection.git
cd flight-delay-detection

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# 3. Install dependencies
pip install -r requirements.txt
```

---

## Run the API

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

---

## API Endpoints

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Status + model load info |
| GET | `/health` | Detailed health check |

### Prediction
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/predict?model=rf` | Single prediction (RF or GB) |
| POST | `/predict/batch` | Batch prediction |
| POST | `/predict/compare` | RF vs GB comparison |

### Model
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/model/info` | Best hyperparameters + CV R2 |
| GET | `/model/cv-results` | Full GridSearchCV results |
| GET | `/model/feature-importance` | Top N feature importances |

### Explainability & Forecasting
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/explain` | SHAP values for a prediction |
| GET | `/forecast?periods=12` | Prophet monthly forecast |
| GET | `/stats` | Dataset summary & insights |

---

## Example Request

```bash
curl -X POST "http://localhost:8000/predict?model=rf" \
  -H "Content-Type: application/json" \
  -d '{
    "year": 2023, "month": 7,
    "carrier": "AA",
    "carrier_name": "American Airlines Inc.",
    "airport": "ATL",
    "airport_name": "Atlanta GA: Hartsfield-Jackson Atlanta International",
    "arr_flights": 1500.0, "arr_del15": 0.0,
    "carrier_ct": 120.0, "weather_ct": 30.0,
    "nas_ct": 80.0, "security_ct": 1.0,
    "late_aircraft_ct": 150.0,
    "arr_cancelled": 20.0, "arr_diverted": 5.0
  }'
```

Response:
```json
{
  "model": "RF",
  "predicted_arr_del15": 312.45,
  "delay_ratio": 0.2083,
  "delay_pct": "20.8%",
  "risk_level": "Medium Risk",
  "input": {
    "carrier": "AA",
    "airport": "ATL",
    "month": 7,
    "year": 2023,
    "arr_flights": 1500.0
  }
}
```

---

## Run Tests

```bash
cd backend
pytest main.py -v
```

---

## Tech Stack

- API: FastAPI, Uvicorn, Pydantic
- ML: scikit-learn, LightGBM, CatBoost
- Explainability: SHAP
- Forecasting: Prophet
- Data: pandas, NumPy
- Tracking: MLflow

---

## Key Findings

| Insight | Detail |
|---|---|
| Top delay cause | Late aircraft (~40%) and carrier issues (~36%) |
| Worst months | June-August (summer peak) |
| COVID impact | 2020 sharp drop; 2021 rebound with more carrier delays |
| Best model | Random Forest — R2 = 0.9998 |
| Top features | arr_flights, carrier_ct, late_aircraft_ct |

---

## License

MIT License — free to use and modify.
