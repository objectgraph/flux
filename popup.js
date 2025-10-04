// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cancelBtn = document.getElementById('cancelBtn');
const settingsBtn = document.getElementById('settingsBtn');
const systemAudioCheckbox = document.getElementById('systemAudio');
const microphoneAudioCheckbox = document.getElementById('microphoneAudio');
const cameraOverlayCheckbox = document.getElementById('cameraOverlay');
const mainControls = document.getElementById('mainControls');
const recordingControls = document.getElementById('recordingControls');
const recordingInfo = document.getElementById('recordingInfo');
const countdown = document.getElementById('countdown');
const countdownNumber = document.getElementById('countdownNumber');
const timer = document.getElementById('timer');
const statusIndicator = document.getElementById('statusIndicator');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const permissionBtn = document.getElementById('permissionBtn');

let recordingStartTime = null;
let timerInterval = null;

// Show error message
function showError(message) {
  console.log('Showing error:', message);

  // Parse error message for user-friendly display
  let userMessage = message;
  let showPermissionButton = false;

  if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
    userMessage = 'Microphone permission blocked. Click the button below to check your settings.';
    showPermissionButton = true;
  } else if (message.includes('Microphone access failed')) {
    userMessage = 'Unable to access microphone. Please check your browser permissions.';
    showPermissionButton = true;
  } else if (message.includes('User cancelled')) {
    userMessage = 'Recording cancelled. Please select a source to record.';
  } else if (message.includes('tab capture')) {
    userMessage = 'Unable to capture this tab. Try refreshing the page or selecting a different tab.';
  } else if (message.includes('desktop capture')) {
    userMessage = 'Unable to capture screen. Please try again or select a different source.';
  } else if (message.includes('NotFoundError') || message.includes('No microphone found')) {
    userMessage = 'No microphone detected. Please connect a microphone and try again.';
  }

  errorText.textContent = userMessage;
  errorMessage.style.display = 'flex';

  // Show or hide permission button
  if (showPermissionButton) {
    permissionBtn.style.display = 'block';
  } else {
    permissionBtn.style.display = 'none';
  }

  // Make sure the main controls are visible
  mainControls.style.display = 'flex';
  countdown.style.display = 'none';
  recordingControls.style.display = 'none';

  // Auto-hide after 10 seconds when permission button is shown
  setTimeout(() => {
    hideError();
  }, showPermissionButton ? 10000 : 7000);
}

// Hide error message
function hideError() {
  errorMessage.style.display = 'none';
  permissionBtn.style.display = 'none';
}

// Show warning message (less severe than error)
function showWarning(message) {
  console.log('Showing warning:', message);

  // Create warning element if it doesn't exist
  let warningMessage = document.getElementById('warningMessage');
  if (!warningMessage) {
    warningMessage = document.createElement('div');
    warningMessage.id = 'warningMessage';
    warningMessage.className = 'warning-message';
    warningMessage.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
      </svg>
      <span id="warningText"></span>
    `;
    document.querySelector('.popup-container').insertBefore(warningMessage, recordingControls);
  }

  const warningText = document.getElementById('warningText');
  warningText.textContent = message;
  warningMessage.style.display = 'flex';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    hideWarning();
  }, 5000);
}

// Hide warning message
function hideWarning() {
  const warningMessage = document.getElementById('warningMessage');
  if (warningMessage) {
    warningMessage.style.display = 'none';
  }
}

// Open Chrome microphone settings
function openMicrophoneSettings() {
  // Get the current tab URL to show site-specific settings
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      let origin = 'the website';
      try {
        const url = new URL(tabs[0].url);
        origin = url.origin;
      } catch (e) {
        // Handle chrome:// or other special URLs
        console.log('Could not parse URL:', tabs[0].url);
      }

      // Create a help page with instructions
      const helpHTML = `
        <html>
        <head>
          <title>Microphone Permission Help</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #333; }
            .steps { background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .step { margin: 15px 0; }
            .step-num { background: #4CAF50; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; margin-right: 10px; font-weight: bold; }
            code { background: #e8e8e8; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
            .url-box { background: #fff; border: 1px solid #ddd; padding: 10px; border-radius: 4px; margin: 10px 0; word-break: break-all; }
            .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>🎤 Enable Microphone for Flux Recording</h1>

          <div class="warning">
            <strong>Note:</strong> Microphone permission is needed to record audio with your screen recording.
          </div>

          <div class="steps">
            <h2>To enable microphone access:</h2>

            <div class="step">
              <span class="step-num">1</span>
              Copy this URL:
              <div class="url-box">chrome://settings/content/microphone</div>
            </div>

            <div class="step">
              <span class="step-num">2</span>
              Paste it in a new tab and press Enter
            </div>

            <div class="step">
              <span class="step-num">3</span>
              Make sure "Sites can ask to use your microphone" is enabled
            </div>

            <div class="step">
              <span class="step-num">4</span>
              Check that no sites are blocked in the "Not allowed to use your microphone" section
            </div>

            <div class="step">
              <span class="step-num">5</span>
              Return to ${origin} and try recording again
            </div>
          </div>

          <h3>Alternative: Per-site settings</h3>
          <p>You can also click the 🔒 lock icon in the address bar on any website and check the microphone permission there.</p>

          <h3>Still having issues?</h3>
          <p>Try recording <strong>without</strong> the microphone option checked, or select only "System Audio" in the Flux popup.</p>
        </body>
        </html>
      `;

      // Create a data URL with the help content
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(helpHTML);

      // Open help in a new tab
      chrome.tabs.create({ url: dataUrl });
    }
  });
}

// Initialize popup state
async function init() {
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  updateUI(state);

  // Load default settings from storage if not recording
  if (!state.isRecording) {
    const settings = await chrome.storage.sync.get({
      defaultSystemAudio: true,
      defaultMicrophone: false,
      defaultCamera: false
    });
    systemAudioCheckbox.checked = settings.defaultSystemAudio;
    microphoneAudioCheckbox.checked = settings.defaultMicrophone;
    cameraOverlayCheckbox.checked = settings.defaultCamera;
  }

  // Clear any lingering errors and warnings on popup open
  hideError();
  hideWarning();
}

// Update UI based on recording state
function updateUI(state) {
  if (state.isRecording) {
    mainControls.style.display = 'none';
    recordingControls.style.display = 'flex';
    recordingInfo.style.display = 'block';
    statusIndicator.classList.add('recording');
    hideError(); // Hide any error when recording starts

    if (state.startTime) {
      recordingStartTime = state.startTime;
      // Immediately update timer display with current elapsed time
      const elapsed = Date.now() - recordingStartTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      startTimer();
    }
  } else {
    mainControls.style.display = 'flex';
    recordingControls.style.display = 'none';
    recordingInfo.style.display = 'none';
    countdown.style.display = 'none';
    statusIndicator.classList.remove('recording');
    stopTimer();
  }
}

// Start recording with countdown
startBtn.addEventListener('click', async () => {
  const audioOptions = {
    systemAudio: systemAudioCheckbox.checked,
    microphone: microphoneAudioCheckbox.checked,
    camera: cameraOverlayCheckbox.checked
  };

  // Hide any existing errors
  hideError();

  try {
    // Call startRecording - it will handle picker vs current tab
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      audioOptions
    });

    if (!response || !response.success) {
      const errorMsg = response?.error || 'Failed to start recording';
      console.log('Recording failed:', errorMsg);
      showError(errorMsg);
      return;
    }

    // Recording started successfully (no countdown for any mode)
    recordingStartTime = Date.now();
    updateUI({ isRecording: true, startTime: recordingStartTime });

    // Show warning if present
    if (response.warning) {
      showWarning(response.warning);
    }
  } catch (error) {
    console.error('Error starting recording:', error);
    showError(error.message || 'Failed to start recording');
    updateUI({ isRecording: false });
  }
});

// Stop recording
stopBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: 'stopRecording' });

  if (response.success) {
    updateUI({ isRecording: false });
  }
});

// Cancel recording
cancelBtn.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: 'cancelRecording' });

  if (response.success) {
    updateUI({ isRecording: false });
  }
});

// Settings button
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Permission button
permissionBtn.addEventListener('click', () => {
  openMicrophoneSettings();
});

// Timer functions
function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timer.textContent = '00:00';
}

// Listen for state changes from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stateChanged') {
    updateUI(message.state);
  }
});

// Initialize on load
init();
