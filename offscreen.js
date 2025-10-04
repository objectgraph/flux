let mediaRecorder = null;
let recordedChunks = [];
let stream = null;

console.log('Offscreen document loaded');

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action, 'from:', sender.url);

  switch (request.action) {
    case 'offscreen:initRecording':
      initRecording(request.streamId, request.audioOptions, request.videoConstraints)
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
async function initRecording(streamId, audioOptions, videoConstraints) {
  try {
    console.log('Init recording with streamId:', streamId, 'audioOptions:', audioOptions, 'videoConstraints:', videoConstraints);

    // Get the tab stream using the streamId
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          ...videoConstraints
        }
      },
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
    console.log('Got media stream:', stream);

    // If microphone is requested, mix it with system audio
    if (audioOptions.microphone) {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

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
