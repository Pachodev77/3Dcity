import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.angleH = 0;
        this.angleVOffset = 0;
        this.distance = CONFIG.AVATAR.MIN_CAMERA_DISTANCE;

        // Reusable vectors
        this.followPosition = new THREE.Vector3();
        this.desiredCameraPosition = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        this.raycaster = new THREE.Raycaster();
    }

    update(delta, target, input, isInVehicle, collidableObjects, groundCollidableObjects, frameCount) {
        if (!target) return;

        // --- 1. Update Angles from Input ---
        const cameraRotationSpeed = CONFIG.CAMERA.ROTATION_SPEED;
        this.angleH -= input.x * cameraRotationSpeed * delta;
        this.angleVOffset -= input.y * cameraRotationSpeed * delta;
        this.angleVOffset = Math.max(-0.8, Math.min(0.2, this.angleVOffset)); // Antes era Math.max(-0.4, Math.min(0.4, ...))

        // --- 2. Determine Target Follow Position (Crucial for Terrain Height) ---
        const targetPosition = target.position.clone();
        const groundRayOrigin = new THREE.Vector3(targetPosition.x, targetPosition.y + 10, targetPosition.z);
        this.raycaster.set(groundRayOrigin, new THREE.Vector3(0, -1, 0));
        const groundIntersects = this.raycaster.intersectObjects(groundCollidableObjects, true);

        let targetGroundY = targetPosition.y; // Default to target's Y
        if (groundIntersects.length > 0) {
            targetGroundY = groundIntersects[0].point.y;
        }
        this.followPosition.set(targetPosition.x, targetGroundY + 0.5, targetPosition.z);

        // --- 3. Calculate Ideal Camera Position ---
        const currentMinCameraDistance = isInVehicle ? CONFIG.VEHICLE.MIN_CAMERA_DISTANCE : CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        const maxCameraDistance = CONFIG.CAMERA.MAX_DISTANCE;
        this.distance = Math.max(currentMinCameraDistance, Math.min(this.distance, maxCameraDistance));

        let t = (this.distance - currentMinCameraDistance) / (maxCameraDistance - currentMinCameraDistance);
        t = Math.sqrt(t); // Suaviza la transición del ángulo al estar cerca
        const baseAngleV = CONFIG.CAMERA.MAX_ANGLE_V - t * (CONFIG.CAMERA.MAX_ANGLE_V - CONFIG.CAMERA.MIN_ANGLE_V);
        const cameraAngleV = baseAngleV + this.angleVOffset;

        const cameraOffset = new THREE.Vector3(0, 0, this.distance);
        cameraOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraAngleV);
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.angleH);
        this.desiredCameraPosition.copy(this.followPosition).add(cameraOffset);

        // --- 4. Handle Wall Collisions ---
        // Raise the origin of the raycast to avoid hitting the floor right in front of the player
        const wallRayOrigin = this.followPosition.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.direction.copy(this.desiredCameraPosition).sub(wallRayOrigin).normalize();
        const lineOfSightDistance = wallRayOrigin.distanceTo(this.desiredCameraPosition);
        this.raycaster.set(wallRayOrigin, this.direction);
        const wallIntersections = this.raycaster.intersectObjects(collidableObjects, true);

        let finalCameraPosition = this.desiredCameraPosition.clone();
        if (wallIntersections.length > 0 && wallIntersections[0].distance < lineOfSightDistance) {
            // If we hit a wall, move the camera to the collision point (with a small offset)
            finalCameraPosition.copy(wallRayOrigin).add(this.direction.multiplyScalar(wallIntersections[0].distance - 0.2));
        }

        // --- 5. Handle Ground Collision (Final Check) ---
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

        // --- 6. Apply Final Position ---
        const lerpFactor = isInVehicle ? 0.1 : CONFIG.AVATAR.CAMERA_LERP;
        this.camera.position.lerp(finalCameraPosition, lerpFactor);
        this.camera.lookAt(this.followPosition);
    }

    setDistance(distance) {
        this.distance = distance;
    }
}
