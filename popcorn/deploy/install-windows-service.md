# Run Popcorn as a Windows service

The simplest reliable way is NSSM (https://nssm.cc), a tiny wrapper that turns any program into a service.

1. Build the app once: `npm run setup` then `npm run build` in the project folder.
2. Download NSSM, unzip, and open an **administrator** PowerShell in the folder with `nssm.exe`.
3. Run `nssm install Popcorn` and fill in:
   - Path: `C:\Program Files\nodejs\node.exe`
   - Startup directory: `C:\path\to\popcorn\server`
   - Arguments: `src\index.js`
4. Click *Install service*, then `nssm start Popcorn`.

Popcorn will now start with Windows and restart itself if it crashes. Logs: `nssm set Popcorn AppStdout C:\path\to\popcorn\popcorn.log`.

For ffmpeg conversion, install ffmpeg (`winget install Gyan.FFmpeg`) and either restart so it is on the PATH, or set
`FFMPEG_PATH=C:\path\to\ffmpeg.exe` in `.env`.
