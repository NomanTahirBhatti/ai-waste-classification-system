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

type ThemeMode = "light" | "dark";

type CategoryGuide = {
  category: string;
  status: "Recyclable" | "Compostable" | "General Waste" | "Check Local Rules";
  message: string;
  action: string;
  tone: "good" | "warn" | "bad";
};

const API_BASE = "http://127.0.0.1:8000";
const MAX_CLIENT_FILE_BYTES = 5 * 1024 * 1024;
const THEME_STORAGE_KEY = "ecosort-theme";

const CATEGORY_GUIDE: Record<string, CategoryGuide> = {
  Cardboard: {
    category: "Cardboard",
    status: "Recyclable",
    message: "Cardboard is recyclable when it is clean and dry.",
    action: "Flatten boxes and keep them out of wet waste.",
    tone: "good",
  },
  Glass: {
    category: "Glass",
    status: "Recyclable",
    message: "Glass is widely recyclable and can be reprocessed multiple times.",
    action: "Rinse containers and separate by local recycling rules.",
    tone: "good",
  },
  Metal: {
    category: "Metal",
    status: "Recyclable",
    message: "Most metal cans and containers are recyclable.",
    action: "Rinse food residue and place in the recycling stream.",
    tone: "good",
  },
  Paper: {
    category: "Paper",
    status: "Recyclable",
    message: "Paper is recyclable if it is not contaminated by food or oil.",
    action: "Keep paper dry and separate from mixed trash.",
    tone: "good",
  },
  Plastic: {
    category: "Plastic",
    status: "Check Local Rules",
    message: "Some plastics are recyclable, others are not.",
    action: "Check the resin code and your city recycling guidelines.",
    tone: "warn",
  },
  Trash: {
    category: "Trash",
    status: "General Waste",
    message: "This category is typically non-recyclable.",
    action: "Dispose in general waste and avoid mixing with recyclables.",
    tone: "bad",
  },
  Organic: {
    category: "Organic",
    status: "Compostable",
    message: "Organic material is usually suitable for composting.",
    action: "Send to compost collection or a home compost system.",
    tone: "good",
  },
};

function readErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  ) {
    return payload.error;
  }
  return fallback;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getThemeFromSystem(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function HomePage() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const top3 = useMemo(() => {
    if (!result?.all_probabilities?.length) return [];
    return result.all_probabilities.slice(0, 3);
  }, [result]);

  const predictedGuide = useMemo(() => {
    if (!result?.predicted_class) return null;
    return CATEGORY_GUIDE[result.predicted_class] ?? null;
  }, [result]);

  const perClassRows = useMemo(() => {
    if (!metrics?.per_class) return [];
    return Object.entries(metrics.per_class).map(([name, v]) => ({
      name,
      ...v,
    }));
  }, [metrics]);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    setTheme(getThemeFromSystem());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/metrics`);
        const data: unknown = await res.json();
        if (!res.ok) {
          setMetricsError(readErrorMessage(data, "Failed to load metrics."));
          return;
        }
        setMetrics(data as MetricsResponse);
      } catch (e: unknown) {
        setMetricsError(
          e instanceof Error ? e.message : "Failed to load metrics."
        );
      }
    };
    run();
  }, []);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [stream, previewUrl]);

  useEffect(() => {
    const attach = async () => {
      if (!cameraOpen || !stream || !videoRef.current) return;

      try {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (e: unknown) {
        setCameraError(
          e instanceof Error ? e.message : "Failed to start video preview."
        );
      }
    };

    attach();
  }, [cameraOpen, stream]);

  const resetPrediction = () => {
    setResult(null);
    setError(null);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    setStream(null);
    setCameraOpen(false);
  };

  const validateFile = (f: File): string | null => {
    if (!f.type.startsWith("image/")) {
      return "Only image files are allowed.";
    }
    if (f.size > MAX_CLIENT_FILE_BYTES) {
      return `File is too large (${formatFileSize(f.size)}). Maximum size is 5.0 MB.`;
    }
    return null;
  };

  const setPreviewFromFile = (f: File | null) => {
    resetPrediction();
    setFile(f);
    setError(null);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const processIncomingFile = (f: File | null) => {
    if (!f) {
      setPreviewFromFile(null);
      return;
    }

    const validationError = validateFile(f);
    if (validationError) {
      setPreviewFromFile(null);
      setError(validationError);
      return;
    }

    setPreviewFromFile(f);
  };

  const onPickFile = (f: File | null) => {
    setCameraError(null);
    setCameraOpen(false);
    stopCamera();
    processIncomingFile(f);
  };

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
    } catch (e: unknown) {
      setCameraOpen(false);
      setStream(null);
      setCameraError(
        (e instanceof Error ? e.message : "") ||
          "Camera permission denied or camera not available in this browser."
      );
    }
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

    stopCamera();
    setCameraError(null);

    processIncomingFile(capturedFile);
  };

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

      const data: unknown = await res.json();

      if (!res.ok) {
        setError(readErrorMessage(data, "Prediction failed."));
        return;
      }

      setResult(data as PredictResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  };

  const onDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0] ?? null;
    onPickFile(dropped);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-8 md:px-8 md:py-12">
      <div className="ambient-shape ambient-shape-a" />
      <div className="ambient-shape ambient-shape-b" />

      <div className="mx-auto max-w-6xl space-y-8">
        <header className="glass-panel reveal rounded-3xl p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="tag-chip">EcoSort AI</p>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Intelligent Waste Classification
              </h1>
              <p className="muted-text max-w-2xl text-sm md:text-base">
                Upload or capture an image of waste, then review the model
                prediction, confidence, and evaluation metrics in one place.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="theme-toggle"
                onClick={() =>
                  setTheme((prev) => (prev === "light" ? "dark" : "light"))
                }
                aria-label={
                  theme === "light"
                    ? "Switch to dark mode"
                    : "Switch to light mode"
                }
                title={
                  theme === "light"
                    ? "Switch to dark mode"
                    : "Switch to light mode"
                }
              >
                {theme === "light" ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" />
                  </svg>
                )}
              </button>
              <div className="status-card text-sm">
                <div className="font-semibold">API Status</div>
                <div className="mt-1 muted-text">{API_BASE}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="glass-panel reveal rounded-3xl p-5 md:p-7">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Image Classification</h2>
              <p className="muted-text text-sm">
                Use upload, drag-and-drop, or camera capture.
              </p>
            </div>
            <p className="muted-text text-xs">Max file size: 5.0 MB, images only.</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary"
              type="button"
            >
              Upload Image
            </button>

            {!cameraOpen ? (
              <button
                onClick={startCamera}
                className="btn-secondary"
                type="button"
              >
                Open Camera
              </button>
            ) : (
              <button
                onClick={captureFromCamera}
                className="btn-secondary"
                type="button"
              >
                Capture Image
              </button>
            )}

            {cameraOpen ? (
              <button
                onClick={stopCamera}
                className="btn-ghost"
                type="button"
              >
                Close Camera
              </button>
            ) : (
              <button
                onClick={() => {
                  setPreviewFromFile(null);
                  setCameraError(null);
                }}
                className="btn-ghost"
                type="button"
              >
                Clear Selection
              </button>
            )}

            <button
              onClick={onSubmit}
              disabled={loading || !file}
              className="btn-accent disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              {loading ? "Predicting..." : "Run Prediction"}
            </button>
          </div>

          {error && (
            <div className="alert-error mb-4 rounded-2xl px-4 py-3 text-sm">{error}</div>
          )}

          {cameraError && (
            <div className="alert-warn mb-4 rounded-2xl px-4 py-3 text-sm">
              {cameraError}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div
              onDrop={onDropFile}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`dropzone rounded-2xl border-2 border-dashed p-5 transition ${
                dragActive ? "dropzone-active" : ""
              }`}
            >
              <p className="text-sm font-semibold">Drag and drop image here</p>
              <p className="muted-text mt-1 text-xs">or use the Upload button above.</p>
              {file && (
                <div className="file-meta mt-4 rounded-xl px-3 py-2 text-sm">
                  <div className="font-medium">{file.name}</div>
                  <div className="muted-text text-xs">{formatFileSize(file.size)}</div>
                </div>
              )}
            </div>

            {previewUrl ? (
              <div className="soft-card rounded-2xl p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-64 w-full rounded-xl object-cover md:h-72"
                />
              </div>
            ) : (
              <div className="soft-card grid place-items-center rounded-2xl p-3">
                <p className="muted-text text-sm">Image preview appears here</p>
              </div>
            )}
          </div>

          {cameraOpen && (
            <div className="soft-card mt-4 rounded-2xl p-4">
              <div className="mb-2 text-sm font-medium">Camera Preview</div>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl border"
              />
              <canvas ref={canvasRef} className="hidden" />
              <p className="muted-text mt-2 text-xs">
                Camera access depends on your browser/device permissions.
              </p>
            </div>
          )}

          {result && (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="result-card rounded-2xl p-5 md:col-span-1">
                <div className="text-sm">Predicted Category</div>
                <div className="mt-1 text-2xl font-bold">{result.predicted_class}</div>
                <div className="mt-2 text-sm">
                  Confidence: {(result.confidence * 100).toFixed(2)}%
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full progress-bg">
                  <div
                    className="h-full rounded-full progress-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="soft-card rounded-2xl p-5 md:col-span-1">
                <div className="mb-3 text-sm font-semibold">Top 3 Probabilities</div>
                <ul className="space-y-3">
                  {top3.map((p) => (
                    <li key={p.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{p.label}</span>
                        <span className="muted-text">{(p.probability * 100).toFixed(2)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full progress-track">
                        <div
                          className="h-full rounded-full progress-accent"
                          style={{
                            width: `${Math.min(100, Math.max(0, p.probability * 100))}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {predictedGuide && (
                <div className={`guide-card guide-${predictedGuide.tone} rounded-2xl p-5 md:col-span-1`}>
                  <div className="guide-pill text-xs font-semibold uppercase tracking-wide">
                    {predictedGuide.status}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold">{predictedGuide.category} Guidance</h3>
                  <p className="mt-2 text-sm">{predictedGuide.message}</p>
                  <p className="mt-2 text-sm"><strong>Recommended:</strong> {predictedGuide.action}</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="glass-panel reveal rounded-3xl p-5 md:p-7">
          <h2 className="mb-4 text-xl font-semibold">Model Evaluation</h2>

          {metricsError && (
            <div className="alert-error rounded-2xl px-4 py-3 text-sm">{metricsError}</div>
          )}

          {!metrics && !metricsError && (
            <div className="soft-card rounded-2xl px-4 py-3 text-sm muted-text">Loading metrics...</div>
          )}

          {metrics && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="soft-card rounded-2xl p-4">
                  <div className="muted-text text-sm">Accuracy</div>
                  <div className="text-2xl font-bold">{(metrics.accuracy * 100).toFixed(2)}%</div>
                  <div className="muted-text text-xs">Test samples: {metrics.num_test_samples}</div>
                </div>

                <div className="soft-card rounded-2xl p-4">
                  <div className="muted-text text-sm">Macro Avg (P/R/F1)</div>
                  <div className="text-sm">
                    P: {(metrics.precision_macro * 100).toFixed(2)}% <br />
                    R: {(metrics.recall_macro * 100).toFixed(2)}% <br />
                    F1: {(metrics.f1_macro * 100).toFixed(2)}%
                  </div>
                </div>

                <div className="soft-card rounded-2xl p-4">
                  <div className="muted-text text-sm">Weighted Avg (P/R/F1)</div>
                  <div className="text-sm">
                    P: {(metrics.precision_weighted * 100).toFixed(2)}% <br />
                    R: {(metrics.recall_weighted * 100).toFixed(2)}% <br />
                    F1: {(metrics.f1_weighted * 100).toFixed(2)}%
                  </div>
                </div>
              </div>

              <div className="soft-card mt-4 rounded-2xl p-4">
                <div className="mb-3 text-sm font-medium">Confusion Matrix</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_BASE}/confusion-matrix`}
                  alt="Confusion Matrix"
                  className="mx-auto w-full max-w-3xl rounded-xl border"
                />
              </div>

              <div className="soft-card mt-4 overflow-auto rounded-2xl p-4">
                <div className="mb-3 text-sm font-medium">Per-Class Metrics</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left muted-text">
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
                        <td className="py-2 pr-3">{(r.precision * 100).toFixed(2)}%</td>
                        <td className="py-2 pr-3">{(r.recall * 100).toFixed(2)}%</td>
                        <td className="py-2 pr-3">{(r.f1 * 100).toFixed(2)}%</td>
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
