import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Interior {
    constructor(id, name, modelPath = null) {
        this.id = id;
        this.name = name;
        this.modelPath = modelPath;
        this.scene = new THREE.Scene();
        this.objects = [];
        this.ground = null;

        this.init();
    }

    init() {
        // Sky color for interior
        this.scene.background = new THREE.Color(0xcccccc);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        // Create ground plane (small interior space)
        if (!this.modelPath) {
            const groundGeometry = new THREE.PlaneGeometry(20, 20);
            const groundMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.8,
                metalness: 0.2
            });
            this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
            this.ground.rotation.x = -Math.PI / 2;
            this.ground.position.y = 0;
            this.scene.add(this.ground);

            // Add walls (simple box room)
            this.createWalls();
        } else {
            this.loadModel();
        }
    }

    loadModel() {
        console.log(`Loading interior model for ${this.name}: ${this.modelPath}`);
        const loader = new GLTFLoader();

        // Use global loadWithCache if available, otherwise fallback
        const loadFunc = window.loadWithCache ? window.loadWithCache : (path, loader) => {
            return new Promise((resolve, reject) => {
                loader.load(path, resolve, undefined, reject);
            });
        };

        loadFunc(this.modelPath, loader).then((gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.scene.add(model);
            this.objects.push(model);
            console.log(`Loaded interior model: ${this.modelPath}`);
        }).catch((error) => {
            console.error(`Error loading interior model ${this.modelPath}:`, error);
            // Fallback to procedural on error
            this.createWalls();
        });
    }

    createWalls() {
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            side: THREE.DoubleSide
        });

        // Back wall
        const backWall = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 10),
            wallMaterial
        );
        backWall.position.set(0, 5, -10);
        this.scene.add(backWall);

        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 10),
            wallMaterial
        );
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-10, 5, 0);
        this.scene.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(20, 10),
            wallMaterial
        );
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(10, 5, 0);
        this.scene.add(rightWall);

        // Front wall (with door opening)
        const frontWallLeft = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 10),
            wallMaterial
        );
        frontWallLeft.position.set(-6.5, 5, 10);
        frontWallLeft.rotation.y = Math.PI;
        this.scene.add(frontWallLeft);

        const frontWallRight = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 10),
            wallMaterial
        );
        frontWallRight.position.set(6.5, 5, 10);
        frontWallRight.rotation.y = Math.PI;
        this.scene.add(frontWallRight);
    }

    getSpawnPosition() {
        // Spawn player in center of room
        return new THREE.Vector3(0, 0, 5);
    }

    addObject(object) {
        this.scene.add(object);
        this.objects.push(object);
    }

    dispose() {
        // Clean up resources
        this.objects.forEach(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        this.scene.clear();
    }
}
