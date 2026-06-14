# Bundled Runtime

Place Windows bundled runtime files under `windows-x64/`.

Required layout:

- `windows-x64/manifest.json`
- `windows-x64/node/node.exe`
- `windows-x64/git/cmd/git.exe`

These files are copied into `src-tauri/resources/runtime/` during build and then deployed at first use into `%LOCALAPPDATA%\\星枢OpenClaw\\runtime\\`.
