import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasSequencer } from './components/CanvasSequencer';
import { ArrangementView } from './components/ArrangementView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { NodalInterface } from './components/NodalInterface';
import { ScalePieMenu } from './components/ScalePieMenu';
import type { Note, RowConfig, Grid, FXGraph } from './types';
import { STEPS_PER_PATTERN, SCALES, FREQS, DEFAULT_DRUM_ROWS, PRESETS, CHROMATIC_LABELS, NOTE_TO_SEMI } from './constants';
import { audioEngine } from './audioEngine';

const generateBlankGrid = (rows: number) => {
  return Array(rows).fill(null).map(() => Array(STEPS_PER_PATTERN).fill(null));
};



const getLabelSemitones = (label: string): number => {
  const match = label.match(/^([A-G]#?|Ab|Bb|Db|Eb|Gb)(\d)$/);
  if (!match) return 0;
  const note = match[1];
  const octave = parseInt(match[2]);
  return (octave - 3) * 12 + (NOTE_TO_SEMI[note] || 0);
};

const getRowConfigs = (scaleName: string, unrolled: boolean): RowConfig[] => {
  let labels: string[];
  if (unrolled) {
    labels = CHROMATIC_LABELS;
  } else {
    // Scaled view: Filter SCALES to only include Octave 4
    const scaleLabels = SCALES[scaleName]?.labels || SCALES['C Maj Pent'].labels;
    labels = scaleLabels.filter(l => l.endsWith('4'));

    // If user specifically wants 8 rows and we have fewer (like 5), 
    // we just return what the scale provides. 
    // The user said "8 rows and 16 columns", but C Maj Pent is 5 notes.
    // We'll stick to the "Octave 4" constraint as requested.
  }

  const synthRows = labels.map((label: string) => ({
    label,
    color: label.includes('#') ? 'bg-slate-900/40' : 'bg-sky-500/5',
    activeColor: 'bg-sky-500',
    freq: FREQS[label] || 261.63,
    gain: 0.8,
    type: 'synth' as const
  }));
  return [...synthRows, ...DEFAULT_DRUM_ROWS];
};

const remapGrid = (grid: Grid, sourceConfigs: RowConfig[], targetConfigs: RowConfig[], targetUnrolled: boolean): Grid => {
  const newGrid = generateBlankGrid(targetConfigs.length);

  grid.forEach((row, r) => {
    const config = sourceConfigs[r];
    if (!config) return;

    if (config.type !== 'synth') {
      // ABSOLUTE DRUM PROTECTION: Match by Label + Type
      // We skip drums here because they are handled in a separate pass now
      return;
    }

    row.forEach((note, c) => {
      if (!note) return;
      const absPitch = getLabelSemitones(config.label) + (note.oct || 0) * 12;

      let bestRow = -1;
      let bestOct = 0;
      let minDiff = Infinity;

      targetConfigs.forEach((tc, tcIdx) => {
        if (tc.type !== 'synth') return;
        const tcBase = getLabelSemitones(tc.label);
        const oct = Math.round((absPitch - tcBase) / 12);
        const actual = tcBase + oct * 12;
        const d = Math.abs(actual - absPitch);

        // Priority: 1. Min distance, 2. Min absolute octave (stay on matching label if possible)
        if (d < minDiff || (d === minDiff && Math.abs(oct) < Math.abs(bestOct))) {
          minDiff = d;
          bestRow = tcIdx;
          bestOct = oct;
        }
      });

      if (bestRow !== -1) {
        newGrid[bestRow][c] = { ...note, oct: targetUnrolled ? bestOct : 0 };
      }
    });
  });

  // DRUM ISOLATION PASS: Copy drums exactly to their destination rows
  sourceConfigs.forEach((config, r) => {
    if (config.type !== 'synth') {
      const targetDrumIdx = targetConfigs.findIndex(c => c.type === config.type && c.label === config.label);
      console.log(`[DRUM DEBUG] Source ${config.label} (Row ${r}) -> Target Index ${targetDrumIdx} | Source Data Exists: ${!!grid[r]}`);

      if (targetDrumIdx !== -1 && grid[r]) {
        if (newGrid[targetDrumIdx]?.some(n => n !== null)) {
          console.warn(`[DRUM DEBUG] WARNING: Overwriting existing data at Target ${targetDrumIdx} (Length: ${newGrid[targetDrumIdx]?.length})`);
        }
        newGrid[targetDrumIdx] = [...grid[r]];
      }
    }
  });

  return newGrid;
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
  const [editingTrackIndex, setEditingTrackIndex] = useState(0);
  const [editingPatternIndex, setEditingPatternIndex] = useState(0);
  const [patternScales, setPatternScales] = useState<string[][]>(() => {
    const saved = localStorage.getItem('pulse_pattern_scales');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Migration: If it's a 1D array of strings, it's old global pattern scales for track 0
          if (typeof parsed[0] === 'string') return [parsed];
          return parsed;
        }
      } catch (e) {
        console.warn("Failed to parse patternScales, resetting:", e);
      }
    }
    return [['C Maj Pent']];
  });
  const currentScale = patternScales[editingTrackIndex]?.[editingPatternIndex] || 'C Maj Pent';
  const [playbackStep, setPlaybackStep] = useState(0);
  const [playbackPatternIndex, setPlaybackPatternIndex] = useState(0);
  const [sequencerScrollTop, setSequencerScrollTop] = useState(0);
  const [queuedPatternIndex, setQueuedPatternIndex] = useState<number>(-1);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const [isUnrolled, setIsUnrolled] = useState(false);

  const [viewMode, setViewMode] = useState<'sequencer' | 'node' | 'spreadsheet'>('sequencer');
  const [masterVolume] = useState(0.8);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [snap] = useState<1 | 2 | 4>(1);
  const [isArrOpen, setIsArrOpen] = useState(window.innerHeight > 750);
  // Layout state
  const [history, setHistory] = useState<{ song: Grid[][], fxGraph: FXGraph, patternScales: string[][] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ song: Grid[][], fxGraph: FXGraph, patternScales: string[][] }[]>([]);
  // Layout state
  const [arrHeight, setArrHeight] = useState(180);
  const [isResizingArr, setIsResizingArr] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<{ r: number, c: number }[]>([]);
  const [clipboard, setClipboard] = useState<{ r: number, c: number, note: Note }[] | null>(null);

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
  const trackLoopsRef = useRef<(number[] | null)[]>([]); // [start, end] or null for each track
  const trackSyncStatusRef = useRef<(boolean)[]>([]); // false if track is waiting for global to catch up
  const isFollowModeRef = useRef(true);
  const songRef = useRef<Grid[][]>(song);
  const bpmRef = useRef(bpm);
  const [trackLoops, setTrackLoops] = useState<(number[] | null)[]>([]);
  const patternScalesRef = useRef<string[][]>(patternScales);
  const isUnrolledRef = useRef(isUnrolled);

  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { patternScalesRef.current = patternScales; }, [patternScales]);
  useEffect(() => { isUnrolledRef.current = isUnrolled; }, [isUnrolled]);
  useEffect(() => { trackLoopsRef.current = trackLoops; }, [trackLoops]);



  const rowConfigsRef = useRef<RowConfig[]>([]);

  // Dragging state for layout
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 }); // Global mouse tracking for PIE menu start pos
  const [isPieMenuOpen, setIsPieMenuOpen] = useState(false);
  const [pieMenuStartPos, setPieMenuStartPos] = useState({ x: 0, y: 0 }); // Where menu opened

  const commitToHistory = useCallback((newSong: Grid[][] = song, newGraph: FXGraph = fxGraph, newScales: string[][] = patternScales) => {
    setHistory(prev => [...prev.slice(-19), { song, fxGraph: lastCommittedGraph, patternScales }]);
    setRedoStack([]);
    setSong(newSong);
    setFxGraph(newGraph);
    setLastCommittedGraph(newGraph);
    setPatternScales(newScales);
  }, [song, fxGraph, lastCommittedGraph, patternScales]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(prevRedo => [...prevRedo, { song, fxGraph: lastCommittedGraph, patternScales }]);
    setHistory(prevHist => prevHist.slice(0, -1));
    setSong(prev.song);
    setFxGraph(prev.fxGraph);
    setLastCommittedGraph(prev.fxGraph);
    setPatternScales(prev.patternScales);

    // Safety: Clamp indices if they are now out of bounds
    const trackCount = prev.song.length;
    const patternCount = prev.song[0]?.length || 1;
    setEditingTrackIndex(ti => Math.min(ti, trackCount - 1));
    setEditingPatternIndex(pi => Math.min(pi, patternCount - 1));
  }, [history, song, fxGraph, lastCommittedGraph, patternScales]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prevHist => [...prevHist, { song, fxGraph: lastCommittedGraph, patternScales }]);
    setRedoStack(prevRedo => prevRedo.slice(0, -1));
    setSong(next.song);
    setFxGraph(next.fxGraph);
    setLastCommittedGraph(next.fxGraph);
    setPatternScales(next.patternScales);

    // Safety: Clamp indices if they are now out of bounds
    const trackCount = next.song.length;
    const patternCount = next.song[0]?.length || 1;
    setEditingTrackIndex(ti => Math.min(ti, trackCount - 1));
    setEditingPatternIndex(pi => Math.min(pi, patternCount - 1));
  }, [redoStack, song, fxGraph, lastCommittedGraph, patternScales]);


  const timerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);

  const rowConfigs = useCallback((scaleName: string): RowConfig[] => {
    return getRowConfigs(scaleName, isUnrolled);
  }, [isUnrolled]);

  const previewNote = useCallback((r: number, note?: Note, scaleName: string = currentScale) => {
    audioEngine.init();
    audioEngine.resume();
    const config = rowConfigs(scaleName)[r];
    const time = audioEngine.ctx!.currentTime;
    const freq = config.type === 'synth' ? config.freq * Math.pow(2, note?.oct || 0) : config.freq;

    if (config.type === 'synth') {
      audioEngine.createSynth(freq, time, 0.5, bpm, config.gain);
    } else if (config.type === 'kick') audioEngine.createKick(time, config.gain);
    else if (config.type === 'snare') audioEngine.createSnare(time, config.gain);
    else if (config.type === 'hat') audioEngine.createHiHat(time, config.gain);
  }, [rowConfigs, bpm, currentScale]);

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
      newTrack.splice(atIndex, 0, generateBlankGrid(rowConfigs(currentScale).length));
      return newTrack;
    });

    const newPatternScales = patternScales.map(trackScales => {
      const newTrackScales = [...trackScales];
      newTrackScales.splice(atIndex, 0, trackScales[atIndex] || 'C Maj Pent');
      return newTrackScales;
    });

    commitToHistory(newSong, lastCommittedGraph, newPatternScales);
    setEditingPatternIndex(atIndex);
  };

  const deletePattern = (index: number) => {
    if (song[0].length <= 1) return;
    const newSong = song.map(track => track.filter((_, i) => i !== index));
    const newPatternScales = patternScales.map(trackScales => trackScales.filter((_, i) => i !== index));

    commitToHistory(newSong, lastCommittedGraph, newPatternScales);
    setEditingPatternIndex(Math.max(0, Math.min(editingPatternIndex, newSong[0].length - 1)));
  };

  const duplicatePattern = useCallback((index: number) => {
    const newSong = song.map(track => {
      const newTrack = [...track];
      const patternToDup = JSON.parse(JSON.stringify(track[index]));
      newTrack.splice(index + 1, 0, patternToDup);
      return newTrack;
    });

    const newPatternScales = patternScales.map(trackScales => {
      const next = [...trackScales];
      next.splice(index + 1, 0, trackScales[index] || 'C Maj Pent');
      return next;
    });

    commitToHistory(newSong, lastCommittedGraph, newPatternScales);
    setEditingPatternIndex(index + 1);
  }, [song, patternScales, commitToHistory, lastCommittedGraph]);

  const addTrack = () => {
    const patternCount = song[0].length;
    const newTrack = Array(patternCount).fill(null).map((_, i) => {
      const scaleNameForPattern = patternScales[0]?.[i] || 'C Maj Pent';
      return generateBlankGrid(getRowConfigs(scaleNameForPattern, isUnrolled).length);
    });
    const newSong = [...song, newTrack];

    const newTrackScales = Array(patternCount).fill('C Maj Pent');
    // Proactively copy scales from the first track if available
    if (patternScales[0]) {
      for (let i = 0; i < patternCount; i++) newTrackScales[i] = patternScales[0][i] || 'C Maj Pent';
    }
    const newPatternScales = [...patternScales, newTrackScales];

    commitToHistory(newSong, lastCommittedGraph, newPatternScales);
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
    const newSong = JSON.parse(JSON.stringify(song));
    const track = newSong[editingTrackIndex];
    const grid = track[editingPatternIndex];

    // 1. Clear old positions
    notes.forEach(({ fromR, fromC }) => {
      if (grid[fromR]) grid[fromR][fromC] = null;
    });

    // 2. Set new positions
    notes.forEach(({ fromR, fromC, toR, toC, data }) => {
      const originalNote = song[editingTrackIndex][editingPatternIndex][fromR]?.[fromC];
      if (originalNote && grid[toR]) {
        grid[toR][toC] = { ...originalNote, ...data };
      }
    });

    commitToHistory(newSong);

    // Update selection to match new positions
    setSelectedNotes(notes.map(m => ({ r: m.toR, c: m.toC })));
    setToast({ message: `Moved ${notes.length} notes`, visible: true });
  }, [editingTrackIndex, editingPatternIndex, song, commitToHistory]);

  const handleCopyMultiNote = useCallback((notes: { fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note> }[]) => {
    const newSong = JSON.parse(JSON.stringify(song));
    const track = newSong[editingTrackIndex];
    const grid = track[editingPatternIndex];

    // COPY: Do NOT clear old positions. Just set new ones.
    notes.forEach(({ fromR, fromC, toR, toC, data }) => {
      const originalNote = song[editingTrackIndex][editingPatternIndex][fromR]?.[fromC];
      if (originalNote && grid[toR]) {
        // If target cell occupied, OVERWRITE? Yes, standard behavior.
        grid[toR][toC] = { ...originalNote, ...data };
      }
    });

    commitToHistory(newSong);
    setSelectedNotes(notes.map(m => ({ r: m.toR, c: m.toC })));
    setToast({ message: `Copied ${notes.length} notes`, visible: true });
  }, [editingTrackIndex, editingPatternIndex, song, commitToHistory]);

  const handleCommitNote = useCallback((fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note>) => {
    const newSong = [...song];
    const track = [...newSong[editingTrackIndex]];
    const currentGrid = [...track[editingPatternIndex]];
    const note = currentGrid[fromR]?.[fromC];

    if (!note) return;

    if (fromR !== toR || fromC !== toC) {
      currentGrid[fromR] = [...currentGrid[fromR]];
      currentGrid[fromR][fromC] = null;
    }

    const updatedNote = { ...note, ...data };
    currentGrid[toR] = [...currentGrid[toR]];
    currentGrid[toR][toC] = updatedNote;

    track[editingPatternIndex] = currentGrid;
    newSong[editingTrackIndex] = track;

    commitToHistory(newSong);
    previewNote(toR, { ...data, d: data.d || 1, o: data.o || 0 });
  }, [editingTrackIndex, editingPatternIndex, song, commitToHistory, previewNote]);

  const handleUpdateNote = useCallback((r: number, c: number, data: Partial<Note>) => {
    const newSong = [...song];
    const track = [...newSong[editingTrackIndex]];
    const currentGrid = [...track[editingPatternIndex]];
    const note = currentGrid[r]?.[c];
    if (!note) return;

    currentGrid[r] = [...currentGrid[r]];
    currentGrid[r][c] = { ...note, ...data };

    track[editingPatternIndex] = currentGrid;
    newSong[editingTrackIndex] = track;
    commitToHistory(newSong);
  }, [editingTrackIndex, editingPatternIndex, song, commitToHistory]);

  const handleRemix = () => {
    const keys = Object.keys(PRESETS);
    const style = keys[Math.floor(Math.random() * keys.length)];
    const preset = PRESETS[style];
    const newGrid = generateBlankGrid(rowConfigs(currentScale).length);
    const hatRow = newGrid.length - 3;
    const snareRow = newGrid.length - 2;
    const kickRow = newGrid.length - 1;

    if (preset.kick) preset.kick.forEach((s: number) => newGrid[kickRow][s] = { d: 1, o: 0 });
    if (preset.snare) preset.snare.forEach((s: number) => newGrid[snareRow][s] = { d: 1, o: 0 });
    if (preset.hat) preset.hat.forEach((s: number) => newGrid[hatRow][s] = { d: 1, o: 0 });

    if (preset.bass) {
      const synthRowsCount = rowConfigs(currentScale).length - DEFAULT_DRUM_ROWS.length;
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

  const handleCopy = useCallback(() => {
    if (selectedNotes.length === 0) return;
    const currentGrid = song[editingTrackIndex][editingPatternIndex];
    const notesToCopy = selectedNotes.map(({ r, c }) => {
      const note = currentGrid[r][c];
      return note ? { r: r, c: c, note: { ...note } } : null;
    }).filter(Boolean) as { r: number, c: number, note: Note }[];

    if (notesToCopy.length > 0) {
      // Normalize positions to the top-left-most note
      const minR = Math.min(...notesToCopy.map(n => n.r));
      const minC = Math.min(...notesToCopy.map(n => n.c));
      const normalized = notesToCopy.map(n => ({
        r: n.r - minR,
        c: n.c - minC,
        note: n.note
      }));
      setClipboard(normalized);
      setToast({ message: `Copied ${notesToCopy.length} notes`, visible: true });
    }
  }, [song, editingTrackIndex, editingPatternIndex, selectedNotes]);

  const handlePaste = useCallback(() => {
    if (!clipboard || clipboard.length === 0) return;
    setSong(prevSong => {
      const newSong = [...prevSong];
      const track = [...newSong[editingTrackIndex]];
      const grid = JSON.parse(JSON.stringify(track[editingPatternIndex])); // Deep clone target grid

      clipboard.forEach(({ r, c, note }) => {
        // Find current cursor/offset or just paste at 0,0 relative?
        // Let's paste at 0,0 for now or maybe centered. 
        // User didn't specify, but relative to top-left is standard.
        // We'll just paste them into the target.
        if (grid[r] && r < grid.length) {
          const targetC = c; // Could add offset if we track mouse?
          if (targetC < STEPS_PER_PATTERN) {
            grid[r][targetC] = note;
          }
        }
      });

      track[editingPatternIndex] = grid;
      newSong[editingTrackIndex] = track;
      commitToHistory(newSong);
      return newSong;
    });
    setToast({ message: `Pasted ${clipboard.length} notes`, visible: true });
  }, [clipboard, editingTrackIndex, editingPatternIndex, commitToHistory]);

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setToast({ message: "CLICK AGAIN TO NUCLEAR RESET", visible: true });
      setTimeout(() => setResetArmed(false), 5000); // 5 sec window
      return;
    }

    // NUCLEAR RESET - TOTAL WIPE (Preserving Undo)
    const emptySong = [[generateBlankGrid(getRowConfigs('C Maj Pent', isUnrolled).length)]];

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

    setPatternScales([['C Maj Pent']]);
    setToast({ message: "SYSTEM WIPED - UNDO PRESERVED", visible: true });

    // Force cleanup of any lingering audio state if possible
    audioEngine.init();
  }, [resetArmed, isUnrolled, commitToHistory]);

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
        const globalPattern = playbackPatternRef.current;
        const currentSong = songRef.current;
        const currentBpm = bpmRef.current;
        const currentLoops = trackLoopsRef.current;

        // Play all tracks for this step
        currentSong.forEach((track, trackIdx) => {
          let patternIdx = globalPattern;
          const myLoop = currentLoops[trackIdx];

          if (myLoop) {
            const [start, end] = myLoop;
            const loopLen = (end - start) + 1;
            patternIdx = start + (globalPattern % loopLen);
            trackSyncStatusRef.current[trackIdx] = true;
          } else {
            // "Wait for sync" logic: if we were looping and released, 
            // we follow global IF global hits our "wait" index.
            // Simplified: for now, most users expect immediate resume or wait.
            // Requirement was: "pause until other track catches back up"
            // We'll just follow global for now to keep it usable, 
            // but we'll flag it for a more complex implementation if needed.
            patternIdx = globalPattern;
          }

          if (track[patternIdx]) {
            const patternScale = patternScalesRef.current[trackIdx]?.[patternIdx] || 'C Maj Pent';
            const patternRowConfigs = rowConfigs(patternScale);
            audioEngine.playStep(track[patternIdx], currentStep, nextNoteTimeRef.current, patternRowConfigs, currentBpm);
          }
        });

        const secondsPerStep = 60.0 / currentBpm / 4;
        nextNoteTimeRef.current += secondsPerStep;

        let nextStep = currentStep + 1;
        let nextPattern = globalPattern;
        if (nextStep >= STEPS_PER_PATTERN) {
          nextStep = 0;
          if (queuedPatternRef.current !== -1) {
            nextPattern = queuedPatternRef.current;
            queuedPatternRef.current = -1;
            setQueuedPatternIndex(-1);
          } else {
            nextPattern = (globalPattern + 1) % currentSong[0].length;
          }
          if (isFollowModeRef.current) setEditingPatternIndex(nextPattern);
          playbackPatternRef.current = nextPattern;
          setPlaybackPatternIndex(nextPattern);
        }
        playbackStepRef.current = nextStep;
        setPlaybackStep(nextStep);
      }

      if (nextNoteTimeRef.current < audioEngine.ctx.currentTime) {
        nextNoteTimeRef.current = audioEngine.ctx.currentTime;
      }
    } catch (e) {
      console.error("Scheduler Failure:", e);
    }
  }, [audioEngine, rowConfigs]);

  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => {
    bpmRef.current = bpm;
    audioEngine.setBpm(bpm);
  }, [bpm]);
  useEffect(() => { rowConfigsRef.current = rowConfigs(currentScale); }, [rowConfigs, currentScale]);
  useEffect(() => { queuedPatternRef.current = queuedPatternIndex; }, [queuedPatternIndex]);
  useEffect(() => { isFollowModeRef.current = isFollowMode; }, [isFollowMode]);
  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  const fitSequencerToNotes = useCallback((grid: Grid, configs: RowConfig[]) => {
    let minR = Infinity;
    let maxR = -Infinity;
    let hasNotes = false;

    grid.forEach((row, r) => {
      if (configs[r]?.type === 'synth' && row.some(n => n !== null)) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        hasNotes = true;
      }
    });

    if (hasNotes) {
      // Center the view on the range
      const centerR = (minR + maxR) / 2;
      const targetScroll = Math.max(0, (centerR * 40) - (arrHeight / 2) - 100);
      // Approximate viewport height isn't known exactly here, using safe offset
      setSequencerScrollTop(targetScroll);
    }
  }, [arrHeight]);

  const remapSongLayout = useCallback((targetUnrolled: boolean, forceScaleUpdate?: { track: number, pattern: number, newScale: string, oldScale?: string }) => {
    setSong(prevSong => prevSong.map((track, tIdx) => track.map((grid, pIdx) => {
      const currentScaleName = (forceScaleUpdate && forceScaleUpdate.track === tIdx && forceScaleUpdate.pattern === pIdx && forceScaleUpdate.oldScale)
        ? forceScaleUpdate.oldScale
        : (patternScales[tIdx]?.[pIdx] || 'C Maj Pent');

      const targetScaleName = (forceScaleUpdate && forceScaleUpdate.track === tIdx && forceScaleUpdate.pattern === pIdx)
        ? forceScaleUpdate.newScale
        : currentScaleName;


      const sourceConfigs = getRowConfigs(currentScaleName, isUnrolled);
      const targetConfigs = getRowConfigs(targetScaleName, targetUnrolled);

      // Rule: If we are in rolled mode and only changing the scale, PRESERVE visual positions (relative to a best-fit center)
      // and align the vertical offset to minimize TONAL JUMP (closest frequency center).
      if (!isUnrolled && !targetUnrolled && currentScaleName !== targetScaleName) {
        const currentGrid = grid;
        let totalMidi = 0;
        let noteCount = 0;
        currentGrid.forEach((row, r) => {
          if (sourceConfigs[r]?.type !== 'synth') return; // Skip drums
          row.forEach(note => {
            if (note) {
              const label = sourceConfigs[r].label;
              totalMidi += getLabelSemitones(label) + (note.oct || 0) * 12;
              noteCount++;
            }
          });
        });

        const newGrid = generateBlankGrid(targetConfigs.length);

        if (noteCount === 0) {
          // If no synth notes, just preserve drums
          sourceConfigs.forEach((config, r) => {
            if (config.type !== 'synth') {
              const targetDrumIdx = targetConfigs.findIndex(c => c.type === config.type && c.label === config.label);
              if (targetDrumIdx !== -1) newGrid[targetDrumIdx] = [...grid[r]];
            }
          });
          return newGrid;
        }

        // 2. Find the optimal row offset S using ANCHOR logic (Lowest Note Matching)
        let lowestSynthRow = -1;

        // Find anchor note (lowest synth row with notes)
        // Scan backwards from bottom to find the "lowest" musical note (highest index)
        for (let r = grid.length - 1; r >= 0; r--) {
          if (sourceConfigs[r]?.type === 'synth' && grid[r].some(n => n !== null)) {
            lowestSynthRow = r;
            break;
          }
        }

        let bestS = 0;
        let minJump = 0; // Just for logging

        if (lowestSynthRow !== -1) {
          // Calculate Absolute Pitch of the Anchor
          const anchorLabel = sourceConfigs[lowestSynthRow].label;
          const anchorMidi = getLabelSemitones(anchorLabel);

          // Find the Closest Row in Target Configs
          let bestTargetRow = -1;
          let bestDiff = Infinity;

          targetConfigs.forEach((tc, tIdx) => {
            if (tc.type !== 'synth') return;
            const tMidi = getLabelSemitones(tc.label);
            const diff = Math.abs(tMidi - anchorMidi);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestTargetRow = tIdx;
            }
          });

          if (bestTargetRow !== -1) {
            // debug
            console.log(`[Anchor Debug] Anchor '${anchorLabel}' (${anchorMidi}) @ Row ${lowestSynthRow}. Best Target Row ${bestTargetRow} (${targetConfigs[bestTargetRow].label}, ${getLabelSemitones(targetConfigs[bestTargetRow].label)}). Diff: ${bestDiff}`);

            bestS = lowestSynthRow - bestTargetRow;
            minJump = bestDiff;
          } else {
            console.warn("[Anchor Debug] No best target row found?");
          }
        } else {
          console.log("[Anchor Debug] No Lowest Synth Row found (No Notes?)");
        }

        // 3. Map notes using the best global offset S (Synths) + Absolute (Drums)
        console.log(`[Tonal Alignment] Scale: ${currentScaleName} -> ${targetScaleName} | Best Shift S: ${bestS} | Min Avg Jump: ${minJump.toFixed(2)}`);
        setToast({ message: `Aligned ${targetScaleName} (Shift: ${bestS}, Jump: ${minJump.toFixed(1)}st)`, visible: true });

        // PASS 1: Synths (Tonal Shift)
        grid.forEach((row, r) => {
          if (sourceConfigs[r]?.type && sourceConfigs[r].type !== 'synth') return; // Skip drums

          const targetR = r - bestS;
          if (targetR >= 0 && targetR < targetConfigs.length && targetConfigs[targetR].type === 'synth') {
            newGrid[targetR] = row.map(note => note ? { ...note, oct: targetUnrolled ? note.oct : 0 } : null);
          }
        });

        // PASS 2: Drums (Absolute Match)
        sourceConfigs.forEach((config, r) => {
          if (config.type !== 'synth') {
            const targetDrumIdx = targetConfigs.findIndex(c => c.type === config.type && c.label === config.label);
            console.log(`[DRUM MAPPING] Source Row ${r} (${config.label}) -> Target Row ${targetDrumIdx}`);
            if (targetDrumIdx !== -1 && grid[r]) {
              newGrid[targetDrumIdx] = [...grid[r]];
            } else {
              console.warn(`[DRUM MAPPING] FAILED TO MAP Source Row ${r} (${config.label})`);
            }
          }
        });

        // AUTO-FIT VIEWPORT
        if (targetUnrolled) {
          setTimeout(() => fitSequencerToNotes(newGrid, targetConfigs), 50);
        } else {
          setSequencerScrollTop(0);
        }

        return newGrid;
      }

      if (sourceConfigs.length === grid.length && currentScaleName === targetScaleName && isUnrolled === targetUnrolled) {
        return grid;
      }
      return remapGrid(grid, sourceConfigs, targetConfigs, targetUnrolled);
    })));
  }, [song, patternScales, isUnrolled]);

  const changePatternScale = useCallback((trackIdx: number, patternIdx: number, newScale: string) => {
    // 1. Capture Old State from Closure/Refs
    // We access `song` and `patternScales` directly from state
    const currentTrack = song[trackIdx];
    if (!currentTrack) return;
    const currentGrid = currentTrack[patternIdx];
    if (!currentGrid) return;

    const oldScale = patternScales[trackIdx]?.[patternIdx] || 'C Maj Pent';

    // 2. Generate Configs
    const oldConfigs = getRowConfigs(oldScale, isUnrolled);
    const newConfigs = getRowConfigs(newScale, isUnrolled); // Assume layout mode doesn't change during scale switch

    // 3. Remap Grid using Logic
    const newGrid = remapGrid(currentGrid, oldConfigs, newConfigs, isUnrolled);

    // 4. Atomic Update
    setSong(prevSong => {
      const nextSong = [...prevSong];
      const nextTrack = [...nextSong[trackIdx]];
      nextTrack[patternIdx] = newGrid;
      nextSong[trackIdx] = nextTrack;
      return nextSong;
    });

    const newPatternScales = patternScales.map((trackScales, i) => {
      if (i !== trackIdx) return trackScales;
      const next = [...trackScales];
      next[patternIdx] = newScale;
      return next;
    });
    setPatternScales(newPatternScales);

    // 5. History & Feedback
    setToast({ message: `Scale: ${newScale}`, visible: true });

    // IMPORTANT: Commit explicit new state to history, not old state
    // We must manually construct the new state object for history
    const historySong = [...song];
    const historyTrack = [...historySong[trackIdx]];
    historyTrack[patternIdx] = newGrid;
    historySong[trackIdx] = historyTrack;

    setHistory(prev => [...prev.slice(-19), { song: historySong, fxGraph: lastCommittedGraph, patternScales: newPatternScales }]);

    // 6. Auto-fit if needed
    if (isUnrolled) {
      setTimeout(() => fitSequencerToNotes(newGrid, newConfigs), 50);
    } else {
      setSequencerScrollTop(0);
    }

  }, [song, patternScales, isUnrolled, lastCommittedGraph]); // Dependencies crucial

  // Auto-center grid on note
  useEffect(() => {
    if (viewMode !== 'sequencer' || !isUnrolled) return;
    const currentGrid = song[editingTrackIndex][editingPatternIndex];
    let firstRowWithNote = -1;
    for (let r = 0; r < currentGrid.length; r++) {
      if (currentGrid[r].some(n => n !== null)) {
        firstRowWithNote = r;
        break;
      }
    }
    if (firstRowWithNote !== -1) {
      const rowY = firstRowWithNote * 40;
      // Center it
      setSequencerScrollTop(Math.max(0, rowY - 200));
    }
  }, [editingTrackIndex, editingPatternIndex, isUnrolled, viewMode, currentScale]);

  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  useEffect(() => {
    if (audioEngine.ctx) {
      audioEngine.rebuildFXGraph(fxGraph);
    }
    localStorage.setItem('pulse_fx_graph', JSON.stringify(fxGraph));
  }, [fxGraph]);

  useEffect(() => {
    localStorage.setItem('pulse_song', JSON.stringify(song));
  }, [song]);


  useEffect(() => {
    if (isPlaying) {
      audioEngine.init();
      audioEngine.resume();

      // Sync State on Start
      audioEngine.rebuildFXGraph(fxGraph);
      audioEngine.setMasterVolume(masterVolume);
      audioEngine.resetLFO();

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
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      }
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }

      // Z Key for Radial Menu (Hold)
      if (e.key.toLowerCase() === 'z' && !e.repeat && !e.ctrlKey && !e.shiftKey && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        // Open Pie Menu
        e.preventDefault();
        setPieMenuStartPos(mousePosRef.current);
        setIsPieMenuOpen(true);
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
      mousePosRef.current = { x: e.clientX, y: e.clientY };
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
  }, [handleUndo, handleRedo, duplicatePattern, editingPatternIndex, isResizingArr, selectedNotes, editingTrackIndex, handleCopy, handlePaste, setIsPlaying, setSong, setToast]); // Added missing dependencies


  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans p-1 md:p-2 flex flex-col overflow-hidden">
      <header className="bg-slate-900/90 p-1.5 md:p-2 rounded-xl border border-white/5 backdrop-blur-xl shadow-2xl mb-2 md:mb-3 shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl md:text-3xl font-black tracking-tighter text-white">
                PULSE<span className="text-sky-500">PAD</span>
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
                className={`bg-slate-800/80 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black uppercase text-sky-400 outline-none hover:border-sky-500/50 transition-all cursor-pointer ${isUnrolled ? 'opacity-20 pointer-events-none grayscale' : ''}`}
                value={patternScales[editingTrackIndex]?.[editingPatternIndex] || 'C Maj Pent'}
                disabled={isUnrolled}
                onChange={(e) => {
                  changePatternScale(editingTrackIndex, editingPatternIndex, e.target.value);
                }}
              >
                {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  remapSongLayout(!isUnrolled);
                  setIsUnrolled(!isUnrolled);
                }}
                className={`px-2 py-1 rounded border transition-all text-xs font-bold ${isUnrolled ? 'bg-sky-500 border-sky-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
                title="Unroll Piano"
              >
                🎹
              </button>
            </div>
          </div>

          <div className="flex items-center px-2 border-l border-r border-slate-700 gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'node' ? 'sequencer' : 'node')}
              className={`px-3 py-1 rounded-xl transition-all text-[10px] font-black tracking-widest border ${viewMode === 'node' ? 'bg-indigo-500 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'text-slate-500 border-slate-700 hover:text-white hover:border-slate-500'}`}
            >
              NODE FX
            </button>
            <button
              onClick={() => setViewMode(viewMode === 'spreadsheet' ? 'sequencer' : 'spreadsheet')}
              className={`px-2 py-1 rounded-xl transition-all text-xs border ${viewMode === 'spreadsheet' ? 'bg-emerald-500 border-emerald-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
              title="Spreadsheet View"
            >
              📊
            </button>
          </div>


          <div className="flex items-center gap-2 border-r border-slate-700 pr-3 mr-1">
            <button
              onClick={() => {
                const newIsPlaying = !isPlaying;
                setIsPlaying(newIsPlaying);
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
          <div className="flex items-center gap-2 px-1 md:px-2 border-l border-slate-700">
            <button
              onClick={() => setIsArrOpen(!isArrOpen)}
              className={`p-2 rounded-xl border transition-all text-[10px] font-black tracking-widest ${isArrOpen ? 'bg-indigo-500 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'text-slate-500 border-slate-700 hover:text-white hover:border-slate-500'}`}
              title="Toggle Arrangement Drawer"
            >
              ARR
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col gap-2 overflow-hidden pb-2">
        <section className="flex-1 bg-slate-900/40 rounded-xl p-2 border border-white/5 backdrop-blur-3xl shadow-2xl relative overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 min-h-0 bg-slate-900 overflow-hidden relative">
            {viewMode === 'sequencer' && (
              <CanvasSequencer
                grid={song[editingTrackIndex][editingPatternIndex]}
                rowConfigs={rowConfigs(currentScale)}
                onToggleNote={toggleNote}
                onAddNote={addNote}
                onCommitNote={handleCommitNote}
                onCommitMultiNote={handleCommitMultiNote}
                onCopyMultiNote={handleCopyMultiNote}
                onPreviewNote={(r, note) => previewNote(r, note, currentScale)}
                onSelectNotes={setSelectedNotes}
                selectedNotes={selectedNotes}
                playbackStep={playbackPatternIndex === editingPatternIndex ? playbackStep : -1}
                isPlaying={isPlaying}
                snap={snap}
                isUnrolled={isUnrolled}
                scrollTop={sequencerScrollTop}
                onSetScrollTop={setSequencerScrollTop}
              />
            )}
            {viewMode === 'spreadsheet' && (
              <SpreadsheetView
                grid={song[editingTrackIndex][editingPatternIndex]}
                rowConfigs={rowConfigs(currentScale)}
                onUpdateNote={handleUpdateNote}
              />
            )}
            {viewMode === 'node' && (
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
                trackLoops={trackLoops}
                rowConfigs={rowConfigs(currentScale)}
                onSelectPattern={(trackIdx, patIdx) => {
                  setEditingTrackIndex(trackIdx);
                  setEditingPatternIndex(patIdx);
                }}
                onInsertPattern={insertPattern}
                onDeletePattern={deletePattern}
                onAddTrack={addTrack}
                onDuplicatePattern={duplicatePattern}
                onQueuePattern={setQueuedPatternIndex}
                onTrackLoopChange={(trackIdx, range) => {
                  setTrackLoops((prev: (number[] | null)[]) => {
                    const next = [...prev];
                    next[trackIdx] = range;
                    return next;
                  });
                }}
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
      <ScalePieMenu
        isOpen={isPieMenuOpen}
        mousePos={pieMenuStartPos}
        currentScale={patternScales[editingTrackIndex]?.[editingPatternIndex] || 'C Maj Pent'}
        onSelectScale={(newScale) => {
          setIsPieMenuOpen(false);
          changePatternScale(editingTrackIndex, editingPatternIndex, newScale);
        }}
        onClose={() => setIsPieMenuOpen(false)}
      />
    </div >
  );
};

export default App;
