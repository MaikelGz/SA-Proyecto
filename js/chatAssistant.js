document.addEventListener("DOMContentLoaded", () => {
    const chatMessages = document.getElementById('chatbot-messages');
    const chatInput = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send-btn');

    sendBtn.addEventListener('click', () => handleUserMessage());
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUserMessage();
    });

    async function handleUserMessage() {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        appendMessage('user', userMessage);
        chatInput.value = '';

        appendMessage('bot', 'Pensando...');

        // Obtener la región seleccionada de la página
        const selectedRegion = window.selectedRegionDisplayName || 
                               document.getElementById('selected-region-name')?.textContent || 
                               "Región no especificada";

        try {
            const response = await fetch('http://localhost:5000/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: userMessage,
                    region: selectedRegion
                })
            });

            const data = await response.json();
            updateLastBotMessage(data.answer || "No pude entender la consulta.");
        } catch (err) {
            updateLastBotMessage("Error al contactar con el asistente IA.");
        }
    }

    function appendMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.innerHTML = `<p>${text}</p>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateLastBotMessage(newText) {
        const messages = chatMessages.querySelectorAll('.bot-message');
        if (messages.length) {
            messages[messages.length - 1].innerHTML = `<p>${newText}</p>`;
        }
    }
});

