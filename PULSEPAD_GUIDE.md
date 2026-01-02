# Pulsepad User Manual

Welcome to the official Pulsepad documentation. Pulsepad is a pattern-based music production environment designed for high-speed rhythmic and melodic sequencing.

## Introduction

Pulsepad combines a 16-step grid sequencer with a modular FX routing system and a multitrack arrangement view. It prioritizes real-time tactile feedback, modular routing, and contextual awareness to streamline the creative workflow.

## Workspace Overview

### 1. Sequencer Grid
The Grid is the primary workspace for note entry. It is divided into two sections:
- **Melodic Rows**: Tunned to the active scale. Note labels update dynamically based on the part's scale.
- **Percussion Rows**: Fixed-pitch triggers for Kick, Snare, and Hi-Hat.

**Interaction:**
- **Add Note**: Left-click an empty cell.
- **Sustained Preview**: Click and hold any note to hear its pitch and duration.
- **Octave Shift**: Scroll the mouse wheel while dragging or resizing a note to shift its octave.
- **Multi-Note Edit**: Drag a marquee to select multiple notes. Resizing or shifting any selected note applies the change to the entire group.

### 2. Arrangement View
The Arrangement View (top) manages the timeline and track structure.

- **Tracks**: Parallel lanes of audio playback.
- **Parts**: Modular 16-step patterns.
- **Looping**: Right-click a part to toggle its looping state. Independent looping allows for complex poly-rhythms.
- **Management**: Middle-click to delete parts; `Ctrl + C / V` to copy and paste.

### 3. Nodal Interface (FX Graph)
The Nodal Interface allows you to route audio from the Sequencer through various effects and modulation sources.

**Navigation:**
- **Pan**: Left-click and drag on the background workspace.
- **Minimap**: Use the minimap (top-right) for rapid navigation across large graphs.
- **Frame View**: Press `F` to center and frame all existing nodes.
- **Linear Layout**: Press `L` to automatically arrange nodes in a signal chain.

**Ports and Cables:**
- **Audio Ports**: Indicated by indigo circles. These carry high-bandwidth audio signals.
- **Scalar/Int Ports**: Carriers for modulation and control data (Sky/Emerald).
- **Wiring**: Drag from an output port to an input port to create a connection.
- **Re-wiring**: Drag from an existing input connection to "pull" the cable and move it to a different port.

**Advanced Nodal Operations:**
- **Cutter**: Hold `Ctrl + Right-Click` and drag across cables to slice them.
- **Bridging (Injection)**: Hold `Shift` while dragging a node over an active audio cable to "inject" the node into that signal path.
- **Extraction**: Hold `Shift` while dragging a node out of its current audio connections to remove it and automatically bridge the source/destination.
- **Duplicate**: Press `Ctrl + D` to duplicate the current selection of nodes.

---

## Key Concepts

### Dynamic Scale Inheritance
Pulsepad uses a per-pattern scale system. Each part can have a unique root and type (e.g., C Major, G# Minor).
- **Propagation**: Creating a new part or track automatically inherits the scale of the preceding part, ensuring tonal continuity by default.
- **Global Awareness**: The grid and nodal parameters (like filter frequency) can be set to respond to the scale and analysis of the active audio.

### Drum Retrigger Engine
Drum notes with a duration (`d`) greater than 1 step trigger the Retrigger Engine.
- **Sub-Division**: Long notes are automatically split into 32ndnd-note pulses (twice grid speed).
- **Velocity Dynamics**: A volume ramp is applied across the duration of the roll, starting at 70% and reaching 100% gain at the end of the note.

---

## Technical Reference

### General Hotkeys
| Action | Input |
| :--- | :--- |
| **Play / Stop** | `Space` (Restarts from Step 1) |
| **Undo / Redo** | `Ctrl + Z` / `Ctrl + Y` |
| **Copy / Paste (Part)** | `Ctrl + C` / `Ctrl + V` |

### Interaction Table
| Workspace | Input | Result |
| :--- | :--- | :--- |
| **Grid** | `V` | Pointer Tool (Select/Move/Resize) |
| **Grid** | `C` | Razor Tool (Split Notes) |
| **Grid** | `Z` (Hold) | Scale Radial Menu |
| **Grid** | `Mouse Wheel` | Octave Shift (while interacting) |
| **Graph** | `Ctrl + Right-Click` | Cutter (Slice cables) |
| **Graph** | `Shift + Drag` | Bridge / Extract Node |
| **Graph** | `F` | Focus / Frame all nodes |
| **Graph** | `L` | Auto-layout linear chain |
| **Arrangement** | `Right-Click` | Toggle Loop State |
| **Arrangement** | `Middle-Click` | Delete Part |

## Design Philosophy

1. **Low Latency Input**: All UI interactions provide immediate audio results (sustained previews).
2. **Contextual Scaling**: Tone and structure are inherited horizontally to maintain musical flow.
3. **Tactile Routing**: signal paths are treated as physical objects that can be cut, bridged, or re-routed with minimal menu diving.

---
*For the latest updates, visit [pulsepad.web.app](https://pulsepad.web.app).*
