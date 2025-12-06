import * as THREE from 'three';

export class BusinessMarker {
    constructor(scene, id, position) {
        this.scene = scene;
        this.id = id;
        this.position = position;
        this.mesh = null;
        this.textSprite = null;
        this.frame = 0;

        this.createMesh();
        this.createLabel();
    }

    createMesh() {
        // Create a crystal shape (Octahedron)
        const geometry = new THREE.OctahedronGeometry(0.5, 0);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x0044aa,
            specular: 0xffffff,
            shininess: 30,
            transparent: true,
            opacity: 0.8,
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.textSprite) {
            this.scene.remove(this.textSprite);
            this.textSprite.material.map.dispose();
            this.textSprite.material.dispose();
        }
    }
}
