/* ═══════════════════════════════════════════════════════════════════════════════
   Emaar Group — Sales & Scheduling Agent  |  Vapi Web SDK Integration
   ═══════════════════════════════════════════════════════════════════════════════ */

import Vapi from "@vapi-ai/web";

// ── Configuration ──────────────────────────────────────────────────────────────
const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY;
const ASSISTANT_ID = import.meta.env.VITE_ASSISTANT_ID;

const VAPI_PRIVATE_KEY = import.meta.env.VITE_VAPI_PRIVATE_KEY;

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

// Sidebar Elements
const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebar = document.getElementById("sidebar");
const sidebarCloseBtn = document.getElementById("sidebar-close");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const callListContainer = document.getElementById("call-list-container");
const transcriptDetailContainer = document.getElementById("transcript-detail-container");
const transcriptDetailContent = document.getElementById("transcript-detail-content");
const backToListBtn = document.getElementById("back-to-list");
const openFullscreenAnalysisBtn = document.getElementById("open-fullscreen-analysis-btn");

const fullscreenOverlay = document.getElementById("fullscreen-overlay");
const closeFullscreenBtn = document.getElementById("close-fullscreen-btn");
const fsTranscriptContent = document.getElementById("fs-transcript-content");
const fsAnalysisContent = document.getElementById("fs-analysis-content");

let currentDetailedCall = null;

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
  transcriptArea.classList.toggle(
    "visible",
    newState === "active" || newState === "ended"
  );

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
        "Click the button below to start your voice consultation";
      break;

    case "connecting":
      callBtnIcon.innerHTML = `<div class="spinner"></div>`;
      callBtnText.textContent = "Connecting...";
      callSubtitle.textContent = "Setting up your secure voice connection...";
      break;

    case "active":
      callBtnIcon.innerHTML = hangupIconSVG;
      callBtnText.textContent = "End Call";
      callSubtitle.textContent = "Your interview is in progress";
      break;

    case "ended":
      callBtnIcon.innerHTML = phoneIconSVG;
      callBtnText.textContent = "Start New Call";
      callSubtitle.textContent = "Call ended. Click to start a new consultation.";
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
    // Build overrides — pass user query param as variable if present
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
  // Handle transcript messages
  if (msg.type === "transcript") {
    if (msg.transcriptType === "final") {
      addTranscript(msg.role === "assistant" ? "bot" : "user", msg.transcript);
    }
  }
  // Handle conversation updates
  if (msg.type === "conversation-update" && msg.conversation) {
    // We already handle via transcript events, but this is a fallback
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

// ── Sidebar Logic ───────────────────────────────────────────────────────────────

function toggleSidebar(open) {
  if (open) {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("active");
    fetchCalls();
  } else {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");
    // Reset view
    callListContainer.style.display = "block";
    transcriptDetailContainer.style.display = "none";
  }
}

sidebarToggleBtn.addEventListener("click", () => toggleSidebar(true));
sidebarCloseBtn.addEventListener("click", () => toggleSidebar(false));
sidebarOverlay.addEventListener("click", () => toggleSidebar(false));

backToListBtn.addEventListener("click", () => {
  callListContainer.style.display = "block";
  transcriptDetailContainer.style.display = "none";
  currentDetailedCall = null;
});

openFullscreenAnalysisBtn.addEventListener("click", () => {
  if (currentDetailedCall) {
    // Populate the full screen transcript
    fsTranscriptContent.innerHTML = transcriptDetailContent.innerHTML;
    // Show overlay
    fullscreenOverlay.classList.add("active");
    // Fetch and populate analysis
    generatePythonAnalysis(currentDetailedCall);
  }
});

closeFullscreenBtn.addEventListener("click", () => {
  fullscreenOverlay.classList.remove("active");
});

async function fetchCalls() {
  if (!VAPI_PRIVATE_KEY) {
    callListContainer.innerHTML = `<p class="error-text">Missing VITE_VAPI_PRIVATE_KEY in .env file. Cannot fetch historical calls.</p>`;
    return;
  }

  callListContainer.innerHTML = `<p class="loading-text">Fetching historical calls...</p>`;
  
  try {
    const res = await fetch(`https://api.vapi.ai/call?assistantId=${ASSISTANT_ID}&limit=20`, {
      headers: {
        "Authorization": `Bearer ${VAPI_PRIVATE_KEY}`
      }
    });

    if (!res.ok) throw new Error("Failed to fetch calls");
    
    const calls = await res.json();
    renderCallList(calls);
  } catch (error) {
    callListContainer.innerHTML = `<p class="error-text">Error fetching calls: ${error.message}</p>`;
  }
}

function renderCallList(calls) {
  if (!calls || calls.length === 0) {
    callListContainer.innerHTML = `<p class="loading-text">No previous calls found for this assistant.</p>`;
    return;
  }

  callListContainer.innerHTML = "";
  calls.forEach(call => {
    // Show all ended calls (even if list API truncated the transcript)
    if (call.status !== "ended") return;

    const div = document.createElement("div");
    div.className = "call-list-item";
    
    const date = new Date(call.createdAt).toLocaleString();
    const durationStr = call.endedAt ? Math.round((new Date(call.endedAt) - new Date(call.createdAt))/1000) + "s" : "Unknown";

    div.innerHTML = `
      <h4>Call on ${date}</h4>
      <p>Status: ${call.status}</p>
      <div class="duration">Duration: ${durationStr}</div>
    `;

    div.addEventListener("click", () => showTranscriptDetail(call));
    callListContainer.appendChild(div);
  });

  if (callListContainer.children.length === 0) {
    callListContainer.innerHTML = `<p class="loading-text">No completed calls found yet.</p>`;
  }
}

async function showTranscriptDetail(listCall) {
  callListContainer.style.display = "none";
  transcriptDetailContainer.style.display = "flex";
  transcriptDetailContent.innerHTML = `<p class="loading-text">Loading full transcript...</p>`;
  
  try {
    // Fetch the individual call to ensure we get the complete transcript (list endpoint often truncates)
    const res = await fetch(`https://api.vapi.ai/call/${listCall.id}`, {
      headers: { "Authorization": `Bearer ${VAPI_PRIVATE_KEY}` }
    });
    if (!res.ok) throw new Error("Failed to fetch full call details");
    
    const call = await res.json();
    let html = "";

    // Prefer structured messages array if Vapi provides it
    if (call.messages && call.messages.length > 0) {
      const transcriptMessages = call.messages.filter(m => 
        (m.role === "user" || m.role === "assistant" || m.role === "bot") && 
        (m.message || m.content || m.transcript)
      );
      
      if (transcriptMessages.length > 0) {
        transcriptMessages.forEach(m => {
          const role = (m.role === "assistant" || m.role === "bot") ? "bot" : "user";
          const text = m.message || m.content || m.transcript;
          html += `
            <div class="transcript-msg ${role}">
              <div class="msg-role">${role === "bot" ? "🤖 Assistant" : "🎤 User"}</div>
              <div class="msg-text">${escapeHtml(text)}</div>
            </div>
          `;
        });
      }
    }

    // Fallback to parsing the transcript string if structured messages aren't available
    if (!html && call.transcript) {
      const lines = call.transcript.split('\n');
      lines.forEach(line => {
        if (!line.trim()) return;
        
        let role = "user";
        let text = line;
        
        if (line.toLowerCase().startsWith("ai:") || line.toLowerCase().startsWith("bot:") || line.toLowerCase().startsWith("assistant:")) {
          role = "bot";
          text = line.substring(line.indexOf(':') + 1).trim();
        } else if (line.toLowerCase().startsWith("user:") || line.toLowerCase().startsWith("human:")) {
          role = "user";
          text = line.substring(line.indexOf(':') + 1).trim();
        }
        
        html += `
          <div class="transcript-msg ${role}">
            <div class="msg-role">${role === "bot" ? "🤖 Assistant" : "🎤 User"}</div>
            <div class="msg-text">${escapeHtml(text)}</div>
          </div>
        `;
      });
    }

    if (!html) {
      html = `<p class="loading-text">No transcript available for this call.</p>`;
    }

    transcriptDetailContent.innerHTML = html;
    currentDetailedCall = call;
  } catch (error) {
    transcriptDetailContent.innerHTML = `<p class="error-text">Error loading transcript: ${error.message}</p>`;
  }
}

async function generatePythonAnalysis(call) {
  if (!call || !call.transcript) {
    fsAnalysisContent.innerHTML = `
      <div class="analysis-card">
        <h4>🚨 Call Status</h4>
        <p><strong>Call drops and no information gathered.</strong></p>
      </div>
    `;
    return;
  }

  fsAnalysisContent.innerHTML = `<p class="loading-text">Generating AI Analysis...</p>`;

  try {
    const res = await fetch("http://localhost:4444/analyze_transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: call.transcript })
    });

    if (!res.ok) throw new Error("Failed to fetch analysis from Python backend.");

    const analysis = await res.json();
    
    let html = "";
    
    // Status Card with Lead Type
    const isDropped = analysis.status.toLowerCase().includes("drop");
    
    let leadBadge = "";
    if (analysis.lead_type) {
      if (analysis.lead_type.includes("Hot")) {
        leadBadge = `<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 8px;">🔥 Hot Lead</span>`;
      } else if (analysis.lead_type.includes("Warm")) {
        leadBadge = `<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 8px;">☀️ Warm Lead</span>`;
      } else if (analysis.lead_type.includes("Cold")) {
        leadBadge = `<span style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 8px;">❄️ Cold Lead</span>`;
      }
    }

    html += `
      <div class="analysis-card">
        <h4>${isDropped ? '🚨' : '✅'} Call Status ${leadBadge}</h4>
        <p><strong>${escapeHtml(analysis.status)}</strong></p>
      </div>
    `;

    // Property Interest
    html += `
      <div class="analysis-card">
        <h4>🏢 Property Interest</h4>
        <p><strong>Location:</strong> ${escapeHtml(analysis.location)}</p>
        <p><strong>Property Type:</strong> ${escapeHtml(analysis.property_type)}</p>
        <p><strong>Budget:</strong> ${escapeHtml(analysis.budget)}</p>
      </div>
    `;

    // Booking Details
    if (analysis.customer_name !== "Not provided" || analysis.phone_number !== "Not provided") {
      html += `
        <div class="analysis-card">
          <h4>📅 Booking Details</h4>
          <p><strong>Name:</strong> ${escapeHtml(analysis.customer_name)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(analysis.phone_number)}</p>
        </div>
      `;
    }

    // AI Summary
    if (analysis.summary) {
      html += `
        <div class="analysis-card">
          <h4>📝 AI Summary</h4>
          <p style="white-space: pre-wrap; line-height: 1.5;">${escapeHtml(analysis.summary)}</p>
        </div>
      `;
    }

    fsAnalysisContent.innerHTML = html;
  } catch (err) {
    fsAnalysisContent.innerHTML = `
      <div class="analysis-card">
        <h4>❌ Error</h4>
        <p style="color: var(--danger);">${err.message}</p>
      </div>
    `;
  }
}

console.log("🏢 Emaar Group Sales & Scheduling Agent — Frontend Ready");
