// Recording state
let recordingState = {
  isRecording: false,
  startTime: null,
  pulseInterval: null
};

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Only handle messages from popup, not from background script itself
  const isFromPopup = sender.url && sender.url.includes('popup.html');
  const isFromOffscreen = sender.url && sender.url.includes('offscreen.html');

  switch (request.action) {
    case 'getState':
      sendResponse({
        isRecording: recordingState.isRecording,
        startTime: recordingState.startTime
      });
      break;

    case 'autoStopRecording':
      if (!isFromOffscreen) return;
      // User stopped sharing - download and cleanup
      console.log('Auto-stop recording triggered by user');
      downloadRecording(request.blobUrl)
        .then(() => {
          recordingState.isRecording = false;
          recordingState.startTime = null;
          stopPulsingIcon();
          notifyStateChange();
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Failed to download recording:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'startRecording':
      if (!isFromPopup) return;
      startRecordingWithPicker(request.audioOptions)
        .then(result => {
          console.log('startRecording completed with result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('startRecording failed with error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Async response

    case 'stopRecording':
      if (!isFromPopup) return;
      stopRecording()
        .then(result => {
          if (result && result.success === false) {
            sendResponse(result);
          } else {
            sendResponse({ success: true });
          }
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'cancelRecording':
      if (!isFromPopup) return;
      cancelRecording()
        .then(result => {
          if (result && result.success === false) {
            sendResponse(result);
          } else {
            sendResponse({ success: true });
          }
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
  }
});

// Start recording with picker or current tab
async function startRecordingWithPicker(audioOptions) {
  try {
    console.log('Starting recording with options:', audioOptions);

    // Always use picker mode - let user choose what to record
    await setupOffscreenDocument();
    console.log('Offscreen document ready');

    // Use default high quality settings
    const videoConstraints = {
      width: 1920,
      height: 1080,
      frameRate: 30
    };

    // Send message to offscreen to show picker and start recording
    const offscreenResponse = await sendToOffscreen({
      action: 'offscreen:startPickerRecording',
      audioOptions: audioOptions,
      videoConstraints: videoConstraints
    });
    console.log('Picker recording response:', offscreenResponse);

    if (!offscreenResponse.success) {
      const errorMsg = offscreenResponse.error || 'Failed to start recording';
      await showNotification('Recording Failed', errorMsg, 'error');
      throw new Error(errorMsg);
    }

    recordingState.isRecording = true;
    recordingState.startTime = Date.now();
    startPulsingIcon();

    notifyStateChange();

    // Show success notification
    if (offscreenResponse.warning) {
      await showNotification('Recording Started', offscreenResponse.warning, 'warning');
    } else {
      await showNotification('Recording Started', 'Your screen is now being recorded', 'basic');
    }

    return {
      success: true,
      warning: offscreenResponse.warning
    };

  } catch (error) {
    console.error('Failed to start recording:', error);
    // Reset recording state on error
    recordingState.isRecording = false;
    recordingState.startTime = null;

    // Stop any pulsing animation
    stopPulsingIcon();

    // Show notification for errors when popup is likely closed
    // Get settings to check if picker mode
    const settings = await chrome.storage.sync.get({
      recordingSource: 'current-tab'
    });

    if (settings.recordingSource === 'picker') {
      // Don't show notification for user cancellation
      if (!error.message.includes('User cancelled')) {
        await showNotification('Recording Failed', error.message, 'error');
      }
    }

    throw error;
  }
}

// Stop recording and download
async function stopRecording() {
  try {
    // Don't try to stop if not recording
    if (!recordingState.isRecording) {
      console.log('No recording to stop');
      return { success: false, error: 'No active recording' };
    }

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

    // Stop pulsing icon animation
    stopPulsingIcon();

    notifyStateChange();

  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
}

// Cancel recording without saving
async function cancelRecording() {
  try {
    // Don't try to cancel if not recording
    if (!recordingState.isRecording) {
      console.log('No recording to cancel');
      return { success: false, error: 'No active recording' };
    }

    await sendToOffscreen({
      action: 'offscreen:cancelRecording'
    });

    recordingState.isRecording = false;
    recordingState.startTime = null;

    // Stop pulsing icon animation
    stopPulsingIcon();

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

// Removed getVideoConstraints - now using fixed high quality settings

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

// Show notification (for picker mode where popup is closed)
async function showNotification(title, message, type = 'basic') {
  const iconPath = type === 'error' ? 'icons/icon48.png' : 'icons/icon48.png';

  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: title,
    message: message,
    priority: type === 'error' ? 2 : 1
  });
}

// Start pulsing icon animation
function startPulsingIcon() {
  // Set initial badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

  // Create pulsing effect by alternating badge visibility
  let visible = true;
  recordingState.pulseInterval = setInterval(() => {
    if (visible) {
      chrome.action.setBadgeText({ text: '' });
    } else {
      chrome.action.setBadgeText({ text: 'REC' });
    }
    visible = !visible;
  }, 500);
}

// Stop pulsing icon animation
function stopPulsingIcon() {
  if (recordingState.pulseInterval) {
    clearInterval(recordingState.pulseInterval);
    recordingState.pulseInterval = null;
  }
  chrome.action.setBadgeText({ text: '' });
}

// Removed clearMaxDurationTimeout - no longer using max duration timeouts
