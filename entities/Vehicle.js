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
    }

    get position() {
        return this.mesh.position;
    }

    get rotation() {
        return this.mesh.rotation;
    }

    update(delta, input, collidableObjects, groundCollidableObjects) {
        if (!this.isOccupied) return;

        this.frameCounter++;

        const forward = input.y;
        const turn = -input.x;
        const maxReverseSpeed = -this.maxSpeed * CONFIG.VEHICLE.MAX_REVERSE_SPEED_RATIO;

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
