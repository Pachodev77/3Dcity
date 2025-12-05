import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class Zombie {
    constructor(scene, collidableObjects, groundCollidableObjects) {
        this.scene = scene;
        this.collidableObjects = collidableObjects;
        this.groundCollidableObjects = groundCollidableObjects;
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
            this.scene.add(this.model);
            this.collidableObjects.push(this.model);
            this.mixer = new THREE.AnimationMixer(this.model);
            this.loadAnimations();
        });
    }

    loadAnimations() {
        const animLoader = new FBXLoader();
        const animFiles = [
            'walking', 'zombie attack', 'zombie running'
        ];
        const animationsToLoad = {};
        animFiles.forEach(name => {
            animationsToLoad[name] = `/avatars/zombi/animations/${name}.fbx`;
        });

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

        this.currentState = name;
    }

    updateAnimation(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
            if (this.hips) {
                this.hips.position.x = 0;
                this.hips.position.z = 0;
            }
        }
    }

    updateAI(delta, playerPosition, playerAvatar) {
        if (!this.model || !this.mixer || !playerPosition || !playerAvatar) return;

        this.frameCounter++;

        // --- Ground Collision (Throttled) ---
        if (this.frameCounter % CONFIG.PERFORMANCE.RAYCAST_INTERVAL === 0) {
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
        const detectionThreshold = isChasing ? this.detectionRadius * 1.2 : this.detectionRadius;

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
            this.setState('zombie running');
            this.tempDirection.subVectors(playerPosition, this.model.position);
            this.tempDirection.y = 0;
            this.tempDirection.normalize();

            this.model.position.add(this.tempDirection.multiplyScalar(this.speed * 2 * delta));

            // Look at player but keep upright
            this.tempVector.set(playerPosition.x, this.model.position.y, playerPosition.z);
            this.model.lookAt(this.tempVector);
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
    }
}
