# AI-Based Smart Waste Management & Classification System (Prototype)

This repository contains a working prototype for an AI-based waste image classification system:
- **Frontend (Next.js)**: Upload **or capture (camera)** an image and view prediction results.
- **Backend (FastAPI)**: Loads a TensorFlow **SavedModel** and exposes prediction + evaluation endpoints.
- **Evaluation**: Generates **Accuracy, Precision, Recall, F1-score** and a **Confusion Matrix**.

---

## Project Structure (Fixed)

```
ai-waste-classification-system/
├─ api/                         # FastAPI backend (Python)
│  ├─ main.py                   # API: /health, /predict, /metrics, /confusion-matrix
│  ├─ evaluate.py               # Evaluation script (metrics + confusion matrix)
│  └─ requirements.txt          # Python dependencies
├─ web/                         # Next.js frontend (React)
│  ├─ package.json
│  ├─ next.config.*             # if present
│  ├─ public/
│  └─ src/
│     └─ app/
│        ├─ layout.tsx
│        └─ page.tsx            # UI: upload + camera capture + results
├─ model/
│  └─ waste_savedmodel/         # TensorFlow SavedModel (tracked via Git LFS)
├─ data/
│  └─ test/                     # Optional: test images for evaluation (not required for running API)
│     ├─ Cardboard/
│     ├─ Glass/
│     ├─ Metal/
│     ├─ Paper/
│     ├─ Plastic/
│     ├─ Trash/
│     └─ Organic/
├─ outputs/
│  ├─ metrics.json              # Produced by evaluate.py
│  └─ confusion_matrix.png      # Produced by evaluate.py
├─ .gitattributes               # Git LFS tracking rules (model files)
├─ .gitignore                   # ignores node_modules, .venv, .next, etc.
└─ README.md
```

> Note: `node_modules/`, `.next/`, and `.venv/` must **NOT** be committed or submitted in the ZIP.

---

## Requirements

- **Windows 10/11**
- **Python 3.11.x** (recommended for TensorFlow on Windows)
- **Node.js 18+**
- **Yarn**

---

## Clone (with Model via Git LFS)

This repo stores the model using **Git LFS**.

1) Install Git LFS (one-time):  
   https://git-lfs.github.com/

2) In a terminal:
```bash
git lfs install
git clone https://github.com/NomanTahirBhatti/ai-waste-classification-system.git
cd ai-waste-classification-system
git lfs pull
```

---

## Backend (FastAPI) Setup & Run

Open PowerShell in the repo root.

### 1) Create venv (inside `api/`)
```powershell
cd api
py -3.11 -m venv .venv
```

### 2) Activate venv
```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 3) Install dependencies
```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4) Run API
```powershell
uvicorn main:app --reload
```

API runs at: **http://127.0.0.1:8000**

### API Endpoints
- `GET /health`
- `POST /predict` (multipart form-data with `file`)
- `GET /metrics`
- `GET /confusion-matrix`

---

## Frontend (Next.js) Setup & Run

Open a **new** terminal in repo root:

```powershell
cd web
yarn install
yarn dev
```

Frontend runs at: **http://localhost:3000**

---

## Model Evaluation (Optional)

If you want to regenerate metrics and confusion matrix:

1) Place test dataset here:
```
data/test/
  Cardboard/
  Glass/
  Metal/
  Paper/
  Plastic/
  Trash/
  Organic/
```

2) Run:
```powershell
cd api
.\.venv\Scripts\Activate.ps1
python evaluate.py
```

3) Outputs created:
- `outputs/metrics.json`
- `outputs/confusion_matrix.png`

---

## Troubleshooting (Common Errors & Fixes)

### A) PowerShell `mkdir ... cd ...` error
PowerShell does **not** allow multiple commands in one `mkdir` line like Bash.
Use separate lines:
```powershell
mkdir aiwaste-prototype
cd aiwaste-prototype
```

### B) `tensorflow` install fails / “No matching distribution found”
Install and use **Python 3.11** (not 3.14). Then:
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### C) `unicorn` not found
Command is **uvicorn**, not unicorn:
```powershell
uvicorn main:app --reload
```

### D) `curl -F` fails in PowerShell
PowerShell aliases `curl` to `Invoke-WebRequest`. Use one of these:

**Option 1 (Git Bash):**
```bash
curl -F "file=@/c/Users/nomi9/Downloads/meta.jpg" http://127.0.0.1:8000/predict
```

**Option 2 (PowerShell using curl.exe):**
```powershell
curl.exe -F "file=@C:\Users\nomi9\Downloads\meta.jpg" http://127.0.0.1:8000/predict
```

### E) Model not loading (`model_loaded:false`)
Ensure this folder exists:
```
model/waste_savedmodel/
```
If you cloned without LFS, run:
```bash
git lfs pull
```

### F) Keras/H5 load error: `Unrecognized keyword arguments: ['batch_shape']`
This happens when a `.h5`/`.keras` file was saved with a different Keras/TensorFlow version.
This prototype uses **SavedModel** for inference (`model/waste_savedmodel/`), which avoids that issue.

### G) Web folder appears as submodule / “in unpopulated submodule 'web'”
That means `web` was accidentally committed as a submodule.
Fix: remove the submodule reference and re-add `web` as a normal folder (already resolved in this repo).

### H) Deleted `.git` folder by mistake
Re-clone the repository and copy your changes into the fresh clone. Then commit/push normally.
```bash
git clone https://github.com/NomanTahirBhatti/ai-waste-classification-system.git
```

---

## Submission ZIP (Recommended)

For university submission, create a clean zip **excluding**:
- `web/node_modules`
- `web/.next`
- `api/.venv`
- `.git`

Keep:
- `api/` (source)
- `web/` (source)
- `model/waste_savedmodel/` (model)
- `outputs/`
- `README.md`
- Prototype Report (PDF/DOCX)

---

## Notes
- The model expects images resized to **224×224** and normalized to **[0,1]**.
- Output classes (7): Cardboard, Glass, Metal, Paper, Plastic, Trash, Organic.
