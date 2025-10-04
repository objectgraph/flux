// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cancelBtn = document.getElementById('cancelBtn');
const settingsBtn = document.getElementById('settingsBtn');
const systemAudioCheckbox = document.getElementById('systemAudio');
const microphoneAudioCheckbox = document.getElementById('microphoneAudio');
const mainControls = document.getElementById('mainControls');
const recordingControls = document.getElementById('recordingControls');
const recordingInfo = document.getElementById('recordingInfo');
const countdown = document.getElementById('countdown');
const countdownNumber = document.getElementById('countdownNumber');
const timer = document.getElementById('timer');
const statusIndicator = document.getElementById('statusIndicator');

let recordingStartTime = null;
let timerInterval = null;

// Initialize popup state
async function init() {
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  updateUI(state);
}

// Update UI based on recording state
function updateUI(state) {
  if (state.isRecording) {
    mainControls.style.display = 'none';
    recordingControls.style.display = 'flex';
    recordingInfo.style.display = 'block';
    statusIndicator.classList.add('recording');

    if (state.startTime) {
      recordingStartTime = state.startTime;
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
    microphone: microphoneAudioCheckbox.checked
  };

  // Show countdown
  mainControls.style.display = 'none';
  countdown.style.display = 'block';

  for (let i = 3; i > 0; i--) {
    countdownNumber.textContent = i;
    countdownNumber.style.animation = 'none';
    setTimeout(() => {
      countdownNumber.style.animation = 'countdownPulse 1s ease-in-out';
    }, 10);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  countdown.style.display = 'none';

  // Start recording
  const response = await chrome.runtime.sendMessage({
    action: 'startRecording',
    audioOptions
  });

  if (response.success) {
    recordingStartTime = Date.now();
    updateUI({ isRecording: true, startTime: recordingStartTime });
  } else {
    alert('Failed to start recording: ' + response.error);
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
