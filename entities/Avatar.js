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

        // Health System
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.isDead = false;

        // Combat Combo
        // Combat Combo
        this.comboCounter = 0;
        this.targets = []; // Entities to attack
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
        // Store current position and rotation if model exists
        let currentPosition = null;
        let currentRotation = null;

        if (this.model) {
            currentPosition = this.model.position.clone();
            currentRotation = this.model.rotation.clone();
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

            // Restore previous position and rotation, or use default
            if (currentPosition && currentRotation) {
                this.model.position.copy(currentPosition);
                this.model.rotation.copy(currentRotation);
            } else {
                this.model.position.set(0, 0, 5);
            }

            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });
            this.model.visible = false; // Hide initially to prevent T-Pose
            this.scene.add(this.model);
            // this.model.visible = this.visible; // Handled after animation load

            // Load Animations
            this.mixer = new THREE.AnimationMixer(this.model);
            this.mixer.addEventListener('finished', (e) => this.onAnimationFinished(e));
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

        // Load idle first to prevent T-pose
        try {
            const idleAnim = await loadWithCache('/avatars/animations/Idle.fbx', animLoader);
            if (idleAnim.animations && idleAnim.animations.length > 0) {
                this.animations['idle'] = idleAnim.animations[0];
                // Play idle immediately (no fade)
                const success = this.playAnimation('idle', true);
                // Show model only if idle is successfully playing
                if (success && this.model && this.visible) {
                    this.model.visible = true;
                }
            }
        } catch (error) {
            console.warn('Could not load idle animation:', error);
        }

        // Load remaining animations in background
        const remainingAnims = {
            'walking': '/avatars/animations/Walking.fbx',
            'running': '/avatars/animations/Running.fbx',
            'punching': '/avatars/animations/Punching.fbx',
            'dying': '/avatars/animations/Dying.fbx',
            'jump': '/avatars/animations/Jump.fbx',
            'kick': '/avatars/animations/Kick.fbx'
        };

        const promises = Object.entries(remainingAnims).map(async ([name, url]) => {
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
    }

    playAnimation(name, immediate = false, loop = true) {
        if (!this.animations[name] || !this.mixer) return false;
        if (this.currentAction === name && !immediate) return true;

        const newAction = this.mixer.clipAction(this.animations[name]);
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
        newAction.clampWhenFinished = !loop;

        const prevAction = this.currentAction ? this.mixer.clipAction(this.animations[this.currentAction]) : null;

        if (prevAction && !immediate) {
            newAction.reset();
            newAction.play();
            prevAction.crossFadeTo(newAction, 0.2, true);
        } else {
            newAction.reset().play();
            if (prevAction) prevAction.stop();
        }

        this.currentAction = name;
        return true;
    }

    onAnimationFinished(e) {
        const action = e.action;
        const clip = action.getClip();

        if (clip === this.animations['punching'] || clip === this.animations['kick']) {
            this.isAttacking = false;
            // Flow will be picked up by updateMovement in the next frame
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

        // Prevent movement inputs during attack or death
        if (this.isAttacking || this.isDead) return;

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
                if (!this.isJumping && !this.isAttacking && !this.isDead) this.playAnimation('idle');
                if (this.model.userData) {
                    this.model.userData.isMoving = false;
                }
            } else {
                this.model.position.add(moveVector);
                this.model.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
                if (!this.isJumping && !this.isAttacking && !this.isDead) this.playAnimation('running');
                if (this.model.userData) {
                    this.model.userData.isMoving = true;
                } else {
                    this.model.userData = { isMoving: true };
                }
            }
        } else {
            if (!this.isJumping && !this.isAttacking && !this.isDead) this.playAnimation('idle');
        }
    }

    // Jump method
    jump() {
        if (!this.model || !this.isGrounded || this.isJumping || this.isAttacking || this.isDead) return;

        this.isJumping = true;
        this.isGrounded = false;
        this.jumpVelocity = this.jumpForce;
        this.playAnimation('jump', true, false); // No loop
    }

    // Attack method
    attack() {
        if (!this.model || this.isAttacking || this.isDead) return;

        const now = Date.now();
        if (now - this.lastAttackTime < this.attackCooldown) return;

        this.isAttacking = true;

        this.lastAttackTime = now;

        // Randomize attack
        const attackAnim = Math.random() > 0.5 ? 'punching' : 'kick';
        this.playAnimation(attackAnim, true, false);

        // Hit Detection
        if (this.targets) {
            const attackRange = 2.5; // Meters
            const attackAngle = Math.PI / 3; // 60 degrees cone
            const forward = new THREE.Vector3();
            this.model.getWorldDirection(forward);

            this.targets.forEach(target => {
                if (!target.model || target.isDead) return;

                const dist = this.model.position.distanceTo(target.model.position);
                if (dist < attackRange) {
                    const toTarget = new THREE.Vector3().subVectors(target.model.position, this.model.position).normalize();
                    const angle = forward.angleTo(toTarget);

                    if (angle < attackAngle) {
                        // Hit confirmed
                        const damage = attackAnim === 'kick' ? 25 : 15;
                        if (target.takeDamage) target.takeDamage(damage);
                    }
                }
            });
        }

        // State reset handled by onAnimationFinished listener
    }

    setTargets(targets) {
        this.targets = targets;
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

            // Always keep avatar on ground when not jumping or when landing
            if (!this.isJumping || (this.model.position.y <= adjustedY && this.jumpVelocity <= 0)) {
                this.model.position.y = adjustedY;
                this.isJumping = false;
                this.isGrounded = true;
                this.jumpVelocity = 0;
            }
        } else {
            // Not on ground - start falling
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

    takeDamage(amount) {
        if (this.isDead) return;

        this.health = Math.max(0, this.health - amount);
        this.updateHealthUI();

        // Visual feedback
        const damageOverlay = document.getElementById('damage-overlay');
        if (damageOverlay) {
            damageOverlay.style.opacity = '0.5';
            setTimeout(() => {
                damageOverlay.style.opacity = '0';
            }, 200);
        }

        if (this.health <= 0) {
            this.die();
        }
    }

    updateHealthUI() {
        const fill = document.getElementById('health-bar-fill');
        const text = document.getElementById('health-text');

        if (fill && text) {
            const percentage = (this.health / this.maxHealth) * 100;
            fill.style.width = `${percentage}%`;
            text.textContent = `${Math.ceil(percentage)}%`;

            // Color change based on health
            if (percentage < 30) {
                fill.style.background = 'linear-gradient(90deg, #c0392b, #7f0000)';
            } else {
                fill.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';
            }
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        console.log('Player died');

        // Play Dying Animation
        this.playAnimation('dying', true, false);

        // Show death overlay
        const deathOverlay = document.getElementById('death-overlay');
        if (deathOverlay) {
            deathOverlay.classList.add('active');
        }

        // Disable movement or visibility
        // Keep visible so we see the animation
        // if (this.model) this.model.visible = false; 

        // Respawn after delay
        setTimeout(() => this.respawn(), 5000);
    }

    respawn() {
        this.isDead = false;
        this.isAttacking = false;
        this.comboCounter = 0;
        this.health = this.maxHealth;
        this.updateHealthUI();

        // Hide death overlay
        const deathOverlay = document.getElementById('death-overlay');
        if (deathOverlay) {
            deathOverlay.classList.remove('active');
        }

        if (this.model) {
            this.model.visible = true;
            this.model.position.set(0, 0, 0); // Reset position to spawn

            // Force Idle Animation
            this.playAnimation('idle', true);
        }
    }
}
