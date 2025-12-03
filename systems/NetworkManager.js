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
                this.remotePlayers[playerInfo.id].updateState(playerInfo);
            }
        });

        this.socket.on('zombieMoved', (zombieInfo) => {
            if (this.remoteZombies[zombieInfo.id]) {
                this.remoteZombies[zombieInfo.id].updateState(zombieInfo);
            } else {
                // If zombie doesn't exist yet (maybe joined late), create it
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
            this.removeRemotePlayer(id);
            this.removeRemoteZombie(id);
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

    sendZombieUpdate(position, rotation, state) {
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
        this.socket.emit('vehicleUpdate', {
            id: id,
            x: position.x,
            y: position.y,
            z: position.z,
            rotation: rotation
        });
    }

    update(delta) {
        // Update animations of all remote players
        Object.values(this.remotePlayers).forEach(player => {
            player.update(delta);
        });
        // Update zombies
        Object.values(this.remoteZombies).forEach(zombie => {
            zombie.update(delta);
        });
    }
}
