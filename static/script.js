// static/script.js — improved: auto-append stable predictions & avoid duplicates
document.addEventListener('DOMContentLoaded', () => {
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

  let currentMode = 'static';
  let pollInterval = null;

  // For stability detection before auto-appending
  let lastPolledPrediction = '';
  let stableCount = 0;
  const STABLE_THRESHOLD = 3; // must see same prediction this many times consecutively
  let lastAppendedPrediction = ''; // last prediction appended to textarea

  function setMode(mode) {
    currentMode = mode;
    videoImg.src = `/video_feed/${mode}`;
    staticBtn.classList.toggle('active', mode === 'static');
    dynamicBtn.classList.toggle('active', mode === 'dynamic');
    statusDiv.textContent = `Status: Mode set to ${mode}`;
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

          // Stability / auto-append logic
          if (p && p !== '') {
            if (p === lastPolledPrediction) {
              stableCount += 1;
            } else {
              stableCount = 1;
              lastPolledPrediction = p;
            }

            // If stable long enough and not already appended, append automatically
            if (stableCount >= STABLE_THRESHOLD && p !== lastAppendedPrediction) {
              // Append with a space separator
              if (translatedText.value) translatedText.value += ' ';
              translatedText.value += p;
              lastAppendedPrediction = p;
              statusDiv.textContent = `Status: Auto-appended "${p}"`;
            }
          } else {
            // no prediction; reset stability
            stableCount = 0;
            lastPolledPrediction = '';
          }
        })
        .catch(err => {
          liveSpan.textContent = 'error';
          // don't spam status on every error; set once
          statusDiv.textContent = 'Status: Error polling prediction';
        });
    }, 250);
  }

  // Manual append: explicitly fetch latest prediction and append if non-empty and not duplicate
  appendBtn.addEventListener('click', () => {
    fetch(`/current_prediction/${currentMode}`)
      .then(r => r.json())
      .then(j => {
        const p = (j.prediction || '').trim();
        if (!p) {
          statusDiv.textContent = 'Status: No prediction to append';
          return;
        }
        // Avoid appending exact duplicate immediately after auto-append.
        if (p === lastAppendedPrediction) {
          statusDiv.textContent = `Status: Prediction "${p}" already appended`;
          return;
        }
        if (translatedText.value) translatedText.value += ' ';
        translatedText.value += p;
        lastAppendedPrediction = p;
        statusDiv.textContent = `Status: Appended "${p}"`;
      })
      .catch(err => {
        statusDiv.textContent = 'Status: Failed to append prediction';
      });
  });

  speakBtn.addEventListener('click', () => {
    const text = translatedText.value.trim();
    if (!text) {
      alert('No text to speak.');
      return;
    }
    // Browser TTS (works in modern browsers)
    if ('speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
      statusDiv.textContent = 'Status: Speaking (browser TTS)';
      return;
    }
    // fallback to server-side TTS if browser doesn't support it
    fetch('/speak', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text})
    })
      .then(r => r.json())
      .then(j => {
        statusDiv.textContent = 'Status: Spoken (server TTS)';
      })
      .catch(err => {
        statusDiv.textContent = 'Status: TTS error';
      });
  });

  clearBtn.addEventListener('click', () => {
    translatedText.value = '';
    lastAppendedPrediction = '';
    statusDiv.textContent = 'Status: Cleared text';
  });

  staticBtn.addEventListener('click', () => setMode('static'));
  dynamicBtn.addEventListener('click', () => setMode('dynamic'));
  retrainBtn.addEventListener('click', () => {
    if (!confirm('Retrain both models now? This may take time.')) return;
    statusDiv.textContent = 'Status: Retraining...';
    fetch('/retrain', {method: 'POST'})
      .then(r => r.json())
      .then(j => {
        statusDiv.textContent = 'Status: Retraining finished. Models reloaded.';
        // reset appended prediction memory so same label can be appended after retrain
        lastAppendedPrediction = '';
      })
      .catch(err => {
        statusDiv.textContent = 'Status: Retrain error';
      });
  });

  // start default mode and polling
  setMode('static');
});
