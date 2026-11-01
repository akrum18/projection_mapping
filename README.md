# 🎃 Projector Mapper

A small, dependency-free projection-mapping tool for Halloween. Runs in your
browser from a local Python server. Map videos, images, or built-in generative
effects (fire, lightning, glowing eyes, blood, fog, ghosts, spiders, a shadow
figure walking past a window…) onto real objects with corner-pin perspective
warping, then trigger jump scares from the keyboard or your phone.

## Quick start

```bash
cd projector-mapper
python3 server.py          # prints the editor and phone-remote URLs
```

1. Open **http://localhost:8787/** in Chrome (Firefox works too).
2. Plug in the projector as an **extended** display (not mirrored).
3. Click **Open projector window** (top right), drag that window onto the
   projector screen and press **F** there for fullscreen. (Chrome can place it
   there automatically if you grant the window-management permission.)
4. Click **Add surface** and drag it over a window, door or prop. Drag the
   square handles to resize it and the round handle to rotate it. Press **W**
   (or double-click it) to switch to **Warp** and pin each corner onto the
   real object.
5. Pick what it shows from the effect tiles on the right, or drop your own
   videos and images anywhere on the page and use them from **My media**.
   You can also drag a tile straight onto a surface on the stage.
6. Set a **Scare** per surface. Press **Space** (or the phone remote) to fire
   every scare at once; each plays once, then returns to normal.
7. **Lock** each surface once it's aligned so it can't be bumped, and save
   from the project menu (**Ctrl+S**). Work also autosaves to the browser.

## The editor

- **Stage** (centre): the projector frame. Scroll or pinch to zoom at the
  cursor, drag empty space to pan, **0** to fit. Smart guides snap surfaces to
  the frame edges, the centre and each other (hold Ctrl/⌘ to move freely).
- **Toolbar above the selected surface**: Resize / Warp, what it shows,
  duplicate, lock, delete.
- **Surfaces** (left): drag rows to reorder (the top row draws on top),
  double-click to rename, eye to hide, padlock to lock.
- **Inspector** (right): Content, Look, Scare and Position tabs. Position
  takes exact projector pixels, including width, height and rotation.
- **Show bar** (bottom): SCARE, Blackout, Outlines on wall, Test pattern and
  Master brightness, kept apart from the editing tools.
- **Fullscreen (F)**: hides all panels, leaving the stage and a small floating
  toolbar that fades when idle. Esc exits.
- **Edit on wall**: with the projector window open, this draws the handles on
  the projector itself. Move the mouse onto the projector screen and drag
  them while looking at the house. Arrows, Tab, W, L and Delete work there too.
- **House photo**: trace over a photo (or webcam shot) of the house, shown
  dimmed on the stage only, never on the projector.
- While dragging a warp corner, a magnifier shows the area under the cursor.

## Phone remote

Click **Remote** in the top bar for the address (it uses your LAN IP). Open it
on a phone on the same Wi‑Fi for big SCARE / BLACKOUT buttons.

## Keys (editor)

Press **?** in the editor for this list.

| Key | Action |
| --- | --- |
| Drag surface / handle / round handle | Move / resize / rotate (Shift keeps proportions or snaps to 15°, Alt resizes from the centre) |
| W or double-click | Switch Resize / Warp |
| Tab | Next corner (Warp) |
| Arrows (Shift ×10) | Nudge the selected corner, or the whole surface |
| Ctrl+D / L / Delete | Duplicate / lock / delete |
| 1–9, Esc | Select surface, clear selection |
| F | Fullscreen editing |
| + / − / 0 | Zoom in / out / fit |
| Space | Scare |
| B / O / T | Blackout / outlines on output / test pattern |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Save project |

Output window: **F** fullscreen, **H** toggle hint, **Space** scare, **B** blackout, **O** outlines.

## Tips

- Use the **Test pattern** to focus the projector and check it's on the right screen.
- **Soft edge** feathers a surface's borders so it blends into darkness.
- **Crop** shows only part of a video/image on a surface; duplicate a surface and
  crop differently to split one video across several objects.
- **Blend: Add** makes glows (eyes, fire, candle) composite nicely over other layers.
- Transparent-background effects (fog, eyes, blood, rain, spiders) can be stacked
  on top of a video surface for layered looks.
- Looping video formats that work everywhere: MP4 (H.264) or WebM.

## Files

- `server.py` – static server with HTTP range support, media listing, uploads, project save/load, SSE relay for the remote.
- `index.html`, `js/editor.js` – editor shell (top bar, show bar, fullscreen, keys, projects, uploads).
- `js/editor/` – `store.js` (state, undo, events), `stage.js` (zoom/pan, preview, handles), `interact.js` (move/resize/rotate/warp + snapping), `layers.js`, `inspector.js`.
- `js/geometry.js`, `js/overlay.js`, `js/thumbs.js` – shared geometry, overlay drawing, effect/media thumbnails.
- `output.html`, `js/output.js` – projector output window.
- `js/scene.js`, `js/renderer.js` – WebGL homography renderer and media/effect sources.
- `js/effects.js` – built-in effects. Add your own by adding an entry to `EFFECTS`.
- `media/` – your videos/images. `projects/` – saved projects.
