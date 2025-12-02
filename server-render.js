import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

// Enable CORS for all origins
app.use(cors());

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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create a new player object
    players[socket.id] = {
        x: 0,
        y: 0,
        z: 0,
        rotation: 0,
        animation: 'idle',
        avatarType: 'Ch02_nonPBR' // Default avatar
    };

    // Send the current players to the new client
    socket.emit('currentPlayers', players);

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

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
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
