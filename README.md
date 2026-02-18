# Video Merger Studio

A Flask-based web video editor for merging clips with:
- Resolution presets (including vertical)
- Transition effects
- Video filters
- Background music and audio mixing
- Intro/outro clips
- Timeline preview UI

## Requirements

- Python 3.10+
- `ffmpeg` installed and available in your PATH

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

Then open: [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Project Structure

- `/Users/rashed/PycharmProjects/video-merger/app.py` - Flask backend and ffmpeg processing
- `/Users/rashed/PycharmProjects/video-merger/templates/index.html` - Main editor UI
- `/Users/rashed/PycharmProjects/video-merger/static/js/app.js` - Frontend editor behavior
- `/Users/rashed/PycharmProjects/video-merger/static/css/styles.css` - Editor styling
- `/Users/rashed/PycharmProjects/video-merger/uploads` - Uploaded and normalized temp videos
- `/Users/rashed/PycharmProjects/video-merger/merged` - Generated output files

## Notes

- Ensure `ffmpeg` works by running:

```bash
ffmpeg -version
```

- If processing fails, check terminal logs from `app.py` for ffmpeg errors.
