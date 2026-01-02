# Pulsepad User Manual

Welcome to the official Pulsepad documentation. Pulsepad is a pattern-based music production environment built for high-speed melodic and rhythmic sequencing.

## Introduction

Pulsepad combines a traditional 16-step grid sequencer with a modular FX routing system and a dynamic arrangement view. It is designed for both studio composition and live performance, with a heavy emphasis on real-time audio feedback and contextual scale awareness.

## Interface Overview

### The Sequencer Grid
The primary workspace for note entry. It consists of melodic synth rows (mapped to the active scale) and fixed drum rows (Kick, Snare, Hi-Hat).

- **Note Entry**: Click any empty cell to place a note.
- **Sustained Previews**: Click and hold a note to hear its current pitch and timbre.
- **Multi-Note Editing**: When multiple notes are selected, resizing or octave-shifting moves the entire group.

### Arrangement View
Located at the top of the interface, this view manages the horizontal progression of the song across multiple tracks.

- **Parts**: Modular blocks of 16 steps.
- **Independent Looping**: Each part can be toggled to loop independently, enabling poly-metric rhythms and varying track lengths.
- **Scale Inheritance**: New parts automatically inherit the scale from the preceding part.

### Modular FX Graph
A visual environment for routing audio through a chain of effects.

- **Nodes**: Effect processors (Filter, Delay, Reverb, etc.) and sources/outputs.
- **Modulation**: Parameters can be modulated by LFOs or driven by real-time audio analysis (e.g., color-driven automation).

## Key Concepts

### Dynamic Scales
Pulsepad utilizes a pattern-specific scale system. Each 16-step part can have its own root note and scale type.
- **Inheritance**: Creating a new part or track propagates the active scale to maintain tonal consistency.
- **Global Awareness**: The sequencer grid automatically re-labels its rows based on the scale of the active part.

### Drum Retriggering (Rolls)
Any drum note with a duration greater than 1 step triggers the **Retrigger Engine**.
- **Roll Speed**: 32ndnd note (2x grid speed).
- **Velocity Mapping**: A linear volume ramp is applied across the duration for increased realism.

## Input Reference

### General Controls
| Action | Input |
| :--- | :--- |
| Play / Stop | `Space` |
| Undo | `Ctrl + Z` |
| Redo | `Ctrl + Y` |
| Copy Pattern | `Ctrl + C` |
| Paste Pattern | `Ctrl + V` |

### Tool Set
| Tool | Key | Description |
| :--- | :--- | :--- |
| **Pointer** | `V` | Default selection, movement, and resizing. |
| **Razor** | `C` | Splits notes at the nearest quantized step. |

### Interaction Shortcuts
| Action | Input |
| :--- | :--- |
| **Radial Menu** | `Z` (Hold) | Open Scale selection at mouse position. |
| **Octave Shift** | `Mouse Wheel` | Increment/Decrement pitch during note interaction. |
| **Delete Note** | `Del` / `Backspace` | Removes selected notes. |
| **Delete Part** | `Middle-Click` | Removes the part from the arrangement. |
| **Toggle Loop** | `Right-Click` | Switches the part's looping state. |

## Design Philosophy

Pulsepad's development is guided by three core principles:

1. **Audio First**: Every interaction that modifies the musical state must provide immediate, high-quality audio feedback.
2. **Context Over Defaults**: The system should intelligently guess the user's intent based on their active workspace (e.g., scale inheritance and auto-focus).
3. **Frictionless Navigation**: Minimize state-switching. Tools like the Razor and Scale Pie Menu are accessible via persistent hotkeys to prevent workflow interruption.

---
*For more information, visit the live application at [pulsepad.web.app](https://pulsepad.web.app).*
