import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class RemoteAvatar {
    constructor(scene, id, initialData) {
        this.scene = scene;
        this.id = id;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.currentState = 'idle';

        this.loadModel(initialData);
    }

    loadModel(initialData) {
        const loader = new FBXLoader();
        // Use the default avatar for remote players for now
        // In a full implementation, you'd send the avatar type in initialData
        const avatarPath = '/avatars/Ch02_nonPBR.fbx';

        loadWithCache(avatarPath, loader).then((object) => {
            this.model = object;
            this.model.scale.set(CONFIG.AVATAR.DEFAULT_SCALE, CONFIG.AVATAR.DEFAULT_SCALE, CONFIG.AVATAR.DEFAULT_SCALE);

            // Set initial position
            this.model.position.set(initialData.x, initialData.y, initialData.z);
            this.model.rotation.y = initialData.rotation;

            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.scene.add(this.model);
            this.mixer = new THREE.AnimationMixer(this.model);
            this.loadAnimations();
        });
    }

    loadAnimations() {
        const loader = new FBXLoader();
        const animationsToLoad = {
            'idle': '/avatars/animations/Idle.fbx',
            'walking': '/avatars/animations/Walking.fbx',
            'running': '/avatars/animations/Running.fbx'
        };

        let loadedCount = 0;
        Object.entries(animationsToLoad).forEach(([name, url]) => {
            loadWithCache(url, loader).then((object) => {
                if (object.animations && object.animations.length > 0) {
                    this.animations[name] = object.animations[0];
                    loadedCount++;
                    if (loadedCount === Object.keys(animationsToLoad).length) {
                        this.setState('idle');
                    }
                }
            }).catch((error) => {
                console.warn(`Could not load remote avatar animation "${name}":`, error);
                loadedCount++;
            });
        });
    }

    setState(stateName) {
        if (this.currentState === stateName || !this.animations[stateName] || !this.mixer) return;

        const newAction = this.mixer.clipAction(this.animations[stateName]);

        if (this.currentAction) {
            this.currentAction.fadeOut(0.2);
        }

        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
        this.currentState = stateName;
    }

    update(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }

    updateState(data) {
        if (!this.model) return;

        // Smoothly interpolate position (simple lerp)
        // For production, use a proper snapshot interpolation buffer
        this.model.position.lerp(new THREE.Vector3(data.x, data.y, data.z), 0.3);

        // Update rotation
        // Shortest path rotation interpolation could be added here
        this.model.rotation.y = data.rotation;

        // Update animation
        if (data.animation && data.animation !== this.currentState) {
            this.setState(data.animation);
        }
    }

    dispose() {
        if (this.model) {
            this.scene.remove(this.model);
        }
    }
}
