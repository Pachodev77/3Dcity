import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

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
const vehicleMaxSpeed = 10;
const vehicleAcceleration = 5;
const vehicleFriction = 2;
const vehicleSteeringSpeed = 1.5;

// City Model
const gltfLoader = new GLTFLoader();
gltfLoader.load('maps/city 3/source/town4new.glb', (gltf) => {
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

// Avatar variables
let currentAvatar = null;
let animationMixer = null;
const animationClips = {};
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
    }

    const fbxLoader = new FBXLoader();
    fbxLoader.load(`avatars/${avatarName}.fbx`, (fbx) => {
        currentAvatar = fbx;
        currentAvatar.scale.set(0.005, 0.005, 0.005);
        currentAvatar.position.set(0, 0, 5);
        currentAvatar.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(currentAvatar);

        // Animations
        animationMixer = new THREE.AnimationMixer(currentAvatar);
        const animLoader = new FBXLoader();
        const animationsToLoad = {
            'idle': 'avatars/animations/Idle.fbx',
            'walking': 'avatars/animations/Walking.fbx',
            'running': 'avatars/animations/Running.fbx'
        };
        
        let animationsLoaded = 0;
        const totalAnimations = Object.keys(animationsToLoad).length;

        for (const animName in animationsToLoad) {
            animLoader.load(animationsToLoad[animName], (anim) => {
                animationClips[animName] = anim.animations[0];
                animationsLoaded++;
                if (animationsLoaded === totalAnimations) {
                    playAnimation('idle');
                }
            });
        }
    });
}

function playAnimation(name) {
    if (currentAction === name) return;
    if (animationClips[name]) {
        const action = animationMixer.clipAction(animationClips[name]);
        if (animationClips[currentAction]){
            const previousAction = animationMixer.clipAction(animationClips[currentAction]);
            if (previousAction) {
                previousAction.fadeOut(0.5);
            }
        }
        action.reset().fadeIn(0.5).play();
        currentAction = name;
    }
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
let cameraAngleH = 0;
let cameraAngleVOffset = 0;

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

        if (forward > 0) {
            vehicleSpeed += vehicleAcceleration * delta;
        } else {
            vehicleSpeed -= vehicleFriction * delta;
        }
        vehicleSpeed = Math.max(0, Math.min(vehicleSpeed, vehicleMaxSpeed));

        if (vehicleSpeed > 0.1) {
            const steering = turn * vehicleSteeringSpeed * delta;
            currentVehicle.rotation.y += steering;
        }

        currentVehicle.position.x -= vehicleSpeed * Math.sin(currentVehicle.rotation.y) * delta;
        currentVehicle.position.z -= vehicleSpeed * Math.cos(currentVehicle.rotation.y) * delta;
        
        playAnimation('idle');

    } else if (currentAvatar) {
        // Avatar Controls
        const moveSpeed = 3;
        camera.getWorldDirection(viewDirection);
        viewDirection.y = 0;
        viewDirection.normalize();

        right.crossVectors(camera.up, viewDirection).normalize();
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
        cameraAngleH -= cameraData.x * cameraRotationSpeed * delta;
        cameraAngleVOffset -= cameraData.y * cameraRotationSpeed * delta;
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