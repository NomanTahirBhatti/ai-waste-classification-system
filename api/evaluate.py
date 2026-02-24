from __future__ import annotations

import json
from pathlib import Path
from typing import List

import numpy as np
from PIL import Image
import tensorflow as tf

from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import matplotlib.pyplot as plt


IMG_SIZE = (224, 224)

CLASS_NAMES = [
    "Cardboard",
    "Glass",
    "Metal",
    "Paper",
    "Plastic",
    "Trash",
    "Organic",
]

TEST_DIR = Path(r"F:\FYP\aiwaste-prototype\data\test")
MODEL_DIR = Path(r"F:\FYP\aiwaste-prototype\model\waste_savedmodel")
OUTPUT_DIR = Path(r"F:\FYP\aiwaste-prototype\outputs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_savedmodel_infer(model_dir: Path):
    sm = tf.saved_model.load(str(model_dir))
    infer = sm.signatures["serving_default"]

    in_keys = list(infer.structured_input_signature[1].keys())
    out_keys = list(infer.structured_outputs.keys())

    return infer, in_keys[0], out_keys[0]


def preprocess(img_path: Path) -> np.ndarray:
    img = Image.open(img_path).convert("RGB").resize(IMG_SIZE)
    x = np.array(img).astype(np.float32) / 255.0
    return np.expand_dims(x, axis=0)


def main():
    infer, in_key, out_key = load_savedmodel_infer(MODEL_DIR)

    y_true: List[int] = []
    y_pred: List[int] = []

    for class_idx, class_name in enumerate(CLASS_NAMES):
        class_folder = TEST_DIR / class_name
        if not class_folder.exists():
            continue

        for p in class_folder.iterdir():
            if p.suffix.lower() not in [".jpg", ".jpeg", ".png", ".bmp", ".webp"]:
                continue

            x = preprocess(p)
            out = infer(**{in_key: tf.constant(x, dtype=tf.float32)})[out_key].numpy()[0]
            pred_idx = int(np.argmax(out))

            y_true.append(class_idx)
            y_pred.append(pred_idx)

    acc = float(accuracy_score(y_true, y_pred))
    report = classification_report(
        y_true,
        y_pred,
        target_names=CLASS_NAMES,
        output_dict=True,
        zero_division=0,
    )

    cm = confusion_matrix(y_true, y_pred)

    # Save confusion matrix image
    plt.figure()
    plt.imshow(cm)
    plt.title("Confusion Matrix")
    plt.xlabel("Predicted")
    plt.ylabel("True")
    plt.xticks(range(len(CLASS_NAMES)), CLASS_NAMES, rotation=45, ha="right")
    plt.yticks(range(len(CLASS_NAMES)), CLASS_NAMES)
    plt.tight_layout()
    cm_path = OUTPUT_DIR / "confusion_matrix.png"
    plt.savefig(cm_path, dpi=200)
    plt.close()

    metrics = {
        "accuracy": acc,
        "precision_macro": float(report["macro avg"]["precision"]),
        "recall_macro": float(report["macro avg"]["recall"]),
        "f1_macro": float(report["macro avg"]["f1-score"]),
        "precision_weighted": float(report["weighted avg"]["precision"]),
        "recall_weighted": float(report["weighted avg"]["recall"]),
        "f1_weighted": float(report["weighted avg"]["f1-score"]),
        "num_test_samples": len(y_true),
        "per_class": {
            name: {
                "precision": float(report[name]["precision"]),
                "recall": float(report[name]["recall"]),
                "f1": float(report[name]["f1-score"]),
                "support": int(report[name]["support"]),
            }
            for name in CLASS_NAMES
            if name in report
        },
        "confusion_matrix_file": str(cm_path.name),
    }

    metrics_path = OUTPUT_DIR / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print("✅ Evaluation complete")
    print(f"Accuracy: {acc:.4f}")
    print(f"Saved metrics: {metrics_path}")
    print(f"Saved confusion matrix: {cm_path}")


if __name__ == "__main__":
    main()