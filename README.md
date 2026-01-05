# 🎚️ PulsePad: 
> A music design toolkit, vibecoded as an exercise in UX exploration, and an "I wonder what else I can do" attitude.

![PulsePad Banner](public/screenshots/arrangement.png)

PulsePad is a music generator/sequencer/composition tool assumes the user likes hotkeys as much as I do.

This is developed as a desktop first application, but my aim is to support as much functionality as makes sense on mobile devices.

---

### 🎹 Piano Roll
The Piano Roll features a robust framing engine that ensures your focus starts on **C4** (or your existing notes). It integrates professional-grade navigation, including vertical "pinch" zooming and smooth scrolling. (this only kinda works right now)

![Piano Roll](public/screenshots/piano_roll.png)

### 🕸️ Modular FX Graph
A fully interactive nodal workspace. Route your audio through filters, delays, and distortions. Use modulation sources like LFOs to drive any parameter in the chain. (pretty proud of this, not without bugs)

![FX Graph](public/screenshots/fx_graph.png)

---

## ⚡ Productivity & Interaction (Hotkeys)

PulsePad is designed to be played like an instrument. Master these shortcuts to stay in the flow.

### 🏗️ Global System
- **`Space`**: Toggle Play/Stop.
- **`Ctrl + Z / Y`**: Full undo/redo stack for arrangement, notes, and wiring.
- **`Ctrl + D`**: Duplicate the currently editing pattern.
- **Double-Click BPM**: Reset to **120 BPM**.

### 🎹 Sequencer & Piano Roll
- **`V` / `C`**: Toggle between **Pointer** and **Razor** tools.
- **`Mouse Wheel`**: Vertical scroll (Shift focus).
- **`Alt + Drag`**: Clone a note instantly.
- **`Scroll while Dragging`**: Shift a note's octave on the fly.
- **`Vertical Gutter Drag`**: Strum through note labels to preview sounds.

### 🕸️ FX Graph (Nodal)
- **`L`**: Trigger **Topological Auto-Layout**. Organizes nodes into clear, non-overlapping columns based on connections.
- **`F`**: Frame all nodes in view.
- **`Y` (Hold)**: **Laser Cutter** tool. Slice through wires to disconnect them.
- **`Shift + Drag`**:
    - **Inject**: Drop a node onto a wire to insert it into the chain.
    - **Extract**: Pull a node out of a chain; neighbors bridge automatically.

---

## 🛠️ Technology Stack
- **IDE**: Antigravity (with their generous token alotment for pro users).
- **Framework**: React 19 + TypeScript
- **Bundler**: Vite + HMR
- **Styling**: Tailwind CSS (Sophisticated Dark Mode / Glassmorphism)
- **Audio**: Custom WebAudio Engine (audioEngine.ts)
- **Deployment**: Firebase Hosting & Firestore

---

## 🧪 Development Workflow
PulsePad uses a modern React development flow:

```bash
# Clone the repository
git clone https://github.com/skittixch/PulsePad

# Install dependencies
npm install

# Start development server
npm run dev
```

---

*Explore the latest live build at [pulsepad.web.app](https://pulsepad.web.app).*
