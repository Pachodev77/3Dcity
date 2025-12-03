import { RemoteAvatar } from '../entities/RemoteAvatar.js';
// socket.io is loaded globally via script tag in index.html

export class NetworkManager {
    constructor(scene) {
        this.scene = scene;
        // Connect to dedicated Render server
        this.socket = io('https://threedcity-multiplayer.onrender.com', {
            transports: ['websocket', 'polling']
        });
        this.remotePlayers = {}; // Map of id -> RemoteAvatar
        this.lastUpdate = 0;
        this.updateRate = 50; // Send updates every 50ms (20 times/sec)

        // Performance: Track last sent state to avoid spam
        this.lastSentPosition = new THREE.Vector3();
        this.lastSentRotation = 0;
        this.lastSentAnimation = '';
        this.lastSentAvatarType = '';

        this.setupSocketEvents();
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
        });

        this.socket.on('currentPlayers', (players) => {
            Object.keys(players).forEach((id) => {
                if (id === this.socket.id) return; // Ignore self
                this.addRemotePlayer(id, players[id]);
            });
        });

        this.socket.on('newPlayer', (playerInfo) => {
            this.addRemotePlayer(playerInfo.id, playerInfo);
        });

        this.socket.on('playerMoved', (playerInfo) => {
            if (this.remotePlayers[playerInfo.id]) {
                this.remotePlayers[playerInfo.id].updateState(playerInfo);
            }
        });

        this.socket.on('playerDisconnected', (id) => {
            this.removeRemotePlayer(id);
        });
    }

    addRemotePlayer(id, data) {
        if (this.remotePlayers[id]) return;
        console.log('Adding remote player:', id);
        const remoteAvatar = new RemoteAvatar(this.scene, id, data);
        this.remotePlayers[id] = remoteAvatar;
    }

    removeRemotePlayer(id) {
        if (this.remotePlayers[id]) {
            console.log('Removing remote player:', id);
            this.remotePlayers[id].dispose();
            delete this.remotePlayers[id];
        }
    }

    sendUpdate(position, rotation, animation, avatarType) {
        const now = Date.now();
        if (now - this.lastUpdate > this.updateRate) {
            // Check if anything actually changed
            const positionChanged = position.distanceTo(this.lastSentPosition) > CONFIG.PERFORMANCE.NETWORK_POSITION_THRESHOLD;
            const rotationChanged = Math.abs(rotation.y - this.lastSentRotation) > CONFIG.PERFORMANCE.NETWORK_ROTATION_THRESHOLD;
            const animationChanged = animation !== this.lastSentAnimation;
            const avatarChanged = avatarType !== this.lastSentAvatarType;

            if (positionChanged || rotationChanged || animationChanged || avatarChanged) {
                this.socket.emit('playerMovement', {
                    x: position.x,
                    y: position.y,
                    z: position.z,
                    rotation: rotation.y,
                    animation: animation,
                    avatarType: avatarType
                });

                // Update last sent state
                this.lastSentPosition.copy(position);
                this.lastSentRotation = rotation.y;
                this.lastSentAnimation = animation;
                this.lastSentAvatarType = avatarType;
                this.lastUpdate = now;
            }
        }
    }

    update(delta) {
        // Update animations of all remote players
        Object.values(this.remotePlayers).forEach(player => {
            player.update(delta);
        });
    }
}
