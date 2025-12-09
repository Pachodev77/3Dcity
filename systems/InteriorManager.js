import * as THREE from 'three';
import { Interior } from '../entities/Interior.js';

export class InteriorManager {
    constructor(renderer, camera, avatar) {
        this.renderer = renderer;
        this.camera = camera;
        this.avatar = avatar;

        this.interiors = new Map(); // id -> Interior
        this.currentInterior = null;
        this.mainScene = null;
        this.isInInterior = false;

        // Store main world state
        this.mainWorldPosition = new THREE.Vector3();
        this.mainWorldRotation = new THREE.Euler();

        // UI for prompts
        this.createUI();
    }

    setMainScene(scene) {
        this.mainScene = scene;
    }

    createInterior(id, name, modelPath = null) {
        const interior = new Interior(id, name, modelPath);
        this.interiors.set(id, interior);
        return interior;
    }

    createUI() {
        // Create button UI positioned directly above left joystick (smaller size)
        this.buttonElement = document.createElement('button');
        this.buttonElement.id = 'interior-button';
        this.buttonElement.style.cssText = `
            position: fixed !important;
            bottom: 110px !important;
            left: 20px !important;
            width: 50px;
            height: 50px;
            background: rgba(0, 200, 255, 0.8);
            border: 3px solid white;
            border-radius: 50%;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 11px;
            font-weight: bold;
            display: none;
            z-index: 2000 !important;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
            transition: all 0.2s;
        `;
        this.buttonElement.innerHTML = 'ENTER';

        // Add hover/active effects
        this.buttonElement.addEventListener('mousedown', () => {
            this.buttonElement.style.transform = 'scale(0.95)';
        });
        this.buttonElement.addEventListener('mouseup', () => {
            this.buttonElement.style.transform = 'scale(1)';
        });

        // Handle click
        this.buttonElement.addEventListener('click', () => {
            if (!this.isInInterior) {
                window.dispatchEvent(new CustomEvent('interior-enter'));
            } else {
                window.dispatchEvent(new CustomEvent('interior-exit'));
            }
        });

        document.body.appendChild(this.buttonElement);
    }

    showPrompt(show) {
        this.buttonElement.style.display = show ? 'block' : 'none';
    }

    updateButtonText(isInside) {
        this.buttonElement.innerHTML = isInside ? 'EXIT' : 'ENTER';
        this.buttonElement.style.background = isInside ? 'rgba(255, 100, 100, 0.8)' : 'rgba(0, 200, 255, 0.8)';
    }

    enterInterior(interiorId) {
        const interior = this.interiors.get(interiorId);
        if (!interior || this.isInInterior) return;

        console.log(`[InteriorManager] Entering interior ${interiorId}`);

        // Save main world state
        this.mainWorldPosition.copy(this.avatar.position);
        this.mainWorldRotation.copy(this.avatar.rotation);

        // Move avatar to interior spawn
        const spawnPos = interior.getSpawnPosition();
        this.avatar.model.position.copy(spawnPos);
        this.avatar.model.rotation.y = 0;

        // Remove avatar from main scene and add to interior scene
        if (this.mainScene && this.avatar.model) {
            this.mainScene.remove(this.avatar.model);
            interior.scene.add(this.avatar.model);
        }

        // Switch scene
        this.currentInterior = interior;
        this.isInInterior = true;

        this.updateButtonText(true);
    }

    exitInterior() {
        if (!this.isInInterior || !this.currentInterior) return;

        console.log(`[InteriorManager] Exiting interior ${this.currentInterior.id}`);

        // Restore avatar to main world position
        this.avatar.model.position.copy(this.mainWorldPosition);
        this.avatar.model.rotation.copy(this.mainWorldRotation);

        // Remove avatar from interior scene and add back to main scene
        if (this.currentInterior && this.avatar.model) {
            this.currentInterior.scene.remove(this.avatar.model);
            this.mainScene.add(this.avatar.model);
        }

        // Switch back to main scene
        this.currentInterior = null;
        this.isInInterior = false;

        this.updateButtonText(false);
        this.hidePrompt();
    }

    hidePrompt() {
        this.showPrompt(false);
    }

    getCurrentScene() {
        return this.isInInterior ? this.currentInterior.scene : this.mainScene;
    }

    update() {
        // This method can be used for any per-frame interior logic
    }

    dispose() {
        this.interiors.forEach(interior => interior.dispose());
        this.interiors.clear();
        if (this.buttonElement) {
            this.buttonElement.remove();
        }
    }
}
