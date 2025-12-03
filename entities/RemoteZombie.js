import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class RemoteZombie {
    constructor(scene, id, initialData) {
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

        // Assuming loadWithCache is global, otherwise use loader.load
        if (window.loadWithCache) {
            window.loadWithCache(zombiePath, loader).then((object) => {
                this.setupModel(object, initialData);
            });
        } else {
            loader.load(zombiePath, (object) => {
                this.setupModel(object, initialData);
            });
        }
    }

    setupModel(object, initialData) {
        this.model = object.clone(); // Clone to avoid sharing state with local zombie
        this.model.scale.set(CONFIG.ZOMBIE.SCALE, CONFIG.ZOMBIE.SCALE, CONFIG.ZOMBIE.SCALE);

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

        // Load animations (reuse from cache if possible or load new)
        // For simplicity, we'll just try to load them again or assume they are in the file
        // If animations are separate files like Avatar, we need to load them.
        // The Zombie.js loads animations from the same file usually or separate?
        // Let's check Zombie.js... it calls loadAnimations().
        // Assuming the FBX has animations embedded for now or we need to copy that logic.
        // Wait, Zombie.js uses `this.loadAnimations()` which loads 'walking.fbx', 'run.fbx', 'attack.fbx'.
        this.loadAnimations();
    }

    loadAnimations() {
        const loader = new FBXLoader();
        const anims = ['walking', 'run', 'attack']; // Match Zombie.js names roughly
        // Actually Zombie.js uses: 'walking', 'zombie running', 'zombie attack'

        const animFiles = {
            'walking': '/avatars/zombi/Walking.fbx',
            'zombie running': '/avatars/zombi/Run.fbx',
            'zombie attack': '/avatars/zombi/Attack.fbx'
        };

        // Load Idle from model itself if it has it, or separate?
        // Zombie.js assumes animations are separate.

        const loadAnim = (name, path) => {
            if (window.loadWithCache) {
                window.loadWithCache(path, loader).then((anim) => {
                    this.animations[name] = this.mixer.clipAction(anim.animations[0]);
                    if (name === this.currentState) this.animations[name].play();
                });
            } else {
                loader.load(path, (anim) => {
                    this.animations[name] = this.mixer.clipAction(anim.animations[0]);
                    if (name === this.currentState) this.animations[name].play();
                });
            }
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
        if (data.state && data.state !== this.currentState) {
            if (this.animations[this.currentState]) this.animations[this.currentState].fadeOut(0.2);
            this.currentState = data.state;
            if (this.animations[this.currentState]) {
                this.animations[this.currentState].reset().fadeIn(0.2).play();
            }
        }
    }

    update(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }

    dispose() {
        if (this.model) {
            this.scene.remove(this.model);
        }
        this.mixer = null;
    }
}
