# Cable Counter

A phone app for keeping your place in knitting charts. It's built for complex patterns where you follow several cable charts at once.

- **Projects and parts.** A project (e.g. *Aran jumper*) has parts (*Back*, *Left front*, *Right front*, *Left sleeve*, *Right sleeve*). Set up one sleeve, then use **Duplicate** for the other.
- **Charts per part.** Each part has as many charts as you need. Each chart has its own label, number of rows, and optional **start row** for staggered charts.
- **One big +1 button.** Each press moves every chart in the part forward one row. Each chart goes back to row 1 after its own last row.
- **Small −1 button** for counting backwards. A chart on row 1 goes back to its last row.
- **Totals and repeats.** The screen shows the part's row number and rows done, and which repeat each chart is on. A chart on its last row is highlighted, and a chart that has just started again flashes.
- **Adjust** mode moves a single chart forward or back if it has got out of step with the others.
- **Keeps the screen awake** while counting, and **vibrates** on each row (a double buzz when a chart starts again). Both can be turned off in Settings. iPhones don't let web apps vibrate.
- **Backup.** Export all projects to a file, and restore from it on a new phone.
- Works **offline** once installed. Data is stored on the phone only.
- Keyboard / Bluetooth page turners: → ↓ Page Down or Space = +1, ← ↑ Page Up = −1.

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
| `js/device.js` | Screen wake lock and vibration |
| `sw.js` | Offline cache. **Bump `VERSION` when you change app files** so installed copies update. |
| `tests/` | `node --test` unit tests |

### How counting works

Each part stores `rowsKnitted`. Each chart stores `rows`, `startRow` and `nudge` (the total of manual adjustments). A chart's current row is

```
((startRow − 1 + rowsKnitted + nudge) mod rows) + 1
```

So pressing +1 or −1 only changes one number, and every chart stays in step.
