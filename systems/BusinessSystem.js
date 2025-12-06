import * as THREE from 'three';
import { BusinessMarker } from '../entities/BusinessMarker.js';

export class BusinessSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.markers = [];
        this.nextId = 1;

        // "Burnin Rubber" Map Specific Locations (Empty initially, user will populate)
        this.locations = [

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
