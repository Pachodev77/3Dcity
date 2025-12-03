export class InputManager {
    constructor() {
        this.moveData = { vector: { x: 0, y: 0 }, distance: 0 };
        this.cameraData = { x: 0, y: 0 };
        this.keys = {};

        // Vehicle control buttons state
        this.isAccelerating = false;
        this.isBraking = false;

        this.setupJoysticks();
        this.setupKeyboard();
        this.setupVehicleButtons();
    }

    setupJoysticks() {
        // Move Joystick
        const moveZone = document.getElementById('joystick-container-move');
        if (moveZone) {
            const moveJoystick = nipplejs.create({
                zone: moveZone,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: 'orange',
                restOpacity: 1
            });

            moveJoystick.on('move', (evt, data) => {
                this.moveData = data;
            });
            moveJoystick.on('end', () => {
                this.moveData = { vector: { x: 0, y: 0 }, distance: 0 };
            });
        }

        // Camera Joystick
        const cameraZone = document.getElementById('joystick-container-camera');
        if (cameraZone) {
            const cameraJoystick = nipplejs.create({
                zone: cameraZone,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: 'orange',
                restOpacity: 1
            });

            cameraJoystick.on('move', (evt, data) => {
                this.cameraData = data.vector;
            });
            cameraJoystick.on('end', () => {
                this.cameraData = { x: 0, y: 0 };
            });
        }
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    setupVehicleButtons() {
        const accelerateBtn = document.getElementById('accelerate-button');
        const brakeBtn = document.getElementById('brake-button');

        if (accelerateBtn) {
            // Touch events
            accelerateBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.isAccelerating = true;
            });
            accelerateBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.isAccelerating = false;
            });

            // Mouse events (for desktop)
            accelerateBtn.addEventListener('mousedown', () => {
                this.isAccelerating = true;
            });
            accelerateBtn.addEventListener('mouseup', () => {
                this.isAccelerating = false;
            });
            accelerateBtn.addEventListener('mouseleave', () => {
                this.isAccelerating = false;
            });
        }

        if (brakeBtn) {
            // Touch events
            brakeBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.isBraking = true;
            });
            brakeBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.isBraking = false;
            });

            // Mouse events (for desktop)
            brakeBtn.addEventListener('mousedown', () => {
                this.isBraking = true;
            });
            brakeBtn.addEventListener('mouseup', () => {
                this.isBraking = false;
            });
            brakeBtn.addEventListener('mouseleave', () => {
                this.isBraking = false;
            });
        }
    }

    getMoveInput() {
        // Combine joystick input with button input for vehicles
        const input = { ...this.moveData };

        // If buttons are pressed, override the y-axis (forward/backward)
        if (this.isAccelerating) {
            input.vector = { ...input.vector, y: 1 }; // Forward
            input.distance = 1;
        } else if (this.isBraking) {
            input.vector = { ...input.vector, y: -1 }; // Backward/Brake
            input.distance = 1;
        }

        return input;
    }

    getCameraInput() {
        return this.cameraData;
    }

    isKeyPressed(key) {
        return !!this.keys[key.toLowerCase()];
    }
}
