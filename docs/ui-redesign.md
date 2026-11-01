# Editor UI/UX redesign

Status: proposal. Clickable prototype: https://claude.ai/artifact/G3GHWDQ8eW5RF782ErkCPx
(4 boards: editor, warp mode, fullscreen, first run).

## Problems with the current editor

| Today | Effect |
| --- | --- |
| The only way to resize a surface is to drag all 4 corners one at a time | Making something "a bit bigger" takes four drags and usually skews it |
| The preview is squeezed between two fixed panels, a wrapping top bar and a footer of shortcut text | The stage, where the actual work happens, gets about half the window |
| No fullscreen for the editor; the output window only goes fullscreen for playback | You can't give the stage the whole laptop screen while aligning |
| SCARE, Blackout, Outlines and Test pattern sit next to editing buttons | It's easy to fire a show control by mistake while editing |
| The properties panel is one long form (look, content, crop, scare, raw corner numbers) | Hard to scan; the common actions are buried |
| ▲/▼ buttons for stacking, no lock | Reordering is slow, and calibrated surfaces get bumped |
| Content is chosen from a text `<select>` | You can't see what an effect looks like before picking it |

## Principles

1. **The stage comes first.** The stage gets every pixel the panels don't need, and fullscreen gives it all of them.
2. **Simple by default, precise on demand.** Move and resize like any design tool. Switch to corner-pin warp only when you need perspective.
3. **Tools go next to the object.** The common actions appear in a toolbar right above the selected surface.
4. **Show controls stay separate.** Live controls get their own bar so they can't be confused with editing.
5. **One way to undo everything.** Every change goes through `commit()`, and undo/redo buttons are always visible.

## Layout (default window)

```
┌ Top bar 48px ─ logo · project ▾ · saved · undo/redo ········ ● Projector 1920×1080 live · Remote · Fullscreen F ┐
├ Surfaces 240px ┬──────────────── Stage (dot grid, projector frame centred) ────────────┬ Inspector 300px ──────┤
│ + Add          │            ┌ contextual toolbar ┐                                     │ Name · "Surface 2/6"  │
│ ▣ 6 Pumpkin 👁🔒│            │Resize|Warp  Fire ▾  ⧉ 🔒 🗑│                                     │ Content│Look│Scare│Pos│
│ ▣ 5 Attic      │            └────────────────────┘                                     │ effect tiles grid     │
│ …              │                [selected surface + handles]                           │ sliders               │
│                │  [− Fit +] [Snap] [House photo]                       612 × 488  x654 y312 │                       │
├ Show bar 72px ─┴ SHOW  [⚡ SCARE Space]  Blackout B  Outlines on wall O  Test pattern T ········ ☀ Master ━━━━ ┤
```

- **Surfaces panel (left):** a row per surface with a content thumbnail, name, effect name, an eye toggle and a lock toggle. Drag rows to reorder; the top row draws on top, which inverts the current array order. Double-click a row to rename it.
- **Inspector (right):** four tabs. *Content* has the effect tiles with live thumbnails, a *My media* tab, and the effect's parameters. *Look* has opacity, brightness, soft edge, blend (Normal/Glow/Multiply) and flip. *Scare* has the scare source, how long to hold it, and a test button. *Position* has X/Y/W/H/rotation in projector pixels, plus *Fill output*, *Straighten* and, collapsed, *Crop*.
- **Show bar (bottom):** SCARE, Blackout, Outlines on wall, Test pattern and Master brightness. Nothing in this bar edits the project.
- **Stage controls:** zoom − / Fit / +, a snapping toggle, and a *House photo* toggle that shows a dimmed reference image of the real object under the surfaces. That lets you rough-align on the laptop before checking the wall.

## Direct manipulation

Every surface stays a 4-corner quad (`corners` in `state.js` is unchanged). The UI just offers two ways to edit it:

### Resize mode (default)

- **Move:** drag anywhere inside the surface. Smart guides snap its edges and centre to the output edges, the output centre, and other surfaces' edges and centres, within 8 screen px. The guide line is drawn while snapping. Hold Ctrl/⌘ to move freely.
- **Resize:** 8 handles on the axis-aligned bounding box (corners and edge midpoints). Each corner point is scaled inside the box, so a surface that's already warped keeps its perspective. Shift on a corner handle keeps proportions. Alt resizes from the centre. Minimum size is 30 output px.
- **Rotate:** a round handle 30px above the top edge. Shift snaps to 15°.

### Warp mode (corner pin)

- Toggle it from the contextual toolbar, by pressing **W**, or by **double-clicking** a surface.
- Four large corner pins (TL/TR/BR/BL labels) set the perspective.
- Four edge-midpoint handles move one whole edge, which is how you match a door frame without disturbing the other edge.
- Tab cycles through the corners, Escape deselects the corner, and the arrow keys nudge the active corner.
- While you drag a pin, a 4× loupe shows the area around it, so you can hit a window corner exactly.

### Everywhere

- Arrows nudge 1 output px and Shift+arrows nudge 10. A burst of nudges is one undo step (this is already implemented).
- Click empty stage to deselect.
- A locked surface shows "Locked in place · Unlock" instead of handles, and clicks select it without moving it.
- Scroll to zoom around the cursor. Pinch works on a trackpad. Space+drag or middle-drag pans, and Shift+1 fits the stage.

## Fullscreen

- **Editor fullscreen (F):** calls `document.documentElement.requestFullscreen()` and hides the top bar, both panels and the show bar. The projector frame fills the screen at its aspect ratio. A floating pill at the top keeps Exit (Esc), Resize|Warp, Undo, the selected surface's size, Blackout and SCARE in reach. The pill fades after 2 s without mouse movement and comes back when the pointer nears the top edge.
- **Output window:** keeps today's behaviour (F / double-click). Add an *Edit on wall* toggle that draws the selected surface's handles on the projector output and accepts pointer events there. This is the most direct alignment method: put the output on the projector, move the mouse onto it, and drag corners while looking at the house.

## First run

If a project has no surfaces, the stage shows a 3-step checklist instead of a blank frame:

1. Connect the projector. This ticks itself off as soon as an `outputInfo` message arrives.
2. Add a surface, via a button in the card.
3. Pick what it shows. This ticks off on the first content change.

## Keyboard map

| Key | Action |
| --- | --- |
| F / Esc | Enter / exit editor fullscreen |
| W | Toggle Resize / Warp for the selection |
| Tab / Esc | Warp: next corner / clear corner |
| Arrows, Shift+Arrows | Nudge 1 / 10 px |
| Ctrl+D | Duplicate |
| L | Lock / unlock |
| Delete | Delete (with an undo toast) |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| 1–9 | Select a surface |
| Space · B · O · T | Scare · Blackout · Outlines on wall · Test pattern |
| ? | Shortcut sheet |

Every button's tooltip shows its shortcut, so the footer of shortcut text goes away.

## Visual language

- Dark UI by design, because it's used in a dark yard next to a projector. Ground `#0d0d11`, panels `#16161c`, lines `#2a2a34`, text `#ececf1`, secondary text `#a3a3b2`.
- One accent, orange `#ff8a1f`, for the selection, active toggles and handles. Red `#d42a30` is reserved for SCARE. Green `#34d399` only means "projector connected". Pink `#ff5ad1` is for snap guides.
- Inter for the UI and JetBrains Mono for pixel readouts. Controls are at least 36px tall, and the show bar's are 44–48px.

## Implementation notes (mapping to the code)

- `js/state.js`: add `locked: false` to `newSurface` and `migrate`. Nothing else in the data model changes.
- `js/overlay.js`: split `drawOutlines` into outline drawing (shared with the output) and a new `drawHandles(ctx, surface, mode, opts)` that draws the bbox and 8 handles plus the rotate handle, or the 4 pins plus 4 edge handles. Also add a `drawGuides()`.
- `js/editor.js`:
  - Replace the `drag` modes `corner` and `move` with `move | scale(handle) | rotate | corner(i) | edge(i)`. The math is in the prototype (`scaleCorners`, the rotate block and `snapMove` in `Main.dc.html`). It all operates on output-pixel coordinates and writes back normalised `corners`.
  - Hit-test the handles before the surfaces. The handle radius is in screen px (convert with `css.w`).
  - Add `mode: "transform" | "warp"` as editor UI state, not saved to the project.
  - Add zoom and pan by drawing the preview with a view transform. `toNorm()` must invert it.
- `index.html` / `css/style.css`: the new layout, and move the live controls into `<footer class="showbar">`.
- `js/output.js`: the optional *Edit on wall* mode. It sends pointer events back to the editor over the existing `BroadcastChannel`, and the editor stays the only writer of state.

### Suggested order

1. Resize/rotate handles, snapping and lock. These are the biggest usability win, and the layout doesn't change.
2. New layout: show bar, inspector tabs, effect tiles, layer drag-reorder.
3. Editor fullscreen with the floating pill, plus zoom and pan.
4. First-run checklist, house reference photo, loupe.
5. *Edit on wall* in the output window.
