import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.angleH = 0;
        this.angleVOffset = 0;
        this.distance = CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        this.lastManualRotationTime = 0; // Track when the camera was last manually rotated

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
        
        // Track when we're actively rotating the camera
        const isRotating = Math.abs(input.x) > 0.1 || Math.abs(input.y) > 0.1;
        
        // Always allow camera rotation with joystick
        if (input.x !== 0) {
            this.angleH -= input.x * cameraRotationSpeed * delta;
            this.lastManualRotationTime = Date.now();
        }
        
        // Vertical angle adjustment with limits
        if (input.y !== 0) {
            this.angleVOffset -= input.y * cameraRotationSpeed * delta;
            this.angleVOffset = Math.max(-0.8, Math.min(0.2, this.angleVOffset));
            this.lastManualRotationTime = Date.now();
        }
        
        // If not manually rotating and the avatar is moving, adjust camera to follow
        const timeSinceLastRotation = Date.now() - (this.lastManualRotationTime || 0);
        const shouldAutoFollow = timeSinceLastRotation > 1000 && target.userData?.isMoving && !isInVehicle;

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

        // If we should auto-follow the avatar
        if (shouldAutoFollow) {
            // Get the target's forward direction
            const targetForward = new THREE.Vector3(0, 0, -1);
            targetForward.applyQuaternion(target.quaternion);
            
            // Calculate desired angle to look at the target from behind
            const targetAngle = Math.atan2(targetForward.x, targetForward.z);
            
            // Smoothly interpolate to the target angle
            const angleDiff = ((targetAngle - this.angleH + Math.PI) % (Math.PI * 2)) - Math.PI;
            this.angleH += angleDiff * 0.1 * delta * 10; // Adjusted for frame rate independence
        }

        // --- 3. Calculate Ideal Camera Position ---
        const currentMinCameraDistance = isInVehicle ? CONFIG.VEHICLE.MIN_CAMERA_DISTANCE : CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        const maxCameraDistance = CONFIG.CAMERA.MAX_DISTANCE;
        this.distance = Math.max(currentMinCameraDistance, Math.min(this.distance, maxCameraDistance));

        let t = (this.distance - currentMinCameraDistance) / (maxCameraDistance - currentMinCameraDistance);
        t = Math.sqrt(t); // Suaviza la transición del ángulo al estar cerca
        
        // Use a lower vertical angle when following the avatar
        const maxAngleV = isInVehicle ? CONFIG.CAMERA.MAX_ANGLE_V : 0.3; // Reduced from default for better third-person view
        const minAngleV = isInVehicle ? CONFIG.CAMERA.MIN_ANGLE_V : 0.1; // Slightly raised minimum angle
        
        const baseAngleV = maxAngleV - t * (maxAngleV - minAngleV);
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
