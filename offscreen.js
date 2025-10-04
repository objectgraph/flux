let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
let recordingWarning = null;
let cameraStream = null;
let compositeCanvas = null;
let compositeContext = null;
let animationFrameId = null;

console.log('Offscreen document loaded');

// Camera overlay drag and resize functionality
const cameraOverlay = document.getElementById('cameraOverlay');
const cameraVideo = document.getElementById('cameraVideo');
const resizeHandle = document.querySelector('.resize-handle');

let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };
let resizeStart = { x: 0, y: 0, width: 0, height: 0 };

// Dragging
cameraOverlay.addEventListener('mousedown', (e) => {
  if (e.target === resizeHandle) return;
  isDragging = true;
  cameraOverlay.classList.add('dragging');
  dragOffset.x = e.clientX - cameraOverlay.offsetLeft;
  dragOffset.y = e.clientY - cameraOverlay.offsetTop;
  e.preventDefault();
});

// Resizing
resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizeStart.x = e.clientX;
  resizeStart.y = e.clientY;
  resizeStart.width = cameraOverlay.offsetWidth;
  resizeStart.height = cameraOverlay.offsetHeight;
  e.stopPropagation();
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    cameraOverlay.style.left = `${x}px`;
    cameraOverlay.style.top = `${y}px`;
    cameraOverlay.style.right = 'auto';
    cameraOverlay.style.bottom = 'auto';
  } else if (isResizing) {
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    const newWidth = Math.max(100, resizeStart.width + deltaX);
    const newHeight = Math.max(75, resizeStart.height + deltaY);
    cameraOverlay.style.width = `${newWidth}px`;
    cameraOverlay.style.height = `${newHeight}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    cameraOverlay.classList.remove('dragging');
    isDragging = false;
  }
  if (isResizing) {
    isResizing = false;
  }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action, 'from:', sender.url);

  switch (request.action) {
    case 'offscreen:startPickerRecording':
      startPickerRecording(request.audioOptions, request.videoConstraints)
        .then(() => {
          console.log('Picker recording started successfully');
          const response = { success: true };
          if (recordingWarning) {
            response.warning = recordingWarning;
          }
          sendResponse(response);
        })
        .catch(error => {
          console.error('Picker recording failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'offscreen:initRecording':
      initRecording(request.streamId, request.audioOptions, request.videoConstraints, request.isDesktopCapture)
        .then(() => {
          console.log('Recording initialized successfully');
          const response = { success: true };
          if (recordingWarning) {
            response.warning = recordingWarning;
          }
          sendResponse(response);
        })
        .catch(error => {
          console.error('Recording init failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'offscreen:stopRecording':
      stopRecording()
        .then(blobUrl => {
          console.log('Recording stopped, blob URL:', blobUrl);
          sendResponse({ success: true, blobUrl: blobUrl });
        })
        .catch(error => {
          console.error('Stop recording failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'offscreen:cancelRecording':
      cancelRecording()
        .then(() => {
          console.log('Recording cancelled');
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Cancel recording failed:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
  }
});

// Start recording with getDisplayMedia picker (no streamId needed!)
async function startPickerRecording(audioOptions, videoConstraints) {
  try {
    console.log('Starting picker recording with options:', audioOptions, videoConstraints);

    // Clean up any existing recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    recordedChunks = [];
    recordingWarning = null;

    // Use getDisplayMedia to show picker and get stream directly
    // This works in offscreen documents!
    const displayConstraints = {
      video: {
        width: { ideal: videoConstraints.width },
        height: { ideal: videoConstraints.height },
        frameRate: { ideal: videoConstraints.frameRate }
      },
      audio: audioOptions.systemAudio
    };

    console.log('Calling getDisplayMedia with constraints:', displayConstraints);
    stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
    console.log('Got display media stream with', stream.getTracks().length, 'tracks');

    // Listen for when user stops sharing (clicks "Stop sharing" button)
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('User stopped sharing - auto-stopping recording');
      stopRecording()
        .then(blobUrl => {
          // Notify background to download
          chrome.runtime.sendMessage({
            action: 'autoStopRecording',
            blobUrl: blobUrl
          });
        })
        .catch(error => {
          console.error('Failed to auto-stop recording:', error);
        });
    });

    // Check if we got audio
    if (audioOptions.systemAudio && stream.getAudioTracks().length === 0) {
      recordingWarning = 'Recording without system audio - not available for this source';
    }

    // If camera is requested, get camera stream and show overlay
    if (audioOptions.camera) {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        cameraVideo.srcObject = cameraStream;
        cameraOverlay.style.display = 'block';
        console.log('Camera overlay enabled');
      } catch (cameraError) {
        console.error('Failed to get camera:', cameraError);
        let warningMsg = 'Recording without camera: ';
        if (cameraError.name === 'NotAllowedError') {
          warningMsg += 'Permission denied';
        } else if (cameraError.name === 'NotFoundError') {
          warningMsg += 'No camera found';
        } else {
          warningMsg += cameraError.message || 'Unknown error';
        }

        if (!recordingWarning) {
          recordingWarning = warningMsg;
        } else {
          recordingWarning += ' | ' + warningMsg;
        }
        cameraStream = null;
      }
    }

    // If microphone is requested, mix it with system audio
    if (audioOptions.microphone) {
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micError) {
        console.error('Failed to get microphone:', micError);
        let warningMsg = 'Recording without microphone: ';
        if (micError.name === 'NotAllowedError') {
          warningMsg += 'Permission denied';
        } else if (micError.name === 'NotFoundError') {
          warningMsg += 'No microphone found';
        } else {
          warningMsg += micError.message || 'Unknown error';
        }

        if (!recordingWarning) {
          recordingWarning = warningMsg;
        } else {
          recordingWarning += ' | ' + warningMsg;
        }
        micStream = null;
      }

      // Mix audio if we have microphone
      if (micStream) {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        // Add system audio if available
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const systemAudioSource = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
          systemAudioSource.connect(destination);
        }

        // Add microphone
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);

        // Create new stream with video + mixed audio
        const videoTrack = stream.getVideoTracks()[0];
        stream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
      }
    }

    // If camera is enabled, composite the streams using canvas
    let recordingStream = stream;
    if (cameraStream) {
      recordingStream = await compositeStreams(stream, cameraStream);
    }

    // Create and start MediaRecorder
    const options = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000
    };

    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm;codecs=vp8';
    }

    mediaRecorder = new MediaRecorder(recordingStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
    };

    mediaRecorder.onstart = () => {
      console.log('MediaRecorder started');
    };

    mediaRecorder.start(1000);
    console.log('MediaRecorder started, state:', mediaRecorder.state);

  } catch (error) {
    console.error('Failed to start picker recording:', error);
    // Clean up
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (mediaRecorder) {
      mediaRecorder = null;
    }
    recordedChunks = [];

    // User-friendly error messages
    if (error.name === 'NotAllowedError') {
      throw new Error('Screen recording permission denied');
    } else if (error.name === 'NotFoundError') {
      throw new Error('No screen source available');
    } else {
      throw new Error(error.message || 'Failed to start recording');
    }
  }
}

// Initialize recording
async function initRecording(streamId, audioOptions, videoConstraints, isDesktopCapture) {
  try {
    console.log('Init recording - streamId:', streamId, 'timestamp:', Date.now());

    // CRITICAL: Use streamId IMMEDIATELY before it expires
    // Clean up AFTER we get the new stream
    let newStream = null;
    let audioFailedWarning = null;

    if (isDesktopCapture) {
      // For desktop capture, try getUserMedia immediately with desktop source
      try {
        const constraints = {
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: streamId,
              ...videoConstraints
            }
          },
          audio: audioOptions.systemAudio ? {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: streamId
            }
          } : false
        };

        console.log('Getting desktop stream immediately:', Date.now());
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Got desktop stream successfully:', Date.now());

      } catch (desktopError) {
        console.error('Desktop capture failed:', desktopError.name, desktopError.message);

        // Try tab capture instead
        try {
          const constraints = {
            video: {
              mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
                ...videoConstraints
              }
            },
            audio: audioOptions.systemAudio ? {
              mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
              }
            } : false
          };

          console.log('Trying tab capture:', Date.now());
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('Got tab stream successfully:', Date.now());

        } catch (tabError) {
          console.error('Tab capture also failed:', tabError.name, tabError.message);

          // Last attempt: try without audio if it was requested
          if (audioOptions.systemAudio) {
            try {
              const constraints = {
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId,
                    ...videoConstraints
                  }
                },
                audio: false
              };

              newStream = await navigator.mediaDevices.getUserMedia(constraints);
              audioFailedWarning = 'Recording without system audio - audio capture failed';
            } catch (finalError) {
              throw new Error('Failed to capture screen - streamId may have expired');
            }
          } else {
            throw new Error('Failed to capture screen - streamId may have expired');
          }
        }
      }
    } else {
      // Current tab mode
      const constraints = {
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
            ...videoConstraints
          }
        },
        audio: audioOptions.systemAudio ? {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        } : false
      };

      console.log('Getting tab stream:', Date.now());
      newStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Got tab stream:', Date.now());
    }

    // NOW clean up old recording (after we got the new stream)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('Cleaning up existing recorder');
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    recordedChunks = [];
    recordingWarning = audioFailedWarning;

    stream = newStream;
    console.log('Got media stream with', stream.getTracks().length, 'tracks');

    // If microphone is requested, mix it with system audio
    if (audioOptions.microphone) {
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
      } catch (micError) {
        console.error('Failed to get microphone access:', micError);
        let warningMsg = 'Recording without microphone: ';
        if (micError.name === 'NotAllowedError') {
          warningMsg += 'Permission denied';
        } else if (micError.name === 'NotFoundError') {
          warningMsg += 'No microphone found';
        } else {
          warningMsg += micError.name || micError.message || 'Unknown error';
        }

        if (!recordingWarning) {
          recordingWarning = warningMsg;
        } else {
          recordingWarning += ' | ' + warningMsg;
        }
        micStream = null;
      }

      // Only mix audio if we have a microphone stream
      if (micStream) {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        // Add system audio if enabled
        if (audioOptions.systemAudio && stream.getAudioTracks().length > 0) {
          const systemAudioSource = audioContext.createMediaStreamSource(stream);
          systemAudioSource.connect(destination);
        }

        // Add microphone audio
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(destination);

        // Replace audio track with mixed audio
        const videoTrack = stream.getVideoTracks()[0];
        stream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
      }
    } else if (!audioOptions.systemAudio) {
      // Remove audio track if system audio is disabled
      stream.getAudioTracks().forEach(track => track.stop());
      const videoTrack = stream.getVideoTracks()[0];
      stream = new MediaStream([videoTrack]);
    }

    // Create MediaRecorder
    recordedChunks = [];

    const options = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000 // 8 Mbps for high quality
    };

    // Fallback to vp8 if vp9 is not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm;codecs=vp8';
    }

    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
    };

    mediaRecorder.onstart = () => {
      console.log('MediaRecorder started');
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every second
    console.log('MediaRecorder.start() called, state:', mediaRecorder.state);

  } catch (error) {
    console.error('Failed to initialize recording:', error);
    console.error('Error details:', error.name, error.message);
    // Clean up on error
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (mediaRecorder) {
      mediaRecorder = null;
    }
    recordedChunks = [];
    throw error;
  }
}

// Stop recording and return blob URL
async function stopRecording() {
  return new Promise((resolve, reject) => {
    console.log('stopRecording called, mediaRecorder state:', mediaRecorder?.state);
    console.log('Recorded chunks count:', recordedChunks.length);

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      reject(new Error('No active recording'));
      return;
    }

    mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped, creating blob from', recordedChunks.length, 'chunks');
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log('Blob size:', blob.size, 'bytes');

      // Create blob URL (can be passed through messages)
      const blobUrl = URL.createObjectURL(blob);
      console.log('Created blob URL:', blobUrl);

      // Stop all tracks
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Stop camera
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
      }

      // Stop animation
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      // Hide camera overlay
      cameraOverlay.style.display = 'none';

      // Clean up
      mediaRecorder = null;
      stream = null;

      resolve(blobUrl);
    };

    console.log('Calling mediaRecorder.stop()');
    mediaRecorder.stop();
  });
}

// Cancel recording without saving
async function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  cameraOverlay.style.display = 'none';
  recordedChunks = [];
  mediaRecorder = null;
  stream = null;
}

// Composite screen and camera streams onto a canvas
async function compositeStreams(screenStream, cameraStream) {
  // Create canvas for compositing
  const videoTrack = screenStream.getVideoTracks()[0];
  const settings = videoTrack.getSettings();

  compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = settings.width || 1920;
  compositeCanvas.height = settings.height || 1080;
  compositeContext = compositeCanvas.getContext('2d');

  // Create video elements for drawing
  const screenVideo = document.createElement('video');
  screenVideo.srcObject = screenStream;
  screenVideo.play();

  const cameraVideoElement = cameraVideo; // Use existing camera video element

  // Wait for videos to be ready
  await new Promise(resolve => {
    screenVideo.onloadedmetadata = resolve;
  });

  // Draw composite frame
  function drawFrame() {
    if (!compositeContext || !screenVideo || !cameraVideoElement) return;

    // Draw screen
    compositeContext.drawImage(screenVideo, 0, 0, compositeCanvas.width, compositeCanvas.height);

    // Draw camera overlay if visible
    if (cameraOverlay.style.display !== 'none' && cameraVideoElement.videoWidth > 0) {
      // Get camera overlay position and size
      const overlayRect = cameraOverlay.getBoundingClientRect();
      const scaleX = compositeCanvas.width / window.innerWidth;
      const scaleY = compositeCanvas.height / window.innerHeight;

      const camX = overlayRect.left * scaleX;
      const camY = overlayRect.top * scaleY;
      const camW = overlayRect.width * scaleX;
      const camH = overlayRect.height * scaleY;

      // Draw rounded rectangle clip path
      compositeContext.save();
      compositeContext.beginPath();
      const radius = 12 * Math.min(scaleX, scaleY);
      compositeContext.roundRect(camX, camY, camW, camH, radius);
      compositeContext.clip();

      // Draw camera
      compositeContext.drawImage(cameraVideoElement, camX, camY, camW, camH);

      // Draw border
      compositeContext.strokeStyle = '#ffffff';
      compositeContext.lineWidth = 3 * Math.min(scaleX, scaleY);
      compositeContext.stroke();
      compositeContext.restore();
    }

    animationFrameId = requestAnimationFrame(drawFrame);
  }

  drawFrame();

  // Get canvas stream
  const canvasStream = compositeCanvas.captureStream(30); // 30 fps

  // Add audio tracks from original stream
  screenStream.getAudioTracks().forEach(track => {
    canvasStream.addTrack(track);
  });

  return canvasStream;
}
