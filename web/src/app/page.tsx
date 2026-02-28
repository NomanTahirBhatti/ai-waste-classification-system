"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Prob = { label: string; probability: number };

type PredictResponse = {
  predicted_class: string;
  confidence: number;
  all_probabilities: Prob[];
  error?: string;
};

type PerClass = {
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

type MetricsResponse = {
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
  precision_weighted: number;
  recall_weighted: number;
  f1_weighted: number;
  num_test_samples: number;
  per_class: Record<string, PerClass>;
  confusion_matrix_file: string;
  error?: string;
};

const API_BASE = "http://127.0.0.1:8000";

export default function HomePage() {
  // ---------- Prediction state ----------
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------- Camera state ----------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // ---------- Metrics state ----------
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const top3 = useMemo(() => {
    if (!result?.all_probabilities?.length) return [];
    return result.all_probabilities.slice(0, 3);
  }, [result]);

  const perClassRows = useMemo(() => {
    if (!metrics?.per_class) return [];
    return Object.entries(metrics.per_class).map(([name, v]) => ({
      name,
      ...v,
    }));
  }, [metrics]);

  // Fetch metrics once
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/metrics`);
        const data = (await res.json()) as any;
        if (!res.ok) {
          setMetricsError(data?.error || "Failed to load metrics.");
          return;
        }
        setMetrics(data as MetricsResponse);
      } catch (e: any) {
        setMetricsError(e?.message || "Failed to load metrics.");
      }
    };
    run();
  }, []);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  const resetPrediction = () => {
    setResult(null);
    setError(null);
  };
  useEffect(() => {
  const attach = async () => {
    if (!cameraOpen || !stream || !videoRef.current) return;

    try {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (e: any) {
      setCameraError(e?.message || "Failed to start video preview.");
    }
  };

  attach();
}, [cameraOpen, stream]);

  const setPreviewFromFile = (f: File | null) => {
    resetPrediction();
    setFile(f);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const onPickFile = (f: File | null) => {
    setCameraError(null);
    setCameraOpen(false);
    stopCamera();
    setPreviewFromFile(f);
  };

  // ---------- Camera helpers ----------
const startCamera = async () => {
  setCameraError(null);
  resetPrediction();

  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    setStream(s);
    setCameraOpen(true);
  } catch (e: any) {
    setCameraOpen(false);
    setStream(null);
    setCameraError(
      e?.message ||
        "Camera permission denied or camera not available in this browser."
    );
  }
};

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setStream(null);
    setCameraOpen(false);
  };

  const captureFromCamera = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    // Convert canvas -> Blob -> File
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );

    if (!blob) {
      setCameraError("Failed to capture image.");
      return;
    }

    const capturedFile = new File([blob], "captured.jpg", {
      type: "image/jpeg",
    });

    // Stop camera after capture (optional, cleaner UX)
    stopCamera();
    setCameraError(null);

    setPreviewFromFile(capturedFile);
  };

  // ---------- Predict ----------
  const onSubmit = async () => {
    if (!file) {
      setError("Please select or capture an image first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        body: form,
      });

      const data = (await res.json()) as any;

      if (!res.ok) {
        setError(data?.error || "Prediction failed.");
        return;
      }

      setResult(data as PredictResponse);
    } catch (e: any) {
      setError(e?.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold">
            AI Waste Classifier (Prototype)
          </h1>
          <p className="text-sm text-gray-600">
            Upload or capture an image → model predicts the waste category.
          </p>
          <p className="text-xs text-gray-500">API: {API_BASE}</p>
        </header>

        {/* Prediction */}
        <section className="rounded-2xl border p-5 space-y-4 shadow-sm">
          <div className="space-y-2">
            <div className="font-medium">1) Image Input</div>
            <div className="text-sm text-gray-600">
              Choose one option: Upload OR Capture from camera.
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="block w-full md:w-auto text-sm"
            />

            <div className="flex gap-2">
              {!cameraOpen ? (
                <button
                  onClick={startCamera}
                  className="rounded-xl px-4 py-2 text-sm font-medium border shadow-sm hover:bg-gray-50"
                >
                  Open Camera
                </button>
              ) : (
                <>
                  <button
                    onClick={captureFromCamera}
                    className="rounded-xl px-4 py-2 text-sm font-medium border shadow-sm hover:bg-gray-50"
                  >
                    Capture
                  </button>
                  <button
                    onClick={stopCamera}
                    className="rounded-xl px-4 py-2 text-sm font-medium border shadow-sm hover:bg-gray-50"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>

          {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}

          {cameraOpen && (
            <div className="rounded-xl border p-3 space-y-2">
              <div className="text-sm text-gray-600">Camera Preview</div>
           <video
  ref={videoRef}
  autoPlay
  playsInline
  muted
  className="w-full max-w-3xl mx-auto rounded-lg border"
/>
              {/* Hidden canvas used for capture */}
              <canvas ref={canvasRef} className="hidden" />
              <p className="text-xs text-gray-500">
                Tip: If you’re on a laptop, it may use the front camera. On a
                phone, it will try the back camera.
              </p>
            </div>
          )}

          {previewUrl && (
            <div className="rounded-xl border p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-[380px] w-auto mx-auto rounded-lg"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onSubmit}
              disabled={loading || !file}
              className="rounded-xl px-5 py-2 text-sm font-medium border shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Predicting..." : "Predict"}
            </button>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {result && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-xl border p-4">
                <div className="text-sm text-gray-600">Predicted Category</div>
                <div className="text-xl font-semibold">
                  {result.predicted_class}
                </div>
                <div className="text-sm text-gray-600">
                  Confidence: {(result.confidence * 100).toFixed(2)}%
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm text-gray-600 mb-2">Top 3</div>
                <ul className="space-y-1 text-sm">
                  {top3.map((p) => (
                    <li key={p.label} className="flex justify-between">
                      <span>{p.label}</span>
                      <span>{(p.probability * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Metrics */}
        <section className="rounded-2xl border p-5 shadow-sm space-y-4">
          <div className="font-medium">2) Model Evaluation Results</div>

          {metricsError && (
            <p className="text-sm text-red-600">{metricsError}</p>
          )}

          {!metrics && !metricsError && (
            <p className="text-sm text-gray-600">Loading metrics...</p>
          )}

          {metrics && (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-gray-600">Accuracy</div>
                  <div className="text-xl font-semibold">
                    {(metrics.accuracy * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    Test samples: {metrics.num_test_samples}
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-sm text-gray-600">Macro Avg (P/R/F1)</div>
                  <div className="text-sm">
                    P: {(metrics.precision_macro * 100).toFixed(2)}% <br />
                    R: {(metrics.recall_macro * 100).toFixed(2)}% <br />
                    F1: {(metrics.f1_macro * 100).toFixed(2)}%
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="text-sm text-gray-600">
                    Weighted Avg (P/R/F1)
                  </div>
                  <div className="text-sm">
                    P: {(metrics.precision_weighted * 100).toFixed(2)}% <br />
                    R: {(metrics.recall_weighted * 100).toFixed(2)}% <br />
                    F1: {(metrics.f1_weighted * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="text-sm font-medium mb-3">
                  Confusion Matrix
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}/confusion-matrix`}
                  alt="Confusion Matrix"
                  className="w-full max-w-3xl mx-auto rounded-lg border"
                />
              </div>

              <div className="rounded-2xl border p-4 overflow-auto">
                <div className="text-sm font-medium mb-3">Per-Class Metrics</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3">Class</th>
                      <th className="py-2 pr-3">Precision</th>
                      <th className="py-2 pr-3">Recall</th>
                      <th className="py-2 pr-3">F1</th>
                      <th className="py-2 pr-3">Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perClassRows.map((r) => (
                      <tr key={r.name} className="border-b">
                        <td className="py-2 pr-3 font-medium">{r.name}</td>
                        <td className="py-2 pr-3">
                          {(r.precision * 100).toFixed(2)}%
                        </td>
                        <td className="py-2 pr-3">
                          {(r.recall * 100).toFixed(2)}%
                        </td>
                        <td className="py-2 pr-3">
                          {(r.f1 * 100).toFixed(2)}%
                        </td>
                        <td className="py-2 pr-3">{r.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}