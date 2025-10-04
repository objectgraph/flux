Here's a comprehensive prompt for your Flux screen recording extension project:

---

## Project: Flux - Browser Screen Recording Extension

### Overview
Create a lightweight browser extension called "Flux" that enables users to record their screen, tab, or application window directly from their browser. The extension should work seamlessly across Chrome, Edge, and other Chromium-based browsers, providing a simple alternative to desktop recording applications like Loom.

### Core Requirements

**Recording Capabilities:**
- Record entire screen, specific browser tab, or application window
- Include system audio and/or microphone input with toggle options
- Support picture-in-picture webcam overlay (optional bubble showing user's face)
- Minimum 720p recording quality with 1080p as default
- Smooth 30fps recording with option for 60fps

**User Interface:**
- Clean, minimal extension popup with one-click recording start
- Floating control widget during recording (pause, stop, cancel)
- Visual recording indicator (red dot or similar)
- Quick settings for audio sources and video quality
- Countdown timer before recording starts (3-2-1)

**Features:**
- Automatic local saving in WebM/MP4 format
- Basic trim functionality (cut beginning/end)
- Quick share link generation
- Keyboard shortcuts (customizable)
- Recording time limit of 30 minutes for free tier
- Auto-pause when switching to sensitive tabs (banking, password managers)

**Technical Stack:**
- Chrome Extension Manifest V3
- WebRTC for screen capture
- MediaRecorder API for recording
- IndexedDB for temporary storage
- Simple backend (Node.js/Express) for sharing features

**User Flow:**
1. Click Flux icon in browser toolbar
2. Select recording mode (screen/tab/window)
3. Choose audio inputs
4. Click "Start Recording"
5. Perform actions while recording
6. Click "Stop" in floating widget
7. Preview recording with option to trim
8. Save locally or generate share link

### MVP Deliverables
- Basic recording functionality (tab recording only for MVP)
- Start/stop controls
- Local download as WebM
- Simple settings page
- Chrome Web Store ready package

### Future Enhancements
- Cloud storage integration
- Team workspaces
- Annotation tools during recording
- Scheduled recordings
- GIF export
- Transcript generation
- Analytics for shared videos

### Success Metrics
- < 3 clicks to start recording
- < 5 seconds from stop to download
- < 50MB extension size
- 60+ fps performance impact < 10%

---

Would you like me to expand on any particular aspect of this prompt or help you break it down into specific development phases?