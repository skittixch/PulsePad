# Pulse Studio Shortcuts & Interactions

Maximize your productivity with these deep-integration hotkeys and gestural interactions.

## 🎹 General Playback & System
- **`Space`**: Toggle Play/Stop.
- **`Ctrl + Z`**: Undo last action (Supports patterns & FX wiring).
- **`Ctrl + Y`** or **`Ctrl + Shift + Z`**: Redo action.
- **`Ctrl + D`**: Duplicate the currently editing pattern.
- **Double-Click BPM**: Instantly reset tempo to **120 BPM**.

---

## 🏗️ Sequencer & Lab View
- **`Left-Click`**: Toggle note (On/Off).
- **`Drag Handle`**: Resize note duration (Snap-to-grid).
- **`Shift + Drag Handle`**: Free-form duration (Bypass grid snap).
- **`Alt + Click & Drag`**: Clone a note (leaves original in place).
- **`Vertical Drag (Gutter)`**: Strum through row labels to preview sounds.
- **`Ctrl + Click Row`**: (Lab View) Batch edit note properties.

---

## 🕸️ Nodal FX Interface
### Keyboard Shortcuts
- **`f` (Frame)**: Center and fit all nodes into view.
- **`l` (Layout)**: Automatically organize nodes in a sequenced horizontal layout.
- **`y` (Hold)**: Enable **Laser Cutter** tool to slice and disconnect wires.
- **`Shift` (While Dragging Node)**:
  - **Extract**: Rip a node out of a chain (neighbors bridge automatically).
  - **Magnetic Insert**: Drop a node onto an existing wire to insert it into the chain.

### Mouse Interactions
- **`Left-Drag Background`**: Pan across the workspace.
- **`Right-Click Background`**: Open the "Add Node" context menu.
- **`Ctrl + Left-Drag`**: Marquee Select multiple nodes.
- **`Ctrl + Right-Drag`**: Quick-access **Laser Cutter**.
- **`Drag Portfolio Port`**:
  - **Output to Input**: Create a connection.
  - **Scalar to Parameter**: Drive an effect parameter with modulation (LFO, etc.).
- **`Drag existing Input`**: Detech and "pick up" a wire to re-route it.

---

## 🛠️ Advanced Logic
- **`Set Range Node`**: Remap incoming modulation sources.
- **`LFO Normalization`**: Toggle between Bipolar (-1 to 1) and Unipolar (0 to 1) output using the mini-toggle switches.
- **`Shift-Insertion`**: Dropping a node onto a wire intelligently pushes downstream nodes to prevent overlap.
