import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;

        // Avatar camera state
        this.angleH = 0;
        this.angleVOffset = 0;
        this.distance = CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        this.lastManualRotationTime = 0;

        // Vehicle camera state (completely independent)
        this.vehicleCameraOffset = new THREE.Vector3(0, 2, -5); // Behind and above the vehicle
        this.vehicleCameraPosition = new THREE.Vector3();
        this.vehicleLookAtPosition = new THREE.Vector3();
        this.vehicleCameraDistance = CONFIG.VEHICLE.MIN_CAMERA_DISTANCE;

        // Reusable vectors
        this.followPosition = new THREE.Vector3();
        this.desiredCameraPosition = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.tempVector = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();

        this.raycaster = new THREE.Raycaster();
    }

    updateVehicleCamera(delta, vehicle, input, collidableObjects, groundCollidableObjects) {
        if (!vehicle || !vehicle.mesh) return;

        const vehicleMesh = vehicle.mesh;

        // Allow manual camera rotation with joystick
        const cameraRotationSpeed = CONFIG.CAMERA.ROTATION_SPEED * 0.5; // Slower for vehicle

        if (Math.abs(input.x) > 0.1) {
            this.vehicleCameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -input.x * cameraRotationSpeed * delta);
        }

        // Vertical angle adjustment
        if (Math.abs(input.y) > 0.1) {
            const verticalChange = -input.y * cameraRotationSpeed * delta;
            this.vehicleCameraOffset.y = Math.max(1, Math.min(4, this.vehicleCameraOffset.y + verticalChange));
        }

        // Calculate desired camera position relative to vehicle
        this.tempVector.copy(this.vehicleCameraOffset);
        this.tempVector.applyQuaternion(vehicleMesh.quaternion);
        this.desiredCameraPosition.copy(vehicleMesh.position).add(this.tempVector);

        // Ground collision check for camera
        const groundRayOrigin = this.desiredCameraPosition.clone().setY(vehicleMesh.position.y + 20);
        this.raycaster.set(groundRayOrigin, new THREE.Vector3(0, -1, 0));
        const groundIntersects = this.raycaster.intersectObjects(groundCollidableObjects, true);

        let minGroundY = vehicleMesh.position.y + 0.5;
        if (groundIntersects.length > 0) {
            minGroundY = Math.max(minGroundY, groundIntersects[0].point.y + 0.5);
        }

        if (this.desiredCameraPosition.y < minGroundY) {
            this.desiredCameraPosition.y = minGroundY;
        }

        // Wall collision check
        this.direction.copy(this.desiredCameraPosition).sub(vehicleMesh.position).normalize();
        const lineOfSightDistance = vehicleMesh.position.distanceTo(this.desiredCameraPosition);
        this.raycaster.set(vehicleMesh.position, this.direction);
        const wallIntersections = this.raycaster.intersectObjects(collidableObjects, true);

        let finalCameraPosition = this.desiredCameraPosition.clone();

        for (const intersection of wallIntersections) {
            let isSelf = false;
            intersection.object.traverseAncestors((ancestor) => {
                if (ancestor === vehicleMesh) isSelf = true;
            });

            if (!isSelf && intersection.distance < lineOfSightDistance) {
                finalCameraPosition.copy(vehicleMesh.position).add(
                    this.direction.multiplyScalar(Math.max(0.5, intersection.distance - 0.3))
                );
                break;
            }
        }

        // Smooth camera movement with higher lerp for responsiveness
        const lerpFactor = 0.15; // Increased from 0.1 for smoother, more responsive following
        this.camera.position.lerp(finalCameraPosition, lerpFactor);

        // Look at point slightly ahead of the vehicle for better view
        this.vehicleLookAtPosition.copy(vehicleMesh.position);
        this.vehicleLookAtPosition.y += 0.5; // Look at center of vehicle

        // Add forward offset to look ahead
        this.tempVector.set(0, 0, 2);
        this.tempVector.applyQuaternion(vehicleMesh.quaternion);
        this.vehicleLookAtPosition.add(this.tempVector);

        // Smooth camera rotation
        const targetQuaternion = new THREE.Quaternion();
        const lookAtMatrix = new THREE.Matrix4();
        lookAtMatrix.lookAt(this.camera.position, this.vehicleLookAtPosition, new THREE.Vector3(0, 1, 0));
        targetQuaternion.setFromRotationMatrix(lookAtMatrix);

        this.camera.quaternion.slerp(targetQuaternion, 0.1);
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
            this.angleVOffset -= input.y * cameraRotationSpeed * delta;
            this.angleVOffset = Math.max(-0.8, Math.min(0.2, this.angleVOffset));
            this.lastManualRotationTime = Date.now();
        }

        const timeSinceLastRotation = Date.now() - (this.lastManualRotationTime || 0);
        const shouldAutoFollow = timeSinceLastRotation > 1000 && target.userData?.isMoving;

        // --- 2. Determine Target Follow Position ---
        const targetPosition = target.position.clone();
        const groundRayOrigin = new THREE.Vector3(targetPosition.x, targetPosition.y + 10, targetPosition.z);
        this.raycaster.set(groundRayOrigin, new THREE.Vector3(0, -1, 0));
        const groundIntersects = this.raycaster.intersectObjects(groundCollidableObjects, true);

        let targetGroundY = targetPosition.y;
        if (groundIntersects.length > 0) {
            targetGroundY = groundIntersects[0].point.y;
        }
        this.followPosition.set(targetPosition.x, targetGroundY + 0.5, targetPosition.z);

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
        const wallRayOrigin = this.followPosition.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.direction.copy(this.desiredCameraPosition).sub(wallRayOrigin).normalize();
        const lineOfSightDistance = wallRayOrigin.distanceTo(this.desiredCameraPosition);
        this.raycaster.set(wallRayOrigin, this.direction);
        const wallIntersections = this.raycaster.intersectObjects(collidableObjects, true);

        let finalCameraPosition = this.desiredCameraPosition.clone();
        if (wallIntersections.length > 0 && wallIntersections[0].distance < lineOfSightDistance) {
            finalCameraPosition.copy(wallRayOrigin).add(this.direction.multiplyScalar(wallIntersections[0].distance - 0.2));
        }

        // --- 5. Handle Ground Collision ---
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
        const lerpFactor = CONFIG.AVATAR.CAMERA_LERP;
        this.camera.position.lerp(finalCameraPosition, lerpFactor);
        this.camera.lookAt(this.followPosition);
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
        this.vehicleCameraDistance = distance;

        // Update vehicle camera offset based on distance (negative to stay behind)
        const baseOffset = 5;
        const offsetMultiplier = distance / CONFIG.VEHICLE.MIN_CAMERA_DISTANCE;
        this.vehicleCameraOffset.z = -baseOffset * offsetMultiplier;
    }
}
