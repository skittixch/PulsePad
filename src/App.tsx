import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasSequencer } from './components/CanvasSequencer';
import { ArrangementView } from './components/ArrangementView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { NodalInterface } from './components/NodalInterface';
import { ScalePieMenu } from './components/ScalePieMenu';
import type { Note, RowConfig, Grid, FXGraph, Track, TrackPart } from './types';
import { STEPS_PER_PATTERN, SCALES, DEFAULT_DRUM_ROWS, PRESETS, generateBlankGrid, getLabelSemitones, getRowConfigs } from './constants';
import { audioEngine } from './audioEngine';



const remapGrid = (sourcePart: TrackPart, targetScaleName: string, targetUnrolled: boolean, sourceUnrolled: boolean): Grid => {
  const sourceConfigs = getRowConfigs(sourcePart.scale, sourceUnrolled);
  const targetConfigs = getRowConfigs(targetScaleName, targetUnrolled);
  const newGrid = generateBlankGrid(targetConfigs.length);

  sourcePart.grid.forEach((row, r) => {
    row.forEach((note, c) => {
      if (!note) return;
      const sourceLabel = sourceConfigs[r]?.label;
      if (!sourceLabel) return;

      const isDrum = sourceConfigs[r].type && sourceConfigs[r].type !== 'synth';
      if (isDrum) {
        // Find matching drum in target
        const targetR = targetConfigs.findIndex(cfg => cfg.type === sourceConfigs[r].type && cfg.label === sourceLabel);
        if (targetR !== -1) newGrid[targetR][c] = note;
        return;
      }

      // Synth note mapping
      const semi = getLabelSemitones(sourceLabel) + (note.oct || 0) * 12;
      let bestR = -1;
      let minDiff = Infinity;
      let bestOct = 0;

      targetConfigs.forEach((tCfg, tr) => {
        if (tCfg.type !== 'synth') return;
        const targetSemiBase = getLabelSemitones(tCfg.label);
        const octDiff = Math.round((semi - targetSemiBase) / 12);
        const diff = Math.abs(semi - (targetSemiBase + octDiff * 12));

        if (diff < minDiff) {
          minDiff = diff;
          bestR = tr;
          bestOct = octDiff;
        } else if (diff === minDiff && Math.abs(octDiff) < Math.abs(bestOct)) {
          bestR = tr;
          bestOct = octDiff;
        }
      });

      if (bestR !== -1) {
        newGrid[bestR][c] = { ...note, oct: targetUnrolled ? bestOct : 0 };
      }
    });
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
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
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
  const [isArrOpen, setIsArrOpen] = useState(true);
  const [arrHeight, setArrHeight] = useState(180);
  const [isResizingArr, setIsResizingArr] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<{ r: number, c: number }[]>([]);
  const [clipboard, setClipboard] = useState<{ r: number, c: number, note: Note }[] | null>(null);

  const [fxGraph, setFxGraph] = useState<FXGraph>(() => {
    const saved = localStorage.getItem('pulse_fx_graph');
    return saved ? JSON.parse(saved) : initialFXGraph;
  });
  const [lastCommittedGraph, setLastCommittedGraph] = useState<FXGraph>(fxGraph);

  const [tracks, setTracks] = useState<Track[]>(() => {
    const savedSong = localStorage.getItem('pulse_song');
    const savedScales = localStorage.getItem('pulse_pattern_scales');

    if (savedSong) {
      try {
        let parsedSong = JSON.parse(savedSong);
        let parsedScales = savedScales ? JSON.parse(savedScales) : [];

        if (parsedSong.length > 0 && Array.isArray(parsedSong[0]) && Array.isArray(parsedSong[0][0]) && !Array.isArray(parsedSong[0][0][0])) {
          parsedSong = [parsedSong];
        }

        return parsedSong.map((gridArray: Grid[], tIdx: number) => ({
          id: `track-${tIdx}-${Math.random().toString(36).substr(2, 9)}`,
          name: `Track ${tIdx + 1}`,
          parts: gridArray.map((grid, pIdx) => ({
            grid,
            scale: (parsedScales[tIdx]?.[pIdx]) || 'C Maj Pent'
          })),
          isLooping: true,
          volume: 1.0,
          muted: false,
          soloed: false
        }));
      } catch (e) {
        console.warn("Migration Failed, resetting:", e);
      }
    }

    return [{
      id: 'track-0',
      name: 'Track 1',
      parts: [{ grid: generateBlankGrid(8 + DEFAULT_DRUM_ROWS.length), scale: 'C Maj Pent' }],
      isLooping: true,
      volume: 1.0,
      muted: false,
      soloed: false
    }];
  });

  const currentTrack = tracks[editingTrackIndex] || tracks[0];
  const currentPart = currentTrack.parts[editingPatternIndex] || currentTrack.parts[0];


  const [history, setHistory] = useState<{ tracks: Track[], fxGraph: FXGraph }[]>([]);
  const [redoStack, setRedoStack] = useState<{ tracks: Track[], fxGraph: FXGraph }[]>([]);

  const playbackStepRef = useRef(0);
  const playbackPatternRef = useRef(0);
  const queuedPatternRef = useRef(-1);
  const trackLoopsRef = useRef<(number[] | null)[]>([]);
  const isFollowModeRef = useRef(true);
  const tracksRef = useRef<Track[]>(tracks);
  const bpmRef = useRef(bpm);
  const [trackLoops, setTrackLoops] = useState<(number[] | null)[]>([]);
  const isUnrolledRef = useRef(isUnrolled);
  const isPerformanceModeRef = useRef(isPerformanceMode);

  const trackSyncStatusRef = useRef<boolean[]>([]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { isUnrolledRef.current = isUnrolled; }, [isUnrolled]);
  useEffect(() => { trackLoopsRef.current = trackLoops; }, [trackLoops]);
  useEffect(() => {
    if (tracks.length !== trackSyncStatusRef.current.length) {
      trackSyncStatusRef.current = Array(tracks.length).fill(true);
    }
  }, [tracks.length]);





  // Dragging state for layout
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0 }); // Global mouse tracking for PIE menu start pos
  const [isPieMenuOpen, setIsPieMenuOpen] = useState(false);
  const [pieMenuStartPos, setPieMenuStartPos] = useState({ x: 0, y: 0 }); // Where menu opened

  const commitToHistory = useCallback((newTracks?: Track[], newGraph?: FXGraph) => {
    const nextTracks = newTracks || tracks;
    const nextGraph = newGraph || fxGraph;

    setHistory(prev => [...prev.slice(-19), { tracks: tracks, fxGraph: lastCommittedGraph }]);
    setRedoStack([]);

    setTracks(nextTracks);
    setFxGraph(nextGraph);
    setLastCommittedGraph(nextGraph);

    localStorage.setItem('pulse_song', JSON.stringify(nextTracks));
    localStorage.setItem('pulse_fx_graph', JSON.stringify(nextGraph));
  }, [tracks, fxGraph, lastCommittedGraph]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setRedoStack(prev => [...prev.slice(-19), { tracks: tracks, fxGraph: fxGraph }]);
    setHistory(prev => prev.slice(0, -1));

    setTracks(last.tracks);
    setFxGraph(last.fxGraph);
    setLastCommittedGraph(last.fxGraph);

    // Safety: Clamp indices if they are now out of bounds
    const trackCount = last.tracks.length;
    const patternCount = last.tracks[0]?.parts.length || 1;
    setEditingTrackIndex(ti => Math.min(ti, trackCount - 1));
    setEditingPatternIndex(pi => Math.min(pi, patternCount - 1));
  }, [history, tracks, fxGraph]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev.slice(-19), { tracks: tracks, fxGraph: fxGraph }]);
    setRedoStack(prev => prev.slice(0, -1));

    setTracks(next.tracks);
    setFxGraph(next.fxGraph);
    setLastCommittedGraph(next.fxGraph);

    // Safety: Clamp indices if they are now out of bounds
    const trackCount = next.tracks.length;
    const patternCount = next.tracks[0]?.parts.length || 1;
    setEditingTrackIndex(ti => Math.min(ti, trackCount - 1));
    setEditingPatternIndex(pi => Math.min(pi, patternCount - 1));
  }, [redoStack, tracks, fxGraph]);


  const timerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);

  const rowConfigs = useCallback((scaleName: string): RowConfig[] => {
    return getRowConfigs(scaleName, isUnrolled);
  }, [isUnrolled]);

  const previewNote = useCallback((r: number, note?: Note, scaleName: string = currentPart.scale) => {
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
  }, [rowConfigs, bpm, currentPart.scale]);

  const addNote = (r: number, c: number, d: number = 1, data?: Partial<Note>) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const part = { ...parts[editingPatternIndex] };
    const grid = [...part.grid];
    const row = [...grid[r]];
    const note = { d: Math.max(1, Math.round(d)), o: 0, ...data };
    row[c] = note;
    grid[r] = row;
    part.grid = grid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
    previewNote(r, note);
  };

  const toggleNote = (r: number, c: number) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const part = { ...parts[editingPatternIndex] };
    const grid = [...part.grid];
    const row = [...grid[r]];
    if (row[c]) {
      row[c] = null;
    } else {
      const note = { d: 1, o: 0 };
      row[c] = note;
      previewNote(r, note);
    }
    grid[r] = row;
    part.grid = grid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
  };

  const insertPattern = (atIndex: number) => {
    const newTracks = tracks.map(track => {
      const newPart: TrackPart = {
        grid: generateBlankGrid(getRowConfigs(track.parts[atIndex]?.scale || 'C Maj Pent', isUnrolled).length),
        scale: track.parts[atIndex]?.scale || 'C Maj Pent'
      };
      const nextParts = [...track.parts];
      nextParts.splice(atIndex + 1, 0, newPart);
      return { ...track, parts: nextParts };
    });
    commitToHistory(newTracks);
  };

  const deletePattern = (index: number) => {
    const newTracks = tracks.map(track => {
      if (track.parts.length <= 1) return track;
      const nextParts = [...track.parts];
      nextParts.splice(index, 1);
      return { ...track, parts: nextParts };
    });
    commitToHistory(newTracks);
  };

  const duplicatePattern = (index: number) => {
    const newTracks = tracks.map(track => {
      const sourcePart = track.parts[index];
      const newPart: TrackPart = {
        grid: sourcePart.grid.map(row => [...row]),
        scale: sourcePart.scale
      };
      const nextParts = [...track.parts];
      nextParts.splice(index + 1, 0, newPart);
      return { ...track, parts: nextParts };
    });
    commitToHistory(newTracks);
  };

  const addTrack = () => {
    const newTrack: Track = {
      id: `track-${tracks.length}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Track ${tracks.length + 1}`,
      parts: [
        {
          grid: generateBlankGrid(getRowConfigs('C Maj Pent', isUnrolled).length),
          scale: 'C Maj Pent'
        }
      ],
      isLooping: true,
      volume: 1.0,
      muted: false,
      soloed: false
    };
    commitToHistory([...tracks, newTrack]);
  };

  const handleCommitMultiNote = useCallback((notes: { fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note> }[]) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const part = { ...parts[editingPatternIndex] };
    const grid = JSON.parse(JSON.stringify(part.grid)); // Deep clone target grid

    // 1. Clear old positions
    notes.forEach(({ fromR, fromC }) => {
      if (grid[fromR]) grid[fromR][fromC] = null;
    });

    // 2. Set new positions
    notes.forEach(({ fromR, fromC, toR, toC, data }) => {
      const originalNote = tracks[editingTrackIndex].parts[editingPatternIndex].grid[fromR]?.[fromC];
      if (originalNote && grid[toR]) {
        grid[toR][toC] = { ...originalNote, ...data };
      }
    });

    part.grid = grid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);

    // Update selection to match new positions
    setSelectedNotes(notes.map(m => ({ r: m.toR, c: m.toC })));
    setToast({ message: `Moved ${notes.length} notes`, visible: true });
  }, [editingTrackIndex, editingPatternIndex, tracks, commitToHistory]);

  const handleCopyMultiNote = useCallback((notes: { fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note> }[]) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const part = { ...parts[editingPatternIndex] };
    const grid = JSON.parse(JSON.stringify(part.grid)); // Deep clone target grid

    // COPY: Do NOT clear old positions. Just set new ones.
    notes.forEach(({ fromR, fromC, toR, toC, data }) => {
      const originalNote = tracks[editingTrackIndex].parts[editingPatternIndex].grid[fromR]?.[fromC];
      if (originalNote && grid[toR]) {
        // If target cell occupied, OVERWRITE? Yes, standard behavior.
        grid[toR][toC] = { ...originalNote, ...data };
      }
    });

    part.grid = grid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
    setSelectedNotes(notes.map(m => ({ r: m.toR, c: m.toC })));
    setToast({ message: `Copied ${notes.length} notes`, visible: true });
  }, [editingTrackIndex, editingPatternIndex, tracks, commitToHistory]);

  const handleCommitNote = useCallback((fromR: number, fromC: number, toR: number, toC: number, data: Partial<Note>) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const currentPart = { ...parts[editingPatternIndex] };
    const currentGrid = [...currentPart.grid];
    const note = currentGrid[fromR]?.[fromC];

    if (!note) return;

    if (fromR !== toR || fromC !== toC) {
      currentGrid[fromR] = [...currentGrid[fromR]];
      currentGrid[fromR][fromC] = null;
    }

    const updatedNote = { ...note, ...data };
    currentGrid[toR] = [...currentGrid[toR]];
    currentGrid[toR][toC] = updatedNote;

    currentPart.grid = currentGrid;
    parts[editingPatternIndex] = currentPart;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;

    commitToHistory(newTracks);
    previewNote(toR, { ...data, d: data.d || 1, o: data.o || 0 });
  }, [editingTrackIndex, editingPatternIndex, tracks, commitToHistory, previewNote]);

  const handleUpdateNote = useCallback((r: number, c: number, data: Partial<Note>) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const currentPart = { ...parts[editingPatternIndex] };
    const currentGrid = [...currentPart.grid];
    const note = currentGrid[r]?.[c];
    if (!note) return;

    currentGrid[r] = [...currentGrid[r]];
    currentGrid[r][c] = { ...note, ...data };

    currentPart.grid = currentGrid;
    parts[editingPatternIndex] = currentPart;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
  }, [editingTrackIndex, editingPatternIndex, tracks, commitToHistory]);

  const handleRemix = () => {
    const keys = Object.keys(PRESETS);
    const style = keys[Math.floor(Math.random() * keys.length)];
    const preset = PRESETS[style];
    const newGrid = generateBlankGrid(rowConfigs(currentPart.scale).length);
    const hatRow = newGrid.length - 3;
    const snareRow = newGrid.length - 2;
    const kickRow = newGrid.length - 1;

    if (preset.kick) preset.kick.forEach((s: number) => newGrid[kickRow][s] = { d: 1, o: 0 });
    if (preset.snare) preset.snare.forEach((s: number) => newGrid[snareRow][s] = { d: 1, o: 0 });
    if (preset.hat) preset.hat.forEach((s: number) => newGrid[hatRow][s] = { d: 1, o: 0 });

    if (preset.bass) {
      const synthRowsCount = rowConfigs(currentPart.scale).length - DEFAULT_DRUM_ROWS.length;
      preset.bass.forEach((s: number) => {
        if (Math.random() > 0.5) newGrid[synthRowsCount - 1][s] = { d: 1, o: 0 };
      });
    }

    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const part = { ...parts[editingPatternIndex] };
    part.grid = newGrid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
    setToast({ message: `Style: ${style}`, visible: true });
  };

  const handleCopy = useCallback(() => {
    if (selectedNotes.length === 0) return;
    const currentGrid = tracks[editingTrackIndex].parts[editingPatternIndex].grid;
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
  }, [tracks, editingTrackIndex, editingPatternIndex, selectedNotes]);

  const handlePaste = useCallback(() => {
    if (!clipboard || clipboard.length === 0) return;
    setTracks(prevTracks => {
      const newTracks = [...prevTracks];
      const track = { ...newTracks[editingTrackIndex] };
      const parts = [...track.parts];
      const part = { ...parts[editingPatternIndex] };
      const grid = JSON.parse(JSON.stringify(part.grid)); // Deep clone target grid

      clipboard.forEach(({ r, c, note }) => {
        if (grid[r] && r < grid.length) {
          const targetC = c;
          if (targetC < STEPS_PER_PATTERN) {
            grid[r][targetC] = note;
          }
        }
      });

      part.grid = grid;
      parts[editingPatternIndex] = part;
      track.parts = parts;
      newTracks[editingTrackIndex] = track;
      commitToHistory(newTracks);
      return newTracks;
    });
    setToast({ message: `Pasted ${clipboard.length} notes`, visible: true });
  }, [clipboard, editingTrackIndex, editingPatternIndex, commitToHistory]);

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
      const centerR = (minR + maxR) / 2;
      const targetScroll = Math.max(0, (centerR * 40) - (arrHeight / 2) - 100);
      setSequencerScrollTop(targetScroll);
    }
  }, [arrHeight]);

  const changePatternScale = useCallback((trackIdx: number, partIdx: number, newScale: string) => {
    const currentTracks = tracksRef.current;
    if (!currentTracks[trackIdx] || !currentTracks[trackIdx].parts[partIdx]) return;

    const sourcePart = currentTracks[trackIdx].parts[partIdx];
    const sourceScale = sourcePart.scale;
    if (sourceScale === newScale) return;

    const newGrid = remapGrid(sourcePart, newScale, isUnrolledRef.current, isUnrolledRef.current);

    const nextTracks = currentTracks.map((trk, t) => {
      if (t !== trackIdx) return trk;
      const nextParts = trk.parts.map((prt, p) => {
        if (p !== partIdx) return prt;
        return { ...prt, grid: newGrid, scale: newScale };
      });
      return { ...trk, parts: nextParts };
    });

    commitToHistory(nextTracks);
    setToast({ message: `Scale: ${newScale}`, visible: true });

    if (!isUnrolledRef.current) {
      setSequencerScrollTop(0);
    } else {
      fitSequencerToNotes(newGrid, getRowConfigs(newScale, true));
    }
  }, [commitToHistory, fitSequencerToNotes]);

  const remapSongLayout = useCallback((targetUnrolled: boolean, sourceUnrolled: boolean) => {
    const nextTracks = tracksRef.current.map(track => ({
      ...track,
      parts: track.parts.map(part => ({
        ...part,
        grid: remapGrid(part, part.scale, targetUnrolled, sourceUnrolled)
      }))
    }));
    setTracks(nextTracks);

    if (targetUnrolled) {
      const currentPart = nextTracks[editingTrackIndex].parts[editingPatternIndex];
      fitSequencerToNotes(currentPart.grid, getRowConfigs(currentPart.scale, true));
    }
  }, [editingTrackIndex, editingPatternIndex, fitSequencerToNotes]);

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setToast({ message: "CLICK AGAIN TO NUCLEAR RESET", visible: true });
      setTimeout(() => setResetArmed(false), 5000); // 5 sec window
      return;
    }

    // NUCLEAR RESET - TOTAL WIPE (Preserving Undo)
    const emptyTracks: Track[] = [{
      id: 'track-0',
      name: 'Track 1',
      parts: [{ grid: generateBlankGrid(getRowConfigs('C Maj Pent', isUnrolled).length), scale: 'C Maj Pent' }],
      isLooping: true,
      volume: 1.0,
      muted: false,
      soloed: false
    }];

    setEditingTrackIndex(0);
    setEditingPatternIndex(0);
    setPlaybackPatternIndex(0);
    setViewMode('sequencer');
    setResetArmed(false);
    setArrHeight(180);

    commitToHistory(emptyTracks, {
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
        const currentTracks = tracksRef.current;
        const currentBpm = bpmRef.current;
        const currentLoops = trackLoopsRef.current;

        // Play all tracks for this step
        currentTracks.forEach((track, trackIdx) => {
          if (track.muted) return;
          // Solo logic
          const hasSolo = currentTracks.some(t => t.soloed);
          if (hasSolo && !track.soloed) return;

          let partIdx = globalPattern;
          const myLoop = currentLoops[trackIdx];

          if (myLoop) {
            const [start, end] = myLoop;
            const loopLen = (end - start) + 1;
            partIdx = start + (globalPattern % loopLen);
            trackSyncStatusRef.current[trackIdx] = true;
          } else {
            // Check if track has this part index
            if (partIdx >= track.parts.length) {
              if (track.isLooping && track.parts.length > 0) {
                partIdx = globalPattern % track.parts.length;
              } else {
                return; // Past the end of non-looping track
              }
            }
          }

          const part = track.parts[partIdx];
          if (part && part.grid) {
            const patternRowConfigs = getRowConfigs(part.scale, isUnrolledRef.current);
            audioEngine.playStep(part.grid, currentStep, nextNoteTimeRef.current, patternRowConfigs, currentBpm, track.volume);
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
            const maxParts = Math.max(...currentTracks.map(t => t.parts.length), 1);
            if (isPerformanceModeRef.current && globalPattern === maxParts - 1) {
              // Auto-duplicate last part for all tracks to keep the performance going
              setTimeout(() => {
                setTracks(prev => {
                  const next = prev.map(track => {
                    const lastPart = track.parts[track.parts.length - 1];
                    const newPart: TrackPart = {
                      grid: lastPart.grid.map(row => [...row]),
                      scale: lastPart.scale
                    };
                    return { ...track, parts: [...track.parts, newPart] };
                  });
                  return next;
                });
              }, 0);
              nextPattern = globalPattern + 1;
            } else {
              nextPattern = (globalPattern + 1) % maxParts;
            }
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
  }, [audioEngine]);

  useEffect(() => {
    bpmRef.current = bpm;
    audioEngine.setBpm(bpm);
  }, [bpm]);
  useEffect(() => { isPerformanceModeRef.current = isPerformanceMode; }, [isPerformanceMode]);
  useEffect(() => { queuedPatternRef.current = queuedPatternIndex; }, [queuedPatternIndex]);
  useEffect(() => { isFollowModeRef.current = isFollowMode; }, [isFollowMode]);
  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);



  // Auto-center grid on note
  useEffect(() => {
    if (viewMode !== 'sequencer' || !isUnrolled) return;
    const currentGrid = tracks[editingTrackIndex]?.parts[editingPatternIndex]?.grid;
    if (!currentGrid) return;

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
  }, [editingTrackIndex, editingPatternIndex, isUnrolled, viewMode, currentPart.scale, tracks]);

  useEffect(() => { audioEngine.setMasterVolume(masterVolume); }, [masterVolume]);

  useEffect(() => {
    if (audioEngine.ctx) {
      audioEngine.rebuildFXGraph(fxGraph);
    }
    localStorage.setItem('pulse_fx_graph', JSON.stringify(fxGraph));
  }, [fxGraph]);

  useEffect(() => {
    localStorage.setItem('pulse_song', JSON.stringify(tracks));
  }, [tracks]);


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
          const newTracks = [...tracks];
          const track = { ...newTracks[editingTrackIndex] };
          const parts = [...track.parts];
          const part = { ...parts[editingPatternIndex] };
          const grid = [...part.grid];
          selectedNotes.forEach(({ r, c }) => {
            grid[r] = [...grid[r]];
            grid[r][c] = null;
          });
          part.grid = grid;
          parts[editingPatternIndex] = part;
          track.parts = parts;
          newTracks[editingTrackIndex] = track;
          commitToHistory(newTracks);
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
  }, [handleUndo, handleRedo, duplicatePattern, editingPatternIndex, isResizingArr, selectedNotes, editingTrackIndex, handleCopy, handlePaste, setIsPlaying, tracks, commitToHistory, setToast]);


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
                value={currentPart.scale}
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
                  const target = !isUnrolled;
                  remapSongLayout(target, isUnrolled);
                  setIsUnrolled(target);
                  setSequencerScrollTop(0); // Reset scroll on toggle
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
                grid={currentPart.grid}
                rowConfigs={getRowConfigs(currentPart.scale, isUnrolled)}
                onToggleNote={toggleNote}
                onAddNote={addNote}
                onCommitNote={handleCommitNote}
                onCommitMultiNote={handleCommitMultiNote}
                onCopyMultiNote={handleCopyMultiNote}
                onPreviewNote={(r, note) => previewNote(r, note, currentPart.scale)}
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
                grid={currentPart.grid}
                rowConfigs={getRowConfigs(currentPart.scale, isUnrolled)}
                onUpdateNote={handleUpdateNote}
              />
            )}
            {viewMode === 'node' && (
              <NodalInterface
                graph={fxGraph}
                onUpdateGraph={setFxGraph}
                onCommitGraph={(newGraph) => commitToHistory(tracks, newGraph)}
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
                tracks={tracks}
                editingTrackIndex={editingTrackIndex}
                editingPatternIndex={editingPatternIndex}
                playbackPatternIndex={playbackPatternIndex}
                queuedPatternIndex={queuedPatternIndex}
                trackLoops={trackLoops}
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
                isPerformanceMode={isPerformanceMode}
                onSetPerformanceMode={setIsPerformanceMode}
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
        currentScale={currentPart.scale}
        onSelectScale={(newScale) => {
          setIsPieMenuOpen(false);
          changePatternScale(editingTrackIndex, editingPatternIndex, newScale);
        }}
        onClose={() => setIsPieMenuOpen(false)}
      />
    </div>
  );
};

export default App;
