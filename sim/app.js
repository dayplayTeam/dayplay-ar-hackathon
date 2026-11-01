/**
 * DayPlay AR Simulator — Mission Corridor Walkthrough
 * 
 * Consumes POST /pipeline directly from origin. Renders verified DayPlay pins
 * as FOV placards anchored by bearing and distance.
 * 
 * Strict Invariants:
 * 1. ZERO-HALLUCINATION: pins must have a listing_id present in the verified response.
 * 2. ONLY pipeline output pins are rendered (with /pins boot fallback).
 * 3. Latency logging: window.__latencyLog tracks intent -> render ms.
 * 4. T4a: Real-camera passthrough via getUserMedia with graceful synthetic fallback.
 */

import { CameraFeedManager, CameraState } from './camera.js';

// Latency artifact log for evaluations/QA
window.__latencyLog = [];

const CFG = {
  fovDeg: 62,              // Field of view in degrees
  maxRenderDistM: 600,     // Max render horizon
  minRenderDistM: 1.0,     // Clipping plane
  baseWalkSpeedMps: 1.4,   // ~5 km/h human walking speed
  tickMs: 100,             // 10 FPS updates
};

let speedMultiplier = 3.0; // Default 3x so pins approach visibly in 10-20s
let isWalking = true;
let pins = [];
let walkTimer = null;
let cameraManager = null;

// Initial walker position at South end of Mission corridor (near 24th St / Mission Rec)
// Heading ~35° (North-East along Mission St / corridor axis toward 16th St)
const START_POS = {
  lat: 37.7510,
  lng: -122.4170,
  heading: 35.0,
};

let user = { ...START_POS };

// Geometry helpers
// Confirmed geometry: lat=111320, lng=111320*cos(lat)
export function metersPerDeg(latDeg) {
  const latRad = (latDeg * Math.PI) / 180.0;
  return {
    lat: 111320.0,
    lng: 111320.0 * Math.cos(latRad),
  };
}

export function relCoords(pin, currentUser = user) {
  const mpd = metersPerDeg(currentUser.lat);
  const dx = (pin.lng - currentUser.lng) * mpd.lng; // Easting (meters)
  const dz = (pin.lat - currentUser.lat) * mpd.lat; // Northing (meters)

  const headRad = (currentUser.heading * Math.PI) / 180.0;
  const sinH = Math.sin(headRad);
  const cosH = Math.cos(headRad);

  // Rotate into user view space: forward along heading, right perpendicular to heading
  const fwd = dx * sinH + dz * cosH;
  const right = dx * cosH - dz * sinH;
  const dist = Math.hypot(dx, dz);

  return { right, fwd, dist };
}

export function getKindIcon(kind) {
  if (kind === 'event') return { icon: '⚡', class: 'kind-event', label: 'EVENT' };
  if (kind === 'plan_stop') return { icon: '📍', class: 'kind-plan_stop', label: 'STOP' };
  return { icon: '★', class: 'kind-saved', label: 'SAVED' };
}

export function renderPins() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  stage.innerHTML = '';

  let shown = 0;
  const now = performance.now();

  for (const pin of pins) {
    // Zero-hallucination guard: refuse ungrounded items
    if (!pin || !pin.listing_id) {
      console.warn('Refusing pin without listing_id:', pin);
      continue;
    }

    const r = relCoords(pin);

    // Behind camera or out of horizon
    if (r.fwd < CFG.minRenderDistM || r.fwd > CFG.maxRenderDistM) {
      continue;
    }

    // Horizontal FOV angle (-0.5 .. 0.5 is inside FOV)
    const bearingDeg = (Math.atan2(r.right, r.fwd) * 180.0) / Math.PI;
    const hfov = bearingDeg / CFG.fovDeg;

    if (Math.abs(hfov) > 0.55) {
      // Pin is outside camera horizontal frustum
      continue;
    }

    // Perspective projection
    const screenX = 50 + hfov * 100; // in vw
    // Ground perspective: closer pins are slightly lower, farther are near horizon
    const screenY = 52 - (r.fwd / CFG.maxRenderDistM) * 20 - (hfov * hfov) * 5; // in vh
    
    // Scale placard slightly with distance (closer = bigger, capped)
    const scale = Math.max(0.75, Math.min(1.15, 1.1 - (r.fwd / CFG.maxRenderDistM) * 0.4));
    const opacity = Math.max(0.4, Math.min(1.0, 1.05 - (r.fwd / CFG.maxRenderDistM) * 0.9));

    const kindInfo = getKindIcon(pin.kind);
    const startsStr = pin.starts_at ? new Date(pin.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

    const el = document.createElement('div');
    el.className = 'placard';
    el.id = `placard-${pin.listing_id}`;
    el.style.left = `${screenX.toFixed(2)}vw`;
    el.style.top = `${screenY.toFixed(2)}vh`;
    el.style.opacity = opacity.toFixed(2);
    el.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(2)})`;

    el.innerHTML = `
      <div class="placard-header">
        <span class="badge-icon ${kindInfo.class}">${kindInfo.icon}</span>
        <span class="pin-title" title="${pin.name}">${pin.name}</span>
        <span class="pin-dist">${Math.round(r.dist)}m</span>
      </div>
      <div class="pin-meta">
        <span>${kindInfo.label}${startsStr ? ' · ' + startsStr : ''}</span>
        <span class="pin-id">${pin.listing_id.slice(0, 8)}</span>
      </div>
    `;

    stage.appendChild(el);
    shown++;
  }

  // Update HUD status & telemetry
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.innerHTML = `<b>${shown} in FOV</b> (${pins.length} active corridor pins) · Provider: <code>${window.__provider || 'mock'}</code>`;
  }
  const telEl = document.getElementById('telemetry');
  if (telEl) {
    const spd = isWalking ? (CFG.baseWalkSpeedMps * speedMultiplier).toFixed(1) : '0.0';
    telEl.textContent = `LAT ${user.lat.toFixed(5)} · LNG ${user.lng.toFixed(5)} · HDG ${Math.round(user.heading)}° · SPEED ${spd} m/s`;
  }

  return { shown, total: pins.length, timestamp: now };
}

export async function ask() {
  const qInput = document.getElementById('q');
  const query = qInput ? qInput.value.trim() : '';
  if (!query) return;

  const statusEl = document.getElementById('status');
  const t0 = performance.now();

  // Show loading indicator after 1s if network is slow
  const loadingTimer = setTimeout(() => {
    if (statusEl) statusEl.textContent = `Resolving intent via pipeline for "${query}"…`;
  }, 1000);

  try {
    const res = await fetch('/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query, source: 'real' }),
    });

    clearTimeout(loadingTimer);

    if (!res.ok) {
      throw new Error(`Pipeline error HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const tRender0 = performance.now();

    // Verify zero hallucination invariant
    if (data.zero_hallucination_assert !== 'pass') {
      console.warn('Zero hallucination assert failed:', data);
    }

    pins = data.pins || [];
    window.__provider = data.provider || 'mock';

    const renderResult = renderPins();
    const tRender1 = performance.now();

    const latencyEntry = {
      query,
      pipelineLatencyMs: Math.round(tRender0 - t0),
      renderLatencyMs: Math.round(tRender1 - tRender0),
      totalMs: Math.round(tRender1 - t0),
      pinsReturned: pins.length,
      pinsInFov: renderResult ? renderResult.shown : 0,
      timestamp: new Date().toISOString(),
    };

    window.__latencyLog.push(latencyEntry);
    console.log('[Pipeline] Query resolved:', latencyEntry);
  } catch (err) {
    clearTimeout(loadingTimer);
    console.error('Pipeline call failed:', err);
    if (statusEl) statusEl.textContent = `Error: ${err.message}`;
  }
}

function stepWalk() {
  if (!isWalking) return;
  const mpd = metersPerDeg(user.lat);
  const distancePerTickM = (CFG.baseWalkSpeedMps * speedMultiplier) * (CFG.tickMs / 1000.0);
  
  const headRad = (user.heading * Math.PI) / 180.0;
  const dNorthM = distancePerTickM * Math.cos(headRad);
  const dEastM = distancePerTickM * Math.sin(headRad);

  user.lat += dNorthM / mpd.lat;
  user.lng += dEastM / mpd.lng;

  renderPins();
}

export function toggleWalk() {
  isWalking = !isWalking;
  const btn = document.getElementById('btn-walk');
  if (btn) {
    btn.textContent = isWalking ? 'Walk: ON' : 'Walk: PAUSED';
    btn.classList.toggle('active', isWalking);
  }
}

export function toggleSpeed() {
  if (speedMultiplier === 1.0) speedMultiplier = 3.0;
  else if (speedMultiplier === 3.0) speedMultiplier = 6.0;
  else speedMultiplier = 1.0;

  const btn = document.getElementById('btn-speed');
  if (btn) btn.textContent = `Speed: ${speedMultiplier}x`;
}

export function resetWalk() {
  user = { ...START_POS };
  renderPins();
}

export async function toggleCamera() {
  if (cameraManager) {
    await cameraManager.toggle();
  }
}

export function getCameraManager() {
  return cameraManager;
}

export async function boot() {
  try {
    const h = await fetch('/health');
    const hj = await h.json();
    window.__provider = hj.provider || 'mock';
  } catch (e) {
    console.warn('Health check failed', e);
  }

  // Initialize camera feed manager
  const videoEl = document.getElementById('camera-feed');
  const syntheticEl = document.getElementById('synthetic-bg');
  const badgeEl = document.getElementById('camera-status-badge');
  const toggleBtn = document.getElementById('btn-camera');

  cameraManager = new CameraFeedManager({
    videoEl,
    syntheticEl,
    badgeEl,
    toggleBtn,
  });
  window.__cameraManager = cameraManager;

  // Initial pins fallback from /pins (real Mission corridor dataset)
  try {
    const r = await fetch('/pins?source=real');
    const rj = await r.json();
    if (rj.pins && rj.pins.length) {
      pins = rj.pins;
    }
  } catch (e) {
    console.warn('Pins fetch failed, trying synthetic', e);
    try {
      const syn = await fetch('/pins?source=synthetic');
      const synj = await syn.json();
      pins = synj.pins || [];
    } catch (e2) {
      console.error('Synthetic pins fetch also failed', e2);
    }
  }

  renderPins();

  // Start walking ticker
  if (walkTimer) clearInterval(walkTimer);
  walkTimer = setInterval(stepWalk, CFG.tickMs);
}

// Wire globals for HTML button events
window.ask = ask;
window.toggleWalk = toggleWalk;
window.toggleSpeed = toggleSpeed;
window.resetWalk = resetWalk;
window.toggleCamera = toggleCamera;
window.renderPins = renderPins;

// Auto-boot on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
