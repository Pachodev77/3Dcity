/**
 * ChatUI - Manages the chat window interface
 */
export class ChatUI {
    constructor(onSendMessage) {
        this.onSendMessage = onSendMessage;
        this.isOpen = false;

        this.chatContainer = document.getElementById('chat-container');
        this.chatToggleButton = document.getElementById('chat-toggle-button');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.chatSendButton = document.getElementById('chat-send-button');

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Toggle chat window
        this.chatToggleButton.addEventListener('click', () => {
            this.toggle();
        });

        // Send message on button click
        this.chatSendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // Send message on Enter key
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Prevent game input when typing in chat
        this.chatInput.addEventListener('focus', () => {
            window.chatInputFocused = true;

            // Prevent scroll when keyboard appears
            document.body.style.position = 'fixed';
            document.body.style.top = '0';
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.bottom = '0';

            // Prevent input from scrolling into view
            setTimeout(() => {
                window.scrollTo(0, 0);
            }, 100);
        });

        this.chatInput.addEventListener('blur', () => {
            window.chatInputFocused = false;

            // Restore scroll when keyboard closes
            setTimeout(() => {
                window.scrollTo(0, 0);
            }, 100);
        });

        // Handle visual viewport changes (keyboard appearance)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                // Keep the page at the top when keyboard appears
                window.scrollTo(0, 0);
            });
        }
    }

    toggle() {
        this.isOpen = !this.isOpen;

        if (this.isOpen) {
            this.chatContainer.style.display = 'flex';
            this.chatToggleButton.innerHTML = '✖️';
            this.chatToggleButton.title = 'Close Chat';
            // Focus input when opening
            setTimeout(() => this.chatInput.focus(), 100);
        } else {
            this.chatContainer.style.display = 'none';
            this.chatToggleButton.innerHTML = '💬';
            this.chatToggleButton.title = 'Open Chat';
        }
    }

    sendMessage() {
        const message = this.chatInput.value.trim();

        if (message.length === 0) return;

        // Check max length
        const maxLength = 150;
        if (message.length > maxLength) {
            this.addSystemMessage(`Message too long (max ${maxLength} characters)`);
            return;
        }

        // Call callback to send message
        if (this.onSendMessage) {
            this.onSendMessage(message);
        }

        // Clear input
        this.chatInput.value = '';
        this.chatInput.focus();
    }

    addMessage(playerName, message, isLocal = false) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';

        const nameElement = document.createElement('span');
        nameElement.className = 'chat-message-name';
        nameElement.style.color = isLocal ? '#3498db' : '#e74c3c';
        nameElement.textContent = playerName + ': ';

        const textElement = document.createElement('span');
        textElement.className = 'chat-message-text';
        textElement.textContent = message;

        messageElement.appendChild(nameElement);
        messageElement.appendChild(textElement);

        this.chatMessages.appendChild(messageElement);

        // Auto-scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        // Limit message history (keep last 100 messages)
        while (this.chatMessages.children.length > 100) {
            this.chatMessages.removeChild(this.chatMessages.firstChild);
        }
    }

    addSystemMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message chat-system-message';
        messageElement.textContent = message;

        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    clear() {
        this.chatMessages.innerHTML = '';
    }
}
