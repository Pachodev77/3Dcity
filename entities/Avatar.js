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

        // Chat bubble
        this.chatBubble = null;

        // Jump mechanics
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gravity = -100; // Gravity acceleration
        this.jumpForce = 10; // Initial jump velocity
        this.isGrounded = true;

        // Attack mechanics
        this.isAttacking = false;
        this.lastAttackTime = 0;
        this.attackCooldown = 500; // 500ms cooldown between attacks

        // Performance: Reusable objects
        this.raycaster = new THREE.Raycaster();
        this.tempVector = new THREE.Vector3();
        this.tempDirection = new THREE.Vector3();
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
            this.model.visible = false; // Hide initially to prevent T-Pose
            this.scene.add(this.model);
            // this.model.visible = this.visible; // Handled after animation load

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
            'running': '/avatars/animations/Running.fbx',
            'punching': '/avatars/animations/Punching.fbx' // Attack animation
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
        if (this.model && this.visible) {
            this.model.visible = true;
        }
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

    update(delta, camera) {
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // Update chat bubble
        if (this.chatBubble) {
            this.chatBubble.update(delta, this.position, camera);
            if (this.chatBubble.isExpired()) {
                this.chatBubble = null;
            }
        }
    }

    showChatBubble(message, ChatBubbleClass, config) {
        // Remove existing bubble
        if (this.chatBubble) {
            this.chatBubble.dispose();
        }

        // Create new bubble
        if (this.model) {
            this.chatBubble = new ChatBubbleClass(this.scene, message, this.position, config);
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
        camera.getWorldDirection(this.tempDirection);
        this.tempDirection.y = 0;
        this.tempDirection.normalize();

        this.tempVector.crossVectors(camera.up, this.tempDirection).normalize();

        const moveDirection = this.tempVector.clone()
            .multiplyScalar(-moveData.vector.x)
            .add(this.tempDirection.multiplyScalar(moveData.vector.y))
            .normalize();

        const moveThreshold = 0.1;
        if (moveData.distance > moveThreshold) {
            const speed = moveData.distance / 50 * moveSpeed;
            const moveVector = moveDirection.clone().multiplyScalar(speed * delta);

            // --- Avatar Collision Detection ---
            this.tempVector.copy(this.model.position).add({ x: 0, y: 0.5, z: 0 });
            this.raycaster.set(this.tempVector, moveDirection);
            const intersections = this.raycaster.intersectObjects(collidableObjects, true);

            const collisionThreshold = CONFIG.AVATAR.COLLISION_THRESHOLD;
            if (intersections.length > 0 && intersections[0].distance < collisionThreshold) {
                this.playAnimation('idle');
                if (this.model.userData) {
                    this.model.userData.isMoving = false;
                }
            } else {
                this.model.position.add(moveVector);
                this.model.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
                this.playAnimation('running');
                if (this.model.userData) {
                    this.model.userData.isMoving = true;
                } else {
                    this.model.userData = { isMoving: true };
                }
            }
        } else {
            this.playAnimation('idle');
        }
    }

    // Jump method
    jump() {
        if (!this.model || !this.isGrounded || this.isJumping) return;

        this.isJumping = true;
        this.isGrounded = false;
        this.jumpVelocity = this.jumpForce;
    }

    // Attack method
    attack() {
        if (!this.model || this.isAttacking) return;

        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return;

        this.isAttacking = true;
        this.lastAttackTime = now;
        this.playAnimation('punching');

        // Reset attack state after animation
        setTimeout(() => {
            this.isAttacking = false;
            if (this.currentAction === 'punching') {
                this.playAnimation('idle');
            }
        }, this.attackCooldown);
    }

    checkGroundCollision(collidableObjects) {
        if (!this.model) return;

        // Apply jump physics
        if (this.isJumping) {
            this.jumpVelocity += this.gravity * 0.016; // Assuming ~60fps (delta ~0.016)
            this.model.position.y += this.jumpVelocity * 0.016;
        }

        this.tempVector.copy(this.model.position);
        this.tempVector.y += 1;
        this.raycaster.set(this.tempVector, new THREE.Vector3(0, -1, 0));
        const intersections = this.raycaster.intersectObjects(collidableObjects, true);

        if (intersections.length > 0) {
            const groundY = intersections[0].point.y;
            const adjustedY = this.name === 'Remy@T-Pose' ? groundY + CONFIG.AVATAR.REMY_Y_OFFSET : groundY;

            // If falling and hit ground
            if (this.model.position.y <= adjustedY && this.jumpVelocity <= 0) {
                this.model.position.y = adjustedY;
                this.isJumping = false;
                this.isGrounded = true;
                this.jumpVelocity = 0;
            }
        } else {
            // Not on ground
            if (!this.isJumping) {
                this.isJumping = true;
                this.isGrounded = false;
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
