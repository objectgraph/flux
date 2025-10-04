// DOM Elements
const videoQualitySelect = document.getElementById('videoQuality');
const frameRateRadios = document.getElementsByName('frameRate');
const maxDurationSelect = document.getElementById('maxDuration');
const defaultSystemAudioCheckbox = document.getElementById('defaultSystemAudio');
const defaultMicrophoneCheckbox = document.getElementById('defaultMicrophone');
const saveBtn = document.getElementById('saveBtn');
const statusMessage = document.getElementById('statusMessage');
const micPermissionStatus = document.getElementById('micPermissionStatus');
const micStatusIcon = document.getElementById('micStatusIcon');
const micStatusText = document.getElementById('micStatusText');
const requestMicPermissionBtn = document.getElementById('requestMicPermission');

// Load settings on page load
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    videoQuality: '1080p',
    frameRate: 30,
    maxDuration: 0,
    defaultSystemAudio: true,
    defaultMicrophone: false
  });

  // Set video quality
  videoQualitySelect.value = settings.videoQuality;

  // Set frame rate
  frameRateRadios.forEach(radio => {
    if (parseInt(radio.value) === settings.frameRate) {
      radio.checked = true;
    }
  });

  // Set max duration
  maxDurationSelect.value = settings.maxDuration;

  // Set default audio settings
  defaultSystemAudioCheckbox.checked = settings.defaultSystemAudio;
  defaultMicrophoneCheckbox.checked = settings.defaultMicrophone;
}

// Save settings
async function saveSettings() {
  const selectedFrameRate = Array.from(frameRateRadios).find(radio => radio.checked);

  const settings = {
    videoQuality: videoQualitySelect.value,
    frameRate: parseInt(selectedFrameRate.value),
    maxDuration: parseInt(maxDurationSelect.value),
    defaultSystemAudio: defaultSystemAudioCheckbox.checked,
    defaultMicrophone: defaultMicrophoneCheckbox.checked
  };

  await chrome.storage.sync.set(settings);

  // Show success message
  statusMessage.classList.add('success');
  setTimeout(() => {
    statusMessage.classList.remove('success');
  }, 3000);
}

// Check microphone permission status
async function checkMicPermission() {
  try {
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });

    // Update UI based on permission status
    updatePermissionUI(permissionStatus.state);

    // Listen for permission changes
    permissionStatus.addEventListener('change', () => {
      updatePermissionUI(permissionStatus.state);
    });

    return permissionStatus.state;
  } catch (error) {
    console.error('Error checking microphone permission:', error);
    updatePermissionUI('error');
    return 'error';
  }
}

// Update permission UI based on status
function updatePermissionUI(state) {
  micPermissionStatus.className = 'permission-status';

  switch(state) {
    case 'granted':
      micPermissionStatus.classList.add('granted');
      micStatusIcon.textContent = '✅';
      micStatusText.textContent = 'Microphone access granted';
      requestMicPermissionBtn.disabled = true;
      requestMicPermissionBtn.textContent = 'Permission Granted';
      break;
    case 'denied':
      micPermissionStatus.classList.add('denied');
      micStatusIcon.textContent = '❌';
      micStatusText.textContent = 'Microphone access denied - Please enable in browser settings';
      requestMicPermissionBtn.disabled = false;
      requestMicPermissionBtn.textContent = 'Request Permission Again';
      break;
    case 'prompt':
      micPermissionStatus.classList.add('prompt');
      micStatusIcon.textContent = '⚠️';
      micStatusText.textContent = 'Microphone permission not yet granted';
      requestMicPermissionBtn.disabled = false;
      requestMicPermissionBtn.textContent = 'Request Microphone Permission';
      break;
    default:
      micStatusIcon.textContent = '❓';
      micStatusText.textContent = 'Unable to check permission status';
      requestMicPermissionBtn.disabled = false;
      requestMicPermissionBtn.textContent = 'Request Microphone Permission';
  }
}

// Request microphone permission
async function requestMicPermission() {
  try {
    // Update UI to show requesting
    micStatusIcon.textContent = '⏳';
    micStatusText.textContent = 'Requesting microphone permission...';
    requestMicPermissionBtn.disabled = true;

    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Permission granted - stop the stream immediately
    stream.getTracks().forEach(track => track.stop());

    // Check permission status again to update UI
    await checkMicPermission();

    // Store that we've granted permission
    await chrome.storage.local.set({ microphonePermissionGranted: true });

    // Show success message
    statusMessage.textContent = 'Microphone permission granted successfully!';
    statusMessage.classList.add('success');
    setTimeout(() => {
      statusMessage.classList.remove('success');
    }, 3000);

  } catch (error) {
    console.error('Error requesting microphone permission:', error);

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      updatePermissionUI('denied');
    } else if (error.name === 'NotFoundError') {
      micStatusIcon.textContent = '⚠️';
      micStatusText.textContent = 'No microphone found';
      requestMicPermissionBtn.disabled = true;
    } else {
      micStatusIcon.textContent = '❌';
      micStatusText.textContent = `Error: ${error.message}`;
    }
  }
}

// Event listeners
saveBtn.addEventListener('click', saveSettings);
requestMicPermissionBtn.addEventListener('click', requestMicPermission);

// Initialize
loadSettings();
checkMicPermission();
