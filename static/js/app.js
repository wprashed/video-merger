class VideoMergerApp {
  constructor() {
    this.state = {
      videos: [],
      thumbnails: [],
      durations: [],
      previewUrls: [],
      settings: {
        preset: "original",
        intro: null,
        outro: null,
        subtitles: null,
        watermark: null,
        filters: [],
        transition: "none",
        transitionDuration: 0.6,
        backgroundMusic: null,
        audioMode: "original",
        originalVolume: 1.0,
        musicVolume: 0.35,
        ducking: false,
        outputName: "merged.mp4",
      },
    }

    this.isProcessing = false
    this.currentClipIndex = -1
    this.sortableInstance = null
    this.timelineScale = 42
    this.timelineOffsets = []
    this.totalTimelineDuration = 0
    this.timelinePlayhead = null
    this.init()
  }

  init() {
    this.setupElements()
    this.setupEventListeners()
    this.loadPresetsFromStorage()
    this.updatePreviewEmptyState()
    console.log("[v0] App initialized, elements and listeners ready")
  }

  setupElements() {
    this.dropZone = document.getElementById("drop-zone")
    this.videoUpload = document.getElementById("video-upload")
    this.videosList = document.getElementById("videos-list")
    this.timeline = document.getElementById("timeline")
    this.timelineTotal = document.getElementById("timeline-total")
    this.mergeBtn = document.getElementById("merge-videos")
    this.progressBar = document.getElementById("progress")
    this.statusText = document.getElementById("status")
    this.toast = document.getElementById("toast")
    this.previewPlayer = document.getElementById("preview-player")
    this.previewTag = document.getElementById("preview-tag")
    this.previewPlayBtn = document.getElementById("preview-play")
    this.previewPrevBtn = document.getElementById("preview-prev")
    this.previewNextBtn = document.getElementById("preview-next")
    this.previewMuteBtn = document.getElementById("preview-mute")
    this.previewTime = document.getElementById("preview-time")
    this.previewScrubber = document.getElementById("preview-scrubber")
    this.presetSelect = document.getElementById("preset")
    this.introInput = document.getElementById("intro")
    this.outroInput = document.getElementById("outro")
    this.subtitlesInput = document.getElementById("subtitles")
    this.watermarkImgInput = document.getElementById("watermark-img")
    this.watermarkTextInput = document.getElementById("watermark-text")
    this.filterSelect = document.getElementById("filter-preset")
    this.transitionSelect = document.getElementById("transition")
    this.transitionDurationInput = document.getElementById("transition-duration")
    this.backgroundMusicInput = document.getElementById("background-music")
    this.audioModeSelect = document.getElementById("audio-mode")
    this.originalVolumeInput = document.getElementById("original-volume")
    this.musicVolumeInput = document.getElementById("music-volume")
    this.duckingInput = document.getElementById("ducking")
    this.outputNameInput = document.getElementById("output-name")
    this.presetSaveBtn = document.getElementById("save-preset-btn")
    this.presetLoadBtn = document.getElementById("load-preset-btn")
  }

  setupEventListeners() {
    this.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.dropZone.classList.add("drag-over")
    })

    this.dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.dropZone.classList.remove("drag-over")
    })

    this.dropZone.addEventListener("drop", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.dropZone.classList.remove("drag-over")
      this.uploadFiles(e.dataTransfer.files)
    })

    const fileLabel = this.dropZone.querySelector(".file-input-label")
    if (fileLabel) {
      fileLabel.addEventListener("click", (e) => {
        e.stopPropagation()
        this.videoUpload.click()
      })
    }

    this.dropZone.addEventListener("click", (e) => {
      if (!e.target.closest(".file-input-label")) this.videoUpload.click()
    })

    this.videoUpload.addEventListener("change", (e) => this.uploadFiles(e.target.files))
    this.mergeBtn.addEventListener("click", () => this.handleMerge())

    this.previewPlayBtn.addEventListener("click", () => this.togglePreviewPlayback())
    this.previewPrevBtn.addEventListener("click", () => this.playPreviousClip())
    this.previewNextBtn.addEventListener("click", () => this.playNextClip(true))
    this.previewMuteBtn.addEventListener("click", () => {
      this.previewPlayer.muted = !this.previewPlayer.muted
      this.previewMuteBtn.textContent = this.previewPlayer.muted ? "Unmute" : "Mute"
    })
    this.previewScrubber.addEventListener("input", () => {
      const duration = this.previewPlayer.duration || 0
      if (!duration) return
      const percent = Number.parseFloat(this.previewScrubber.value) || 0
      this.previewPlayer.currentTime = (percent / 100) * duration
    })

    this.previewPlayer.addEventListener("loadedmetadata", () => this.updatePreviewTimeUI())
    this.previewPlayer.addEventListener("timeupdate", () => {
      this.updatePreviewTimeUI()
      this.updateTimelinePlayhead()
    })
    this.previewPlayer.addEventListener("play", () => {
      this.previewPlayBtn.textContent = "Pause"
    })
    this.previewPlayer.addEventListener("pause", () => {
      this.previewPlayBtn.textContent = "Play"
    })
    this.previewPlayer.addEventListener("ended", () => this.playNextClip(true))

    this.presetSelect.addEventListener("change", (e) => {
      this.state.settings.preset = e.target.value
    })
    this.filterSelect.addEventListener("change", (e) => {
      this.state.settings.filters = e.target.value ? [e.target.value] : []
    })
    this.transitionSelect.addEventListener("change", (e) => {
      this.state.settings.transition = e.target.value
    })
    this.transitionDurationInput.addEventListener("change", (e) => {
      const value = Number.parseFloat(e.target.value)
      this.state.settings.transitionDuration = Number.isFinite(value) ? Math.min(2, Math.max(0.1, value)) : 0.6
      this.transitionDurationInput.value = this.state.settings.transitionDuration
    })
    this.audioModeSelect.addEventListener("change", (e) => {
      this.state.settings.audioMode = e.target.value
    })
    this.originalVolumeInput.addEventListener("change", (e) => {
      const value = Number.parseFloat(e.target.value)
      this.state.settings.originalVolume = Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1.0
      this.originalVolumeInput.value = this.state.settings.originalVolume
    })
    this.musicVolumeInput.addEventListener("change", (e) => {
      const value = Number.parseFloat(e.target.value)
      this.state.settings.musicVolume = Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 0.35
      this.musicVolumeInput.value = this.state.settings.musicVolume
    })
    this.duckingInput.addEventListener("change", (e) => {
      this.state.settings.ducking = e.target.checked
    })
    this.outputNameInput.addEventListener("change", (e) => {
      this.state.settings.outputName = e.target.value || "merged.mp4"
    })

    this.presetSaveBtn.addEventListener("click", () => this.savePreset())
    this.presetLoadBtn.addEventListener("click", () => this.loadPreset())
    this.setupFileInputListeners()

    window.addEventListener("beforeunload", () => this.cleanupPreviewUrls())
  }

  setupFileInputListeners() {
    const fileInputs = [
      { input: this.introInput, display: "intro-name" },
      { input: this.outroInput, display: "outro-name" },
      { input: this.subtitlesInput, display: "subtitles-name" },
      { input: this.watermarkImgInput, display: "watermark-img-name" },
      { input: this.backgroundMusicInput, display: "background-music-name" },
    ]

    fileInputs.forEach(({ input, display }) => {
      input.addEventListener("change", () => {
        const displayEl = document.getElementById(display)
        if (input.files[0]) {
          displayEl.textContent = input.files[0].name
          displayEl.classList.add("active")
        } else {
          displayEl.textContent = ""
          displayEl.classList.remove("active")
        }
      })
    })

    this.introInput.addEventListener("change", () => {
      this.state.settings.intro = this.introInput.files[0]
    })
    this.outroInput.addEventListener("change", () => {
      this.state.settings.outro = this.outroInput.files[0]
    })
    this.subtitlesInput.addEventListener("change", () => {
      this.state.settings.subtitles = this.subtitlesInput.files[0]
    })
    this.watermarkImgInput.addEventListener("change", () => {
      this.state.settings.watermark = this.watermarkImgInput.files[0]
    })
    this.backgroundMusicInput.addEventListener("change", () => {
      this.state.settings.backgroundMusic = this.backgroundMusicInput.files[0] || null
    })
    this.watermarkTextInput.addEventListener("change", (e) => {
      if (e.target.value) this.state.settings.watermark = e.target.value
    })
  }

  async uploadFiles(files) {
    const videoFiles = Array.from(files).filter((f) => f.type.startsWith("video/"))
    if (videoFiles.length === 0) {
      this.showToast("Please select video files", "error")
      return
    }

    const formData = new FormData()
    videoFiles.forEach((f) => formData.append("videos", f))

    try {
      this.mergeBtn.disabled = true
      this.statusText.textContent = "Uploading and analyzing videos..."

      const res = await fetch("/upload", { method: "POST", body: formData })
      const data = await res.json()
      const previewUrls = videoFiles.map((file) => URL.createObjectURL(file))

      this.state.videos.push(...data.paths)
      this.state.thumbnails.push(...data.thumbnails)
      this.state.durations.push(...data.durations)
      this.state.previewUrls.push(...previewUrls)

      this.refreshVideosList()
      this.refreshTimeline()

      if (this.currentClipIndex < 0 && this.state.videos.length > 0) this.loadClip(0)

      this.statusText.textContent = ""
      this.showToast(`${videoFiles.length} video(s) uploaded successfully`, "success")
    } catch (error) {
      console.error("Upload error:", error)
      this.showToast("Failed to upload videos", "error")
      this.statusText.textContent = ""
    } finally {
      this.mergeBtn.disabled = false
    }
  }

  refreshVideosList() {
    this.videosList.innerHTML = ""

    this.state.videos.forEach((path, index) => {
      const item = document.createElement("div")
      item.className = "video-item"
      item.dataset.index = String(index)
      item.dataset.path = path

      const thumb = document.createElement("img")
      thumb.className = "video-thumb"
      thumb.src = this.state.thumbnails[index]
      thumb.alt = "Video thumbnail"

      const info = document.createElement("div")
      info.className = "video-info"

      const name = document.createElement("p")
      name.className = "video-name"
      const duration = this.state.durations[index] ? ` (${this.formatDuration(this.state.durations[index])})` : ""
      name.textContent = path.split("/").pop() + duration
      info.appendChild(name)

      const removeBtn = document.createElement("button")
      removeBtn.className = "video-remove"
      removeBtn.textContent = "✕"
      removeBtn.onclick = (e) => {
        e.stopPropagation()
        this.removeVideo(index)
      }

      item.addEventListener("click", () => this.loadClip(index))
      item.appendChild(thumb)
      item.appendChild(info)
      item.appendChild(removeBtn)
      this.videosList.appendChild(item)
    })

    if (this.state.videos.length > 0 && window.Sortable) {
      if (this.sortableInstance) this.sortableInstance.destroy()
      this.sortableInstance = new window.Sortable(this.videosList, {
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: () => {
          const previousVideos = [...this.state.videos]
          const previousThumbs = [...this.state.thumbnails]
          const previousDurations = [...this.state.durations]
          const previousPreviews = [...this.state.previewUrls]
          const activePath = this.currentClipIndex >= 0 ? previousVideos[this.currentClipIndex] : null
          const newOrder = Array.from(this.videosList.children).map((el) => Number.parseInt(el.dataset.index, 10))

          this.state.videos = newOrder.map((idx) => previousVideos[idx])
          this.state.thumbnails = newOrder.map((idx) => previousThumbs[idx])
          this.state.durations = newOrder.map((idx) => previousDurations[idx])
          this.state.previewUrls = newOrder.map((idx) => previousPreviews[idx])

          this.refreshVideosList()
          this.refreshTimeline()

          if (activePath) {
            const newIndex = this.state.videos.indexOf(activePath)
            if (newIndex >= 0) this.loadClip(newIndex)
          }
        },
      })
    }
  }

  removeVideo(index) {
    const previewUrl = this.state.previewUrls[index]
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    this.state.videos.splice(index, 1)
    this.state.thumbnails.splice(index, 1)
    this.state.durations.splice(index, 1)
    this.state.previewUrls.splice(index, 1)

    if (this.state.videos.length === 0) {
      this.currentClipIndex = -1
      this.updatePreviewEmptyState()
    } else if (index <= this.currentClipIndex) {
      const nextIndex = Math.max(0, this.currentClipIndex - 1)
      this.loadClip(nextIndex)
    }

    this.refreshVideosList()
    this.refreshTimeline()
  }

  refreshTimeline() {
    this.timeline.innerHTML = ""

    if (this.state.videos.length === 0) {
      this.timeline.innerHTML = '<p class="timeline-empty">Videos will appear here</p>'
      this.timelineTotal.textContent = "Total 00:00"
      this.timelinePlayhead = null
      return
    }

    this.timelineOffsets = []
    let cumulative = 0
    this.state.durations.forEach((duration) => {
      this.timelineOffsets.push(cumulative)
      cumulative += Number.isFinite(duration) ? duration : 0
    })
    this.totalTimelineDuration = cumulative
    this.timelineTotal.textContent = `Total ${this.formatDuration(this.totalTimelineDuration)}`

    const minWidth = Math.max(this.totalTimelineDuration * this.timelineScale + 110, this.timeline.clientWidth || 620)

    const canvas = document.createElement("div")
    canvas.className = "timeline-canvas"
    canvas.style.width = `${minWidth}px`

    const ruler = document.createElement("div")
    ruler.className = "timeline-ruler"
    ruler.textContent = this.buildRulerText(this.totalTimelineDuration)

    const videoTrack = document.createElement("div")
    videoTrack.className = "track"
    const videoLabel = document.createElement("span")
    videoLabel.className = "track-label"
    videoLabel.textContent = "Video"
    videoTrack.appendChild(videoLabel)

    const audioTrack = document.createElement("div")
    audioTrack.className = "track"
    const audioLabel = document.createElement("span")
    audioLabel.className = "track-label"
    audioLabel.textContent = "Audio"
    audioTrack.appendChild(audioLabel)

    this.state.videos.forEach((_, index) => {
      const duration = Number.isFinite(this.state.durations[index]) ? this.state.durations[index] : 0
      const left = this.timelineOffsets[index] * this.timelineScale + 70
      const width = Math.max(duration * this.timelineScale, 72)

      const videoClip = document.createElement("div")
      videoClip.className = "timeline-item"
      videoClip.style.left = `${left}px`
      videoClip.style.width = `${width}px`
      videoClip.dataset.index = String(index)

      const thumb = document.createElement("img")
      thumb.className = "timeline-thumb"
      thumb.src = this.state.thumbnails[index]
      thumb.alt = "Clip"

      const name = document.createElement("p")
      name.className = "timeline-name"
      name.textContent = `${(index + 1).toString().padStart(2, "0")} • ${this.formatDuration(duration)}`
      videoClip.appendChild(thumb)
      videoClip.appendChild(name)
      videoClip.addEventListener("click", () => this.loadClip(index))
      videoTrack.appendChild(videoClip)

      const audioClip = document.createElement("div")
      audioClip.className = "timeline-item audio"
      audioClip.style.left = `${left}px`
      audioClip.style.width = `${width}px`
      audioClip.dataset.index = String(index)

      const audioName = document.createElement("p")
      audioName.className = "timeline-name"
      audioName.textContent = `A${(index + 1).toString().padStart(2, "0")} • ${this.formatDuration(duration)}`
      audioClip.appendChild(audioName)
      audioClip.addEventListener("click", () => this.loadClip(index))
      audioTrack.appendChild(audioClip)
    })

    this.timelinePlayhead = document.createElement("div")
    this.timelinePlayhead.className = "timeline-playhead"
    this.timelinePlayhead.style.left = "70px"

    canvas.appendChild(ruler)
    canvas.appendChild(videoTrack)
    canvas.appendChild(audioTrack)
    canvas.appendChild(this.timelinePlayhead)
    this.timeline.appendChild(canvas)

    this.timeline.onclick = (e) => this.seekByTimelineClick(e)
    this.updateTimelinePlayhead()
  }

  buildRulerText(totalDuration) {
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) return "00:00"
    const marks = []
    const step = totalDuration > 60 ? 10 : 5
    for (let t = 0; t <= Math.ceil(totalDuration); t += step) {
      marks.push(this.formatDuration(t))
    }
    return marks.join("   ")
  }

  seekByTimelineClick(event) {
    if (event.target.closest(".timeline-item")) return
    if (!this.totalTimelineDuration || !this.timelineOffsets.length) return

    const canvas = this.timeline.querySelector(".timeline-canvas")
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const offsetX = event.clientX - rect.left - 70
    if (offsetX < 0) return

    const targetTime = offsetX / this.timelineScale
    let clipIndex = this.state.videos.length - 1

    for (let i = 0; i < this.timelineOffsets.length; i += 1) {
      const start = this.timelineOffsets[i]
      const end = start + (this.state.durations[i] || 0)
      if (targetTime >= start && targetTime <= end) {
        clipIndex = i
        break
      }
    }

    const clipStart = this.timelineOffsets[clipIndex] || 0
    const localTime = Math.max(targetTime - clipStart, 0)
    this.loadClip(clipIndex, false, localTime)
  }

  loadClip(index, autoplay = false, seekTime = 0) {
    if (index < 0 || index >= this.state.videos.length) return
    this.currentClipIndex = index

    const source = this.state.previewUrls[index]
    this.previewPlayer.src = source
    this.previewTag.textContent = this.state.videos[index].split("/").pop()
    this.previewPlayer.load()
    this.previewPlayer.onloadedmetadata = () => {
      this.previewPlayer.currentTime = Math.min(seekTime, this.previewPlayer.duration || 0)
      this.updatePreviewTimeUI()
      this.updateTimelinePlayhead()
      if (autoplay) this.previewPlayer.play().catch(() => {})
    }
  }

  togglePreviewPlayback() {
    if (this.state.videos.length === 0) return
    if (this.currentClipIndex < 0) {
      this.loadClip(0, true)
      return
    }
    if (this.previewPlayer.paused) {
      this.previewPlayer.play().catch(() => {})
    } else {
      this.previewPlayer.pause()
    }
  }

  playPreviousClip() {
    if (this.state.videos.length === 0) return
    const nextIndex = Math.max(0, this.currentClipIndex - 1)
    this.loadClip(nextIndex, true)
  }

  playNextClip(autoplay = false) {
    if (this.state.videos.length === 0) return
    const nextIndex = this.currentClipIndex + 1
    if (nextIndex < this.state.videos.length) {
      this.loadClip(nextIndex, autoplay)
    } else {
      this.previewPlayer.pause()
      this.previewPlayer.currentTime = 0
      this.updatePreviewTimeUI()
      this.updateTimelinePlayhead()
    }
  }

  updatePreviewTimeUI() {
    const current = this.previewPlayer.currentTime || 0
    const duration = this.previewPlayer.duration || 0
    const percent = duration > 0 ? (current / duration) * 100 : 0
    this.previewScrubber.value = String(Math.max(0, Math.min(100, percent)))
    this.previewTime.textContent = `${this.formatDuration(current)} / ${this.formatDuration(duration)}`
  }

  updateTimelinePlayhead() {
    if (!this.timelinePlayhead || this.currentClipIndex < 0) return
    const clipStart = this.timelineOffsets[this.currentClipIndex] || 0
    const currentTime = this.previewPlayer.currentTime || 0
    const projectTime = clipStart + currentTime
    this.timelinePlayhead.style.left = `${projectTime * this.timelineScale + 70}px`
  }

  updatePreviewEmptyState() {
    this.previewPlayer.removeAttribute("src")
    this.previewPlayer.load()
    this.previewTag.textContent = "No clip loaded"
    this.previewTime.textContent = "00:00 / 00:00"
    this.previewPlayBtn.textContent = "Play"
    this.previewScrubber.value = "0"
  }

  cleanupPreviewUrls() {
    this.state.previewUrls.forEach((url) => {
      if (url) URL.revokeObjectURL(url)
    })
    this.state.previewUrls = []
  }

  formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00"
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  loadPresetsFromStorage() {
    const presets = JSON.parse(localStorage.getItem("videoPresets") || "{}")
    if (Object.keys(presets).length > 0) {
      this.showToast(`Loaded ${Object.keys(presets).length} saved preset(s)`, "success")
    }
  }

  savePreset() {
    const presetName = prompt("Enter preset name:")
    if (!presetName) return

    const presets = JSON.parse(localStorage.getItem("videoPresets") || "{}")
    presets[presetName] = this.state.settings
    localStorage.setItem("videoPresets", JSON.stringify(presets))
    this.showToast(`Preset "${presetName}" saved`, "success")
  }

  loadPreset() {
    const presets = JSON.parse(localStorage.getItem("videoPresets") || "{}")
    if (Object.keys(presets).length === 0) {
      this.showToast("No saved presets", "error")
      return
    }

    const presetName = prompt(`Available presets:\n${Object.keys(presets).join(", ")}\n\nEnter preset name:`)
    if (!presetName || !presets[presetName]) return

    this.state.settings = { ...this.state.settings, ...presets[presetName] }
    if (this.presetSelect.querySelector(`option[value="${this.state.settings.preset}"]`)) {
      this.presetSelect.value = this.state.settings.preset
    } else {
      this.state.settings.preset = "original"
      this.presetSelect.value = "original"
    }
    this.filterSelect.value = this.state.settings.filters[0] || ""
    this.transitionSelect.value = this.state.settings.transition || "none"
    this.transitionDurationInput.value = this.state.settings.transitionDuration ?? 0.6
    this.audioModeSelect.value = this.state.settings.audioMode || "original"
    this.originalVolumeInput.value = this.state.settings.originalVolume ?? 1.0
    this.musicVolumeInput.value = this.state.settings.musicVolume ?? 0.35
    this.duckingInput.checked = !!this.state.settings.ducking
    this.outputNameInput.value = this.state.settings.outputName
    this.showToast(`Preset "${presetName}" loaded`, "success")
  }

  async handleMerge() {
    if (this.state.videos.length === 0) {
      this.showToast("Please upload at least one video", "error")
      return
    }

    if (this.isProcessing) {
      this.showToast("Already processing", "error")
      return
    }

    const formData = new FormData()
    formData.append("videos", JSON.stringify(this.state.videos))
    formData.append("preset", this.state.settings.preset)
    formData.append("filters", JSON.stringify(this.state.settings.filters))
    formData.append("transition", this.state.settings.transition)
    formData.append("transitionDuration", String(this.state.settings.transitionDuration))
    formData.append("audioMode", this.state.settings.audioMode)
    formData.append("originalVolume", String(this.state.settings.originalVolume))
    formData.append("musicVolume", String(this.state.settings.musicVolume))
    formData.append("ducking", this.state.settings.ducking ? "true" : "false")
    formData.append("outputName", this.state.settings.outputName)

    if (this.state.settings.intro) formData.append("intro", this.state.settings.intro)
    if (this.state.settings.outro) formData.append("outro", this.state.settings.outro)
    if (this.state.settings.backgroundMusic) formData.append("backgroundMusic", this.state.settings.backgroundMusic)
    if (this.state.settings.subtitles) formData.append("subtitles", this.state.settings.subtitles)
    if (this.state.settings.watermark) {
      if (typeof this.state.settings.watermark === "string") {
        formData.append("watermark_text", this.state.settings.watermark)
      } else {
        formData.append("watermark_image", this.state.settings.watermark)
      }
    }

    try {
      this.isProcessing = true
      this.mergeBtn.disabled = true
      this.statusText.textContent = "Starting merge process..."
      this.progressBar.style.width = "0%"

      const res = await fetch("/merge", { method: "POST", body: formData })
      if (!res.ok) throw new Error("Merge failed")

      const blob = await res.blob()
      this.downloadFile(blob, this.state.settings.outputName)

      this.progressBar.style.width = "100%"
      this.statusText.textContent = "Merge completed!"
      this.showToast("Video merged successfully", "success")

      setTimeout(() => {
        this.progressBar.style.width = "0%"
        this.statusText.textContent = ""
      }, 2000)
    } catch (error) {
      console.error("Merge error:", error)
      this.showToast("Failed to merge videos", "error")
      this.progressBar.style.width = "0%"
      this.statusText.textContent = ""
    } finally {
      this.isProcessing = false
      this.mergeBtn.disabled = false
    }
  }

  downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  showToast(message, type = "success") {
    this.toast.textContent = message
    this.toast.className = `toast show ${type}`
    setTimeout(() => this.toast.classList.remove("show"), 3000)
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new VideoMergerApp()
})
