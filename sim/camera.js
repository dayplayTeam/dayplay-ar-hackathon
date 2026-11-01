/**
 * Real-camera passthrough manager for DayPlay AR Simulator.
 *
 * Requirements & Constraints:
 * - Browser AR sim only (no native iOS).
 * - iOS Safari 13+ requires HTTPS + user-gesture permission tap for camera.
 * - No WebXR on iPhone Safari -> compass + GPS-anchored placards at street scale.
 * - On permission denial or unsupported browser -> graceful fallback to synthetic background.
 */

export const CameraState = {
  UNSUPPORTED: 'unsupported',
  IDLE: 'idle',           // ready to request (needs tap on iOS)
  REQUESTING: 'requesting',
  ACTIVE: 'active',       // real camera streaming
  FALLBACK: 'fallback',   // synthetic background active
};

export class CameraFeedManager {
  constructor(options = {}) {
    this.videoEl = options.videoEl || null;
    this.syntheticEl = options.syntheticEl || null;
    this.statusEl = options.statusEl || null;
    this.badgeEl = options.badgeEl || null;
    this.toggleBtn = options.toggleBtn || null;
    this.onStateChange = options.onStateChange || null;

    this.stream = null;
    this.state = CameraState.IDLE;
    this.errorMessage = null;
    this.facingMode = 'environment'; // back camera for AR
  }

  isSupported() {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  isSecureContext() {
    if (typeof window === 'undefined') return false;
    return !!(
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }

  async _getUserMedia(constraints) {
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  setState(newState, error = null) {
    this.state = newState;
    this.errorMessage = error;
    this._updateUI();
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.state, { error: this.errorMessage, stream: this.stream });
    }
  }

  _updateUI() {
    if (this.badgeEl) {
      this.badgeEl.className = `camera-badge state-${this.state}`;
      if (this.state === CameraState.ACTIVE) {
        this.badgeEl.textContent = 'CAM: LIVE';
      } else if (this.state === CameraState.REQUESTING) {
        this.badgeEl.textContent = 'CAM: PERM?';
      } else if (this.state === CameraState.FALLBACK) {
        this.badgeEl.textContent = 'CAM: SYNTHETIC';
      } else if (this.state === CameraState.UNSUPPORTED) {
        this.badgeEl.textContent = 'CAM: N/A';
      } else {
        this.badgeEl.textContent = 'CAM: TAP TO START';
      }
    }

    if (this.toggleBtn) {
      if (this.state === CameraState.ACTIVE) {
        this.toggleBtn.textContent = 'Camera: Real';
        this.toggleBtn.classList.add('active');
      } else {
        this.toggleBtn.textContent = 'Camera: Synthetic';
        this.toggleBtn.classList.remove('active');
      }
    }

    if (this.videoEl) {
      this.videoEl.style.display = this.state === CameraState.ACTIVE ? 'block' : 'none';
    }
    if (this.syntheticEl) {
      this.syntheticEl.style.display = this.state === CameraState.ACTIVE ? 'none' : 'block';
    }
  }

  /**
   * Start real camera feed via getUserMedia.
   * If denied, insecure, or unsupported, falls back to synthetic background.
   */
  async startRealCamera() {
    if (!this.isSupported()) {
      console.warn('[Camera] getUserMedia not supported in this browser; falling back to synthetic.');
      this.fallbackToSynthetic('getUserMedia unsupported');
      return false;
    }

    if (!this.isSecureContext()) {
      console.warn('[Camera] Insecure context (requires HTTPS or localhost); falling back to synthetic.');
      this.fallbackToSynthetic('HTTPS required');
      return false;
    }

    this.setState(CameraState.REQUESTING);

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };

    try {
      const stream = await this._getUserMedia(constraints);
      this.stream = stream;

      if (this.videoEl) {
        this.videoEl.srcObject = stream;
        // iOS Safari inline playback attributes
        this.videoEl.setAttribute('playsinline', 'true');
        this.videoEl.setAttribute('webkit-playsinline', 'true');
        this.videoEl.muted = true;
        await this.videoEl.play();
      }

      this.setState(CameraState.ACTIVE);
      console.log('[Camera] Real-camera feed active.');
      return true;
    } catch (err) {
      const reason = err.name === 'NotAllowedError' ? 'Permission denied' : err.message;
      console.warn('[Camera] Camera request failed (' + reason + '); falling back to synthetic.', err);
      this.fallbackToSynthetic(reason);
      return false;
    }
  }

  /**
   * Stop camera tracks and return to synthetic background.
   */
  fallbackToSynthetic(reason = null) {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn('[Camera] Error stopping tracks:', e);
      }
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
    this.setState(CameraState.FALLBACK, reason);
  }

  /**
   * Toggle between real camera and synthetic background.
   */
  async toggle() {
    if (this.state === CameraState.ACTIVE) {
      this.fallbackToSynthetic('User toggled synthetic');
      return false;
    } else {
      return await this.startRealCamera();
    }
  }
}
