"use client";

import {
  useState,
  useRef,
  useCallback,
  useTransition,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Paperclip,
} from "lucide-react";
import {
  presignEvidenceUploadAction,
  confirmEvidenceUploadAction,
  deleteEvidenceAction,
  getEvidenceDownloadUrlAction,
  listEvidenceAction,
} from "@/lib/actions/evidence";
import type { Evidence } from "@/lib/db/schema";

interface EvidenceItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  notes: string | null;
  createdAt: Date;
}

interface EvidenceModalProps {
  requirementId: string;
  requirementTitle: string;
  onClose: () => void;
  onEvidenceChange?: () => void;
}

type UploadState =
  | { status: "idle" }
  | { status: "dragging" }
  | { status: "uploading"; filename: string; progress: number }
  | { status: "success"; filename: string }
  | { status: "error"; message: string };

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
]);

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export function EvidenceModal({
  requirementId,
  requirementTitle,
  onClose,
  onEvidenceChange,
}: EvidenceModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadEvidence = useCallback(async () => {
    setIsLoading(true);
    const res = await listEvidenceAction(requirementId);
    if (res.success) {
      setEvidenceList(res.evidence);
    }
    setIsLoading(false);
  }, [requirementId]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        setUploadState({
          status: "error",
          message: `File type "${file.type || "unknown"}" is not allowed. Please upload a PDF, image, Office document, text file, or CSV.`,
        });
        return;
      }

      if (file.size > MAX_SIZE) {
        setUploadState({
          status: "error",
          message: `File is too large (${formatBytes(file.size)}). Maximum size is 25 MB.`,
        });
        return;
      }

      setUploadState({ status: "uploading", filename: file.name, progress: 0 });

      // Step 1: Get presigned URL
      const presignRes = await presignEvidenceUploadAction({
        requirementId,
        filename: file.name,
        contentType: file.type,
        declaredSize: file.size,
      });

      if (!presignRes.success) {
        setUploadState({ status: "error", message: presignRes.error });
        return;
      }

      const { presignedUrl, evidenceId, storageKey } = presignRes;

      // Step 2: PUT directly to R2
      try {
        setUploadState({ status: "uploading", filename: file.name, progress: 50 });

        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed with status ${uploadRes.status}`);
        }
      } catch (err: any) {
        setUploadState({
          status: "error",
          message: `Upload to storage failed: ${err.message}`,
        });
        return;
      }

      // Step 3: Confirm via server action
      setUploadState({ status: "uploading", filename: file.name, progress: 90 });

      const confirmRes = await confirmEvidenceUploadAction({
        evidenceId,
        requirementId,
        filename: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
        storageKey,
        notes: notes.trim() || undefined,
      });

      if (!confirmRes.success) {
        setUploadState({ status: "error", message: confirmRes.error });
        return;
      }

      setUploadState({ status: "success", filename: file.name });
      setNotes("");
      await loadEvidence();
      onEvidenceChange?.();
      router.refresh();

      // Reset to idle after 2s
      setTimeout(() => setUploadState({ status: "idle" }), 2000);
    },
    [requirementId, notes, loadEvidence, onEvidenceChange, router]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
      setUploadState((s) => (s.status === "dragging" ? { status: "idle" } : s));
    },
    [handleFile]
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this evidence file?")) return;
    setDeletingId(id);
    const res = await deleteEvidenceAction(id);
    if (res.success) {
      await loadEvidence();
      onEvidenceChange?.();
      router.refresh();
    } else {
      alert(res.error);
    }
    setDeletingId(null);
  };

  const handleDownload = async (ev: EvidenceItem) => {
    setDownloadingId(ev.id);
    const res = await getEvidenceDownloadUrlAction(ev.id);
    if (res.success) {
      const a = document.createElement("a");
      a.href = res.url;
      a.download = ev.fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } else {
      alert(res.error);
    }
    setDownloadingId(null);
  };

  const handlePreview = async (ev: EvidenceItem) => {
    if (previewUrl) {
      setPreviewUrl(null);
      setPreviewMime(null);
      return;
    }
    const res = await getEvidenceDownloadUrlAction(ev.id);
    if (res.success) {
      setPreviewUrl(res.url);
      setPreviewMime(ev.mimeType);
    } else {
      alert(res.error);
    }
  };

  const isDragging = uploadState.status === "dragging";
  const isUploading = uploadState.status === "uploading";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border p-5">
          <div>
            <h3 className="text-lg font-bold text-foreground">Evidence Vault</h3>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              <Paperclip className="mr-1 inline h-3 w-3" />
              {requirementTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isUploading)
                setUploadState({ status: "dragging" });
            }}
            onDragLeave={() =>
              setUploadState((s) =>
                s.status === "dragging" ? { status: "idle" } : s
              )
            }
            onDrop={onDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? "border-emerald-500 bg-emerald-500/5"
                : isUploading
                ? "border-blue-400 bg-blue-500/5 cursor-not-allowed"
                : uploadState.status === "success"
                ? "border-emerald-400 bg-emerald-500/5"
                : uploadState.status === "error"
                ? "border-red-400 bg-red-500/5"
                : "border-border bg-muted/20 hover:border-emerald-400 hover:bg-emerald-500/5"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={Array.from(ALLOWED_TYPES).join(",")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
              disabled={isUploading}
            />

            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  Uploading {(uploadState as any).filename}…
                </p>
                <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(uploadState as any).progress}%` }}
                  />
                </div>
              </>
            ) : uploadState.status === "success" ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {(uploadState as any).filename} uploaded!
                </p>
              </>
            ) : uploadState.status === "error" ? (
              <>
                <AlertCircle className="h-8 w-8 text-red-500" />
                <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">
                  Upload failed
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  {(uploadState as any).message}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadState({ status: "idle" });
                  }}
                  className="mt-3 text-xs font-medium text-emerald-600 hover:underline"
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <Upload
                  className={`h-8 w-8 ${isDragging ? "text-emerald-500" : "text-muted-foreground"}`}
                />
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {isDragging ? "Drop to upload" : "Drag & drop or click to upload"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, images, Office docs, CSV, text — max 25 MB
                </p>
              </>
            )}
          </div>

          {/* Notes field */}
          {uploadState.status === "idle" || uploadState.status === "error" ? (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Notes (optional — attached to next upload)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Add context about this evidence..."
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-emerald-500 focus:outline-none"
              />
            </div>
          ) : null}

          {/* Evidence List */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Uploaded Evidence ({evidenceList.length})
            </h4>

            {isLoading ? (
              <div className="mt-4 flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : evidenceList.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-border py-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No evidence files yet. Upload one above.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {evidenceList.map((ev) => {
                  const Icon = getMimeIcon(ev.mimeType);
                  const isPreviewable =
                    ev.mimeType.startsWith("image/") || ev.mimeType === "application/pdf";

                  return (
                    <li
                      key={ev.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {ev.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(ev.fileSizeBytes)}
                          {ev.notes && (
                            <span className="ml-2 italic">· {ev.notes}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {isPreviewable && (
                          <button
                            onClick={() => handlePreview(ev)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDownload(ev)}
                          disabled={downloadingId === ev.id}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title="Download"
                        >
                          {downloadingId === ev.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDelete(ev.id)}
                          disabled={deletingId === ev.id}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20 disabled:opacity-50"
                          title="Delete evidence"
                        >
                          {deletingId === ev.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Preview Panel */}
          {previewUrl && previewMime && (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </span>
                <button
                  onClick={() => {
                    setPreviewUrl(null);
                    setPreviewMime(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close preview
                </button>
              </div>
              {previewMime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Evidence preview"
                  className="max-h-80 w-full rounded-lg object-contain"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  className="h-80 w-full rounded-lg border-0"
                  title="PDF preview"
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
