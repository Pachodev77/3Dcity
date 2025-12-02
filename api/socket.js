import { Server } from 'socket.io';

// In-memory player storage (resets on cold starts)
const players = {};

let io;

export default function handler(req, res) {
    if (!res.socket.server.io) {
        console.log('Initializing Socket.IO server...');

        io = new Server(res.socket.server, {
            path: '/api/socket',
            addTrailingSlash: false,
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            },
            transports: ['polling', 'websocket']
        });

        io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

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

        res.socket.server.io = io;
    } else {
        console.log('Socket.IO server already running');
    }

    res.end();
}
