# 🎃 Projector Mapper

A small, dependency-free projection-mapping tool for Halloween and Christmas.
Runs in your browser from a local Python server. Map videos, images, or
built-in generative effects onto real objects with corner-pin perspective
warping: fire, lightning, glowing eyes, fog, ghosts and a shadow figure for
Halloween; snowfall, string lights, candy canes, icicles, a Christmas tree and
Santa's sleigh for Christmas. Trigger jump scares from the keyboard or your
phone, and keep both shows in one project as separate scenes.

## Quick start

```bash
cd projector-mapper
python3 server.py          # prints the editor and phone-remote URLs
```

1. Open **http://localhost:8787/** in Chrome (Firefox works too).
2. Plug in the projector as an **extended** display (not mirrored), or use
   another computer for it (see below).
3. Click **Projector window › Open on this computer** (top right), drag that
   window onto the projector screen and press **F** there for fullscreen.
   (Chrome can place it there automatically if you grant the
   window-management permission.)
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
- **Show bar** (bottom): SCARE, Blackout, Outlines on wall, Test pattern,
  scenes and Master brightness, kept apart from the editing tools.
- **Scenes**: one mapped house, several shows. Surfaces and alignment are
  shared; each scene has its own content and scares. Use **+** in the show bar
  to add a **Christmas starter** or **Halloween starter** (picks an effect for
  every surface from its shape), copy the current scene, or start blank. Click
  a scene to switch the whole house.
- **Theme chips** above the effect tiles filter them: All, Halloween,
  Christmas, Basics.
- **Fullscreen (F)**: hides all panels, leaving the stage and a small floating
  toolbar that fades when idle. Esc exits.
- **Edit on wall**: with the projector window open, this draws the handles on
  the projector itself. Move the mouse onto the projector screen and drag
  them while looking at the house. Arrows, Tab, W, L and Delete work there too.
- **House photo**: trace over a photo (or webcam shot) of the house, shown
  dimmed on the stage only, never on the projector.
- While dragging a warp corner, a magnifier shows the area under the cursor.

## Projector on another computer

The projector window can run on a different computer from the editor, such as
an old laptop or mini PC plugged into the projector:

1. Run `python3 server.py` on the editor computer.
2. Click **Projector window** in the editor's top bar. It shows an address
   like `http://192.168.1.20:8787/output.html`.
3. On the projector computer, open that address in Chrome (same Wi‑Fi or
   network) and press **F** for fullscreen.

It connects through the server automatically. Edits, scenes, scares, Blackout,
outlines and **Edit on wall** all work as usual. Keys pressed on the projector
computer (Space, B, O, and the editing keys while editing on the wall) go back
to the editor. The server keeps the latest show, so the projector keeps running
if the editor closes, and picks the show up again after a reload.

Notes:

- Media files are served by the editor computer, so keep it running.
- Live video can't play in a projector window opened over the network,
  because browsers only allow cameras and window capture on localhost or
  HTTPS. Run live video from a projector window on the editor computer.
- Anyone on your network can open these pages; run the server on a network
  you trust.

## Phone remote

Click **Remote** in the top bar for the address (it uses your LAN IP). Open it
on a phone on the same Wi‑Fi for big SCARE / BLACKOUT buttons, outlines and
**Next scene**.

## Live video (stream from a phone or another computer)

In the inspector's **Content** tab, pick **Live** to put a live feed on a
surface:

- **Camera or capture device**: webcams, HDMI capture dongles, OBS Virtual
  Camera, or a phone set up as a webcam. On Windows 11, an Android phone can
  be a webcam via Settings › Bluetooth & devices › Mobile devices. Phone
  webcam apps work too.
- **Window capture**: any window on this computer. To show a phone's or
  another PC's screen, let them cast to this computer first. On Windows, go
  to Settings › System › Projecting to this PC › Optional features, add
  **Wireless Display**, turn projecting on, and open the Wireless Display app.
  Then cast from Android (Cast / Smart View / Screen mirroring) or from
  another Windows PC (Win+K), and pick that window here. iPhones can't cast to
  Windows; use an AirPlay receiver app on the PC and capture its window
  instead.

Notes:

- Browsers only allow cameras and screen capture on secure origins, so open
  the editor at **http://localhost:8787** on the projector computer (not its
  LAN address).
- Each window captures on its own. Cameras start automatically. Window
  capture needs one click in each window: the editor shows a notice, and the
  projector window shows a **Start live window** button. Repeat after
  reloading.
- Cameras are remembered by name, so the projector window finds the same one
  even though browsers give it a different id there.

## Christmas

Effects: Snowfall, String lights, Candy cane stripes, Wrapped present,
Icicles, Northern lights, Santa's sleigh, Hanging ornaments, Twinkling stars
and Christmas tree (plus Fire, Candle flicker and Text message).

- **Christmas starter** puts candy canes on tall columns, icicles on roof
  lines, string lights on other long strips, northern lights or the sleigh on
  big areas, and trees, snow, ornaments and presents in windows.
- **Snowfall** stacks over any other surface. Add a surface, click **Fill
  output** in Position, and put it on top of the list for snow over the whole
  house.
- **String lights** has palettes (classic, warm white, red & green, blue &
  white, rainbow) and twinkle, chase, fade or steady patterns.
- **Candy cane stripes** shades like a round pillar by default; switch
  Shading to Flat for flat surfaces.
- Text message works for "Merry Christmas" too: change the text, colour and
  font in its settings.

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
- **Layering:** black means "no light", so wherever a surface is black the
  surfaces under it show through (dim areas are partly see-through, bright
  areas cover). Snow, eyes, fog, sparkles and lights stack over anything. To
  use a black surface as a mask that hides what's below, set **Look › Black
  areas** to **Solid**.
- **Blend: Glow** adds light, for extra-bright eyes, fire and candles over other layers.
- Looping video formats that work everywhere: MP4 (H.264) or WebM.

## Files

- `server.py` – static server with HTTP range support, media listing, uploads, project save/load, and the network relay (phone remote, projector windows on other computers).
- `js/link.js` – editor ↔ projector messaging: BroadcastChannel on one computer, the server relay across computers.
- `index.html`, `js/editor.js` – editor shell (top bar, show bar, fullscreen, keys, projects, uploads).
- `js/editor/` – `store.js` (state, undo, events), `stage.js` (zoom/pan, preview, handles), `interact.js` (move/resize/rotate/warp + snapping), `layers.js`, `inspector.js`.
- `js/geometry.js`, `js/overlay.js`, `js/thumbs.js` – shared geometry, overlay drawing, effect/media thumbnails.
- `output.html`, `js/output.js` – projector output window.
- `js/scene.js`, `js/renderer.js` – WebGL homography renderer and media/effect sources.
- `js/effects.js` – built-in effects and theme tags. Add your own by adding an entry to `EFFECTS`.
- `js/effects-christmas.js`, `js/fx-util.js` – the Christmas pack and helpers shared by effect packs.
- `js/editor/scenes.js` – scenes and the Christmas/Halloween starters.
- `js/live.js` – live video sources (cameras, capture devices, window capture).
- `media/` – your videos/images. `projects/` – saved projects.
