# Flux - Screen Recording Extension

A lightweight Chrome extension for recording browser tabs with system audio and microphone support.

## Features

- **Tab Recording**: Record any browser tab with high quality video
- **Audio Options**: Toggle system audio and microphone independently
- **3-2-1 Countdown**: Visual countdown before recording starts
- **Live Timer**: See recording duration in real-time
- **Quality Settings**: Choose between 720p/1080p resolution and 30/60 FPS
- **Local Download**: Recordings saved as WebM files directly to your computer
- **Clean UI**: Minimal, intuitive interface

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `/Flux` folder
6. The Flux icon will appear in your extensions toolbar

## Usage

### Recording a Tab

1. Click the Flux icon in your browser toolbar
2. Select your audio preferences:
   - **System Audio**: Capture tab audio
   - **Microphone**: Include your voice
3. Click "Start Recording"
4. Wait for the 3-2-1 countdown
5. Perform your actions (the timer shows elapsed time)
6. Click "Stop Recording" when done
7. Choose where to save your `.webm` file

### Settings

Click the "Settings" button in the popup to configure:

- **Resolution**: 720p (HD) or 1080p (Full HD)
- **Frame Rate**: 30 FPS or 60 FPS
- **Default Audio Settings**: Pre-select audio options

## Technical Details

- **Manifest**: Chrome Extension Manifest V3
- **Recording**: WebRTC MediaRecorder API
- **Audio Mixing**: Web Audio API for combining system + microphone audio
- **Storage**: Chrome Storage API for settings
- **Architecture**: Background service worker + offscreen document for media access

## Project Structure

```
Flux/
├── manifest.json           # Extension configuration
├── popup.html             # Main UI
├── popup.js               # UI logic
├── styles.css             # Styling
├── background.js          # Service worker (recording orchestration)
├── offscreen.html         # Offscreen document
├── offscreen.js           # MediaRecorder implementation
├── settings.html          # Settings page UI
├── settings.js            # Settings logic
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## File Formats

Recordings are saved as `.webm` files using VP9 codec (falls back to VP8 if unavailable). Files are named with timestamps: `flux-recording-YYYY-MM-DDTHH-MM-SS.webm`

## Permissions

- `activeTab`: Access current tab for recording
- `tabCapture`: Capture tab video and audio streams
- `storage`: Save user preferences
- `downloads`: Save recordings to disk
- `offscreen`: Create offscreen document for MediaRecorder

## Browser Compatibility

- Chrome/Chromium (v109+)
- Edge (Chromium-based)
- Other Chromium-based browsers

## Known Limitations

- Tab recording only (MVP - full screen/window recording coming soon)
- WebM format only (MP4 export planned for future versions)
- No cloud storage integration yet

## Future Enhancements

- Full screen and window capture modes
- Video trimming and editing tools
- Cloud storage integration
- Share link generation
- Picture-in-picture webcam overlay
- GIF export
- Transcript generation

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.
