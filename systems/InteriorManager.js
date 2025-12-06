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

    createInterior(id, name) {
        const interior = new Interior(id, name);
        this.interiors.set(id, interior);
        return interior;
    }

    createUI() {
        // Create prompt UI
        this.promptElement = document.createElement('div');
        this.promptElement.id = 'interior-prompt';
        this.promptElement.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-family: Arial, sans-serif;
            font-size: 18px;
            display: none;
            z-index: 1000;
        `;
        this.promptElement.innerHTML = 'Press <strong>E</strong> to enter';
        document.body.appendChild(this.promptElement);
    }

    showPrompt(show) {
        this.promptElement.style.display = show ? 'block' : 'none';
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

        // Switch scene
        this.currentInterior = interior;
        this.isInInterior = true;

        this.hidePrompt();
    }

    exitInterior() {
        if (!this.isInInterior || !this.currentInterior) return;

        console.log(`[InteriorManager] Exiting interior ${this.currentInterior.id}`);

        // Restore avatar to main world position
        this.avatar.model.position.copy(this.mainWorldPosition);
        this.avatar.model.rotation.copy(this.mainWorldRotation);

        // Switch back to main scene
        this.currentInterior = null;
        this.isInInterior = false;
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
        if (this.promptElement) {
            this.promptElement.remove();
        }
    }
}
