import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasSequencer } from './components/CanvasSequencer';
import { ArrangementView } from './components/ArrangementView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { NodalInterface } from './components/NodalInterface';
import type { Note, RowConfig, Grid, FXGraph } from './types';
import { STEPS_PER_PATTERN, SCALES, FREQS, DEFAULT_DRUM_ROWS, PRESETS, CHROMATIC_LABELS } from './constants';
import { audioEngine } from './audioEngine';

const generateBlankGrid = (rows: number) => {
  return Array(rows).fill(null).map(() => Array(STEPS_PER_PATTERN).fill(null));
};

const initialFXGraph: FXGraph = {
  nodes: [
    { id: 'src', type: 'source', x: 100, y: 300, params: {} },
    { id: 'out', type: 'output', x: 800, y: 300, params: {} }
  ],
  connections: [
    { source: 'src', target: 'out' }
  ],
  nextId: 1
};

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [currentScale, setCurrentScale] = useState('C Maj Pent');
  const [editingTrackIndex, setEditingTrackIndex] = useState(0);
  const [editingPatternIndex, setEditingPatternIndex] = useState(0);
  const [playbackStep, setPlaybackStep] = useState(0);
  const [playbackPatternIndex, setPlaybackPatternIndex] = useState(0);
  const [queuedPatternIndex, setQueuedPatternIndex] = useState<number>(-1);
  const [loopLockedPatternIndex, setLoopLockedPatternIndex] = useState<number>(-1);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const [isUnrolled, setIsUnrolled] = useState(false);
  const [masterVolume] = useState(0.8);
  const [viewMode, setViewMode] = useState<'sequencer' | 'node' | 'spreadsheet'>('sequencer');
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [snap, setSnap] = useState<1 | 2 | 4>(1);
  const [isArrOpen, setIsArrOpen] = useState(window.innerHeight > 750);

  // History state
  const [history, setHistory] = useState<{ song: Grid[][], fxGraph: FXGraph }[]>([]);
  const [redoStack, setRedoStack] = useState<{ song: Grid[][], fxGraph: FXGraph }[]>([]);
  // Layout state
  const [arrHeight, setArrHeight] = useState(180);
  const [isResizingArr, setIsResizingArr] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<{ r: number, c: number }[]>([]);

  // FX state
  const [fxGraph, setFxGraph] = useState<FXGraph>(() => {
    const saved = localStorage.getItem('pulse_fx_graph');
    return saved ? JSON.parse(saved) : initialFXGraph;
  });
  const [lastCommittedGraph, setLastCommittedGraph] = useState<FXGraph>(fxGraph);

  // Audio state
  const [song, setSong] = useState<Grid[][]>(() => {
    const saved = localStorage.getItem('pulse_song');
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error("Invalid song format");

        // Level 1: Ensure it's 2D (Tracks -> Patterns -> Grid)
        // If it's 1D (Patterns -> Grid), wrap it in one track
        // We check if parsed[0][0][0] is an array. If not, it's 1D.
        if (parsed.length > 0 && Array.isArray(parsed[0]) && Array.isArray(parsed[0][0]) && !Array.isArray(parsed[0][0][0])) {
          parsed = [parsed];
        }

        // Level 2: Fix any corruption where a track might have been flattened to a Grid
        // (Due to the old bugged handleRemix)
        if (Array.isArray(parsed)) {
          parsed = parsed.map(track => {
            if (Array.isArray(track) && track.length > 0 && !Array.isArray(track[0][0])) {
              // This "track" is actually a single Grid. Wrap it back.
              return [track];
            }
            return track;
          });
        }

        return parsed as Grid[][];
      } catch (e) {
        console.warn("Song Load Failed, resetting:", e);
      }
    }
    return [[generateBlankGrid((isUnrolled ? 13 : 8) + DEFAULT_DRUM_ROWS.length)]];
  });
  const playbackStepRef = useRef(0);
  const playbackPatternRef = useRef(0);
  const queuedPatternRef = useRef(-1);
  const loopLockedPatternRef = useRef(-1);
  const isFollowModeRef = useRef(true);
  const songRef = useRef<Grid[][]>(song);
  const bpmRef = useRef(bpm);
  const rowConfigsRef = useRef<RowConfig[]>([]);

  // Dragging state for layout
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);

  const commitToHistory = useCallback((newSong: Grid[][] = song, newGraph: FXGraph = fxGraph) => {
    setHistory(prev => [...prev.slice(-19), { song, fxGraph: lastCommittedGraph }]);
    setRedoStack([]);
    setSong(newSong);
    setFxGraph(newGraph);
    setLastCommittedGraph(newGraph);
  }, [song, fxGraph, lastCommittedGraph]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(prevRedo => [...prevRedo, { song, fxGraph: lastCommittedGraph }]);
    setHistory(prevHist => prevHist.slice(0, -1));
    setSong(prev.song);
    setFxGraph(prev.fxGraph);
    setLastCommittedGraph(prev.fxGraph);
  }, [history, song, fxGraph, lastCommittedGraph]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prevHist => [...prevHist, { song, fxGraph: lastCommittedGraph }]);
    setRedoStack(prevRedo => prevRedo.slice(0, -1));
    setSong(next.song);
    setFxGraph(next.fxGraph);
    setLastCommittedGraph(next.fxGraph);
  }, [redoStack, song, fxGraph, lastCommittedGraph]);


  const [hasStarted, setHasStarted] = useState(false);
  const timerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);

  const rowConfigs = useCallback((): RowConfig[] => {
    const labels = isUnrolled ? CHROMATIC_LABELS : (SCALES[currentScale]?.labels || SCALES['C Maj Pent'].labels);
    const synthRows = labels.map((label: string) => ({
      label,
      color: 'bg-sky-500/5',
      activeColor: 'bg-sky-500',
      freq: FREQS[label] || 261.63,
      gain: 0.8,
      type: 'synth' as const
    }));
    return [...synthRows, ...DEFAULT_DRUM_ROWS];
  }, [currentScale, isUnrolled]);

  const previewNote = useCallback((r: number, note?: Note) => {
    audioEngine.init();
    audioEngine.resume();
    const config = rowConfigs()[r];
    const time = audioEngine.ctx!.currentTime;
    const freq = config.type === 'synth' ? config.freq * Math.pow(2, note?.oct || 0) : config.freq;

    if (config.type === 'synth') {
      audioEngine.createSynth(freq, time, 0.5, bpm, config.gain);
    } else if (config.type === 'kick') audioEngine.createKick(time, config.gain);
    else if (config.type === 'snare') audioEngine.createSnare(time, config.gain);
    else if (config.type === 'hat') audioEngine.createHiHat(time, config.gain);
  }, [rowConfigs, bpm]);

  const addNote = (r: number, c: number, d: number = 1, data?: Partial<Note>) => {
    const newSong = [...song];
    const track = [...newSong[editingTrackIndex]];
    const grid = [...track[editingPatternIndex]];
    const row = [...grid[r]];
    const note = { d: Math.max(1, Math.round(d)), o: 0, ...data };
    row[c] = note;
    grid[r] = row;
    track[editingPatternIndex] = grid;
    newSong[editingTrackIndex] = track;
    commitToHistory(newSong);
    previewNote(r, note);
  };

  const toggleNote = (r: number, c: number) => {
    const newSong = [...song];
    const track = [...newSong[editingTrackIndex]];
    const grid = [...track[editingPatternIndex]];
    const row = [...grid[r]];
    if (row[c]) {
      row[c] = null;
    } else {
      const note = { d: 1, o: 0 };
      row[c] = note;
      previewNote(r, note);
    }
    grid[r] = row;
    track[editingPatternIndex] = grid;
    newSong[editingTrackIndex] = track;
    commitToHistory(newSong);
  };

  const insertPattern = (atIndex: number) => {
    const newSong = song.map(track => {
      const newTrack = [...track];
      newTrack.splice(atIndex, 0, generateBlankGrid(rowConfigs().length));
      return newTrack;
    });
    setSong(newSong);
    setEditingPatternIndex(atIndex);
  };

  const deletePattern = (index: number) => {
    if (song[0].length <= 1) return;
    const newSong = song.map(track => track.filter((_, i) => i !== index));
    setSong(newSong);
    setEditingPatternIndex(Math.max(0, Math.min(editingPatternIndex, newSong[0].length - 1)));
  };

  const duplicatePattern = useCallback((index: number) => {
    const newSong = song.map(track => {
      const newTrack = [...track];
      const patternToDup = JSON.parse(JSON.stringify(track[index]));
      newTrack.splice(index + 1, 0, patternToDup);
      return newTrack;
    });
    setSong(newSong);
    setEditingPatternIndex(index + 1);
  }, [song, editingTrackIndex]);

  const addTrack = () => {
    const patternCount = song[0].length;
    const newTrack = Array(patternCount).fill(null).map(() => generateBlankGrid(rowConfigs().length));
    const newSong = [...song, newTrack];
    setSong(newSong);
    setEditingTrackIndex(newSong.length - 1);
    setToast({ message: "New Track Added", visible: true });

    // Dynamic Resizing: Header (~45px) + Tracks (~81px each) + Add Button Area (~70px)
    const approximateTrackHeight = 82;
    const extraSpace = 120; // Header + Footer padding
    const desiredHeight = (newSong.length * approximateTrackHeight) + extraSpace;
    const maxHeight = window.innerHeight * 0.5;
    setArrHeight(Math.min(desiredHeight, maxHeight));
  };

  const handleCommitMultiNote = useCallback((notes: { fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note> }[]) => {
    setSong(prevSong => {
      const newSong = JSON.parse(JSON.stringify(prevSong)); // Deep clone for safety
      const track = newSong[editingTrackIndex];
      const grid = track[editingPatternIndex];

      // Sort notes to prevent overwriting issues if movements overlap in complex ways
      // But for simple translations, we can just clear then set
      notes.forEach(({ fromR, fromC }) => {
        grid[fromR][fromC] = null;
      });

      notes.forEach(({ fromR, fromC, toR, toC, data }) => {
        const originalNote = prevSong[editingTrackIndex][editingPatternIndex][fromR][fromC];
        if (originalNote) {
          grid[toR][toC] = { ...originalNote, ...data };
        }
      });

      commitToHistory(newSong);
      return newSong;
    });

    // Update selection to match new positions
    setSelectedNotes(notes.map(m => ({ r: m.toR, c: m.toC })));
    setToast({ message: `Moved ${notes.length} notes`, visible: true });
  }, [editingTrackIndex, editingPatternIndex, commitToHistory]);

  const handleCommitNote = useCallback((fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note>) => {
    setSong(prevSong => {
      const newSong = [...prevSong];
      const track = [...newSong[editingTrackIndex]];
      const currentGrid = [...track[editingPatternIndex]];
      const note = currentGrid[fromR][fromC];
      if (!note) return prevSong;

      if (fromR !== toR || fromC !== toC) {
        currentGrid[fromR] = [...currentGrid[fromR]];
        currentGrid[fromR][fromC] = null;
      }

      const updatedNote = { ...note, ...data };
      currentGrid[toR] = [...currentGrid[toR]];
      currentGrid[toR][toC] = updatedNote;

      track[editingPatternIndex] = currentGrid;
      newSong[editingTrackIndex] = track;
      return newSong;
    });
    previewNote(toR, { ...data, d: data.d || 1, o: data.o || 0 });
  }, [editingTrackIndex, editingPatternIndex, previewNote]);

  const handleUpdateNote = useCallback((r: number, c: number, data: Partial<Note>) => {
    setSong(prevSong => {
      const newSong = [...prevSong];
      const track = [...newSong[editingTrackIndex]];
      const currentGrid = [...track[editingPatternIndex]];
      const note = currentGrid[r][c];
      if (!note) return prevSong;

      currentGrid[r] = [...currentGrid[r]];
      currentGrid[r][c] = { ...note, ...data };

      track[editingPatternIndex] = currentGrid;
      newSong[editingTrackIndex] = track;
      return newSong;
    });
  }, [editingTrackIndex, editingPatternIndex]);

  const handleRemix = () => {
    const keys = Object.keys(PRESETS);
    const style = keys[Math.floor(Math.random() * keys.length)];
    const preset = PRESETS[style];
    const newGrid = generateBlankGrid(rowConfigs().length);
    const hatRow = newGrid.length - 3;
    const snareRow = newGrid.length - 2;
    const kickRow = newGrid.length - 1;

    if (preset.kick) preset.kick.forEach((s: number) => newGrid[kickRow][s] = { d: 1, o: 0 });
    if (preset.snare) preset.snare.forEach((s: number) => newGrid[snareRow][s] = { d: 1, o: 0 });
    if (preset.hat) preset.hat.forEach((s: number) => newGrid[hatRow][s] = { d: 1, o: 0 });

    if (preset.bass) {
      const synthRowsCount = rowConfigs().length - DEFAULT_DRUM_ROWS.length;
      preset.bass.forEach((s: number) => {
        if (Math.random() > 0.5) newGrid[synthRowsCount - 1][s] = { d: 1, o: 0 };
      });
    }

    const newSong = [...song];
    const track = [...newSong[editingTrackIndex]];
    track[editingPatternIndex] = newGrid;
    newSong[editingTrackIndex] = track;
    commitToHistory(newSong);
    setToast({ message: `Style: ${style}`, visible: true });
  };

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setToast({ message: "CLICK AGAIN TO NUCLEAR RESET", visible: true });
      setTimeout(() => setResetArmed(false), 5000); // 5 sec window
      return;
    }

    // NUCLEAR RESET - TOTAL WIPE (Preserving Undo)
    const emptySong = [[generateBlankGrid((isUnrolled ? 13 : 8) + DEFAULT_DRUM_ROWS.length)]];

    setEditingTrackIndex(0);
    setEditingPatternIndex(0);
    setPlaybackPatternIndex(0);
    setViewMode('sequencer');
    setResetArmed(false);
    setArrHeight(180);

    commitToHistory(emptySong, {
      nodes: [
        { id: 'src', type: 'source', x: 100, y: 300, params: {} },
        { id: 'out', type: 'output', x: 800, y: 300, params: {} }
      ],
      connections: [
        { source: 'src', target: 'out' }
      ],
      nextId: 1
    });

    setToast({ message: "SYSTEM WIPED - UNDO PRESERVED", visible: true });

    // Force cleanup of any lingering audio state if possible
    audioEngine.init();
  }, [resetArmed, isUnrolled, commitToHistory, initialFXGraph]);

  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2000);
      return () => clearTimeout(timer);
    }
  }, [toast.visible]);

  const scheduler = useCallback(() => {
    if (!audioEngine.ctx) return;

    try {
      let loopCount = 0;
      const MAX_STEPS_PER_TICK = 16;

      while (nextNoteTimeRef.current < audioEngine.ctx.currentTime + 0.1 && loopCount < MAX_STEPS_PER_TICK) {
        loopCount++;
        const currentStep = playbackStepRef.current;
        const currentPattern = playbackPatternRef.current;
        const currentSong = songRef.current;
        const currentRowConfigs = rowConfigsRef.current;
        const currentBpm = bpmRef.current;

        // Play all tracks for this step/pattern
        currentSong.forEach(track => {
          if (track[currentPattern]) {
            audioEngine.playStep(track[currentPattern], currentStep, nextNoteTimeRef.current, currentRowConfigs, currentBpm);
          }
        });
        const secondsPerStep = 60.0 / currentBpm / 4;
        nextNoteTimeRef.current += secondsPerStep;

        let nextStep = currentStep + 1;
        let nextPattern = currentPattern;
        if (nextStep >= STEPS_PER_PATTERN) {
          nextStep = 0;
          if (queuedPatternRef.current !== -1) {
            nextPattern = queuedPatternRef.current;
            queuedPatternRef.current = -1;
            setQueuedPatternIndex(-1);
          } else if (loopLockedPatternRef.current !== -1) {
            nextPattern = loopLockedPatternRef.current;
          } else {
            nextPattern = (currentPattern + 1) % currentSong[0].length;
          }
          if (isFollowModeRef.current) setEditingPatternIndex(nextPattern);
          playbackPatternRef.current = nextPattern;
          setPlaybackPatternIndex(nextPattern);
        }
        playbackStepRef.current = nextStep;
        setPlaybackStep(nextStep);
      }

      // If we got too far behind, catch up the reference clock
      if (nextNoteTimeRef.current < audioEngine.ctx.currentTime) {
        nextNoteTimeRef.current = audioEngine.ctx.currentTime;
      }
    } catch (e) {
      console.error("Scheduler Failure:", e);
    }
  }, []);

  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => {
    bpmRef.current = bpm;
    audioEngine.setBpm(bpm);
  }, [bpm]);
  useEffect(() => { rowConfigsRef.current = rowConfigs(); }, [rowConfigs]);
  useEffect(() => { queuedPatternRef.current = queuedPatternIndex; }, [queuedPatternIndex]);
  useEffect(() => { loopLockedPatternRef.current = loopLockedPatternIndex; }, [loopLockedPatternIndex]);
  useEffect(() => { isFollowModeRef.current = isFollowMode; }, [isFollowMode]);

  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  useEffect(() => {
    if (audioEngine.ctx) {
      audioEngine.rebuildFXGraph(fxGraph);
    }
    localStorage.setItem('pulse_fx_graph', JSON.stringify(fxGraph));
  }, [fxGraph, hasStarted]);

  useEffect(() => {
    localStorage.setItem('pulse_song', JSON.stringify(song));
  }, [song]);

  useEffect(() => {
    setSong(prevSong => prevSong.map(track => track.map(grid => {
      const prevSynthCount = grid.length - DEFAULT_DRUM_ROWS.length;
      const newSynthCount = isUnrolled ? 13 : 8;
      const drumCount = DEFAULT_DRUM_ROWS.length;
      const newGrid = generateBlankGrid(newSynthCount + drumCount);
      const synthToCopy = Math.min(prevSynthCount, newSynthCount);
      for (let r = 0; r < synthToCopy; r++) newGrid[r] = [...grid[r]];
      for (let d = 0; d < drumCount; d++) {
        const oldDrumIdx = prevSynthCount + d;
        const newDrumIdx = newSynthCount + d;
        if (grid[oldDrumIdx]) newGrid[newDrumIdx] = [...grid[oldDrumIdx]];
      }
      return newGrid;
    })));
  }, [isUnrolled]);

  useEffect(() => {
    if (isPlaying) {
      audioEngine.init();
      audioEngine.resume();
      if (!timerRef.current) {
        // Only reset if we're starting a fresh playback
        if (playbackStepRef.current === 0) {
          playbackPatternRef.current = editingPatternIndex;
          setPlaybackPatternIndex(editingPatternIndex);
        }
        nextNoteTimeRef.current = audioEngine.ctx!.currentTime;
        timerRef.current = window.setInterval(scheduler, 25);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      playbackStepRef.current = 0;
      setPlaybackStep(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, scheduler]);

  useEffect(() => {
    setSelectedNotes([]);
  }, [editingTrackIndex, editingPatternIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); handleRedo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        duplicatePattern(editingPatternIndex);
        setToast({ message: "Pattern Duplicated", visible: true });
      }
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }

      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        if (selectedNotes.length > 0) {
          e.preventDefault();
          setSong(prevSong => {
            const newSong = [...prevSong];
            const track = [...newSong[editingTrackIndex]];
            const grid = [...track[editingPatternIndex]];
            selectedNotes.forEach(({ r, c }) => {
              grid[r] = [...grid[r]];
              grid[r][c] = null;
            });
            track[editingPatternIndex] = grid;
            newSong[editingTrackIndex] = track;
            return newSong;
          });
          setSelectedNotes([]);
          setToast({ message: `Deleted ${selectedNotes.length} notes`, visible: true });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingArr) {
        const delta = dragStartYRef.current - e.clientY;
        const newHeight = dragStartHeightRef.current + delta;
        // Clamp height between 80 and 60% of window height
        setArrHeight(Math.max(80, Math.min(window.innerHeight * 0.6, newHeight)));
      }
    };
    const handleMouseUp = () => setIsResizingArr(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleUndo, handleRedo, duplicatePattern, editingPatternIndex, isResizingArr]);

  if (!hasStarted) {
    return (
      <div className="fixed inset-0 bg-slate-950/98 flex items-center justify-center z-50 transition-opacity duration-700">
        <div className="text-center p-8 max-w-sm">
          <div className="w-24 h-24 bg-sky-500/10 border-2 border-sky-500/20 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse shadow-[0_0_80px_rgba(14,165,233,0.2)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <h2 className="text-3xl font-black mb-3 text-white tracking-tighter italic">PULSE STUDIO</h2>
          <p className="text-slate-500 text-sm mb-10 leading-relaxed font-medium">Professional grade pattern sequencing. Cloud-synced arrangement.</p>
          <button
            onClick={() => { audioEngine.init(); setHasStarted(true); }}
            className="w-full bg-white text-slate-950 px-8 py-4 rounded-2xl font-black text-xs tracking-widest hover:bg-sky-400 hover:text-white transition-all transform active:scale-95 shadow-xl"
          >
            BOOT ENGINE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans p-2 md:p-4 flex flex-col overflow-hidden">
      <header className="bg-slate-900/90 p-2 md:p-4 rounded-2xl border border-white/5 backdrop-blur-xl shadow-2xl mb-3 md:mb-4 shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-3xl font-black tracking-tighter text-white">
                PULSE<span className="text-sky-500">STUDIO</span>
              </h1>
              <div className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-bold uppercase tracking-widest text-slate-500 bg-black/40 px-2 py-1 rounded-full border border-slate-800">
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
                <span className="hidden sm:inline">{isPlaying ? 'Playing' : 'Standby'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-black/40 p-2.5 rounded-2xl border border-slate-800 flex-wrap">
            <div className="flex items-center px-2 border-r border-slate-700 mr-2 gap-2">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Scale</span>
              <select
                value={currentScale}
                onChange={(e) => setCurrentScale(e.target.value)}
                className="bg-slate-900 text-sky-400 text-xs font-bold py-1 px-2 rounded border border-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={() => setIsUnrolled(!isUnrolled)}
                className={`px-2 py-1 rounded border transition-all text-xs font-bold ${isUnrolled ? 'bg-sky-500 border-sky-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
                title="Unroll Piano"
              >
                🎹
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'sequencer' ? 'node' : viewMode === 'node' ? 'spreadsheet' : 'sequencer')}
                className={`px-3 py-1 rounded-xl transition-all text-[10px] font-black tracking-widest border ${viewMode !== 'sequencer' ? 'bg-sky-500 border-sky-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white hover:border-slate-500'}`}
              >
                LAB ({viewMode === 'sequencer' ? 'SEQ' : viewMode === 'node' ? 'NODE' : 'SHEET'})
              </button>
            </div>

            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-slate-700/50 mr-2">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSnap(s as any)}
                  className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${snap === s ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  1/{s === 1 ? '4' : s === 2 ? '2' : '1'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 border-r border-slate-700 pr-3 mr-1">
              <button
                onClick={() => {
                  const newIsPlaying = !isPlaying;
                  setIsPlaying(newIsPlaying);
                  if (newIsPlaying) audioEngine.resetLFO();
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs tracking-widest transition-all ${isPlaying ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
              >
                {isPlaying ? 'STOP' : 'START'}
              </button>
              <div
                className="flex flex-col gap-0.5 min-w-[60px] ml-1 cursor-pointer group"
                onDoubleClick={() => setBpm(120)}
                title="Double click to reset to 120"
              >
                <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold ml-0.5 group-hover:text-slate-400 transition-colors">BPM ({bpm})</span>
                <input
                  type="range" min="60" max="200" value={bpm}
                  onChange={(e) => setBpm(parseInt(e.target.value))}
                  className="w-full accent-sky-500 h-1 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 px-2">
              <button onClick={handleUndo} className="p-2 text-slate-400 hover:text-white transition-all">UNDO</button>
              <button onClick={handleRedo} className="p-2 text-slate-400 hover:text-white transition-all">REDO</button>
              <button onClick={handleRemix} className="bg-violet-600/10 text-violet-500 p-2.5 rounded-xl border border-violet-500/20">🎲</button>
              <button
                onClick={() => handleReset()}
                className={`${resetArmed ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-500'} p-2.5 rounded-xl border border-rose-500/20 hover:bg-rose-500/20 transition-all shadow-lg active:scale-95`}
                title="NUCLEAR RESET (Requires 2 Clicks)"
              >
                {resetArmed ? 'RESET?' : '🗑️'}
              </button>
            </div>
            <div className="flex items-center gap-2 px-1 md:px-2 border-l border-slate-700 ml-1">
              <button
                onClick={() => setIsArrOpen(!isArrOpen)}
                className={`p-2 rounded-xl border transition-all text-[10px] font-black tracking-widest ${isArrOpen ? 'bg-indigo-500 border-indigo-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white hover:border-slate-500'}`}
                title="Toggle Arrangement Drawer"
              >
                ARR
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col gap-4 overflow-hidden pb-4">
        <section className="flex-1 bg-slate-900/40 rounded-2xl p-4 border border-white/5 backdrop-blur-3xl shadow-2xl relative overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 min-h-0 bg-slate-900/90 rounded-3xl border border-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden flex flex-col">
            {viewMode === 'sequencer' ? (
              <CanvasSequencer
                grid={song[editingTrackIndex][editingPatternIndex]}
                rowConfigs={rowConfigs()}
                onToggleNote={toggleNote}
                onAddNote={addNote}
                onCommitNote={handleCommitNote}
                onCommitMultiNote={handleCommitMultiNote}
                onPreviewNote={previewNote}
                onSelectNotes={setSelectedNotes}
                selectedNotes={selectedNotes}
                playbackStep={playbackPatternIndex === editingPatternIndex ? playbackStep : -1}
                isPlaying={isPlaying}
                snap={snap}
              />
            ) : viewMode === 'spreadsheet' ? (
              <SpreadsheetView
                grid={song[editingTrackIndex][editingPatternIndex]}
                rowConfigs={rowConfigs()}
                onUpdateNote={handleUpdateNote}
              />
            ) : (
              <NodalInterface
                graph={fxGraph}
                onUpdateGraph={setFxGraph}
                onCommitGraph={(newGraph) => commitToHistory(song, newGraph)}
              />
            )}
          </div>
        </section>

        {isArrOpen && (
          <>
            <div
              className={`h-4 w-full cursor-ns-resize flex items-center justify-center group -mb-2 mt-1 z-10`}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizingArr(true);
                dragStartYRef.current = e.clientY;
                dragStartHeightRef.current = arrHeight;
              }}
            >
              <div className={`w-full h-[1px] transition-colors ${isResizingArr ? 'bg-sky-500' : 'bg-slate-800 group-hover:bg-sky-500/50'}`} />
              <div className={`absolute px-4 py-0.5 bg-slate-900 border border-slate-800 rounded-full flex gap-1 transition-all ${isResizingArr ? 'border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] scale-110 opacity-100' : 'opacity-40 group-hover:opacity-100 group-hover:border-slate-600'}`}>
                <div className="w-1 h-1 bg-slate-600 rounded-full" />
                <div className="w-1 h-1 bg-slate-600 rounded-full" />
                <div className="w-1 h-1 bg-slate-600 rounded-full" />
              </div>
            </div>
            <div className="shrink-0 transition-shadow duration-300" style={{ height: `${arrHeight}px` }}>
              <ArrangementView
                song={song}
                editingTrackIndex={editingTrackIndex}
                editingPatternIndex={editingPatternIndex}
                playbackPatternIndex={playbackPatternIndex}
                queuedPatternIndex={queuedPatternIndex}
                loopLockedPatternIndex={loopLockedPatternIndex}
                rowConfigs={rowConfigs()}
                onSelectPattern={(trackIdx, patIdx) => {
                  setEditingTrackIndex(trackIdx);
                  setEditingPatternIndex(patIdx);
                }}
                onInsertPattern={insertPattern}
                onDeletePattern={deletePattern}
                onAddTrack={addTrack}
                onDuplicatePattern={duplicatePattern}
                onQueuePattern={setQueuedPatternIndex}
                onLoopLockPattern={(idx) => setLoopLockedPatternIndex(prev => prev === idx ? -1 : idx)}
                isPlaying={isPlaying}
                isFollowMode={isFollowMode}
                onToggleFollow={setIsFollowMode}
                bpm={bpm}
                playbackStep={playbackStep}
              />
            </div>
          </>
        )}
      </main>

      {
        toast.visible && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/80 backdrop-blur-xl border border-sky-500/30 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span className="text-sm font-bold text-white uppercase tracking-tighter">{toast.message}</span>
          </div>
        )
      }
    </div >
  );
};

export default App;
