import ast
import io
import base64
import shutil
import traceback
import subprocess
from typing import Optional
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.data_pipeline import DATA_PATH as _DATA_PATH, _NOTEBOOKS_DATA, _resolve_data_path

router = APIRouter()

_kernels: dict[str, dict] = {}
_PROJECT_ROOT  = Path(_DATA_PATH).parent.parent.parent  # hive_project/
_NOTEBOOKS_DIR = _PROJECT_ROOT / "notebooks"

_BOOTSTRAP = """\
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from pathlib import Path
import sys, os, warnings, subprocess
warnings.filterwarnings('ignore')

DATA_PATH    = Path(r'{data_path}')
DATA_DIR     = DATA_PATH.parent
PROJECT_ROOT = Path(r'{project_root}')

def load_data():
    df = pd.read_csv(DATA_PATH)
    df['date'] = pd.to_datetime(df['date'])
    return df

def create_env(name='venv', python='3.12'):
    '''Create a uv virtual environment with the given Python version.'''
    result = subprocess.run(
        ['uv', 'venv', '--python', python, name],
        cwd=str(PROJECT_ROOT), capture_output=True, text=True
    )
    out = (result.stdout + result.stderr).strip()
    print(out if out else f"Environment '{{name}}' (Python {{python}}) ready.")
"""


def _split_chunks(code: str) -> list[tuple[str, str]]:
    """Split a cell into ('python', ...) and ('shell', ...) chunks line by line."""
    chunks: list[tuple[str, str]] = []
    python_lines: list[str] = []

    for line in code.split('\n'):
        if line.strip().startswith('!'):
            if python_lines:
                chunks.append(('python', '\n'.join(python_lines)))
                python_lines = []
            chunks.append(('shell', line.strip()[1:].strip()))
        else:
            python_lines.append(line)

    if python_lines:
        chunks.append(('python', '\n'.join(python_lines)))

    return chunks


def _exec_python(code: str, ns: dict, is_last: bool) -> None:
    """Execute Python code. If this is the last chunk and ends with an expression, print its repr."""
    tree = ast.parse(code)
    if not tree.body:
        return
    if is_last and isinstance(tree.body[-1], ast.Expr):
        preamble = ast.Module(body=tree.body[:-1], type_ignores=[])
        if preamble.body:
            exec(compile(preamble, '<cell>', 'exec'), ns)
        expr = ast.Expression(body=tree.body[-1].value)
        result = eval(compile(expr, '<cell>', 'eval'), ns)
        if result is not None:
            print(repr(result))
    else:
        exec(compile(tree, '<cell>', 'exec'), ns)


def _exec_shell(cmd: str) -> None:
    """Run a shell command and stream its output to stdout."""
    result = subprocess.run(
        cmd, shell=True, cwd=str(_PROJECT_ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, timeout=60,
    )
    if result.stdout:
        print(result.stdout, end='')
    if result.returncode != 0:
        print(f"[exit {result.returncode}]")


def _get_kernel(session_id: str) -> dict:
    if session_id not in _kernels:
        ns: dict = {}
        active_data = _resolve_data_path()
        bootstrap = _BOOTSTRAP.format(
            data_path=str(active_data),
            project_root=str(_PROJECT_ROOT),
        )
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            exec(compile(bootstrap, '<bootstrap>', 'exec'), ns)
        _kernels[session_id] = ns
    return _kernels[session_id]


class ExecuteRequest(BaseModel):
    session_id: str
    code: str


@router.post("/execute")
def execute_cell(req: ExecuteRequest):
    import matplotlib.pyplot as plt

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    error: Optional[str] = None
    images: list[str] = []

    try:
        ns = _get_kernel(req.session_id)
        plt.close("all")

        chunks = [(t, c) for t, c in _split_chunks(req.code) if c.strip()]
        last_python_idx = max(
            (i for i, (t, _) in enumerate(chunks) if t == 'python'),
            default=-1,
        )

        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            for i, (chunk_type, content) in enumerate(chunks):
                if chunk_type == 'shell':
                    _exec_shell(content)
                else:
                    _exec_python(content, ns, is_last=(i == last_python_idx))

        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", dpi=100, bbox_inches="tight", facecolor="#0f172a")
            buf.seek(0)
            images.append(base64.b64encode(buf.read()).decode())
        plt.close("all")

    except Exception:
        error = traceback.format_exc()

    return {
        "stdout": stdout_buf.getvalue(),
        "stderr": stderr_buf.getvalue(),
        "error": error,
        "images": images,
    }


@router.delete("/session/{session_id}")
def clear_session(session_id: str):
    _kernels.pop(session_id, None)
    return {"message": f"Session {session_id} cleared."}


@router.get("/kernel-info")
def kernel_info():
    import sys, platform
    return {
        "python_version": sys.version.split()[0],
        "python_executable": sys.executable,
        "platform": platform.system(),
    }


def _safe_path(rel_path: str) -> Path:
    """Resolve a relative path and assert it is within _NOTEBOOKS_DIR."""
    resolved = (_PROJECT_ROOT / rel_path).resolve()
    if not str(resolved).startswith(str(_NOTEBOOKS_DIR.resolve())):
        raise ValueError("Path outside notebooks directory")
    return resolved


@router.get("/files")
def list_files():
    """Return a directory tree rooted at notebooks/."""
    _NOTEBOOKS_DIR.mkdir(exist_ok=True)

    def _build(path: Path) -> list:
        items = []
        try:
            entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except PermissionError:
            return items
        for entry in entries:
            if entry.name.startswith('.') or entry.name == '__pycache__':
                continue
            rel = str(entry.relative_to(_PROJECT_ROOT))
            if entry.is_dir():
                items.append({"name": entry.name, "path": rel, "type": "dir", "children": _build(entry)})
            else:
                items.append({"name": entry.name, "path": rel, "type": "file", "ext": entry.suffix.lower()})
        return items

    return {"root": "notebooks", "files": _build(_NOTEBOOKS_DIR)}


@router.get("/files/content")
def get_file_content(path: str = Query(...)):
    try:
        p = _safe_path(path)
    except ValueError:
        raise HTTPException(400, "Invalid path")
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "File not found")
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"content": content, "name": p.name, "path": path}


class CreateNodeRequest(BaseModel):
    path: str
    is_dir: bool = False
    content: str = ""


@router.post("/files")
def create_node(req: CreateNodeRequest):
    try:
        p = _safe_path(req.path)
    except ValueError:
        raise HTTPException(400, "Invalid path")
    if p.exists():
        raise HTTPException(409, "Already exists")
    if req.is_dir:
        p.mkdir(parents=True)
    else:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
    rel = str(p.relative_to(_PROJECT_ROOT))
    return {"path": rel, "created": True}


@router.delete("/files")
def delete_node(path: str = Query(...)):
    try:
        p = _safe_path(path)
    except ValueError:
        raise HTTPException(400, "Invalid path")
    if not p.exists():
        raise HTTPException(404, "Not found")
    if p.is_dir():
        shutil.rmtree(p)
    else:
        p.unlink()
    return {"path": path, "deleted": True}


class SaveContentRequest(BaseModel):
    path: str
    content: str


@router.put("/files/content")
def save_file_content(req: SaveContentRequest):
    try:
        p = _safe_path(req.path)
    except ValueError:
        raise HTTPException(400, "Invalid path")
    if not p.exists() or not p.is_file():
        raise HTTPException(404, "File not found")
    p.write_text(req.content, encoding="utf-8")
    return {"path": req.path, "saved": True}
