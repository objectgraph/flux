let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
let microphoneStream = null; // Store microphone stream separately for cleanup
let recordingWarning = null;

console.log('Offscreen document loaded');

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action, 'from:', sender.url);

  switch (request.action) {
    case 'offscreen:startPickerRecording':
      startPickerRecording(request.audioOptions, request.videoConstraints, request.qualitySettings)
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
      initRecording(request.streamId, request.audioOptions, request.videoConstraints, request.isDesktopCapture, request.qualitySettings)
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

// Helper function to get recorder options based on quality settings
function getRecorderOptions(qualitySettings) {
  const format = qualitySettings?.videoFormat || 'webm-vp9';
  const videoBitrate = qualitySettings?.videoBitrate || 'high';
  const audioBitrate = (qualitySettings?.audioBitrate || 128) * 1000; // Convert to bps

  let videoBitsPerSecond = 8000000; // Default 8 Mbps

  // Calculate video bitrate based on preset
  if (videoBitrate === 'low') {
    videoBitsPerSecond = 1500000; // 1.5 Mbps
  } else if (videoBitrate === 'medium') {
    videoBitsPerSecond = 4000000; // 4 Mbps
  } else if (videoBitrate === 'high') {
    videoBitsPerSecond = 7000000; // 7 Mbps
  } else if (videoBitrate === 'custom' && qualitySettings?.customVideoBitrate) {
    videoBitsPerSecond = qualitySettings.customVideoBitrate * 1000000; // Convert Mbps to bps
  }

  const options = {
    videoBitsPerSecond,
    audioBitsPerSecond: audioBitrate
  };

  // Set MIME type based on format selection
  if (format === 'mp4') {
    // Use avc3 instead of avc1 to handle codec description changes during recording
    // avc3 allows resolution changes without errors, important for screen recording
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc3,mp4a.40.2')) {
      options.mimeType = 'video/mp4;codecs=avc3,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) {
      // Fallback to baseline profile if avc3 not supported
      options.mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      options.mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options.mimeType = 'video/mp4';
    } else {
      // Fallback to WebM if MP4 not supported
      console.warn('MP4 not supported, falling back to WebM VP9');
      options.mimeType = 'video/webm;codecs=vp9,opus';
    }
  } else if (format === 'webm-vp9') {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      options.mimeType = 'video/webm;codecs=vp9,opus';
    } else {
      options.mimeType = 'video/webm;codecs=vp9';
    }
  } else if (format === 'webm-vp8') {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
    } else {
      options.mimeType = 'video/webm;codecs=vp8';
    }
  }

  // Fallback chain if primary format not supported
  if (!options.mimeType || !MediaRecorder.isTypeSupported(options.mimeType)) {
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      options.mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      options.mimeType = 'video/webm;codecs=vp8';
    } else {
      options.mimeType = 'video/webm'; // Most basic fallback
    }
  }

  console.log('Using MediaRecorder options:', options);
  return options;
}

// Helper function to apply resolution limits
function applyResolutionLimit(constraints, resolutionLimit) {
  if (!resolutionLimit || resolutionLimit === 'original') {
    return constraints;
  }

  const limits = {
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 },
    '480p': { width: 854, height: 480 }
  };

  if (limits[resolutionLimit]) {
    constraints.video.width = { ...constraints.video.width, max: limits[resolutionLimit].width };
    constraints.video.height = { ...constraints.video.height, max: limits[resolutionLimit].height };
  }

  return constraints;
}

// Start recording with getDisplayMedia picker (no streamId needed!)
async function startPickerRecording(audioOptions, videoConstraints, qualitySettings) {
  try {
    console.log('Starting picker recording with options:', audioOptions, videoConstraints);

    // Clean up any existing recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = null;
    }
    recordedChunks = [];
    recordingWarning = null;

    // Use getDisplayMedia to show picker and get stream directly
    // This works in offscreen documents!
    let displayConstraints = {
      video: {
        width: { ideal: videoConstraints.width },
        height: { ideal: videoConstraints.height },
        frameRate: { ideal: videoConstraints.frameRate }
      },
      audio: audioOptions.systemAudio
    };

    // Apply resolution limit if specified
    displayConstraints = applyResolutionLimit(displayConstraints, qualitySettings?.resolutionLimit);

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

    // If microphone is requested, mix it with system audio
    if (audioOptions.microphone) {
      try {
        // Check if we have permission first (won't prompt, just checks)
        const micPermission = await navigator.permissions.query({ name: 'microphone' }).catch(() => null);

        if (micPermission && micPermission.state === 'denied') {
          throw new Error('Microphone permission denied. Please grant permission in Settings.');
        }

        console.log('Attempting to get microphone stream for picker recording...');
        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Successfully got microphone stream');
      } catch (micError) {
        console.error('Failed to get microphone:', micError);
        let warningMsg = 'Recording without microphone: ';

        if (micError.name === 'NotAllowedError' || micError.message?.includes('permission denied')) {
          warningMsg += 'Permission denied. Please grant permission in Settings.';
        } else if (micError.name === 'NotFoundError') {
          warningMsg += 'No microphone found';
        } else if (micError.message?.includes('Permission denied')) {
          warningMsg += 'Permission denied. Please grant permission in Settings.';
        } else {
          warningMsg += micError.message || 'Unknown error';
        }

        if (!recordingWarning) {
          recordingWarning = warningMsg;
        } else {
          recordingWarning += ' | ' + warningMsg;
        }
        microphoneStream = null;
      }

      // Mix audio if we have microphone
      if (microphoneStream) {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        // Add system audio if available
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const systemAudioSource = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
          systemAudioSource.connect(destination);
        }

        // Add microphone
        const micSource = audioContext.createMediaStreamSource(microphoneStream);
        micSource.connect(destination);

        // Create new stream with video + mixed audio
        const videoTrack = stream.getVideoTracks()[0];
        stream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
      }
    }

    // Create and start MediaRecorder with quality settings
    const options = getRecorderOptions(qualitySettings);
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

    mediaRecorder.start(1000);
    console.log('MediaRecorder started, state:', mediaRecorder.state);

  } catch (error) {
    console.error('Failed to start picker recording:', error);
    // Clean up
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = null;
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
async function initRecording(streamId, audioOptions, videoConstraints, isDesktopCapture, qualitySettings) {
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
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = null;
    }
    recordedChunks = [];
    recordingWarning = audioFailedWarning;

    stream = newStream;
    console.log('Got media stream with', stream.getTracks().length, 'tracks');

    // If microphone is requested, mix it with system audio
    if (audioOptions.microphone) {
      try {
        // Check if we have permission first (won't prompt, just checks)
        const micPermission = await navigator.permissions.query({ name: 'microphone' }).catch(() => null);

        if (micPermission && micPermission.state === 'denied') {
          throw new Error('Microphone permission denied. Please grant permission in Settings.');
        }

        // Try to get microphone stream
        console.log('Attempting to get microphone stream...');
        microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        console.log('Successfully got microphone stream');
      } catch (micError) {
        console.error('Failed to get microphone access:', micError);
        let warningMsg = 'Recording without microphone: ';

        if (micError.name === 'NotAllowedError' || micError.message?.includes('permission denied')) {
          warningMsg += 'Permission denied. Please grant permission in Settings.';
        } else if (micError.name === 'NotFoundError') {
          warningMsg += 'No microphone found';
        } else if (micError.message?.includes('Permission denied')) {
          warningMsg += 'Permission denied. Please grant permission in Settings.';
        } else {
          warningMsg += micError.name || micError.message || 'Unknown error';
        }

        if (!recordingWarning) {
          recordingWarning = warningMsg;
        } else {
          recordingWarning += ' | ' + warningMsg;
        }
        microphoneStream = null;
      }

      // Only mix audio if we have a microphone stream
      if (microphoneStream) {
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        // Add system audio if enabled
        if (audioOptions.systemAudio && stream.getAudioTracks().length > 0) {
          const systemAudioSource = audioContext.createMediaStreamSource(stream);
          systemAudioSource.connect(destination);
        }

        // Add microphone audio
        const micSource = audioContext.createMediaStreamSource(microphoneStream);
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

    // Create MediaRecorder with quality settings
    recordedChunks = [];
    const options = getRecorderOptions(qualitySettings);
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
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = null;
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
      // Determine blob type based on recorder mime type
      const mimeType = mediaRecorder?.mimeType || 'video/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      console.log('Blob size:', blob.size, 'bytes, type:', mimeType);

      // Create blob URL (can be passed through messages)
      const blobUrl = URL.createObjectURL(blob);
      console.log('Created blob URL:', blobUrl);

      // Stop all tracks
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Stop microphone stream separately
      if (microphoneStream) {
        console.log('Stopping microphone stream tracks');
        microphoneStream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped microphone track:', track.label);
        });
        microphoneStream = null;
      }

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

  // Stop microphone stream separately
  if (microphoneStream) {
    console.log('Cancelling: Stopping microphone stream tracks');
    microphoneStream.getTracks().forEach(track => {
      track.stop();
      console.log('Cancelled: Stopped microphone track:', track.label);
    });
    microphoneStream = null;
  }

  recordedChunks = [];
  mediaRecorder = null;
  stream = null;
}
