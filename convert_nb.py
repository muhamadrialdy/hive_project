import nbformat
from nbformat.v4 import new_notebook, new_code_cell, new_markdown_cell
import re

with open("notebooks/exploration.py", "r") as f:
    content = f.read()

cells = []
blocks = re.split(r'# %%', content)

for block in blocks:
    block = block.strip()
    if not block:
        continue
    
    if block.startswith('[markdown]'):
        # It's a markdown cell
        # Remove the [markdown] header and leading #
        lines = block.split('\n')[1:]
        md_content = '\n'.join([line.lstrip('# ') for line in lines]).strip()
        cells.append(new_markdown_cell(md_content))
    else:
        # It's a code cell
        cells.append(new_code_cell(block))

nb = new_notebook(cells=cells)

with open("notebooks/exploration.ipynb", "w") as f:
    nbformat.write(nb, f)

