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
3. Click **Open output window**, drag that window onto the projector screen,
   press **F** for fullscreen. (Chrome can place it there automatically if you
   grant the window-management permission.)
4. Turn on **Outlines on output** so you can see each surface's edges on the
   real object, then drag the corner handles in the editor until they line up.
5. Pick content for each surface in the right-hand panel. Drop your own video or
   image files anywhere on the editor page to upload them into `media/`.
6. Set a **Scare** source per surface. Press **Space** (or the phone remote) to
   fire every scare at once; it plays once, then returns to the normal content.
7. **Save** your project so it survives a restart. It also autosaves to the
   browser.

## Phone remote

The server prints a `remote.html` URL with your LAN IP. Open it on a phone on
the same Wi‑Fi for big SCARE / BLACKOUT buttons.

## Keys (editor)

| Key | Action |
| --- | --- |
| Drag corner / inside | Warp corner / move surface |
| Arrows (Shift ×10) | Nudge selected corner, or the whole surface if none selected (Tab cycles corners) |
| 1–9 | Select surface |
| Space | Scare |
| B / O / T | Blackout / outlines on output / test pattern |
| Delete | Delete surface |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Save project |

Output window: **F** fullscreen, **H** toggle hint, **Space** scare, **B** blackout.

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
- `index.html`, `js/editor.js` – editor UI.
- `output.html`, `js/output.js` – projector output window.
- `js/scene.js`, `js/renderer.js` – WebGL homography renderer and media/effect sources.
- `js/effects.js` – built-in effects. Add your own by adding an entry to `EFFECTS`.
- `media/` – your videos/images. `projects/` – saved projects.
