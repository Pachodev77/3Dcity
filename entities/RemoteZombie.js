import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class RemoteZombie {
    constructor(scene, id, initialData) {
        console.log(`Creating RemoteZombie for ${id}`, initialData);
        this.scene = scene;
        this.id = id; // This ID corresponds to the player ID who owns the zombie
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentState = 'idle';

        this.loadModel(initialData);
    }

    loadModel(initialData) {
        const loader = new FBXLoader();
        // Use the same zombie model as local
        const zombiePath = '/avatars/zombi/Yaku J Ignite.fbx';

        // Use global loadWithCache if available
        const loadFunc = window.loadWithCache ? window.loadWithCache : (path, loader) => {
            return new Promise((resolve, reject) => {
                loader.load(path, resolve, undefined, reject);
            });
        };

        loadFunc(zombiePath, loader).then((object) => {
            this.setupModel(object, initialData);
        }).catch(err => {
            console.error("Error loading remote zombie model:", err);
        });
    }

    setupModel(object, initialData) {
        this.model = object.clone(); // Clone to avoid sharing state with local zombie

        // Force scale immediately
        this.model.scale.set(CONFIG.ZOMBIE.SCALE, CONFIG.ZOMBIE.SCALE, CONFIG.ZOMBIE.SCALE);
        this.model.updateMatrix(); // Ensure matrix is updated

        // Set initial position
        if (initialData) {
            this.model.position.set(initialData.x, initialData.y, initialData.z);
            this.model.rotation.y = initialData.rotation;
        }

        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.scene.add(this.model);
        this.mixer = new THREE.AnimationMixer(this.model);

        this.loadAnimations();
    }

    loadAnimations() {
        const loader = new FBXLoader();
        const animFiles = {
            'walking': '/avatars/zombi/animations/walking.fbx',
            'zombie running': '/avatars/zombi/animations/zombie running.fbx',
            'zombie attack': '/avatars/zombi/animations/zombie attack.fbx'
        };

        const loadAnim = (name, path) => {
            const loadFunc = window.loadWithCache ? window.loadWithCache : (path, loader) => {
                return new Promise((resolve, reject) => {
                    loader.load(path, resolve, undefined, reject);
                });
            };

            loadFunc(path, loader).then((anim) => {
                if (anim.animations && anim.animations.length > 0) {
                    this.animations[name] = this.mixer.clipAction(anim.animations[0]);
                    console.log(`Loaded remote zombie animation: ${name}`);

                    // If this is the current state, play it immediately
                    if (name === this.currentState) {
                        this.animations[name].play();
                    }
                } else {
                    console.warn(`No animations found in ${path}`);
                }
            }).catch(err => {
                console.error(`Error loading remote zombie animation ${name}:`, err);
            });
        };

        for (const [name, path] of Object.entries(animFiles)) {
            loadAnim(name, path);
        }
    }

    updateState(data) {
        if (!this.model) return;

        // Interpolate position
        this.model.position.lerp(new THREE.Vector3(data.x, data.y, data.z), 0.3);
        this.model.rotation.y = data.rotation;

        // Update animation
        let stateToPlay = data.state;

        // Fallback for idle if not loaded (Zombie.js usually walks)
        if (stateToPlay === 'idle' && !this.animations['idle']) {
            stateToPlay = 'walking';
        }

        if (stateToPlay && stateToPlay !== this.currentState) {
            if (this.animations[this.currentState]) this.animations[this.currentState].fadeOut(0.2);

            this.currentState = stateToPlay;

            if (this.animations[this.currentState]) {
                this.animations[this.currentState].reset().fadeIn(0.2).play();
            } else {
                // Try to play ANY animation if the requested one is missing to avoid T-Pose
                const firstAnim = Object.values(this.animations)[0];
                if (firstAnim) {
                    console.warn(`Missing animation ${stateToPlay}, playing fallback`);
                    firstAnim.reset().fadeIn(0.2).play();
                }
            }
        }
    }

    update(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // BRUTE FORCE SCALE FIX: Ensure scale is correct every frame
        if (this.model) {
            const targetScale = CONFIG.ZOMBIE.SCALE || 0.005;
            if (this.model.scale.x > targetScale * 2) { // If it's way too big
                console.warn('Fixing Zombie Scale');
                this.model.scale.set(targetScale, targetScale, targetScale);
                this.model.updateMatrix();
            }
        }
    }

    dispose() {
        if (this.model) {
            this.scene.remove(this.model);
        }
        this.mixer = null;
    }
}
