# Music Notes Trainer

An interactive web app for beginners who are just starting to learn how to read sheet music. It helps you memorize note names and their positions on the staff faster through visual learning and audio feedback.

🔗 **[Open the app](https://shugafuga.github.io/music_notes)** *(replace with your GitHub Pages URL)*

---

## What It Does

- Displays **treble and bass clef** staves with all notes labeled
- Shows each note's name in **Latin (C D E F G A B)** or **Solfège (Do Re Mi Fa Sol La Si)**
- **Click any note** to hear how it sounds — real piano recordings
- Optional **piano keyboard** shown below or overlaid on the staves, so you can connect notes on paper to keys on the instrument
- **Quiz mode** — hides note names so you can test yourself
- Highlighted note + key flash on click to reinforce the connection between sound, name, and position

---

## Who Is It For

- Complete beginners who want to learn to read sheet music
- Students learning piano, guitar, or any instrument that uses standard notation
- Anyone who wants a quick visual reference while practicing

---

## Features

| Feature | Description |
|---|---|
| Note labels | Toggle between Solfège and Latin letter names |
| Label position | Show names below the staff or right next to the note head |
| Ledger lines | Extend staves up/down to show more notes |
| Piano keyboard | Visual keyboard below or overlaid on the staves |
| Colored notes | Each note degree gets its own color for faster recognition |
| Quiz mode | Hide labels and test your memory; shuffle to randomize order |
| Click to play | Hear the real piano sound for any note |
| Scale slider | Zoom in/out while keeping crisp resolution |
| Export PNG | Save the sheet as a high-resolution image (configurable DPI) |
| Dark UI | Easy on the eyes during long practice sessions |
| Settings saved | All your preferences are remembered between visits |

---

## How to Use

1. Open the app in your browser
2. Look at the notes on the staves — each note shows its name and octave number
3. Click any note to hear the sound and see it glow on the staff and keyboard
4. When you feel confident, switch to **Quiz mode** to test yourself
5. Use **Shuffle** to change the order and keep practicing

---

## Running Locally

No build step required — it's plain HTML, CSS, and JavaScript.

```bash
git clone https://github.com/your-username/notes.git
cd notes
python -m http.server 8787
```

Then open [http://localhost:8787](http://localhost:8787) in your browser.

> A local server is needed because the app loads audio samples via `fetch`.
> Opening `index.html` directly as a file (`file://`) will block the audio.

---

## Technology

- HTML5 Canvas for rendering the staves and notes
- Web Audio API with real **piano MP3 samples** (pitch-shifted to cover all notes)
- Vanilla JavaScript — no frameworks or dependencies
- Settings persisted in `localStorage`

---

## License

MIT
