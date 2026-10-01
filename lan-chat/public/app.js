const messages = document.getElementById('messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const status = document.getElementById('status');

const socket = new WebSocket(`ws://${location.host}`);

function addMessage(text, className) {
  const li = document.createElement('li');
  li.textContent = text;
  if (className) li.className = className;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

socket.addEventListener('open', () => {
  status.textContent = 'Connected';
  sendButton.disabled = false;
  addMessage('You joined the chat', 'system');
});

socket.addEventListener('message', (event) => {
  addMessage(event.data);
});

socket.addEventListener('close', () => {
  status.textContent = 'Disconnected';
  sendButton.disabled = true;
  addMessage('Connection lost. Refresh to reconnect.', 'system');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  socket.send(text);
  input.value = '';
  input.focus();
});