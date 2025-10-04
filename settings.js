// DOM Elements
const videoQualitySelect = document.getElementById('videoQuality');
const frameRateRadios = document.getElementsByName('frameRate');
const maxDurationSelect = document.getElementById('maxDuration');
const defaultSystemAudioCheckbox = document.getElementById('defaultSystemAudio');
const defaultMicrophoneCheckbox = document.getElementById('defaultMicrophone');
const saveBtn = document.getElementById('saveBtn');
const statusMessage = document.getElementById('statusMessage');

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

// Event listeners
saveBtn.addEventListener('click', saveSettings);

// Initialize
loadSettings();
