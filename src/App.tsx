import React, { useState, useRef, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Captions, 
  Music, 
  Zap, 
  Settings, 
  Upload, 
  Download, 
  Play, 
  Pause, 
  Type as TypeIcon, 
  Palette, 
  Layers,
  Trash2,
  Trash2 as Trash,
  Plus,
  ChevronRight,
  ChevronLeft,
  Menu,
  Mic,
  Monitor,
  Video,
  FileText,
  Save,
  AlertCircle,
  Activity,
  Lock,
  Bell,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import WaveSurfer from 'wavesurfer.js';

// --- Types & Constants ---
const MIN_SIDEBAR_WIDTH = 80;
const MAX_SIDEBAR_WIDTH = 450;
const DEFAULT_SIDEBAR_WIDTH = 288;

const MIN_EDITOR_SIDEBAR_WIDTH = 280;
const MAX_EDITOR_SIDEBAR_WIDTH = 600;
const DEFAULT_EDITOR_SIDEBAR_WIDTH = 384;

// --- Helper Components ---

const ResizeHandle = ({ onResize, direction = 'horizontal', className }: { 
  onResize: (delta: number) => void, 
  direction?: 'horizontal' | 'vertical',
  className?: string
}) => {
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    
    const handleMove = (e: MouseEvent) => {
      onResize(direction === 'horizontal' ? e.movementX : e.movementY);
    };
    
    const handleUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = 'default';
    };
  }, [isResizing, onResize, direction]);

  return (
    <div 
      onMouseDown={(e) => {
        e.preventDefault();
        setIsResizing(true);
      }}
      className={cn(
        "transition-all duration-200 z-50 flex items-center justify-center group",
        direction === 'horizontal' 
          ? "w-1 hover:w-1.5 cursor-col-resize h-full bg-white/5 hover:bg-creator-purple shadow-[0_0_10px_rgba(147,51,234,0.3)]" 
          : "h-1 hover:h-1.5 cursor-row-resize w-full bg-white/5 hover:bg-creator-purple shadow-[0_0_10px_rgba(147,51,234,0.3)]",
        isResizing && "bg-creator-purple w-1.5 md:w-2 h-full",
        className
      )}
    >
      <div className={cn(
        "bg-white/20 rounded-full",
        direction === 'horizontal' ? "w-0.5 h-8" : "h-0.5 w-8"
      )} />
    </div>
  );
};
const KaraokeWords = ({ text, start, end, currentTime, activeColor }: { text: string, start: number, end: number, currentTime: number, activeColor: string }) => {
  const words = text.split(/\s+/);
  const duration = end - start;
  const wordDuration = duration / words.length;

  return (
    <span className="inline-flex flex-wrap justify-center gap-x-[0.25em]">
      {words.map((word, i) => {
        const wordStart = start + (i * wordDuration);
        const isActive = currentTime >= wordStart;
        const progress = Math.min(1, Math.max(0, (currentTime - wordStart) / wordDuration));
        
        return (
          <span key={i} className="relative inline-block">
            <span className="opacity-30">{word}</span>
            <motion.span 
              className="absolute left-0 top-0 overflow-hidden whitespace-nowrap"
              style={{ 
                width: `${progress * 100}%`,
                color: activeColor,
                textShadow: `0 0 10px ${activeColor}44`
              }}
              transition={{ duration: 0.1 }}
            >
              {word}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
};

import { GoogleGenAI, Type } from "@google/genai";
import { cn, Caption, Project, DEFAULT_STYLE, CaptionStyle, StylePreset } from './types';

// --- Gemini Service ---
// Note: GoogleGenAI is initialized per-request to ensure the latest API key is used

const getErrorMessage = (err: any) => {
  if (err.message?.includes("API_KEY") || err.status === "PERMISSION_DENIED") {
    return "Permission Denied. This usually means the API key is invalid or lacks access to the selected model. If you're using a personal key, ensure 'Generative Language API' is enabled in your Google Cloud Project.";
  }
  if (err.message?.includes("too large")) return "File is too large for the browser (max 20MB).";
  if (err.message?.toLowerCase().includes("aborted") || err.message?.toLowerCase().includes("signal")) return "Request was interrupted. Try a smaller file or checking your connection.";
  return err.message || "An unexpected error occurred during transcription.";
};

async function transcribeWithGemini(file: File): Promise<any[]> {
  // Check file size (20MB limit)
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File is too large (max 20MB). Large files often cause connection timeouts in the browser. Please use a smaller clip or compress the file.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Professional audio analysis requires a valid GEMINI_API_KEY. Please ensure it is set in the environment.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToBase64(file);

  try {
    const result = await ai.models.generateContent({
      model: "gemini-flash-latest", 
      contents: {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: file.type || 'audio/mpeg',
              data: base64Data,
            },
          },
          {
            text: "Transcribe this audio/video. Provide a JSON array of objects with 'start' (number), 'end' (number), and 'text' (string) fields. Group words into natural phrases.",
          },
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.NUMBER, description: "Start time in seconds" },
              end: { type: Type.NUMBER, description: "End time in seconds" },
              text: { type: Type.STRING, description: "Transcription text" }
            },
            required: ["start", "end", "text"]
          }
        }
      }
    });

    const text = result.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (e: any) {
    console.error("Gemini Transcription Error:", e);
    const msg = e.message?.toLowerCase() || "";
    if (msg.includes("aborted") || e.name === "AbortError" || msg.includes("signal") || msg.includes("interrupted")) {
      throw new Error("The request was interrupted or timed out (Signal Aborted). This usually happens with large files (>10MB) or unstable connections. Try using a smaller clip or a faster network.");
    }
    throw e;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, collapsed, onClick }: { icon: any, label: string, active: boolean, collapsed: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    title={label}
    className={cn(
      "flex items-center rounded-xl transition-all duration-200 group relative",
      "md:w-full",
      collapsed ? "justify-center p-2.5 md:p-3" : "gap-3 px-2.5 py-2.5 md:px-4 md:py-3",
      active ? "bg-creator-purple text-white shadow-lg shadow-purple-500/20" : "text-zinc-400 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon size={20} className={cn("shrink-0 transition-transform", active ? "scale-110" : "group-hover:scale-110")} />
    {!collapsed && <span className="font-medium truncate hidden md:inline text-sm">{label}</span>}
    {active && (
       <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full hidden md:block" />
    )}
    {/* Mobile active indicator */}
    {active && (
       <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full md:hidden" />
    )}
  </button>
);

const ModuleCard = ({ title, description, icon: Icon, color, onClick }: { title: string, description: string, icon: any, color: string, onClick: () => void }) => (
  <motion.div
    whileHover={{ y: -5, scale: 1.02 }}
    onClick={onClick}
    className="glass-panel p-5 md:p-8 cursor-pointer group relative overflow-hidden flex flex-col sm:flex-row items-center gap-5 md:gap-8 border border-white/5 hover:border-white/10 transition-all text-center sm:text-left"
  >
    <div className={cn("absolute -top-10 -right-10 w-48 h-48 blur-3xl opacity-20 rounded-full", color)} />
    <div className={cn("w-14 h-14 md:w-20 md:h-20 shrink-0 rounded-2xl md:rounded-3xl flex items-center justify-center relative z-10 shadow-2xl shadow-black/50", color)}>
      <Icon className="text-white" size={24} />
    </div>
    <div className="space-y-1.5 relative z-10">
      <h3 className="text-lg md:text-2xl font-bold font-display group-hover:text-creator-purple transition-colors">{title}</h3>
      <p className="text-zinc-500 font-light leading-relaxed text-xs md:text-sm line-clamp-2 md:line-clamp-none">{description}</p>
      <div className="pt-1.5 flex items-center justify-center sm:justify-start text-[9px] md:text-xs font-bold uppercase tracking-[0.2em] text-creator-cyan opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
        Launch Studio <ChevronRight size={14} className="ml-1" />
      </div>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'subtitles' | 'lyrics' | 'dj' | 'karaoke' | 'settings'>('home');
  const [settingsCategory, setSettingsCategory] = useState<'api' | 'export' | 'notifications'>('api');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [settingsSidebarWidth, setSettingsSidebarWidth] = useState(320);
  const [djLeftWidth, setDjLeftWidth] = useState(600);
  const [userPreferences, setUserPreferences] = useState(() => {
    const saved = localStorage.getItem('autosub_settings');
    return saved ? JSON.parse(saved) : {
      autoLrc: true,
      smartPunctuation: true,
      exportFormat: 'srt',
      includeTimestamps: true,
      notifyOnComplete: true,
      emailSummary: false,
    };
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('autosub_projects');
    return saved ? JSON.parse(saved) : [];
  });
  const [customStylePresets, setCustomStylePresets] = useState<StylePreset[]>(() => {
    const saved = localStorage.getItem('autosub_presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Auto-save projects
  useEffect(() => {
    localStorage.setItem('autosub_projects', JSON.stringify(allProjects));
  }, [allProjects]);

  // Sync current project back to allProjects when it changes (efficiently)
  useEffect(() => {
    if (!currentProject) return;
    setAllProjects(prev => {
      const exists = prev.find(p => p.id === currentProject.id);
      if (!exists) return [...prev, currentProject];
      return prev.map(p => p.id === currentProject.id ? currentProject : p);
    });
  }, [currentProject]);
  const [error, setError] = useState<{ message: string, suggestion: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('autosub_presets', JSON.stringify(customStylePresets));
  }, [customStylePresets]);

  const handleUpload = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    const results: Project[] = [];

    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      try {
        setUploadProgress((i / acceptedFiles.length) * 100);
        const captionsData = await transcribeWithGemini(file);
        
        const newProject: Project = {
          id: Date.now().toString() + "-" + i,
          name: file.name,
          type: activeTab === 'lyrics' ? 'lyric' : activeTab === 'karaoke' ? 'karaoke' : 'subtitle',
          captions: captionsData.map((c: any, index: number) => ({ 
            id: index.toString(),
            start: Number(c.start) || 0,
            end: Number(c.end) || 0,
            text: String(c.text) || ""
          })),
          style: JSON.parse(JSON.stringify(DEFAULT_STYLE)),
          mediaUrl: URL.createObjectURL(file),
        };
        
        results.push(newProject);
        setAllProjects(prev => [...prev, newProject]);
        setUploadProgress(((i + 1) / acceptedFiles.length) * 100);
      } catch (err: any) {
        console.error(`Upload failed for ${file.name}`, err);
        const msg = getErrorMessage(err);
        setError({
          message: acceptedFiles.length > 1 ? `Failed processing "${file.name}"` : "Upload failed",
          suggestion: msg
        });
        if (acceptedFiles.length === 1) break;
      }
    }

    if (results.length > 0) {
      setCurrentProject(results[0]);
      if (activeTab === 'home') {
        const firstType = results[0].type;
        setActiveTab(firstType === 'lyric' ? 'lyrics' : firstType === 'karaoke' ? 'karaoke' : 'subtitles');
      }
    }
    
    setIsUploading(false);
    setUploadProgress(100);
  };

  const handleBatchExport = () => {
    if (allProjects.length === 0) return;
    const zipContent = allProjects.map(p => {
      let content = '';
      p.captions.forEach((cap, i) => {
        content += `${i + 1}\n${formatTimeForSRT(cap.start)} --> ${formatTimeForSRT(cap.end)}\n${cap.text}\n\n`;
      });
      return { name: p.name + '.srt', content };
    });
    
    // In a real zip environment we'd use JSZip, here we download them sequentially for simplicity in browser
    zipContent.forEach((file, index) => {
      setTimeout(() => {
        downloadFile(file.content, file.name);
      }, index * 500);
    });
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimeForSRT = (seconds: number) => {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12);
    return time.replace('.', ',');
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-creator-black overflow-hidden font-sans">
      {/* Sidebar / Bottom Nav */}
      <aside 
        style={{ width: window.innerWidth >= 768 ? (isSidebarCollapsed ? 80 : sidebarWidth) : '100%' }}
        className={cn(
          "border-zinc-800/50 flex transition-[background-color,border-color] duration-300 ease-in-out relative z-50 bg-[#080808]",
          "flex-row md:flex-col p-1.5 md:p-4 border-t md:border-t-0 md:border-r",
          "w-full h-auto md:h-full shrink-0"
        )}
      >
        <div className={cn("hidden md:flex items-center mb-10 px-2", isSidebarCollapsed ? "justify-center" : "justify-between")}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-creator-purple to-creator-cyan rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="text-white fill-current" size={20} />
              </div>
              <h1 className="text-xl font-bold font-display tracking-tight">AutoSub <span className="text-creator-purple">AI</span></h1>
            </div>
          )}
          {isSidebarCollapsed && (
            <div className="w-10 h-10 bg-gradient-to-br from-creator-purple to-creator-cyan rounded-xl flex items-center justify-center shadow-lg mb-4">
               <Zap className="text-white fill-current" size={20} />
            </div>
          )}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={20} className={cn("transition-transform", isSidebarCollapsed && "rotate-180")} />
          </button>
        </div>

        <nav className="flex flex-row md:flex-col gap-1 md:gap-3 flex-1 items-center md:items-stretch justify-around md:justify-start px-2 md:px-0">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'home'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('home')} />
          <SidebarItem icon={Captions} label="Subtitles" active={activeTab === 'subtitles'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('subtitles')} />
          <SidebarItem icon={Music} label="Lyrics" active={activeTab === 'lyrics'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('lyrics')} />
          <SidebarItem icon={Mic} label="Karaoke Studio" active={activeTab === 'karaoke'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('karaoke')} />
          <SidebarItem icon={Activity} label="DJ Sync" active={activeTab === 'dj'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('dj')} />
          <div className="md:hidden">
            <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('settings')} />
          </div>
        </nav>

        <div className="hidden md:block mt-auto pt-6 border-t border-white/5">
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('settings')} />
        </div>

        {!isSidebarCollapsed && (
          <ResizeHandle 
            className="absolute right-0 top-0 hidden md:flex"
            onResize={(delta) => setSidebarWidth(prev => Math.max(MIN_SIDEBAR_WIDTH * 2, Math.min(MAX_SIDEBAR_WIDTH, prev + delta)))} 
          />
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative bg-[#0d0d0d]">
        {error && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md">
            <div className="bg-red-500/10 border border-red-500/50 backdrop-blur-xl p-6 rounded-2xl flex flex-col gap-3 text-red-200 shadow-2xl">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-red-500" />
                <p className="text-sm font-bold uppercase tracking-widest text-red-400">Transcription Failed</p>
                <button onClick={() => setError(null)} className="ml-auto text-red-200/50 hover:text-red-200">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{error.message}</p>
                <p className="text-xs text-red-200/60 leading-relaxed italic">Suggestion: {error.suggestion}</p>
              </div>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home" 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 md:p-16 lg:p-20 max-w-7xl mx-auto space-y-16 md:space-y-24"
            >
              <header className="flex flex-col lg:flex-row justify-between items-start gap-8 md:gap-12 border-b border-white/5 pb-12 md:pb-16">
                <div className="space-y-6">
                  <h2 className="text-4xl xs:text-5xl md:text-7xl font-bold font-display tracking-tight leading-tight md:leading-none">
                    Welcome back, <br className="hidden xs:block"/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-creator-purple via-creator-cyan to-creator-purple bg-[length:200%_auto] animate-gradient-x">Creator Studio</span>
                  </h2>
                  <p className="text-zinc-400 text-base md:text-xl max-w-2xl leading-relaxed font-light">
                    Elevate your content with professional AI tools. 
                    Transcription, synchronization, and analysis in one unified platform.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 w-full sm:w-auto">
                  {allProjects.length > 0 && (
                    <button 
                      onClick={handleBatchExport}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 md:px-8 py-3 md:py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all font-bold group shadow-2xl"
                    >
                      <Download className="text-creator-cyan group-hover:scale-110 transition-transform" size={18} />
                      <span className="uppercase tracking-widest text-[10px] md:text-xs">Batch Export ({allProjects.length})</span>
                    </button>
                  )}
                  <button className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 md:px-8 py-3 md:py-4 bg-creator-purple rounded-2xl font-bold shadow-2xl hover:scale-105 transition-all text-[10px] md:text-sm uppercase tracking-widest">
                    <Plus size={18} /> New Project
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
                <ModuleCard 
                  title="Subtitle Studio" 
                  description="Auto-generate captions for videos with professional styling, real-time editing and presets."
                  icon={Captions}
                  color="bg-creator-purple"
                  onClick={() => setActiveTab('subtitles')}
                />
                <ModuleCard 
                  title="Lyrics Lab" 
                  description="Create perfectly synced .lrc files for your music tracks with AI-assisted word-timing."
                  icon={Music}
                  color="bg-creator-cyan"
                  onClick={() => setActiveTab('lyrics')}
                />
                <ModuleCard 
                  title="Analysis Hub" 
                  description="Detect BPM, Key, and Energy levels for your audio assets. Perfect for DJ workflows."
                  icon={Zap}
                  color="bg-amber-500"
                  onClick={() => setActiveTab('dj')}
                />
                <ModuleCard 
                  title="Karaoke Studio" 
                  description="Transform songs into sing-alongs with word-level motion lyrics and background removal."
                  icon={Mic}
                  color="bg-rose-500"
                  onClick={() => setActiveTab('karaoke')}
                />
              </div>

              {/* Project History */}
              {allProjects.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold uppercase tracking-widest text-zinc-500">Project History</h3>
                    <button 
                      onClick={() => {
                        if(confirm('Clear all projects?')) setAllProjects([]);
                      }}
                      className="text-xs text-red-500 hover:underline uppercase tracking-widest"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {allProjects.slice(0, 6).map((proj) => (
                      <div 
                        key={proj.id}
                        onClick={() => {
                          setCurrentProject(proj);
                          setActiveTab(proj.type === 'lyric' ? 'lyrics' : proj.type === 'karaoke' ? 'karaoke' : 'subtitles');
                        }}
                        className="group p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            proj.type === 'lyric' ? "bg-creator-cyan/20 text-creator-cyan" : 
                            proj.type === 'karaoke' ? "bg-rose-500/20 text-rose-500" :
                            "bg-creator-purple/20 text-creator-purple"
                          )}>
                            {proj.type === 'lyric' ? <Music size={18} /> : proj.type === 'karaoke' ? <Mic size={18} /> : <Video size={18} />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{proj.name}</p>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                              {new Date(proj.createdAt || Date.now()).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setAllProjects(prev => prev.filter(p => p.id !== proj.id));
                          }}
                          className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <section className="flex flex-col lg:flex-row gap-8 md:gap-16 items-center bg-white/[0.02] border border-white/5 rounded-3xl md:rounded-[3rem] p-8 md:p-16 shadow-inner">
                <div className="flex-1 space-y-4 md:space-y-6 text-center lg:text-left">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-creator-purple/20 flex items-center justify-center mx-auto lg:mx-0">
                    <Upload className="text-creator-purple w-6 h-6 md:w-8 md:h-8" />
                  </div>
                  <h3 className="text-2xl md:text-4xl font-bold font-display">Fast Lane Upload</h3>
                  <p className="text-zinc-500 text-sm md:text-lg leading-relaxed">
                    Ready to move fast? Drop your media here and we'll automatically detect 
                    the best module for your content. Supporting all major formats.
                  </p>
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-2 md:pt-4">
                    <div className="px-3 py-1 bg-white/5 rounded-full text-[8px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MP4</div>
                    <div className="px-3 py-1 bg-white/5 rounded-full text-[8px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MOV</div>
                    <div className="px-3 py-1 bg-white/5 rounded-full text-[8px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MP3</div>
                    <div className="px-3 py-1 bg-white/5 rounded-full text-[8px] md:text-[10px] font-bold text-zinc-400 uppercase tracking-widest">WAV</div>
                  </div>
                </div>
                <div className="flex-1 w-full max-w-xl">
                  <UploadZone onUpload={handleUpload} isUploading={isUploading} progress={uploadProgress} />
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'subtitles' && (
            <motion.div key="subtitles" className="h-full flex flex-col">
              {currentProject ? (
                <EditorView 
                  project={currentProject} 
                  setProject={setCurrentProject} 
                  customPresets={customStylePresets}
                  setCustomPresets={setCustomStylePresets}
                />
              ) : (
                <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-8 md:p-16 lg:p-24 gap-12 lg:gap-24 overflow-y-auto">
                   <div className="max-w-xl space-y-8 md:space-y-10 text-center lg:text-left">
                      <div className="space-y-4">
                        <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight">Subtitle <br className="hidden md:block"/><span className="text-creator-purple">Studio</span></h2>
                        <p className="text-zinc-400 text-lg md:text-xl leading-relaxed font-light">
                          Professional grade subtitling powered by Gemini 3. 
                          Generate perfectly timed captions in seconds.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                        <div className="p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-[2rem] space-y-4 hover:bg-white/[0.05] transition-colors group">
                          <Zap className="text-creator-purple group-hover:scale-110 transition-transform" size={32} />
                          <h4 className="font-bold text-lg">Turbo Speed</h4>
                          <p className="text-sm text-zinc-500 font-light">Transcribe minutes of video in blink of an eye.</p>
                        </div>
                        <div className="p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-[2rem] space-y-4 hover:bg-white/[0.05] transition-colors group">
                          <Palette className="text-creator-cyan group-hover:scale-110 transition-transform" size={32} />
                          <h4 className="font-bold text-lg">Pro Styles</h4>
                          <p className="text-sm text-zinc-500 font-light">Apply TikTok, YT, and Netflix style presets.</p>
                        </div>
                      </div>
                   </div>
                   <div className="w-full max-w-lg">
                      <UploadZone onUpload={handleUpload} isUploading={isUploading} progress={uploadProgress} />
                   </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'lyrics' && (
             <motion.div key="lyrics" className="h-full flex flex-col">
                {currentProject?.type === 'lyric' ? (
                  <EditorView 
                    project={currentProject} 
                    setProject={setCurrentProject} 
                    customPresets={customStylePresets}
                    setCustomPresets={setCustomStylePresets}
                  />
                ) : (
                  <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-8 md:p-16 lg:p-24 gap-12 lg:gap-24 overflow-y-auto">
                     <div className="max-w-xl space-y-8 md:space-y-10 text-center lg:text-left">
                        <div className="space-y-4">
                          <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight">Lyrics <br className="hidden md:block"/><span className="text-creator-cyan">Lab</span></h2>
                          <p className="text-zinc-400 text-lg md:text-xl leading-relaxed font-light">
                            Craft high-fidelity time-synced lyrics. 
                            Export .lrc and .srt for Spotify, Apple Music, and beyond.
                          </p>
                        </div>
                        <div className="space-y-4 md:space-y-6">
                          <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-[2rem] md:rounded-[2.5rem] hover:bg-white/[0.05] transition-colors group">
                            <div className="w-16 h-16 rounded-2xl md:rounded-3xl bg-creator-cyan/20 flex items-center justify-center text-creator-cyan shrink-0 group-hover:scale-110 transition-transform">
                               <Music size={32} />
                            </div>
                            <div className="text-center sm:text-left">
                               <h4 className="font-bold text-lg">Word-Level Precision</h4>
                               <p className="text-sm text-zinc-500 font-light">AI-driven synchronization for perfect timing.</p>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-8 p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-[2rem] md:rounded-[2.5rem] hover:bg-white/[0.05] transition-colors group">
                            <div className="w-16 h-16 rounded-2xl md:rounded-3xl bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-110 transition-transform">
                               <Mic size={32} />
                            </div>
                            <div className="text-center sm:text-left">
                               <h4 className="font-bold text-lg">Lyric Verification</h4>
                               <p className="text-sm text-zinc-500 font-light">Cross-reference with the biggest lyric databases.</p>
                            </div>
                          </div>
                        </div>
                     </div>
                     <div className="w-full max-w-lg">
                        <UploadZone onUpload={handleUpload} isUploading={isUploading} progress={uploadProgress} />
                     </div>
                  </div>
                )}
             </motion.div>
          )}

          {activeTab === 'karaoke' && (
            <motion.div 
              key="karaoke" 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="h-full flex flex-col"
            >
               {currentProject && currentProject.type === 'karaoke' ? (
                <EditorView 
                  project={currentProject} 
                  setProject={setCurrentProject}
                  customPresets={customStylePresets}
                  setCustomPresets={setCustomStylePresets}
                />
              ) : (
                <div className="p-8 md:p-16 lg:p-20 max-w-7xl mx-auto w-full space-y-12">
                   <header className="space-y-3">
                      <h2 className="text-4xl md:text-6xl font-bold font-display">Karaoke Studio</h2>
                      <p className="text-zinc-500 text-lg">Create immersive sing-along experiences with motion lyrics.</p>
                   </header>
                   <UploadZone onUpload={handleUpload} isUploading={isUploading} progress={uploadProgress} />
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'dj' && (
            <motion.div key="dj" className="p-6 md:p-12 lg:p-20 max-w-7xl mx-auto space-y-12 md:space-y-20">
                <header className="flex flex-col lg:flex-row justify-between lg:items-end items-start gap-8 border-b border-white/5 pb-10">
                  <div className="space-y-3">
                    <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight">DJ Tools</h2>
                    <p className="text-zinc-400 text-lg md:text-xl font-light">Professional audio analysis for performance and production sync.</p>
                  </div>
                  <div className="flex gap-3 w-full lg:w-auto">
                    <button className="flex-1 lg:flex-none px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] uppercase tracking-widest font-bold hover:bg-white/10 transition-all">Clear All</button>
                    <button className="flex-1 lg:flex-none px-6 py-3 bg-amber-500 rounded-2xl text-[10px] uppercase tracking-widest font-bold shadow-2xl hover:scale-105 transition-all text-black">New Analysis</button>
                  </div>
               </header>
               
               <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 items-stretch relative">
                  <div 
                    style={{ width: window.innerWidth >= 1024 ? djLeftWidth : '100%' }}
                    className="glass-panel p-6 md:p-12 space-y-8 md:space-y-10 bg-white/[0.02] border border-white/10 shrink-0"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl md:text-3xl font-bold flex items-center gap-4">
                        <Zap className="text-amber-500" size={28} /> BPM & Key
                      </h3>
                      <div className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-500 uppercase tracking-widest shrink-0">Real-time</div>
                    </div>
                    
                    <div className="bg-black/20 rounded-[2.5rem] p-4 border border-white/5">
                        <UploadZone onUpload={() => {}} isUploading={false} />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4 md:gap-6">
                      <div className="flex justify-between items-center p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-3xl group hover:border-amber-500/30 transition-all">
                        <div className="space-y-1">
                          <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest block">Estimated BPM</span>
                          <span className="text-2xl md:text-4xl font-mono font-bold text-amber-500 tabular-nums">128.00</span>
                        </div>
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                          <Activity size={20} className="text-amber-500" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-3xl group hover:border-creator-cyan/30 transition-all">
                        <div className="space-y-1">
                          <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest block">Musical Key</span>
                          <span className="text-2xl md:text-4xl font-mono font-bold text-creator-cyan">Am</span>
                        </div>
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-creator-cyan/20 flex items-center justify-center shrink-0">
                          <Music size={20} className="text-creator-cyan" />
                        </div>
                      </div>
                      <div className="p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-3xl space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Energy</span>
                          <span className="text-sm font-mono text-amber-500 font-bold">85%</span>
                        </div>
                        <div className="w-full h-3 md:h-4 bg-white/10 rounded-full overflow-hidden shadow-inner">
                          <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 w-[85%] shadow-[0_0_20px_rgba(245,158,11,0.5)] animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <ResizeHandle 
                    className="hidden lg:flex"
                    onResize={(delta) => setDjLeftWidth(prev => Math.max(350, Math.min(DEFAULT_SIDEBAR_WIDTH * 3, prev + delta)))}
                  />

                  <div className="flex-1 glass-panel p-6 md:p-12 space-y-8 md:space-y-10 bg-white/[0.02] border border-white/10 flex flex-col min-w-0">
                    <h3 className="text-2xl md:text-3xl font-bold flex items-center gap-4">
                      <Monitor className="text-creator-purple" size={28} /> Sync Engine
                    </h3>
                    <p className="text-zinc-400 text-lg md:text-xl leading-relaxed font-light">
                      Calculate exact video playback coefficients to align visuals with audio transients.
                    </p>
                    
                    <div className="flex-1 space-y-8 md:space-y-10 flex flex-col">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8">
                        <div className="space-y-2 md:space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">Source BPM</label>
                          <input type="number" defaultValue={100} className="w-full bg-black/40 border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-6 focus:outline-none focus:ring-2 focus:ring-creator-purple/50 transition-all font-mono text-xl md:text-2xl" />
                        </div>
                        <div className="space-y-2 md:space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">Target BPM</label>
                          <input type="number" defaultValue={128} className="w-full bg-black/40 border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-6 focus:outline-none focus:ring-2 focus:ring-creator-purple/50 transition-all font-mono text-xl md:text-2xl" />
                        </div>
                      </div>
                      
                      <div className="p-8 md:p-12 bg-creator-purple/10 border border-creator-purple/20 rounded-[2rem] md:rounded-[3rem] text-center space-y-4 relative overflow-hidden group flex-1 flex flex-col justify-center min-h-[250px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-creator-purple/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700" />
                        <span className="text-zinc-400 font-bold uppercase text-[10px] tracking-[0.3em] relative z-10">Sync Multiplier</span>
                        <span className="text-5xl md:text-8xl font-bold text-white relative z-10 block tracking-tighter">1.28x</span>
                        <div className="pt-6 relative z-10">
                          <button className="px-8 py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:scale-110 active:scale-95 transition-all shadow-2xl">
                            Apply to Timeline
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" className="p-6 md:p-16 lg:p-20 max-w-7xl mx-auto space-y-12">
               <header className="space-y-3 border-b border-white/5 pb-10">
                  <h2 className="text-4xl md:text-6xl font-bold font-display tracking-tight">Settings</h2>
                  <p className="text-zinc-400 text-lg md:text-xl font-light">Global configurations and system status.</p>
               </header>

               <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 relative">
                  <div 
                    style={{ width: window.innerWidth >= 1024 ? settingsSidebarWidth : '100%' }}
                    className="w-full space-y-3 shrink-0"
                  >
                    <button 
                      onClick={() => setSettingsCategory('api')}
                      className={cn(
                        "w-full text-left p-6 rounded-3xl font-bold flex items-center justify-between group transition-all",
                        settingsCategory === 'api' 
                          ? "bg-creator-purple/10 border border-creator-purple text-creator-purple shadow-lg shadow-purple-500/10" 
                          : "bg-white/[0.02] border border-white/5 text-zinc-500 hover:bg-white/[0.05]"
                      )}
                    >
                       <span>API Configuration</span>
                       <Zap size={20} className={cn("transition-opacity", settingsCategory === 'api' ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                    </button>
                    <button 
                      onClick={() => setSettingsCategory('export')}
                      className={cn(
                        "w-full text-left p-6 rounded-3xl font-bold flex items-center justify-between group transition-all",
                        settingsCategory === 'export' 
                          ? "bg-creator-cyan/10 border border-creator-cyan text-creator-cyan shadow-lg shadow-cyan-500/10" 
                          : "bg-white/[0.02] border border-white/5 text-zinc-500 hover:bg-white/[0.05]"
                      )}
                    >
                       <span>Export Preferences</span>
                       <Download size={20} className={cn("transition-opacity", settingsCategory === 'export' ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                    </button>
                    <button 
                      onClick={() => setSettingsCategory('notifications')}
                      className={cn(
                        "w-full text-left p-6 rounded-3xl font-bold flex items-center justify-between group transition-all",
                        settingsCategory === 'notifications' 
                          ? "bg-amber-500/10 border border-amber-500 text-amber-500 shadow-lg shadow-amber-500/10" 
                          : "bg-white/[0.02] border border-white/5 text-zinc-500 hover:bg-white/[0.05]"
                      )}
                    >
                       <span>Notifications</span>
                       <Bell size={20} className={cn("transition-opacity", settingsCategory === 'notifications' ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                    </button>
                  </div>

                  <ResizeHandle 
                    className="hidden lg:flex"
                    onResize={(delta) => setSettingsSidebarWidth(prev => Math.max(200, Math.min(500, prev + delta)))}
                  />

                  <div className="flex-1 glass-panel p-6 md:p-12 bg-white/[0.01] border border-white/10 rounded-[2rem] md:rounded-[3rem] space-y-12 overflow-hidden relative min-w-0">
                    <AnimatePresence mode="wait">
                      {settingsCategory === 'api' && (
                        <motion.div 
                          key="api-settings"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-4">
                            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-creator-purple" />
                              Gemini 3 Pro API
                            </label>
                            <div className="relative group">
                              <input 
                                type="password" 
                                value={process.env.GEMINI_API_KEY || ''} 
                                readOnly
                                className="w-full bg-black/40 border border-white/10 rounded-2xl md:rounded-3xl p-4 md:p-6 font-mono text-zinc-400 cursor-not-allowed group-hover:border-white/20 transition-all text-sm md:text-xl" 
                              />
                              <Lock className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-700 hidden md:block" size={24} />
                            </div>
                            <p className="text-xs text-zinc-500 px-4 leading-relaxed font-light">This key is securely managed through the platform environment. All requests are proxied via a secure endpoint.</p>
                          </div>

                          <div className="space-y-6">
                            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-creator-cyan" />
                              System Capability
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                               <div className="p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-2xl md:rounded-3xl flex flex-col gap-4">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold">Auto-generate LRC</span>
                                    <button 
                                      onClick={() => setUserPreferences(p => ({ ...p, autoLrc: !p.autoLrc }))}
                                      className={cn(
                                        "w-10 h-5 md:w-12 md:h-6 rounded-full relative transition-colors duration-300",
                                        userPreferences.autoLrc ? "bg-creator-purple" : "bg-zinc-800"
                                      )}
                                    >
                                       <div className={cn(
                                         "absolute top-1 w-3 h-3 md:w-4 md:h-4 bg-white rounded-full shadow-lg transition-all duration-300",
                                         userPreferences.autoLrc ? "right-1" : "left-1"
                                       )} />
                                    </button>
                                  </div>
                                  <p className="text-xs text-zinc-600 font-light leading-relaxed">Automatically generate .lrc sidecar files alongside standard subtitles for music projects.</p>
                               </div>
                               <div className="p-6 md:p-8 bg-white/[0.03] border border-white/5 rounded-2xl md:rounded-3xl flex flex-col gap-4">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold">Smart Punctuations</span>
                                    <button 
                                      onClick={() => setUserPreferences(p => ({ ...p, smartPunctuation: !p.smartPunctuation }))}
                                      className={cn(
                                        "w-10 h-5 md:w-12 md:h-6 rounded-full relative transition-colors duration-300",
                                        userPreferences.smartPunctuation ? "bg-creator-cyan" : "bg-zinc-800"
                                      )}
                                    >
                                       <div className={cn(
                                         "absolute top-1 w-3 h-3 md:w-4 md:h-4 bg-white rounded-full shadow-lg transition-all duration-300",
                                         userPreferences.smartPunctuation ? "right-1" : "left-1"
                                       )} />
                                    </button>
                                  </div>
                                  <p className="text-xs text-zinc-600 font-light leading-relaxed">Apply advanced AI formatting for better readability, including speaker detection.</p>
                               </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {settingsCategory === 'export' && (
                        <motion.div 
                          key="export-settings"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-6">
                            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-creator-cyan" />
                              Default Format
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              {['srt', 'vtt', 'lrc', 'txt'].map(fmt => (
                                <button
                                  key={fmt}
                                  onClick={() => setUserPreferences(p => ({ ...p, exportFormat: fmt }))}
                                  className={cn(
                                    "p-6 rounded-2xl border transition-all font-mono font-bold uppercase text-center",
                                    userPreferences.exportFormat === fmt 
                                      ? "bg-creator-cyan/20 border-creator-cyan text-creator-cyan" 
                                      : "bg-white/[0.02] border-white/10 text-zinc-500 hover:border-white/20"
                                  )}
                                >
                                  {fmt}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl space-y-6">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <h4 className="font-bold">Include Timestamps in TXT</h4>
                                <p className="text-xs text-zinc-600">Add [00:00:00] markers when exporting plain text.</p>
                              </div>
                              <button 
                                onClick={() => setUserPreferences(p => ({ ...p, includeTimestamps: !p.includeTimestamps }))}
                                className={cn(
                                  "w-12 h-6 rounded-full relative transition-colors duration-300",
                                  userPreferences.includeTimestamps ? "bg-creator-cyan" : "bg-zinc-800"
                                )}
                              >
                                 <div className={cn(
                                   "absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300",
                                   userPreferences.includeTimestamps ? "right-1" : "left-1"
                                 )} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {settingsCategory === 'notifications' && (
                        <motion.div 
                          key="notification-settings"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="space-y-8"
                        >
                          <div className="space-y-6">
                             <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl flex items-center justify-between">
                                <div className="flex gap-6 items-center">
                                   <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                                      <Bell size={24} />
                                   </div>
                                   <div className="space-y-1">
                                      <h4 className="font-bold">System Notifications</h4>
                                      <p className="text-xs text-zinc-600">Get notified when batch processing completes.</p>
                                   </div>
                                </div>
                                <button 
                                  onClick={() => setUserPreferences(p => ({ ...p, notifyOnComplete: !p.notifyOnComplete }))}
                                  className={cn(
                                    "w-12 h-6 rounded-full relative transition-colors duration-300",
                                    userPreferences.notifyOnComplete ? "bg-amber-500" : "bg-zinc-800"
                                  )}
                                >
                                   <div className={cn(
                                     "absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300",
                                     userPreferences.notifyOnComplete ? "right-1" : "left-1"
                                   )} />
                                </button>
                             </div>

                             <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl flex items-center justify-between">
                                <div className="flex gap-6 items-center">
                                   <div className="w-12 h-12 rounded-2xl bg-creator-purple/20 flex items-center justify-center text-creator-purple">
                                      <FileText size={24} />
                                   </div>
                                   <div className="space-y-1">
                                      <h4 className="font-bold">Weekly Digest</h4>
                                      <p className="text-xs text-zinc-600">Receive a summary of your workspace activity.</p>
                                   </div>
                                </div>
                                <button 
                                  onClick={() => setUserPreferences(p => ({ ...p, emailSummary: !p.emailSummary }))}
                                  className={cn(
                                    "w-12 h-6 rounded-full relative transition-colors duration-300",
                                    userPreferences.emailSummary ? "bg-creator-purple" : "bg-zinc-800"
                                  )}
                                >
                                   <div className={cn(
                                     "absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg transition-all duration-300",
                                     userPreferences.emailSummary ? "right-1" : "left-1"
                                   )} />
                                </button>
                             </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pt-10 border-t border-white/5 flex gap-4">
                      <button 
                        onClick={() => {
                          localStorage.setItem('autosub_settings', JSON.stringify(userPreferences));
                          const btn = document.getElementById('save-btn');
                          const text = document.getElementById('save-btn-text');
                          const icon = document.getElementById('save-btn-icon');
                          
                          if (btn && text && icon) {
                            text.innerText = "PREFERENCES SAVED";
                            icon.classList.remove('hidden');
                            btn.classList.add('bg-green-500', 'text-white');
                            btn.classList.remove('bg-white', 'text-black');
                            
                            setTimeout(() => { 
                              text.innerText = "SAVE PREFERENCES"; 
                              icon.classList.add('hidden');
                              btn.classList.remove('bg-green-500', 'text-white');
                              btn.classList.add('bg-white', 'text-black');
                            }, 2000);
                          }
                        }}
                        id="save-btn"
                        className="flex-1 py-4 md:py-5 bg-white text-black rounded-2xl md:rounded-[2rem] font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 id="save-btn-icon" className="hidden" size={16} />
                        <span id="save-btn-text">Save Preferences</span>
                      </button>
                    </div>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function UploadZone({ onUpload, isUploading, progress }: { onUpload: (files: File[]) => void, isUploading: boolean, progress?: number }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onUpload,
    accept: { 
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.m4v'],
      'audio/*': ['.mp3', '.wav', '.m4a', '.flac']
    },
    disabled: isUploading,
    multiple: true
  });

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "relative rounded-[2.5rem] md:rounded-[4rem] border-2 border-dashed transition-all duration-500 overflow-hidden cursor-pointer group w-full",
        isDragActive ? "border-creator-purple bg-creator-purple/5 scale-[1.01]" : "border-white/10 hover:border-white/20 bg-white/[0.02]",
        isUploading && "pointer-events-none opacity-80"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center p-10 md:p-24 space-y-6 md:space-y-10 relative z-10 w-full">
        <div className="relative">
          <div className={cn(
            "w-20 h-20 md:w-32 md:h-32 rounded-3xl md:rounded-[2.5rem] flex items-center justify-center transition-all duration-500",
            isDragActive ? "bg-creator-purple text-zinc-900 rotate-12 scale-110 shadow-2xl shadow-purple-500/40" : "bg-white/5 text-zinc-500 group-hover:scale-110"
          )}>
            {isUploading ? (
              <Activity className="animate-spin" size={48} />
            ) : (
              <div className="relative">
                <Upload size={window.innerWidth < 768 ? 32 : 48} />
                <div className="absolute -bottom-2 -right-2 w-8 h-8 md:w-10 md:h-10 bg-creator-cyan text-black rounded-lg md:rounded-xl flex items-center justify-center shadow-xl">
                  <Play size={16} fill="currentColor" />
                </div>
              </div>
            )}
          </div>
          {isUploading && progress !== undefined && (
             <svg className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] -rotate-90">
                <circle 
                  cx="50%" cy="50%" r="48%" 
                  className="fill-none stroke-zinc-800 stroke-[4]"
                />
                <circle 
                  cx="50%" cy="50%" r="48%" 
                  className="fill-none stroke-creator-purple stroke-[4] transition-all duration-500"
                  strokeDasharray={`${progress}, 100`}
                  pathLength="100"
                />
             </svg>
          )}
        </div>
        
        <div className="text-center space-y-3 md:space-y-4">
          <h3 className="text-2xl md:text-5xl font-bold font-display tracking-tight leading-tight">
            {isUploading ? "Magic in Progress..." : isDragActive ? "Release to Create" : "Drop to create."}
          </h3>
          <p className="text-zinc-500 text-sm md:text-xl font-light max-w-lg mx-auto leading-relaxed">
            {isUploading 
              ? `Processing batch: ${Math.round(progress || 0)}% completed` 
              : "Securely upload multiple audio or video tracks. Gemini 3 Pro will transcribe and sync them simultaneously."}
          </p>
        </div>

        <div className="flex items-center gap-4 pt-4 md:pt-8 bg-black/20 px-6 py-4 rounded-3xl border border-white/5 backdrop-blur-sm">
          <div className="flex -space-x-4">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-zinc-900 border-2 border-creator-black flex items-center justify-center text-zinc-600 shadow-xl">
               <Video size={18} />
            </div>
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-zinc-800 border-2 border-creator-black flex items-center justify-center text-zinc-500 shadow-xl z-20">
               <Music size={18} />
            </div>
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-zinc-900 border-2 border-creator-black flex items-center justify-center text-zinc-600 shadow-xl">
               <Mic size={18} />
            </div>
          </div>
          <div className="flex flex-col">
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-zinc-700">Multi-File Processing</p>
            <p className="text-[8px] md:text-[10px] text-zinc-800 font-mono">MP4, MOV, MP3, WAV supported</p>
          </div>
        </div>
      </div>
      
      {/* Background visual flair */}
      <div className="absolute top-0 right-0 p-10 opacity-10 blur-3xl pointer-events-none group-hover:opacity-20 transition-opacity">
         <div className="w-64 h-64 bg-creator-purple rounded-full" />
      </div>
      <div className="absolute bottom-0 left-0 p-10 opacity-10 blur-3xl pointer-events-none group-hover:opacity-20 transition-opacity">
         <div className="w-64 h-64 bg-creator-cyan rounded-full" />
      </div>
    </div>
  );
}

function EditorView({ 
  project, 
  setProject, 
  customPresets = [], 
  setCustomPresets 
}: { 
  project: Project, 
  setProject: (p: Project) => void, 
  customPresets?: StylePreset[],
  setCustomPresets?: (presets: StylePreset[]) => void
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'captions' | 'style'>('captions');
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_EDITOR_SIDEBAR_WIDTH);
  const [controlsHeight, setControlsHeight] = useState(280);
  const [recognizer, setRecognizer] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (waveformRef.current && project.mediaUrl) {
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4b5563',
        progressColor: '#9333ea',
        cursorColor: '#22d3ee',
        barWidth: 2,
        barRadius: 3,
        height: 80,
        normalize: true,
        dragToSeek: true,
      });

      wavesurfer.current.load(project.mediaUrl);
      
      wavesurfer.current.on('timeupdate', (time) => {
        setCurrentTime(time);
        if (videoRef.current && Math.abs(videoRef.current.currentTime - time) > 0.1) {
          videoRef.current.currentTime = time;
        }
      });

      wavesurfer.current.on('interaction', (newTime) => {
        setCurrentTime(newTime);
        if (videoRef.current) videoRef.current.currentTime = newTime;
      });

      return () => wavesurfer.current?.destroy();
    }
  }, [project.mediaUrl]);

  useEffect(() => {
    // Speech Recognition Setup
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[result.length - 1])
          .map((result: any) => result.transcript)
          .join('');
        
        // Find the caption current at playback time
        const activeIdx = project.captions.findIndex(c => currentTime >= c.start && currentTime <= c.end);
        
        if (activeIdx !== -1) {
          const newCaptions = [...project.captions];
          newCaptions[activeIdx] = { ...newCaptions[activeIdx], text: transcript };
          setProject({ ...project, captions: newCaptions });
        } else if (project.captions.length > 0) {
          // Fallback to last caption if none active
          const lastIdx = project.captions.length - 1;
          const newCaptions = [...project.captions];
          newCaptions[lastIdx] = { ...newCaptions[lastIdx], text: transcript };
          setProject({ ...project, captions: newCaptions });
        }
      };
      recognition.onend = () => setIsRecording(false);
      setRecognizer(recognition);
    }
  }, [project.captions]);

  const toggleRecording = () => {
    if (!recognizer) return alert("Speech recognition not supported in this browser.");
    if (isRecording) {
      recognizer.stop();
    } else {
      recognizer.start();
      setIsRecording(true);
    }
  };

  const togglePlay = () => {
    if (!wavesurfer.current) return;
    wavesurfer.current.playPause();
    setIsPlaying(!isPlaying);
  };

  const activeCaption = project.captions.find(c => currentTime >= c.start && currentTime <= c.end);

  const exportSRT = () => {
    let srt = '';
    project.captions.forEach((cap, i) => {
      srt += `${i + 1}\n`;
      srt += `${formatTime(cap.start)} --> ${formatTime(cap.end)}\n`;
      srt += `${cap.text}\n\n`;
    });
    downloadFile(srt, `${project.name}.srt`);
  };

  const exportLRC = () => {
    let lrc = '';
    project.captions.forEach((cap) => {
      const min = Math.floor(cap.start / 60).toString().padStart(2, '0');
      const sec = (cap.start % 60).toFixed(2).padStart(5, '0');
      lrc += `[${min}:${sec}]${cap.text}\n`;
    });
    downloadFile(lrc, `${project.name}.lrc`);
  };

  const formatTime = (seconds: number) => {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12);
    return time.replace('.', ',');
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 relative">
      {/* Left: Preview */}
      <div className="flex-1 flex flex-col bg-black/40 overflow-hidden relative">
        <div className="flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
          <div className="aspect-video relative rounded-xl sm:rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/5 shrink-0">
            {project.mediaUrl?.includes('video') || project.name.match(/\.(mp4|mov|avi)$/i) ? (
              <video 
                ref={videoRef}
                src={project.mediaUrl}
                className="w-full h-full object-contain"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onClick={togglePlay}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                 <Music size={48} className="text-zinc-700" />
              </div>
            )}
            
            {/* Caption Overlay */}
            <AnimatePresence>
              {activeCaption && (
                <motion.div
                  key={activeCaption.id}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className={cn(
                    "absolute left-1/2 -translate-x-1/2 w-full max-w-[85%] text-center px-4 py-2 pointer-events-none drop-shadow-2xl",
                    project.style.position === 'bottom' ? "bottom-6 md:bottom-12" : project.style.position === 'top' ? "top-6 md:top-12" : "top-1/2 -translate-y-1/2"
                  )}
                >
                  <span 
                    className="px-3 md:px-4 py-1.5 md:py-2 rounded-lg inline-block whitespace-pre-wrap leading-tight"
                    style={{
                      fontFamily: project.style.fontFamily,
                      fontSize: `${Math.max(14, project.style.fontSize * (window.innerWidth < 768 ? 0.7 : 1))}px`,
                      color: project.style.color,
                      backgroundColor: project.style.backgroundColor,
                      fontWeight: project.style.bold ? 'bold' : 'normal',
                      fontStyle: project.style.italic ? 'italic' : 'normal',
                    }}
                  >
                    {project.type === 'karaoke' ? (
                      <KaraokeWords 
                        text={activeCaption.text} 
                        start={activeCaption.start} 
                        end={activeCaption.end} 
                        currentTime={currentTime} 
                        activeColor={project.style.color === '#ffffff' ? '#22d3ee' : '#9333ea'}
                      />
                    ) : activeCaption.text}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Vertical Resize Handle */}
        <ResizeHandle 
          direction="vertical" 
          className="hidden md:flex"
          onResize={(delta) => setControlsHeight(prev => Math.max(150, Math.min(500, prev - delta)))} 
        />

        {/* Controls */}
        <div 
          style={{ height: window.innerWidth >= 768 ? controlsHeight : 'auto' }}
          className="glass-panel p-4 sm:p-6 shadow-2xl shrink-0 overflow-y-auto"
        >
          <div 
            ref={waveformRef} 
            className="mb-4 sm:mb-6 rounded-xl overflow-hidden bg-black/20 h-16 sm:h-24" 
          />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 md:gap-6">
            <div className="flex items-center gap-4 md:gap-6 w-full sm:w-auto justify-center sm:justify-start">
              <button onClick={togglePlay} className="w-11 h-11 md:w-14 md:h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 shadow-lg transition-all active:scale-95 shrink-0">
                {isPlaying ? <Pause fill="currentColor" size={18} className="md:w-6 md:h-6" /> : <Play fill="currentColor" size={18} className="md:w-6 md:h-6 ml-1" />}
              </button>
              <div className="flex flex-col">
                <span className="font-mono text-xs md:text-lg font-bold text-white leading-none">
                  {formatTime(currentTime).split(',')[0]}
                </span>
                <span className="font-mono text-[8px] md:text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
                  Total: {formatTime(videoRef.current?.duration || 0).split(',')[0]}
                </span>
              </div>
              <button 
                onClick={toggleRecording}
                className={cn(
                  "p-2.5 md:p-4 rounded-xl md:rounded-2xl transition-all border flex items-center gap-2",
                  isRecording ? "bg-red-500/20 border-red-500 text-red-500 animate-pulse" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                )}
              >
                <Mic className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider hidden sm:inline">{isRecording ? "Recording..." : "Voice Input"}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-center sm:justify-end">
              <div className="relative group flex-1 sm:flex-none">
                <button className="w-full flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl md:rounded-2xl text-[10px] md:text-sm font-bold transition-all transform active:scale-95">
                  <Download className="w-[14px] h-[14px] md:w-[18px] md:h-[18px]" /> <span>Export</span>
                </button>
                <div className="absolute bottom-full right-0 mb-3 hidden group-hover:block glass-panel p-3 min-w-[180px] md:min-w-[200px] shadow-2xl border border-white/10 divide-y divide-white/5 animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
                  <div className="pb-2 mb-2">
                    <p className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 px-3">Formats</p>
                    <button onClick={exportSRT} className="w-full text-left px-3 py-2 md:py-2.5 hover:bg-creator-purple/20 rounded-xl text-xs md:text-sm transition-colors flex items-center justify-between">
                      <span>SRT (Subtitles)</span>
                      <span className="text-[8px] md:text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase">Text</span>
                    </button>
                    <button onClick={exportLRC} className="w-full text-left px-3 py-2 md:py-2.5 hover:bg-creator-cyan/20 rounded-xl text-xs md:text-sm transition-colors flex items-center justify-between">
                      <span>LRC (Lyrics)</span>
                      <span className="text-[8px] md:text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase">Synced</span>
                    </button>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  alert("Project '" + project.name + "' saved successfully!");
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-creator-purple text-white rounded-xl md:rounded-2xl text-[10px] md:text-sm font-bold shadow-2xl shadow-purple-500/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Save className="w-[14px] h-[14px] md:w-[18px] md:h-[18px]" /> <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Resize handle between preview and sidebar */}
      <ResizeHandle 
        className="hidden lg:flex"
        onResize={(delta) => setSidebarWidth(prev => Math.max(MIN_EDITOR_SIDEBAR_WIDTH, Math.min(MAX_EDITOR_SIDEBAR_WIDTH, prev - delta)))}
      />

      {/* Right: Editor Sidebar */}
      <div 
        style={{ width: window.innerWidth >= 1024 ? sidebarWidth : '100%' }}
        className="w-full lg:border-t-0 lg:border-l border-white/5 flex flex-col bg-zinc-950/40 h-80 lg:h-auto shrink-0 relative"
      >
        <div className="flex border-b border-white/5">
          <button 
            onClick={() => setActiveTab('captions')}
            className={cn("flex-1 py-4 text-sm font-bold transition-all", activeTab === 'captions' ? "border-b-2 border-creator-purple text-white" : "text-zinc-500 hover:text-white")}
          >
            Captions
          </button>
          <button 
            onClick={() => setActiveTab('style')}
            className={cn("flex-1 py-4 text-sm font-bold transition-all", activeTab === 'style' ? "border-b-2 border-creator-purple text-white" : "text-zinc-500 hover:text-white")}
          >
            Style
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {activeTab === 'captions' ? (
            <div className="space-y-4">
              {project.captions.map((cap) => (
                <div 
                  key={cap.id} 
                  className={cn(
                    "p-6 rounded-2xl border transition-all cursor-pointer group",
                    currentTime >= cap.start && currentTime <= cap.end 
                      ? "bg-creator-purple/10 border-creator-purple/50 shadow-2xl shadow-purple-500/10 scale-[1.02]" 
                      : "bg-white/5 border-transparent hover:border-white/10"
                  )}
                  onClick={() => {
                    if (videoRef.current) videoRef.current.currentTime = cap.start;
                    if (wavesurfer.current) wavesurfer.current.setTime(cap.start);
                  }}
                >
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", currentTime >= cap.start && currentTime <= cap.end ? "bg-creator-purple animate-pulse" : "bg-zinc-700")} />
                        <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-tighter">
                          {formatTime(cap.start).split(',')[0]} → {formatTime(cap.end).split(',')[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-creator-cyan"
                          title="Jump to time"
                        >
                          <ChevronRight size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newCaptions = project.captions.filter(c => c.id !== cap.id);
                            setProject({ ...project, captions: newCaptions });
                          }}
                          className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-lg text-red-500 transition-all"
                          title="Delete caption"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  <textarea 
                    className="w-full bg-white/5 p-3 rounded-xl border border-white/5 resize-none focus:outline-none focus:ring-1 focus:ring-creator-purple/30 text-sm leading-relaxed"
                    value={cap.text}
                    rows={2}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const newCaptions = project.captions.map(c => c.id === cap.id ? { ...c, text: e.target.value } : c);
                      setProject({ ...project, captions: newCaptions });
                    }}
                  />
                </div>
              ))}
              <button 
                onClick={() => {
                  const lastCap = project.captions[project.captions.length - 1];
                  const start = lastCap ? lastCap.end + 1 : 0;
                  const end = start + 3;
                  const newCap = { id: Date.now().toString(), start, end, text: "New caption text" };
                  setProject({ ...project, captions: [...project.captions, newCap] });
                }}
                className="w-full py-5 border-2 border-dashed border-white/5 rounded-3xl text-zinc-500 hover:text-white hover:border-white/10 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus size={20} className="group-hover:rotate-90 transition-transform" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Add Caption Block</span>
              </button>
            </div>
          ) : (
            <div className="space-y-8 bg-black/20 p-6 rounded-3xl border border-white/5">
              <div className="flex justify-between items-center mb-2 px-2">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Global Properties</h4>
                <button 
                  onClick={() => {
                    const name = prompt("Name your preset:");
                    if (name && setCustomPresets) {
                      setCustomPresets([...customPresets, { id: Date.now().toString(), name, style: { ...project.style } }]);
                    }
                  }}
                  className="p-2 bg-creator-purple/20 text-creator-purple hover:bg-creator-purple hover:text-white rounded-xl transition-all"
                  title="Save Current Style"
                >
                  <Save size={14} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="px-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 block">Font family</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Inter', 'Space Grotesk', 'JetBrains Mono', 'serif'].map(font => (
                      <button
                        key={font}
                        onClick={() => setProject({ ...project, style: { ...project.style, fontFamily: font } })}
                        className={cn(
                          "py-2.5 px-3 rounded-xl text-[11px] font-medium border transition-all text-center",
                          project.style.fontFamily === font ? "bg-creator-purple border-creator-purple text-white shadow-lg" : "bg-white/5 border-white/5 text-zinc-400 hover:border-white/20"
                        )}
                        style={{ fontFamily: font }}
                      >
                        {font === 'Space Grotesk' ? 'Grotesk' : font}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-2">
                  <div className="flex justify-between mb-3 items-end">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Size</label>
                    <span className="text-xs font-mono text-creator-cyan">{project.style.fontSize}px</span>
                  </div>
                  <input 
                    type="range" min="12" max="72" 
                    value={project.style.fontSize}
                    onChange={(e) => setProject({ ...project, style: { ...project.style, fontSize: parseInt(e.target.value) } })}
                    className="w-full accent-creator-purple h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="px-2 grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 block">Text Color</label>
                    <div className="relative group">
                      <input 
                        type="color" 
                        value={project.style.color}
                        onChange={(e) => setProject({ ...project, style: { ...project.style, color: e.target.value } })}
                        className="w-full h-10 bg-transparent cursor-pointer rounded-xl overflow-hidden border border-white/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 block">Box BG</label>
                    <input 
                      type="color" 
                      value={project.style.backgroundColor}
                      onChange={(e) => setProject({ ...project, style: { ...project.style, backgroundColor: e.target.value } })}
                      className="w-full h-10 bg-transparent cursor-pointer rounded-xl overflow-hidden border border-white/10"
                    />
                  </div>
                </div>

                <div className="px-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 block">Screen Position</label>
                  <div className="flex p-1 bg-white/5 rounded-2xl border border-white/5">
                    {(['top', 'middle', 'bottom'] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setProject({ ...project, style: { ...project.style, position: pos } })}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-tighter transition-all",
                          project.style.position === pos ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Style Presets Quick Access */}
        <div className="p-6 bg-white/5 border-t border-white/5 mt-auto">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Presets library</h4>
            {customPresets.length > 0 && (
              <span className="text-[10px] bg-creator-purple/20 text-creator-purple px-1.5 rounded font-mono">{customPresets.length}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => setProject({ ...project, style: { ...DEFAULT_STYLE, fontFamily: 'Inter', bold: true, backgroundColor: 'rgba(0,0,0,0.8)' } })}
              className="p-3 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-bold hover:border-creator-purple/50 transition-all text-left group"
            >
              <div className="w-8 h-1 bg-creator-purple mb-2 rounded-full group-hover:w-12 transition-all" />
              TikTok Pro
            </button>
            <button 
              onClick={() => setProject({ ...project, style: { ...DEFAULT_STYLE, fontFamily: 'serif', italic: true, backgroundColor: 'transparent', color: '#ffffff' } })}
              className="p-3 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-bold hover:border-creator-cyan/50 transition-all text-left group"
            >
              <div className="w-8 h-1 bg-creator-cyan mb-2 rounded-full group-hover:w-12 transition-all" />
              YT Minimal
            </button>
            
            {customPresets.map(preset => (
              <button 
                key={preset.id}
                onClick={() => setProject({ ...project, style: { ...preset.style } })}
                className="p-3 bg-white/5 border border-white/5 rounded-2xl text-[11px] font-bold hover:border-white/20 transition-all text-left relative group truncate"
                title={preset.name}
              >
                <div className="w-8 h-1 mb-2 rounded-full" style={{ backgroundColor: preset.style.color }} />
                <span>{preset.name}</span>
                <Trash2 
                  size={10} 
                  className="absolute top-2 right-2 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (setCustomPresets) setCustomPresets(customPresets.filter(p => p.id !== preset.id));
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
