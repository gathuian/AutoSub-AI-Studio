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
  Plus,
  ChevronRight,
  ChevronLeft,
  Menu,
  Mic,
  Monitor,
  FileText,
  Save,
  AlertCircle,
  Activity,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import WaveSurfer from 'wavesurfer.js';
import { GoogleGenAI, Type } from "@google/genai";
import { cn, Caption, Project, DEFAULT_STYLE, CaptionStyle, StylePreset } from './types';

// --- Gemini Service ---
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const getErrorMessage = (err: any) => {
  if (err.message?.includes("API_KEY")) return "Invalid API Key. Please check your settings.";
  if (err.message?.includes("too large")) return "File is too large for the browser (max 20MB).";
  if (err.message?.includes("aborted")) return "Request timed out. Try a smaller file or a faster connection.";
  return err.message || "An unexpected error occurred during transcription.";
};

async function transcribeWithGemini(file: File): Promise<any[]> {
  // Check file size (20MB limit for inlineData to avoid 'signal is aborted' or timeout issues)
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File is too large (max 20MB). Large files often cause connection timeouts in the browser. Please use a smaller clip or compress the file.");
  }

  const model = genAI.models.generateContent({
    model: "gemini-3-flash-preview", 
    contents: [
      {
        inlineData: {
          mimeType: file.type,
          data: await fileToBase64(file),
        },
      },
      {
        text: "Transcribe this audio/video. Return the output as a JSON array of caption objects.",
      },
    ],
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

  try {
    const result = await model;
    const text = result.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (e: any) {
    console.error("Gemini Transcription Error:", e);
    if (e.message?.includes("aborted") || e.name === "AbortError") {
      throw new Error("The request was aborted. This often happens due to a network timeout or file size limits. Try a smaller file or a faster connection.");
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
    title={collapsed ? label : ""}
    className={cn(
      "w-full flex items-center rounded-xl transition-all duration-200 group relative",
      collapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
      active ? "bg-creator-purple text-white shadow-lg shadow-purple-500/20" : "text-zinc-400 hover:bg-white/5 hover:text-white"
    )}
  >
    <Icon size={20} className={cn("shrink-0 transition-transform", active ? "scale-110" : "group-hover:scale-110")} />
    {!collapsed && <span className="font-medium truncate">{label}</span>}
    {collapsed && active && (
       <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full" />
    )}
  </button>
);

const ModuleCard = ({ title, description, icon: Icon, color, onClick }: { title: string, description: string, icon: any, color: string, onClick: () => void }) => (
  <motion.div
    whileHover={{ y: -5, scale: 1.02 }}
    onClick={onClick}
    className="glass-panel p-8 cursor-pointer group relative overflow-hidden flex items-center gap-8 border border-white/5 hover:border-white/10 transition-all"
  >
    <div className={cn("absolute -top-10 -right-10 w-48 h-48 blur-3xl opacity-20 rounded-full", color)} />
    <div className={cn("w-20 h-20 shrink-0 rounded-3xl flex items-center justify-center relative z-10 shadow-2xl shadow-black/50", color)}>
      <Icon className="text-white" size={32} />
    </div>
    <div className="space-y-2 relative z-10">
      <h3 className="text-2xl font-bold font-display group-hover:text-creator-purple transition-colors">{title}</h3>
      <p className="text-zinc-500 font-light leading-relaxed text-sm">{description}</p>
      <div className="pt-2 flex items-center text-xs font-bold uppercase tracking-[0.2em] text-creator-cyan opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
        Launch Studio <ChevronRight size={14} className="ml-1" />
      </div>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'subtitles' | 'lyrics' | 'dj' | 'settings'>('home');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [customStylePresets, setCustomStylePresets] = useState<StylePreset[]>(() => {
    const saved = localStorage.getItem('autosub_presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<{ message: string, suggestion: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('autosub_presets', JSON.stringify(customStylePresets));
  }, [customStylePresets]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const captionsData = await transcribeWithGemini(file);
      
      const newProject: Project = {
        id: Date.now().toString(),
        name: file.name,
        type: activeTab === 'lyrics' ? 'lyric' : 'subtitle',
        captions: captionsData.map((c: any, i: number) => ({ 
          id: i.toString(),
          start: Number(c.start) || 0,
          end: Number(c.end) || 0,
          text: String(c.text) || ""
        })),
        style: JSON.parse(JSON.stringify(DEFAULT_STYLE)),
        mediaUrl: URL.createObjectURL(file),
      };
      
      setAllProjects(prev => [...prev, newProject]);
      setCurrentProject(newProject);
      if (activeTab === 'home') setActiveTab('subtitles');
    } catch (err: any) {
      console.error("Upload failed", err);
      const msg = getErrorMessage(err);
      setError({
        message: msg,
        suggestion: msg.includes("large") ? "Compress your video or use an audio-only track." : "Check your connection and GEMINI_API_KEY."
      });
    } finally {
      setIsUploading(false);
    }
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
    <div className="flex h-screen bg-creator-black overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className={cn(
        "border-r border-white/5 flex flex-col p-4 transition-all duration-300 ease-in-out",
        isSidebarCollapsed ? "w-20" : "w-72"
      )}>
        <div className={cn("flex items-center mb-10 px-2", isSidebarCollapsed ? "justify-center" : "justify-between")}>
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
            {isSidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <nav className="flex-1 flex flex-col gap-3">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'home'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('home')} />
          <SidebarItem icon={Captions} label="Subtitle Studio" active={activeTab === 'subtitles'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('subtitles')} />
          <SidebarItem icon={Music} label="Lyrics Lab" active={activeTab === 'lyrics'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('lyrics')} />
          <SidebarItem icon={Zap} label="DJ Tools" active={activeTab === 'dj'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('dj')} />
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <SidebarItem icon={Settings} label="Settings" active={activeTab === 'settings'} collapsed={isSidebarCollapsed} onClick={() => setActiveTab('settings')} />
        </div>
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
              className="p-20 max-w-7xl mx-auto space-y-24"
            >
              <header className="flex flex-col lg:flex-row justify-between items-start gap-12 border-b border-white/5 pb-16">
                <div className="space-y-6">
                  <h2 className="text-7xl font-bold font-display tracking-tight leading-none">
                    Welcome back, <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-creator-purple via-creator-cyan to-creator-purple bg-[length:200%_auto] animate-gradient-x">Creator Studio</span>
                  </h2>
                  <p className="text-zinc-400 text-xl max-w-2xl leading-relaxed font-light">
                    Elevate your content with professional AI tools. 
                    Transcription, synchronization, and analysis in one unified platform.
                  </p>
                </div>
                <div className="flex gap-4">
                  {allProjects.length > 0 && (
                    <button 
                      onClick={handleBatchExport}
                      className="flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all font-bold group shadow-2xl"
                    >
                      <Download className="text-creator-cyan group-hover:scale-110 transition-transform" size={20} />
                      <span className="uppercase tracking-widest text-xs">Batch Export ({allProjects.length})</span>
                    </button>
                  )}
                  <button className="flex items-center gap-3 px-8 py-4 bg-creator-purple rounded-2xl font-bold shadow-2xl hover:scale-105 transition-all text-sm uppercase tracking-widest">
                    <Plus size={20} /> New Project
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <ModuleCard 
                  title="Subtitle Studio" 
                  description="Auto-generate captions for videos with professional styling, real-time editing and presets."
                  icon={Captions}
                  color="bg-creator-purple"
                  onClick={() => setActiveTab('subtitles')}
                />
                <ModuleCard 
                  title="Lyrics Lab" 
                  description="Create time-synced .lrc and .srt files for music with word-level AI precision."
                  icon={Music}
                  color="bg-creator-cyan"
                  onClick={() => setActiveTab('lyrics')}
                />
                <ModuleCard 
                  title="DJ Tools" 
                  description="Professional BPM detection, musical key analysis, and video sync calculations."
                  icon={Zap}
                  color="bg-amber-500"
                  onClick={() => setActiveTab('dj')}
                />
              </div>

              <section className="flex flex-col lg:flex-row gap-16 items-center bg-white/[0.02] border border-white/5 rounded-[3rem] p-16 shadow-inner">
                <div className="flex-1 space-y-6">
                  <div className="w-16 h-16 rounded-2xl bg-creator-purple/20 flex items-center justify-center">
                    <Upload className="text-creator-purple" size={32} />
                  </div>
                  <h3 className="text-4xl font-bold font-display">Fast Lane Upload</h3>
                  <p className="text-zinc-500 text-lg leading-relaxed">
                    Ready to move fast? Drop your media here and we'll automatically detect 
                    the best module for your content. Supporting all major formats.
                  </p>
                  <div className="flex items-center gap-3 pt-4">
                    <div className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MP4</div>
                    <div className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MOV</div>
                    <div className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-bold text-zinc-400 uppercase tracking-widest">MP3</div>
                    <div className="px-4 py-2 bg-white/5 rounded-full text-[10px] font-bold text-zinc-400 uppercase tracking-widest">WAV</div>
                  </div>
                </div>
                <div className="flex-1 w-full max-w-xl">
                  <UploadZone onUpload={handleUpload} isUploading={isUploading} />
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
                <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-24 gap-24">
                   <div className="max-w-xl space-y-10">
                      <div className="space-y-4">
                        <h2 className="text-6xl font-bold font-display tracking-tight">Subtitle <br/><span className="text-creator-purple">Studio</span></h2>
                        <p className="text-zinc-400 text-xl leading-relaxed font-light">
                          Professional grade subtitling powered by Gemini 3. 
                          Generate perfectly timed captions in seconds.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-8 bg-white/[0.03] border border-white/5 rounded-[2rem] space-y-4 hover:bg-white/[0.05] transition-colors">
                          <Zap className="text-creator-purple" size={32} />
                          <h4 className="font-bold text-lg">Turbo Speed</h4>
                          <p className="text-sm text-zinc-500 font-light">Transcribe minutes of video in blink of an eye.</p>
                        </div>
                        <div className="p-8 bg-white/[0.03] border border-white/5 rounded-[2rem] space-y-4 hover:bg-white/[0.05] transition-colors">
                          <Palette className="text-creator-cyan" size={32} />
                          <h4 className="font-bold text-lg">Pro Styles</h4>
                          <p className="text-sm text-zinc-500 font-light">Apply TikTok, YT, and Netflix style presets.</p>
                        </div>
                      </div>
                   </div>
                   <div className="w-full max-w-lg">
                      <UploadZone onUpload={handleUpload} isUploading={isUploading} />
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
                  <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-24 gap-24">
                     <div className="max-w-xl space-y-10">
                        <div className="space-y-4">
                          <h2 className="text-6xl font-bold font-display tracking-tight">Lyrics <br/><span className="text-creator-cyan">Lab</span></h2>
                          <p className="text-zinc-400 text-xl leading-relaxed font-light">
                            Craft high-fidelity time-synced lyrics. 
                            Export .lrc and .srt for Spotify, Apple Music, and beyond.
                          </p>
                        </div>
                        <div className="space-y-6">
                          <div className="flex items-center gap-8 p-8 bg-white/[0.03] border border-white/5 rounded-[2.5rem] hover:bg-white/[0.05] transition-colors">
                            <div className="w-16 h-16 rounded-3xl bg-creator-cyan/20 flex items-center justify-center text-creator-cyan">
                               <Music size={32} />
                            </div>
                            <div>
                               <h4 className="font-bold text-lg">Word-Level Precision</h4>
                               <p className="text-sm text-zinc-500 font-light">AI-driven synchronization for perfect timing.</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-8 p-8 bg-white/[0.03] border border-white/5 rounded-[2.5rem] hover:bg-white/[0.05] transition-colors">
                            <div className="w-16 h-16 rounded-3xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                               <Mic size={32} />
                            </div>
                            <div>
                               <h4 className="font-bold text-lg">Lyric Verification</h4>
                               <p className="text-sm text-zinc-500 font-light">Cross-reference with the biggest lyric databases.</p>
                            </div>
                          </div>
                        </div>
                     </div>
                     <div className="w-full max-w-lg">
                        <UploadZone onUpload={handleUpload} isUploading={isUploading} />
                     </div>
                  </div>
                )}
             </motion.div>
          )}

          {activeTab === 'dj' && (
            <motion.div key="dj" className="p-20 max-w-7xl mx-auto space-y-20">
               <header className="flex flex-col lg:flex-row justify-between items-end gap-8 border-b border-white/5 pb-10">
                  <div className="space-y-3">
                    <h2 className="text-6xl font-bold font-display tracking-tight">DJ Tools</h2>
                    <p className="text-zinc-400 text-xl font-light">Professional audio analysis for performance and production sync.</p>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] uppercase tracking-widest font-bold hover:bg-white/10 transition-all">Clear All</button>
                    <button className="px-6 py-3 bg-amber-500 rounded-2xl text-[10px] uppercase tracking-widest font-bold shadow-2xl hover:scale-105 transition-all text-black">New Analysis</button>
                  </div>
               </header>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                  <div className="glass-panel p-12 space-y-10 bg-white/[0.02] border border-white/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-3xl font-bold flex items-center gap-4">
                        <Zap className="text-amber-500" size={32} /> BPM & Key
                      </h3>
                      <div className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-500 uppercase tracking-widest">Real-time</div>
                    </div>
                    
                    <div className="bg-black/20 rounded-[2.5rem] p-4 border border-white/5">
                       <UploadZone onUpload={() => {}} isUploading={false} />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                      <div className="flex justify-between items-center p-8 bg-white/[0.03] border border-white/5 rounded-3xl group hover:border-amber-500/30 transition-all">
                        <div className="space-y-1">
                          <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest block">Estimated BPM</span>
                          <span className="text-4xl font-mono font-bold text-amber-500 tabular-nums">128.00</span>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                          <Activity size={24} className="text-amber-500" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center p-8 bg-white/[0.03] border border-white/5 rounded-3xl group hover:border-creator-cyan/30 transition-all">
                        <div className="space-y-1">
                          <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest block">Musical Key</span>
                          <span className="text-4xl font-mono font-bold text-creator-cyan">Am</span>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-creator-cyan/20 flex items-center justify-center">
                          <Music size={24} className="text-creator-cyan" />
                        </div>
                      </div>
                      <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Track Energy</span>
                          <span className="text-sm font-mono text-amber-500 font-bold">85%</span>
                        </div>
                        <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden shadow-inner">
                          <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 w-[85%] shadow-[0_0_20px_rgba(245,158,11,0.5)] animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel p-12 space-y-10 bg-white/[0.02] border border-white/10 flex flex-col">
                    <h3 className="text-3xl font-bold flex items-center gap-4">
                      <Monitor className="text-creator-purple" size={32} /> Sync Engine
                    </h3>
                    <p className="text-zinc-400 text-xl leading-relaxed font-light">
                      Calculate exact video playback coefficients to align visuals with audio transients.
                    </p>
                    
                    <div className="flex-1 space-y-10">
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">Source BPM</label>
                          <input type="number" defaultValue={100} className="w-full bg-black/40 border border-white/10 rounded-3xl p-6 focus:outline-none focus:ring-2 focus:ring-creator-purple/50 transition-all font-mono text-2xl" />
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-2">Target BPM</label>
                          <input type="number" defaultValue={128} className="w-full bg-black/40 border border-white/10 rounded-3xl p-6 focus:outline-none focus:ring-2 focus:ring-creator-purple/50 transition-all font-mono text-2xl" />
                        </div>
                      </div>
                      
                      <div className="p-12 bg-creator-purple/10 border border-creator-purple/20 rounded-[3rem] text-center space-y-4 relative overflow-hidden group flex-1 flex flex-col justify-center">
                        <div className="absolute inset-0 bg-gradient-to-br from-creator-purple/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-700" />
                        <span className="text-zinc-400 font-bold uppercase text-[10px] tracking-[0.3em] relative z-10">Sync Multiplier</span>
                        <span className="text-8xl font-bold text-white relative z-10 block tracking-tighter">1.28x</span>
                        <div className="pt-8 relative z-10">
                          <button className="px-10 py-4 bg-white text-black rounded-2xl font-bold uppercase tracking-widest text-xs hover:scale-110 active:scale-95 transition-all shadow-2xl">
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
            <motion.div key="settings" className="p-20 max-w-7xl mx-auto space-y-16">
               <header className="space-y-3 border-b border-white/5 pb-10">
                  <h2 className="text-6xl font-bold font-display tracking-tight">Settings</h2>
                  <p className="text-zinc-400 text-xl font-light">Global configurations and system status.</p>
               </header>

               <div className="flex flex-col lg:flex-row gap-16">
                  <div className="w-full lg:w-96 space-y-4">
                    <button className="w-full text-left p-6 bg-creator-purple/10 border border-creator-purple text-creator-purple rounded-3xl font-bold flex items-center justify-between group">
                       <span>API Configuration</span>
                       <Zap size={20} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <button className="w-full text-left p-6 bg-white/[0.02] border border-white/5 text-zinc-500 rounded-3xl font-medium hover:bg-white/[0.05] transition-all">
                       Export Preferences
                    </button>
                    <button className="w-full text-left p-6 bg-white/[0.02] border border-white/5 text-zinc-500 rounded-3xl font-medium hover:bg-white/[0.05] transition-all">
                       Notifications
                    </button>
                  </div>

                  <div className="flex-1 glass-panel p-12 bg-white/[0.01] border border-white/10 rounded-[3rem] space-y-12">
                    <div className="space-y-8">
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
                            className="w-full bg-black/40 border border-white/10 rounded-3xl p-6 font-mono text-zinc-400 cursor-not-allowed group-hover:border-white/20 transition-all text-xl" 
                          />
                          <Lock className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-700" size={24} />
                        </div>
                        <p className="text-xs text-zinc-500 px-4 leading-relaxed font-light">This key is securely managed through the platform environment. All requests are proxied via a secure endpoint.</p>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-creator-cyan" />
                          System Capability
                        </label>
                        <div className="grid grid-cols-2 gap-6">
                           <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl flex flex-col gap-6">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold">Auto-generate LRC</span>
                                <div className="w-12 h-6 bg-creator-purple rounded-full relative">
                                   <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-lg" />
                                </div>
                              </div>
                              <p className="text-xs text-zinc-600 font-light leading-relaxed">Automatically generate .lrc sidecar files alongside standard subtitles for music projects.</p>
                           </div>
                           <div className="p-8 bg-white/[0.03] border border-white/5 rounded-3xl flex flex-col gap-6">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold">Smart Punctuations</span>
                                <div className="w-12 h-6 bg-creator-cyan rounded-full relative">
                                   <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-lg" />
                                </div>
                              </div>
                              <p className="text-xs text-zinc-600 font-light leading-relaxed">Apply advanced AI formatting for better readability, including speaker detection.</p>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-10 border-t border-white/5 flex gap-4">
                      <button className="flex-1 py-5 bg-white text-black rounded-[2rem] font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl uppercase tracking-widest text-xs">
                        Save Preferences
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

function UploadZone({ onUpload, isUploading }: { onUpload: (file: File) => void, isUploading: boolean }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onUpload(files[0]),
    accept: {
      'video/*': ['.mp4', '.mov', '.avi'],
      'audio/*': ['.mp3', '.wav', '.m4a']
    },
    multiple: false
  });

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "w-full max-w-xl p-12 rounded-3xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center",
        isDragActive ? "border-creator-cyan bg-creator-cyan/5" : "border-white/10 hover:border-white/20 hover:bg-white/5",
        isUploading && "opacity-50 pointer-events-none"
      )}
    >
      <input {...getInputProps()} />
      {isUploading ? (
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-creator-purple border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg font-medium">AI is transcribing...</p>
          <p className="text-sm text-zinc-500 mt-2">This usually takes a few seconds.</p>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6">
            <Upload className="text-zinc-400" size={32} />
          </div>
          <h3 className="text-xl font-bold mb-2">Drop your media here</h3>
          <p className="text-zinc-400 mb-6">Support MP4, MOV, MP3, WAV up to 20MB (Browser Limit)</p>
          <button className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:scale-105 transition-transform">
            Select File
          </button>
        </>
      )}
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
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Preview */}
      <div className="flex-1 flex flex-col bg-black/40 p-8">
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/5">
          {project.mediaUrl?.includes('video') || project.name.match(/\.(mp4|mov|avi)$/i) ? (
            <video 
              ref={videoRef}
              src={project.mediaUrl} 
              className="w-full h-full object-contain"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
               <Music size={64} className="text-zinc-700" />
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
                  "absolute left-1/2 -translate-x-1/2 w-full max-w-[80%] text-center p-4 pointer-events-none",
                  project.style.position === 'bottom' ? "bottom-12" : project.style.position === 'top' ? "top-12" : "top-1/2 -translate-y-1/2"
                )}
              >
                <span 
                  className="px-4 py-2 rounded-lg inline-block"
                  style={{
                    fontFamily: project.style.fontFamily,
                    fontSize: `${project.style.fontSize}px`,
                    color: project.style.color,
                    backgroundColor: project.style.backgroundColor,
                    fontWeight: project.style.bold ? 'bold' : 'normal',
                    fontStyle: project.style.italic ? 'italic' : 'normal',
                  }}
                >
                  {activeCaption.text}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-6 glass-panel p-6 shadow-2xl">
          <div 
            ref={waveformRef} 
            className="mb-6 rounded-xl overflow-hidden bg-black/20" 
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button onClick={togglePlay} className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 shadow-lg transition-all active:scale-95">
                {isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} className="ml-1" />}
              </button>
              <div className="flex flex-col">
                <span className="font-mono text-lg font-bold text-white leading-none">
                  {formatTime(currentTime).split(',')[0]}
                </span>
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
                  Total: {formatTime(videoRef.current?.duration || 0).split(',')[0]}
                </span>
              </div>
              <button 
                onClick={toggleRecording}
                className={cn(
                  "p-4 rounded-2xl transition-all border flex items-center gap-2",
                  isRecording ? "bg-red-500/20 border-red-500 text-red-500 animate-pulse" : "bg-white/5 border-white/10 text-zinc-400 hover:text-white"
                )}
              >
                <Mic size={20} />
                <span className="text-xs font-bold uppercase tracking-wider">{isRecording ? "Recording..." : "Voice Input"}</span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative group">
                <button className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-bold transition-all transform active:scale-95">
                  <Download size={18} /> <span>Export</span>
                </button>
                <div className="absolute bottom-full right-0 mb-3 hidden group-hover:block glass-panel p-3 min-w-[200px] shadow-2xl border border-white/10 divide-y divide-white/5 animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
                  <div className="pb-2 mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 px-3">Formats</p>
                    <button onClick={exportSRT} className="w-full text-left px-3 py-2.5 hover:bg-creator-purple/20 rounded-xl text-sm transition-colors flex items-center justify-between">
                      <span>SRT (Subtitles)</span>
                      <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase">Text</span>
                    </button>
                    <button onClick={exportLRC} className="w-full text-left px-3 py-2.5 hover:bg-creator-cyan/20 rounded-xl text-sm transition-colors flex items-center justify-between">
                      <span>LRC (Lyrics)</span>
                      <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase">Synced</span>
                    </button>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  // In this demo, 'Save' simply acknowledges the current state as saved 
                  // or could persist to local storage/firebase if integrated.
                  alert("Project '" + project.name + "' saved successfully!");
                }}
                className="flex items-center gap-2 px-6 py-3 bg-creator-purple text-white rounded-2xl text-sm font-bold shadow-2xl shadow-purple-500/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Save size={18} /> <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Editor Sidebar */}
      <div className="w-96 border-l border-white/5 flex flex-col">
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
