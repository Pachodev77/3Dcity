import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Posición inicial de la cámara (detrás y ligeramente arriba del avatar)
camera.position.set(0, 2, -5);
// Rotación para que mire hacia adelante (hacia donde mira el avatar)
camera.rotation.y = Math.PI; // 180 grados para que mire hacia adelante

// Renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(1024, 1024); // Lower shadow map size for performance
scene.add(directionalLight);

// Ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Collidable objects
const collidableObjects = [ground];

// Vehicle variables
const vehicles = [];
const vehicleKeywords = ['car', 'bus', 'truck', 'van'];
let isInVehicle = false;
let currentVehicle = null;
let nearbyVehicle = null;
let vehicleSpeed = 0;
const vehicleMaxSpeed = 10;  // Velocidad máxima
const vehicleAcceleration = 2;  // Más lento al acelerar
const vehicleFriction = 4;     // Fricción aumentada para frenar más rápido
const vehicleSteeringSpeed = 1.5;  // Velocidad de giro

// City Model
const gltfLoader = new GLTFLoader();
gltfLoader.load('./assets/maps/city 3/source/town4new.glb', (gltf) => {
    gltf.scene.traverse(function (child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            const childName = child.name.toLowerCase();
            if (vehicleKeywords.some(keyword => childName.includes(keyword))) {
                vehicles.push(child);
                child.isOccupied = false;
            }
        }
    });
    scene.add(gltf.scene);
    collidableObjects.push(gltf.scene);
});

function spawnMazdas() {
    const mazdaLoader = new GLTFLoader();
    
    // Load first Mazda model (1999 Mazdaspeed RX-7)
    mazdaLoader.load('./assets/1999_mazdaspeed_rx-7_fd3s_a-spec_gt-concept.glb', (gltf) => {
        const mazdaModel = gltf.scene;
        const spawnPoints = [
            // Posiciones en las calles principales
            { position: new THREE.Vector3(25, 0.1, 0), rotation: Math.PI / 2 },  // Calle horizontal superior
            { position: new THREE.Vector3(-25, 0.1, 0), rotation: -Math.PI / 2 }, // Calle horizontal inferior
        ];

        spawnPoints.forEach(sp => {
            const car = mazdaModel.clone();
            car.scale.set(0.5, 0.5, 0.5);
            car.position.copy(sp.position);
            car.rotation.y = sp.rotation;
            car.userData.modelType = 'mazda1999';
            car.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(car);
            vehicles.push(car);
            collidableObjects.push(car);
        });
    });

    // Load second Mazda model (2018 Mazda RX-7 Fatal Stinger)
    mazdaLoader.load('./assets/2018_mazda_rx-7_fd3s_fatal_stinger.glb', (gltf) => {
        const mazdaModel = gltf.scene;
        const spawnPoints = [
            // Posiciones en las calles principales
            { position: new THREE.Vector3(0, 0.1, 20), rotation: Math.PI },      // Calle vertical derecha
            { position: new THREE.Vector3(0, 0.1, -20), rotation: 0 },           // Calle vertical izquierda
        ];

        spawnPoints.forEach(sp => {
            const car = mazdaModel.clone();
            car.scale.set(0.5, 0.5, 0.5);
            car.position.copy(sp.position);
            car.rotation.y = sp.rotation;
            car.userData.modelType = 'mazda2018';
            car.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(car);
            vehicles.push(car);
            collidableObjects.push(car);
        });
    });
}

spawnMazdas();

// Avatar variables
let currentAvatar = null;
let animationMixer = null;
const animationClips = {};

// Inicializar la cámara para que mire hacia adelante
let cameraAngleH = Math.PI; // 180 grados para que mire hacia adelante
let cameraAngleVOffset = 0;
let currentAction = 'idle';
const avatarList = ['Ch02_nonPBR', 'Ch08_nonPBR', 'Ch15_nonPBR'];

// UI
const avatarSelector = document.getElementById('avatar-selector');
const enterExitButton = document.getElementById('enter-exit-button');
const zoomSlider = document.getElementById('zoom-slider');

avatarList.forEach(avatarName => {
    const option = document.createElement('option');
    option.value = avatarName;
    option.innerText = avatarName;
    avatarSelector.appendChild(option);
});

avatarSelector.addEventListener('change', (e) => {
    loadAvatar(e.target.value);
});

// Load initial avatar
loadAvatar(avatarList[0]);


// Avatar Loading
function loadAvatar(avatarName) {
    if (currentAvatar) {
        scene.remove(currentAvatar);
        if (animationMixer) {
            animationMixer.stopAllAction();
        }
    }

    const fbxLoader = new FBXLoader();
    fbxLoader.load(`./assets/avatars/${avatarName}.fbx`, (fbx) => {
        currentAvatar = fbx;
        currentAvatar.scale.set(0.005, 0.005, 0.005);
        currentAvatar.position.set(0, 0, 5);
        currentAvatar.rotation.y = Math.PI; // Hacer que el avatar mire hacia adelante
        
        // Asegurar que todas las mallas tengan sombras
        currentAvatar.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        scene.add(currentAvatar);

        // Inicializar el mixer de animaciones
        animationMixer = new THREE.AnimationMixer(currentAvatar);
        
        // Cargar animaciones
        const animLoader = new FBXLoader();
        const animationsToLoad = {
            'idle': './assets/avatars/animations/Idle.fbx',
            'walking': './assets/avatars/animations/Walking.fbx',
            'running': './assets/avatars/animations/Running.fbx'
        };
        
        // Contador para asegurar que todas las animaciones se carguen
        let animationsLoaded = 0;
        const totalAnimations = Object.keys(animationsToLoad).length;

        // Función para cargar cada animación
        const loadAnimation = (name, url) => {
            animLoader.load(url, (anim) => {
                if (anim.animations && anim.animations.length > 0) {
                    animationClips[name] = anim.animations[0];
                    animationsLoaded++;
                    
                    // Si es la animación idle, reproducirla inmediatamente
                    if (name === 'idle') {
                        const idleAction = animationMixer.clipAction(animationClips['idle']);
                        idleAction.setLoop(THREE.LoopRepeat);
                        idleAction.play();
                    }
                    
                    // Si todas las animaciones están cargadas, asegurarse de que esté en idle
                    if (animationsLoaded === totalAnimations) {
                        playAnimation('idle');
                    }
                } else {
                    console.warn(`No se encontraron animaciones en ${url}`);
                }
            });
        };
        
        // Cargar cada animación
        for (const animName in animationsToLoad) {
            loadAnimation(animName, animationsToLoad[animName]);
        }
    });
}

function playAnimation(name) {
    if (!animationMixer) return;
    if (currentAction === name) return;
    
    const clip = animationClips[name];
    if (!clip) {
        console.warn(`Animación no encontrada: ${name}`);
        return;
    }
    
    const action = animationMixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat);
    
    // Si hay una animación actual, hacer fade out
    if (currentAction && animationClips[currentAction]) {
        const previousAction = animationMixer.clipAction(animationClips[currentAction]);
        if (previousAction) {
            previousAction.fadeOut(0.3);
            // Detener la animación anterior después del fade out
            setTimeout(() => {
                previousAction.stop();
            }, 300);
        }
    }
    
    // Configurar y reproducir la nueva animación
    action.reset();
    action.setEffectiveTimeScale(1.0);
    action.fadeIn(0.3);
    action.play();
    
    currentAction = name;
}

// Joysticks
const moveJoystick = nipplejs.create({
    zone: document.getElementById('joystick-container-move'),
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'blue'
});

const cameraJoystick = nipplejs.create({
    zone: document.getElementById('joystick-container-camera'),
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'red'
});

let moveData = { vector: { x: 0, y: 0 }, distance: 0 };
let cameraData = { x: 0, y: 0 };

moveJoystick.on('move', (evt, data) => {
    moveData = data;
});
moveJoystick.on('end', () => {
    moveData = { vector: { x: 0, y: 0 }, distance: 0 };
});

cameraJoystick.on('move', (evt, data) => {
    cameraData = data.vector;
});
cameraJoystick.on('end', () => {
    cameraData = { x: 0, y: 0 };
});

// Enter/Exit Vehicle Logic
function toggleVehicle() {
    if (isInVehicle) {
        // Exit vehicle
        isInVehicle = false;
        if (currentAvatar && currentVehicle) {
            currentAvatar.visible = true;
            const exitOffset = new THREE.Vector3(2, 0, 0);
            currentAvatar.position.copy(currentVehicle.position).add(exitOffset);
            currentVehicle.isOccupied = false;
            currentVehicle = null;
        }
    } else if (nearbyVehicle) {
        // Enter vehicle
        isInVehicle = true;
        currentVehicle = nearbyVehicle;
        currentVehicle.isOccupied = true;
        if (currentAvatar) {
            currentAvatar.visible = false;
        }
        // Reset camera angle to be behind the vehicle
        cameraAngleH = currentVehicle.rotation.y + Math.PI;
        cameraAngleVOffset = 0;
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e') {
        toggleVehicle();
    }
});

enterExitButton.addEventListener('click', toggleVehicle);


// Camera zoom variables
let cameraDistance = 8;
const minCameraDistance = 3;
const maxCameraDistance = 15;

// Zoom Slider Control
zoomSlider.addEventListener('input', (e) => {
    cameraDistance = parseFloat(e.target.value);
});


// Raycasters
const cameraRaycaster = new THREE.Raycaster();
const avatarRaycaster = new THREE.Raycaster();

// Animation loop
const clock = new THREE.Clock();
// Variables de ángulo de cámara movidas al inicio del archivo

// Reusable vectors for performance
const viewDirection = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const followPosition = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const direction = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0);

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (animationMixer) {
        animationMixer.update(delta);
    }

    // Proximity check
    if (!isInVehicle && currentAvatar) {
        nearbyVehicle = null;
        const proximityThreshold = 3;
        for (const vehicle of vehicles) {
            if (!vehicle.isOccupied) {
                const distance = currentAvatar.position.distanceTo(vehicle.position);
                if (distance < proximityThreshold) {
                    nearbyVehicle = vehicle;
                    break;
                }
            }
        }
    }

    const targetToFollow = isInVehicle ? currentVehicle : currentAvatar;

    if (isInVehicle && currentVehicle) {
        // Vehicle Controls
        const forward = moveData.vector.y;
        const turn = -moveData.vector.x;
        const maxReverseSpeed = -vehicleMaxSpeed * 0.5;

        // Acceleration/deceleration
        if (forward > 0) { // Accelerating forward
            vehicleSpeed += vehicleAcceleration * delta;
        } else if (forward < 0) { // Accelerating backward (reversing)
            vehicleSpeed += vehicleAcceleration * forward * delta; // `forward` is negative
        } else { // No joystick input, apply friction
            if (vehicleSpeed > 0) vehicleSpeed -= vehicleFriction * delta;
            if (vehicleSpeed < 0) vehicleSpeed += vehicleFriction * delta;
            if (Math.abs(vehicleSpeed) < 0.1) vehicleSpeed = 0; // Stop friction from flipping direction
        }
        vehicleSpeed = Math.max(maxReverseSpeed, Math.min(vehicleSpeed, vehicleMaxSpeed));

        // Steering
        if (Math.abs(vehicleSpeed) > 0.1) {
            const steeringDirection = vehicleSpeed > 0 ? 1 : -1; // Invert steering in reverse
            const steering = turn * vehicleSteeringSpeed * delta * steeringDirection;
            currentVehicle.rotation.y += steering;
        }

        // Position update (assuming model faces +Z, so we use +=)
        currentVehicle.position.x += vehicleSpeed * Math.sin(currentVehicle.rotation.y) * delta;
        currentVehicle.position.z += vehicleSpeed * Math.cos(currentVehicle.rotation.y) * delta;
        
        playAnimation('idle');

        // Chase camera logic
        const targetCameraAngleH = currentVehicle.rotation.y + Math.PI;
        let diff = targetCameraAngleH - cameraAngleH;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        cameraAngleH += diff * 0.05; // Smoothly follow the car

    } else if (currentAvatar) {
        // Avatar Controls
        const moveSpeed = 3;
        
        // Usar la dirección de la cámara para el movimiento
        camera.getWorldDirection(viewDirection);
        viewDirection.y = 0;
        viewDirection.normalize();

        // Calcular dirección de movimiento basada en el joystick (invertir el eje X para movimiento lateral)
        right.set(viewDirection.z, 0, -viewDirection.x).normalize();
        moveDirection.copy(right).multiplyScalar(-moveData.vector.x).add(viewDirection.multiplyScalar(moveData.vector.y)).normalize();

        if (moveData.distance > 0) {
            const speed = moveData.distance / 50 * moveSpeed;
            currentAvatar.position.add(moveDirection.clone().multiplyScalar(speed * delta));
            currentAvatar.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
            playAnimation('running');
        } else {
            playAnimation('idle');
        }

        // Avatar ground collision
        rayOrigin.copy(currentAvatar.position);
        rayOrigin.y += 1;
        avatarRaycaster.set(rayOrigin, down);
        const intersections = avatarRaycaster.intersectObjects(collidableObjects, true);

        if (intersections.length > 0) {
            currentAvatar.position.y = intersections[0].point.y;
        }
    }
    
    if (targetToFollow) {
        // Camera Rotation
        const cameraRotationSpeed = 2;
        // Only allow manual camera rotation if not in a vehicle
        if (!isInVehicle) {
            cameraAngleH -= cameraData.x * cameraRotationSpeed * delta;
        }
        cameraAngleVOffset += cameraData.y * cameraRotationSpeed * delta; // Inverted vertical rotation
        cameraAngleVOffset = Math.max(-0.4, Math.min(0.4, cameraAngleVOffset));

        const minAngleV = 0.1; // Look more forward
        const maxAngleV = 0.5; // Less top-down
        const t = (cameraDistance - minCameraDistance) / (maxCameraDistance - minCameraDistance);
        const baseAngleV = minAngleV + t * (maxAngleV - minAngleV);
        const cameraAngleV = baseAngleV + cameraAngleVOffset;
        
        followPosition.copy(targetToFollow.position).add({x: 0, y: 1.6, z: 0}); // Raise camera pivot
        cameraOffset.set(0, 0, cameraDistance);
        cameraOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), cameraAngleV);
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleH);
        desiredCameraPosition.copy(followPosition).add(cameraOffset);

        direction.copy(desiredCameraPosition).sub(followPosition).normalize();
        cameraRaycaster.set(followPosition, direction);
        const cameraIntersections = cameraRaycaster.intersectObjects(collidableObjects, true);

        let finalCameraPosition = desiredCameraPosition;
        if (cameraIntersections.length > 0) {
            if (cameraIntersections[0].distance < cameraDistance) {
                finalCameraPosition.copy(followPosition).add(direction.multiplyScalar(cameraIntersections[0].distance - 0.2));
            }
        }

        if (finalCameraPosition.y < 0.5) {
            finalCameraPosition.y = 0.5;
        }

        camera.position.lerp(finalCameraPosition, 0.2);
        camera.lookAt(followPosition);
    }

    // Update UI
    if (isInVehicle) {
        enterExitButton.style.display = 'flex';
        enterExitButton.innerText = 'Exit';
    } else if (nearbyVehicle) {
        enterExitButton.style.display = 'flex';
        enterExitButton.innerText = 'Enter';
    } else {
        enterExitButton.style.display = 'none';
    }

    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});