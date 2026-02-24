# AI-Based Smart Waste Management & Classification System (Prototype)

This repository contains the working prototype for an AI-based waste
image classification system.

## Features

-   Web UI (Next.js): Upload an image and get predicted waste category +
    confidence.
-   Backend API (FastAPI): Serves prediction endpoint using a TensorFlow
    SavedModel.
-   Model Evaluation: Generates Accuracy, Precision, Recall, F1-score
    and a Confusion Matrix image.

------------------------------------------------------------------------

## Project Structure

aiwaste-prototype/ │ ├── api/ \# FastAPI backend │ ├── main.py │ ├──
evaluate.py │ └── requirements.txt │ ├── web/ \# Next.js frontend │ ├──
model/ │ └── waste_savedmodel/ \# TensorFlow SavedModel │ ├── data/ │
└── test/ \# Test dataset (class folders with images) │ ├── outputs/ │
├── metrics.json │ └── confusion_matrix.png │ └── README.md

------------------------------------------------------------------------

## Requirements

-   Python 3.11.x
-   Node.js 18+
-   Yarn

------------------------------------------------------------------------

## Backend Setup

1)  Create virtual environment:

    py -3.11 -m venv .venv .venv`\Scripts`{=tex}`\activate`{=tex}

2)  Install dependencies:

    pip install -r requirements.txt

3)  Run API:

    uvicorn main:app --reload

API will run at: http://127.0.0.1:8000

Test endpoints: - /health - /predict - /metrics - /confusion-matrix

------------------------------------------------------------------------

## Frontend Setup

1)  Navigate to web folder:

    cd web

2)  Install dependencies:

    yarn install

3)  Run development server:

    yarn dev

Open: http://localhost:3000

------------------------------------------------------------------------

## Model Evaluation

Place test dataset inside:

data/test/ Cardboard/ Glass/ Metal/ Paper/ Plastic/ Trash/ Organic/

Run:

    python evaluate.py

Generated outputs: - outputs/metrics.json - outputs/confusion_matrix.png

------------------------------------------------------------------------

## Notes

-   The model is loaded from model/waste_savedmodel using TensorFlow
    SavedModel format.
-   If retraining the model, replace the waste_savedmodel folder.
-   Do not upload .venv or node_modules to GitHub.

## Model Storage (Git LFS)

The trained TensorFlow model is stored using Git Large File Storage (Git LFS).

To clone this repository with the model files:

1. Install Git LFS:
   https://git-lfs.github.com/

2. Run:
   git lfs install

3. Clone the repository:
   git clone https://github.com/NomanTahirBhatti/ai-waste-classification-system.git

The model will automatically download during clone.

Model location:
model/waste_savedmodel/