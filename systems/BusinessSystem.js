import * as THREE from 'three';
import { BusinessMarker } from '../entities/BusinessMarker.js';

export class BusinessSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.markers = [];
        this.nextId = 1;

        // "Burnin Rubber" Map Specific Locations
        this.locations = [
            { id: 1, x: -65.27, y: 5.06, z: 7.40 },
            { id: 2, x: -74.68, y: 5.06, z: 8.66 },
            { id: 3, x: -85.60, y: 5.06, z: 8.63 },
            { id: 4, x: -90.19, y: 5.06, z: 8.86 },
            { id: 5, x: -98.78, y: 5.06, z: 7.44 },
            { id: 6, x: -116.72, y: 5.06, z: 10.94 },
            { id: 7, x: -124.83, y: 5.06, z: -2.43 },
            { id: 8, x: -104.58, y: 5.06, z: -6.38 },
            { id: 9, x: -94.35, y: 5.06, z: -9.96 },
            { id: 10, x: -82.12, y: 4.60, z: -32.37 }
        ];

        this.initialized = false;

        // Debug Mode for placement
        this.placementMode = true;
        this.target = null;
    }

    setTarget(target) {
        this.target = target;
    }

    init() {
        if (this.initialized) return;

        // Load existing locations
        this.locations.forEach(loc => {
            this.addMarker(new THREE.Vector3(loc.x, loc.y, loc.z), loc.id);
        });

        // Setup Input for placement (Press 'M')
        window.addEventListener('keydown', (e) => {
            if (this.placementMode && e.key.toLowerCase() === 'm') {
                this.placeMarker();
            }
            if (e.key.toLowerCase() === 'l') { // List all
                this.exportLocations();
            }
        });

        console.log('[BusinessSystem] initialized. Press "M" to place a marker at your position. Press "L" to list all markers.');
        this.initialized = true;
    }

    addMarker(position, id = null) {
        const markerId = id || this.nextId++;
        const marker = new BusinessMarker(this.scene, markerId, position);
        this.markers.push(marker);

        console.log(`[BusinessSystem] Added marker ${markerId} at ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
        return marker;
    }

    placeMarker() {
        let position;

        if (this.target && this.target.position) {
            // Use target (avatar) position
            // Clone check just in case position is weird, but it should be Vector3
            position = this.target.position.clone();

            // Adjust Y to be at ground level? 
            // The crystal floats +1.5 above this position.
            // If the avatar pivot is at feet (usually is), then this is perfect.
        } else {
            console.warn('[BusinessSystem] No target set for placement. Using camera fallback.');
            // Fallback: Place marker 5 units in front of camera
            const direction = new THREE.Vector3();
            this.camera.getWorldDirection(direction);
            position = this.camera.position.clone().add(direction.multiplyScalar(5));
        }

        this.addMarker(position);
    }

    update(delta) {
        this.markers.forEach(marker => marker.update(delta));
    }

    exportLocations() {
        const exportData = this.markers.map(m => ({
            id: m.id,
            x: parseFloat(m.position.x.toFixed(2)),
            y: parseFloat(m.position.y.toFixed(2)),
            z: parseFloat(m.position.z.toFixed(2))
        }));
        console.log('--- Business Locations Export ---');
        console.log(JSON.stringify(exportData, null, 2));
        console.log('---------------------------------');
    }
}
