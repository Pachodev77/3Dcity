import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { CONFIG } from '../config.js';

export class RemoteAvatar {
    constructor(scene, id, initialData) {
        console.log(`Creating RemoteAvatar for ${id}`, initialData);
        this.scene = scene;
        this.id = id;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.currentState = 'idle';
        this.avatarType = initialData.avatarType || 'Ch02_nonPBR'; // Track current avatar type

        // Chat bubble
        this.chatBubble = null;

        this.loadModel(initialData);
    }

    loadModel(initialData) {
        const loader = new FBXLoader();
        // Use the avatar type sent by the remote player
        const avatarType = initialData.avatarType || 'Ch02_nonPBR';
        const avatarPath = `/avatars/${avatarType}.fbx`;

        const loadFunc = window.loadWithCache ? window.loadWithCache : (path, loader) => {
            return new Promise((resolve, reject) => {
                loader.load(path, resolve, undefined, reject);
            });
        };

        loadFunc(avatarPath, loader).then((object) => {
            this.model = object;

            // Apply correct scale based on avatar type
            if (avatarType === 'Remy@T-Pose') {
                this.model.scale.set(CONFIG.AVATAR.REMY_SCALE, CONFIG.AVATAR.REMY_SCALE, CONFIG.AVATAR.REMY_SCALE);
            } else {
                this.model.scale.set(CONFIG.AVATAR.DEFAULT_SCALE, CONFIG.AVATAR.DEFAULT_SCALE, CONFIG.AVATAR.DEFAULT_SCALE);
            }

            // Set initial position
            this.model.position.set(initialData.x, initialData.y, initialData.z);
            this.model.rotation.y = initialData.rotation;

            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.model.visible = false; // Hide initially to prevent T-Pose
            this.scene.add(this.model);
            this.mixer = new THREE.AnimationMixer(this.model);
            this.loadAnimations();
        }).catch((error) => {
            console.error(`Error loading remote avatar ${avatarType}:`, error);
        });
    }

    async loadAnimations() {
        const loader = new FBXLoader();
        const loadFunc = window.loadWithCache ? window.loadWithCache : (path, loader) => {
            return new Promise((resolve, reject) => {
                loader.load(path, resolve, undefined, reject);
            });
        };

        // Load idle animation first to prevent T-pose
        try {
            const idleAnim = await loadFunc('/avatars/animations/Idle.fbx', loader);
            if (idleAnim.animations && idleAnim.animations.length > 0) {
                this.animations['idle'] = idleAnim.animations[0];
                // Play idle immediately (no fade)
                const success = this.setState('idle', true);
                // Show model only if idle is successfully playing
                if (success && this.model) {
                    this.model.visible = true;
                }
            }
        } catch (error) {
            console.warn('Could not load remote avatar idle animation:', error);
        }

        // Load remaining animations in background
        const remainingAnimations = {
            'walking': '/avatars/animations/Walking.fbx',
            'running': '/avatars/animations/Running.fbx'
        };

        const promises = Object.entries(remainingAnimations).map(async ([name, url]) => {
            try {
                const anim = await loadFunc(url, loader);
                if (anim.animations && anim.animations.length > 0) {
                    this.animations[name] = anim.animations[0];
                }
            } catch (error) {
                console.warn(`Could not load remote avatar animation "${name}":`, error);
            }
        });

        await Promise.all(promises);
    }

    setState(stateName, immediate = false) {
        if (!this.animations[stateName] || !this.mixer) {
            console.warn(`Remote avatar animation "${stateName}" or mixer not ready`);
            return false;
        }

        if (this.currentState === stateName && !immediate) return true;

        const newAction = this.mixer.clipAction(this.animations[stateName]);

        if (this.currentAction && !immediate) {
            this.currentAction.fadeOut(0.2);
        }

        if (immediate) {
            // For initial idle, play immediately without fade
            newAction.reset().play();
        } else {
            newAction.reset().fadeIn(0.2).play();
        }

        this.currentAction = newAction;
        this.currentState = stateName;
        return true;
    }

    update(delta, camera) {
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // Update chat bubble
        if (this.chatBubble) {
            const position = this.model ? this.model.position : new THREE.Vector3();
            this.chatBubble.update(delta, position, camera);
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
            const position = this.model.position;
            this.chatBubble = new ChatBubbleClass(this.scene, message, position, config);
        }
    }

    updateState(data) {
        // Check if avatar type has changed
        if (data.avatarType && data.avatarType !== this.avatarType) {
            console.log(`Remote player ${this.id} changed avatar from ${this.avatarType} to ${data.avatarType}`);
            this.avatarType = data.avatarType;
            // Reload the model with new avatar type
            this.dispose();
            this.loadModel(data);
            return;
        }

        if (!this.model) return;

        // Smoothly interpolate position (simple lerp)
        // For production, use a proper snapshot interpolation buffer
        if (!this.targetPosition) this.targetPosition = new THREE.Vector3();
        this.targetPosition.set(data.x, data.y, data.z);
        this.model.position.lerp(this.targetPosition, 0.3);

        // Update rotation
        // Shortest path rotation interpolation could be added here
        this.model.rotation.y = data.rotation;

        // Update animation
        if (data.animation && data.animation !== this.currentState) {
            this.setState(data.animation);
        }
    }

    dispose() {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }
        if (this.model) {
            this.model.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (child.material.map) child.material.map.dispose();
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            this.scene.remove(this.model);
            this.model = null;
        }
        this.animations = {};
        this.currentAction = null;
    }
}
