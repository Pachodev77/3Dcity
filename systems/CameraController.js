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
        this.cameraOffset = new THREE.Vector3();
        this.desiredCameraPosition = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.axisX = new THREE.Vector3(1, 0, 0);
        this.axisY = new THREE.Vector3(0, 1, 0);

        this.raycaster = new THREE.Raycaster();
    }

    update(delta, target, input, isInVehicle, collidableObjects, frameCount) {
        if (!target) return;

        const cameraRotationSpeed = CONFIG.CAMERA.ROTATION_SPEED;

        // Update angles based on input
        this.angleH -= input.x * cameraRotationSpeed * delta;
        this.angleVOffset -= input.y * cameraRotationSpeed * delta;
        this.angleVOffset = Math.max(-0.4, Math.min(0.4, this.angleVOffset));

        // Auto-follow for vehicle if no input
        if (isInVehicle && Math.abs(input.x) < 0.1) {
            const targetCameraAngleH = target.rotation.y + Math.PI;
            let diff = targetCameraAngleH - this.angleH;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;
            this.angleH += diff * 0.5;
        }

        // Calculate vertical angle
        const minAngleV = CONFIG.CAMERA.MIN_ANGLE_V;
        const maxAngleV = CONFIG.CAMERA.MAX_ANGLE_V;

        const currentMinCameraDistance = isInVehicle ? CONFIG.VEHICLE.MIN_CAMERA_DISTANCE : CONFIG.AVATAR.MIN_CAMERA_DISTANCE;
        const maxCameraDistance = CONFIG.CAMERA.MAX_DISTANCE;

        // Ensure distance is within bounds
        this.distance = Math.max(currentMinCameraDistance, Math.min(this.distance, maxCameraDistance));

        const t = (this.distance - currentMinCameraDistance) / (maxCameraDistance - currentMinCameraDistance);
        const baseAngleV = maxAngleV - t * (maxAngleV - minAngleV);
        const cameraAngleV = baseAngleV + this.angleVOffset;

        // Calculate position
        this.followPosition.copy(target.position).add({ x: 0, y: 0.5, z: 0 });
        this.cameraOffset.set(0, 0, this.distance);
        this.cameraOffset.applyAxisAngle(this.axisX, cameraAngleV);
        this.cameraOffset.applyAxisAngle(this.axisY, this.angleH);
        this.desiredCameraPosition.copy(this.followPosition).add(this.cameraOffset);

        let finalCameraPosition = this.desiredCameraPosition;

        // Collision detection (throttled)
        if (frameCount % CONFIG.PERFORMANCE.CHECK_INTERVAL === 0) {
            this.direction.copy(this.desiredCameraPosition).sub(this.followPosition).normalize();
            this.raycaster.set(this.followPosition, this.direction);
            const intersections = this.raycaster.intersectObjects(collidableObjects, true);

            // if (intersections.length > 0 && intersections[0].distance < this.distance) {
            //     finalCameraPosition.copy(this.followPosition).add(this.direction.multiplyScalar(intersections[0].distance - 0.5));
            // }

            this.camera.userData.finalCameraPosition = finalCameraPosition;
        }

        if (this.camera.userData.finalCameraPosition) {
            finalCameraPosition = this.camera.userData.finalCameraPosition;
        }

        if (finalCameraPosition.y < CONFIG.CAMERA.MIN_HEIGHT) {
            finalCameraPosition.y = CONFIG.CAMERA.MIN_HEIGHT;
        }

        // Apply position
        if (isInVehicle) {
            this.camera.position.copy(finalCameraPosition);
        } else {
            const lerpFactor = isInVehicle ? 0.1 : CONFIG.AVATAR.CAMERA_LERP;
            this.camera.position.lerp(finalCameraPosition, lerpFactor);
        }
        this.camera.lookAt(this.followPosition);
    }

    setDistance(distance) {
        this.distance = distance;
    }
}
