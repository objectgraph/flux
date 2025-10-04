let mediaRecorder = null;
let recordedChunks = [];
let stream = null;

console.log('Offscreen document loaded');

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action, 'from:', sender.url);

  switch (request.action) {
    case 'offscreen:initRecording':
      initRecording(request.streamId, request.audioOptions, request.videoConstraints, request.isDesktopCapture)
        .then(() => {
          console.log('Recording initialized successfully');
          sendResponse({ success: true });
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

// Initialize recording
async function initRecording(streamId, audioOptions, videoConstraints, isDesktopCapture) {
  try {
    console.log('Init recording with streamId:', streamId, 'audioOptions:', audioOptions, 'videoConstraints:', videoConstraints, 'isDesktopCapture:', isDesktopCapture);

    // Clean up any existing recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('Cleaning up existing recorder with state:', mediaRecorder.state);
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    recordedChunks = [];

    // Get the stream using the streamId
    if (isDesktopCapture) {
      // Desktop capture stream
      const constraints = {
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId,
            ...videoConstraints
          }
        }
      };

      // Add audio constraints if system audio is requested
      if (audioOptions.systemAudio) {
        constraints.audio = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: streamId
          }
        };
      } else {
        constraints.audio = false;
      }

      console.log('Desktop capture constraints:', constraints);

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.error('Failed to get desktop stream, trying without audio:', error);
        // If it fails with audio, try without audio
        if (audioOptions.systemAudio) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: streamId,
                ...videoConstraints
              }
            },
            audio: false
          });
          console.log('Got video-only stream after audio failure');
        } else {
          throw error;
        }
      }
    } else {
      // Tab capture stream (backward compatibility)
      const tabConstraints = {
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
            ...videoConstraints
          }
        }
      };

      // Add audio constraints if system audio is requested
      if (audioOptions.systemAudio) {
        tabConstraints.audio = {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        };
      } else {
        tabConstraints.audio = false;
      }

      console.log('Tab capture constraints:', tabConstraints);
      stream = await navigator.mediaDevices.getUserMedia(tabConstraints);
    }
    console.log('Got media stream:', stream);

    // If microphone is requested, mix it with system audio
    if (audioOptions.microphone) {
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
      } catch (micError) {
        console.error('Failed to get microphone access:', micError);
        // Stop any tracks we've obtained
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        // Properly format the error message
        let errorMsg = 'Microphone access failed: ';
        if (micError.name === 'NotAllowedError') {
          errorMsg += 'Permission denied';
        } else if (micError.name === 'NotFoundError') {
          errorMsg += 'No microphone found';
        } else {
          errorMsg += micError.name || micError.message || 'Unknown error';
        }
        throw new Error(errorMsg);
      }

      // Create audio context to mix streams
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      // Add system audio if enabled
      if (audioOptions.systemAudio) {
        const systemAudioSource = audioContext.createMediaStreamSource(stream);
        systemAudioSource.connect(destination);
      }

      // Add microphone audio
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      // Replace audio track with mixed audio
      const videoTrack = stream.getVideoTracks()[0];
      stream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
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
    throw new Error(`Error starting ${isDesktopCapture ? 'desktop' : 'tab'} capture: ${error.message}`);
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

  recordedChunks = [];
  mediaRecorder = null;
  stream = null;
}
