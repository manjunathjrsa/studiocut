/**
 * StudioCut — Text-Based Editing (TBE) Panel
 * Interactive transcript synchronized with playback, word-level time scrubbing,
 * ripple-cutting timeline clips by deleting transcript text, and automated filler word removal.
 */

class TextEditorPanel {
  constructor() {
    this.container = null;
    this.transcriptWords = []; // Array<{ word, start, end, id, selected }>
    this.selectedWordIds = new Set();
    this.searchQuery = '';
    this.fillerWords = new Set(['um', 'uh', 'er', 'ah', 'like', 'actually', 'basically']);
  }

  init(container) {
    this.container = container;
    this._buildUI();
    this._attachEvents();

    // Listen to playhead changes to highlight active word
    store.on('playback.currentTime', (time) => {
      this._updateActiveWordHighlight(time);
    });
  }

  _buildUI() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="text-editor-panel" id="textEditorPanel">
        <!-- Toolbar -->
        <div class="tbe-toolbar">
          <div class="tbe-search-box">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" class="tbe-search-input" id="tbeSearchInput" placeholder="Search transcript...">
          </div>

          <div class="tbe-toolbar-actions">
            <button class="btn btn--secondary btn--xs" id="tbeDetectFillersBtn" title="Detect & highlight filler words">
              ⚡ Detect Fillers
            </button>
            <button class="btn btn--danger btn--xs" id="tbeRippleCutSelectedBtn" title="Ripple cut selected words from timeline">
              ✂ Ripple Cut
            </button>
            <button class="btn btn--ghost btn--xs" id="tbeTranscribeBtn" title="Generate transcript from timeline">
              🎙 Transcribe
            </button>
          </div>
        </div>

        <!-- Transcript Content Area -->
        <div class="tbe-body" id="tbeBody">
          <div class="tbe-empty-state" id="tbeEmptyState">
            <div class="tbe-empty-icon">📝</div>
            <div class="tbe-empty-title">Text-Based Editing</div>
            <div class="tbe-empty-text">Click "Transcribe" or select a clip to generate interactive text. Edit your video simply by deleting words!</div>
            <button class="btn btn--primary btn--sm" id="tbeInitialTranscribeBtn">Transcribe Timeline</button>
          </div>

          <div class="tbe-transcript-view" id="tbeTranscriptView" style="display:none;">
            <!-- Rendered paragraphs and word tokens -->
          </div>
        </div>

        <!-- Status footer -->
        <div class="tbe-footer">
          <span id="tbeWordCount">0 words</span>
          <span class="tbe-footer-separator">|</span>
          <span id="tbeSelectedCount">0 selected</span>
          <div class="tbe-spacer"></div>
          <button class="btn btn--ghost btn--xs" id="tbeRemovePausesBtn">Remove Pauses (>1s)</button>
        </div>
      </div>
    `;
  }

  _attachEvents() {
    const searchInput = this.container.querySelector('#tbeSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.render();
    });

    const transcribeBtn = this.container.querySelector('#tbeTranscribeBtn');
    const initialTranscribeBtn = this.container.querySelector('#tbeInitialTranscribeBtn');
    const handleTranscribe = async () => {
      await this.transcribeCurrentTimeline();
    };
    transcribeBtn?.addEventListener('click', handleTranscribe);
    initialTranscribeBtn?.addEventListener('click', handleTranscribe);

    const detectFillersBtn = this.container.querySelector('#tbeDetectFillersBtn');
    detectFillersBtn?.addEventListener('click', () => {
      this.highlightFillerWords();
    });

    const rippleCutBtn = this.container.querySelector('#tbeRippleCutSelectedBtn');
    rippleCutBtn?.addEventListener('click', () => {
      this.rippleCutSelectedWords();
    });

    const removePausesBtn = this.container.querySelector('#tbeRemovePausesBtn');
    removePausesBtn?.addEventListener('click', () => {
      this.removePauses();
    });
  }

  /**
   * Transcribe the currently selected clip or the whole active timeline
   */
  async transcribeCurrentTimeline() {
    const state = store.getState();
    const selectedIds = state.selection.clipIds;
    let targetClip = null;

    if (selectedIds && selectedIds.length > 0) {
      targetClip = Actions.getClip(selectedIds[0]);
    }

    if (!targetClip) {
      // Pick first video or audio clip
      for (const t of state.tracks) {
        if (t.clips.length > 0) {
          targetClip = t.clips[0];
          break;
        }
      }
    }

    if (!targetClip) {
      alert('Please add or select a clip on the timeline to transcribe.');
      return;
    }

    const emptyState = this.container.querySelector('#tbeEmptyState');
    const transcriptView = this.container.querySelector('#tbeTranscriptView');
    if (emptyState) emptyState.style.display = 'none';
    if (transcriptView) transcriptView.style.display = 'block';

    transcriptView.innerHTML = `<div class="tbe-loading"><div class="spinner"></div> Transcribing audio tracks...</div>`;

    const captions = await window.autoCaptionsEngine.transcribeClip(targetClip);

    // Flatten all words with unique IDs
    this.transcriptWords = [];
    captions.forEach(cap => {
      (cap.words || []).forEach(w => {
        this.transcriptWords.push({
          id: 'word_' + MathUtils.generateId(),
          word: w.word,
          start: w.start,
          end: w.end,
          selected: false,
          isFiller: this.fillerWords.has(w.word.toLowerCase().replace(/[^a-z]/g, ''))
        });
      });
    });

    this.render();
  }

  /**
   * Render interactive word tokens
   */
  render() {
    const view = this.container.querySelector('#tbeTranscriptView');
    if (!view) return;

    if (this.transcriptWords.length === 0) {
      view.innerHTML = '<div class="tbe-empty-text" style="padding:20px;">No transcript data available.</div>';
      return;
    }

    let html = '<div class="tbe-paragraph">';
    let prevEnd = -1;

    this.transcriptWords.forEach((w, idx) => {
      // Detect long pause (> 1.0s) between words and show silence pill
      if (prevEnd !== -1 && w.start - prevEnd > 0.9) {
        const pauseSec = (w.start - prevEnd).toFixed(1);
        html += `<span class="tbe-pause-pill" data-pause-start="${prevEnd}" data-pause-end="${w.start}" title="Silence: ${pauseSec}s">[pause ${pauseSec}s]</span> `;
      }
      prevEnd = w.end;

      const isSelected = this.selectedWordIds.has(w.id);
      const isSearchMatch = this.searchQuery && w.word.toLowerCase().includes(this.searchQuery);
      const isFiller = w.isFiller;

      let classes = ['tbe-word'];
      if (isSelected) classes.push('tbe-word--selected');
      if (isSearchMatch) classes.push('tbe-word--highlight');
      if (isFiller) classes.push('tbe-word--filler');

      html += `<span class="${classes.join(' ')}" data-id="${w.id}" data-start="${w.start}" data-end="${w.end}">${w.word}</span> `;
    });

    html += '</div>';
    view.innerHTML = html;

    // Attach click and selection listeners
    const wordEls = view.querySelectorAll('.tbe-word');
    wordEls.forEach(el => {
      el.addEventListener('click', (e) => {
        const id = el.dataset.id;
        const start = parseFloat(el.dataset.start);

        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          // Multi-select
          if (this.selectedWordIds.has(id)) this.selectedWordIds.delete(id);
          else this.selectedWordIds.add(id);
        } else {
          // Single click: seek playhead
          this.selectedWordIds.clear();
          this.selectedWordIds.add(id);
          store.set('playback.currentTime', start);
        }
        this._updateSelectionUI();
      });
    });

    // Pause pill click: jump playhead to pause
    const pausePills = view.querySelectorAll('.tbe-pause-pill');
    pausePills.forEach(pill => {
      pill.addEventListener('click', () => {
        const pStart = parseFloat(pill.dataset.pauseStart);
        store.set('playback.currentTime', pStart);
      });
    });

    this._updateCounters();
  }

  _updateSelectionUI() {
    const wordEls = this.container.querySelectorAll('.tbe-word');
    wordEls.forEach(el => {
      const isSelected = this.selectedWordIds.has(el.dataset.id);
      el.classList.toggle('tbe-word--selected', isSelected);
    });
    this._updateCounters();
  }

  _updateCounters() {
    const wordCountEl = this.container.querySelector('#tbeWordCount');
    const selectedCountEl = this.container.querySelector('#tbeSelectedCount');
    if (wordCountEl) wordCountEl.textContent = `${this.transcriptWords.length} words`;
    if (selectedCountEl) selectedCountEl.textContent = `${this.selectedWordIds.size} selected`;
  }

  _updateActiveWordHighlight(currentTime) {
    const wordEls = this.container.querySelectorAll('.tbe-word');
    wordEls.forEach(el => {
      const start = parseFloat(el.dataset.start);
      const end = parseFloat(el.dataset.end);
      const isCurrent = currentTime >= start && currentTime <= end;
      el.classList.toggle('tbe-word--active-playhead', isCurrent);
      if (isCurrent) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  /**
   * Automatically select all detected filler words
   */
  highlightFillerWords() {
    this.selectedWordIds.clear();
    this.transcriptWords.forEach(w => {
      if (w.isFiller) {
        this.selectedWordIds.add(w.id);
      }
    });
    this._updateSelectionUI();
  }

  /**
   * Ripple cut selected words directly on the timeline
   */
  rippleCutSelectedWords() {
    if (this.selectedWordIds.size === 0) {
      alert('Please select words in the transcript to ripple cut.');
      return;
    }

    // Determine continuous time intervals of selected words
    const selectedWords = this.transcriptWords.filter(w => this.selectedWordIds.has(w.id));
    if (selectedWords.length === 0) return;

    // Sort by start time descending so cutting later parts doesn't shift earlier parts
    selectedWords.sort((a, b) => b.start - a.start);

    // Group adjacent words into cut intervals [start, end]
    const intervals = [];
    selectedWords.forEach(w => {
      const existing = intervals.find(inv => Math.abs(inv.start - w.end) < 0.1 || Math.abs(w.start - inv.end) < 0.1);
      if (existing) {
        existing.start = Math.min(existing.start, w.start);
        existing.end = Math.max(existing.end, w.end);
      } else {
        intervals.push({ start: w.start, end: w.end });
      }
    });

    // Execute cuts and ripple delete for each interval
    intervals.forEach(inv => {
      this._rippleCutInterval(inv.start, inv.end);
    });

    // Remove deleted words from transcript
    this.transcriptWords = this.transcriptWords.filter(w => !this.selectedWordIds.has(w.id));
    this.selectedWordIds.clear();
    this.render();
  }

  /**
   * Ripple-cuts an interval [startTime, endTime] across all timeline tracks
   */
  _rippleCutInterval(startTime, endTime) {
    const cutDuration = endTime - startTime;
    if (cutDuration <= 0) return;

    const state = store.getState();

    state.tracks.forEach(track => {
      if (track.locked) return;

      const clipsToProcess = [...track.clips];
      clipsToProcess.forEach(clip => {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        // Check if interval overlaps clip
        if (startTime < clipEnd && endTime > clipStart) {
          if (startTime > clipStart && endTime < clipEnd) {
            // Cut in middle: split twice and delete center
            Actions.splitClip(clip.id, startTime);
            const secondPart = track.clips.find(c => Math.abs(c.startTime - startTime) < 0.01);
            if (secondPart) {
              Actions.splitClip(secondPart.id, endTime);
              Actions.deleteClip(secondPart.id, true);
            }
          } else if (startTime <= clipStart && endTime >= clipEnd) {
            // Whole clip enclosed: delete clip with ripple
            Actions.deleteClip(clip.id, true);
          } else if (startTime <= clipStart) {
            // Trims head
            const trimAmount = endTime - clipStart;
            clip.startTime = clipStart + trimAmount;
            clip.duration = Math.max(0.1, clip.duration - trimAmount);
            clip.sourceStartTime += trimAmount;
          } else if (endTime >= clipEnd) {
            // Trims tail
            const newDuration = startTime - clipStart;
            clip.duration = Math.max(0.1, newDuration);
          }
        }
      });
    });

    Actions._recalculateDuration();
    store._emit('tracks', store.getState().tracks);
  }

  /**
   * One-click removal of dead air pauses
   */
  removePauses(minPauseDuration = 0.9) {
    let prevEnd = -1;
    let cutCount = 0;

    for (let i = 0; i < this.transcriptWords.length; i++) {
      const w = this.transcriptWords[i];
      if (prevEnd !== -1 && w.start - prevEnd > minPauseDuration) {
        this._rippleCutInterval(prevEnd + 0.1, w.start - 0.1);
        cutCount++;
      }
      prevEnd = w.end;
    }

    if (cutCount > 0) {
      alert(`Removed ${cutCount} long pauses from timeline.`);
      this.transcribeCurrentTimeline();
    } else {
      alert('No silent pauses > 1.0s detected.');
    }
  }
}

window.textEditorPanel = new TextEditorPanel();
