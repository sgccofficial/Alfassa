import { useState, useRef, useEffect, useCallback, DragEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Page, MediaImage, MediaVideo, Microphone, Globe, Attachment, Search, Bell, User, ArrowUpRight, CheckSquare, BookStack } from "iconoir-react";
import { useAuth } from "../../shared/providers/AuthProvider";
import { 
  useMaterialIntake, 
  LinkIntakeModal, 
  VoiceRecorderModal, 
  IntakeStatusToast,
} from "../material";
import { subscribeToUserMaterials, subscribeToUserActivities, saveMaterialToDb } from "../../services/material-db";
import { getCachedExtractionByMaterialId, updateMaterialProcessingStatus } from "../../services/extraction-db";
import { verifyMaterialBlobStored } from "../../services/blob-store";
import { Material, Activity, MaterialType, ProcessingStatus } from "../../types";
import { ProcessingIndicator } from "../../shared/components/ProcessingIndicator";
import { MaterialRow } from "../../shared/components/MaterialRow";

function formatRelativeTime(dateString: string): string {
  try {
    const then = new Date(dateString).getTime();
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

function renderMaterialStatusBadge(mat: Material) {
  if (mat.status === "saving" || mat.status === "uploading") {
    return (
      <span className="text-[11px] text-text-secondary font-medium shrink-0">
        {mat.uploadProgress?.state === "uploading" ? "Uploading..." : "Saving..."}
      </span>
    );
  }

  if (mat.status === "upload_complete" && (!mat.processingStatus || mat.processingStatus === "pending")) {
    return (
      <span className="text-[11px] text-text-secondary shrink-0 font-medium">
        Saved
      </span>
    );
  }

  switch (mat.processingStatus) {
    case "completed":
      return (
        <span className="text-[11px] text-text-secondary shrink-0 font-medium">
          Ready
        </span>
      );
    case "partially_completed":
      return (
        <span className="text-[11px] text-text-secondary shrink-0 font-medium">
          Partial
        </span>
      );
    case "processing":
      return (
        <span className="shrink-0">
          <ProcessingIndicator size="xs" />
        </span>
      );
    case "failed":
      return (
        <span className="text-[11px] text-red-500 font-semibold shrink-0">
          Needs attention
        </span>
      );
    case "pending":
    default:
      return (
        <span className="text-[11px] text-text-secondary shrink-0 font-medium">
          {mat.status === "upload_complete" ? "Saved" : "Pending"}
        </span>
      );
  }
}

function getMaterialIcon(type?: MaterialType) {
  switch (type) {
    case "image":
      return <MediaImage size={18} strokeWidth={1.5} />;
    case "video":
      return <MediaVideo size={18} strokeWidth={1.5} />;
    case "audio":
      return <Microphone size={18} strokeWidth={1.5} />;
    case "link":
      return <Globe size={18} strokeWidth={1.5} />;
    case "document":
    case "text":
      return <Page size={18} strokeWidth={1.5} />;
    default:
      return <Attachment size={18} strokeWidth={1.5} />;
  }
}

export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.uid || "guest-user";

  const {
    isProcessing,
    statusMessage,
    errorMessage,
    clearMessages,
    intakeFiles,
    intakeUrl,
    intakeAudioBlob,
    intakeText,
    intakeDataTransfer,
    reprocessMaterial,
  } = useMaterialIntake();

  // Modals & UI States
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const openMaterialDetail = (mat: Material) => {
    navigate(`/material/${mat.id}`);
  };

  // Live collections
  const [materials, setMaterials] = useState<Material[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  // Hidden file inputs
  const docInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const anyFileInputRef = useRef<HTMLInputElement>(null);
  const attemptedRecoveryRef = useRef<Set<string>>(new Set());

  // Subscribe to real-time materials and activities
  useEffect(() => {
    const unsubMaterials = subscribeToUserMaterials(currentUserId, setMaterials);
    const unsubActivities = subscribeToUserActivities(currentUserId, setActivities);
    return () => {
      unsubMaterials();
      unsubActivities();
    };
  }, [currentUserId]);

  // Safe recovery effect for interrupted uploads or processing jobs
  useEffect(() => {
    if (materials.length === 0) return;

    materials.forEach(async (m) => {
      if (attemptedRecoveryRef.current.has(m.id)) return;

      // 1. Check interrupted uploads/saves
      if (m.status === "saving" || m.status === "uploading") {
        attemptedRecoveryRef.current.add(m.id);
        const isStored = await verifyMaterialBlobStored(m.id, m.metadata?.size);
        if (isStored) {
          const updated = {
            ...m,
            status: "upload_complete" as const,
            uploadProgress: {
              loaded: m.metadata?.size || 0,
              total: m.metadata?.size || 0,
              percentage: 100,
              state: "complete" as const,
            },
            updatedAt: new Date().toISOString(),
          };
          await saveMaterialToDb(updated);
        } else {
          const age = (Date.now() - new Date(m.updatedAt || m.createdAt).getTime()) / 1000;
          if (age > 10) {
            const updated = {
              ...m,
              status: "processing_failed" as const,
              processingStatus: "failed" as const,
              errorDetail: {
                stage: "saving" as const,
                message: "Upload interrupted. Click Retry to re-add.",
                timestamp: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            };
            await saveMaterialToDb(updated);
          }
        }
      }

      // 2. Check stuck processing jobs
      if (m.processingStatus === "processing") {
        attemptedRecoveryRef.current.add(m.id);
        const cachedExt = getCachedExtractionByMaterialId(m.id, currentUserId);
        if (cachedExt) {
          await updateMaterialProcessingStatus(m.id, currentUserId, cachedExt.processingStatus);
        } else {
          const age = (Date.now() - new Date(m.updatedAt || m.createdAt).getTime()) / 1000;
          if (age > 20) {
            // Guard against large file reprocessing crashes
            if (m.metadata?.size && m.metadata.size > 25 * 1024 * 1024) {
              const failedMat = {
                ...m,
                processingStatus: "failed" as const,
                errorDetail: {
                  stage: "extraction" as const,
                  message: "File too large for automatic background extraction. Original preserved.",
                  timestamp: new Date().toISOString(),
                },
                updatedAt: new Date().toISOString(),
              };
              await saveMaterialToDb(failedMat);
              await updateMaterialProcessingStatus(m.id, currentUserId, "failed");
            } else {
              try {
                await reprocessMaterial(m);
              } catch {
                // reprocessMaterial updates status to failed safely
              }
            }
          }
        }
      }
    });
  }, [materials, currentUserId, reprocessMaterial]);

  // Global universal paste handler: preserves text, images, files, or links directly
  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      // Don't intercept if user is typing in a text field or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" || 
        target.tagName === "TEXTAREA" || 
        target.isContentEditable
      ) {
        return;
      }

      if (!e.clipboardData) return;

      e.preventDefault();
      intakeDataTransfer(e.clipboardData, "clipboard-paste");
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [intakeDataTransfer]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer) {
      intakeDataTransfer(e.dataTransfer, "drag-and-drop");
    }
  }, [intakeDataTransfer]);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      intakeFiles(e.target.files, "file-picker");
      // Reset input value so same file can be selected again if needed
      e.target.value = "";
    }
  };

  // Recent material for "Continue where you left off"
  const activeMaterial = materials[0];

  return (
    <div className="space-y-12 fade-in max-w-5xl mx-auto pt-4 md:pt-8">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={docInputRef}
        onChange={handleFileInputChange}
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.markdown,.rtf,.odt,.epub,.csv,.json"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={imgInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="image/*"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={videoInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="video/*"
        className="hidden"
        aria-hidden="true"
      />
      <input
        type="file"
        ref={anyFileInputRef}
        onChange={handleFileInputChange}
        multiple
        className="hidden"
        aria-hidden="true"
      />

      {/* Modals & Feedback */}
      <LinkIntakeModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onSubmit={async (url) => {
          await intakeUrl(url);
        }}
      />

      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSave={async (blob, duration, title) => {
          await intakeAudioBlob(blob, duration, title);
        }}
      />

      <IntakeStatusToast
        isProcessing={isProcessing}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        onDismiss={clearMessages}
      />

      {/* Header */}
      <header className="pb-2 flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary mb-4">
            Welcome back, {user?.displayName ? user.displayName.split(" ")[0] : "Prasanth"}.
          </h1>
          
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Continue where you left off
            </h2>
            {activeMaterial ? (
              <div className="max-w-md w-full">
                <MaterialRow
                  material={activeMaterial}
                  onClick={() => openMaterialDetail(activeMaterial)}
                  onOpen={() => navigate(`/material/${activeMaterial.id}`)}
                  onRetry={() => reprocessMaterial(activeMaterial.id)}
                  showOpenAction={true}
                />
              </div>
            ) : (
              <div 
                onClick={() => {
                  if (materials.length > 0) openMaterialDetail(materials[0]);
                }}
                className="bg-bg-surface border border-border-color hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-2xs cursor-pointer rounded-xl p-4 w-full max-w-md transition-all group space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="p-1.5 rounded-md bg-bg-subtle text-text-primary shrink-0">
                      <Page size={16} strokeWidth={1.75} />
                    </div>
                    <p className="font-semibold text-text-primary text-xs sm:text-sm truncate min-w-0 flex-1">
                      Lens Anatomy
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs pt-0.5">
                  <span className="text-[11px] text-text-muted truncate">
                    Document · Added recently
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold text-xs text-text-primary hover:text-accent-highlight transition-colors cursor-pointer shrink-0 ml-2"
                  >
                    Open &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between w-full md:w-auto gap-3 text-text-secondary order-first md:order-last">
          <span className="md:hidden font-bold text-base tracking-tight text-text-primary animate-text-sweep">
            Alfassa
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            <button className="p-2 hover:bg-bg-subtle rounded-lg text-text-secondary hover:text-text-primary transition-colors cursor-pointer" aria-label="Global Search">
              <Search size={18} strokeWidth={1.75} />
            </button>
            <button className="p-2 hover:bg-bg-subtle rounded-lg text-text-secondary hover:text-text-primary transition-colors relative cursor-pointer" aria-label="Notifications">
              <Bell size={18} strokeWidth={1.75} />
              {activities.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-accent-highlight rounded-full"></span>
              )}
            </button>
            <button className="w-8 h-8 ml-1 rounded-lg bg-bg-subtle border border-border-color flex items-center justify-center text-text-primary font-medium hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer" aria-label="Profile">
               <User size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {/* Grid Layout for sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          <section>
            {/* The Hero Dropzone */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => anyFileInputRef.current?.click()}
              className={`relative bg-bg-surface border rounded-2xl p-7 sm:p-9 text-center flex flex-col items-center justify-center transition-all duration-200 group cursor-pointer ${
                isDragging 
                  ? "border-accent-highlight ring-2 ring-accent-highlight/20 bg-bg-subtle" 
                  : "border-border-color hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs"
              }`}
            >
              {/* Six Interactive Shortcut Buttons */}
              <div 
                onClick={(e) => e.stopPropagation()} 
                className="w-full max-w-xl grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6"
              >
                {/* 1. Document Picker */}
                <button 
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-color bg-bg-main hover:bg-bg-surface hover:border-slate-300 dark:hover:border-slate-700 transition-all text-text-secondary hover:text-text-primary group/btn cursor-pointer" 
                  aria-label="Upload Document"
                  title="Upload Document (.pdf, .doc, .txt, .md)"
                >
                  <Page strokeWidth={1.75} size={20} className="shrink-0 group-hover/btn:text-text-primary transition-colors" />
                  <span className="text-[11px] font-medium mt-1.5">Docs</span>
                </button>

                {/* 2. Image Picker */}
                <button 
                  type="button"
                  onClick={() => imgInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-color bg-bg-main hover:bg-bg-surface hover:border-slate-300 dark:hover:border-slate-700 transition-all text-text-secondary hover:text-text-primary group/btn cursor-pointer" 
                  aria-label="Upload Image"
                  title="Upload Image"
                >
                  <MediaImage strokeWidth={1.75} size={20} className="shrink-0 group-hover/btn:text-text-primary transition-colors" />
                  <span className="text-[11px] font-medium mt-1.5">Images</span>
                </button>

                {/* 3. Video Picker */}
                <button 
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-color bg-bg-main hover:bg-bg-surface hover:border-slate-300 dark:hover:border-slate-700 transition-all text-text-secondary hover:text-text-primary group/btn cursor-pointer" 
                  aria-label="Upload Video"
                  title="Upload Video"
                >
                  <MediaVideo strokeWidth={1.75} size={20} className="shrink-0 group-hover/btn:text-text-primary transition-colors" />
                  <span className="text-[11px] font-medium mt-1.5">Video</span>
                </button>

                {/* 4. Voice Recorder */}
                <button 
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-color bg-bg-main hover:bg-bg-surface hover:border-slate-300 dark:hover:border-slate-700 transition-all text-text-secondary hover:text-text-primary group/btn cursor-pointer" 
                  aria-label="Record Voice"
                  title="Record Voice Note"
                >
                  <Microphone strokeWidth={1.75} size={20} className="shrink-0 group-hover/btn:text-text-primary transition-colors" />
                  <span className="text-[11px] font-medium mt-1.5">Audio</span>
                </button>

                {/* 5. Web Link Intake */}
                <button 
                  type="button"
                  onClick={() => setIsLinkModalOpen(true)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-color bg-bg-main hover:bg-bg-surface hover:border-slate-300 dark:hover:border-slate-700 transition-all text-text-secondary hover:text-text-primary group/btn cursor-pointer" 
                  aria-label="Add URL"
                  title="Bring Web Link"
                >
                  <Globe strokeWidth={1.75} size={20} className="shrink-0 group-hover/btn:text-text-primary transition-colors" />
                  <span className="text-[11px] font-medium mt-1.5">Link</span>
                </button>

                {/* 6. Universal File Picker */}
                <button 
                  type="button"
                  onClick={() => anyFileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-color bg-bg-main hover:bg-bg-surface hover:border-slate-300 dark:hover:border-slate-700 transition-all text-text-secondary hover:text-text-primary group/btn cursor-pointer" 
                  aria-label="Add File"
                  title="Any File Attachment"
                >
                  <Attachment strokeWidth={1.75} size={20} className="shrink-0 group-hover/btn:text-text-primary transition-colors" />
                  <span className="text-[11px] font-medium mt-1.5">File</span>
                </button>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary mb-1">
                {isDragging ? "Drop material here" : "Bring anything."}
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary max-w-sm">
                {isDragging ? "Release to add to Alfassa" : "Drop files anywhere, paste from clipboard, or choose an intake method."}
              </p>
            </div>
          </section>

          {/* Your Materials & Status Section */}
          {materials.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">
                  Your Materials
                </h2>
                <span className="text-[11px] text-text-muted">
                  {materials.length} {materials.length === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {materials.map((mat) => (
                  <MaterialRow
                    key={mat.id}
                    material={mat}
                    onClick={() => openMaterialDetail(mat)}
                    onRetry={() => reprocessMaterial(mat.id)}
                  />
                ))}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Sidebar Column: Dynamic Recent Activity */}
        <div className="space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">Recent Activity</h2>
            </div>
            
            {activities.length === 0 ? (
              <div 
                className="bg-bg-surface border border-border-color rounded-xl p-6 min-h-[140px] flex flex-col items-center justify-center text-center"
              >
                <p className="text-xs font-semibold text-text-primary mb-1">
                  Nothing here yet.
                </p>
                <p className="text-text-muted text-xs leading-relaxed">
                  Every upload, edit, and revision will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto pr-1 custom-scrollbar bg-bg-surface border border-border-color rounded-xl p-3 space-y-2">
                {activities.map((act) => (
                  <div 
                    key={act.id}
                    onClick={() => {
                      if (act.entityId && (act.entityType === "material" || !act.entityType)) {
                        navigate(`/material/${act.entityId}`);
                      }
                    }}
                    className={`p-2.5 rounded-lg bg-bg-subtle/60 border border-border-color/60 transition-colors flex items-start gap-2.5 ${
                      act.entityId ? "hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer group/act" : ""
                    }`}
                  >
                    <div className="p-1.5 rounded-md bg-bg-surface border border-border-color text-text-secondary mt-0.5 shrink-0">
                      {getMaterialIcon(act.metadata?.materialType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-text-primary truncate group-hover/act:text-accent-highlight transition-colors">
                        {act.description}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {formatRelativeTime(act.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

