# Cable Counter

A phone app for keeping your place in knitting charts. It's built for complex patterns where you follow several cable charts at once.

- **Projects and parts.** A project (e.g. *Aran jumper*) has parts (*Back*, *Left front*, *Right front*, *Left sleeve*, *Right sleeve*). Set up one sleeve, then **Duplicate** it; the copy is named *Right sleeve* for you.
- **Charts per part.** Each part has as many charts as you need. Each chart has its own label, colour, number of rows, and an optional **start row** for staggered charts.
- **One big +1 button.** Each press moves every chart in the part forward one row. Each chart goes back to row 1 after its own last row.
- **Small −1 button** for counting backwards. A chart on row 1 goes back to its last row.
- **Glanceable.** Each chart has its own colour and a bar showing how far through its repeat it is. A chart on its last row is tinted, and one that has just started again glows briefly. The screen also shows the part's row number, rows knitted, and which repeat each chart is on.
- **Continue knitting.** The home screen opens the part you were last counting with one tap.
- **Adjust** (in the ⋯ menu) moves a single chart forward or back if it has got out of step.
- **Undo instead of "are you sure?".** Deleting a part, project or chart, or resetting a count, happens straight away with a few seconds to undo it.
- **Keeps the screen awake** while counting, with **haptic feedback** on each row (a double buzz when a chart starts again). On iPhone this uses the system haptic (iOS 18+). Both can be turned off in Settings.
- **Backup.** Export all projects to a file, and restore from it on a new phone.
- Works **offline** once installed. Data is stored on the phone only.
- Keyboard / Bluetooth page turners: → ↓ Page Down or Space = +1, ← ↑ Page Up = −1.
- Light and dark themes, and full support for *Reduce motion*.

## Installing on your phone

The app is a Progressive Web App: a website you add to your home screen. After that it opens full-screen like a normal app.

1. **One-time setup:** in this GitHub repository go to **Settings → Pages**, and under *Build and deployment* set **Source** to **GitHub Actions**.
   Every push to `main` then publishes the app to `https://<your-username>.github.io/cable-counting-app/`.
2. Open that link on your phone:
   - **iPhone/iPad:** in Safari tap **Share → Add to Home Screen**.
   - **Android:** in Chrome tap **⋮ → Install app** (or *Add to Home screen*).

## Development

No build step and no dependencies: plain HTML, CSS and JavaScript modules.

```sh
npm start   # serves the app at http://localhost:8080
npm test    # unit tests for the counting logic (Node 18+)
```

| File | Purpose |
| --- | --- |
| `js/model.js` | Data model and counting logic (no DOM; unit tested) |
| `js/app.js` | Screens, navigation and event handling |
| `js/storage.js` | Saving to the phone (`localStorage`) |
| `js/device.js` | Screen wake lock and haptics |
| `sw.js` | Offline cache. **Bump `VERSION` when you change app files** so installed copies update. |
| `fonts/` | Fraunces (titles) and Figtree (interface and numbers), bundled so they work offline. SIL Open Font License. |
| `tests/` | `node --test` unit tests |

### Design

The look is meant to stay out of your way while you knit:

- **One thing stands out per screen.** On the counting screen that's the +1 button. Row numbers are the largest text in each chart card, and everything else is quieter.
- **A warm, low-glare palette** of undyed-wool neutrals and natural-dye colours (madder, indigo, weld, sage…). Strong colour is used only to tell charts apart and for the main action.
- **Soft, rounded shapes and an even spacing rhythm.**
- **Short, gentle motion that confirms what happened:** numbers roll in the direction you counted, bars fill, a chart glows when it starts again, and screens slide in the direction you're going. All of it is switched off when the phone's *Reduce motion* setting is on.
- **Less used actions live in ⋯ menus** (bottom sheets within thumb reach), so the screens stay calm.

### How counting works

Each part stores `rowsKnitted`. Each chart stores `rows`, `startRow` and `nudge` (the total of manual adjustments). A chart's current row is

```
((startRow − 1 + rowsKnitted + nudge) mod rows) + 1
```

So pressing +1 or −1 only changes one number, and every chart stays in step.
