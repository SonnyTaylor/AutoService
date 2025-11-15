# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Collect tiktoken data files (if any)
tiktoken_datas = collect_data_files('tiktoken', include_py_files=False)

# Collect all tiktoken_ext submodules
tiktoken_ext_modules = collect_submodules('tiktoken_ext')

# Collect litellm data files (tokenizer JSONs, etc.)
litellm_datas = collect_data_files('litellm', include_py_files=False)

# Collect certifi certificate bundle for SSL/TLS support
certifi_datas = collect_data_files('certifi', include_py_files=False)

# Resolve service_runner.py path relative to this spec file
# SPEC is available in PyInstaller 3.2+, fallback to __file__ for older versions
try:
    spec_file = SPEC
except NameError:
    spec_file = __file__
spec_dir = os.path.dirname(os.path.abspath(spec_file))
repo_root = os.path.dirname(spec_dir)
service_runner_path = os.path.join(repo_root, 'runner', 'service_runner.py')

a = Analysis(
    [service_runner_path],
    pathex=[],
    binaries=[],
    datas=tiktoken_datas + litellm_datas + certifi_datas,
    hiddenimports=[
        'tiktoken',
        'tiktoken.core',
        'tiktoken.load',
        'tiktoken.registry',
        'tiktoken_ext',
        'tiktoken_ext.openai_public',
        'litellm',
        'litellm.cost_calculator',
        'litellm.utils',
        'litellm.litellm_core_utils',
        'litellm.litellm_core_utils.llm_cost_calc',
        'litellm.litellm_core_utils.default_encoding',
        'litellm.litellm_core_utils.tokenizers',
        'certifi',
    ] + tiktoken_ext_modules,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='service_runner',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
