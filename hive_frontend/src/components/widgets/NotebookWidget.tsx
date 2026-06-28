import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Play, Plus, Trash2, RefreshCw, Terminal, FolderOpen, FileText,
  Folder, ChevronRight, ChevronDown, X, Save, FilePlus, FolderPlus, Pencil,
} from 'lucide-react';

import { API_URL as API } from '../../config';

const STARTER_CELL = `# HIVE Notebook — pandas, numpy, matplotlib pre-loaded.
# Click a .ipynb or .py file in the browser to load it, or start coding below.

df = load_data()
print(f"Dataset: {df.shape[0]:,} rows x {df.shape[1]} columns")
print(df.dtypes.to_string())`;

interface IFileNode { name: string; path: string; type: 'file' | 'dir'; ext?: string; children?: IFileNode[]; }
interface CellOutput { stdout: string; stderr: string; error: string | null; images: string[]; }
interface Cell {
  id: string;
  cellType: 'code' | 'markdown';
  code: string;
  output: CellOutput | null;
  running: boolean;
  executionCount: number | null;
  originalIndex: number | null;
}
interface KernelInfo { python_version: string; python_executable: string; platform: string; }
interface FileEditor { path: string; name: string; content: string; original: string; saving: boolean; }

const DEFAULT_NB_META = {
  kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
  language_info: { name: 'python' },
};

let _idCounter = 0;
const newId = () => `cell_${Date.now()}_${_idCounter++}`;
const makeCell = (
  code = '',
  opts: { cellType?: 'code' | 'markdown'; executionCount?: number | null; output?: CellOutput | null; originalIndex?: number | null } = {},
): Cell => ({
  id: newId(),
  cellType: opts.cellType ?? 'code',
  code,
  output: opts.output ?? null,
  running: false,
  executionCount: opts.executionCount ?? null,
  originalIndex: opts.originalIndex ?? null,
});

const asText = (v: unknown): string =>
  Array.isArray(v) ? v.join('') : v == null ? '' : String(v);

const nbOutputsToCellOutput = (outputs: any[] | undefined): CellOutput | null => {
  if (!outputs || outputs.length === 0) return null;
  let stdout = '';
  let stderr = '';
  let error: string | null = null;
  const images: string[] = [];
  for (const o of outputs) {
    if (!o) continue;
    if (o.output_type === 'stream') {
      const text = asText(o.text);
      if (o.name === 'stderr') stderr += text;
      else stdout += text;
    } else if (o.output_type === 'error') {
      const tb = Array.isArray(o.traceback) ? o.traceback.join('\n') : '';
      error = tb || `${o.ename ?? 'Error'}: ${o.evalue ?? ''}`;
    } else if (o.output_type === 'display_data' || o.output_type === 'execute_result') {
      const data = o.data || {};
      if (data['image/png']) images.push(asText(data['image/png']).replace(/\s/g, ''));
      else if (data['text/plain']) stdout += asText(data['text/plain']);
    }
  }
  return { stdout, stderr, error, images };
};

const cellOutputToNbOutputs = (out: CellOutput | null): any[] => {
  if (!out) return [];
  const outputs: any[] = [];
  if (out.stdout) outputs.push({ output_type: 'stream', name: 'stdout', text: out.stdout });
  if (out.stderr) outputs.push({ output_type: 'stream', name: 'stderr', text: out.stderr });
  if (out.error) {
    const lines = out.error.split('\n');
    outputs.push({ output_type: 'error', ename: 'Error', evalue: lines[lines.length - 2] ?? '', traceback: lines });
  }
  for (const img of out.images) {
    outputs.push({ output_type: 'display_data', data: { 'image/png': img }, metadata: {} });
  }
  return outputs;
};

const cellToNbCell = (cell: Cell) => {
  const lines = cell.code.split('\n');
  const source = lines.map((line, i) => (i === lines.length - 1 ? line : line + '\n'));
  if (cell.cellType === 'markdown') {
    return { cell_type: 'markdown', metadata: {}, source };
  }
  return {
    cell_type: 'code',
    execution_count: cell.executionCount,
    metadata: {},
    outputs: cellOutputToNbOutputs(cell.output),
    source,
  };
};

const renderMarkdown = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h5 style="margin:0.4em 0 0.2em;font-size:0.95rem;font-weight:600">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 style="margin:0.5em 0 0.25em;font-size:1rem;font-weight:600">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:0.5em 0 0.25em;font-size:1.1rem;font-weight:600">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:0.6em 0 0.3em;font-size:1.25rem;font-weight:700">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>')
    .replace(/^\s*[-*] (.+)$/gm, '<div style="margin-left:1.2em;padding:1px 0">&#8226; $1</div>')
    .replace(/^\s*(\d+)\. (.+)$/gm, '<div style="margin-left:1.2em;padding:1px 0">$1. $2</div>')
    .replace(/\n\n/g, '<div style="height:0.5em"></div>')
    .replace(/\n/g, '<br/>');
};

/* ---- File tree node ---- */
interface FileTreeNodeProps {
  node: IFileNode;
  onFileClick: (n: IFileNode) => void;
  onDeleteClick: (n: IFileNode) => void;
  onCreateInDir: (dirPath: string, isDir: boolean) => void;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({ node, onFileClick, onDeleteClick, onCreateInDir }) => {
  const [open, setOpen] = useState(node.name === 'data');
  const [hovered, setHovered] = useState(false);

  const actBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 3px',
    display: 'flex', alignItems: 'center', borderRadius: '3px',
    color: 'var(--text-muted)',
  };

  if (node.type === 'dir') {
    return (
      <div>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ display: 'flex', alignItems: 'center', borderRadius: '4px', background: hovered ? 'rgba(255,255,255,0.05)' : 'none' }}
        >
          <button
            onClick={() => setOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 4px', flex: 1, textAlign: 'left', fontSize: '0.78rem' }}
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <Folder size={12} color="var(--secondary)" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}/</span>
          </button>
          {hovered && (
            <div style={{ display: 'flex', gap: '1px', paddingRight: '2px', flexShrink: 0 }}>
              <button style={actBtn} title="New file here" onClick={() => { setOpen(true); onCreateInDir(node.path, false); }}>
                <FilePlus size={11} />
              </button>
              <button style={actBtn} title="New folder here" onClick={() => { setOpen(true); onCreateInDir(node.path, true); }}>
                <FolderPlus size={11} />
              </button>
              <button style={{ ...actBtn, color: '#f87171' }} title="Delete folder" onClick={() => onDeleteClick(node)}>
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
        {open && node.children && (
          <div style={{ paddingLeft: '14px' }}>
            {node.children.map(child => (
              <FileTreeNode key={child.path} node={child} onFileClick={onFileClick} onDeleteClick={onDeleteClick} onCreateInDir={onCreateInDir} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isCsv = node.ext === '.csv';
  const isCode = node.ext === '.ipynb' || node.ext === '.py';
  const color = isCsv ? 'var(--accent-success)' : isCode ? 'var(--secondary)' : 'var(--text-muted)';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'center', borderRadius: '4px', background: hovered ? 'rgba(255,255,255,0.05)' : 'none' }}
    >
      <button
        onClick={() => onFileClick(node)}
        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color, padding: '3px 4px', flex: 1, textAlign: 'left', fontSize: '0.78rem' }}
      >
        <FileText size={12} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </button>
      {hovered && (
        <div style={{ display: 'flex', gap: '1px', paddingRight: '2px', flexShrink: 0 }}>
          {!isCsv && (
            <button style={actBtn} title="Open editor" onClick={() => onFileClick(node)}>
              <Pencil size={11} />
            </button>
          )}
          <button style={{ ...actBtn, color: '#f87171' }} title="Delete" onClick={() => onDeleteClick(node)}>
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
};

/* ---- File Editor Modal ---- */
interface FileEditorModalProps {
  editor: FileEditor;
  onChange: (content: string) => void;
  onSave: () => void;
  onClose: () => void;
}

const FileEditorModal: React.FC<FileEditorModalProps> = ({ editor, onChange, onSave, onClose }) => {
  const dirty = editor.content !== editor.original;

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard and close?')) return;
    onClose();
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '85%', height: '85%', background: 'var(--bg-dark)',
        border: '1px solid var(--border-glass)', borderRadius: '12px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'var(--shadow-glass)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
          <FileText size={15} color="var(--secondary)" />
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{editor.path}</span>
          {dirty && <span style={{ fontSize: '0.72rem', color: 'var(--accent-warning)', padding: '1px 7px', background: 'rgba(245,158,11,0.15)', borderRadius: '4px' }}>unsaved</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={onSave}
              disabled={!dirty || editor.saving}
              className="glass-button"
              style={{ padding: '5px 14px', fontSize: '0.82rem' }}
            >
              <Save size={13} /> {editor.saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleClose} className="glass-button secondary" style={{ padding: '5px 10px', fontSize: '0.82rem' }}>
              <X size={14} />
            </button>
          </div>
        </div>
        {/* Editor */}
        <textarea
          value={editor.content}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, resize: 'none', background: 'rgba(0,0,0,0.25)', color: '#e2e8f0',
            border: 'none', outline: 'none', padding: '1rem 1.25rem',
            fontFamily: "'Fira Code','Monaco','Menlo',monospace", fontSize: '0.855rem',
            lineHeight: 1.65, tabSize: 4,
          }}
        />
      </div>
    </div>
  );
};

/* ---- Auto-growing code textarea ---- */
const CellCode: React.FC<{
  code: string;
  onChange: (v: string) => void;
  onRun: () => void;
}> = ({ code, onChange, onRun }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Primary sizing: rows attribute. Deterministic — no layout-timing dependency.
  const lineCount = (code.match(/\n/g)?.length ?? 0) + 1;
  const rows = Math.max(3, lineCount);

  // Secondary sizing: handle long lines that wrap visually. scrollHeight is unreliable
  // until the textarea has a real width, so we observe width and only refit then.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastWidth = 0;
    const fit = () => {
      const prev = el.style.height;
      el.style.height = 'auto';
      const target = el.scrollHeight;
      // Guard against absurd values seen before layout settles.
      if (target > 0 && target < 5000) {
        el.style.height = target + 'px';
      } else {
        el.style.height = prev;
      }
    };
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && Math.abs(w - lastWidth) > 1) {
        lastWidth = w;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [code]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      className="notebook-cell-code"
      value={code}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onRun(); } }}
      spellCheck={false}
      style={{ resize: 'none' }}
      placeholder="# Python code here — Ctrl+Enter to run, ! prefix for shell commands"
    />
  );
};

/* ---- Main widget ---- */
const NotebookWidget: React.FC = () => {
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const [cells, setCells]           = useState<Cell[]>(() => [makeCell(STARTER_CELL)]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [resetting, setResetting]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(null);
  const [files, setFiles]           = useState<IFileNode[]>([]);
  const [showFiles, setShowFiles]   = useState(true);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [envName, setEnvName]       = useState('myenv');
  const [envPython, setEnvPython]   = useState('3.12');
  const [fileEditor, setFileEditor] = useState<FileEditor | null>(null);
  const [createForm, setCreateForm] = useState<{ parentPath: string; isDir: boolean; name: string } | null>(null);
  const [editingMdCells, setEditingMdCells] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const nbMetaRef = useRef<any>(DEFAULT_NB_META);
  const nbFormatRef = useRef<{ nbformat: number; nbformat_minor: number }>({ nbformat: 4, nbformat_minor: 5 });
  const originalNbCellsRef = useRef<any[]>([]);
  const execCounterRef = useRef<number>(0);
  const initialLoadDoneRef = useRef(false);

  const refreshFiles = useCallback(() => {
    axios.get(`${API}/notebook/files`).then(r => setFiles(r.data.files)).catch(() => {});
  }, []);

  const loadNotebook = useCallback(async (node: IFileNode) => {
    try {
      const res = await axios.get(`${API}/notebook/files/content`, { params: { path: node.path } });
      let newCells: Cell[] = [];
      let maxExec = 0;
      if (node.ext === '.ipynb') {
        try {
          const nb = JSON.parse(res.data.content);
          const rawCells: any[] = Array.isArray(nb.cells) ? nb.cells : [];
          originalNbCellsRef.current = rawCells;
          nbMetaRef.current = nb.metadata ?? DEFAULT_NB_META;
          nbFormatRef.current = {
            nbformat: typeof nb.nbformat === 'number' ? nb.nbformat : 4,
            nbformat_minor: typeof nb.nbformat_minor === 'number' ? nb.nbformat_minor : 5,
          };
          rawCells.forEach((c, idx) => {
            if (c?.cell_type === 'code') {
              const code = asText(c.source);
              const exec = typeof c.execution_count === 'number' ? c.execution_count : null;
              if (exec && exec > maxExec) maxExec = exec;
              newCells.push(makeCell(code, {
                cellType: 'code',
                executionCount: exec,
                output: nbOutputsToCellOutput(c.outputs),
                originalIndex: idx,
              }));
            } else if (c?.cell_type === 'markdown') {
              newCells.push(makeCell(asText(c.source), {
                cellType: 'markdown',
                originalIndex: idx,
              }));
            }
          });
        } catch {
          originalNbCellsRef.current = [];
          nbMetaRef.current = DEFAULT_NB_META;
          newCells = [makeCell(res.data.content)];
        }
      } else {
        originalNbCellsRef.current = [];
        nbMetaRef.current = DEFAULT_NB_META;
        newCells = [makeCell(res.data.content)];
      }
      if (newCells.length === 0) newCells = [makeCell()];
      execCounterRef.current = maxExec;
      setCells(newCells);
      setCurrentFile(node.name);
      setCurrentPath(node.path);
      setDirty(false);
      await axios.delete(`${API}/notebook/session/${sessionId}`).catch(() => {});
    } catch (err) {
      console.error('Failed to load notebook:', err);
    }
  }, [sessionId]);

  useEffect(() => {
    axios.get(`${API}/notebook/kernel-info`).then(r => setKernelInfo(r.data)).catch(() => {});
    axios.get(`${API}/notebook/files`).then(r => {
      setFiles(r.data.files);
      if (initialLoadDoneRef.current) return;
      initialLoadDoneRef.current = true;
      const find = (nodes: IFileNode[]): IFileNode | null => {
        for (const n of nodes) {
          if (n.type === 'file' && n.path === 'notebooks/exploration.ipynb') return n;
          if (n.children) {
            const f = find(n.children);
            if (f) return f;
          }
        }
        return null;
      };
      const node = find(r.data.files);
      if (node) loadNotebook(node);
    }).catch(() => {});
  }, [loadNotebook]);

  const runCell = useCallback(async (id: string) => {
    const cell = cells.find(c => c.id === id);
    if (!cell || !cell.code.trim()) return;

    const nextExec = ++execCounterRef.current;
    setCells(prev => prev.map(c => c.id === id ? { ...c, running: true, output: null, executionCount: nextExec } : c));
    try {
      const res = await axios.post(`${API}/notebook/execute`, { session_id: sessionId, code: cell.code });
      setCells(prev => prev.map(c => c.id === id ? { ...c, running: false, output: res.data } : c));
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Request failed';
      setCells(prev => prev.map(c => c.id === id
        ? { ...c, running: false, output: { stdout: '', stderr: '', error: msg, images: [] } }
        : c));
    }
    if (currentPath) setDirty(true);
  }, [cells, sessionId, currentPath]);

  const runAll = useCallback(async () => {
    for (const cell of cells) {
      if (cell.code.trim()) await runCell(cell.id);
    }
  }, [cells, runCell]);

  const resetSession = async () => {
    setResetting(true);
    try {
      await axios.delete(`${API}/notebook/session/${sessionId}`);
      execCounterRef.current = 0;
      setCells(prev => prev.map(c => ({ ...c, output: null, executionCount: null })));
    } catch (err) { console.error(err); }
    finally { setResetting(false); }
  };

  const addCell = (afterId?: string) => {
    const cell = makeCell();
    setCells(prev => {
      if (!afterId) return [...prev, cell];
      const idx = prev.findIndex(c => c.id === afterId);
      const next = [...prev];
      next.splice(idx + 1, 0, cell);
      return next;
    });
    if (currentPath) setDirty(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  const deleteCell = (id: string) => {
    setCells(prev => prev.filter(c => c.id !== id));
    if (currentPath) setDirty(true);
  };

  const updateCellCode = (id: string, code: string) => {
    setCells(prev => prev.map(c => c.id === id ? { ...c, code } : c));
    if (currentPath) setDirty(true);
  };

  const saveNotebook = async () => {
    if (!currentPath) return;
    setSaving(true);
    try {
      let serialized: string;
      const isIpynb = currentPath.endsWith('.ipynb');
      if (isIpynb) {
        // Walk the original cell list. For each non-code cell, keep it in place.
        // For each original code cell, replace with the updated UI version (or drop
        // if deleted). New code cells (originalIndex === null) append at the end.
        // Track the new index for each UI cell so subsequent saves stay consistent.
        const original = originalNbCellsRef.current;
        const updatedByIndex = new Map<number, { nb: any; cellId: string }>();
        const appended: { nb: any; cellId: string }[] = [];
        for (const c of cells) {
          const nb = cellToNbCell(c);
          if (c.originalIndex != null) updatedByIndex.set(c.originalIndex, { nb, cellId: c.id });
          else appended.push({ nb, cellId: c.id });
        }
        const finalCells: any[] = [];
        const newOriginal: any[] = [];
        const newIndexByCellId = new Map<string, number>();
        original.forEach((orig, idx) => {
          if (orig?.cell_type === 'code' || orig?.cell_type === 'markdown') {
            const entry = updatedByIndex.get(idx);
            if (entry) {
              newIndexByCellId.set(entry.cellId, finalCells.length);
              finalCells.push(entry.nb);
              newOriginal.push(entry.nb);
            }
          } else {
            finalCells.push(orig);
            newOriginal.push(orig);
          }
        });
        for (const entry of appended) {
          newIndexByCellId.set(entry.cellId, finalCells.length);
          finalCells.push(entry.nb);
          newOriginal.push(entry.nb);
        }
        originalNbCellsRef.current = newOriginal;
        setCells(prev => prev.map(c => {
          const newIdx = newIndexByCellId.get(c.id);
          return newIdx != null ? { ...c, originalIndex: newIdx } : c;
        }));
        const nb = {
          cells: finalCells,
          metadata: nbMetaRef.current,
          nbformat: nbFormatRef.current.nbformat,
          nbformat_minor: nbFormatRef.current.nbformat_minor,
        };
        serialized = JSON.stringify(nb, null, 1);
      } else {
        serialized = cells.map(c => c.code).join('\n\n');
      }
      await axios.put(`${API}/notebook/files/content`, { path: currentPath, content: serialized });
      setDirty(false);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Save failed — see console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileClick = async (node: IFileNode) => {
    if (node.ext === '.csv') {
      const cell = makeCell(`df2 = pd.read_csv(DATA_DIR / '${node.name}')\ndf2.head()`);
      setCells(prev => [...prev, cell]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      return;
    }
    if (node.ext === '.ipynb' || node.ext === '.py') {
      await loadNotebook(node);
      return;
    }
    try {
      const res = await axios.get(`${API}/notebook/files/content`, { params: { path: node.path } });
      setFileEditor({ path: node.path, name: node.name, content: res.data.content, original: res.data.content, saving: false });
    } catch (err) {
      console.error('Failed to load file:', err);
    }
  };

  const handleDeleteClick = async (node: IFileNode) => {
    const label = node.type === 'dir' ? `folder "${node.name}" and all its contents` : `file "${node.name}"`;
    if (!window.confirm(`Delete ${label}?`)) return;
    try {
      await axios.delete(`${API}/notebook/files`, { params: { path: node.path } });
      refreshFiles();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCreateInDir = (dirPath: string, isDir: boolean) => {
    setCreateForm({ parentPath: dirPath, isDir, name: '' });
  };

  const submitCreate = async () => {
    if (!createForm || !createForm.name.trim()) return;
    const fullPath = `${createForm.parentPath}/${createForm.name.trim()}`;
    const defaultContent = createForm.name.endsWith('.py') ? '# new file\n' : createForm.name.endsWith('.ipynb') ? '{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}' : '';
    try {
      await axios.post(`${API}/notebook/files`, { path: fullPath, is_dir: createForm.isDir, content: defaultContent });
      setCreateForm(null);
      refreshFiles();
      if (!createForm.isDir) {
        const res = await axios.get(`${API}/notebook/files/content`, { params: { path: fullPath } });
        setFileEditor({ path: fullPath, name: createForm.name.trim(), content: res.data.content, original: res.data.content, saving: false });
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? 'Create failed');
    }
  };

  const handleFileSave = async () => {
    if (!fileEditor) return;
    setFileEditor(f => f ? { ...f, saving: true } : null);
    try {
      await axios.put(`${API}/notebook/files/content`, { path: fileEditor.path, content: fileEditor.content });
      setFileEditor(f => f ? { ...f, original: f.content, saving: false } : null);
      refreshFiles();
    } catch (err) {
      console.error('Save failed:', err);
      setFileEditor(f => f ? { ...f, saving: false } : null);
    }
  };

  const createEnvCell = () => {
    const cell = makeCell(`create_env(name='${envName}', python='${envPython}')`);
    setCells(prev => [...prev, cell]);
    setShowEnvForm(false);
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      runCell(cell.id);
    }, 120);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, flexWrap: 'wrap' }}>
        <Terminal size={16} color="var(--secondary)" />
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>HIVE Notebook</span>
        {currentFile && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid var(--border-glass)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {currentFile}
            {dirty && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-warning)' }} title="Unsaved changes" />
            )}
          </span>
        )}

        {kernelInfo && (
          <span style={{ fontSize: '0.72rem', color: 'var(--accent-success)', fontFamily: 'monospace', padding: '2px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.2)' }}>
            Python {kernelInfo.python_version}
          </span>
        )}

        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
          {sessionId}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* New Env */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowEnvForm(f => !f)} className="glass-button secondary" style={{ padding: '5px 12px', fontSize: '0.78rem' }}>
              + New Env
            </button>
            {showEnvForm && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '1rem', width: '220px', zIndex: 50, boxShadow: 'var(--shadow-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Create Environment</span>
                  <button onClick={() => setShowEnvForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}><X size={14} /></button>
                </div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Name</label>
                <input value={envName} onChange={e => setEnvName(e.target.value)} className="glass-input" style={{ marginTop: '4px', marginBottom: '0.5rem', padding: '6px 10px', fontSize: '0.82rem' }} />
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Python version</label>
                <input value={envPython} onChange={e => setEnvPython(e.target.value)} className="glass-input" style={{ marginTop: '4px', marginBottom: '0.75rem', padding: '6px 10px', fontSize: '0.82rem' }} />
                <button onClick={createEnvCell} className="glass-button" style={{ width: '100%', padding: '7px', fontSize: '0.82rem' }}>Create</button>
              </div>
            )}
          </div>

          {currentPath && (
            <button
              onClick={saveNotebook}
              disabled={saving || !dirty}
              className="glass-button"
              style={{ padding: '5px 14px', fontSize: '0.82rem', opacity: dirty ? 1 : 0.55 }}
              title={dirty ? 'Save to file' : 'No changes to save'}
            >
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button onClick={runAll} className="glass-button" style={{ padding: '5px 14px', fontSize: '0.82rem' }}>
            <Play size={13} fill="currentColor" /> Run All
          </button>
          <button onClick={resetSession} disabled={resetting} className="glass-button secondary" style={{ padding: '5px 12px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} className={resetting ? 'animate-spin' : ''} /> Reset
          </button>
          <button onClick={() => setShowFiles(f => !f)} className={`glass-button ${showFiles ? '' : 'secondary'}`} style={{ padding: '5px 10px', fontSize: '0.82rem' }} title="Toggle file browser">
            <FolderOpen size={14} />
          </button>
          <button onClick={() => addCell()} className="glass-button secondary" style={{ padding: '5px 10px', fontSize: '0.82rem' }}>
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Body: file browser + cells */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File browser */}
        {showFiles && (
          <div style={{ width: '210px', minWidth: '210px', borderRight: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)', flexShrink: 0 }}>
            {/* Browser header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
              <Folder size={12} color="var(--secondary)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>notebooks/</span>
              <button
                title="New file"
                onClick={() => setCreateForm({ parentPath: 'notebooks', isDir: false, name: '' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 3px', display: 'flex', borderRadius: '3px' }}
              >
                <FilePlus size={13} />
              </button>
              <button
                title="New folder"
                onClick={() => setCreateForm({ parentPath: 'notebooks', isDir: true, name: '' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 3px', display: 'flex', borderRadius: '3px' }}
              >
                <FolderPlus size={13} />
              </button>
            </div>

            {/* Create form (inline) */}
            {createForm && (
              <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.03)', flexShrink: 0 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  New {createForm.isDir ? 'folder' : 'file'} in {createForm.parentPath}/
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    autoFocus
                    value={createForm.name}
                    onChange={e => setCreateForm(f => f ? { ...f, name: e.target.value } : null)}
                    onKeyDown={e => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreateForm(null); }}
                    placeholder={createForm.isDir ? 'folder_name' : 'file.py'}
                    className="glass-input"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '0.78rem' }}
                  />
                  <button onClick={submitCreate} className="glass-button" style={{ padding: '4px 8px', fontSize: '0.78rem' }}>+</button>
                  <button onClick={() => setCreateForm(null)} className="glass-button secondary" style={{ padding: '4px 6px', fontSize: '0.78rem' }}><X size={12} /></button>
                </div>
              </div>
            )}

            {/* Tree */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
              {files.length === 0
                ? <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '4px' }}>Loading…</span>
                : files.map(node => (
                  <FileTreeNode
                    key={node.path}
                    node={node}
                    onFileClick={handleFileClick}
                    onDeleteClick={handleDeleteClick}
                    onCreateInDir={handleCreateInDir}
                  />
                ))
              }
            </div>
          </div>
        )}

        {/* Cells */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0.875rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {cells.map((cell) => (
            <div key={cell.id} className="notebook-cell">
              {/* Cell header */}
              <div className="notebook-cell-header">
                {cell.cellType === 'code' ? (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: '32px' }}>
                    [{cell.executionCount ?? ' '}]
                  </span>
                ) : (
                  <span style={{ fontSize: '0.68rem', color: 'var(--secondary)', fontFamily: 'monospace', padding: '1px 6px', background: 'rgba(240,146,30,0.12)', borderRadius: '3px' }}>
                    MD
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {cell.cellType === 'code' && (
                  <button
                    onClick={() => runCell(cell.id)}
                    disabled={cell.running}
                    title="Run (Ctrl+Enter)"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: cell.running ? 'var(--text-muted)' : 'var(--accent-success)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                  >
                    {cell.running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                  </button>
                )}
                {cell.cellType === 'markdown' && (
                  <button
                    onClick={() => setEditingMdCells(prev => {
                      const next = new Set(prev);
                      if (next.has(cell.id)) next.delete(cell.id); else next.add(cell.id);
                      return next;
                    })}
                    title={editingMdCells.has(cell.id) ? 'View rendered' : 'Edit source'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                <button onClick={() => addCell(cell.id)} title="Insert below" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                  <Plus size={13} />
                </button>
                <button onClick={() => deleteCell(cell.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Content */}
              {cell.cellType === 'markdown' ? (
                editingMdCells.has(cell.id) ? (
                  <CellCode
                    code={cell.code}
                    onChange={v => updateCellCode(cell.id, v)}
                    onRun={() => setEditingMdCells(prev => { const next = new Set(prev); next.delete(cell.id); return next; })}
                  />
                ) : (
                  <div
                    onDoubleClick={() => setEditingMdCells(prev => new Set(prev).add(cell.id))}
                    style={{
                      padding: '0.6rem 0.85rem',
                      color: '#e2e8f0',
                      fontSize: '0.88rem',
                      lineHeight: 1.6,
                      cursor: 'text',
                      minHeight: '2em',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.code) }}
                  />
                )
              ) : (
                <CellCode
                  code={cell.code}
                  onChange={v => updateCellCode(cell.id, v)}
                  onRun={() => runCell(cell.id)}
                />
              )}

              {/* Output (code cells only) */}
              {cell.cellType === 'code' && cell.output && (
                <div className="notebook-cell-output">
                  {cell.output.error && (
                    <pre style={{ color: '#fca5a5', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: 0, padding: '0.4rem 0.5rem', background: 'rgba(239,68,68,0.08)', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.2)', maxHeight: '240px', overflowY: 'auto' }}>
                      {cell.output.error}
                    </pre>
                  )}
                  {cell.output.stdout && <pre className="notebook-output-text">{cell.output.stdout}</pre>}
                  {cell.output.stderr && <pre style={{ color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: 0 }}>{cell.output.stderr}</pre>}
                  {cell.output.images.map((img, i) => (
                    <img key={i} src={`data:image/png;base64,${img}`} alt={`output ${i}`} style={{ maxWidth: '100%', marginTop: '0.5rem', borderRadius: '4px' }} />
                  ))}
                  {!cell.output.error && !cell.output.stdout && !cell.output.stderr && cell.output.images.length === 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No output.</span>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
          <button onClick={() => addCell()} className="glass-button secondary" style={{ alignSelf: 'center', padding: '6px 20px', fontSize: '0.82rem', opacity: 0.7 }}>
            <Plus size={14} /> Add Cell
          </button>
        </div>
      </div>

      {/* File editor modal */}
      {fileEditor && (
        <FileEditorModal
          editor={fileEditor}
          onChange={content => setFileEditor(f => f ? { ...f, content } : null)}
          onSave={handleFileSave}
          onClose={() => setFileEditor(null)}
        />
      )}
    </div>
  );
};

export default NotebookWidget;
