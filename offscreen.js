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
    if (microphoneStream) {
      microphoneStream.getTracks().forEach(track => track.stop());
      microphoneStream = null;
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

    // Create and start MediaRecorder
    const options = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000
    };

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
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log('Blob size:', blob.size, 'bytes');

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
