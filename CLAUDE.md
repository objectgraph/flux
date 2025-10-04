# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flux is a Chrome extension (Manifest V3) for recording browser tabs with audio. It uses WebRTC's MediaRecorder API to capture tab video/audio streams and save them as WebM files.

## Architecture

The extension uses a three-component architecture required by Manifest V3's security model:

1. **Popup (`popup.html/js`)**: User interface for starting/stopping recordings and configuring audio options
2. **Background Service Worker (`background.js`)**: Orchestrates recording lifecycle, manages state, handles tab capture permissions
3. **Offscreen Document (`offscreen.html/js`)**: Isolated context with DOM access required for `getUserMedia()` and `MediaRecorder` APIs

### Message Flow

```
User clicks "Start" in popup
  ↓
popup.js sends 'startRecording' → background.js
  ↓
background.js gets streamId via chrome.tabCapture.getMediaStreamId()
  ↓
background.js sends 'offscreen:initRecording' → offscreen.js
  ↓
offscreen.js uses streamId to get media stream and starts MediaRecorder
  ↓
User clicks "Stop" in popup
  ↓
popup.js sends 'stopRecording' → background.js
  ↓
background.js sends 'offscreen:stopRecording' → offscreen.js
  ↓
offscreen.js stops MediaRecorder, creates Blob, generates blob URL
  ↓
offscreen.js returns blobUrl → background.js
  ↓
background.js triggers download via chrome.downloads API
```

### Critical Implementation Details

**Message Namespacing**: Messages sent to the offscreen document use the `offscreen:` prefix (`offscreen:initRecording`, `offscreen:stopRecording`, `offscreen:cancelRecording`). This prevents the background script's message listener from intercepting its own messages. The background script's listener filters by sender URL to only handle messages from `popup.html`.

**Blob URL Pattern**: Blob objects cannot be passed through `chrome.runtime.sendMessage()` (they're not serializable). The offscreen document creates a blob URL via `URL.createObjectURL(blob)` and passes the string URL back to the background script for downloading.

**Offscreen Document Lifecycle**: The offscreen document is created lazily when recording starts (`setupOffscreenDocument()`) and persists until the extension is reloaded. The background script checks for existing offscreen contexts before creating a new one.

## Development Workflow

### Loading the Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the project directory
5. After code changes, click the refresh icon on the Flux extension card

### Testing

1. Click the Flux icon in the browser toolbar
2. Configure audio options and click "Start Recording"
3. Monitor the background service worker console: `chrome://extensions/` → "Inspect views: service worker"
4. Monitor the offscreen document console: `chrome://extensions/` → "Inspect views: offscreen.html" (only appears while recording)
5. Check popup console: Right-click popup → "Inspect"

### Common Issues

**"No active recording" error when stopping**: The offscreen document's MediaRecorder is not running. Check the offscreen console for errors during initialization. Common causes:
- Messages being intercepted by wrong listener (check message namespacing)
- MediaRecorder failing to start (check codec support)
- Stream acquisition failing (check tab permissions)

**Download not triggering**: Verify that `response.blobUrl` exists in the stop recording flow. If blob URL is undefined, the offscreen document failed to create or return it.

**Audio not recording**: Chrome requires the tab to have audio context. If recording a silent tab, system audio may not be captured.

## Code Patterns

### Settings Storage

Settings are stored via `chrome.storage.sync` with defaults:
```javascript
const settings = await chrome.storage.sync.get({
  videoQuality: '1080p',
  frameRate: 30,
  defaultSystemAudio: true,
  defaultMicrophone: false
});
```

### Recording State

The background script maintains recording state in-memory (not persisted):
```javascript
let recordingState = {
  isRecording: false,
  startTime: null,
  streamId: null
};
```

This state is lost on extension reload/browser restart.

### Audio Mixing

When both system audio and microphone are enabled, the offscreen document uses Web Audio API to mix streams:
```javascript
const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();
// Connect both sources to destination
// Use destination.stream audio tracks in final MediaStream
```

## File Output

Recordings use VP9 codec (falls back to VP8) and are saved with timestamp-based filenames: `flux-recording-YYYY-MM-DDTHH-MM-SS.webm`

The `chrome.downloads.download()` API triggers the browser's native save dialog with `saveAs: true`.
