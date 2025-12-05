import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class Vehicle {
    constructor(mesh) {
        this.mesh = mesh;
        this.mesh.isOccupied = false; // Keep compatibility with existing logic if needed
        this.speed = 0;
        this.isOccupied = false;

        // Configuration
        this.maxSpeed = CONFIG.VEHICLE.MAX_SPEED;
        this.acceleration = CONFIG.VEHICLE.ACCELERATION;
        this.friction = CONFIG.VEHICLE.FRICTION;
        this.steeringSpeed = CONFIG.VEHICLE.STEERING_SPEED;

        // Performance: Reusable objects
        this.raycaster = new THREE.Raycaster();
        this.tempVector = new THREE.Vector3();
        this.forwardDirection = new THREE.Vector3();

        // Set rotation order to YXZ to prevent Gimbal Lock and ensure 
        // Pitch (X) and Roll (Z) are always applied relative to the Yaw (Y) direction.
        this.mesh.rotation.order = 'YXZ';

        // Terrain Tilt System
        this.frontLeft = new THREE.Vector3();
        this.frontRight = new THREE.Vector3();
        this.backLeft = new THREE.Vector3();
        this.backRight = new THREE.Vector3();
        this.targetPitch = 0;
        this.targetRoll = 0;
        this.frameCounter = 0;

        // Audio System
        this.audioListener = null;
        this.ignitionSound = null;
        this.idleSound = null;
        this.accelSound = null;
        this.decelSound = null;
        this.skidSound = null;
        this.audioLoaded = false;

        // Audio State
        this.audioState = 'off'; // off, starting, idle, accelerating, decelerating
    }

    get position() {
        return this.mesh.position;
    }

    get rotation() {
        return this.mesh.rotation;
    }

    setAudioListener(listener) {
        this.audioListener = listener;
        this.loadSounds();
    }

    async loadSounds() {
        if (!this.audioListener) return;

        const audioLoader = new THREE.AudioLoader();
        const loadSound = (path, loop = false, volume = 0.5) => {
            return new Promise((resolve) => {
                audioLoader.load(path, (buffer) => {
                    const sound = new THREE.PositionalAudio(this.audioListener);
                    sound.setBuffer(buffer);
                    sound.setLoop(loop);
                    sound.setRefDistance(5);
                    sound.setRolloffFactor(1);
                    sound.setVolume(volume);
                    this.mesh.add(sound);
                    resolve(sound);
                }, undefined, (err) => {
                    console.warn(`Failed to load sound: ${path}`, err);
                    resolve(null);
                });
            });
        };

        try {
            const [ignition, idle, accel, decel, skid] = await Promise.all([
                loadSound('/sounds/car-ignition.wav', false, 0.8),
                loadSound('/sounds/car-engine-idle.mp3', true, 0.3),
                loadSound('/sounds/car-acelerating.mp3', true, 0.5),
                loadSound('/sounds/car-desacelerating.mp3', true, 0.4),
                loadSound('/sounds/car-skid.mp3', false, 0.6)
            ]);

            this.ignitionSound = ignition;
            this.idleSound = idle;
            this.accelSound = accel;
            this.decelSound = decel;
            this.skidSound = skid;
            this.audioLoaded = true;

        } catch (error) {
            console.error('Error in loadSounds:', error);
        }
    }

    startEngine() {
        if (!this.audioLoaded) return;

        // 1. Play Ignition
        if (this.ignitionSound) {
            if (this.ignitionSound.isPlaying) this.ignitionSound.stop();
            this.ignitionSound.play();
            this.audioState = 'starting';

            // 2. Start Idle loop immediately (or after short delay)
            if (this.idleSound) {
                this.idleSound.play();
                this.idleSound.setVolume(0.3); // Base volume
            }

            // Start other loops muted so we can crossfade
            if (this.accelSound) {
                this.accelSound.play();
                this.accelSound.setVolume(0);
            }
            if (this.decelSound) {
                this.decelSound.play();
                this.decelSound.setVolume(0);
            }
        }
    }

    stopEngine() {
        if (!this.audioLoaded) return;

        [this.ignitionSound, this.idleSound, this.accelSound, this.decelSound, this.skidSound].forEach(s => {
            if (s && s.isPlaying) s.stop();
        });
        this.audioState = 'off';
    }

    updateAudio(delta, input) {
        if (!this.audioLoaded || this.audioState === 'off') return;

        const speed = Math.abs(this.speed);
        const maxSpeed = this.maxSpeed;
        const forwardInput = input.y; // >0 accel, <0 brake/reverse

        // --- State Logic ---
        let targetState = 'idle';

        if (forwardInput > 0.1) {
            targetState = 'accelerating';
        } else if (speed > 2 && forwardInput < 0.1 && forwardInput > -0.1) {
            // Moving but not pressing gas/brake -> Coasting
            targetState = 'decelerating';
        } else {
            targetState = 'idle';
        }

        // --- Volume Crossfading ---
        const fadeSpeed = 3.0 * delta; // Speed of transition

        // Idle Volume
        let targetIdleVol = (targetState === 'idle') ? 0.4 : 0.1;
        if (this.idleSound) {
            const current = this.idleSound.getVolume();
            this.idleSound.setVolume(THREE.MathUtils.lerp(current, targetIdleVol, fadeSpeed));
        }

        // Accel Volume
        let targetAccelVol = (targetState === 'accelerating') ? 0.6 : 0.0;
        if (this.accelSound) {
            const current = this.accelSound.getVolume();
            this.accelSound.setVolume(THREE.MathUtils.lerp(current, targetAccelVol, fadeSpeed));

            // Pitch modulation for accel
            const pitch = 0.8 + (speed / maxSpeed) * 0.8;
            this.accelSound.setPlaybackRate(pitch);
        }

        // Decel Volume
        let targetDecelVol = (targetState === 'decelerating') ? 0.5 : 0.0;
        if (this.decelSound) {
            const current = this.decelSound.getVolume();
            this.decelSound.setVolume(THREE.MathUtils.lerp(current, targetDecelVol, fadeSpeed));
            // Pitch modulation for decel (inverse or lower)
            const pitch = 1.0 - (speed / maxSpeed) * 0.2;
            this.decelSound.setPlaybackRate(pitch);
        }

        // --- Skid Logic ---
        // Play skid if braking hard while moving fast
        const isBrakingHard = (speed > 10 && forwardInput < -0.5);
        const isTurningSharp = (speed > 15 && Math.abs(input.x) > 0.8);

        if ((isBrakingHard || isTurningSharp) && this.skidSound && !this.skidSound.isPlaying) {
            this.skidSound.play();
            this.skidSound.setPlaybackRate(0.8 + Math.random() * 0.4);
        }
    }

    update(delta, input, collidableObjects, groundCollidableObjects) {
        // Update Audio System every frame
        this.updateAudio(delta, input);

        if (!this.isOccupied) return;

        this.frameCounter++;

        const forward = input.y;
        const turn = -input.x;
        const maxReverseSpeed = -this.maxSpeed * CONFIG.VEHICLE.MAX_REVERSE_SPEED_RATIO;
        const wasMovingFast = Math.abs(this.speed) > 5;

        // Acceleration/deceleration
        if (forward > 0) { // Accelerating forward
            this.speed += this.acceleration * delta;
        } else if (forward < 0) { // Accelerating backward (reversing)
            this.speed += this.acceleration * forward * delta; // `forward` is negative
        } else { // No joystick input, apply friction
            if (this.speed > 0) this.speed -= this.friction * delta;
            if (this.speed < 0) this.speed += this.friction * delta;
            if (Math.abs(this.speed) < 0.1) this.speed = 0; // Stop friction from flipping direction
        }
        this.speed = Math.max(maxReverseSpeed, Math.min(this.speed, this.maxSpeed));

        this.speed = Math.max(maxReverseSpeed, Math.min(this.speed, this.maxSpeed));

        // Steering
        if (Math.abs(this.speed) > 0.1) {
            const steeringDirection = this.speed > 0 ? 1 : -1; // Invert steering in reverse
            const steering = turn * this.steeringSpeed * delta * steeringDirection;
            this.mesh.rotation.y += steering;
        }

        // --- Vehicle Ground Collision ---
        this.tempVector.copy(this.mesh.position).add({ x: 0, y: 1, z: 0 });
        this.raycaster.set(this.tempVector, new THREE.Vector3(0, -1, 0));
        const groundIntersections = this.raycaster.intersectObjects(groundCollidableObjects, true);

        let groundY = null;
        for (const intersection of groundIntersections) {
            let isSelf = false;
            intersection.object.traverseAncestors((ancestor) => {
                if (ancestor === this.mesh) {
                    isSelf = true;
                }
            });
            if (!isSelf) {
                groundY = intersection.point.y;
                break; // Found the ground
            }
        }

        if (groundY !== null) {
            this.mesh.position.y = groundY + CONFIG.VEHICLE.GROUND_OFFSET;
        }

        // --- Terrain Tilt Detection (Throttled) ---
        if (CONFIG.VEHICLE.TILT_ENABLED && this.frameCounter % 3 === 0) {
            this.detectTerrainTilt(groundCollidableObjects);
        }

        // Always interpolate rotation (smooths out the throttled updates)
        this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -this.targetPitch, CONFIG.VEHICLE.TILT_LERP_FACTOR);
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, CONFIG.VEHICLE.TILT_LERP_FACTOR);

        // --- Vehicle Wall Collision & Position Update ---
        const moveDistance = this.speed * delta;
        this.forwardDirection.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));

        const collisionPoints = [ // Points on the front of the car to cast rays from
            { x: 0, y: 0.5, z: 0 }, // Lower point (Raised to avoid hitting slopes)
            { x: 0, y: 0.7, z: 0 }  // Upper point
        ];

        let firstValidIntersection = null;

        for (const point of collisionPoints) {
            this.tempVector.copy(this.mesh.position).add(point);
            this.raycaster.set(this.tempVector, this.forwardDirection);
            const wallIntersections = this.raycaster.intersectObjects(collidableObjects, true);

            for (const intersection of wallIntersections) {
                let isSelf = false;
                intersection.object.traverseAncestors((ancestor) => {
                    if (ancestor === this.mesh) { isSelf = true; }
                });

                if (!isSelf) {
                    // Ignore slopes (ground) - if normal points up, it's drivable
                    if (intersection.face && intersection.face.normal.y > 0.5) {
                        continue;
                    }

                    // Found the first valid intersection for this ray
                    if (!firstValidIntersection || intersection.distance < firstValidIntersection.distance) {
                        firstValidIntersection = intersection;
                    }
                    break;
                }
            }
        }

        const collisionDistance = CONFIG.VEHICLE.COLLISION_DISTANCE;
        if (firstValidIntersection && firstValidIntersection.distance < collisionDistance + moveDistance && this.speed > 0) {
            // Imminent collision: Move car exactly to the wall.
            const distanceToWall = firstValidIntersection.distance;
            const allowedMove = Math.max(0, distanceToWall - collisionDistance);

            this.mesh.position.x += allowedMove * Math.sin(this.mesh.rotation.y);
            this.mesh.position.z += allowedMove * Math.cos(this.mesh.rotation.y);

            this.speed = 0; // Stop for the next frame.
        } else {
            // No collision: Move normally.
            this.mesh.position.x += moveDistance * Math.sin(this.mesh.rotation.y);
            this.mesh.position.z += moveDistance * Math.cos(this.mesh.rotation.y);
        }
    }

    detectTerrainTilt(groundCollidableObjects) {
        const halfWheelBase = CONFIG.VEHICLE.WHEEL_BASE / 2;
        const halfTrackWidth = CONFIG.VEHICLE.TRACK_WIDTH / 2;

        // Define local corner positions (relative to vehicle center)
        const corners = [
            { name: 'frontLeft', offset: new THREE.Vector3(-halfTrackWidth, 0, halfWheelBase) },
            { name: 'frontRight', offset: new THREE.Vector3(halfTrackWidth, 0, halfWheelBase) },
            { name: 'backLeft', offset: new THREE.Vector3(-halfTrackWidth, 0, -halfWheelBase) },
            { name: 'backRight', offset: new THREE.Vector3(halfTrackWidth, 0, -halfWheelBase) }
        ];

        const heights = {};

        // Raycast from each corner to find ground height
        for (const corner of corners) {
            // Transform local offset to world position
            const localOffset = corner.offset.clone();
            localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);

            const worldPos = this.mesh.position.clone().add(localOffset);
            worldPos.y += 1; // Start raycast from above

            // Cast ray downward
            this.raycaster.set(worldPos, new THREE.Vector3(0, -1, 0));
            const intersections = this.raycaster.intersectObjects(groundCollidableObjects, true);

            // Find first valid intersection (not self)
            let groundHeight = this.mesh.position.y; // Default to current height
            for (const intersection of intersections) {
                let isSelf = false;
                intersection.object.traverseAncestors((ancestor) => {
                    if (ancestor === this.mesh) isSelf = true;
                });
                if (!isSelf) {
                    groundHeight = intersection.point.y;
                    break;
                }
            }

            heights[corner.name] = groundHeight;
        }

        // Calculate pitch (front-back tilt)
        const frontAvg = (heights.frontLeft + heights.frontRight) / 2;
        const backAvg = (heights.backLeft + heights.backRight) / 2;
        this.targetPitch = Math.atan2(frontAvg - backAvg, CONFIG.VEHICLE.WHEEL_BASE);

        // Calculate roll (left-right tilt)
        const leftAvg = (heights.frontLeft + heights.backLeft) / 2;
        const rightAvg = (heights.frontRight + heights.backRight) / 2;
        this.targetRoll = Math.atan2(rightAvg - leftAvg, CONFIG.VEHICLE.TRACK_WIDTH);

        // Clamp to max angles
        this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -CONFIG.VEHICLE.TILT_MAX_PITCH, CONFIG.VEHICLE.TILT_MAX_PITCH);
        this.targetRoll = THREE.MathUtils.clamp(this.targetRoll, -CONFIG.VEHICLE.TILT_MAX_ROLL, CONFIG.VEHICLE.TILT_MAX_ROLL);
    }
}
