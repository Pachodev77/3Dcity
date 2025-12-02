import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class Avatar {
    constructor(scene) {
        this.scene = scene;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = 'idle';
        this.name = null;
        this.visible = true;
    }

    get position() {
        return this.model ? this.model.position : new THREE.Vector3();
    }

    get rotation() {
        return this.model ? this.model.rotation : new THREE.Euler();
    }

    get userData() {
        return this.model ? this.model.userData : {};
    }

    async load(avatarName) {
        if (this.model) {
            this.cleanup();
        }

        const fbxLoader = new FBXLoader();
        try {
            const fbx = await loadWithCache(`/avatars/${avatarName}.fbx`, fbxLoader);
            this.model = fbx;
            this.name = avatarName;
            this.model.userData.avatarName = avatarName;

            if (avatarName === 'Remy@T-Pose') {
                this.model.scale.set(CONFIG.AVATAR.REMY_SCALE, CONFIG.AVATAR.REMY_SCALE, CONFIG.AVATAR.REMY_SCALE);
            } else {
                this.model.scale.set(CONFIG.AVATAR.DEFAULT_SCALE, CONFIG.AVATAR.DEFAULT_SCALE, CONFIG.AVATAR.DEFAULT_SCALE);
            }

            this.model.position.set(0, 0, 5);
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.scene.add(this.model);
            this.model.visible = this.visible;

            // Load Animations
            this.mixer = new THREE.AnimationMixer(this.model);
            await this.loadAnimations();

        } catch (error) {
            console.error(`Error loading avatar ${avatarName}:`, error);
        }
    }

    async loadAnimations() {
        const animLoader = new FBXLoader();
        const animationsToLoad = {
            'idle': '/avatars/animations/Idle.fbx',
            'walking': '/avatars/animations/Walking.fbx',
            'running': '/avatars/animations/Running.fbx'
        };

        const promises = Object.entries(animationsToLoad).map(async ([name, url]) => {
            try {
                const anim = await loadWithCache(url, animLoader);
                if (anim.animations && anim.animations.length > 0) {
                    this.animations[name] = anim.animations[0];
                }
            } catch (error) {
                console.warn(`Could not load animation "${name}":`, error);
            }
        });

        await Promise.all(promises);

        // Start idle animation
        this.playAnimation('idle');
    }

    playAnimation(name) {
        if (this.currentAction === name) return;
        if (this.animations[name] && this.mixer) {
            const action = this.mixer.clipAction(this.animations[name]);
            if (this.animations[this.currentAction]) {
                const previousAction = this.mixer.clipAction(this.animations[this.currentAction]);
                if (previousAction) {
                    previousAction.fadeOut(0.5);
                }
            }
            action.reset().fadeIn(0.5).play();
            this.currentAction = name;
        }
    }

    update(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }

    move(delta, input, camera, collidableObjects) {
        if (!this.model) return;

        const moveSpeed = CONFIG.AVATAR.MOVE_SPEED;
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        viewDirection.y = 0;
        viewDirection.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(camera.up, viewDirection).normalize();

        const moveDirection = new THREE.Vector3();
        moveDirection.copy(right).multiplyScalar(-input.x).add(viewDirection.multiplyScalar(input.y)).normalize();

        const moveThreshold = 0.1;
        const distance = Math.sqrt(input.x * input.x + input.y * input.y); // Approximate distance from input vector

        if (distance > moveThreshold) {
            const speed = distance / 50 * moveSpeed; // Assuming input distance is 0-50 from nipplejs? 
            // Wait, nipplejs usually gives vector and distance. 
            // In main.js: const speed = moveData.distance / 50 * moveSpeed;
            // I'll assume input passed here is normalized or I need distance separately.
            // Let's assume input has { x, y, distance } or I calculate it.
            // The input passed to this method should probably be the moveData object from nipplejs.

            // Let's adjust signature to accept moveData
        }
    }

    // Revised move method
    updateMovement(delta, moveData, camera, collidableObjects) {
        if (!this.model) return;

        const moveSpeed = CONFIG.AVATAR.MOVE_SPEED;
        const viewDirection = new THREE.Vector3();
        camera.getWorldDirection(viewDirection);
        viewDirection.y = 0;
        viewDirection.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(camera.up, viewDirection).normalize();

        const moveDirection = new THREE.Vector3();
        moveDirection.copy(right).multiplyScalar(-moveData.vector.x).add(viewDirection.multiplyScalar(moveData.vector.y)).normalize();

        const moveThreshold = 0.1;
        if (moveData.distance > moveThreshold) {
            const speed = moveData.distance / 50 * moveSpeed;
            const moveVector = moveDirection.clone().multiplyScalar(speed * delta);

            // --- Avatar Collision Detection ---
            const avatarCenter = this.model.position.clone().add({ x: 0, y: 0.5, z: 0 });
            const raycaster = new THREE.Raycaster(avatarCenter, moveDirection);
            const intersections = raycaster.intersectObjects(collidableObjects, true);

            const collisionThreshold = CONFIG.AVATAR.COLLISION_THRESHOLD;
            if (intersections.length > 0 && intersections[0].distance < collisionThreshold) {
                this.playAnimation('idle');
            } else {
                this.model.position.add(moveVector);
                this.model.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
                this.playAnimation('running');
            }
        } else {
            this.playAnimation('idle');
        }
    }

    checkGroundCollision(collidableObjects) {
        if (!this.model) return;

        const rayOrigin = this.model.position.clone();
        rayOrigin.y += 1;
        const down = new THREE.Vector3(0, -1, 0);
        const raycaster = new THREE.Raycaster(rayOrigin, down);
        const intersections = raycaster.intersectObjects(collidableObjects, true);

        if (intersections.length > 0) {
            this.model.position.y = intersections[0].point.y;
            if (this.name === 'Remy@T-Pose') {
                this.model.position.y += CONFIG.AVATAR.REMY_Y_OFFSET;
            }
        }
    }

    setVisible(visible) {
        this.visible = visible;
        if (this.model) {
            this.model.visible = visible;
        }
    }

    cleanup() {
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                }
            });
            this.scene.remove(this.model);
        }
    }
}
