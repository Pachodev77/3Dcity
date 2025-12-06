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
            flatShading: true
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.position.y += 0.5; // Lower to ground (reduced from 1.5)

        // Make it smaller and elongated (thin and tall)
        this.mesh.scale.set(0.3, 0.8, 0.3);

        // Add a point light to make it glow self-sufficiently
        const light = new THREE.PointLight(0x00ffff, 1, 3);
        light.position.set(0, 0, 0);
        this.mesh.add(light);

        this.scene.add(this.mesh);
    }

    createLabel() {
        // Create a canvas for the number
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;

        // Draw number
        context.fillStyle = 'rgba(0, 0, 0, 0)'; // Transparent bg
        context.fillRect(0, 0, 256, 256);

        context.font = 'bold 150px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#000000';
        context.lineWidth = 8;

        context.strokeText(this.id.toString(), 128, 128);
        context.fillText(this.id.toString(), 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        this.textSprite = new THREE.Sprite(spriteMaterial);

        this.textSprite.position.copy(this.position);
        this.textSprite.position.y += 1.2; // Adjusted for lower crystal
        this.textSprite.scale.set(1.5, 1.5, 1.5);

        this.scene.add(this.textSprite);
    }

    update(delta) {
        if (this.mesh) {
            // Rotate crystal (Equator only - Y axis)
            this.mesh.rotation.y += delta;

            // Bobbing motion
            this.frame += delta * 2;
            this.mesh.position.y = this.position.y + 0.5 + Math.sin(this.frame) * 0.2;
            this.textSprite.position.y = this.position.y + 1.2 + Math.sin(this.frame) * 0.2;
        }
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
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
