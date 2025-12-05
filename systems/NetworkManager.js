import * as THREE from 'three';
import { RemoteAvatar } from '../entities/RemoteAvatar.js';
import { RemoteZombie } from '../entities/RemoteZombie.js';
import { Vehicle } from '../entities/Vehicle.js'; // Reuse Vehicle for remote vehicles
import { CONFIG } from '../config.js';
// socket.io is loaded globally via script tag in index.html

export class NetworkManager {
    constructor(scene) {
        this.scene = scene;
        // Connect to dedicated Render server
        this.socket = io('https://threedcity-multiplayer.onrender.com', {
            transports: ['websocket', 'polling']
        });
        this.remotePlayers = {}; // Map of id -> RemoteAvatar
        this.remoteZombies = {}; // Map of id -> RemoteZombie (id is player id)
        this.remoteVehicles = {}; // Map of vehicleId -> Vehicle

        this.lastUpdate = 0;
        this.updateRate = 50; // Send updates every 50ms (20 times/sec)

        // Performance: Track last sent state to avoid spam
        this.lastSentPosition = new THREE.Vector3();
        this.lastSentRotation = 0;
        this.lastSentAnimation = '';
        this.lastSentAvatarType = '';

        this.lastSentZombiePosition = new THREE.Vector3();
        this.lastSentZombieRotation = 0;
        this.lastSentZombieState = '';

        // Throttling for vehicles and zombies
        this.lastVehicleUpdate = 0;
        this.lastZombieUpdate = 0;
        this.vehicleUpdateRate = 100; // 10 times per second
        this.zombieUpdateRate = 100; // 10 times per second

        // Map tracking
        this.currentMap = 'burnin_rubber'; // Default map

        this.setupSocketEvents();
    }

    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('%c Connected to Multiplayer Server ', 'background: #222; color: #bada55; font-size: 20px');
            console.log('Server URL:', this.socket.io.uri);
            console.log('Socket ID:', this.socket.id);
        });

        this.socket.on('connect_error', (err) => {
            console.error('%c Connection Error ', 'background: #222; color: #ff0000; font-size: 20px', err);
        });

        this.socket.on('currentWorldState', (worldState) => {
            console.log('Received world state:', worldState);
            // Handle Players & Zombies
            Object.keys(worldState.players).forEach((id) => {
                if (id === this.socket.id) return; // Ignore self
                this.addRemotePlayer(id, worldState.players[id]);
                if (worldState.players[id].zombie) {
                    this.addRemoteZombie(id, worldState.players[id].zombie);
                }
            });

            // Handle Vehicles
            if (worldState.vehicles) {
                Object.values(worldState.vehicles).forEach((vehicleData) => {
                    this.addRemoteVehicle(vehicleData);
                });
            }
        });

        this.socket.on('newPlayer', (playerInfo) => {
            this.addRemotePlayer(playerInfo.id, playerInfo);
            if (playerInfo.zombie) {
                this.addRemoteZombie(playerInfo.id, playerInfo.zombie);
            }
        });

        this.socket.on('playerMoved', (playerInfo) => {
            if (this.remotePlayers[playerInfo.id]) {
                // Update map if it changed
                if (playerInfo.map && this.remotePlayers[playerInfo.id].map !== playerInfo.map) {
                    console.log(`Player ${playerInfo.id} map updated from ${this.remotePlayers[playerInfo.id].map} to ${playerInfo.map}`);
                    this.remotePlayers[playerInfo.id].map = playerInfo.map;
                    this.updateRemotePlayerVisibility();
                }
                this.remotePlayers[playerInfo.id].updateState(playerInfo);
            }
        });

        this.socket.on('zombieMoved', (zombieInfo) => {
            // console.log('Zombie moved:', zombieInfo.id); // Uncomment for spammy debug
            if (this.remoteZombies[zombieInfo.id]) {
                this.remoteZombies[zombieInfo.id].updateState(zombieInfo);
            } else {
                // If zombie doesn't exist yet (maybe joined late), create it
                console.log('Creating missing remote zombie from move event:', zombieInfo.id);
                this.addRemoteZombie(zombieInfo.id, zombieInfo);
            }
        });

        this.socket.on('vehicleSpawned', (vehicleData) => {
            this.addRemoteVehicle(vehicleData);
        });

        this.socket.on('vehicleMoved', (vehicleData) => {
            if (this.remoteVehicles[vehicleData.id]) {
                this.updateRemoteVehicle(vehicleData);
            }
        });

        this.socket.on('playerDisconnected', (id) => {
            console.log('Player disconnected event received:', id);
            this.removeRemotePlayer(id);
            this.removeRemoteZombie(id);
        });

        // Chat events
        this.socket.on('chatMessage', (data) => {
            console.log('Chat message received:', data);
            // Dispatch event for ChatUI to handle
            window.dispatchEvent(new CustomEvent('chat-message-received', { detail: data }));
        });

        // Map change events
        this.socket.on('playerChangedMap', (data) => {
            console.log('Player changed map:', data.id, 'to', data.map);
            if (this.remotePlayers[data.id]) {
                this.remotePlayers[data.id].map = data.map;
                this.updateRemotePlayerVisibility();
            }
        });
    }

    addRemotePlayer(id, data) {
        if (this.remotePlayers[id]) return;
        console.log('Adding remote player:', id, 'on map:', data.map || 'burnin_rubber');
        const remoteAvatar = new RemoteAvatar(this.scene, id, data);
        remoteAvatar.map = data.map || 'burnin_rubber'; // Store map
        this.remotePlayers[id] = remoteAvatar;

        // Set initial visibility based on map
        this.updateRemotePlayerVisibility();
    }

    removeRemotePlayer(id) {
        if (this.remotePlayers[id]) {
            console.log('Removing remote player:', id);
            this.remotePlayers[id].dispose();
            delete this.remotePlayers[id];
        }
    }

    addRemoteZombie(id, data) {
        if (this.remoteZombies[id]) return;
        console.log('Adding remote zombie for player:', id);
        const remoteZombie = new RemoteZombie(this.scene, id, data);
        this.remoteZombies[id] = remoteZombie;
    }

    removeRemoteZombie(id) {
        if (this.remoteZombies[id]) {
            this.remoteZombies[id].dispose();
            delete this.remoteZombies[id];
        }
    }

    addRemoteVehicle(data) {
        if (this.remoteVehicles[data.id]) return;
        console.log('Adding remote vehicle:', data.id);

        // We need to load the vehicle model first
        // Reuse loadVehicleModels logic or similar?
        // For now, let's assume we can clone a template if available or load it.
        // Since we don't have easy access to vehicleTemplates here, we might need to rely on main.js 
        // OR we can just dispatch an event to main.js to spawn it?
        // Better: NetworkManager handles data, main.js handles rendering? 
        // No, NetworkManager handles other entities.
        // Let's try to find the template in the scene or load it.

        // Simplification: Dispatch event to main.js to spawn the vehicle
        window.dispatchEvent(new CustomEvent('spawn-remote-vehicle', { detail: data }));
    }

    registerVehicle(id, vehicleInstance) {
        this.remoteVehicles[id] = vehicleInstance;
    }

    updateRemoteVehicle(data) {
        const vehicle = this.remoteVehicles[data.id];
        if (vehicle && vehicle.mesh) {
            // Interpolate
            vehicle.mesh.position.lerp(new THREE.Vector3(data.x, data.y, data.z), 0.3);
            vehicle.mesh.rotation.y = data.rotation;
            // If we want to show wheels turning etc, we'd need more data
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
                    avatarType: avatarType,
                    map: this.currentMap // Include current map
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

    sendZombieUpdate(position, rotation, state) {
        const now = Date.now();
        if (now - this.lastZombieUpdate < this.zombieUpdateRate) return;

        // Throttle zombie updates too
        const positionChanged = position.distanceTo(this.lastSentZombiePosition) > CONFIG.PERFORMANCE.NETWORK_POSITION_THRESHOLD;
        const rotationChanged = Math.abs(rotation - this.lastSentZombieRotation) > CONFIG.PERFORMANCE.NETWORK_ROTATION_THRESHOLD;
        const stateChanged = state !== this.lastSentZombieState;

        if (positionChanged || rotationChanged || stateChanged) {
            this.socket.emit('zombieUpdate', {
                x: position.x,
                y: position.y,
                z: position.z,
                rotation: rotation,
                state: state
            });

            this.lastSentZombiePosition.copy(position);
            this.lastSentZombieRotation = rotation;
            this.lastSentZombieState = state;
            this.lastZombieUpdate = now;
        }
    }

    spawnVehicle(type, position, rotation) {
        this.socket.emit('spawnVehicle', {
            type: type,
            x: position.x,
            y: position.y,
            z: position.z,
            rotation: rotation
        });
    }

    sendVehicleUpdate(id, position, rotation) {
        const now = Date.now();
        if (now - this.lastVehicleUpdate < this.vehicleUpdateRate) return;

        this.socket.emit('vehicleUpdate', {
            id: id,
            x: position.x,
            y: position.y,
            z: position.z,
            rotation: rotation
        });
        this.lastVehicleUpdate = now;
    }

    sendChatMessage(message) {
        this.socket.emit('chatMessage', {
            message: message
        });
    }

    update(delta, camera) {
        // Update animations of all remote players
        Object.values(this.remotePlayers).forEach(player => {
            player.update(delta, camera);
        });
        // Update zombies
        Object.values(this.remoteZombies).forEach(zombie => {
            zombie.update(delta);
        });
    }

    // Map management methods
    changeMap(mapName) {
        this.currentMap = mapName;
        console.log('Changed to map:', mapName);
        this.socket.emit('mapChange', { map: mapName });

        // Update visibility of all remote players
        this.updateRemotePlayerVisibility();
    }

    updateRemotePlayerVisibility() {
        Object.entries(this.remotePlayers).forEach(([id, player]) => {
            const shouldBeVisible = player.map === this.currentMap;
            if (player.model) {
                player.model.visible = shouldBeVisible;
                console.log(`Player ${id} on map ${player.map}, current map ${this.currentMap}, visible: ${shouldBeVisible}`);
            }
        });

        Object.entries(this.remoteZombies).forEach(([id, zombie]) => {
            const player = this.remotePlayers[id];
            const shouldBeVisible = player && player.map === this.currentMap;
            if (zombie.model) {
                zombie.model.visible = shouldBeVisible;
            }
        });
    }

    getPlayerCountsByMap() {
        const counts = {
            mansion: 0,
            city: 0,
            burnin_rubber: 0
        };
        
        // Count local player
        if (this.currentMap) {
            counts[this.currentMap] = (counts[this.currentMap] || 0) + 1;
        }
        
        // Count remote players
        Object.values(this.remotePlayers).forEach(player => {
            const map = player.map || 'burnin_rubber';
            counts[map] = (counts[map] || 0) + 1;
        });
        
        return counts;
    }}
