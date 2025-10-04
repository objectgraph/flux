// This page is opened to request microphone/camera permissions
// and then immediately closes

(async () => {
  try {
    // Get what permissions we need from the URL params
    const params = new URLSearchParams(window.location.search);
    const needMic = params.get('mic') === 'true';
    const needCamera = params.get('camera') === 'true';

    console.log('Permission helper requesting:', { needMic, needCamera });

    const constraints = {};
    if (needMic) constraints.audio = true;
    if (needCamera) constraints.video = true;

    if (Object.keys(constraints).length === 0) {
      console.log('No permissions needed, closing');
      window.close();
      return;
    }

    // Request the permissions
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    console.log('Permissions granted!');

    // Keep the stream alive in this window - DON'T stop it!
    // This maintains active permission for the extension
    window.activeMediaStream = stream;

    // Notify background that permissions were granted
    chrome.runtime.sendMessage({
      action: 'permissionsGranted',
      microphone: needMic,
      camera: needCamera
    });

    // Update UI to show permissions are active
    document.body.innerHTML = `
      <div class="container">
        <div style="width: 40px; height: 40px; background: #4CAF50; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px;">✓</div>
        <h2>Permissions Granted</h2>
        <p>This window will minimize and stay open during recording</p>
      </div>
    `;

    console.log('Keeping window open with active media stream');

  } catch (error) {
    console.error('Permission denied:', error);

    // Notify background that permissions were denied
    chrome.runtime.sendMessage({
      action: 'permissionsDenied',
      error: error.name === 'NotAllowedError' ? 'Permission denied by user' : error.message
    });

    // Close window
    setTimeout(() => {
      window.close();
    }, 1000);
  }
})();
