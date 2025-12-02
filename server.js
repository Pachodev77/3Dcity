import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const port = 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Store connected players: { socketId: { x, y, z, rotation, animation } }
const players = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Create a new player object
    players[socket.id] = {
        x: 0,
        y: 0,
        z: 0,
        rotation: 0,
        animation: 'idle'
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

// Start the server
httpServer.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Make sure your browser is pointing to http://localhost:${port}/index.html`);
});
