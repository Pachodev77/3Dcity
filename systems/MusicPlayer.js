import { CONFIG } from '../config.js';

export class MusicPlayer {
    constructor() {
        this.playlist = [];
        this.currentTrackIndex = -1;
        this.isPlaying = false;
        this.volume = 0.5;
        this.audio = new Audio();

        // UI Elements
        this.toggleBtn = document.getElementById('music-toggle-btn');
        this.panel = document.getElementById('music-panel');
        this.closeBtn = document.getElementById('close-music-panel');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.volumeSlider = document.getElementById('volume-slider');
        this.trackInfo = document.getElementById('current-track-info');
        this.playlistContainer = document.getElementById('playlist-container');

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.fetchPlaylist();

        // Restore volume from local storage if available
        const savedVolume = localStorage.getItem('musicVolume');
        if (savedVolume !== null) {
            this.volume = parseFloat(savedVolume);
            this.audio.volume = this.volume;
            if (this.volumeSlider) this.volumeSlider.value = this.volume;
        }
    }

    setupEventListeners() {
        // Toggle Panel
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', () => {
                if (this.panel) {
                    const isHidden = this.panel.style.display === 'none' || this.panel.style.display === '';
                    this.panel.style.display = isHidden ? 'flex' : 'none';
                }
            });
        }

        if (this.closeBtn && this.panel) {
            this.closeBtn.addEventListener('click', () => {
                this.panel.style.display = 'none';
            });
        }

        // Controls
        if (this.playPauseBtn) this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.playPrev());
        if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.playNext());

        if (this.volumeSlider) {
            this.volumeSlider.addEventListener('input', (e) => {
                this.volume = parseFloat(e.target.value);
                this.audio.volume = this.volume;
                localStorage.setItem('musicVolume', this.volume);
            });
        }

        // Audio Events
        this.audio.addEventListener('ended', () => this.playNext());
        this.audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            if (this.trackInfo) this.trackInfo.textContent = 'Error playing track';
        });
    }

    async fetchPlaylist() {
        try {
            const response = await fetch('/api/music');
            const files = await response.json();

            this.playlist = files;
            this.renderPlaylist();

            if (this.playlist.length > 0) {
                this.currentTrackIndex = 0;
                this.loadTrack(0, false); // Load first track but don't play
            } else {
                if (this.trackInfo) this.trackInfo.textContent = 'No music found in /music folder';
                if (this.playlistContainer) this.playlistContainer.innerHTML = '<div class="playlist-empty">Add .mp3 files to the "music" folder</div>';
            }
        } catch (error) {
            console.error('Failed to fetch playlist:', error);
            if (this.trackInfo) this.trackInfo.textContent = 'Error loading playlist';
            if (this.playlistContainer) this.playlistContainer.innerHTML = '<div class="playlist-empty">Failed to connect to server</div>';
        }
    }

    renderPlaylist() {
        if (!this.playlistContainer) return;

        this.playlistContainer.innerHTML = '';

        if (this.playlist.length === 0) {
            this.playlistContainer.innerHTML = '<div class="playlist-empty">No music files found</div>';
            return;
        }

        this.playlist.forEach((filename, index) => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            if (index === this.currentTrackIndex) item.classList.add('active');

            // Remove extension for display
            const displayName = filename.replace(/\.[^/.]+$/, "");
            item.textContent = displayName;

            item.addEventListener('click', () => {
                this.currentTrackIndex = index;
                this.loadTrack(index, true);
            });

            this.playlistContainer.appendChild(item);
        });
    }

    loadTrack(index, autoPlay = true) {
        if (index < 0 || index >= this.playlist.length) return;

        const filename = this.playlist[index];
        this.audio.src = `/music/${encodeURIComponent(filename)}`;
        this.audio.load();

        const displayName = filename.replace(/\.[^/.]+$/, "");
        if (this.trackInfo) this.trackInfo.textContent = displayName;

        // Update active item in playlist
        if (this.playlistContainer) {
            const items = this.playlistContainer.querySelectorAll('.playlist-item');
            items.forEach((item, i) => {
                if (i === index) item.classList.add('active');
                else item.classList.remove('active');
            });
        }

        if (autoPlay) {
            this.play();
        }
    }

    play() {
        this.audio.play().then(() => {
            this.isPlaying = true;
            if (this.playPauseBtn) this.playPauseBtn.textContent = '⏸️';
        }).catch(e => {
            console.error('Play failed:', e);
        });
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        if (this.playPauseBtn) this.playPauseBtn.textContent = '▶️';
    }

    togglePlay() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    playNext() {
        if (this.playlist.length === 0) return;
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex, true);
    }

    playPrev() {
        if (this.playlist.length === 0) return;
        this.currentTrackIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex, true);
    }
}
