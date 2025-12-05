import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Enable CORS for all origins
app.use(cors());

// Serve music files statically
app.use('/music', express.static(path.join(__dirname, 'public', 'music')));

// API Endpoint to get music list
app.get('/api/music', (req, res) => {
    const musicDir = path.join(__dirname, 'public', 'music');

    // Check if directory exists
    if (!fs.existsSync(musicDir)) {
        return res.json([]);
    }

    fs.readdir(musicDir, (err, files) => {
        if (err) {
            console.error('Error reading music directory:', err);
            return res.status(500).json({ error: 'Failed to read music directory' });
        }

        // Filter for audio files
        const audioFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext);
        });

        res.json(audioFiles);
    });
});

// Socket.IO with CORS configuration
const io = new Server(httpServer, {
    cors: {
        origin: '*', // Allow all origins (you can restrict this to your Vercel domain)
        methods: ['GET', 'POST']
    }
});

const port = process.env.PORT || 3001;

// Store connected players
const players = {};
const vehicles = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new player object
    players[socket.id] = {
        x: 0,
        y: 0,
        z: 0,
        rotation: 0,
        animation: 'idle',
        avatarType: 'Ch02_nonPBR', // Default avatar
        zombie: { // Each player has a zombie
            x: 0,
            y: 0,
            z: 0,
            rotation: 0,
            state: 'idle'
        }
    };

    // Send the current world state to the new client
    socket.emit('currentWorldState', {
        players: players,
        vehicles: vehicles
    });

    // Broadcast to other players that a new player has connected
    socket.broadcast.emit('newPlayer', {
        id: socket.id,
        ...players[socket.id]
    });

    // Handle player movement/update
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;
            players[socket.id].animation = movementData.animation;
            if (movementData.avatarType) {
                players[socket.id].avatarType = movementData.avatarType;
            }

            // Broadcast the update to all other players
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                ...players[socket.id]
            });
        }
    });

    // Handle zombie update
    socket.on('zombieUpdate', (zombieData) => {
        if (players[socket.id]) {
            players[socket.id].zombie = zombieData;
            socket.broadcast.emit('zombieMoved', {
                id: socket.id, // Zombie belongs to this player
                ...zombieData
            });
        }
    });

    // Handle vehicle spawn
    socket.on('spawnVehicle', (vehicleData) => {
        const vehicleId = Date.now().toString(); // Simple ID generation
        vehicles[vehicleId] = {
            id: vehicleId,
            type: vehicleData.type,
            x: vehicleData.x,
            y: vehicleData.y,
            z: vehicleData.z,
            rotation: vehicleData.rotation,
            owner: null // No driver initially
        };
        io.emit('vehicleSpawned', vehicles[vehicleId]);
    });

    // Handle vehicle update (movement/ownership)
    socket.on('vehicleUpdate', (vehicleData) => {
        if (vehicles[vehicleData.id]) {
            vehicles[vehicleData.id].x = vehicleData.x;
            vehicles[vehicleData.id].y = vehicleData.y;
            vehicles[vehicleData.id].z = vehicleData.z;
            vehicles[vehicleData.id].rotation = vehicleData.rotation;
            vehicles[vehicleData.id].owner = socket.id; // Current driver

            socket.broadcast.emit('vehicleMoved', vehicles[vehicleData.id]);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        // Also release any vehicles owned by this player? 
        // For now, let's just leave them or set owner to null
        Object.values(vehicles).forEach(v => {
            if (v.owner === socket.id) {
                v.owner = null;
            }
        });
        io.emit('playerDisconnected', socket.id);
    });

    // Handle player damage (PvP)
    socket.on('playerDamage', (data) => {
        // Broadcast to all clients so they can show effects/update health
        // data should contain { targetId, damage }
        io.emit('playerDamaged', {
            targetId: data.targetId,
            attackerId: socket.id,
            damage: data.damage
        });
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: Object.keys(players).length });
});

// Start the server
httpServer.listen(port, () => {
    console.log(`Multiplayer server running on port ${port}`);
});
