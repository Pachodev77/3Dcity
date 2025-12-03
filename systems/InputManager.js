export class InputManager {
    constructor() {
        this.moveData = { vector: { x: 0, y: 0 }, distance: 0 };
        this.cameraData = { x: 0, y: 0 };
        this.keys = {};

        // Multi-purpose button states (vehicle: accelerate/brake, on foot: jump/attack)
        this.isButton1Pressed = false; // Accelerate button (or Jump when on foot)
        this.isButton2Pressed = false; // Brake button (or Attack when on foot)

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
                this.isButton1Pressed = true;
            });
            accelerateBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.isButton1Pressed = false;
            });

            // Mouse events (for desktop)
            accelerateBtn.addEventListener('mousedown', () => {
                this.isButton1Pressed = true;
            });
            accelerateBtn.addEventListener('mouseup', () => {
                this.isButton1Pressed = false;
            });
            accelerateBtn.addEventListener('mouseleave', () => {
                this.isButton1Pressed = false;
            });
        }

        if (brakeBtn) {
            // Touch events
            brakeBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.isButton2Pressed = true;
            });
            brakeBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.isButton2Pressed = false;
            });

            // Mouse events (for desktop)
            brakeBtn.addEventListener('mousedown', () => {
                this.isButton2Pressed = true;
            });
            brakeBtn.addEventListener('mouseup', () => {
                this.isButton2Pressed = false;
            });
            brakeBtn.addEventListener('mouseleave', () => {
                this.isButton2Pressed = false;
            });
        }
    }

    getMoveInput() {
        // Combine joystick input with button input for vehicles
        const input = { ...this.moveData };

        // If buttons are pressed, override the y-axis (forward/backward)
        if (this.isButton1Pressed) {
            input.vector = { ...input.vector, y: 1 }; // Forward
            input.distance = 1;
        } else if (this.isButton2Pressed) {
            input.vector = { ...input.vector, y: -1 }; // Backward/Brake
            input.distance = 1;
        }

        return input;
    }

    // Check if jump button is pressed (Button 1 when on foot)
    isJumpPressed() {
        return this.isButton1Pressed;
    }

    // Check if attack button is pressed (Button 2 when on foot)
    isAttackPressed() {
        return this.isButton2Pressed;
    }

    getCameraInput() {
        return this.cameraData;
    }

    isKeyPressed(key) {
        return !!this.keys[key.toLowerCase()];
    }
}
