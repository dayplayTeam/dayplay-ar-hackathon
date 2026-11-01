import assert from 'node:assert/strict';
import { CameraFeedManager, CameraState } from '../sim/camera.js';

// Test 1: Unsupported environment fallback
{
  const mgr = new CameraFeedManager();
  assert.equal(mgr.state, CameraState.IDLE);
  
  // Without navigator.mediaDevices, should fallback gracefully
  const started = await mgr.startRealCamera();
  assert.equal(started, false);
  assert.equal(mgr.state, CameraState.FALLBACK);
  console.log('Test 1 passed: Unsupported environment falls back to synthetic');
}

// Test 2: Custom / mocked navigator via constructor or override
{
  let stateLog = [];
  const fakeStream = {
    getTracks: () => [
      { stop: () => { tracksStopped = true; } }
    ]
  };
  let tracksStopped = false;

  const fakeVideoEl = {
    srcObject: null,
    style: {},
    setAttribute: () => {},
    play: async () => {}
  };

  const fakeSyntheticEl = {
    style: {}
  };

  // Subclass or simulate denied getUserMedia
  class DeniedCameraManager extends CameraFeedManager {
    isSupported() { return true; }
    isSecureContext() { return true; }
    async _getUserMedia(constraints) {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    }
  }

  const deniedMgr = new DeniedCameraManager({
    videoEl: fakeVideoEl,
    syntheticEl: fakeSyntheticEl,
    onStateChange: (state) => stateLog.push(state),
  });

  const deniedSuccess = await deniedMgr.startRealCamera();
  assert.equal(deniedSuccess, false);
  assert.equal(deniedMgr.state, CameraState.FALLBACK);
  assert.equal(deniedMgr.errorMessage, 'Permission denied');
  assert.deepEqual(stateLog, [CameraState.REQUESTING, CameraState.FALLBACK]);
  assert.equal(fakeVideoEl.style.display, 'none');
  assert.equal(fakeSyntheticEl.style.display, 'block');
  console.log('Test 2 passed: Denied camera falls back gracefully to synthetic background');

  // Test 3: Approved camera stream and toggle back
  class AllowedCameraManager extends CameraFeedManager {
    isSupported() { return true; }
    isSecureContext() { return true; }
    async _getUserMedia(constraints) {
      assert.equal(constraints.video.facingMode.ideal, 'environment');
      return fakeStream;
    }
  }

  const allowedMgr = new AllowedCameraManager({
    videoEl: fakeVideoEl,
    syntheticEl: fakeSyntheticEl,
  });

  const allowedSuccess = await allowedMgr.startRealCamera();
  assert.equal(allowedSuccess, true);
  assert.equal(allowedMgr.state, CameraState.ACTIVE);
  assert.equal(fakeVideoEl.style.display, 'block');
  assert.equal(fakeSyntheticEl.style.display, 'none');

  // Toggle back to synthetic
  await allowedMgr.toggle();
  assert.equal(allowedMgr.state, CameraState.FALLBACK);
  assert.equal(tracksStopped, true);
  assert.equal(fakeVideoEl.style.display, 'none');
  assert.equal(fakeSyntheticEl.style.display, 'block');
  console.log('Test 3 passed: Active camera feed toggles back to synthetic cleanly');
}
