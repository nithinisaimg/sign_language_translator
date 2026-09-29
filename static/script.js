// static/script.js — Interactive Greyscale & Mustard Yellow UI Logic
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Core
  const staticBtn = document.getElementById('staticBtn');
  const dynamicBtn = document.getElementById('dynamicBtn');
  const retrainBtn = document.getElementById('retrainBtn');
  const videoImg = document.getElementById('video');
  const liveSpan = document.getElementById('livePrediction');
  const translatedText = document.getElementById('translatedText');
  const appendBtn = document.getElementById('appendBtn');
  const speakBtn = document.getElementById('speakBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDiv = document.getElementById('status');

  // DOM Elements - Interactive Revamp
  const currentModeBadge = document.getElementById('currentModeBadge');
  const stabilityProgress = document.getElementById('stabilityProgress');
  const quickAppendBtn = document.getElementById('quickAppendBtn');
  const recentChipsContainer = document.getElementById('recentChips');
  const wordCount = document.getElementById('wordCount');
  const charCount = document.getElementById('charCount');
  const copyBtn = document.getElementById('copyBtn');
  const autoAppendToggle = document.getElementById('autoAppendToggle');
  const ttsRate = document.getElementById('ttsRate');
  const rateValue = document.getElementById('rateValue');
  const soundFxToggle = document.getElementById('soundFxToggle');
  const speakAnim = document.getElementById('speakAnim');
  const freezeBtn = document.getElementById('freezeBtn');
  const snapshotBtn = document.getElementById('snapshotBtn');
  const guideBtn = document.getElementById('guideBtn');
  const guideModal = document.getElementById('guideModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const guideGotItBtn = document.getElementById('guideGotItBtn');
  const toastContainer = document.getElementById('toastContainer');

  // State
  let currentMode = 'static';
  let pollInterval = null;
  let isFrozen = false;
  let lastPolledPrediction = '';
  let stableCount = 0;
  const STABLE_THRESHOLD = 3;
  let lastAppendedPrediction = '';
  const recentGesturesSet = [];

  // =========================================================================
  // AUDIO FX (Web Audio API - Zero External Dependencies)
  // =========================================================================
  const audioCtx = window.AudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;

  function playTone(frequency, type = 'sine', duration = 0.08, gain = 0.04) {
    if (!audioCtx || !soundFxToggle || !soundFxToggle.checked) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio context might be restricted before user interaction
    }
  }

  // =========================================================================
  // TOAST NOTIFICATIONS
  // =========================================================================
  function showToast(message, icon = '✓') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2400);
  }

  // =========================================================================
  // TEXTAREA STATS & RECENT CHIPS
  // =========================================================================
  function updateTextStats() {
    const text = translatedText.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = translatedText.value.length;
    if (wordCount) wordCount.textContent = words;
    if (charCount) charCount.textContent = chars;
  }

  function addRecentGesture(sign) {
    if (!sign || sign === '—' || sign === '?') return;
    const index = recentGesturesSet.indexOf(sign);
    if (index !== -1) {
      recentGesturesSet.splice(index, 1);
    }
    recentGesturesSet.unshift(sign);
    if (recentGesturesSet.length > 7) recentGesturesSet.pop();

    if (!recentChipsContainer) return;
    recentChipsContainer.innerHTML = '';
    recentGesturesSet.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = item;
      chip.title = `Click to append "${item}"`;
      chip.addEventListener('click', () => {
        appendToBuffer(item);
        playTone(600, 'triangle', 0.05);
      });
      recentChipsContainer.appendChild(chip);
    });
  }

  // =========================================================================
  // MODE SELECTION & POLLING
  // =========================================================================
  function setMode(mode) {
    currentMode = mode;
    if (!isFrozen) {
      videoImg.src = `/video_feed/${mode}?t=${Date.now()}`;
    }
    staticBtn.classList.toggle('active', mode === 'static');
    dynamicBtn.classList.toggle('active', mode === 'dynamic');
    
    if (currentModeBadge) {
      currentModeBadge.textContent = mode === 'static' ? 'STATIC ASL' : 'DYNAMIC SIGNS';
    }
    statusDiv.textContent = `Status: Active in ${mode.toUpperCase()} mode`;
    playTone(480, 'sine', 0.1);
    startPolling();
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(() => {
      fetch(`/current_prediction/${currentMode}`)
        .then(r => r.json())
        .then(j => {
          const p = (j.prediction || '').trim();
          liveSpan.textContent = p || '—';

          // Stability & Meter Visualizer
          if (p && p !== '') {
            if (p === lastPolledPrediction) {
              stableCount = Math.min(stableCount + 1, STABLE_THRESHOLD);
            } else {
              stableCount = 1;
              lastPolledPrediction = p;
            }

            const pct = Math.round((stableCount / STABLE_THRESHOLD) * 100);
            if (stabilityProgress) stabilityProgress.style.width = `${pct}%`;

            // Auto-append if enabled
            if (autoAppendToggle && autoAppendToggle.checked) {
              if (stableCount >= STABLE_THRESHOLD && p !== lastAppendedPrediction) {
                appendToBuffer(p);
                statusDiv.textContent = `Status: Auto-appended sign "${p}"`;
                playTone(720, 'sine', 0.06);
              }
            }
          } else {
            stableCount = 0;
            lastPolledPrediction = '';
            if (stabilityProgress) stabilityProgress.style.width = '0%';
          }
        })
        .catch(() => {
          liveSpan.textContent = '—';
          if (stabilityProgress) stabilityProgress.style.width = '0%';
        });
    }, 250);
  }

  // =========================================================================
  // BUFFER ACTIONS (APPEND, SPEAK, CLEAR, COPY)
  // =========================================================================
  function appendToBuffer(textToAppend) {
    if (!textToAppend) return;
    if (translatedText.value) {
      translatedText.value += ' ';
    }
    translatedText.value += textToAppend;
    lastAppendedPrediction = textToAppend;
    addRecentGesture(textToAppend);
    updateTextStats();
    showToast(`Appended "${textToAppend}"`);
    translatedText.scrollTop = translatedText.scrollHeight;
  }

  function manualAppend() {
    fetch(`/current_prediction/${currentMode}`)
      .then(r => r.json())
      .then(j => {
        const p = (j.prediction || '').trim();
        if (!p) {
          showToast('No sign detected to append', 'ℹ');
          statusDiv.textContent = 'Status: No sign detected';
          return;
        }
        appendToBuffer(p);
        playTone(560, 'sine', 0.08);
      })
      .catch(() => {
        showToast('Failed to read current prediction', '✕');
      });
  }

  appendBtn.addEventListener('click', manualAppend);
  if (quickAppendBtn) quickAppendBtn.addEventListener('click', manualAppend);

  // Speak Buffer (SpeechSynthesis with server fallback)
  speakBtn.addEventListener('click', () => {
    const text = translatedText.value.trim();
    if (!text) {
      showToast('No text in buffer to speak', 'ℹ');
      return;
    }

    if (speakAnim) speakAnim.classList.add('speaking');
    playTone(400, 'square', 0.05);

    if ('speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(text);
      if (ttsRate) {
        utt.rate = parseFloat(ttsRate.value) || 1.0;
      }
      utt.onstart = () => {
        if (speakAnim) speakAnim.classList.add('speaking');
        statusDiv.textContent = 'Status: Speaking...';
      };
      utt.onend = () => {
        if (speakAnim) speakAnim.classList.remove('speaking');
        statusDiv.textContent = 'Status: Finished speech';
      };
      utt.onerror = () => {
        if (speakAnim) speakAnim.classList.remove('speaking');
        statusDiv.textContent = 'Status: TTS Error';
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
      return;
    }

    // Fallback to backend /speak route
    fetch('/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
      .then(r => r.json())
      .then(() => {
        if (speakAnim) speakAnim.classList.remove('speaking');
        statusDiv.textContent = 'Status: Spoken (server TTS)';
      })
      .catch(() => {
        if (speakAnim) speakAnim.classList.remove('speaking');
        statusDiv.textContent = 'Status: TTS error';
      });
  });

  // Clear Buffer
  clearBtn.addEventListener('click', () => {
    if (!translatedText.value) return;
    translatedText.value = '';
    lastAppendedPrediction = '';
    updateTextStats();
    statusDiv.textContent = 'Status: Cleared text buffer';
    playTone(320, 'sine', 0.08);
    showToast('Buffer cleared');
  });

  // Copy Buffer
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = translatedText.value.trim();
      if (!text) {
        showToast('Buffer is empty', 'ℹ');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied text to clipboard!');
        playTone(650, 'sine', 0.06);
      }).catch(() => {
        showToast('Clipboard access denied', '✕');
      });
    });
  }

  // Rate range slider display
  if (ttsRate && rateValue) {
    ttsRate.addEventListener('input', () => {
      rateValue.textContent = `${parseFloat(ttsRate.value).toFixed(1)}x`;
    });
  }

  // Textarea input sync
  translatedText.addEventListener('input', updateTextStats);

  // Retrain Models
  retrainBtn.addEventListener('click', () => {
    if (!confirm('Retrain both models now? This may take some time.')) return;
    statusDiv.textContent = 'Status: Retraining models...';
    showToast('Retraining initiated...', '⟳');
    fetch('/retrain', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        statusDiv.textContent = 'Status: Retraining finished. Models reloaded.';
        lastAppendedPrediction = '';
        showToast('Models reloaded successfully!');
      })
      .catch(() => {
        statusDiv.textContent = 'Status: Retrain error';
        showToast('Retraining failed', '✕');
      });
  });

  // =========================================================================
  // CAMERA STREAM CONTROLS (FREEZE & SNAPSHOT)
  // =========================================================================
  if (freezeBtn) {
    freezeBtn.addEventListener('click', () => {
      isFrozen = !isFrozen;
      if (isFrozen) {
        videoImg.src = '';
        freezeBtn.querySelector('span').textContent = 'Resume';
        statusDiv.textContent = 'Status: Camera feed paused';
      } else {
        videoImg.src = `/video_feed/${currentMode}?t=${Date.now()}`;
        freezeBtn.querySelector('span').textContent = 'Pause';
        statusDiv.textContent = 'Status: Camera feed resumed';
      }
    });
  }

  if (snapshotBtn) {
    snapshotBtn.addEventListener('click', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoImg.naturalWidth || 640;
        canvas.height = videoImg.naturalHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoImg, 0, 0, canvas.width, canvas.height);
        const link = document.createElement('a');
        link.download = `asl_snapshot_${Date.now()}.jpg`;
        link.href = canvas.toDataURL('image/jpeg');
        link.click();
        showToast('Snapshot saved!');
        playTone(700, 'sine', 0.1);
      } catch (e) {
        showToast('Snapshot captured', '📷');
      }
    });
  }

  // =========================================================================
  // ASL SIGNS GUIDE MODAL
  // =========================================================================
  function openGuide() {
    if (guideModal) guideModal.classList.add('open');
  }
  function closeGuide() {
    if (guideModal) guideModal.classList.remove('open');
  }

  if (guideBtn) guideBtn.addEventListener('click', openGuide);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeGuide);
  if (guideGotItBtn) guideGotItBtn.addEventListener('click', closeGuide);
  if (guideModal) {
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) closeGuide();
    });
  }

  // =========================================================================
  // KEYBOARD SHORTCUTS
  // =========================================================================
  window.addEventListener('keydown', (e) => {
    // If modal is open, Escape closes it
    if (e.key === 'Escape' && guideModal && guideModal.classList.contains('open')) {
      closeGuide();
      return;
    }

    // Ignore single key navigation when typing in the textarea
    const isTyping = document.activeElement === translatedText;

    if (!isTyping) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        manualAppend();
      } else if (e.key === '1') {
        setMode('static');
      } else if (e.key === '2') {
        setMode('dynamic');
      } else if (e.key === 'c' || e.key === 'C') {
        if (copyBtn) copyBtn.click();
      } else if (e.key === 'Escape') {
        clearBtn.click();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        speakBtn.click();
      }
    } else {
      // While typing in textarea: Ctrl+Enter or Cmd+Enter speaks
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        speakBtn.click();
      }
    }
  });

  // Buttons toggle setup
  staticBtn.addEventListener('click', () => setMode('static'));
  dynamicBtn.addEventListener('click', () => setMode('dynamic'));

  // Start with default static mode
  setMode('static');
  updateTextStats();
});
