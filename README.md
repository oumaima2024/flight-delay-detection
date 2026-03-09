# ✈️ FlightDelay AI Platform

A full-stack machine learning platform for analyzing and predicting US airline flight delays — built with FastAPI, React, and powered by Random Forest, Gradient Boosting, and Prophet models.

---

## 📸 Preview

> Dashboard with real-time predictions, SHAP explanations, Prophet forecasts, and an AI chatbot powered by Groq (free).

---

## 🚀 Features

- **Delay Prediction** — Single flight delay prediction using Random Forest or Gradient Boosting
- **Batch Prediction** — Predict delays for multiple flights at once
- **Model Comparison** — Side-by-side RF vs GB predictions
- **SHAP Explainability** — Feature-level explanation of why a prediction was made
- **Prophet Forecast** — Time-series forecast of nationwide monthly delays
- **Statistics Dashboard** — KPIs, carrier rankings, airport rankings, delay cause breakdowns, monthly/yearly trends
- **AI Chatbot** — Intelligent assistant with live access to your dataset and model predictions (powered by Groq — free)
- **Model Info** — Hyperparameters, CV R² scores, feature importances, cross-validation results

---

## 🗂️ Project Structure

```
FLIGHT-DELAY-DETECTION/
├── backend/
│   ├── main.py                  # FastAPI app — all endpoints + chat
│   ├── .env                     # GROQ_API_KEY (never commit this)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── api/
│   │   │   ├── client.js
│   │   │   └── endpoints.js
│   │   ├── components/
│   │   │   ├── Chatbot.jsx      # AI assistant (calls /chat on backend)
│   │   │   ├── Sidebar.jsx
│   │   │   ├── TopBar.jsx
│   │   │   ├── FlightForm.jsx
│   │   │   ├── RiskBadge.jsx
│   │   │   ├── Spinner.jsx
│   │   │   └── ErrorBox.jsx
│   │   └── pages/
│   │       ├── Statistics.jsx
│   │       ├── Predict.jsx
│   │       ├── Batch.jsx
│   │       ├── Compare.jsx
│   │       ├── Explain.jsx
│   │       ├── Forecast.jsx
│   │       └── Model.jsx
│   ├── .env                     # VITE_API_URL (never commit this)
│   └── package.json
├── models/                      # Saved .pkl model files
│   ├── rf_best_model.pkl
│   ├── gb_best_model.pkl
│   ├── rf_randomsearch.pkl
│   ├── gb_randomsearch.pkl
│   ├── prophet_model.pkl
│   ├── prophet_forecast.csv
│   └── df.pkl
├── data/
│   └── Airline_Delay_Cause.csv
├── airline_delay_analysis.ipynb # Training notebook
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, Python |
| ML Models | scikit-learn (Random Forest, Gradient Boosting) |
| Forecasting | Prophet |
| Explainability | SHAP |
| AI Chatbot | Groq API — `llama-3.3-70b-versatile` (free) |
| Frontend | React + Vite |
| Charts | Recharts |
| HTTP Client | Axios |
| Styling | Custom CSS with design tokens |

---

## ⚙️ Setup & Installation

### Prerequisites

- Python 3.9+
- Node.js 18+
- A free Groq API key from [console.groq.com](https://console.groq.com)

---

### 1. Clone the repository

```bash
git clone https://github.com/oumaima2024/flight-delay-detection.git
cd flight-delay-detection
```

---

### 2. Backend Setup

```bash
# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# Mac / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GROQ_API_KEY=gsk_your_key_here
```

Get your free key at [console.groq.com](https://console.groq.com) → API Keys → Create Key.

Start the backend:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

API docs available at: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000
```

Start the frontend:
```bash
npm run dev
```

App available at: [http://localhost:5173](http://localhost:5173)

---

### 4. Train the Models (optional)

If you don't have the `.pkl` files yet, run the notebook:

```bash
jupyter notebook airline_delay_analysis.ipynb
```

At the end of the notebook, save the models:

```python
import joblib

joblib.dump(rf_best_model,   "models/rf_best_model.pkl")
joblib.dump(gb_best_model,   "models/gb_best_model.pkl")
joblib.dump(rf_randomsearch, "models/rf_randomsearch.pkl")
joblib.dump(gb_randomsearch, "models/gb_randomsearch.pkl")
joblib.dump(prophet_model,   "models/prophet_model.pkl")
joblib.dump(df,              "models/df.pkl")

forecast_df.to_csv("models/prophet_forecast.csv", index=False)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/health` | Model load status |
| POST | `/predict?model=rf\|gb` | Single flight prediction |
| POST | `/predict/batch` | Batch predictions |
| POST | `/predict/compare` | RF vs GB comparison |
| POST | `/explain` | SHAP feature explanation |
| GET | `/forecast?periods=12` | Prophet forecast |
| GET | `/statistics` | Full KPIs and rankings |
| GET | `/stats` | Summary statistics |
| GET | `/model/info` | Hyperparameters + CV R² |
| GET | `/model/feature-importance` | Top N feature importances |
| GET | `/model/cv-results` | Cross-validation results |
| POST | `/chat` | AI chatbot (Groq) |

---

## 🤖 AI Chatbot

The chatbot is powered by **Groq** (free tier) and has live access to:

- Real dataset statistics (delay rates, carrier rankings, airport rankings)
- RF model predictions per carrier
- Feature importances from the trained models
- Model CV R² scores and hyperparameters
- Seasonal delay patterns

The Groq API key stays on the server — it is never exposed to the browser.

---

## 📊 Dataset

- **Source:** US Bureau of Transportation Statistics (BTS)
- **Period:** 2013–2023
- **Features:** Carrier delays, weather delays, NAS delays, security delays, late aircraft delays, cancellations, diversions
- **Target:** `arr_del15` — number of flights delayed 15+ minutes

### Risk Levels

| Level | Delay Ratio |
|-------|-------------|
| High Risk | > 30% |
| Medium Risk | 15% – 30% |
| Low Risk | < 15% |

---

## 🧪 Running Tests

```bash
cd backend
pytest main.py -v
```

---

## 📁 Environment Variables

| File | Variable | Description |
|------|----------|-------------|
| `backend/.env` | `GROQ_API_KEY` | Free Groq API key |
| `frontend/.env` | `VITE_API_URL` | Backend URL (default: `http://localhost:8000`) |

> ⚠️ Never commit `.env` files. They are listed in `.gitignore`.

---

## 👩‍💻 Author

**Oumaima** — [github.com/oumaima2024](https://github.com/oumaima2024)
