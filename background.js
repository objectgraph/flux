// Recording state
let recordingState = {
  isRecording: false,
  startTime: null,
  mediaRecorder: null,
  recordedChunks: [],
  streamId: null
};

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only handle messages from popup, not from background script itself
  const isFromPopup = sender.url && sender.url.includes('popup.html');

  switch (request.action) {
    case 'getState':
      sendResponse({
        isRecording: recordingState.isRecording,
        startTime: recordingState.startTime
      });
      break;

    case 'startRecording':
      if (!isFromPopup) return;
      startRecording(request.audioOptions)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'stopRecording':
      if (!isFromPopup) return;
      stopRecording()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'cancelRecording':
      if (!isFromPopup) return;
      cancelRecording()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
  }
});

// Start recording function
async function startRecording(audioOptions) {
  try {
    console.log('Starting recording with options:', audioOptions);

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Active tab:', tab.id);

    // Get settings from storage
    const settings = await chrome.storage.sync.get({
      videoQuality: '1080p',
      frameRate: 30
    });
    console.log('Settings:', settings);

    // Determine video constraints based on quality
    const videoConstraints = getVideoConstraints(settings.videoQuality, settings.frameRate);

    // Request tab capture with audio
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    console.log('Stream ID:', streamId);

    recordingState.streamId = streamId;

    // This will be handled in the offscreen document
    await setupOffscreenDocument();
    console.log('Offscreen document ready');

    // Send message to offscreen document to start recording
    const offscreenResponse = await sendToOffscreen({
      action: 'offscreen:initRecording',
      streamId: streamId,
      audioOptions: audioOptions,
      videoConstraints: videoConstraints
    });
    console.log('Init recording response:', offscreenResponse);

    recordingState.isRecording = true;
    recordingState.startTime = Date.now();

    // Notify popup of state change
    notifyStateChange();

  } catch (error) {
    console.error('Failed to start recording:', error);
    throw error;
  }
}

// Stop recording and download
async function stopRecording() {
  try {
    console.log('Stopping recording...');

    // Send message to offscreen document to stop recording
    const response = await sendToOffscreen({
      action: 'offscreen:stopRecording'
    });
    console.log('Stop recording response:', response);

    if (response && response.blobUrl) {
      console.log('Downloading blob URL:', response.blobUrl);
      // Download the recording
      await downloadRecording(response.blobUrl);
    } else {
      console.error('No blob URL in response');
    }

    recordingState.isRecording = false;
    recordingState.startTime = null;

    notifyStateChange();

  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
}

// Cancel recording without saving
async function cancelRecording() {
  try {
    await sendToOffscreen({
      action: 'offscreen:cancelRecording'
    });

    recordingState.isRecording = false;
    recordingState.startTime = null;

    notifyStateChange();

  } catch (error) {
    console.error('Failed to cancel recording:', error);
    throw error;
  }
}

// Download recording
async function downloadRecording(blobUrl) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `flux-recording-${timestamp}.webm`;

  await chrome.downloads.download({
    url: blobUrl,
    filename: filename,
    saveAs: true
  });
}

// Get video constraints based on quality settings
function getVideoConstraints(quality, frameRate) {
  const constraints = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 }
  };

  return {
    ...constraints[quality],
    frameRate: frameRate
  };
}

// Setup offscreen document for recording
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Recording screen and audio'
  });

  // Wait a bit for the offscreen document to fully load
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Send message to offscreen document
async function sendToOffscreen(message) {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length === 0) {
    throw new Error('Offscreen document not found');
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Notify popup of state change
function notifyStateChange() {
  chrome.runtime.sendMessage({
    action: 'stateChanged',
    state: {
      isRecording: recordingState.isRecording,
      startTime: recordingState.startTime
    }
  }).catch(() => {
    // Popup might be closed, ignore error
  });
}
