import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class Zombie {
    constructor(scene, collidableObjects, groundCollidableObjects, id = 'local') {
        this.scene = scene;
        this.collidableObjects = collidableObjects;
        this.groundCollidableObjects = groundCollidableObjects;
        this.id = id; // Store ID
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentState = 'idle';
        this.speed = CONFIG.ZOMBIE.SPEED;
        this.detectionRadius = CONFIG.ZOMBIE.DETECTION_RADIUS;
        this.attackRadius = CONFIG.ZOMBIE.ATTACK_RADIUS;
        this.patrolPath = [
            new THREE.Vector3(0, 0, 50),
            new THREE.Vector3(50, 0, 0),
            new THREE.Vector3(0, 0, -50),
            new THREE.Vector3(-50, 0, 0),
        ];
        this.currentPatrolIndex = 0;
        this.lastAttackTime = 0;

        // Performance: Reusable objects
        this.raycaster = new THREE.Raycaster();
        this.tempVector = new THREE.Vector3();
        this.tempDirection = new THREE.Vector3();
        this.downVector = new THREE.Vector3(0, -1, 0); // Reused down vector
        this.upVector = new THREE.Vector3(0, 1, 0); // Reused up vector
        this.frameCounter = 0;

        // Health System
        this.maxHealth = 100;
        this.health = 100;
        this.isDead = false;
        this.healthBarGroup = null;

        this.loadModel();
    }

    loadModel() {
        // Reuse a global loader if available, otherwise create one (but ideally we should pass it in)
        // For now, we'll keep creating it here but it's less critical than the update loop
        const fbxLoader = new FBXLoader();

        // Assuming loadWithCache is available globally as in main.js
        loadWithCache('/avatars/zombi/Yaku J Ignite.fbx', fbxLoader).then((zombie) => {
            this.model = zombie;
            this.model.scale.set(CONFIG.ZOMBIE.SCALE, CONFIG.ZOMBIE.SCALE, CONFIG.ZOMBIE.SCALE);
            this.model.position.set(0, 0, 50);
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
                if (child.isBone && (child.name === 'mixamorigHips' || child.name === 'mixamorig:Hips' || child.name === 'Hips')) {
                    this.hips = child;
                }
            });
            // Tag for ShooterSystem
            this.model.userData.isEntityRoot = true;
            this.model.userData.zombieId = this.id;

            this.scene.add(this.model);
            this.collidableObjects.push(this.model);
            this.collidableObjects.push(this.model);
            this.mixer = new THREE.AnimationMixer(this.model);
            this.createHealthBar();
            this.loadAnimations();
        });
    }

    createHealthBar() {
        // Create Health Bar Group
        this.healthBarGroup = new THREE.Group();
        this.healthBarGroup.position.y = 200; // Increased height for visibility

        // Background (Red)
        const bgGeo = new THREE.PlaneGeometry(100, 10);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const bgMesh = new THREE.Mesh(bgGeo, bgMat);

        // Foreground (Green)
        const fgGeo = new THREE.PlaneGeometry(100, 10);
        // Translate geometry so the pivot point is at the left edge (0,0) instead of center
        fgGeo.translate(50, 0, 0);
        const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.healthBarMesh = new THREE.Mesh(fgGeo, fgMat);

        // Position the mesh at the left edge of the background (-50)
        // Since geometry starts at 0 and goes to 100, placing it at -50 makes it cover -50 to 50.
        this.healthBarMesh.position.z = 1; // Slightly in front
        this.healthBarMesh.position.x = -50;

        this.healthBarGroup.add(bgMesh);
        this.healthBarGroup.add(this.healthBarMesh);

        this.healthBarGroup.visible = false; // Hidden initially
        // Billboard logic is in update

        this.model.add(this.healthBarGroup);
    }

    loadAnimations() {
        const animLoader = new FBXLoader();
        const animFiles = [
            'walking', 'zombie attack', 'zombie running', 'zombie agonizing'
        ];
        const animationsToLoad = {};
        animFiles.forEach(name => {
            animationsToLoad[name] = `/avatars/zombi/animations/${name}.fbx`;
        });

        // Mapping 'zombie agonizing' to a simpler key usually helps, but we can stick to the file name or map it.
        // Let's use the file name keys for consistency with current code logic, 
        // but maybe map 'zombie agonizing' to 'death' state for clarity if we want, 
        // strictly speaking the current code uses the key 'zombie agonizing' if we don't alias it.
        // The current loop uses the raw name from the list.

        let loadedCount = 0;
        const totalAnims = Object.keys(animationsToLoad).length;

        for (const animName in animationsToLoad) {
            loadWithCache(animationsToLoad[animName], animLoader)
                .then((anim) => {
                    if (anim.animations && anim.animations.length > 0) {
                        this.animations[animName] = anim.animations[0];
                    }
                })
                .catch((error) => {
                    console.warn(`Could not load animation "${animName}":`, error);
                })
                .finally(() => {
                    loadedCount++;
                    if (loadedCount === totalAnims) {
                        this.setState('walking');
                    }
                });
        }
    }

    setState(name) {
        if (this.currentState === name || !this.animations[name]) return;

        const previousAction = this.animations[this.currentState] ? this.mixer.clipAction(this.animations[this.currentState]) : null;
        const newAction = this.mixer.clipAction(this.animations[name]);

        if (previousAction) {
            previousAction.fadeOut(0.5);
        }

        newAction.reset().fadeIn(0.5).play();

        // Special handling for death animation to not loop
        if (name === 'zombie agonizing') {
            newAction.setLoop(THREE.LoopOnce);
            newAction.clampWhenFinished = true;
        }

        this.currentState = name;
    }

    updateAnimation(delta, camera) {
        if (this.mixer) {
            // Animation Throttling
            if (camera && this.model) {
                const dist = this.model.position.distanceTo(camera.position);
                if (dist > CONFIG.ZOMBIE.ANIMATION_CULLING_DISTANCE) {
                    // Update only every 3rd frame if far away
                    if (this.frameCounter % 3 !== 0) return;
                    delta *= 3; // Compensate delta for skipped frames
                }
            }

            this.mixer.update(delta);
            if (this.hips) {
                this.hips.position.x = 0;
                this.hips.position.z = 0;
            }
        }
    }

    updateAI(delta, playerPosition, playerAvatar, camera) {
        if (!this.model || !this.mixer || !playerPosition || !playerAvatar || this.isDead) return;

        this.frameCounter++;

        // --- Ground Collision (Throttled) ---
        // Dynamically adjust interval based on distance
        let raycastInterval = CONFIG.PERFORMANCE.RAYCAST_INTERVAL;
        const distToPlayer = this.model.position.distanceTo(playerPosition);

        if (distToPlayer > CONFIG.ZOMBIE.PHYSICS_CULLING_DISTANCE) {
            raycastInterval *= 4; // Check 4x less often if far
        }

        if (this.frameCounter % raycastInterval === 0) {
            this.tempVector.copy(this.model.position).add(this.upVector);
            this.raycaster.set(this.tempVector, this.downVector);
            const intersections = this.raycaster.intersectObjects(this.groundCollidableObjects, true);

            if (intersections.length > 0) {
                this.model.position.y = intersections[0].point.y;
            }
        }

        const distanceToPlayer = this.model.position.distanceTo(playerPosition);

        // Hysteresis: Keep chasing a bit longer than the initial detection radius
        const isChasing = this.currentState === 'zombie running';
        const detectionThreshold = Infinity; // START_SURVIVAL_MOD: Always chase player

        if (distanceToPlayer < this.attackRadius) {
            this.setState('zombie attack');
            // Face the player even while attacking
            this.tempVector.set(playerPosition.x, this.model.position.y, playerPosition.z);
            this.model.lookAt(this.tempVector);

            // Damage Logic
            const now = Date.now();
            if (now - this.lastAttackTime > 2000) { // 2 seconds cooldown
                window.dispatchEvent(new CustomEvent('player-hit'));
                this.lastAttackTime = now;
            }

        } else if (distanceToPlayer < detectionThreshold) {
            // Determine state based on distance
            const runThreshold = 15; // Run if closer than 15m

            this.tempDirection.subVectors(playerPosition, this.model.position);
            this.tempDirection.y = 0;
            this.tempDirection.normalize();

            // Look at player
            this.tempVector.set(playerPosition.x, this.model.position.y, playerPosition.z);
            this.model.lookAt(this.tempVector);

            if (distanceToPlayer < runThreshold) {
                // RUN
                this.setState('zombie running');
                this.model.position.add(this.tempDirection.multiplyScalar(this.speed * 2 * delta));
            } else {
                // WALK (Half speed)
                this.setState('walking');
                this.model.position.add(this.tempDirection.multiplyScalar(this.speed * 0.5 * delta));
            }
        } else {
            this.setState('walking');
            const target = this.patrolPath[this.currentPatrolIndex];
            const distanceToTarget = this.model.position.distanceTo(target);

            if (distanceToTarget < 1) {
                this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPath.length;
            } else {
                this.tempDirection.subVectors(target, this.model.position);
                this.tempDirection.y = 0;
                this.tempDirection.normalize();
                this.model.position.add(this.tempDirection.multiplyScalar(this.speed * delta));

                // Look at patrol target but keep upright
                this.tempVector.set(target.x, this.model.position.y, target.z);
                this.model.lookAt(this.tempVector);
            }
        }
        this.mixer.update(delta);
        if (this.hips) {
            this.hips.position.x = 0;
            this.hips.position.z = 0;
        }

        // Billboard Health Bar
        if (this.healthBarGroup && this.healthBarGroup.visible && camera) {
            this.healthBarGroup.lookAt(camera.position);
        }
    }

    takeDamage(amount) {
        if (this.isDead) return;

        this.health = Math.max(0, this.health - amount);

        // Show and update health bar
        if (this.healthBarGroup) {
            this.healthBarGroup.visible = true;
            this.healthBarMesh.scale.x = this.health / this.maxHealth;
        }

        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.isDead = true;
        this.healthBarGroup.visible = false;

        // Remove from collision immediately so player doesn't bump into dying zombie
        const index = this.collidableObjects.indexOf(this.model);
        if (index > -1) this.collidableObjects.splice(index, 1);

        // Play death animation
        this.setState('zombie agonizing');

        // Remove after animation finishes (approx 3.5s for this animation usually, safe buffer 4s)
        setTimeout(() => {
            if (this.model && this.model.parent) {
                this.model.parent.remove(this.model);
            }
            this.model = null;
            // Optional: Respawn logic
        }, 4000);
    }
}
