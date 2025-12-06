import * as THREE from 'three';

export class BusinessMarker {
    constructor(scene, id, position) {
        this.scene = scene;
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
    if(this.textSprite) {
        this.scene.remove(this.textSprite);
        this.textSprite.material.map.dispose();
        this.textSprite.material.dispose();
    }
}
}
