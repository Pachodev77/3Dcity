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
        // Use simpler geometry - ConeGeometry
        const geometry = new THREE.ConeGeometry(0.3, 1.0, 6);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.7
            // No emissive/specular - no glow
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.position.y += 0.5;

        // No light - removed for performance and no glow

        this.scene.add(this.mesh);
    }

    createLabel() {
        // Create a canvas for the number
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;

        // Draw number
        context.fillStyle = 'rgba(0, 0, 0, 0)';
        context.fillRect(0, 0, 128, 128);

        context.font = 'bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#ffffff';
        context.strokeStyle = '#000000';
        context.lineWidth = 4;

        context.strokeText(this.id.toString(), 64, 64);
        context.fillText(this.id.toString(), 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        this.textSprite = new THREE.Sprite(spriteMaterial);

        this.textSprite.position.copy(this.position);
        this.textSprite.position.y += 1.2;
        this.textSprite.scale.set(1.2, 1.2, 1.2);

        this.scene.add(this.textSprite);
    }

    update(delta) {
        if (this.mesh) {
            // Slower rotation
            this.mesh.rotation.y += delta * 0.5;

            // Simpler bobbing
            if (Math.floor(this.frame * 10) % 2 === 0) {
                this.frame += delta * 2;
                const bobOffset = Math.sin(this.frame) * 0.2;
                this.mesh.position.y = this.position.y + 0.5 + bobOffset;
                this.textSprite.position.y = this.position.y + 1.2 + bobOffset;
            } else {
                this.frame += delta * 2;
            }
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
