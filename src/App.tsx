import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CanvasSequencer } from './components/CanvasSequencer';
import { ArrangementView } from './components/ArrangementView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { VerticalZoomScrollbar } from './components/VerticalZoomScrollbar';
import { NodalInterface } from './components/NodalInterface';
import type { NodalInterfaceRef } from './components/NodalInterface';
import { ScalePieMenu } from './components/ScalePieMenu';
import { VolumeMeter } from './components/VolumeMeter';
import { InstrumentDrawer } from './components/InstrumentDrawer';
import { AuthModal } from './components/AuthModal';
import { ShareModal } from './components/ShareModal';
import { SongListModal } from './components/SongListModal';
import { WelcomeOverlay } from './components/WelcomeOverlay';
import { OnboardingModal } from './components/OnboardingModal';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { AdBanner } from './components/AdBanner';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Note, RowConfig, Grid, FXGraph, FXNode, Track, TrackPart, SoundConfig } from './types';
import { STEPS_PER_PATTERN, SCALES, DEFAULT_DRUM_ROWS, generateBlankGrid, getLabelSemitones, getRowConfigs, NOTE_TO_SEMI, DEFAULT_SOUND_CONFIG, CHROMATIC_LABELS } from './constants';
import { DRUM_ARCHIVE } from './drumPatterns';
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
        // PRESERVE OCTAVE: Use bestOct even in Key View to maintain pitch
        newGrid[bestR][c] = { ...note, oct: bestOct };
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
    { source: 'src', target: 'out', sourcePort: 'main' }
  ],
  nextId: 1
};

// Helper to detect reload action
const isReloadAction = () => {
  const entries = performance.getEntriesByType("navigation");
  if (entries.length > 0) {
    return (entries[0] as PerformanceNavigationTiming).type === 'reload';
  }
  return performance.navigation.type === 1;
};

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(() => {
    const isReload = isReloadAction();
    const saved = localStorage.getItem('pulse_bpm');
    if (isReload) return 120;
    return saved ? parseInt(saved) : 120;
  });
  const [editingTrackIndex, setEditingTrackIndex] = useState(0);
  const [editingPatternIndex, setEditingPatternIndex] = useState(0);
  const [isPerformanceMode, setIsPerformanceMode] = useState(() => {
    const isReload = isReloadAction();
    const saved = localStorage.getItem('pulse_perf_mode');
    if (isReload) return false;
    return saved === 'true';
  });
  const [playbackStep, setPlaybackStep] = useState(0);
  const [playbackPatternIndex, setPlaybackPatternIndex] = useState(0);
  const [sequencerScrollTop, setSequencerScrollTop] = useState(0);
  const [sequencerRowHeight, setSequencerRowHeight] = useState(40);
  const [queuedPatternIndex, setQueuedPatternIndex] = useState<number>(-1);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const [isBuildMode, setIsBuildMode] = useState(() => {
    const isReload = isReloadAction();
    const saved = localStorage.getItem('pulse_build_mode');
    if (isReload) return false;
    return saved === 'true';
  });
  const isBuildModeRef = useRef(isBuildMode);
  const [isUnrolled, setIsUnrolled] = useState(false);

  const [viewMode, setViewMode] = useState<'sequencer' | 'node' | 'spreadsheet'>('sequencer');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [masterVolume] = useState(0.8);
  const [snap] = useState<1 | 2 | 4>(1);
  const [isArrOpen, setIsArrOpen] = useState(() => window.innerWidth >= 768);
  const [isResizingArr, setIsResizingArr] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<{ r: number, c: number }[]>([]);
  const nodalRef = useRef<NodalInterfaceRef>(null);
  const [clipboard, setClipboard] = useState<{ r: number, c: number, note: Note }[] | null>(null);

  const [openDrawerTrackIndex, setOpenDrawerTrackIndex] = useState<number | null>(null);

  // Auth & Sharing State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [debugAdMode, setDebugAdMode] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSongListOpen, setIsSongListOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPianoMode, setIsPianoMode] = useState(false);
  const [globalOctaveShift, setGlobalOctaveShift] = useState(0);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setIsProfileMenuOpen(false);
      setToast({ message: "Logged Out", visible: true });
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  // Sanitize FX Graph data to prevent audio engine crashes
  const sanitizeFXGraph = (graph: FXGraph): FXGraph => {
    if (!graph || !Array.isArray(graph.nodes)) return { nodes: [], connections: [] };

    let nodes = [...graph.nodes];
    const nodeIds = new Set(nodes.map(n => n.id));

    // Ensure Output node exists
    if (!nodes.find(n => n.type === 'output')) {
      const outputNode: FXNode = { id: 'output', type: 'output', x: 800, y: 300, params: {} };
      nodes.push(outputNode);
      nodeIds.add('output');
    }

    // Filter invalid connections
    const validConnections = (graph.connections || []).filter(conn => {
      const srcExists = conn.source === 'src' || nodeIds.has(conn.source);
      const targetExists = nodeIds.has(conn.target);
      return srcExists && targetExists;
    });

    return {
      nodes,
      connections: validConnections,
      nextId: graph.nextId || Math.max(0, ...nodes.filter(n => n.id.startsWith('node_')).map(n => parseInt(n.id.split('_')[1]))) + 1
    };
  };



  const calculateOptimalHeight = useCallback((tracksOverride?: Track[]) => {
    const headerHeight = 40;
    const trackHeight = 56;
    const t = tracksOverride || tracksRef.current;
    const targetHeight = headerHeight + (t.length * trackHeight) + 20;
    return Math.max(80, Math.min(window.innerHeight * 0.8, targetHeight));
  }, []);

  const handleLoadSong = (songData: any, songId: string, showWelcome: boolean = true) => {
    try {
      const parsed = typeof songData === 'string' ? JSON.parse(songData) : songData;
      if (!parsed) return;

      const newTracks = parsed.tracks || tracks; // Fallback to current if missing (shouldn't happen on good save)
      const newBpm = parsed.bpm || 120;

      // SANITIZE GRAPH
      let newGraph = parsed.fxGraph;
      if (newGraph) {
        newGraph = sanitizeFXGraph(newGraph);
      } else {
        newGraph = {
          nodes: [{ id: 'output', type: 'output', x: 800, y: 300, params: {} }],
          connections: []
        };
      }

      // Update state via commitToHistory to ensure persistence and undo capability
      commitToHistory(newTracks, newGraph, newBpm, parsed.loops || [], parsed.isBuildMode || false, parsed.isPerformanceMode || false);

      setCurrentSongId(songId);
      setEditingTrackIndex(0);
      setEditingPatternIndex(0);
      setArrHeight(calculateOptimalHeight(newTracks));

      // Welcome Data
      if (showWelcome) {
        if (parsed.welcomeData) {
          setWelcomeData(parsed.welcomeData);
        } else if (parsed.name) {
          setWelcomeData({
            name: parsed.name,
            authorName: parsed.authorName,
            authorPhotoUrl: parsed.authorPhotoUrl,
            linerNotes: parsed.linerNotes
          });
        }
      }

      setToast({ message: `Loaded "${parsed.name || 'Song'}"`, visible: true });
    } catch (e) {
      console.error("Error applying song data", e);
      setToast({ message: "Error Loading Song", visible: true });
    }
  };
  const [activeRowsByKeyboard, setActiveRowsByKeyboard] = useState<Record<number, boolean>>({});
  const keyboardVoicesRef = useRef<Map<string, any>>(new Map());
  const [welcomeData, setWelcomeData] = useState<any>(null);

  const [fxGraph, setFxGraph] = useState<FXGraph>(() => {
    const isReload = isReloadAction();
    const saved = localStorage.getItem('pulse_fx_graph');
    if (isReload) return initialFXGraph;
    return saved ? JSON.parse(saved) : initialFXGraph;
  });
  const [lastCommittedGraph, setLastCommittedGraph] = useState<FXGraph>(fxGraph);

  const [trackLoops, setTrackLoops] = useState<(number[] | null)[]>(() => {
    const isReload = isReloadAction();
    const saved = localStorage.getItem('pulse_loops');
    if (isReload) return [];
    return saved ? JSON.parse(saved) : [];
  });

  const [tracks, setTracks] = useState<Track[]>(() => {
    const isReload = isReloadAction();
    const savedSong = localStorage.getItem('pulse_song');
    const savedScales = localStorage.getItem('pulse_pattern_scales');

    if (savedSong && !isReload) {
      try {
        let parsedSong = JSON.parse(savedSong);
        let parsedScales = savedScales ? JSON.parse(savedScales) : [];

        if (parsedSong.length > 0 && Array.isArray(parsedSong[0]) && Array.isArray(parsedSong[0][0]) && !Array.isArray(parsedSong[0][0][0])) {
          parsedSong = [parsedSong];
        }

        return parsedSong.map((gridArray: Grid[], tIdx: number) => ({
          id: `track-${tIdx}-${Math.random().toString(36).substr(2, 9)}`,
          name: `Track ${tIdx + 1}`,
          parts: Array.isArray(gridArray) ? gridArray.map((grid, pIdx) => ({
            grid,
            scale: (parsedScales[tIdx]?.[pIdx]) || 'C Maj Pent'
          })) : [{ grid: generateBlankGrid(getRowConfigs('C Maj Pent', isUnrolled).length), scale: 'C Maj Pent' }],
          isLooping: true,
          volume: 1.0,
          muted: false,
          soloed: false,
          instrument: DEFAULT_SOUND_CONFIG
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
      soloed: false,
      instrument: DEFAULT_SOUND_CONFIG
    }];
  });

  const [arrHeight, setArrHeight] = useState(() => {
    const headerHeight = 40;
    const trackHeight = 56;
    const targetHeight = headerHeight + (tracks.length * trackHeight) + 20;
    // Default cap slightly lower than update cap to be safe on initial load if window is weird, but using window.innerHeight is fine generally
    return Math.max(80, Math.min(window.innerHeight * 0.8, targetHeight));
  });

  const showToast = useCallback((msg: string) => {
    setToast({ visible: true, message: msg });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2000);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser: User | null) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      if (currentUser) {
        setIsAuthModalOpen(false);
      }
    });

    const params = new URLSearchParams(window.location.search);
    const songId = params.get('song');
    if (songId) {
      const loadSong = async () => {
        try {
          const docRef = doc(db, 'songs', songId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const parsedData = JSON.parse(data.data);
            handleLoadSong(parsedData, songId, true);
          } else {
            showToast("Song not found.");
          }
        } catch (e) {
          console.error("Error loading song:", e);
          showToast("Failed to load song.");
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      loadSong();
    }
    return () => unsubscribe();
  }, [showToast]);

  const currentTrack = tracks[editingTrackIndex] || tracks[0];
  const currentPart = currentTrack.parts[editingPatternIndex] || currentTrack.parts[0];

  useEffect(() => {
    // Piano keys extended to include Backslash
    const EXTENDED_PIANO_KEYS = [
      'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'
    ];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle View Mode with TAB
      if (e.key === 'Tab') {
        e.preventDefault();
        setViewMode(prev => prev === 'sequencer' ? 'node' : 'sequencer');
        return;
      }

      if (e.code === 'Space') {
        // If typing in an input, let it be
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        e.preventDefault();
        e.stopPropagation();

        // Remove focus from any button to prevent "activation"
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        togglePlayback();
        return;
      }

      // Toggle Piano Mode based on CapsLock
      const capsOn = e.getModifierState('CapsLock');
      setIsPianoMode(capsOn);

      // Global Octave Control
      if (e.code === 'NumpadAdd' || (e.code === 'Equal' && e.shiftKey)) {
        e.preventDefault();
        setGlobalOctaveShift(prev => {
          const next = prev + 1;
          showToast(`Global Octave: ${next > 0 ? '+' : ''}${next}`);
          return next;
        });
        return;
      }
      if (e.code === 'NumpadSubtract' || e.code === 'Minus') {
        e.preventDefault();
        setGlobalOctaveShift(prev => {
          const next = prev - 1;
          showToast(`Global Octave: ${next > 0 ? '+' : ''}${next}`);
          return next;
        });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();

        if (user) {
          if (currentSongId) {
            // Quick Save
            const saveSong = async () => {
              setToast({ message: "Saving...", visible: true });
              try {
                const songPayload = {
                  data: JSON.stringify({
                    name: welcomeData?.name || tracksRef.current[0]?.name || "Pulse Project",
                    tracks: tracksRef.current,
                    bpm: bpmRef.current,
                    fxGraph: fxGraphRef.current,
                    loops: trackLoopsRef.current,
                    isBuildMode: isBuildModeRef.current,
                    isPerformanceMode: isPerformanceModeRef.current
                  }),
                  updatedAt: serverTimestamp(),
                  authorName: user.displayName || 'Anonymous',
                  authorPhotoUrl: user.photoURL
                };

                await setDoc(doc(db, 'songs', currentSongId), songPayload, { merge: true });

                // Copy Link
                const link = `${window.location.origin}?song=${currentSongId}`;
                await navigator.clipboard.writeText(link);

                setToast({ message: "Saved & Link Copied!", visible: true });
              } catch (err) {
                console.error("Quick Save Failed", err);
                setToast({ message: "Save Failed", visible: true });
              }
            };
            saveSong();
          } else {
            setIsShareModalOpen(true);
          }
        } else {
          // Logged OUT: Always prompt login
          setIsAuthModalOpen(true);
        }
        return;
      }

      // Home key reset
      if (e.key === 'Home') {
        e.preventDefault();
        playbackStepRef.current = 0;
        playbackPatternRef.current = 0;
        setPlaybackStep(0);
        setPlaybackPatternIndex(0);
        setEditingTrackIndex(0);
        setEditingPatternIndex(0);
        setIsFollowMode(true);
        showToast("Reset to start & Follow ON");
        return;
      }

      if (capsOn) {
        setIsPianoMode(true);
        const keyIndex = EXTENDED_PIANO_KEYS.indexOf(e.code);
        if (keyIndex !== -1) {
          e.preventDefault();
          if (keyboardVoicesRef.current.has(e.code)) return; // No repeat

          const configs = getRowConfigs(currentPart.scale, isUnrolled);
          const drumCount = 3; // hat, snare, kick
          const synthRowCount = configs.length - drumCount;

          // Mapping:
          // 0,1,2 -> Drums (A, S, D)
          // 3..N -> Synths (F... )

          let targetRow = -1;

          if (keyIndex === 0) targetRow = synthRowCount + 2; // A -> Kick
          else if (keyIndex === 1) targetRow = synthRowCount + 1; // S -> Snare
          else if (keyIndex === 2) targetRow = synthRowCount + 0; // D -> Hat
          else {
            const synthIndex = keyIndex - 3;
            // Rows are ordered top-to-bottom in array? Or bottom-to-top?
            // "targetRow = (synthRowCount - 1) - synthIndex" implies Array[0] is HIGH pitch, Array[Last] is LOW pitch.
            // So index 0 (F) maps to Lowest Synth Row?
            // Wait, (synthRowCount - 1) is the LAST index of synth rows.
            // If synthIndex=0, targetRow = MaxIndex.
            // If getRowConfigs returns High->Low (Standard for grid rendering), then MaxIndex is Lowest Pitch.
            // So keys F.. Right map to Low..High?
            // Let's check: (synthRowCount - 1) - 0 = Last Row (Low).
            // (synthRowCount - 1) - 1 = Penultimate (Higher).
            // So F -> Low, G -> Higher... correct.

            // EXTENSION LOGIC:
            // For now, simpler logic: Only play if row exists.

            let calculatedRow = (synthRowCount - 1) - synthIndex;
            targetRow = calculatedRow;
          }

          if (targetRow >= 0 && configs[targetRow]) {
            setActiveRowsByKeyboard(prev => ({ ...prev, [targetRow]: true }));
            const config = configs[targetRow];
            const soundConfig = currentTrack.instrument;
            const freq = config.type === 'synth' ? config.freq * Math.pow(2, globalOctaveShift) : config.freq;

            audioEngine.init();
            audioEngine.resume();

            if (config.type === 'synth') {
              const voice = audioEngine.triggerSynth(freq, config.gain, undefined, soundConfig);
              keyboardVoicesRef.current.set(e.code, voice);
            } else if (config.type === 'kick') audioEngine.createKick(audioEngine.ctx!.currentTime, config.gain, soundConfig);
            else if (config.type === 'snare') audioEngine.createSnare(audioEngine.ctx!.currentTime, config.gain, soundConfig);
            else if (config.type === 'hat') audioEngine.createHiHat(audioEngine.ctx!.currentTime, config.gain, soundConfig);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const capsOn = e.getModifierState('CapsLock');
      setIsPianoMode(capsOn);

      const keyIndex = EXTENDED_PIANO_KEYS.indexOf(e.code);
      if (keyIndex !== -1) {
        const configs = getRowConfigs(currentPart.scale, isUnrolled);
        const drumCount = 3;
        const synthRowCount = configs.length - drumCount;
        let targetRow = -1;

        if (keyIndex === 0) targetRow = synthRowCount + 2;
        else if (keyIndex === 1) targetRow = synthRowCount + 1;
        else if (keyIndex === 2) targetRow = synthRowCount + 0;
        else {
          const synthIndex = keyIndex - 3;
          targetRow = (synthRowCount - 1) - synthIndex;
          // Note: If we added calculating logic in handleKeyDown, strictly we should mirror it here
          // to knowing which row to turn off. 
          // Since we used simplifed logic (targetRow = calculatedRow), this matches.
        }

        if (targetRow !== -1) {
          setActiveRowsByKeyboard(prev => {
            const next = { ...prev };
            delete next[targetRow];
            return next;
          });
        }
      }

      if (keyboardVoicesRef.current.has(e.code)) {
        const voice = keyboardVoicesRef.current.get(e.code);
        audioEngine.stopSynth(voice, currentTrack.instrument);
        keyboardVoicesRef.current.delete(e.code);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [user, currentPart.scale, isUnrolled, currentTrack.instrument, showToast]);



  const [history, setHistory] = useState<{ tracks: Track[], fxGraph: FXGraph, bpm: number, loops: (number[] | null)[] }[]>(() => {
    const isReload = isReloadAction();
    if (!isReload) return [];

    const savedSong = localStorage.getItem('pulse_song');
    if (!savedSong) return [];

    // If we are reloading, we want to pop the persisted state into history so it can be undone
    // We need to reconstruct the full state from localStorage similar to how we did in the initializers
    try {
      // Re-use logic or duplicate slightly for safety
      const savedScales = localStorage.getItem('pulse_pattern_scales');
      let parsedSong = JSON.parse(savedSong);
      let parsedScales = savedScales ? JSON.parse(savedScales) : [];
      // ... (simplified migration logic if needed, but assuming saved state is valid if we are restoring)
      if (parsedSong.length > 0 && Array.isArray(parsedSong[0]) && Array.isArray(parsedSong[0][0]) && !Array.isArray(parsedSong[0][0][0])) {
        parsedSong = [parsedSong];
      }
      const restoredTracks = parsedSong.map((gridArray: Grid[], tIdx: number) => ({
        id: `track-${tIdx}`, // ID generation doesn't match exactly but functional
        name: `Track ${tIdx + 1}`,
        parts: Array.isArray(gridArray) ? gridArray.map((grid, pIdx) => ({
          grid,
          scale: (parsedScales[tIdx]?.[pIdx]) || 'C Maj Pent'
        })) : [{ grid: generateBlankGrid(getRowConfigs('C Maj Pent', false).length), scale: 'C Maj Pent' }],
        isLooping: true,
        volume: 1.0,
        muted: false,
        soloed: false,
        instrument: DEFAULT_SOUND_CONFIG
      }));

      const savedGraphStr = localStorage.getItem('pulse_fx_graph');
      const restoredGraph = savedGraphStr ? JSON.parse(savedGraphStr) : initialFXGraph;

      const savedBpm = localStorage.getItem('pulse_bpm');
      const restoredBpm = savedBpm ? parseInt(savedBpm) : 120;

      const savedLoops = localStorage.getItem('pulse_loops');
      const restoredLoops = savedLoops ? JSON.parse(savedLoops) : [];

      return [{ tracks: restoredTracks, fxGraph: restoredGraph, bpm: restoredBpm, loops: restoredLoops }];
    } catch (e) {
      console.error("Failed to restore history from localStorage", e);
      return [];
    }
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    const seen = localStorage.getItem('pulse_seen_onboarding');
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  const [redoStack, setRedoStack] = useState<{ tracks: Track[], fxGraph: FXGraph, bpm: number, loops: (number[] | null)[] }[]>([]);

  const playbackStepRef = useRef(0);
  const playbackPatternRef = useRef(0);
  const queuedPatternRef = useRef(-1);
  const trackLoopsRef = useRef<(number[] | null)[]>([]);
  const isFollowModeRef = useRef(true);
  const tracksRef = useRef<Track[]>(tracks);
  const bpmRef = useRef(bpm);
  const fxGraphRef = useRef<FXGraph>(fxGraph);
  // trackLoops state moved up
  const isUnrolledRef = useRef(isUnrolled);
  const isPerformanceModeRef = useRef(isPerformanceMode);
  const activePreviewVoiceRef = useRef<any>(null);

  const trackSyncStatusRef = useRef<boolean[]>([]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { fxGraphRef.current = fxGraph; }, [fxGraph]);
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const currentHeightRef = useRef<number>(180); // To track height without state updates
  const mousePosRef = useRef({ x: 0, y: 0 }); // Global mouse tracking for PIE menu start pos
  const [selectedPatterns, setSelectedPatterns] = useState<{ tIdx: number, pIdx: number }[]>([]);
  const [isPieMenuOpen, setIsPieMenuOpen] = useState(false);
  const [pieMenuStartPos, setPieMenuStartPos] = useState({ x: 0, y: 0 }); // Where menu opened

  const commitToHistory = useCallback((
    newTracks?: Track[],
    newGraph?: FXGraph,
    newBpm?: number,
    newLoops?: (number[] | null)[],
    newBuildMode?: boolean,
    newPerfMode?: boolean
  ) => {
    const nextTracks = newTracks || tracks;
    const nextGraph = newGraph || fxGraph;
    const nextBpm = newBpm !== undefined ? newBpm : bpm;
    const nextLoops = newLoops || trackLoops;
    const nextBuildMode = newBuildMode !== undefined ? newBuildMode : isBuildMode;
    const nextPerfMode = newPerfMode !== undefined ? newPerfMode : isPerformanceMode;

    // Limit history stack to 30 items to save memory
    setHistory(prev => {
      const next = [...prev, { tracks: tracks, fxGraph: lastCommittedGraph, bpm: bpm, loops: trackLoops }];
      if (next.length > 30) return next.slice(next.length - 30);
      return next;
    });
    setRedoStack([]);

    if (newTracks) setTracks(newTracks);
    if (newGraph) {
      setFxGraph(newGraph);
      setLastCommittedGraph(newGraph);
    }
    if (newBpm !== undefined) setBpm(newBpm);
    if (newLoops) setTrackLoops(newLoops);
    if (newBuildMode !== undefined) setIsBuildMode(newBuildMode);
    if (newPerfMode !== undefined) setIsPerformanceMode(newPerfMode);

    localStorage.setItem('pulse_song', JSON.stringify(nextTracks));
    const gridsOnly = nextTracks.map(t => t.parts.map(p => p.grid));
    localStorage.setItem('pulse_song', JSON.stringify(gridsOnly));

    const scalesOnly = nextTracks.map(t => t.parts.map(p => p.scale));
    localStorage.setItem('pulse_pattern_scales', JSON.stringify(scalesOnly));

    localStorage.setItem('pulse_fx_graph', JSON.stringify(nextGraph));
    localStorage.setItem('pulse_bpm', nextBpm.toString());
    localStorage.setItem('pulse_loops', JSON.stringify(nextLoops));
    localStorage.setItem('pulse_build_mode', nextBuildMode.toString());
    localStorage.setItem('pulse_perf_mode', nextPerfMode.toString());
  }, [tracks, fxGraph, lastCommittedGraph, bpm, trackLoops, isBuildMode, isPerformanceMode]);

  const togglePlayback = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      if (next) {
        // Reset to start of song on Play
        setPlaybackStep(0);
        setPlaybackPatternIndex(0);
        playbackStepRef.current = 0;
        playbackPatternRef.current = 0;
      }
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setRedoStack(prev => [...prev.slice(-19), { tracks: tracks, fxGraph: fxGraph, bpm: bpm, loops: trackLoops }]);
    setHistory(prev => prev.slice(0, -1));

    setTracks(last.tracks);
    setFxGraph(last.fxGraph);
    setLastCommittedGraph(last.fxGraph);
    setBpm(last.bpm);
    setTrackLoops(last.loops);

    // Safety: Clamp indices if they are now out of bounds
    const trackCount = last.tracks.length;
    const patternCount = last.tracks[0]?.parts.length || 1;
    setEditingTrackIndex(ti => Math.min(ti, trackCount - 1));
    setEditingPatternIndex(pi => Math.min(pi, patternCount - 1));
  }, [history, tracks, fxGraph, bpm, trackLoops]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev.slice(-19), { tracks: tracks, fxGraph: fxGraph, bpm: bpm, loops: trackLoops }]);
    setRedoStack(prev => prev.slice(0, -1));

    setTracks(next.tracks);
    setFxGraph(next.fxGraph);
    setLastCommittedGraph(next.fxGraph);
    setBpm(next.bpm);
    setTrackLoops(next.loops);

    // Safety: Clamp indices if they are now out of bounds
    const trackCount = next.tracks.length;
    const patternCount = next.tracks[0]?.parts.length || 1;
    setEditingTrackIndex(ti => Math.min(ti, trackCount - 1));
    setEditingPatternIndex(pi => Math.min(pi, patternCount - 1));
  }, [redoStack, tracks, fxGraph, bpm, trackLoops]);


  const timerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);

  const rowConfigs = useCallback((scaleName: string): RowConfig[] => {
    return getRowConfigs(scaleName, isUnrolled);
  }, [isUnrolled]);

  const stopPreview = useCallback(() => {
    if (activePreviewVoiceRef.current) {
      audioEngine.stopSynth(activePreviewVoiceRef.current);
      activePreviewVoiceRef.current = null;
    }
  }, []);

  const startPreview = useCallback((r: number, note?: Note, scaleName: string = currentPart.scale) => {
    audioEngine.init();
    audioEngine.resume();
    audioEngine.rebuildFXGraph(fxGraph);
    stopPreview();

    const config = rowConfigs(scaleName)[r];
    if (!config) return;

    const time = audioEngine.ctx!.currentTime;
    const freq = config.type === 'synth' ? config.freq * Math.pow(2, note?.oct || 0) : config.freq;
    const soundConfig = currentTrack.instrument;

    if (config.type === 'synth') {
      activePreviewVoiceRef.current = audioEngine.triggerSynth(freq, config.gain, undefined, soundConfig, editingTrackIndex);
    } else if (config.type === 'kick') audioEngine.createKick(time, config.gain, soundConfig, editingTrackIndex);
    else if (config.type === 'snare') audioEngine.createSnare(time, config.gain, soundConfig, editingTrackIndex);
    else if (config.type === 'hat') audioEngine.createHiHat(time, config.gain, soundConfig, editingTrackIndex);
  }, [rowConfigs, currentPart.scale, stopPreview, currentTrack.instrument, editingTrackIndex, fxGraph]);

  const addNote = (r: number, c: number, d: number = 1, data?: Partial<Note>) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[editingTrackIndex] };
    const parts = [...track.parts];
    const part = { ...parts[editingPatternIndex] };
    const grid = [...part.grid];
    const row = [...grid[r]];
    const note = { d: Math.max(1, Math.round(d)), o: 0, oct: globalOctaveShift, ...data };
    row[c] = note;
    grid[r] = row;
    part.grid = grid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
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
      setSelectedNotes(prev => prev.filter(sn => !(sn.r === r && sn.c === c)));
    } else {
      const note = { d: 1, o: 0, oct: globalOctaveShift };
      row[c] = note;
    }
    grid[r] = row;
    part.grid = grid;
    parts[editingPatternIndex] = part;
    track.parts = parts;
    newTracks[editingTrackIndex] = track;
    commitToHistory(newTracks);
  };

  const insertPattern = (trackIdx: number, atIndex: number) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[trackIdx] };
    const neighborScale = track.parts[atIndex]?.scale || track.parts[atIndex - 1]?.scale || 'C Maj Pent';
    const newPart: TrackPart = {
      grid: generateBlankGrid(getRowConfigs(neighborScale, isUnrolled).length),
      scale: neighborScale
    };
    const nextParts = [...track.parts];
    nextParts.splice(atIndex + 1, 0, newPart);
    track.parts = nextParts;
    newTracks[trackIdx] = track;
    commitToHistory(newTracks);
    setEditingTrackIndex(trackIdx);
    setEditingPatternIndex(atIndex + 1);
  };

  const deletePattern = (trackIdx: number, patIndex: number) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[trackIdx] };
    if (track.parts.length <= 1) return;
    const nextParts = [...track.parts];
    nextParts.splice(patIndex, 1);
    track.parts = nextParts;
    newTracks[trackIdx] = track;
    commitToHistory(newTracks);
  };

  const movePattern = (trackIdx: number, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newTracks = [...tracks];
    const track = { ...newTracks[trackIdx] };
    const nextParts = [...track.parts];

    // Adjust target index because removal shifts subsequent elements
    let targetIndex = toIndex;
    if (targetIndex > fromIndex) {
      targetIndex -= 1;
    }

    // Safety check
    if (targetIndex === fromIndex) return;

    const [movedPart] = nextParts.splice(fromIndex, 1);
    nextParts.splice(targetIndex, 0, movedPart);
    track.parts = nextParts;
    newTracks[trackIdx] = track;
    commitToHistory(newTracks);
    setEditingTrackIndex(trackIdx);
    setEditingPatternIndex(targetIndex);
  };

  const duplicatePattern = (trackIdx: number, patIndex: number) => {
    const newTracks = [...tracks];
    const track = { ...newTracks[trackIdx] };
    const sourcePart = track.parts[patIndex];
    const newPart: TrackPart = {
      grid: sourcePart.grid.map(row => [...row]),
      scale: sourcePart.scale
    };
    const nextParts = [...track.parts];
    nextParts.splice(patIndex + 1, 0, newPart);
    track.parts = nextParts;
    newTracks[trackIdx] = track;
    commitToHistory(newTracks);
    setEditingTrackIndex(trackIdx);
    setEditingPatternIndex(patIndex + 1);
  };

  const handleStretchPatterns = useCallback((patterns: { tIdx: number, pIdx: number }[], ratio: number) => {
    if (ratio === 1.0) return;
    const newTracks: Track[] = JSON.parse(JSON.stringify(tracks));
    const affectedTracks = Array.from(new Set(patterns.map(p => p.tIdx)));

    affectedTracks.forEach(tIdx => {
      const trackPatterns = patterns.filter(p => p.tIdx === tIdx).sort((a, b) => a.pIdx - b.pIdx);
      if (trackPatterns.length === 0) return;

      const minP = trackPatterns[0].pIdx;
      const maxP = trackPatterns[trackPatterns.length - 1].pIdx;
      const numPatterns = (maxP - minP) + 1;
      const totalSteps = numPatterns * STEPS_PER_PATTERN;

      // Quantize Ratio: Find the nearest whole number of patterns
      const targetNumPatterns = Math.max(1, Math.round(numPatterns * ratio));
      const snappedRatio = (targetNumPatterns * STEPS_PER_PATTERN) / totalSteps;

      const track = newTracks[tIdx];
      const items: { r: number, globalStep: number, note: Note }[] = [];
      for (let pDisp = 0; pDisp < numPatterns; pDisp++) {
        const pIdx = minP + pDisp;
        const part = track.parts[pIdx];
        if (!part) continue;
        part.grid.forEach((row: (Note | null)[], r: number) => {
          row.forEach((note, c) => {
            if (note) {
              items.push({ r, globalStep: pDisp * STEPS_PER_PATTERN + c, note: { ...note } });
            }
          });
        });
      }

      const newNumPatterns = targetNumPatterns;

      const newParts: TrackPart[] = [];
      const firstScale = track.parts[minP]?.scale || 'C Maj Pent';
      for (let i = 0; i < newNumPatterns; i++) {
        newParts.push({
          grid: generateBlankGrid(getRowConfigs(firstScale, isUnrolled).length),
          scale: firstScale
        });
      }

      items.forEach(item => {
        const newGlobal = Math.round(item.globalStep * snappedRatio);
        const newD = Math.max(1, Math.round(item.note.d * snappedRatio));

        const targetP = Math.floor(newGlobal / STEPS_PER_PATTERN);
        const targetC = newGlobal % STEPS_PER_PATTERN;

        if (targetP < newNumPatterns) {
          const grid = newParts[targetP].grid;
          if (grid[item.r]) {
            grid[item.r][targetC] = { ...item.note, d: newD };
          }
        }
      });

      track.parts.splice(minP, numPatterns, ...newParts);
    });

    commitToHistory(newTracks);
    setToast({ message: `Stretched selection to ${ratio.toFixed(2)}x (Snapped)`, visible: true });
  }, [tracks, commitToHistory, isUnrolled]);

  const addTrack = () => {
    const currentScale = tracks[editingTrackIndex]?.parts[editingPatternIndex]?.scale || 'C Maj Pent';
    const newTrack: Track = {
      id: `track-${tracks.length}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Track ${tracks.length + 1}`,
      parts: [
        {
          grid: generateBlankGrid(getRowConfigs(currentScale, isUnrolled).length),
          scale: currentScale
        }
      ],
      isLooping: true,
      volume: 1.0,
      muted: false,
      soloed: false,
      instrument: DEFAULT_SOUND_CONFIG
    };
    const nextTracks = [...tracks, newTrack];
    commitToHistory(nextTracks);
    setEditingTrackIndex(nextTracks.length - 1);
    setEditingPatternIndex(0);
    setArrHeight(prev => Math.min(window.innerHeight * 0.8, prev + 60));
  };

  const toggleMute = (trackIdx: number) => {
    const next = [...tracks];
    next[trackIdx] = { ...next[trackIdx], muted: !next[trackIdx].muted };
    commitToHistory(next);
  };

  const toggleSolo = (trackIdx: number) => {
    const next = [...tracks];
    next[trackIdx] = { ...next[trackIdx], soloed: !next[trackIdx].soloed };
    commitToHistory(next);
  };

  const handleUpdateTrackInstrument = (trackIdx: number, config: SoundConfig) => {
    const next = [...tracks];
    next[trackIdx] = { ...next[trackIdx], instrument: config };
    // We don't necessarily need to commit checking changes to history immediately, 
    // but for undo/redo consistency it's good.
    commitToHistory(next);
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
  }, [editingTrackIndex, editingPatternIndex, tracks, commitToHistory]);

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
    const keys = Object.keys(DRUM_ARCHIVE);
    const style = keys[Math.floor(Math.random() * keys.length)];
    const preset = DRUM_ARCHIVE[style];
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

    // Clean up label for display
    const displayStyle = style.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    setToast({ message: `Pattern: ${displayStyle}`, visible: true });
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

  const remapSongLayout = useCallback((targetUnrolled: boolean, sourceUnrolled: boolean, tracksOverride?: Track[]) => {
    const sourceTracks = tracksOverride || tracksRef.current;
    const nextTracks = sourceTracks.map(track => ({
      ...track,
      parts: track.parts.map(part => ({
        ...part,
        grid: remapGrid(part, part.scale, targetUnrolled, sourceUnrolled)
      }))
    }));
    setTracks(nextTracks);

    // Scroll Logic: Center for Piano, Reset for Key View
    // Scroll Logic: Center for Piano, Reset for Key View
    if (targetUnrolled) {
      // Default to Octave 4 Center
      // Notes are roughly C0 to B8
      // C4 is around index 57 (depending on scale).
      // Chromatic C4 = 48 + 9? No.
      // Scale length varies. 
      // Safe bet: Center of the grid? Or calculate C4 offset.

      const configs = getRowConfigs(nextTracks[editingTrackIndex].parts[editingPatternIndex].scale, true);
      const c4Index = configs.findIndex(c => c.label.includes('C4'));
      const targetIndex = c4Index > -1 ? c4Index : Math.floor(configs.length / 2);

      const centerScroll = Math.max(0, (targetIndex * 40) - (arrHeight / 2));
      setSequencerScrollTop(centerScroll);
      // NOTE: We do NOT call fitSequencerToNotes here anymore to avoid jumping to top note.
    } else {
      setSequencerScrollTop(0);
    }
  }, [editingTrackIndex, editingPatternIndex, arrHeight]);

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
      soloed: false,
      instrument: DEFAULT_SOUND_CONFIG
    }];

    setEditingTrackIndex(0);
    setEditingPatternIndex(0);
    setPlaybackPatternIndex(0);
    setViewMode('sequencer');
    setResetArmed(false);
    setArrHeight(calculateOptimalHeight(emptyTracks));

    commitToHistory(emptyTracks, {
      nodes: [
        { id: 'src', type: 'source', x: 100, y: 300, params: {} },
        { id: 'out', type: 'output', x: 800, y: 300, params: {} }
      ],
      connections: [
        { source: 'src', target: 'out' }
      ],
      nextId: 1
    }, 120, []); // Reset BPM to 120 and Loops to empty

    setToast({ message: "SYSTEM WIPED - UNDO PRESERVED", visible: true });

    // Force cleanup of any lingering audio state if possible
    audioEngine.init();
  }, [resetArmed, isUnrolled, commitToHistory]);

  const handlePreviewChord = useCallback((scaleName: string, direction: 'up' | 'down') => {
    audioEngine.init();
    audioEngine.resume();
    audioEngine.rebuildFXGraph(fxGraph);
    const isMajor = scaleName.toLowerCase().includes('major') || scaleName.toLowerCase().includes('maj');
    const intervals = isMajor ? [0, 4, 7, 12] : [0, 3, 7, 12];

    // Extract root from scaleName (e.g. "C# Maj Pent" -> "C#")
    const rootNote = scaleName.split(' ')[0];
    const rootSemi = (NOTE_TO_SEMI[rootNote] || 0) + 36; // C4 base

    const notes = direction === 'up' ? intervals : [...intervals].reverse();

    notes.forEach((offset, i) => {
      const time = audioEngine.ctx!.currentTime + (i * 0.005);
      const freq = 440 * Math.pow(2, ((rootSemi + offset + 12) - 57) / 12);
      audioEngine.createSynth(freq, time, 0.4, bpm, 0.4, currentTrack.instrument, editingTrackIndex);
    });
  }, [bpm, currentTrack.instrument, editingTrackIndex, fxGraph]);

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

        let trackOffsets: number[] = [];
        if (isBuildModeRef.current) {
          let acc = 0;
          trackOffsets = currentTracks.map(t => {
            const v = acc;
            // If track has 0 parts, we treat it as 0 length (instant).
            // Logic: play track 1 (len=4). T2 starts at 4.
            acc += (t.parts.length || 0);
            return v;
          });
        }

        // Play all tracks for this step
        currentTracks.forEach((track, trackIdx) => {
          if (track.muted) return;
          // Solo logic
          const hasSolo = currentTracks.some(t => t.soloed);
          if (hasSolo && !track.soloed) return;

          // Build Mode Muting
          let effectiveGlobalPattern = globalPattern;
          if (isBuildModeRef.current) {
            const offset = trackOffsets[trackIdx] || 0;
            if (globalPattern < offset) return; // Mute if not started
            effectiveGlobalPattern = globalPattern - offset;
          }

          let partIdx = effectiveGlobalPattern;
          const myLoop = currentLoops[trackIdx];

          if (myLoop) {
            const [start, end] = myLoop;
            const loopLen = (end - start) + 1;
            // Use effectiveGlobalPattern for looping relative to entry
            partIdx = start + (effectiveGlobalPattern % loopLen);
            trackSyncStatusRef.current[trackIdx] = true;
          } else {
            // Check if track has this part index
            if (partIdx >= track.parts.length) {
              if (track.isLooping && track.parts.length > 0) {
                partIdx = effectiveGlobalPattern % track.parts.length;
              } else {
                return; // Past the end of non-looping track
              }
            }
          }

          const part = track.parts[partIdx];
          if (part && part.grid) {
            const patternRowConfigs = getRowConfigs(part.scale, isUnrolledRef.current);
            audioEngine.playStep(part.grid, currentStep, nextNoteTimeRef.current, patternRowConfigs, currentBpm, track.volume, track.instrument, trackIdx);
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
            if (isPerformanceModeRef.current) {
              // Auto-duplicate last part ONLY for the editing track to keep recording
              setTimeout(() => {
                setTracks(prev => {
                  const next = [...prev];
                  const track = { ...next[editingTrackIndex] };
                  const lastPart = track.parts[track.parts.length - 1];
                  const newPart: TrackPart = {
                    grid: lastPart.grid.map(row => [...row]),
                    scale: lastPart.scale
                  };
                  track.parts = [...track.parts, newPart];
                  next[editingTrackIndex] = track;
                  return next;
                });
              }, 0);
              nextPattern = globalPattern + 1;
            } else {
              // Now we just increment the global pattern indefinitely. 
              // Each track loops itself via partIdx = globalPattern % track.parts.length
              nextPattern = globalPattern + 1;
            }
          }
          if (isFollowModeRef.current) {
            if (isBuildModeRef.current) {
              let targetTrackIdx = 0;
              for (let i = 0; i < currentTracks.length; i++) {
                if (nextPattern >= (trackOffsets[i] || 0)) {
                  targetTrackIdx = i;
                }
              }
              const track = currentTracks[targetTrackIdx];
              const offset = trackOffsets[targetTrackIdx] || 0;
              const localPattern = (nextPattern - offset) % (track.parts.length || 1);
              setEditingTrackIndex(targetTrackIdx);
              setEditingPatternIndex(localPattern);
            } else {
              setEditingPatternIndex(nextPattern % (currentTracks[editingTrackIndex]?.parts.length || 1));
            }
          }
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
  useEffect(() => { isBuildModeRef.current = isBuildMode; }, [isBuildMode]);
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
        duplicatePattern(editingTrackIndex, editingPatternIndex);
        setToast({ message: "Pattern Duplicated", visible: true });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (viewMode === 'sequencer') {
          const allNotes: { r: number, c: number }[] = [];
          currentPart.grid.forEach((row, r) => {
            row.forEach((cell, c) => {
              if (cell) allNotes.push({ r, c });
            });
          });
          setSelectedNotes(allNotes);
          setToast({ message: `Selected ${allNotes.length} notes`, visible: true });
        } else if (viewMode === 'node') {
          nodalRef.current?.selectAll();
        }
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
        togglePlayback();
      }

      if (e.key === 'Home' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (isBuildModeRef.current) {
          setQueuedPatternIndex(0);
          queuedPatternRef.current = 0;
          setEditingPatternIndex(0);
          setToast({ message: "Reset Queued (Next Measure)", visible: true });
        } else {
          playbackStepRef.current = 0;
          setPlaybackStep(0);
          playbackPatternRef.current = 0;
          setPlaybackPatternIndex(0);
          setEditingPatternIndex(0);
          if (audioEngine.ctx) {
            nextNoteTimeRef.current = audioEngine.ctx.currentTime;
          }
          setToast({ message: "Reset to start", visible: true });
        }
      }

      // Z Key for Radial Menu (Hold)
      if (e.key.toLowerCase() === 'z' && !e.repeat && !e.ctrlKey && !e.shiftKey && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        // Open Pie Menu
        e.preventDefault();
        setPieMenuStartPos(mousePosRef.current);
        setIsPieMenuOpen(true);
      }

      // Tab key for view toggle
      if (e.key === 'Tab' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        setViewMode(prev => prev === 'sequencer' ? 'node' : 'sequencer');
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

      // Home Row Play Logic
      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
        const keyIdx = KEYS.indexOf(e.key.toLowerCase());

        if (keyIdx !== -1 && !e.repeat) {
          const configs = getRowConfigs(currentPart.scale, isUnrolled);
          const targetRow = configs.length - 1 - keyIdx;

          if (targetRow >= 0 && targetRow < configs.length) {
            setActiveRowsByKeyboard(prev => ({ ...prev, [targetRow]: true }));
            startPreview(targetRow, { d: 1, o: 0, oct: 0 }, currentPart.scale);

            const isArmed = e.getModifierState('CapsLock');
            if (isArmed && isPlaying) {
              const currentStep = playbackStepRef.current;
              const newTracks = [...tracks];
              const track = { ...newTracks[editingTrackIndex] };
              // Ensure parts/grid deep copy
              track.parts = [...track.parts];
              const part = { ...track.parts[editingPatternIndex] };
              const grid = part.grid.map(r => [...r]);

              if (grid[targetRow]) {
                grid[targetRow][currentStep] = { d: 1, o: 0, oct: 0 };
                part.grid = grid;
                track.parts[editingPatternIndex] = part;
                newTracks[editingTrackIndex] = track;

                setTracks(newTracks);
                commitToHistory(newTracks);
              }
            }
          }
        }
      }
    };

    // -- Removed resize logic from here --

    const handleKeyUp = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA';
      if (isInput) return;

      const configs = getRowConfigs(currentPart.scale, isUnrolled);
      const baseIndex = configs.length - 1;

      // Simple mapping: A, S, D, F, G, H, J, K... -> Scale degrees up
      const WHITE_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
      const keyIdx = WHITE_KEYS.indexOf(e.key.toLowerCase());

      if (keyIdx !== -1) {
        const targetRow = baseIndex - keyIdx;
        if (targetRow >= 0 && targetRow < configs.length) {
          setActiveRowsByKeyboard(prev => {
            const next = { ...prev };
            delete next[targetRow];
            return next;
          });
          // Stop ONE, or all? stopPreview kills all for now.
          stopPreview();
        }
      }
    };

    window.addEventListener('keyup', handleKeyUp);

    window.addEventListener('keydown', handleKeyDown);

    // Event listeners removed from here
  }, [handleUndo, handleRedo, duplicatePattern, editingPatternIndex, selectedNotes, editingTrackIndex, handleCopy, handlePaste, setIsPlaying, tracks, commitToHistory, setToast, viewMode, currentPart, isUnrolled, isPlaying, masterVolume, isBuildMode]);


  // --- DRAWER RESIZE LOGIC (Defined Outside) ---
  const rafRef = useRef<number | null>(null);



  // Initial Load Auto-Fit
  const hasAutoFittedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoFittedRef.current && tracks.length > 0) {
      const optimal = calculateOptimalHeight();
      const target = Math.min(window.innerHeight * 0.6, optimal);
      // Wait for layout?
      setArrHeight(target);
      hasAutoFittedRef.current = true;
    }
  }, [tracks, calculateOptimalHeight]);

  const handleDoubleClickHandle = useCallback(() => {
    const optimal = calculateOptimalHeight();
    const target = Math.min(window.innerHeight * 0.8, optimal);
    setArrHeight(target);
  }, [calculateOptimalHeight]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
    if (isResizingArr) {
      if (rafRef.current) return; // Throttle
      rafRef.current = requestAnimationFrame(() => {
        const delta = dragStartYRef.current - e.clientY;
        const newHeight = dragStartHeightRef.current + delta;
        const clamped = Math.max(80, Math.min(window.innerHeight * 0.8, newHeight));
        currentHeightRef.current = clamped;
        if (drawerRef.current) {
          drawerRef.current.style.height = `${clamped}px`;
        }
        rafRef.current = null;
      });
    }
  }, [isResizingArr]);

  const handleMouseUp = useCallback(() => {
    if (isResizingArr) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setArrHeight(currentHeightRef.current);
      setIsResizingArr(false);
    }
  }, [isResizingArr]);

  useEffect(() => {
    if (isResizingArr) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      // Also add mousemove globally for cursor position tracking? 
      // Logic requires mousePosRef for Pie Menu everywhere
      window.addEventListener('mousemove', handleMouseMove);
    }
    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingArr, handleMouseMove, handleMouseUp]);



  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans p-1 md:p-2 flex flex-col overflow-hidden">
      <header className="bg-slate-900/90 p-2 md:p-1 md:px-4 landscape:p-1 landscape:px-4 rounded-xl border border-white/5 backdrop-blur-xl shadow-2xl mb-2 shrink-0 relative z-50 flex flex-col gap-2 md:flex-row md:items-center md:gap-4 md:h-14 md:justify-start landscape:flex-row landscape:items-center landscape:gap-4 landscape:h-14 landscape:justify-start">
        <div className="flex justify-between items-center w-full md:contents landscape:contents">
          <h1 className="text-xl md:text-2xl landscape:text-2xl font-black tracking-tighter text-white md:order-1 md:mr-2 landscape:order-1 landscape:mr-2">
            PULSE<span className="text-sky-500">PAD</span>
          </h1>

          <div className="flex items-center gap-2 md:order-last md:ml-auto landscape:order-last landscape:ml-auto">
            <button
              onClick={() => user ? setIsShareModalOpen(true) : setIsAuthModalOpen(true)}
              className="p-1.5 md:p-2 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white transition-all shadow-[0_0_10px_rgba(14,165,233,0.1)] hover:shadow-[0_0_20px_rgba(14,165,233,0.4)] flex items-center justify-center transform active:scale-95"
              title={user ? "Save / Share Project" : "Login to Save"}
            >
              <div className="w-5 h-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </div>
            </button>
            {user && (
              <div className="relative">
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="w-8 h-8 rounded-full border border-slate-700 bg-slate-800 overflow-hidden ml-1 hover:border-sky-500 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  title={user.displayName || 'User'}
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
                      {(user.displayName || 'U')[0].toUpperCase()}
                    </div>
                  )}
                </button>
                {isProfileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProfileMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col py-1">
                      <div className="px-4 py-3 border-b border-slate-800">
                        <p className="text-white font-bold text-sm truncate">{user.displayName || 'User'}</p>
                        <p className="text-slate-500 text-[10px] truncate">{user.email}</p>
                      </div>
                      <button onClick={() => { setIsSongListOpen(true); setIsProfileMenuOpen(false); }} className="px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                        My Songs
                      </button>
                      <button onClick={() => {
                        if (!document.fullscreenElement) {
                          document.documentElement.requestFullscreen().catch(e => setToast({ message: "Fullscreen blocked: " + e.message, visible: true }));
                        } else {
                          document.exitFullscreen();
                        }
                        setIsProfileMenuOpen(false);
                      }} className="px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
                        Toggle Fullscreen
                      </button>

                      <div className="h-px bg-slate-800 my-1"></div>
                      <button onClick={handleLogout} className="px-4 py-2 text-left text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center w-full gap-2 md:contents landscape:contents">
          <div className="flex items-center gap-2 flex-1 md:flex-none md:order-2 landscape:flex-none landscape:order-2">
            <button
              onClick={() => togglePlayback()}
              className={`flex items-center justify-center gap-2 px-6 py-2 rounded-xl font-black text-xs tracking-widest transition-all shadow-lg ${isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-500 text-white hover:bg-emerald-400'}`}
            >
              {isPlaying ? 'STOP' : 'START'}
            </button>
            <div
              className="flex flex-col gap-0.5 ml-1 cursor-pointer group w-24 md:w-32"
              onDoubleClick={() => commitToHistory(undefined, undefined, 120)}
              title="Double click to reset to 120"
            >
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold ml-1 group-hover:text-slate-400 transition-colors">BPM ({bpm})</span>
              <input
                type="range" min="60" max="200" value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value))}
                onMouseUp={() => commitToHistory(undefined, undefined, bpm)}
                className="w-full accent-sky-500 h-1.5 rounded-lg cursor-pointer bg-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/5 md:order-3 landscape:order-3">
            <button onClick={handleUndo} className="p-2 text-slate-400 hover:text-white transition-all transform active:scale-95" title="Undo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
            </button>
            <button onClick={handleRedo} className="p-2 text-slate-400 hover:text-white transition-all transform active:scale-95" title="Redo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l2.7 3.7" /></svg>
            </button>
            <div className="w-px h-5 bg-slate-700 mx-1"></div>
            <button onClick={handleRemix} className="text-violet-500 p-2 hover:bg-violet-500/10 rounded-lg transition-all transform active:scale-95" title="Randomize">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="12" cy="12" r="1" /><circle cx="16" cy="7" r="1" /><circle cx="8" cy="17" r="1" /></svg>
            </button>
            <button
              onClick={() => handleReset()}
              className={`${resetArmed ? 'bg-rose-500 text-white' : 'text-rose-500'} p-2 rounded-lg hover:bg-rose-500/10 transition-all transform active:scale-95`}
              title="Reset"
            >
              {resetArmed ? '?' : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between w-full bg-slate-800/50 p-1.5 rounded-lg border border-white/5 mt-0.5 md:contents md:bg-transparent md:border-none md:p-0 md:mt-0 landscape:contents landscape:bg-transparent landscape:border-none landscape:p-0 landscape:mt-0">
          <div className="flex items-center gap-2 md:order-4 landscape:order-4">
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold ml-1">Key</span>
            <select
              className={`bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-[10px] font-bold uppercase text-sky-400 outline-none hover:border-sky-500/50 transition-all cursor-pointer ${isUnrolled ? 'opacity-20 pointer-events-none grayscale' : ''}`}
              value={currentPart.scale}
              disabled={isUnrolled}
              onChange={(e) => {
                changePatternScale(editingTrackIndex, editingPatternIndex, e.target.value);
              }}
            >
              {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 md:order-5 landscape:order-5">
            <button
              onClick={() => {
                const target = !isUnrolled;
                let nextTracks = tracks;

                if (!target) { // Switching TO Key View
                  // AUTO-SCALE LOGIC
                  try {
                    const editingPart = tracks[editingTrackIndex]?.parts[editingPatternIndex];
                    if (editingPart) {
                      const pitches = new Set<number>();
                      editingPart.grid.forEach((row, r) => {
                        if (row.some(n => n) && CHROMATIC_LABELS[r]) {
                          pitches.add(getLabelSemitones(CHROMATIC_LABELS[r]) % 12);
                        }
                      });

                      if (pitches.size > 0) {
                        let bestScale = editingPart.scale;
                        let bestScore = -1;
                        let bestSizeDiff = Infinity;

                        Object.entries(SCALES).forEach(([name, data]) => {
                          const scalePitches = new Set<number>();
                          data.labels.forEach(l => scalePitches.add(getLabelSemitones(l) % 12));
                          let hits = 0;
                          pitches.forEach(p => { if (scalePitches.has(p)) hits++; });
                          const score = hits / pitches.size;

                          if (score > bestScore) {
                            bestScore = score;
                            bestScale = name;
                            bestSizeDiff = Math.abs(scalePitches.size - pitches.size);
                          } else if (Math.abs(score - bestScore) < 0.001) {
                            const sizeDiff = Math.abs(scalePitches.size - pitches.size);
                            if (sizeDiff < bestSizeDiff) {
                              bestScale = name;
                              bestSizeDiff = sizeDiff;
                            }
                          }
                        });

                        let newScale = editingPart.scale;
                        if (bestScore === 1.0) {
                          newScale = bestScale;
                        } else if (bestScore < 0.8 && editingPart.scale !== 'Chromatic') {
                          // Default to Chromatic if fit is poor
                          newScale = 'Chromatic';
                        }

                        if (newScale !== editingPart.scale) {
                          nextTracks = JSON.parse(JSON.stringify(tracks));
                          nextTracks[editingTrackIndex].parts[editingPatternIndex].scale = newScale;
                          commitToHistory(nextTracks);
                          setToast({ message: `Auto-Detected: ${newScale}`, visible: true });
                        }
                      }
                    }
                  } catch (e) { console.error("Auto-scale error", e); }
                }

                remapSongLayout(target, isUnrolled, nextTracks);
                setIsUnrolled(target);
              }}
              className={`px-2 py-0.5 rounded border transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isUnrolled ? 'bg-sky-500 border-sky-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
              title="Unroll Piano"
            >
              🎹 Piano
            </button>

            <div className="w-px h-3 bg-slate-700"></div>

            <button
              onClick={() => setViewMode(viewMode === 'node' ? 'sequencer' : 'node')}
              className={`px-2 py-0.5 rounded border transition-all text-[10px] font-bold uppercase tracking-wider ${viewMode === 'node' ? 'bg-indigo-500 border-indigo-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
            >
              Node FX
            </button>

            <button
              onClick={() => setViewMode(viewMode === 'spreadsheet' ? 'sequencer' : 'spreadsheet')}
              className={`hidden md:block px-2 py-0.5 rounded border transition-all text-[10px] font-bold uppercase ${viewMode === 'spreadsheet' ? 'bg-emerald-500 border-emerald-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
            >
              Sheet
            </button>

            <button
              onClick={() => setShowKeyboard(!showKeyboard)}
              className={`px-2 py-0.5 rounded border transition-all text-[10px] font-bold uppercase ${showKeyboard ? 'bg-sky-500 border-sky-400 text-white' : 'text-slate-500 border-slate-700 hover:text-white'}`}
              title="Toggle Virtual Keyboard"
            >
              ⌨️ Keys
            </button>
          </div>
        </div>
      </header >
      <div className="flex-1 flex flex-row overflow-hidden min-h-0 relative">
        <InstrumentDrawer
          isOpen={openDrawerTrackIndex !== null}
          track={openDrawerTrackIndex !== null ? tracks[openDrawerTrackIndex] : null}
          onClose={() => setOpenDrawerTrackIndex(null)}
          onUpdateInstrument={(config) => {
            if (openDrawerTrackIndex !== null) {
              handleUpdateTrackInstrument(openDrawerTrackIndex, config);
            }
          }}
        />

        <main className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden pb-2 px-2">
          <section className="flex-1 bg-slate-900/40 rounded-xl border border-white/5 backdrop-blur-3xl shadow-2xl relative overflow-hidden flex flex-col min-h-0">
            <div className="p-1 px-3 border-b border-slate-800/60 flex justify-between items-center shrink-0">
              <h3 className="text-slate-400 uppercase tracking-[0.2em] text-[10px] font-black flex items-center gap-2">
                {viewMode === 'sequencer' && (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
                    Composition
                  </>
                )}
                {viewMode === 'node' && (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    FX Chain
                  </>
                )}
                {viewMode === 'spreadsheet' && (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                    Logic Data
                  </>
                )}
              </h3>
            </div>
            <div className="flex-1 min-h-0 bg-slate-900 overflow-hidden relative">
              <div className={`absolute inset-0 view-transition ${viewMode === 'sequencer' ? 'view-visible' : 'view-hidden'}`}>
                <CanvasSequencer
                  grid={currentPart.grid}
                  rowConfigs={getRowConfigs(currentPart.scale, isUnrolled)}
                  onToggleNote={toggleNote}
                  onAddNote={addNote}
                  onCommitNote={handleCommitNote}
                  onCommitMultiNote={handleCommitMultiNote}
                  onCopyMultiNote={handleCopyMultiNote}
                  onPreviewNote={(r, note) => startPreview(r, note, currentPart.scale)}
                  onStopPreviewNote={stopPreview}
                  activeRowsByKeyboard={activeRowsByKeyboard}
                  onSelectNotes={setSelectedNotes}
                  selectedNotes={selectedNotes}
                  playbackStep={(() => {
                    let effectiveGlobalPattern = playbackPatternIndex;
                    if (isBuildMode) {
                      let acc = 0;
                      for (let i = 0; i < editingTrackIndex; i++) {
                        acc += (tracks[i].parts.length || 0);
                      }
                      if (playbackPatternIndex < acc) return -1;
                      effectiveGlobalPattern = playbackPatternIndex - acc;
                    }

                    const loop = trackLoops[editingTrackIndex];
                    let effectiveIndex = effectiveGlobalPattern;
                    if (loop) {
                      const [start, end] = loop;
                      const len = end - start + 1;
                      effectiveIndex = start + (effectiveGlobalPattern % len);
                    } else {
                      effectiveIndex = effectiveGlobalPattern % (currentTrack.parts.length || 1);
                    }
                    return (effectiveIndex === editingPatternIndex) ? playbackStep : -1;
                  })()}
                  playheadDistance={(() => {
                    let effectiveGlobalPattern = playbackPatternIndex;
                    if (isBuildMode) {
                      let acc = 0;
                      for (let i = 0; i < editingTrackIndex; i++) {
                        acc += (tracks[i].parts.length || 0);
                      }
                      if (playbackPatternIndex < acc) return -999; // Far away
                      effectiveGlobalPattern = playbackPatternIndex - acc;
                    }

                    const loop = trackLoops[editingTrackIndex];
                    let effectiveIndex = effectiveGlobalPattern;
                    if (loop) {
                      const [start, end] = loop;
                      const len = end - start + 1;
                      effectiveIndex = start + (effectiveGlobalPattern % len);
                    } else {
                      effectiveIndex = effectiveGlobalPattern % (currentTrack.parts.length || 1);
                    }
                    return effectiveIndex - editingPatternIndex;
                  })()}
                  isPlaying={isPlaying}
                  snap={snap}
                  isUnrolled={isUnrolled}
                  scrollTop={sequencerScrollTop}
                  onSetScrollTop={setSequencerScrollTop}
                  paused={viewMode !== 'sequencer'}
                  isResizing={isResizingArr}
                  rowHeight={sequencerRowHeight}
                />
                {isUnrolled && (
                  <VerticalZoomScrollbar
                    totalItems={getRowConfigs(currentPart.scale, true).length}
                    rowHeight={sequencerRowHeight}
                    visibleHeight={arrHeight - 80} // Approx header offset, or use ref
                    scrollTop={sequencerScrollTop}
                    onScroll={setSequencerScrollTop}
                    onZoom={setSequencerRowHeight}
                    minRowHeight={10}
                    maxRowHeight={120}
                  />
                )}
              </div>

              <div className={`absolute inset-0 view-transition ${viewMode === 'node' ? 'view-visible' : 'view-hidden'}`}>
                <NodalInterface
                  ref={nodalRef}
                  graph={fxGraph}
                  onUpdateGraph={setFxGraph}
                  onCommitGraph={(newGraph) => commitToHistory(tracks, newGraph)}
                  trackCount={tracks.length}
                  trackNames={tracks.map(t => t.name)}
                  paused={viewMode !== 'node'}
                />
              </div>

              {viewMode === 'spreadsheet' && (
                <div className="absolute inset-0">
                  <SpreadsheetView
                    grid={currentPart.grid}
                    rowConfigs={getRowConfigs(currentPart.scale, isUnrolled)}
                    onUpdateNote={handleUpdateNote}
                  />
                </div>
              )}
            </div>

            <VirtualKeyboard
              visible={showKeyboard}
              rowConfigs={getRowConfigs(currentPart.scale, isUnrolled).map(r => ({ ...r, isRoot: r.label.includes(currentPart.scale.split(' ')[0].replace('#', '♯')) || false }))}
              activeRows={activeRowsByKeyboard}
              onNoteStart={(rowIdx) => {
                setActiveRowsByKeyboard(prev => ({ ...prev, [rowIdx]: true }));
                startPreview(rowIdx, { d: 1, o: 0, oct: 0 }, currentPart.scale);
              }}
              onNoteStop={(rowIdx) => {
                setActiveRowsByKeyboard(prev => {
                  const next = { ...prev };
                  delete next[rowIdx];
                  return next;
                });
                stopPreview();
              }}
            />
          </section>

          {/* Arrangement View Handle & Content */}
          <div className="flex flex-col shrink-0 relative z-40">
            {/* Resizer / Toggle Handle */}
            <div
              className={`h-5 w-full cursor-ns-resize md:cursor-ns-resize flex items-center justify-center group -mb-2 mt-1 z-50 hover:opacity-100 transition-opacity ${isArrOpen ? 'opacity-100' : 'opacity-80'}`}
              onMouseDown={(e) => {
                if (window.innerWidth >= 768) {
                  e.preventDefault();
                  setIsResizingArr(true);
                  dragStartYRef.current = e.clientY;
                  dragStartHeightRef.current = arrHeight;
                }
              }}
              onClick={() => {
                // Mobile Toggle
                if (window.innerWidth < 768) {
                  setIsArrOpen(!isArrOpen);
                }
              }}
              onDoubleClick={() => {
                if (window.innerWidth >= 768) {
                  handleDoubleClickHandle();
                }
              }}
            >
              {/* Visual Handle */}
              {/* Visual Handle Pill */}
              <div className={`relative px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full flex items-center gap-2 transition-all cursor-pointer z-50 ${isResizingArr ? 'border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] scale-110 opacity-100' : 'opacity-100 shadow-md hover:border-sky-500/50'}`}>
                {/* Mobile: Text Indicator */}
                <span className="md:hidden text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  {isArrOpen ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      Hide
                    </>
                  ) : (
                    <>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                      Sequencer
                    </>
                  )}
                </span>

                {/* Desktop: Dots */}
                <div className="hidden md:flex gap-1">
                  <div className="w-1 h-1 bg-slate-600 rounded-full" />
                  <div className="w-1 h-1 bg-slate-600 rounded-full" />
                  <div className="w-1 h-1 bg-slate-600 rounded-full" />
                </div>
              </div>
            </div>

            {/* Content Container */}
            <div
              ref={drawerRef}
              className={`flex flex-row overflow-hidden bg-slate-900 shadow-2xl border-t border-slate-800 ${isResizingArr ? '' : 'transition-all duration-300 ease-in-out'} w-full`}

              style={{
                height: (window.innerWidth < 768 && !isArrOpen)
                  ? '0px'
                  : (isResizingArr ? `${currentHeightRef.current}px` : `${arrHeight}px`),
                opacity: (window.innerWidth < 768 && !isArrOpen) ? 0 : 1,
                visibility: (window.innerWidth < 768 && !isArrOpen) ? 'hidden' : 'visible'
              }}
            >
              <div className="flex-grow min-w-0 transition-shadow duration-300">
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
                  onMovePattern={movePattern}
                  onToggleMute={toggleMute}
                  onToggleSolo={toggleSolo}
                  onTrackLoopChange={(trackIdx, range) => {
                    const next = [...trackLoops];
                    next[trackIdx] = range;
                    commitToHistory(undefined, undefined, undefined, next);
                  }}
                  isPlaying={isPlaying}
                  isFollowMode={isFollowMode}
                  onToggleFollow={setIsFollowMode}
                  bpm={bpm}
                  playbackStep={playbackStep}
                  isPerformanceMode={isPerformanceMode}
                  onSetPerformanceMode={setIsPerformanceMode}
                  onOpenInstrument={setOpenDrawerTrackIndex}
                  onSaveClick={() => user ? setIsShareModalOpen(true) : setIsAuthModalOpen(true)}
                  isLoggedIn={!!user}
                  selectedPatterns={selectedPatterns}
                  onSelectPatterns={setSelectedPatterns}
                  onStretchPatterns={handleStretchPatterns}
                  isBuildMode={isBuildMode}
                  onToggleBuildMode={setIsBuildMode}
                />
              </div>
              <VolumeMeter />
            </div>
          </div>
        </main>
      </div>

      {/* Ad Banner - Only show if NOT loading and user is NOT logged in (OR if in debug mode for Eric) */}
      {(!isAuthLoading && (!user || (user.email === 'eric@ericbacus.com' && debugAdMode))) && (
        <AdBanner variant="real" adClient="ca-pub-9914207545194220" adSlot="" />
      )}

      {/* Dev Ad Toggle (Bottom Right) */}
      {user?.email === 'eric@ericbacus.com' && (
        <div className="fixed bottom-1 right-1 opacity-10 hover:opacity-100 z-[100] pointer-events-auto transition-opacity">
          <button
            onClick={() => setDebugAdMode(!debugAdMode)}
            className="text-[10px] uppercase font-bold text-white bg-slate-900/90 border border-slate-700 px-2 py-1 rounded hover:bg-slate-800"
          >
            {debugAdMode ? 'Debug: Hide Ads' : 'Debug: Test Ads'}
          </button>
        </div>
      )}

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
        onPreviewChord={handlePreviewChord}
        onClose={() => setIsPieMenuOpen(false)}
      />
      {/* Modals & Overlays */}
      {showOnboarding && (
        <OnboardingModal onClose={() => {
          setShowOnboarding(false);
          localStorage.setItem('pulse_seen_onboarding', 'true');
        }} />
      )}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        user={user}
        onToast={(message) => setToast({ message, visible: true })}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        user={user}
        songData={{
          name: tracks[0]?.name ? `${tracks[0].name.split(' ')[0]} Project` : "New Project",
          tracks,
          bpm,
          fxGraph,
          loops: trackLoops,
          isBuildMode,
          isPerformanceMode
        }}
        currentSongId={currentSongId}
        onSaveComplete={(id) => {
          setCurrentSongId(id);
          setToast({ message: "Project Saved!", visible: true });
        }}
      />

      <SongListModal
        isOpen={isSongListOpen}
        onClose={() => setIsSongListOpen(false)}
        user={user}
        onLoadSong={(data, id) => handleLoadSong(data, id, false)}
      />

      {
        isPianoMode && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-sky-500/20 border border-sky-400/30 text-sky-400 text-[10px] font-bold px-3 py-1 rounded-full animate-pulse z-[200]">
            PIANO MODE ON
          </div>
        )
      }
      {
        welcomeData && (
          <WelcomeOverlay
            songName={welcomeData.name}
            authorName={welcomeData.authorName}
            authorPhotoUrl={welcomeData.authorPhotoUrl}
            linerNotes={welcomeData.linerNotes}
            onDismiss={() => setWelcomeData(null)}
          />
        )
      }
    </div >
  );
};

export default App;
