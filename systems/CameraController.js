import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.mode = 'TPS'; // 'TPS' or 'FPS'

        // Avatar camera state
        this.angleH = 0;
        this.angleVOffset = 0;
        this.distance = CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        this.lastManualRotationTime = 0;

        // Vehicle camera state
        this.vehicleLookAtPosition = new THREE.Vector3();
        this.vehicleCameraDistance = CONFIG.VEHICLE.MIN_CAMERA_DISTANCE;

        // Reusable vectors
        this.followPosition = new THREE.Vector3();
        this.desiredCameraPosition = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.tempVector = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();

        this.raycaster = new THREE.Raycaster();
        this.currentLookAt = null; // For smoothed lookAt
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'FPS') {
            this.angleVOffset = 0; // Reset vertical look
        }
    }

    updateVehicleCamera(delta, vehicle, input, collidableObjects, groundCollidableObjects) {
        if (!vehicle || !vehicle.mesh) return;

        const vehicleMesh = vehicle.mesh;

        // Camera rotation with joystick (orbital around vehicle)
        const cameraRotationSpeed = CONFIG.CAMERA.ROTATION_SPEED * 0.8;

        // Horizontal rotation (orbit around vehicle) - RELATIVE to vehicle
        if (Math.abs(input.x) > 0.1) {
            this.angleH -= input.x * cameraRotationSpeed * delta;
        }

        // Vertical angle adjustment
        if (Math.abs(input.y) > 0.1) {
            this.angleVOffset -= input.y * cameraRotationSpeed * delta;
        }

        // Always enforce vertical angle limits (not just when input is detected)
        this.angleVOffset = Math.max(-1.0, Math.min(-0.3, this.angleVOffset));

        // Auto-center camera behind vehicle when moving
        if (vehicle.speed && Math.abs(vehicle.speed) > 0.5 && Math.abs(input.x) < 0.1) {
            const targetAngle = Math.PI; // Behind the vehicle

            // Calculate shortest rotation to target
            const diff = Math.atan2(Math.sin(targetAngle - this.angleH), Math.cos(targetAngle - this.angleH));

            // Smoothly rotate towards target
            const autoCenterSpeed = 2.0;
            this.angleH += diff * autoCenterSpeed * delta;
        }

        // Calculate camera position using spherical coordinates around vehicle
        // Use stored vehicle distance or default
        const distance = this.vehicleCameraDistance || 6;
        const baseAngleV = 0.5; // Base vertical angle (raised to keep camera higher)
        const cameraAngleV = baseAngleV + this.angleVOffset;

        // Calculate total horizontal angle: Vehicle Rotation + Relative Camera Angle
        const vehicleRotationY = vehicleMesh.rotation.y;
        const totalAngleH = vehicleRotationY + this.angleH;

        // Create offset in local space
        const cameraOffset = new THREE.Vector3(0, 0, distance);
        cameraOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraAngleV); // Vertical rotation
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), totalAngleH); // Horizontal rotation (Vehicle + Relative)

        // Position camera relative to vehicle
        this.desiredCameraPosition.copy(vehicleMesh.position).add(cameraOffset);

        // Ground and Wall collision checks removed to prevent vibration
        let finalCameraPosition = this.desiredCameraPosition.clone();



        // Smooth camera position update
        this.camera.position.copy(finalCameraPosition);

        // Always look at the center of the vehicle
        this.vehicleLookAtPosition.copy(vehicleMesh.position);
        this.vehicleLookAtPosition.y += 1; // Look at center height of vehicle

        // Smooth camera rotation
        this.camera.lookAt(this.vehicleLookAtPosition);
    }

    updateAvatarCamera(delta, target, input, collidableObjects, groundCollidableObjects, frameCount) {
        if (!target) return;

        // --- 1. Update Angles from Input ---
        const cameraRotationSpeed = CONFIG.CAMERA.ROTATION_SPEED;

        const isRotating = Math.abs(input.x) > 0.1 || Math.abs(input.y) > 0.1;

        if (input.x !== 0) {
            this.angleH -= input.x * cameraRotationSpeed * delta;
            this.lastManualRotationTime = Date.now();
        }

        if (input.y !== 0) {
            // Invert pitch for FPS mode
            if (this.mode === 'FPS') {
                this.angleVOffset += input.y * cameraRotationSpeed * delta;
            } else {
                this.angleVOffset -= input.y * cameraRotationSpeed * delta;
            }
            // Different limits for FPS
            if (this.mode === 'FPS') {
                this.angleVOffset = Math.max(-1.0, Math.min(1.0, this.angleVOffset)); // More freedom in FPS
            } else {
                this.angleVOffset = Math.max(-0.8, Math.min(0.2, this.angleVOffset));
            }
            this.lastManualRotationTime = Date.now();
        }

        if (this.mode === 'FPS') {
            // Position: Lock to head (lowered to 0.7)
            // Assuming Avatar origin is at feet
            const headPos = target.position.clone().add(new THREE.Vector3(0, 0.7, 0));
            this.camera.position.copy(headPos);

            // Rotation: Controlled directly by angles. NO looking at target (because we are the target)
            // We need to set rotation from angleH and angleVOffset
            // angleH is Y-axis (Yaw), angleVOffset is X-axis (Pitch)

            // Important: In FPS, camera rotation dictates character rotation usually?
            // Or character rotation dictates camera?
            // Simplification: Camera looks where angleH says. Character mesh should probably update Y rotation to match camera Y.
            // But here we just set camera.

            // Convert angles to Quaternion or Euler
            // Camera starts looking down -Z. 
            // Yaw (H) Rotation around Y.
            // Pitch (V) Rotation around local X.

            const qH = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.angleH);
            const qV = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.angleVOffset);

            this.camera.quaternion.copy(qH).multiply(qV);

            return; // Skip TPS logic
        }


        const timeSinceLastRotation = Date.now() - (this.lastManualRotationTime || 0);
        const shouldAutoFollow = timeSinceLastRotation > 1000 && target.userData?.isMoving;

        // --- 2. Determine Target Follow Position ---
        // Simplified to follow target directly (no ground snapping)
        const targetPosition = target.position.clone();
        this.followPosition.set(targetPosition.x, targetPosition.y + 0.5, targetPosition.z);

        /*
        const groundRayOrigin = new THREE.Vector3(targetPosition.x, targetPosition.y + 10, targetPosition.z);
        this.raycaster.set(groundRayOrigin, new THREE.Vector3(0, -1, 0));
        const groundIntersects = this.raycaster.intersectObjects(groundCollidableObjects, true);

        let targetGroundY = targetPosition.y;
        if (groundIntersects.length > 0) {
            targetGroundY = groundIntersects[0].point.y;
        }
        this.followPosition.set(targetPosition.x, targetGroundY + 0.5, targetPosition.z);
        */

        if (shouldAutoFollow) {
            const targetForward = new THREE.Vector3(0, 0, -1);
            targetForward.applyQuaternion(target.quaternion);

            const targetAngle = Math.atan2(targetForward.x, targetForward.z);
            const angleDiff = ((targetAngle - this.angleH + Math.PI) % (Math.PI * 2)) - Math.PI;
            this.angleH += angleDiff * 0.1 * delta * 10;
        }

        // --- 3. Calculate Ideal Camera Position ---
        const currentMinCameraDistance = CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        const maxCameraDistance = CONFIG.CAMERA.MAX_DISTANCE;
        this.distance = Math.max(currentMinCameraDistance, Math.min(this.distance, maxCameraDistance));

        let t = (this.distance - currentMinCameraDistance) / (maxCameraDistance - currentMinCameraDistance);
        t = Math.sqrt(t);

        const maxAngleV = 0.3;
        const minAngleV = 0.1;

        const baseAngleV = maxAngleV - t * (maxAngleV - minAngleV);
        const cameraAngleV = baseAngleV + this.angleVOffset;

        const cameraOffset = new THREE.Vector3(0, 0, this.distance);
        cameraOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraAngleV);
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.angleH);
        this.desiredCameraPosition.copy(this.followPosition).add(cameraOffset);

        // --- 4. Handle Wall Collisions ---
        // Collision logic removed as per user request
        let finalCameraPosition = this.desiredCameraPosition.clone();
        /*
        const wallRayOrigin = this.followPosition.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.direction.copy(this.desiredCameraPosition).sub(wallRayOrigin).normalize();
        const lineOfSightDistance = wallRayOrigin.distanceTo(this.desiredCameraPosition);
        this.raycaster.set(wallRayOrigin, this.direction);
        const wallIntersections = this.raycaster.intersectObjects(collidableObjects, true);

        if (wallIntersections.length > 0 && wallIntersections[0].distance < lineOfSightDistance) {
            finalCameraPosition.copy(wallRayOrigin).add(this.direction.multiplyScalar(wallIntersections[0].distance - 0.2));
        }
        */

        // --- 5. Handle Ground Collision ---
        // Ground Collision removed as per user request
        /*
        const finalGroundRayOrigin = finalCameraPosition.clone().setY(this.followPosition.y + 20);
        this.raycaster.set(finalGroundRayOrigin, new THREE.Vector3(0, -1, 0));
        const finalGroundIntersects = this.raycaster.intersectObjects(groundCollidableObjects, true);

        let finalGroundY = CONFIG.CAMERA.MIN_HEIGHT;
        if (finalGroundIntersects.length > 0) {
            finalGroundY = finalGroundIntersects[0].point.y + CONFIG.CAMERA.GROUND_OFFSET;
        }

        if (finalCameraPosition.y < finalGroundY) {
            finalCameraPosition.y = finalGroundY;
        }
        */

        // Initialize smoothed lookAt if not exists (checked here or in constructor)
        if (!this.currentLookAt) {
            this.currentLookAt = new THREE.Vector3().copy(this.followPosition);
        }

        // --- 6. Apply Final Position (Time-Based Damping) ---
        // Use exponential decay for smoother, framerate-independent movement
        // dampFactor ~ 4.0 gives a smooth follow. Higher is faster/tighter.
        const dampFactor = 5.0;
        const alpha = 1.0 - Math.exp(-dampFactor * delta);

        this.camera.position.lerp(finalCameraPosition, alpha);

        // --- 7. Smoothed LookAt ---
        // Also damp the lookAt target to prevent jittery rotation
        const lookAtAlpha = 1.0 - Math.exp(-dampFactor * 2.0 * delta); // Rotate faster than move
        this.currentLookAt.lerp(this.followPosition, lookAtAlpha);

        this.camera.lookAt(this.currentLookAt);
    }

    update(delta, target, input, isInVehicle, collidableObjects, groundCollidableObjects, frameCount) {
        if (isInVehicle) {
            this.updateVehicleCamera(delta, target, input, collidableObjects, groundCollidableObjects);
        } else {
            this.updateAvatarCamera(delta, target.model || target, input, collidableObjects, groundCollidableObjects, frameCount);
        }
    }

    setDistance(distance) {
        this.distance = distance;
        this.vehicleCameraDistance = distance; // Update vehicle distance too
    }

    resetVehicleCamera(vehicleMesh) {
        // Set camera to start behind the vehicle
        // We use relative rotation, so PI is behind when using offset (0, 0, distance)
        this.angleH = Math.PI;
        this.angleVOffset = -0.5; // Reset vertical offset to a higher position
    }
}
