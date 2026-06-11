/* ═══════════════════════════════════════════════════════════════════════════════
   AU Bank — Support Agent  |  Vapi Web SDK Integration
   ═══════════════════════════════════════════════════════════════════════════════ */

import Vapi from "@vapi-ai/web";

// ── Configuration ──────────────────────────────────────────────────────────────
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = import.meta.env.VITE_ASSISTANT_ID;

if (!VAPI_PUBLIC_KEY || !ASSISTANT_ID) {
  throw new Error(
    "Missing required env vars: VITE_VAPI_PUBLIC_KEY and/or VITE_ASSISTANT_ID. " +
    "Create a .env file in the frontend directory — see .env.example for reference."
  );
}

// ── Initialize Vapi ────────────────────────────────────────────────────────────
const vapi = new Vapi(VAPI_PUBLIC_KEY);

// ── State ──────────────────────────────────────────────────────────────────────
let callState = "idle"; // idle | connecting | active | ended
let timerInterval = null;
let callStartTime = null;

// ── DOM Elements ───────────────────────────────────────────────────────────────
const callCard = document.getElementById("call-card");
const statusBadge = document.getElementById("status-badge");
const statusText = statusBadge.querySelector(".status-text");
const avatarRing = document.getElementById("avatar-ring");
const callTitle = document.getElementById("call-title");
const callSubtitle = document.getElementById("call-subtitle");
const callTimer = document.getElementById("call-timer");
const timerText = document.getElementById("timer-text");
const volumeContainer = document.getElementById("volume-container");
const volumeLabel = document.getElementById("volume-label");
const callBtn = document.getElementById("call-btn");
const callBtnIcon = document.getElementById("call-btn-icon");
const callBtnText = document.getElementById("call-btn-text");
const transcriptArea = document.getElementById("transcript-area");
const transcriptMessages = document.getElementById("transcript-messages");
const pulseRings = [
  document.getElementById("pulse-1"),
  document.getElementById("pulse-2"),
  document.getElementById("pulse-3"),
];
const volBars = Array.from({ length: 9 }, (_, i) =>
  document.getElementById(`vol-${i + 1}`)
);

// ── Read query params (for shareable links) ────────────────────────────────────
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// ── UI State Machine ───────────────────────────────────────────────────────────
function setState(newState) {
  callState = newState;

  // Status badge
  statusBadge.setAttribute("data-state", newState);
  const stateLabels = {
    idle: "Ready",
    connecting: "Connecting...",
    active: "Live",
    ended: "Call Ended",
  };
  statusText.textContent = stateLabels[newState] || "Ready";

  // Call card glow
  callCard.classList.toggle("active", newState === "active");

  // Avatar ring
  avatarRing.classList.remove("speaking");

  // Pulse rings
  pulseRings.forEach((ring) => {
    ring.classList.toggle("active", newState === "active");
  });

  // Timer
  callTimer.classList.toggle("visible", newState === "active");

  // Volume bars
  volumeContainer.classList.toggle(
    "visible",
    newState === "active"
  );

  // Transcript
  if (transcriptArea) {
    transcriptArea.classList.toggle(
      "visible",
      newState === "active" || newState === "ended"
    );
  }

  // Button appearance
  callBtn.className = "call-btn";
  if (newState !== "idle") {
    callBtn.classList.add(newState);
  }

  switch (newState) {
    case "idle":
      callBtnIcon.innerHTML = phoneIconSVG;
      callBtnText.textContent = "Start Call";
      callSubtitle.textContent =
        "Click the button below to start your call";
      break;

    case "connecting":
      callBtnIcon.innerHTML = `<div class="spinner"></div>`;
      callBtnText.textContent = "Connecting...";
      callSubtitle.textContent = "Setting up your secure voice connection...";
      break;

    case "active":
      callBtnIcon.innerHTML = hangupIconSVG;
      callBtnText.textContent = "End Call";
      callSubtitle.textContent = "Your call is in progress";
      break;

    case "ended":
      callBtnIcon.innerHTML = phoneIconSVG;
      callBtnText.textContent = "Start New Call";
      callSubtitle.textContent = "Call ended. Click to start a new call.";
      stopTimer();
      break;
  }
}

// ── SVG Icons ──────────────────────────────────────────────────────────────────
const phoneIconSVG = `<svg viewBox="0 0 24 24" fill="none" class="phone-icon"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const hangupIconSVG = `<svg viewBox="0 0 24 24" fill="none" class="phone-icon"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.9.33 1.85.53 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.17.96.37 1.91.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

// ── Timer ───────────────────────────────────────────────────────────────────────
function startTimer() {
  callStartTime = Date.now();
  timerText.textContent = "00:00";
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    timerText.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ── Volume Visualization ────────────────────────────────────────────────────────
function updateVolumeBars(level) {
  // level is 0..1
  const count = Math.round(level * volBars.length);
  volBars.forEach((bar, i) => {
    const isActive = i < count;
    bar.classList.toggle("active", isActive);
    const baseHeight = 6;
    const maxAdditional = 26;
    if (isActive) {
      const height = baseHeight + Math.random() * maxAdditional * level;
      bar.style.height = `${height}px`;
    } else {
      bar.style.height = `${baseHeight}px`;
    }
  });
}

function resetVolumeBars() {
  volBars.forEach((bar) => {
    bar.classList.remove("active");
    bar.style.height = "6px";
  });
}

// ── Transcript ──────────────────────────────────────────────────────────────────
function addTranscript(role, text) {
  if (!transcriptMessages) return;
  // Remove placeholder if present
  const placeholder = transcriptMessages.querySelector(".transcript-placeholder");
  if (placeholder) placeholder.remove();

  const msg = document.createElement("div");
  msg.className = `transcript-msg ${role}`;
  msg.innerHTML = `
    <div class="msg-role">${role === "bot" ? "🤖 Assistant" : "🎤 You"}</div>
    <div class="msg-text">${escapeHtml(text)}</div>
  `;
  transcriptMessages.appendChild(msg);
  transcriptMessages.scrollTop = transcriptMessages.scrollHeight;
}

function clearTranscript() {
  if (!transcriptMessages) return;
  transcriptMessages.innerHTML = `<p class="transcript-placeholder">Conversation will appear here...</p>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Call Control ────────────────────────────────────────────────────────────────
async function startCall() {
  if (callState === "connecting" || callState === "active") return;

  setState("connecting");
  clearTranscript();

  try {
    const userName = getQueryParam("user");
    const overrides = {};

    if (userName) {
      overrides.variableValues = {
        user_name: userName,
      };
    }

    // SDK signature: vapi.start(assistantId: string, assistantOverrides?: object)
    await vapi.start(ASSISTANT_ID, overrides);
  } catch (error) {
    console.error("Failed to start call:", error);
    setState("idle");
    callSubtitle.textContent = `Failed to connect: ${error.message || "Unknown error"}`;
  }
}

function endCall() {
  if (callState !== "active" && callState !== "connecting") return;
  vapi.stop();
}

// ── Button Handler ──────────────────────────────────────────────────────────────
callBtn.addEventListener("click", () => {
  if (callState === "idle" || callState === "ended") {
    startCall();
  } else if (callState === "active") {
    endCall();
  }
});

// ── Vapi Event Listeners ────────────────────────────────────────────────────────

vapi.on("call-start", () => {
  console.log("✅ Call started");
  setState("active");
  startTimer();
});

vapi.on("call-end", () => {
  console.log("📞 Call ended");
  setState("ended");
  resetVolumeBars();
});

vapi.on("speech-start", () => {
  avatarRing.classList.add("speaking");
  volumeLabel.textContent = "Assistant speaking...";
});

vapi.on("speech-end", () => {
  avatarRing.classList.remove("speaking");
  volumeLabel.textContent = "Listening...";
});

vapi.on("volume-level", (level) => {
  updateVolumeBars(level);
});

vapi.on("message", (msg) => {
  if (msg.type === "transcript" && msg.transcriptType === "final") {
    addTranscript(msg.role === "assistant" ? "bot" : "user", msg.transcript);
  }
});

vapi.on("error", (error) => {
  console.error("Vapi error:", error);
  if (callState === "connecting") {
    setState("idle");
    callSubtitle.textContent = "Connection failed. Please try again.";
  }
});

// ── Initialize ──────────────────────────────────────────────────────────────────
setState("idle");

// If user param exists, show it
const userParam = getQueryParam("user");
if (userParam) {
  callTitle.textContent = `Welcome, ${userParam}`;
}

console.log("AU Bank Assistant — Frontend Ready");
