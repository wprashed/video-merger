from flask import Flask, render_template, request, send_file, jsonify
import os
import subprocess
import uuid
import cv2
from pathlib import Path

app = Flask(__name__)

# Directories
UPLOAD_FOLDER = "uploads"
MERGE_FOLDER = "merged"
THUMBNAIL_FOLDER = "static/thumbnails"
FFMPEG_PATH = "ffmpeg"
SUPPORTED_TRANSITIONS = {"none", "fade", "wipeleft", "wiperight", "slideleft", "slideright", "circleopen"}
SUPPORTED_AUDIO_MODES = {"original", "mix", "music"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(MERGE_FOLDER, exist_ok=True)
os.makedirs(THUMBNAIL_FOLDER, exist_ok=True)

PRESETS = {
    "original": None,
    "480p": ("854", "480"),
    "720p": ("1280", "720"),
    "1080p": ("1920", "1080"),
    "1440p": ("2560", "1440"),
    "720x1280": ("720", "1280"),
    "1080x1920": ("1080", "1920"),
    "1440x2560": ("1440", "2560"),
    "4K": ("3840", "2160")
}

FILTER_PRESETS = {
    "grayscale": "format=gray",
    "blur": "boxblur=5:1",
    "brightness": "curves=preset=lighter",
    "contrast": "eq=contrast=1.3",
    "sepia": "colorchannelmixer=.393:.769:.189:.349:.686:.168:.272:.534:.131",
    "vivid": "eq=saturation=1.35:contrast=1.15",
    "sharpen": "unsharp=5:5:1.0:5:5:0.0"
}


def get_video_duration(video_path):
    """Extract video duration in seconds"""
    try:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        return frame_count / fps if fps > 0 else 0
    except:
        return 0


def get_video_resolution(video_path):
    """Extract video resolution as (width, height)"""
    try:
        cap = cv2.VideoCapture(video_path)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        if width > 0 and height > 0:
            return str(width), str(height)
        return None
    except:
        return None


def generate_thumbnail(video_path):
    """Generate thumbnail from first frame"""
    try:
        cap = cv2.VideoCapture(video_path)
        success, frame = cap.read()
        thumbnail_filename = f"thumb_{uuid.uuid4()}.jpg"
        thumbnail_path = os.path.join(THUMBNAIL_FOLDER, thumbnail_filename)

        if success:
            frame = cv2.resize(frame, (160, 90))
            cv2.imwrite(thumbnail_path, frame)

        cap.release()
        return f"/static/thumbnails/{thumbnail_filename}"
    except Exception as e:
        print(f"Thumbnail generation error: {e}")
        return None


def normalize_video(input_file, width, height, filters=None):
    """Normalize video to preset resolution with optional filters"""
    output_file = os.path.join(UPLOAD_FOLDER, f"norm_{uuid.uuid4()}.mp4")
    vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"

    if filters:
        for filt in filters:
            if filt in FILTER_PRESETS:
                vf += f",{FILTER_PRESETS[filt]}"

    cmd = [
        FFMPEG_PATH, "-y", "-i", input_file,
        "-vf", vf,
        "-r", "30", "-c:v", "libx264", "-preset", "faster",
        "-c:a", "aac", output_file
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return output_file
    except Exception as e:
        print(f"Normalization error: {e}")
        return None


def merge_without_transitions(video_files):
    """Merge normalized videos without transition effects."""
    concat_file = os.path.join(MERGE_FOLDER, f"{uuid.uuid4()}.txt")
    with open(concat_file, "w") as f:
        for v in video_files:
            f.write(f"file '{os.path.abspath(v)}'\n")

    output_file = os.path.join(MERGE_FOLDER, f"merged_raw_{uuid.uuid4()}.mp4")
    subprocess.run([
        FFMPEG_PATH, "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
        "-c", "copy", output_file
    ], check=True)
    return output_file


def merge_with_transitions(video_files, transition, transition_duration):
    """Merge normalized videos with ffmpeg xfade/acrossfade transitions."""
    durations = [get_video_duration(v) for v in video_files]

    cmd = [FFMPEG_PATH, "-y"]
    for video in video_files:
        cmd.extend(["-i", video])

    filter_parts = []
    current_v = "[0:v]"
    current_a = "[0:a]"
    running_time = durations[0]

    for i in range(1, len(video_files)):
        v_out = f"[v{i}]"
        a_out = f"[a{i}]"
        offset = max(running_time - transition_duration, 0)
        filter_parts.append(
            f"{current_v}[{i}:v]xfade=transition={transition}:duration={transition_duration}:offset={offset}{v_out}"
        )
        filter_parts.append(
            f"{current_a}[{i}:a]acrossfade=d={transition_duration}:c1=tri:c2=tri{a_out}"
        )
        current_v = v_out
        current_a = a_out
        running_time += max(durations[i] - transition_duration, 0)

    output_file = os.path.join(MERGE_FOLDER, f"merged_transition_{uuid.uuid4()}.mp4")
    cmd.extend([
        "-filter_complex", ";".join(filter_parts),
        "-map", current_v,
        "-map", current_a,
        "-c:v", "libx264",
        "-preset", "faster",
        "-c:a", "aac",
        output_file
    ])
    subprocess.run(cmd, check=True)
    return output_file


def process_audio(video_input, audio_mode, original_volume, music_volume, ducking, bg_music_path=None):
    """Process output audio like a simple video editor."""
    # Fast path: keep existing audio/video untouched.
    if audio_mode == "original" and bg_music_path is None and abs(original_volume - 1.0) < 0.001:
        return video_input

    output_file = os.path.join(MERGE_FOLDER, f"merged_audio_{uuid.uuid4()}.mp4")

    cmd = [FFMPEG_PATH, "-y", "-i", video_input]
    if bg_music_path:
        cmd.extend(["-stream_loop", "-1", "-i", bg_music_path])

    if audio_mode == "original" or not bg_music_path:
        filter_complex = f"[0:a]volume={original_volume}[aout]"
    elif audio_mode == "music":
        filter_complex = f"[1:a]volume={music_volume}[aout]"
    else:
        if ducking:
            filter_complex = (
                f"[0:a]volume={original_volume}[orig];"
                f"[1:a]volume={music_volume}[bg];"
                f"[bg][orig]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[bgduck];"
                f"[orig][bgduck]amix=inputs=2:duration=first:dropout_transition=2[aout]"
            )
        else:
            filter_complex = (
                f"[0:a]volume={original_volume}[orig];"
                f"[1:a]volume={music_volume}[bg];"
                f"[orig][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"
            )

    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        output_file
    ])

    subprocess.run(cmd, check=True)
    return output_file


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    """Handle video uploads"""
    files = request.files.getlist("videos")
    paths = []
    thumbs = []
    durations = []

    for f in files:
        filename = f"{uuid.uuid4()}_{f.filename}"
        path = os.path.join(UPLOAD_FOLDER, filename)
        f.save(path)
        paths.append(path)

        thumbs.append(generate_thumbnail(path))
        durations.append(get_video_duration(path))

    return jsonify({"paths": paths, "thumbnails": thumbs, "durations": durations})


@app.route("/merge", methods=["POST"])
def merge():
    """Merge videos with settings"""
    videos = request.form.getlist("videos[]") or request.form.get("videos")
    if isinstance(videos, str):
        import json
        videos = json.loads(videos)

    preset = request.form.get("preset", "original")
    filters = request.form.get("filters", "[]")
    if isinstance(filters, str):
        import json
        filters = json.loads(filters)

    output_name = request.form.get("outputName", "merged.mp4")
    transition = request.form.get("transition", "none")
    if transition not in SUPPORTED_TRANSITIONS:
        transition = "none"
    try:
        transition_duration = float(request.form.get("transitionDuration", "0.6"))
    except ValueError:
        transition_duration = 0.6
    transition_duration = max(0.1, min(2.0, transition_duration))

    audio_mode = request.form.get("audioMode", "original")
    if audio_mode not in SUPPORTED_AUDIO_MODES:
        audio_mode = "original"
    try:
        original_volume = float(request.form.get("originalVolume", "1.0"))
    except ValueError:
        original_volume = 1.0
    try:
        music_volume = float(request.form.get("musicVolume", "0.35"))
    except ValueError:
        music_volume = 0.35
    ducking = request.form.get("ducking", "false").lower() == "true"

    intro = request.files.get("intro")
    outro = request.files.get("outro")
    background_music = request.files.get("backgroundMusic")

    if not videos:
        return jsonify({"error": "No videos provided"}), 400

    if preset == "original":
        # Use first uploaded video's resolution as the merge output size.
        detected_resolution = get_video_resolution(videos[0])
        width, height = detected_resolution or ("1920", "1080")
    else:
        width, height = PRESETS.get(preset, ("1920", "1080"))
    final_list = []

    try:
        background_music_path = None
        if background_music:
            background_music_path = os.path.join(UPLOAD_FOLDER, f"bgm_{uuid.uuid4()}_{background_music.filename}")
            background_music.save(background_music_path)

        if audio_mode in ("music", "mix") and not background_music_path:
            return jsonify({"error": "Please upload background music for selected audio mode"}), 400

        if intro:
            intro_path = os.path.join(UPLOAD_FOLDER, f"intro_{uuid.uuid4()}.mp4")
            intro.save(intro_path)
            normalized = normalize_video(intro_path, width, height, filters)
            if normalized:
                final_list.append(normalized)

        for video_path in videos:
            normalized = normalize_video(video_path, width, height, filters)
            if normalized:
                final_list.append(normalized)

        if outro:
            outro_path = os.path.join(UPLOAD_FOLDER, f"outro_{uuid.uuid4()}.mp4")
            outro.save(outro_path)
            normalized = normalize_video(outro_path, width, height, filters)
            if normalized:
                final_list.append(normalized)

        if not final_list:
            return jsonify({"error": "No valid videos to merge"}), 400

        if transition != "none" and len(final_list) > 1:
            merged_video = merge_with_transitions(final_list, transition, transition_duration)
        else:
            merged_video = merge_without_transitions(final_list)

        processed_video = process_audio(
            merged_video,
            audio_mode=audio_mode,
            original_volume=original_volume,
            music_volume=music_volume,
            ducking=ducking,
            bg_music_path=background_music_path
        )

        return send_file(processed_video, as_attachment=True, download_name=output_name)

    except Exception as e:
        print(f"Merge error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True)
