"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Send,
  MessageSquare,
  Store,
  Loader2,
  Wifi,
  WifiOff,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Save,
  X,
  Brain,
  Settings2,
  Clock,
  Globe,
  BookOpen,
  Paperclip,
  Upload,
  Sparkles,
  Zap,
  GraduationCap,
  Table2,
  Plus,
  Trash2,
  ClipboardPaste,
  FileSpreadsheet,
  Columns3,
  ListTodo,
  CalendarClock,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  Timer,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getChatConnection, startConnection } from "@/lib/signalr";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface AgentItem {
  id: string;
  name: string;
  type: string;
  status: string;
  storeId: string;
  storeName: string;
  configuration?: Record<string, string>;
}

interface AgentContact {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline";
  lastMessage: string;
  storeName: string;
  unread: boolean;
}

interface Message {
  id: string;
  sender: "user" | "agent";
  content: string;
  timestamp: Date;
}

interface ChatMessageDTO {
  id: string;
  agentId: string;
  content: string;
  isUser: boolean;
  timestamp: string;
}

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

interface AgentFile {
  name: string;
  description: string;
  size: number;
}

interface AgentTask {
  id: string;
  type: string;
  status: "pending" | "running" | "completed" | "error";
  input: { prompt: string; cronJobId?: string; cronJobName?: string; context?: string };
  result: string | null;
  progress: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

interface CronJob {
  id: string;
  name: string;
  schedule: { type: "daily" | "interval"; time?: string; minutes?: number };
  prompt: string;
  enabled: boolean;
  lastRun: string | null;
  lastResult: { status: "success" | "error"; summary: string; fullResponse?: string } | null;
  nextRun: string | null;
  history: { timestamp: string; status: string; summary: string }[];
  createdAt: string;
}

interface AgentSettings {
  schedule: string; // e.g. "09:00"
  scheduleEnabled: boolean;
  responseLanguage: string; // chat language
  listingLanguage: string; // product content language
  titlePrompt: string; // custom prompt for titles
  descriptionPrompt: string; // custom prompt for descriptions
  priceRules: string; // e.g. "Convert to USD, round to X9.95"
  defaultStatus: string; // "draft" | "active"
  customRules: string; // free text extra instructions
  memoryWriteEnabled: boolean; // self-learning from feedback
}

const LANGUAGES = [
  { value: "nl", label: "Nederlands" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
];

const agentTypeColors: Record<string, string> = {
  "Product Research": "bg-blue-600",
  "Listing Optimizer": "bg-emerald-600",
  "Listing Optimization": "bg-emerald-600",
  "Competitor Monitor": "bg-orange-600",
  "Competitor Monitoring": "bg-orange-600",
  "Customer Service": "bg-purple-600",
  "Ad Copy Generator": "bg-pink-600",
  "Ad Copy": "bg-pink-600",
  "Daily Reporter": "bg-cyan-600",
  "Daily Reporting": "bg-cyan-600",
  "Review Responder": "bg-amber-600",
  "Review Response": "bg-amber-600",
  "Inventory Tracker": "bg-red-600",
  "Inventory Tracking": "bg-red-600",
};

function getAgentColor(type: string): string {
  return agentTypeColors[type] || "bg-zinc-700";
}

function getAgentInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getUserInitials(name: string | undefined): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === "," || ch === ";" || ch === "\t") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function formatFullTimestamp(date: Date): string {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const markdownComponents = {
  h1: ({ children, ...props }: any) => (
    <h1 className="text-lg font-bold text-white mb-2 mt-3 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="text-base font-bold text-white mb-2 mt-3 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-sm font-semibold text-white mb-1.5 mt-2.5 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: any) => (
    <h4 className="text-sm font-semibold text-zinc-200 mb-1 mt-2" {...props}>
      {children}
    </h4>
  ),
  p: ({ children, ...props }: any) => (
    <p className="text-sm text-zinc-300 mb-2 last:mb-0 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }: any) => (
    <ul className="text-sm text-zinc-300 mb-2 ml-4 list-disc space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="text-sm text-zinc-300 mb-2 ml-4 list-decimal space-y-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="text-sm text-zinc-300 leading-relaxed" {...props}>
      {children}
    </li>
  ),
  strong: ({ children, ...props }: any) => (
    <strong className="font-semibold text-white" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: any) => (
    <em className="italic text-zinc-400" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote
      className="border-l-2 border-blue-500/50 pl-3 my-2 text-zinc-400 italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="bg-zinc-800 text-blue-400 px-1.5 py-0.5 rounded text-xs font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 my-2 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: any) => (
    <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 my-2 overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs text-zinc-300 w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="border-b border-zinc-700" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: any) => (
    <th className="text-left px-2 py-1.5 text-zinc-400 font-medium text-xs" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-2 py-1.5 border-b border-zinc-800/50 text-xs" {...props}>
      {children}
    </td>
  ),
  hr: (props: any) => <hr className="border-zinc-800 my-3" {...props} />,
  a: ({ children, ...props }: any) => (
    <a className="text-blue-400 hover:text-blue-300 underline" {...props}>
      {children}
    </a>
  ),
  del: ({ children, ...props }: any) => (
    <del className="text-zinc-500 line-through" {...props}>
      {children}
    </del>
  ),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function ChatPage() {
  const { user, token } = useAuth();
  const [agents, setAgents] = useState<AgentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [conversations, setConversations] = useState<
    Record<string, Message[]>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingAgentId, setStreamingAgentId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wakingAgents, setWakingAgents] = useState<Set<string>>(new Set());
  const [fileEditorOpen, setFileEditorOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileOriginal, setFileOriginal] = useState("");
  const [fileSaving, setFileSaving] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const [agentFiles, setAgentFiles] = useState<AgentFile[]>([]);
  const [fileEditMode, setFileEditMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentSettings, setAgentSettings] = useState<Record<string, AgentSettings>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [trainingFiles, setTrainingFiles] = useState<File[]>([]);
  const [trainingProcessing, setTrainingProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [worksheetOpen, setWorksheetOpen] = useState(false);
  const [worksheetRows, setWorksheetRows] = useState<Record<string, string>[]>([]);
  const [worksheetColumns, setWorksheetColumns] = useState<string[]>(["url", "title", "status"]);
  const [worksheetLoading, setWorksheetLoading] = useState(false);
  const [worksheetSaving, setWorksheetSaving] = useState(false);
  const [worksheetTab, setWorksheetTab] = useState<"table" | "bulk" | "csv">("table");
  const [worksheetBulkText, setWorksheetBulkText] = useState("");
  const [worksheetBulkColumn, setWorksheetBulkColumn] = useState("url");
  const [worksheetAddColName, setWorksheetAddColName] = useState("");
  const [worksheetEditingHeader, setWorksheetEditingHeader] = useState<string | null>(null);
  const [worksheetHeaderEdit, setWorksheetHeaderEdit] = useState("");
  const [worksheetColWidths, setWorksheetColWidths] = useState<Record<string, number>>({});
  const [worksheetClearConfirm, setWorksheetClearConfirm] = useState(false);
  const [agentActivity, setAgentActivity] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasksTab, setTasksTab] = useState<"tasks" | "schedule">("tasks");
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronCreating, setCronCreating] = useState(false);
  const [cronForm, setCronForm] = useState({ name: "", prompt: "", scheduleType: "daily" as "daily" | "interval", time: "09:00", minutes: 360 });
  const [cronExpanded, setCronExpanded] = useState<string | null>(null);
  const [taskExpanded, setTaskExpanded] = useState<string | null>(null);

  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trainingFileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const previousAgentRef = useRef<string | null>(null);
  const selectedAgentRef = useRef<string | null>(null);
  const resizeColRef = useRef<string | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(0);

  const getColWidth = useCallback((col: string) => worksheetColWidths[col] || 150, [worksheetColWidths]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const col = resizeColRef.current;
      if (col === null) return;
      const diff = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(60, resizeStartWRef.current + diff);
      setWorksheetColWidths(prev => ({ ...prev, [col]: newWidth }));
    };
    const onMouseUp = () => {
      if (resizeColRef.current === null) return;
      resizeColRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startColResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest("th");
    resizeStartWRef.current = th ? th.getBoundingClientRect().width : 150;
    resizeStartXRef.current = e.clientX;
    resizeColRef.current = col;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const autoFitColumn = useCallback((col: string) => {
    // Measure the widest content in this column using an offscreen canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";

    // Measure header
    let maxWidth = ctx.measureText(col).width + 32;

    // Measure all cell values
    for (const row of worksheetRows) {
      const val = row[col] || "";
      const w = ctx.measureText(val).width + 28;
      if (w > maxWidth) maxWidth = w;
    }

    setWorksheetColWidths(prev => ({ ...prev, [col]: Math.max(60, Math.ceil(maxWidth)) }));
  }, [worksheetRows]);

  const setAgentWaking = useCallback((agentId: string) => {
    setWakingAgents((prev) => new Set(prev).add(agentId));
  }, []);

  const clearAgentWaking = useCallback((agentId: string) => {
    setWakingAgents((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load agent files list when selecting an agent
  const loadAgentFiles = useCallback(async (agentId: string) => {
    try {
      const data = await api.get<{ files: AgentFile[] }>(`/agents/${agentId}/files`);
      setAgentFiles(data.files || []);
    } catch {
      setAgentFiles([]);
    }
  }, []);

  // Open file in editor
  const openFile = useCallback(async (fileName: string) => {
    if (!selectedAgent) return;
    setActiveFile(fileName);
    setFileEditorOpen(true);
    setFileSaved(false);
    setFileEditMode(false);
    try {
      const data = await api.get<{ name: string; content: string }>(
        `/agents/${selectedAgent}/files/${fileName}`
      );
      // Unescape literal \n from Docker env var flattening
      const content = (data.content || "").replace(/\\n/g, "\n");
      setFileContent(content);
      setFileOriginal(content);
    } catch {
      setFileContent("");
      setFileOriginal("");
    }
  }, [selectedAgent]);

  // Save file
  const saveFile = useCallback(async () => {
    if (!selectedAgent || !activeFile) return;
    setFileSaving(true);
    try {
      await api.put(`/agents/${selectedAgent}/files/${activeFile}`, {
        content: fileContent,
      });
      setFileOriginal(fileContent);
      setFileSaved(true);
      // Refresh file list to update sizes
      loadAgentFiles(selectedAgent);
      setTimeout(() => setFileSaved(false), 2000);
    } catch {
      // Could show error toast
    } finally {
      setFileSaving(false);
    }
  }, [selectedAgent, activeFile, fileContent, loadAgentFiles]);

  // Worksheet functions
  const syncColumnsFromRows = useCallback((rows: Record<string, string>[]) => {
    const cols = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k !== "id") cols.add(k);
      }
    }
    setWorksheetColumns(prev => {
      const merged = [...prev];
      for (const c of cols) {
        if (!merged.includes(c)) merged.push(c);
      }
      return merged;
    });
  }, []);

  const loadWorksheet = useCallback(async () => {
    if (!selectedAgent) return;
    setWorksheetLoading(true);
    try {
      const data = await api.get<{ name: string; content: string }>(
        `/agents/${selectedAgent}/files/worksheet.json`
      );
      const rows = JSON.parse(data.content || "[]");
      setWorksheetRows(rows);
      syncColumnsFromRows(rows);
    } catch {
      setWorksheetRows([]);
    } finally {
      setWorksheetLoading(false);
    }
  }, [selectedAgent, syncColumnsFromRows]);

  const saveWorksheet = useCallback(async (rows: Record<string, string>[]) => {
    if (!selectedAgent) return;
    // Optimistic update — show changes immediately
    setWorksheetRows(rows);
    setWorksheetSaving(true);
    try {
      await api.put(`/agents/${selectedAgent}/files/worksheet.json`, {
        content: JSON.stringify(rows),
      });
    } catch (err) {
      console.error("Failed to save worksheet:", err);
    } finally {
      setWorksheetSaving(false);
    }
  }, [selectedAgent]);

  const addWorksheetEmptyRow = useCallback(() => {
    const id = `row-${Date.now()}`;
    const row: Record<string, string> = { id };
    worksheetColumns.forEach(c => { row[c] = ""; });
    const newRows = [...worksheetRows, row];
    saveWorksheet(newRows);
  }, [worksheetRows, worksheetColumns, saveWorksheet]);

  const deleteWorksheetRow = useCallback((rowId: string) => {
    const newRows = worksheetRows.filter(r => r.id !== rowId);
    saveWorksheet(newRows);
  }, [worksheetRows, saveWorksheet]);

  const updateWorksheetCell = useCallback((rowId: string, key: string, value: string) => {
    setWorksheetRows(prev => prev.map(r => r.id === rowId ? { ...r, [key]: value } : r));
  }, []);

  const worksheetRowsRef = useRef(worksheetRows);
  worksheetRowsRef.current = worksheetRows;

  const saveWorksheetEdits = useCallback(() => {
    saveWorksheet(worksheetRowsRef.current);
  }, [saveWorksheet]);

  const addWorksheetColumn = useCallback((name: string) => {
    if (!name.trim() || worksheetColumns.includes(name.trim())) return;
    setWorksheetColumns(prev => [...prev, name.trim()]);
    setWorksheetAddColName("");
  }, [worksheetColumns]);

  const renameWorksheetColumn = useCallback((oldName: string, newName: string) => {
    if (!newName.trim() || (newName !== oldName && worksheetColumns.includes(newName.trim()))) return;
    setWorksheetColumns(prev => prev.map(c => c === oldName ? newName.trim() : c));
    const updated = worksheetRows.map(r => {
      if (!(oldName in r)) return r;
      const { [oldName]: val, ...rest } = r;
      return { ...rest, [newName.trim()]: val };
    });
    saveWorksheet(updated);
    setWorksheetEditingHeader(null);
  }, [worksheetColumns, worksheetRows, saveWorksheet]);

  const deleteWorksheetColumn = useCallback((name: string) => {
    setWorksheetColumns(prev => prev.filter(c => c !== name));
    const updated = worksheetRows.map(r => {
      const { [name]: _, ...rest } = r;
      return rest;
    });
    saveWorksheet(updated);
  }, [worksheetRows, saveWorksheet]);

  // Bulk import: parse lines into rows
  const importBulkUrls = useCallback(() => {
    const lines = worksheetBulkText
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (lines.length === 0) return;
    const col = worksheetBulkColumn || "url";
    if (!worksheetColumns.includes(col)) {
      setWorksheetColumns(prev => [...prev, col]);
    }
    const newRows = lines.map((line, i) => {
      const id = `row-${Date.now()}-${i}`;
      const row: Record<string, string> = { id };
      worksheetColumns.forEach(c => { row[c] = ""; });
      row[col] = line;
      return row;
    });
    const allRows = [...worksheetRows, ...newRows];
    saveWorksheet(allRows);
    setWorksheetBulkText("");
    setWorksheetTab("table");
  }, [worksheetBulkText, worksheetBulkColumn, worksheetColumns, worksheetRows, saveWorksheet]);

  // CSV import
  const handleCsvUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return;

      // Parse header
      const headers = parseCsvLine(lines[0]);
      const newCols = [...worksheetColumns];
      for (const h of headers) {
        if (h && !newCols.includes(h)) newCols.push(h);
      }
      setWorksheetColumns(newCols);

      // Parse rows
      const newRows = lines.slice(1).map((line, i) => {
        const values = parseCsvLine(line);
        const id = `row-${Date.now()}-${i}`;
        const row: Record<string, string> = { id };
        headers.forEach((h, idx) => {
          if (h) row[h] = values[idx] || "";
        });
        return row;
      });

      const allRows = [...worksheetRows, ...newRows];
      saveWorksheet(allRows);
      setWorksheetTab("table");
    };
    reader.readAsText(file);
  }, [worksheetColumns, worksheetRows, saveWorksheet]);

  const openWorksheet = useCallback(() => {
    setWorksheetOpen(true);
    loadWorksheet();
  }, [loadWorksheet]);

  const clearWorksheet = useCallback(() => {
    saveWorksheet([]);
    setWorksheetColumns(["url", "title", "status"]);
    setWorksheetClearConfirm(false);
  }, [saveWorksheet]);

  const defaultSettings: AgentSettings = {
    schedule: "09:00", scheduleEnabled: false,
    responseLanguage: "nl", listingLanguage: "",
    titlePrompt: "", descriptionPrompt: "",
    priceRules: "", defaultStatus: "draft",
    customRules: "", memoryWriteEnabled: true,
  };

  // Get current agent settings (with defaults)
  const getCurrentSettings = useCallback((): AgentSettings => {
    if (!selectedAgent) return defaultSettings;
    return agentSettings[selectedAgent] || defaultSettings;
  }, [selectedAgent, agentSettings]);

  // Update a single setting
  const updateSetting = useCallback(<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
    if (!selectedAgent) return;
    setAgentSettings(prev => ({
      ...prev,
      [selectedAgent]: { ...getCurrentSettings(), [key]: value },
    }));
  }, [selectedAgent, getCurrentSettings]);

  // Save agent settings — writes structured config to agent Configuration + pushes to live agent
  const saveSettings = useCallback(async () => {
    console.log("[SaveSettings] selectedAgent:", selectedAgent);
    if (!selectedAgent) { console.error("[SaveSettings] No agent selected!"); return; }
    setSettingsSaving(true);
    try {
      const settings = getCurrentSettings();
      console.log("[SaveSettings] Saving:", JSON.stringify(settings));
      const langLabel = LANGUAGES.find(l => l.value === settings.responseLanguage)?.label || settings.responseLanguage;
      const listingLangLabel = LANGUAGES.find(l => l.value === settings.listingLanguage)?.label || settings.listingLanguage;

      await api.put(`/agents/${selectedAgent}`, {
        configuration: {
          responseLanguage: langLabel,
          listingLanguage: listingLangLabel,
          titlePrompt: settings.titlePrompt,
          descriptionPrompt: settings.descriptionPrompt,
          priceRules: settings.priceRules,
          defaultStatus: settings.defaultStatus,
          customRules: settings.customRules,
          memoryWriteEnabled: String(settings.memoryWriteEnabled),
          scheduleEnabled: String(settings.scheduleEnabled),
          schedule: settings.schedule,
        },
      });

      console.log("[SaveSettings] Success! Settings pushed to API");
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err) {
      console.error("[SaveSettings] Failed:", err);
      alert(`Settings save failed: ${err}`);
    } finally {
      setSettingsSaving(false);
    }
  }, [selectedAgent, getCurrentSettings]);

  // Load agent tasks (no loading flash on refresh)
  const tasksLoadedOnce = useRef(false);
  const loadTasks = useCallback(async () => {
    if (!selectedAgent) return;
    if (!tasksLoadedOnce.current) setTasksLoading(true);
    try {
      const data = await api.get<{ tasks: AgentTask[] }>(`/agents/${selectedAgent}/tasks`);
      setAgentTasks(data.tasks || []);
      tasksLoadedOnce.current = true;
    } catch {
      if (!tasksLoadedOnce.current) setAgentTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [selectedAgent]);

  // Load cron jobs (no loading flash on refresh)
  const cronLoadedOnce = useRef(false);
  const loadCronJobs = useCallback(async () => {
    if (!selectedAgent) return;
    if (!cronLoadedOnce.current) setCronLoading(true);
    try {
      const data = await api.get<{ jobs: CronJob[] }>(`/agents/${selectedAgent}/cron`);
      setCronJobs(data.jobs || []);
      cronLoadedOnce.current = true;
    } catch {
      if (!cronLoadedOnce.current) setCronJobs([]);
    } finally {
      setCronLoading(false);
    }
  }, [selectedAgent]);

  // Create cron job
  const createCronJob = useCallback(async () => {
    if (!selectedAgent || !cronForm.name.trim() || !cronForm.prompt.trim()) return;
    setCronCreating(true);
    try {
      const schedule = cronForm.scheduleType === "daily"
        ? { type: "daily" as const, time: cronForm.time }
        : { type: "interval" as const, minutes: cronForm.minutes };
      await api.post(`/agents/${selectedAgent}/cron`, {
        name: cronForm.name,
        prompt: cronForm.prompt,
        schedule,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        enabled: true,
      });
      setCronForm({ name: "", prompt: "", scheduleType: "daily", time: "09:00", minutes: 360 });
      loadCronJobs();
    } catch (err) {
      console.error("Failed to create cron job:", err);
    } finally {
      setCronCreating(false);
    }
  }, [selectedAgent, cronForm, loadCronJobs]);

  // Toggle cron job enabled/disabled
  const toggleCronJob = useCallback(async (cronId: string, enabled: boolean) => {
    if (!selectedAgent) return;
    try {
      await api.put(`/agents/${selectedAgent}/cron/${cronId}`, { enabled });
      setCronJobs(prev => prev.map(j => j.id === cronId ? { ...j, enabled } : j));
    } catch (err) {
      console.error("Failed to toggle cron job:", err);
    }
  }, [selectedAgent]);

  // Delete cron job
  const deleteCronJob = useCallback(async (cronId: string) => {
    if (!selectedAgent) return;
    try {
      await api.delete(`/agents/${selectedAgent}/cron/${cronId}`);
      setCronJobs(prev => prev.filter(j => j.id !== cronId));
    } catch (err) {
      console.error("Failed to delete cron job:", err);
    }
  }, [selectedAgent]);

  // Delete task
  const deleteTask = useCallback(async (taskId: string) => {
    if (!selectedAgent) return;
    try {
      await api.delete(`/agents/${selectedAgent}/tasks/${taskId}`);
      setAgentTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  }, [selectedAgent]);

  // Open tasks panel
  const openTasks = useCallback(() => {
    tasksLoadedOnce.current = false;
    cronLoadedOnce.current = false;
    setTasksOpen(true);
    loadTasks();
    loadCronJobs();
  }, [loadTasks, loadCronJobs]);

  // Auto-refresh tasks when panel is open
  useEffect(() => {
    if (!tasksOpen || !selectedAgent) return;
    const interval = setInterval(() => {
      loadTasks();
      if (tasksTab === "schedule") loadCronJobs();
    }, 5000);
    return () => clearInterval(interval);
  }, [tasksOpen, selectedAgent, tasksTab, loadTasks, loadCronJobs]);

  // Poll for completed cron tasks and inject into chat as messages
  const seenCronTasksRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedAgent) return;
    const pollCronResults = async () => {
      try {
        const data = await api.get<{ tasks: AgentTask[] }>(`/agents/${selectedAgent}/tasks`);
        const cronTasks = (data.tasks || []).filter(
          t => t.type === "cron" && (t.status === "completed" || t.status === "error") && !seenCronTasksRef.current.has(t.id)
        );
        for (const task of cronTasks) {
          seenCronTasksRef.current.add(task.id);
          const jobName = task.input.cronJobName || "Scheduled Job";
          const content = task.status === "completed"
            ? `**${jobName}** (scheduled task)\n\n${task.result || "Completed successfully."}`
            : `**${jobName}** (scheduled task)\n\n**Error:** ${task.error || "Unknown error"}`;
          const cronMsg: Message = {
            id: `cron-${task.id}`,
            sender: "agent",
            content,
            timestamp: new Date(task.updatedAt),
          };
          setConversations(prev => {
            const existing = prev[selectedAgent] || [];
            // Don't add if already exists
            if (existing.some(m => m.id === cronMsg.id)) return prev;
            return { ...prev, [selectedAgent]: [...existing, cronMsg] };
          });
        }
      } catch { /* ignore polling errors */ }
    };
    // Initial check + poll every 15 seconds
    pollCronResults();
    const interval = setInterval(pollCronResults, 15000);
    return () => clearInterval(interval);
  }, [selectedAgent]);

  // Handle file attachment (chat)
  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    if (e.target) e.target.value = "";
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setAttachments(prev => [...prev, ...files]);
    }
  }, []);

  // Handle training file upload — reads content and appends to memory.md
  const handleTrainingUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAgent) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (e.target) e.target.value = "";

    setTrainingFiles(files);
    setTrainingProcessing(true);

    try {
      // Read all text-based files
      const contents: string[] = [];
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          contents.push(`[Image: ${file.name}] — Image uploaded for reference.`);
          continue;
        }
        try {
          const text = await file.text();
          contents.push(`### ${file.name}\n\n${text}`);
        } catch {
          contents.push(`[File: ${file.name}] — Could not read content.`);
        }
      }

      // Read current memory.md
      let memoryContent = "";
      try {
        const data = await api.get<{ content: string }>(`/agents/${selectedAgent}/files/memory.md`);
        memoryContent = (data.content || "").replace(/\\n/g, "\n");
      } catch { /* empty */ }

      // Append training data
      const trainingBlock = [
        "",
        `## Training Data (uploaded ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`,
        "",
        ...contents,
      ].join("\n");

      memoryContent = memoryContent.trimEnd() + "\n" + trainingBlock;

      // Write back to memory.md
      await api.put(`/agents/${selectedAgent}/files/memory.md`, { content: memoryContent });

      setTrainingFiles([]);
    } catch {
      // Upload failed
    } finally {
      setTrainingProcessing(false);
    }
  }, [selectedAgent]);

  // Fetch agents
  const initialLoadDone = useRef(false);
  const fetchAgents = useCallback(async () => {
    try {
      if (!initialLoadDone.current) setLoading(true);
      const data = await api.get<AgentItem[]>("/agents");
      const mapped: AgentContact[] = data.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status:
          a.status.toLowerCase() === "running"
            ? ("online" as const)
            : ("offline" as const),
        lastMessage: `${a.type} agent`,
        storeName: a.storeName || "Unassigned",
        unread: false,
      }));
      setAgents(mapped);

      // Hydrate agent settings from configuration
      const newSettings: Record<string, AgentSettings> = {};
      for (const a of data) {
        if (a.configuration && Object.keys(a.configuration).length > 0) {
          const c = a.configuration;
          const respLangValue = LANGUAGES.find(l => l.label === c.responseLanguage)?.value || c.responseLanguage || "nl";
          const listLangValue = LANGUAGES.find(l => l.label === c.listingLanguage)?.value || c.listingLanguage || "";
          newSettings[a.id] = {
            schedule: c.schedule || "09:00",
            scheduleEnabled: c.scheduleEnabled === "true",
            responseLanguage: respLangValue,
            listingLanguage: listLangValue,
            titlePrompt: c.titlePrompt || "",
            descriptionPrompt: c.descriptionPrompt || "",
            priceRules: c.priceRules || "",
            defaultStatus: c.defaultStatus || "draft",
            customRules: c.customRules || "",
            memoryWriteEnabled: c.memoryWriteEnabled !== "false",
          };
        }
      }
      setAgentSettings(prev => ({ ...prev, ...newSettings }));

      initialLoadDone.current = true;
    } catch {
      if (!initialLoadDone.current) setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    // Poll agent status every 15 seconds so Online/Offline stays current
    const interval = setInterval(fetchAgents, 15000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  // Set up SignalR connection
  useEffect(() => {
    if (!token) return;

    const conn = getChatConnection(token);
    connectionRef.current = conn;

    conn.onreconnecting(() => setConnectionStatus("reconnecting"));
    conn.onreconnected(() => setConnectionStatus("connected"));
    conn.onclose(() => setConnectionStatus("disconnected"));

    // Listen for typing start
    conn.on("ReceiveTypingStart", (agentId: string) => {
      setStreamingAgentId(agentId);
      setStreamingContent("");
      setIsStreaming(true);
    });

    // Listen for streaming tokens
    conn.on(
      "ReceiveToken",
      (data: { agentId: string; token: string }) => {
        setStreamingContent((prev) => prev + data.token);
      }
    );

    // Listen for typing end
    conn.on(
      "ReceiveTypingEnd",
      (data: {
        agentId: string;
        fullMessage: string;
        messageId: string;
        timestamp: string;
      }) => {
        const newMsg: Message = {
          id: data.messageId,
          sender: "agent",
          content: data.fullMessage,
          timestamp: new Date(data.timestamp),
        };
        setConversations((prev) => ({
          ...prev,
          [data.agentId]: [...(prev[data.agentId] || []), newMsg],
        }));

        // Update last message for agent in sidebar
        setAgents((prev) =>
          prev.map((a) =>
            a.id === data.agentId
              ? {
                  ...a,
                  lastMessage:
                    data.fullMessage.slice(0, 50) +
                    (data.fullMessage.length > 50 ? "..." : ""),
                }
              : a
          )
        );

        setIsStreaming(false);
        setStreamingContent("");
        setStreamingAgentId(null);
        setAgentActivity(null);
      }
    );

    conn.on("SystemMessage", () => {
      // System message received, connection confirmed
    });

    // Listen for agent status changes (waking up, tool calls, etc.)
    conn.on("AgentStatus", (data: { agentId: string; status: string }) => {
      if (data.status === "waking") {
        setAgentWaking(data.agentId);
      } else if (data.status === "ready") {
        clearAgentWaking(data.agentId);
      } else if (data.status.startsWith("tool:")) {
        setAgentActivity(data.status.slice(5));
      }
    });

    // Listen for chat errors
    conn.on("ChatError", (errorMessage: string) => {
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingAgentId(null);
      setAgentActivity(null);
      // Add error as a system message
      if (selectedAgentRef.current) {
        const errorMsg: Message = {
          id: `m-err-${Date.now()}`,
          sender: "agent",
          content: `⚠️ ${errorMessage}`,
          timestamp: new Date(),
        };
        setConversations((prev) => ({
          ...prev,
          [selectedAgentRef.current!]: [
            ...(prev[selectedAgentRef.current!] || []),
            errorMsg,
          ],
        }));
      }
    });

    // Start connection
    let cancelled = false;
    startConnection(conn)
      .then(() => {
        if (!cancelled) setConnectionStatus("connected");
      })
      .catch(() => {
        if (!cancelled) setConnectionStatus("disconnected");
      });

    if (conn.state === signalR.HubConnectionState.Connected) {
      setConnectionStatus("connected");
    }

    return () => {
      cancelled = true;
      conn.off("ReceiveTypingStart");
      conn.off("ReceiveToken");
      conn.off("ReceiveTypingEnd");
      conn.off("SystemMessage");
      conn.off("AgentStatus");
      conn.off("ChatError");
    };
  }, [token]);

  // Scroll on new messages or streaming content
  useEffect(() => {
    scrollToBottom();
  }, [conversations, streamingContent, scrollToBottom]);

  // Handle agent selection / group switching
  const handleSelectAgent = useCallback(
    async (agentId: string) => {
      const conn = connectionRef.current;
      if (!conn || conn.state !== signalR.HubConnectionState.Connected)
        return;

      // Leave previous group
      if (previousAgentRef.current) {
        try {
          await conn.invoke("LeaveAgentChat", previousAgentRef.current);
        } catch {
          // ignore
        }
      }

      // Join new group
      try {
        await conn.invoke("JoinAgentChat", agentId);
      } catch {
        // ignore
      }

      previousAgentRef.current = agentId;
      selectedAgentRef.current = agentId;
      setSelectedAgent(agentId);

      // Mark as read
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, unread: false } : a))
      );

      // Load agent files
      loadAgentFiles(agentId);

      // Fetch history if we don't have it
      if (!conversations[agentId]) {
        try {
          const history = await api.get<ChatMessageDTO[]>(
            `/chat/${agentId}/history`
          );
          const msgs: Message[] = history.map((m) => ({
            id: m.id,
            sender: m.isUser ? ("user" as const) : ("agent" as const),
            content: m.content,
            timestamp: new Date(m.timestamp),
          }));
          setConversations((prev) => ({
            ...prev,
            [agentId]: msgs,
          }));
        } catch {
          setConversations((prev) => ({
            ...prev,
            [agentId]: [],
          }));
        }
      }

      // Focus input
      setTimeout(() => textareaRef.current?.focus(), 100);
    },
    [conversations]
  );

  // Send message via SignalR
  const handleSend = useCallback(async () => {
    if ((!inputValue.trim() && attachments.length === 0) || !selectedAgent || isStreaming) return;

    const conn = connectionRef.current;
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return;

    const messageContent = inputValue.trim();
    const currentAttachments = [...attachments];
    setInputValue("");
    setAttachments([]);

    // Build display content (show file names in message)
    let displayContent = messageContent;
    if (currentAttachments.length > 0) {
      const fileNames = currentAttachments.map(f => f.name).join(", ");
      displayContent = messageContent
        ? `${messageContent}\n\n📎 ${fileNames}`
        : `📎 ${fileNames}`;
    }

    // Add user message to UI immediately
    const userMsg: Message = {
      id: `m-${Date.now()}`,
      sender: "user",
      content: displayContent,
      timestamp: new Date(),
    };

    setConversations((prev) => ({
      ...prev,
      [selectedAgent]: [...(prev[selectedAgent] || []), userMsg],
    }));

    // Convert attachments to base64
    const fileData: { name: string; type: string; data: string }[] = [];
    for (const file of currentAttachments) {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      fileData.push({ name: file.name, type: file.type, data: base64 });
    }

    // Send via SignalR
    try {
      if (fileData.length > 0) {
        await conn.invoke("SendMessageWithFiles", selectedAgent, messageContent || "See attached files.", fileData);
      } else {
        await conn.invoke("SendMessage", selectedAgent, messageContent);
      }
    } catch {
      const errorMsg: Message = {
        id: `m-err-${Date.now()}`,
        sender: "agent",
        content:
          "Failed to send message. Please check your connection and try again.",
        timestamp: new Date(),
      };
      setConversations((prev) => ({
        ...prev,
        [selectedAgent]: [...(prev[selectedAgent] || []), errorMsg],
      }));
    }
  }, [inputValue, selectedAgent, isStreaming, attachments]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentAgent = agents.find((a) => a.id === selectedAgent);
  const currentMessages = selectedAgent
    ? conversations[selectedAgent] || []
    : [];

  // Group agents by store
  const agentsByStore: Record<string, AgentContact[]> = {};
  agents.forEach((agent) => {
    const key = agent.storeName;
    if (!agentsByStore[key]) agentsByStore[key] = [];
    agentsByStore[key].push(agent);
  });

  return (
    <TooltipProvider>
      <div className="flex h-full w-full">
        {/* Agent list sidebar */}
        <div
          className={cn(
            "border-r border-[#27272a] bg-[#0a0a0a] flex flex-col shrink-0 transition-all duration-300",
            sidebarOpen ? "w-72" : "w-0 overflow-hidden"
          )}
        >
          <div className="p-4 border-b border-[#27272a]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Agents</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Select an agent to chat
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
                className="text-zinc-500 hover:text-white h-7 w-7"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 text-zinc-600 animate-spin" />
              </div>
            )}

            {!loading && agents.length === 0 && (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <Bot className="h-8 w-8 text-zinc-700 mb-3" />
                <p className="text-xs text-zinc-500 mb-3">
                  No agents available
                </p>
                <a
                  href="/dashboard/store"
                  className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
                >
                  Deploy an agent
                </a>
              </div>
            )}

            {!loading &&
              Object.entries(agentsByStore).map(
                ([storeName, storeAgents]) => (
                  <div key={storeName}>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#27272a] bg-[#09090b]">
                      <Store className="h-3 w-3 text-zinc-600" />
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        {storeName}
                      </span>
                    </div>
                    {storeAgents.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => handleSelectAgent(agent.id)}
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-[#27272a]",
                          selectedAgent === agent.id
                            ? "bg-zinc-800/60"
                            : "hover:bg-zinc-800/30"
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback
                              className={cn(
                                "text-white text-[10px] font-bold",
                                getAgentColor(agent.type)
                              )}
                            >
                              {getAgentInitials(agent.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0a]",
                              agent.status === "online"
                                ? "bg-green-500"
                                : "bg-zinc-600"
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-white truncate">
                              {agent.name}
                            </p>
                            {agent.unread && (
                              <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 ml-2" />
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 truncate mt-0.5">
                            {agent.lastMessage}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
          </ScrollArea>
        </div>

        {/* Chat area */}
        <div
          className="flex-1 flex flex-col min-w-0 overflow-hidden relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag & drop overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-[#09090b]/90 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="border-2 border-dashed border-blue-500/50 rounded-2xl p-12 flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-blue-500" />
                <p className="text-sm font-medium text-blue-400">Drop files here</p>
                <p className="text-xs text-zinc-500">Images, PDFs, documents</p>
              </div>
            </div>
          )}

          {/* Worksheet fullscreen overlay */}
          {worksheetOpen && (
            <div className="absolute inset-0 z-40 bg-[#09090b] flex flex-col">
              {/* Worksheet header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#27272a] bg-[#0a0a0a] shrink-0">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-blue-400" />
                  <h2 className="text-white text-sm font-medium">Worksheet</h2>
                  <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-400">
                    {worksheetRows.length} rows
                  </Badge>
                  {worksheetSaving && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={loadWorksheet} disabled={worksheetLoading}
                    className="h-7 px-2 text-xs text-zinc-400 hover:text-white">
                    {worksheetLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                  </Button>
                  {worksheetClearConfirm ? (
                    <div className="flex items-center gap-1 bg-red-950/50 border border-red-900/50 rounded px-2 py-0.5">
                      <span className="text-[10px] text-red-400">Delete all rows?</span>
                      <Button variant="ghost" size="sm" onClick={clearWorksheet}
                        className="h-6 px-1.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950">
                        Yes
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setWorksheetClearConfirm(false)}
                        className="h-6 px-1.5 text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800">
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setWorksheetClearConfirm(true)}
                      className="h-7 px-2 text-xs text-zinc-500 hover:text-red-400">
                      Clear all
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setWorksheetOpen(false)}
                    className="h-7 w-7 text-zinc-400 hover:text-white">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-0 border-b border-[#27272a] px-5 shrink-0">
                <button onClick={() => setWorksheetTab("table")}
                  className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    worksheetTab === "table" ? "border-blue-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <Table2 className="h-3.5 w-3.5" /> Table
                </button>
                <button onClick={() => setWorksheetTab("bulk")}
                  className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    worksheetTab === "bulk" ? "border-blue-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <ClipboardPaste className="h-3.5 w-3.5" /> Bulk Paste
                </button>
                <button onClick={() => setWorksheetTab("csv")}
                  className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    worksheetTab === "csv" ? "border-blue-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> CSV Import
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* TABLE TAB */}
                {worksheetTab === "table" && (
                  <>
                    {/* Column management bar */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50 bg-zinc-950/50 shrink-0">
                      <Columns3 className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Columns:</span>
                      <div className="flex items-center gap-1 flex-wrap flex-1">
                        {worksheetColumns.map(col => (
                          <span key={col} className="inline-flex items-center gap-1 bg-zinc-800/80 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded group">
                            {worksheetEditingHeader === col ? (
                              <input
                                autoFocus
                                value={worksheetHeaderEdit}
                                onChange={e => setWorksheetHeaderEdit(e.target.value)}
                                onBlur={() => renameWorksheetColumn(col, worksheetHeaderEdit)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") renameWorksheetColumn(col, worksheetHeaderEdit);
                                  if (e.key === "Escape") setWorksheetEditingHeader(null);
                                }}
                                className="bg-transparent text-white text-[10px] outline-none w-16"
                              />
                            ) : (
                              <>
                                <span className="cursor-pointer" onClick={() => {
                                  setWorksheetEditingHeader(col);
                                  setWorksheetHeaderEdit(col);
                                }}>{col}</span>
                                <button onClick={() => deleteWorksheetColumn(col)}
                                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </>
                            )}
                          </span>
                        ))}
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            value={worksheetAddColName}
                            onChange={e => setWorksheetAddColName(e.target.value)}
                            placeholder="+ column"
                            onKeyDown={e => {
                              if (e.key === "Enter") addWorksheetColumn(worksheetAddColName);
                            }}
                            className="bg-transparent text-[10px] text-zinc-400 placeholder:text-zinc-600 outline-none w-16"
                          />
                          {worksheetAddColName && (
                            <button onClick={() => addWorksheetColumn(worksheetAddColName)}
                              className="text-blue-400 hover:text-blue-300">
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto">
                      {worksheetLoading && worksheetRows.length === 0 ? (
                        <div className="flex items-center justify-center py-12 text-zinc-500">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                        </div>
                      ) : worksheetRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <Table2 className="h-8 w-8 text-zinc-700 mb-3" />
                          <p className="text-sm text-zinc-400 mb-1">Worksheet is empty</p>
                          <p className="text-xs text-zinc-600 mb-4">Add rows manually, bulk paste URLs, or import a CSV.</p>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={addWorksheetEmptyRow}
                              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                              <Plus className="h-3 w-3 mr-1" /> Add Row
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setWorksheetTab("bulk")}
                              className="h-7 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                              <ClipboardPaste className="h-3 w-3 mr-1" /> Bulk Paste
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: 40 + worksheetColumns.reduce((s, c) => s + getColWidth(c), 0) + 40 }}>
                          <colgroup>
                            <col style={{ width: 40 }} />
                            {worksheetColumns.map(col => (
                              <col key={col} style={{ width: getColWidth(col) }} />
                            ))}
                            <col style={{ width: 40 }} />
                          </colgroup>
                          <thead className="sticky top-0 bg-zinc-950 z-10">
                            <tr className="border-b border-zinc-800">
                              <th className="px-2 py-2 text-zinc-600 font-normal text-center">#</th>
                              {worksheetColumns.map(col => (
                                <th key={col} className="text-left py-2 text-zinc-400 font-medium whitespace-nowrap relative select-none">
                                  <span className="px-2">{col}</span>
                                  <div
                                    onMouseDown={e => startColResize(col, e)}
                                    onDoubleClick={() => autoFitColumn(col)}
                                    className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-20 group/handle flex items-center justify-center"
                                  >
                                    <div className="w-px h-4 bg-zinc-700 group-hover/handle:bg-blue-500 group-active/handle:bg-blue-400 transition-colors" />
                                  </div>
                                </th>
                              ))}
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {worksheetRows.map((row, idx) => (
                              <tr key={row.id} className="border-b border-zinc-800/30 hover:bg-zinc-900/40 group">
                                <td className="px-2 py-1 text-center text-[10px] text-zinc-600">{idx + 1}</td>
                                {worksheetColumns.map(col => (
                                  <td key={col} className="px-1 py-0.5 overflow-hidden text-ellipsis">
                                    <input
                                      type="text"
                                      value={row[col] || ""}
                                      onChange={e => updateWorksheetCell(row.id, col, e.target.value)}
                                      onBlur={saveWorksheetEdits}
                                      className={cn(
                                        "w-full bg-transparent text-xs outline-none rounded px-1.5 py-1 transition-colors",
                                        "text-zinc-300 hover:bg-zinc-900/60 focus:bg-zinc-900 focus:ring-1 focus:ring-blue-500/50",
                                        col === "status" && row[col] === "done" && "text-green-400",
                                        col === "status" && row[col] === "error" && "text-red-400",
                                        col === "status" && row[col] === "processing" && "text-yellow-400",
                                        col === "url" && row[col]?.startsWith("http") && "text-blue-400"
                                      )}
                                    />
                                  </td>
                                ))}
                                <td className="px-1">
                                  <Button variant="ghost" size="icon" onClick={() => deleteWorksheetRow(row.id)}
                                    className="h-6 w-6 text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Bottom bar */}
                    {worksheetRows.length > 0 && (
                      <div className="flex items-center justify-between px-4 py-2 border-t border-[#27272a] bg-zinc-950/50 shrink-0">
                        <Button size="sm" onClick={addWorksheetEmptyRow}
                          className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                          <Plus className="h-3 w-3 mr-1" /> Add Row
                        </Button>
                        <span className="text-[10px] text-zinc-600">
                          {worksheetRows.length} row{worksheetRows.length !== 1 ? "s" : ""} &middot; {worksheetColumns.length} column{worksheetColumns.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* BULK PASTE TAB */}
                {worksheetTab === "bulk" && (
                  <div className="flex-1 flex flex-col p-5 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">Bulk Paste</h3>
                      <p className="text-xs text-zinc-500">Paste one item per line (URLs, product names, SKUs, etc.). Each line becomes a row.</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-zinc-400">Target column:</label>
                      <select
                        value={worksheetBulkColumn}
                        onChange={e => setWorksheetBulkColumn(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        {worksheetColumns.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      value={worksheetBulkText}
                      onChange={e => setWorksheetBulkText(e.target.value)}
                      placeholder={"https://example.com/products/item-1\nhttps://example.com/products/item-2\nhttps://example.com/products/item-3\n..."}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 font-mono placeholder:text-zinc-700 outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
                    />

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">
                        {worksheetBulkText.split("\n").filter(l => l.trim()).length} items detected
                      </span>
                      <Button
                        size="sm"
                        onClick={importBulkUrls}
                        disabled={!worksheetBulkText.trim() || worksheetSaving}
                        className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white px-4"
                      >
                        {worksheetSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                        Import {worksheetBulkText.split("\n").filter(l => l.trim()).length} rows
                      </Button>
                    </div>
                  </div>
                )}

                {/* CSV IMPORT TAB */}
                {worksheetTab === "csv" && (
                  <div className="flex-1 flex flex-col p-5 gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">CSV Import</h3>
                      <p className="text-xs text-zinc-500">
                        Upload a CSV file. The first row is used as column headers. Supports comma, semicolon, and tab delimiters.
                      </p>
                    </div>

                    <input
                      type="file"
                      ref={csvFileInputRef}
                      accept=".csv,.tsv,.txt"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleCsvUpload(file);
                        e.target.value = "";
                      }}
                    />

                    <div
                      onClick={() => csvFileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files[0];
                        if (file) handleCsvUpload(file);
                      }}
                      className="flex-1 border-2 border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/30 transition-colors min-h-[200px]"
                    >
                      <FileSpreadsheet className="h-10 w-10 text-zinc-700" />
                      <div className="text-center">
                        <p className="text-sm text-zinc-400 mb-1">Drop a CSV file here or click to browse</p>
                        <p className="text-xs text-zinc-600">Supports .csv, .tsv, and .txt files</p>
                      </div>
                    </div>

                    <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Example format</p>
                      <pre className="text-[11px] text-zinc-400 font-mono leading-relaxed">
{`url,title,price,status
https://store.com/product-1,Blue T-Shirt,29.99,pending
https://store.com/product-2,Red Hoodie,49.99,pending`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tasks & Schedule fullscreen overlay */}
          {tasksOpen && (
            <div className="absolute inset-0 z-40 bg-[#09090b] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#27272a] bg-[#0a0a0a] shrink-0">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-blue-400" />
                  <h2 className="text-white text-sm font-medium">Tasks & Schedule</h2>
                  {agentTasks.some(t => t.status === "running") && (
                    <Badge className="bg-blue-500/10 text-blue-400 text-[10px] px-1.5 py-0 animate-pulse">
                      running
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setTasksOpen(false)}
                  className="h-7 w-7 text-zinc-400 hover:text-white">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-0 border-b border-[#27272a] px-5 shrink-0">
                <button onClick={() => setTasksTab("tasks")}
                  className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    tasksTab === "tasks" ? "border-blue-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <ListTodo className="h-3.5 w-3.5" /> Tasks
                  {agentTasks.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-400 ml-1">
                      {agentTasks.length}
                    </Badge>
                  )}
                </button>
                <button onClick={() => { setTasksTab("schedule"); loadCronJobs(); }}
                  className={cn("px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    tasksTab === "schedule" ? "border-blue-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <CalendarClock className="h-3.5 w-3.5" /> Scheduled Jobs
                  {cronJobs.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-400 ml-1">
                      {cronJobs.filter(j => j.enabled).length} active
                    </Badge>
                  )}
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* TASKS TAB */}
                {tasksTab === "tasks" && (
                  <div className="flex-1 overflow-y-auto">
                    {tasksLoading && agentTasks.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-zinc-500">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks...
                      </div>
                    ) : agentTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <ListTodo className="h-8 w-8 text-zinc-700 mb-3" />
                        <p className="text-sm text-zinc-400 mb-1">No tasks yet</p>
                        <p className="text-xs text-zinc-600 max-w-xs">
                          Tasks appear here when scheduled jobs run or when bulk operations need more time to complete.
                        </p>
                      </div>
                    ) : (
                      <div>
                        {/* Active / Pending tasks */}
                        {agentTasks.some(t => t.status === "running" || t.status === "pending") && (
                          <div>
                            <div className="px-5 py-2.5 bg-zinc-950/50 border-b border-zinc-800/50 sticky top-0 z-10">
                              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                                Active
                              </h3>
                            </div>
                            {agentTasks.filter(t => t.status === "running" || t.status === "pending").map(task => (
                              <div key={task.id} className="px-5 py-3 border-b border-zinc-800/30 bg-blue-500/[0.02]">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 shrink-0">
                                    {task.status === "running" ? <Loader2 className="h-4 w-4 text-blue-400 animate-spin" /> : <Timer className="h-4 w-4 text-yellow-400" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-white">
                                        {task.input.cronJobName || task.input.prompt?.slice(0, 80) || "Task"}
                                      </span>
                                      <Badge className={cn("text-[10px] px-1.5 py-0", task.status === "running" ? "bg-blue-500/10 text-blue-400" : "bg-yellow-500/10 text-yellow-400")}>
                                        {task.status}
                                      </Badge>
                                      {task.type === "cron" && <Badge className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-400">scheduled</Badge>}
                                    </div>
                                    {task.progress && (
                                      <p className="text-[11px] text-blue-400 flex items-center gap-1.5">
                                        <RotateCcw className="h-3 w-3 animate-spin" /> {task.progress}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Completed cron job runs — nice overview */}
                        {agentTasks.some(t => t.type === "cron" && (t.status === "completed" || t.status === "error")) && (
                          <div>
                            <div className="px-5 py-2.5 bg-zinc-950/50 border-b border-zinc-800/50 sticky top-0 z-10">
                              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                <CalendarClock className="h-3 w-3 text-purple-400" />
                                Scheduled Job Runs
                              </h3>
                            </div>
                            {agentTasks.filter(t => t.type === "cron" && (t.status === "completed" || t.status === "error")).map(task => (
                              <div key={task.id} className="px-5 py-3 border-b border-zinc-800/30 hover:bg-zinc-900/30 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 shrink-0">
                                    {task.status === "completed"
                                      ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                                      : <XCircle className="h-4 w-4 text-red-400" />
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium text-white">
                                        {task.input.cronJobName || "Scheduled Job"}
                                      </span>
                                      <Badge className={cn("text-[10px] px-1.5 py-0",
                                        task.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                      )}>
                                        {task.status === "completed" ? "success" : "failed"}
                                      </Badge>
                                      <span className="text-[10px] text-zinc-600 ml-auto shrink-0">
                                        {new Date(task.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>

                                    {/* Always show result preview for cron tasks */}
                                    <div className={cn(
                                      "mt-1.5 rounded-lg border p-3 text-xs",
                                      task.error
                                        ? "bg-red-950/20 border-red-900/30 text-red-300"
                                        : "bg-zinc-900/40 border-zinc-800/60 text-zinc-300"
                                    )}>
                                      {taskExpanded === task.id ? (
                                        <div className="max-h-64 overflow-y-auto">
                                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {task.error || task.result || "No output."}
                                          </ReactMarkdown>
                                        </div>
                                      ) : (
                                        <p className="text-[11px] line-clamp-3 text-zinc-400">
                                          {(task.error || task.result || "No output.").slice(0, 200)}
                                          {(task.error || task.result || "").length > 200 && "..."}
                                        </p>
                                      )}
                                      {(task.error || task.result || "").length > 200 && (
                                        <button
                                          onClick={() => setTaskExpanded(taskExpanded === task.id ? null : task.id)}
                                          className="text-[10px] text-blue-400 hover:text-blue-300 mt-1.5 transition-colors"
                                        >
                                          {taskExpanded === task.id ? "Show less" : "Show full result"}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}
                                    className="h-6 w-6 text-zinc-700 hover:text-red-400 shrink-0 mt-0.5">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Other completed/errored tasks (non-cron) */}
                        {agentTasks.some(t => t.type !== "cron" && (t.status === "completed" || t.status === "error")) && (
                          <div>
                            <div className="px-5 py-2.5 bg-zinc-950/50 border-b border-zinc-800/50 sticky top-0 z-10">
                              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                <History className="h-3 w-3 text-zinc-500" />
                                Other Tasks
                              </h3>
                            </div>
                            {agentTasks.filter(t => t.type !== "cron" && (t.status === "completed" || t.status === "error")).map(task => (
                              <div key={task.id} className="px-5 py-2.5 border-b border-zinc-800/30 hover:bg-zinc-900/30 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 shrink-0">
                                    {task.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-zinc-400 truncate">
                                        {task.input.prompt?.slice(0, 100) || "Task"}
                                      </span>
                                      <span className="text-[10px] text-zinc-600 ml-auto shrink-0">
                                        {new Date(task.updatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    {(task.result || task.error) && (
                                      <button
                                        onClick={() => setTaskExpanded(taskExpanded === task.id ? null : task.id)}
                                        className="text-[10px] text-zinc-500 hover:text-white mt-0.5 transition-colors"
                                      >
                                        {taskExpanded === task.id ? "Hide" : "Show result"}
                                      </button>
                                    )}
                                    {taskExpanded === task.id && (
                                      <div className={cn(
                                        "mt-1.5 rounded-lg border p-2.5 text-xs max-h-40 overflow-y-auto",
                                        task.error ? "bg-red-950/20 border-red-900/30 text-red-300" : "bg-zinc-900/50 border-zinc-800 text-zinc-300"
                                      )}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                          {task.error || task.result || ""}
                                        </ReactMarkdown>
                                      </div>
                                    )}
                                  </div>
                                  <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}
                                    className="h-5 w-5 text-zinc-700 hover:text-red-400 shrink-0">
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* SCHEDULE TAB */}
                {tasksTab === "schedule" && (
                  <div className="flex-1 overflow-y-auto">
                    {/* Create new job form */}
                    <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-950/30">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">New Scheduled Job</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-zinc-500 mb-1 block">Name</label>
                            <input
                              type="text"
                              value={cronForm.name}
                              onChange={e => setCronForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="e.g. Daily Sales Report"
                              className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-zinc-500 mb-1 block">Schedule</label>
                            <div className="flex items-center gap-2">
                              <select
                                value={cronForm.scheduleType}
                                onChange={e => setCronForm(prev => ({ ...prev, scheduleType: e.target.value as "daily" | "interval" }))}
                                className="bg-[#09090b] border border-[#27272a] rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                              >
                                <option value="daily">Daily at</option>
                                <option value="interval">Every</option>
                              </select>
                              {cronForm.scheduleType === "daily" ? (
                                <input
                                  type="time"
                                  value={cronForm.time}
                                  onChange={e => setCronForm(prev => ({ ...prev, time: e.target.value }))}
                                  className="bg-[#09090b] border border-[#27272a] rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40 [color-scheme:dark]"
                                />
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={cronForm.minutes}
                                    onChange={e => setCronForm(prev => ({ ...prev, minutes: parseInt(e.target.value) || 60 }))}
                                    min={5}
                                    className="w-16 bg-[#09090b] border border-[#27272a] rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                                  />
                                  <span className="text-[11px] text-zinc-500">min</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-500 mb-1 block">Prompt (what should the agent do?)</label>
                          <textarea
                            value={cronForm.prompt}
                            onChange={e => setCronForm(prev => ({ ...prev, prompt: e.target.value }))}
                            placeholder="e.g. Generate a daily sales report with top products, revenue trends, and action items."
                            rows={2}
                            className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={createCronJob}
                          disabled={cronCreating || !cronForm.name.trim() || !cronForm.prompt.trim()}
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white px-4"
                        >
                          {cronCreating ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                          Create Job
                        </Button>
                      </div>
                    </div>

                    {/* Job list */}
                    {cronLoading && cronJobs.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-zinc-500">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
                      </div>
                    ) : cronJobs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CalendarClock className="h-8 w-8 text-zinc-700 mb-3" />
                        <p className="text-sm text-zinc-400 mb-1">No scheduled jobs</p>
                        <p className="text-xs text-zinc-600 max-w-xs">
                          Create a scheduled job above. The agent will automatically execute it at the configured time.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-800/50">
                        {cronJobs.map(job => (
                          <div key={job.id} className="px-5 py-3 hover:bg-zinc-900/30 transition-colors">
                            <div className="flex items-start gap-3">
                              {/* Status icon */}
                              <div className="mt-0.5 shrink-0">
                                {job.enabled ? (
                                  <CalendarClock className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <Pause className="h-4 w-4 text-zinc-600" />
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("text-xs font-medium truncate", job.enabled ? "text-white" : "text-zinc-500")}>
                                    {job.name}
                                  </span>
                                  <Badge className={cn(
                                    "text-[10px] px-1.5 py-0 shrink-0",
                                    job.enabled ? "bg-blue-500/10 text-blue-400" : "bg-zinc-800 text-zinc-600"
                                  )}>
                                    {job.enabled ? "active" : "paused"}
                                  </Badge>
                                  {job.lastResult && (
                                    <Badge className={cn(
                                      "text-[10px] px-1.5 py-0 shrink-0",
                                      job.lastResult.status === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                    )}>
                                      last: {job.lastResult.status}
                                    </Badge>
                                  )}
                                </div>

                                {/* Schedule info */}
                                <div className="flex items-center gap-3 text-[11px] text-zinc-500 mb-1">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {job.schedule.type === "daily" ? `Daily at ${job.schedule.time}` : `Every ${job.schedule.minutes} min`}
                                  </span>
                                  {job.nextRun && job.enabled && (
                                    <span className="flex items-center gap-1">
                                      <Timer className="h-3 w-3" />
                                      Next: {new Date(job.nextRun).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                  {job.lastRun && (
                                    <span className="flex items-center gap-1">
                                      <History className="h-3 w-3" />
                                      Last: {new Date(job.lastRun).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  )}
                                </div>

                                {/* Prompt preview */}
                                <p className="text-[11px] text-zinc-600 truncate">{job.prompt}</p>

                                {/* Expandable history */}
                                {job.history && job.history.length > 0 && (
                                  <div className="mt-2">
                                    <button
                                      onClick={() => setCronExpanded(cronExpanded === job.id ? null : job.id)}
                                      className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                                    >
                                      {cronExpanded === job.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      History ({job.history.length} runs)
                                    </button>
                                    {cronExpanded === job.id && (
                                      <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto">
                                        {job.history.map((h, i) => (
                                          <div key={i} className={cn(
                                            "rounded-lg border p-2.5 text-xs",
                                            h.status === "success"
                                              ? "bg-green-950/20 border-green-900/30"
                                              : "bg-red-950/20 border-red-900/30"
                                          )}>
                                            <div className="flex items-center gap-2 mb-1">
                                              {h.status === "success" ? (
                                                <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                                              ) : (
                                                <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                              )}
                                              <span className="text-[10px] text-zinc-500">
                                                {new Date(h.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                              </span>
                                            </div>
                                            <p className={cn(
                                              "text-[11px] line-clamp-3",
                                              h.status === "success" ? "text-green-300/80" : "text-red-300/80"
                                            )}>
                                              {h.summary}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Tooltip>
                                  <TooltipTrigger render={<div />}>
                                    <Button variant="ghost" size="icon"
                                      onClick={() => toggleCronJob(job.id, !job.enabled)}
                                      className="h-7 w-7 text-zinc-500 hover:text-white">
                                      {job.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{job.enabled ? "Pause" : "Resume"}</TooltipContent>
                                </Tooltip>
                                <Button variant="ghost" size="icon" onClick={() => deleteCronJob(job.id)}
                                  className="h-7 w-7 text-zinc-700 hover:text-red-400">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#27272a] bg-[#0a0a0a] shrink-0">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="text-zinc-400 hover:text-white h-8 w-8"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
            {currentAgent && (
              <>
                <Avatar className="h-9 w-9">
                  <AvatarFallback
                    className={cn(
                      "text-white text-xs font-bold",
                      getAgentColor(currentAgent.type)
                    )}
                  >
                    {getAgentInitials(currentAgent.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    {currentAgent.name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        currentAgent.status === "online"
                          ? "default"
                          : "secondary"
                      }
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        currentAgent.status === "online"
                          ? "bg-green-500/10 text-green-500 hover:bg-green-500/10"
                          : "bg-zinc-800 text-zinc-500 hover:bg-zinc-800"
                      )}
                    >
                      {currentAgent.status === "online"
                        ? "Online"
                        : "Offline"}
                    </Badge>
                    <span className="text-xs text-zinc-500">
                      {currentAgent.storeName}
                    </span>
                  </div>
                </div>
              </>
            )}
            {!currentAgent && !sidebarOpen && (
              <p className="text-sm text-zinc-500">No agent selected</p>
            )}
            {!currentAgent && sidebarOpen && (
              <p className="text-sm text-zinc-500">No agent selected</p>
            )}

            {/* Agent files + settings */}
            {currentAgent && (
              <div className="flex items-center gap-1 ml-auto mr-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openFile("soul.md")}
                  className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  soul.md
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openFile("memory.md")}
                  className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
                >
                  <Brain className="h-3.5 w-3.5" />
                  memory.md
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openWorksheet}
                  className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
                >
                  <Table2 className="h-3.5 w-3.5" />
                  worksheet
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openTasks}
                  className="h-7 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1.5"
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  tasks
                  {agentTasks.some(t => t.status === "running" || t.status === "pending") && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </Button>
                <div className="w-px h-5 bg-[#27272a] mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Connection status indicator */}
            <div className={cn("flex items-center gap-1.5", !currentAgent ? "ml-auto" : "")}>
              <Tooltip>
                <TooltipTrigger render={<div />}>
                  <div className="flex items-center gap-1.5 cursor-default">
                    {connectionStatus === "connected" && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <Wifi className="h-3.5 w-3.5 text-green-500" />
                      </>
                    )}
                    {connectionStatus === "reconnecting" && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                        <Wifi className="h-3.5 w-3.5 text-yellow-500" />
                      </>
                    )}
                    {connectionStatus === "disconnected" && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        <WifiOff className="h-3.5 w-3.5 text-red-500" />
                      </>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {connectionStatus === "connected" && "Connected"}
                  {connectionStatus === "reconnecting" && "Reconnecting..."}
                  {connectionStatus === "disconnected" && "Disconnected"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-4 max-w-4xl mx-auto">
              {agents.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <MessageSquare className="h-10 w-10 text-zinc-700 mb-4" />
                  <p className="text-sm font-medium text-zinc-400 mb-1">
                    No agents to chat with
                  </p>
                  <p className="text-xs text-zinc-600 mb-4">
                    Deploy an agent first to start a conversation.
                  </p>
                  <Button
                    asChild
                    className="bg-blue-500 hover:bg-blue-600 text-white font-medium"
                  >
                    <a href="/dashboard/store">Browse Agent Store</a>
                  </Button>
                </div>
              )}

              {agents.length > 0 && !selectedAgent && (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <Bot className="h-10 w-10 text-zinc-700 mb-4" />
                  <p className="text-sm text-zinc-500">
                    Select an agent from the sidebar to start chatting
                  </p>
                </div>
              )}

              {/* Welcome message when agent selected but no messages */}
              {currentAgent && currentMessages.length === 0 && (
                <div className="max-w-2xl mx-auto mt-8">
                  <div className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-[#27272a] rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback
                          className={cn(
                            "text-white text-xs font-bold",
                            getAgentColor(currentAgent.type)
                          )}
                        >
                          {getAgentInitials(currentAgent.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{currentAgent.name}</h3>
                        <p className="text-xs text-zinc-500">{currentAgent.type} &middot; {currentAgent.storeName}</p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-5">
                      <div className="flex items-start gap-2.5">
                        <Zap className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">What can I do?</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {currentAgent.type === "Product Research" || currentAgent.type === "Listing Optimization"
                              ? "I can analyze your products, generate SEO-friendly titles, optimize descriptions, and provide A/B suggestions."
                              : currentAgent.type === "Competitor Monitoring" || currentAgent.type === "Competitor Monitor"
                              ? "I monitor your competitors, compare prices, and give you daily updates on market changes."
                              : currentAgent.type === "Customer Service"
                              ? "I handle customer questions, process returns, and keep your customers happy."
                              : "I help you with tasks around your e-commerce store. Just ask me anything!"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <GraduationCap className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">Train me</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Upload SOPs, guides, or product info to train me. Use the
                            <span className="text-blue-400 font-medium"> soul.md</span> button to adjust my instructions, or
                            <span className="text-purple-400 font-medium"> memory.md</span> for additional knowledge.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-zinc-200">Self-learning</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Give me feedback and I&apos;ll remember it. I learn from every interaction and get better at what you need over time.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-[#27272a]">
                      <BookOpen className="h-3.5 w-3.5 text-zinc-600" />
                      <p className="text-[11px] text-zinc-600">
                        Tip: Send a message to get started, or upload files using the paperclip icon.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {currentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex items-end gap-2.5",
                    msg.sender === "user"
                      ? "ml-auto flex-row-reverse max-w-[80%]"
                      : "max-w-[85%]"
                  )}
                >
                  {msg.sender === "agent" && currentAgent ? (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback
                        className={cn(
                          "text-white text-[9px] font-bold",
                          getAgentColor(currentAgent.type)
                        )}
                      >
                        {getAgentInitials(currentAgent.name)}
                      </AvatarFallback>
                    </Avatar>
                  ) : msg.sender === "user" ? (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[10px] font-bold">
                        {getUserInitials(user?.name)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-zinc-800">
                        <Bot className="h-4 w-4 text-blue-500" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <Tooltip>
                    <TooltipTrigger render={<div />}>
                      <div
                        className={cn(
                          "rounded-lg px-4 py-2.5 text-sm leading-relaxed",
                          msg.sender === "user"
                            ? "bg-blue-500 text-white rounded-br-sm"
                            : "bg-[#0a0a0a] border border-[#27272a] text-zinc-300 rounded-bl-sm"
                        )}
                      >
                        {msg.sender === "user" ? (
                          <div className="whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {formatFullTimestamp(msg.timestamp)}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}

              {/* Waking up indicator */}
              {selectedAgent && wakingAgents.has(selectedAgent) && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                  <span className="text-sm text-yellow-500">
                    Waking up your agent...
                  </span>
                </div>
              )}

              {/* Streaming message */}
              {isStreaming &&
                streamingAgentId === selectedAgent &&
                currentAgent && (
                  <div className="flex items-end gap-2.5 max-w-[85%]">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback
                        className={cn(
                          "text-white text-[9px] font-bold",
                          getAgentColor(currentAgent.type)
                        )}
                      >
                        {getAgentInitials(currentAgent.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed text-zinc-300">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                        <span className="text-xs text-zinc-400">
                          {currentAgent?.name || "Agent"} is working...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <Separator className="bg-[#27272a] shrink-0" />

          {/* Input */}
          <div className="p-4 bg-[#0a0a0a] shrink-0">
            <div className="max-w-4xl mx-auto">
              {/* Attachment preview */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 bg-zinc-800/60 border border-[#27272a] rounded-lg px-3 py-1.5">
                      {file.type.startsWith("image/") ? (
                        <div className="h-8 w-8 rounded overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="text-xs text-zinc-300 max-w-[120px] truncate">{file.name}</span>
                      <button
                        onClick={() => removeAttachment(i)}
                        className="text-zinc-500 hover:text-white ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileAttach}
                  className="hidden"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedAgent || connectionStatus !== "connected"}
                  className="shrink-0 text-zinc-500 hover:text-white h-[42px] w-[42px]"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    agents.length === 0
                      ? "Deploy an agent to start chatting..."
                      : connectionStatus !== "connected"
                        ? "Connecting..."
                        : isStreaming
                          ? "Agent is responding..."
                          : "Type a message or upload files..."
                  }
                  rows={1}
                  disabled={
                    agents.length === 0 ||
                    !selectedAgent ||
                    isStreaming ||
                    connectionStatus !== "connected"
                  }
                  className="flex-1 bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 resize-none min-h-[42px] max-h-36"
                />
                <Button
                  onClick={handleSend}
                  disabled={
                    (!inputValue.trim() && attachments.length === 0) ||
                    !selectedAgent ||
                    isStreaming ||
                    connectionStatus !== "connected"
                  }
                  size="icon"
                  className={cn(
                    "shrink-0 transition-all h-[42px] w-[42px]",
                    (inputValue.trim() || attachments.length > 0) &&
                      selectedAgent &&
                      !isStreaming &&
                      connectionStatus === "connected"
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  )}
                >
                  {isStreaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Editor Sheet */}
      <Sheet open={fileEditorOpen} onOpenChange={setFileEditorOpen}>
        <SheetContent showCloseButton={false} className="w-[500px] sm:w-[600px] bg-[#09090b] border-[#27272a] p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b border-[#27272a] shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeFile === "soul.md" ? (
                  <FileText className="h-4 w-4 text-blue-400" />
                ) : (
                  <Brain className="h-4 w-4 text-purple-400" />
                )}
                <SheetTitle className="text-white text-sm">
                  {activeFile}
                </SheetTitle>
                {fileContent !== fileOriginal && (
                  <Badge className="bg-yellow-500/10 text-yellow-500 text-[10px] px-1.5 py-0">
                    unsaved
                  </Badge>
                )}
                {fileSaved && (
                  <Badge className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0">
                    saved
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={saveFile}
                  disabled={fileSaving || fileContent === fileOriginal}
                  className={cn(
                    "h-7 text-xs gap-1.5",
                    fileContent !== fileOriginal
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {fileSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFileEditorOpen(false)}
                  className="h-7 w-7 text-zinc-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Edit / Preview tabs */}
            <div className="flex items-center gap-1 mt-3">
              <button
                onClick={() => setFileEditMode(false)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  !fileEditMode
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Preview
              </button>
              <button
                onClick={() => setFileEditMode(true)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  fileEditMode
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Edit
              </button>
            </div>
          </SheetHeader>
          <div className="flex-1 p-4 overflow-hidden">
            {fileEditMode ? (
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-full bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 text-sm text-zinc-300 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500 placeholder:text-zinc-600"
                placeholder={
                  activeFile === "soul.md"
                    ? "# Agent Instructions\n\nDefine what your agent should do..."
                    : "# Agent Memory\n\nAdd important context, product info, rules..."
                }
                spellCheck={false}
              />
            ) : (
              <div className="w-full h-full overflow-y-auto bg-[#0a0a0a] border border-[#27272a] rounded-lg p-5">
                {fileContent ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {fileContent}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm text-zinc-600 italic">
                    No content yet. Switch to Edit to add instructions.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#27272a] shrink-0">
            <p className="text-[10px] text-zinc-600">
              {fileEditMode
                ? "Use Markdown formatting. Changes are pushed to your live agent instantly — no redeploy needed."
                : "Click Edit to modify. Changes are pushed to your live agent instantly."}
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Agent Settings Sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent showCloseButton={false} className="w-[400px] sm:w-[450px] bg-[#09090b] border-[#27272a] p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b border-[#27272a] shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-zinc-400" />
                <SheetTitle className="text-white text-sm">
                  Agent Settings
                </SheetTitle>
                {settingsSaved && (
                  <Badge className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0">
                    saved
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(false)}
                className="h-7 w-7 text-zinc-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {currentAgent && (
              <p className="text-xs text-zinc-500 mt-1">
                Configure {currentAgent.name}
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Schedule */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                <h4 className="text-sm font-medium text-white">Schedule</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400">Run daily</label>
                  <button
                    onClick={() => updateSetting("scheduleEnabled", !getCurrentSettings().scheduleEnabled)}
                    className={cn(
                      "relative w-9 h-5 rounded-full transition-colors",
                      getCurrentSettings().scheduleEnabled ? "bg-blue-500" : "bg-zinc-700"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                        getCurrentSettings().scheduleEnabled && "translate-x-4"
                      )}
                    />
                  </button>
                </div>
                {getCurrentSettings().scheduleEnabled && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-zinc-400 shrink-0">Every day at</label>
                    <input
                      type="time"
                      value={getCurrentSettings().schedule}
                      onChange={(e) => updateSetting("schedule", e.target.value)}
                      className="bg-[#09090b] border border-[#27272a] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/40 [color-scheme:dark]"
                    />
                  </div>
                )}
                <p className="text-[11px] text-zinc-600">
                  Agent automatically runs its tasks at the scheduled time.
                </p>
              </div>
            </div>

            {/* Language */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" />
                <h4 className="text-sm font-medium text-white">Response Language</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.value}
                      onClick={() => updateSetting("responseLanguage", lang.value)}
                      className={cn(
                        "px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                        getCurrentSettings().responseLanguage === lang.value
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                          : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:text-white hover:bg-zinc-800"
                      )}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600 mt-3">
                  The language the agent uses to respond in chat.
                </p>
              </div>
            </div>

            {/* Listing Language */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-teal-400" />
                <h4 className="text-sm font-medium text-white">Listing Language</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.value}
                      onClick={() => updateSetting("listingLanguage", lang.value)}
                      className={cn(
                        "px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                        getCurrentSettings().listingLanguage === lang.value
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                          : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:text-white hover:bg-zinc-800"
                      )}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600 mt-3">
                  The language for product titles, descriptions, and tags.
                </p>
              </div>
            </div>

            {/* Title Prompt */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-orange-400" />
                <h4 className="text-sm font-medium text-white">Title Rules</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-2">
                <textarea
                  value={getCurrentSettings().titlePrompt}
                  onChange={(e) => updateSetting("titlePrompt", e.target.value)}
                  placeholder="e.g. Always start with brand name, max 70 chars, include main keyword..."
                  rows={3}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
                />
                <p className="text-[11px] text-zinc-600">
                  Instructions for how the agent writes product titles.
                </p>
              </div>
            </div>

            {/* Description Prompt */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-indigo-400" />
                <h4 className="text-sm font-medium text-white">Description Rules</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-2">
                <textarea
                  value={getCurrentSettings().descriptionPrompt}
                  onChange={(e) => updateSetting("descriptionPrompt", e.target.value)}
                  placeholder="e.g. Use bullet points, include sizing table, emotional tone, max 500 words..."
                  rows={3}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
                />
                <p className="text-[11px] text-zinc-600">
                  Instructions for how the agent writes product descriptions.
                </p>
              </div>
            </div>

            {/* Price Rules */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                <h4 className="text-sm font-medium text-white">Price Rules</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-2">
                <textarea
                  value={getCurrentSettings().priceRules}
                  onChange={(e) => updateSetting("priceRules", e.target.value)}
                  placeholder="e.g. Convert EUR to USD, 30% markup, round to X4.95 or X9.95, compare_at_price = original price..."
                  rows={3}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
                />
                <p className="text-[11px] text-zinc-600">
                  Currency conversion, markup, and rounding rules for product prices.
                </p>
              </div>
            </div>

            {/* Default Status */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-zinc-400" />
                <h4 className="text-sm font-medium text-white">Default Product Status</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "draft", label: "Draft" },
                    { value: "active", label: "Active (Published)" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateSetting("defaultStatus", opt.value)}
                      className={cn(
                        "px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                        getCurrentSettings().defaultStatus === opt.value
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                          : "bg-zinc-800/50 text-zinc-400 border border-transparent hover:text-white hover:bg-zinc-800"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-600 mt-3">
                  Whether new products are created as draft or published immediately.
                </p>
              </div>
            </div>

            {/* Custom Rules */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-rose-400" />
                <h4 className="text-sm font-medium text-white">Custom Rules</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-2">
                <textarea
                  value={getCurrentSettings().customRules}
                  onChange={(e) => updateSetting("customRules", e.target.value)}
                  placeholder="e.g. Never use the word 'cheap', always add tag 'dropship', use brand name 'MyStore' in SEO..."
                  rows={4}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-md px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 resize-none"
                />
                <p className="text-[11px] text-zinc-600">
                  Any extra rules or instructions the agent should always follow.
                </p>
              </div>
            </div>

            {/* Self-learning / Memory */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h4 className="text-sm font-medium text-white">Self-learning Memory</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs text-zinc-300 font-medium">Write to memory</label>
                    <p className="text-[11px] text-zinc-600 mt-0.5">Agent learns from feedback and remembers context</p>
                  </div>
                  <button
                    onClick={() => updateSetting("memoryWriteEnabled", !getCurrentSettings().memoryWriteEnabled)}
                    className={cn(
                      "relative w-9 h-5 rounded-full transition-colors shrink-0",
                      getCurrentSettings().memoryWriteEnabled ? "bg-blue-500" : "bg-zinc-700"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                        getCurrentSettings().memoryWriteEnabled && "translate-x-4"
                      )}
                    />
                  </button>
                </div>
                <p className="text-[11px] text-zinc-600">
                  When enabled, the agent writes learned insights to memory.md after each interaction. This makes the agent smarter over time.
                </p>
              </div>
            </div>

            {/* Upload training files */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-purple-400" />
                <h4 className="text-sm font-medium text-white">Training Files</h4>
              </div>
              <div className="bg-[#0a0a0a] border border-[#27272a] rounded-lg p-4 space-y-3">
                <p className="text-xs text-zinc-400">
                  Upload SOPs, guides, product lists, or other documents to train your agent.
                </p>
                <input
                  ref={trainingFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,image/*"
                  onChange={handleTrainingUpload}
                  className="hidden"
                />
                {trainingProcessing ? (
                  <div className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-blue-500/30 rounded-lg py-6 bg-blue-500/5">
                    <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                    <span className="text-xs text-blue-400">
                      Processing {trainingFiles.length} file{trainingFiles.length !== 1 ? "s" : ""}...
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Reading content and writing to memory.md
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => trainingFileInputRef.current?.click()}
                    className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-[#27272a] rounded-lg py-6 hover:border-zinc-600 transition-colors group"
                  >
                    <Upload className="h-6 w-6 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-400">
                      Click to upload files
                    </span>
                    <span className="text-[10px] text-zinc-700">
                      TXT, MD, CSV, JSON, DOCX, images
                    </span>
                  </button>
                )}
                <p className="text-[11px] text-zinc-600">
                  File contents are extracted and appended to your agent&apos;s memory.md automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="px-5 py-4 border-t border-[#27272a] shrink-0">
            <Button
              onClick={saveSettings}
              disabled={settingsSaving}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm h-9"
            >
              {settingsSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Worksheet is now rendered inline as fullscreen overlay */}
    </TooltipProvider>
  );
}
