from __future__ import annotations

import io
import os
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tensorflow as tf
import json
from fastapi.responses import FileResponse

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

# Input image size used during model training
IMG_SIZE = (224, 224)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_IMAGE_PIXELS = 20_000_000
CHUNK_SIZE = 1024 * 1024

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

# Waste categories (must match training dataset folder names)
CLASS_NAMES = [
    "Cardboard",
    "Glass",
    "Metal",
    "Paper",
    "Plastic",
    "Trash",
    "Organic",
]

# Path to trained model (TensorFlow SavedModel directory)
MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "model", "waste_savedmodel"
)


# ---------------------------------------------------------
# FastAPI Application Initialization
# ---------------------------------------------------------

app = FastAPI(
    title="AI-Based Smart Waste Classification API",
    version="1.0"
)

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SavedModel runtime objects
saved_model = None
infer = None
infer_input_key: Optional[str] = None
infer_output_key: Optional[str] = None


class RequestValidationError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


# ---------------------------------------------------------
# Model Loading at Startup
# ---------------------------------------------------------

@app.on_event("startup")
def startup_load_model() -> None:
    """
    Load TensorFlow SavedModel and prepare an inference function.
    """
    global saved_model, infer, infer_input_key, infer_output_key

    print(f"[INFO] Expected model path: {MODEL_PATH}")
    print(f"[INFO] Exists? {os.path.exists(MODEL_PATH)}")

    if not os.path.exists(MODEL_PATH):
        print(f"[WARNING] Model folder not found at: {MODEL_PATH}")
        saved_model = None
        infer = None
        infer_input_key = None
        infer_output_key = None
        return

    try:
        print(f"[INFO] Loading SavedModel from: {MODEL_PATH}")
        saved_model = tf.saved_model.load(MODEL_PATH)

        # Use the default serving signature
        infer = saved_model.signatures["serving_default"]

        # Detect input/output tensor keys dynamically
        input_keys = list(infer.structured_input_signature[1].keys())
        output_keys = list(infer.structured_outputs.keys())

        infer_input_key = input_keys[0] if input_keys else None
        infer_output_key = output_keys[0] if output_keys else None

        print("[INFO] Inference signature loaded successfully.")
        print(f"[INFO] Input key: {infer_input_key}")
        print(f"[INFO] Output key: {infer_output_key}")

    except Exception as e:
        print(f"[ERROR] Model load failed: {e}")
        saved_model = None
        infer = None
        infer_input_key = None
        infer_output_key = None


# ---------------------------------------------------------
# Image Preprocessing
# ---------------------------------------------------------

def preprocess_image(file_bytes: bytes) -> np.ndarray:
    """
    Convert uploaded image bytes into a normalized NumPy array
    compatible with the trained CNN model.
    """
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            width, height = img.size
            if width <= 0 or height <= 0:
                raise RequestValidationError(400, "Invalid image dimensions.")

            if width * height > MAX_IMAGE_PIXELS:
                raise RequestValidationError(
                    413,
                    "Image resolution is too large. Use a lower-resolution image.",
                )

            img = img.convert("RGB")
            img = img.resize(IMG_SIZE)

            img_array = np.array(img).astype(np.float32) / 255.0
            img_array = np.expand_dims(img_array, axis=0)

            return img_array
    except RequestValidationError:
        raise
    except Image.DecompressionBombError:
        raise RequestValidationError(
            413,
            "Image is too large to process safely.",
        )
    except UnidentifiedImageError:
        raise RequestValidationError(
            400,
            "Invalid or unsupported image file.",
        )
    except OSError:
        raise RequestValidationError(
            400,
            "Invalid or corrupted image file.",
        )


async def read_limited_upload(file: UploadFile, max_bytes: int) -> bytes:
    """
    Read upload stream in chunks and stop early when the file exceeds max_bytes.
    """
    total_size = 0
    chunks: List[bytes] = []

    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break

        total_size += len(chunk)
        if total_size > max_bytes:
            raise RequestValidationError(
                413,
                f"Uploaded file is too large. Maximum size is {max_bytes // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)

    if total_size == 0:
        raise RequestValidationError(400, "Uploaded file is empty.")

    return b"".join(chunks)


# ---------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------

@app.get("/health")
def health() -> Dict[str, Any]:
    """
    Returns API and model status information.
    """
    return {
        "status": "running",
        "model_loaded": infer is not None,
        "model_path": os.path.abspath(MODEL_PATH),
        "classes": CLASS_NAMES,
        "input_image_size": IMG_SIZE,
    }


# ---------------------------------------------------------
# Prediction Endpoint
# ---------------------------------------------------------

@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> JSONResponse:
    """
    Accepts an uploaded image and returns predicted waste category
    along with confidence scores.
    """
    global infer, infer_input_key, infer_output_key

    if infer is None or infer_input_key is None or infer_output_key is None:
        return JSONResponse(
            status_code=500,
            content={"error": "Model inference function not available."},
        )

    try:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise RequestValidationError(
                400,
                "Only image files are allowed.",
            )

        file_bytes = await read_limited_upload(file, MAX_UPLOAD_BYTES)
        processed_image = preprocess_image(file_bytes)

        # Run inference via SavedModel signature
        x_tf = tf.constant(processed_image, dtype=tf.float32)
        outputs = infer(**{infer_input_key: x_tf})

        predictions = outputs[infer_output_key].numpy()[0].astype(float)

        top_index = int(np.argmax(predictions))
        predicted_label = (
            CLASS_NAMES[top_index]
            if top_index < len(CLASS_NAMES)
            else str(top_index)
        )
        confidence_score = float(predictions[top_index])

        probability_list: List[Dict[str, Any]] = []
        for i, probability in enumerate(predictions.tolist()):
            label_name = CLASS_NAMES[i] if i < len(CLASS_NAMES) else str(i)
            probability_list.append(
                {"label": label_name, "probability": float(probability)}
            )

        probability_list.sort(
            key=lambda item: item["probability"],
            reverse=True
        )

        return JSONResponse(
            content={
                "predicted_class": predicted_label,
                "confidence": confidence_score,
                "all_probabilities": probability_list,
            }
        )
    except RequestValidationError as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"error": e.message},
        )

    except Exception as e:
        print(f"[ERROR] Inference failed: {e}")
        return JSONResponse(
            status_code=400,
            content={"error": "Inference failed."},
        )



OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "outputs")
METRICS_PATH = os.path.join(OUTPUT_DIR, "metrics.json")
CM_PATH = os.path.join(OUTPUT_DIR, "confusion_matrix.png")

@app.get("/metrics")
def get_metrics() -> JSONResponse:
    """
    Returns evaluation metrics generated by evaluate.py.
    """
    if not os.path.exists(METRICS_PATH):
        return JSONResponse(
            status_code=404,
            content={"error": "metrics.json not found. Run evaluate.py first."},
        )

    with open(METRICS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    return JSONResponse(content=data)


@app.get("/confusion-matrix")
def get_confusion_matrix():
    """
    Returns the confusion matrix image generated by evaluate.py.
    """
    if not os.path.exists(CM_PATH):
        return JSONResponse(
            status_code=404,
            content={"error": "confusion_matrix.png not found. Run evaluate.py first."},
        )

    return FileResponse(CM_PATH, media_type="image/png")
