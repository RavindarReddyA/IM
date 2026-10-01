
// Ask for a display name once and fall back to Anonymous when input is blank.
const myName = (prompt('What is your name?') || '').trim() || 'Anonymous';
// Cache the message list so incoming chat entries can be added efficiently.
const messages = document.getElementById('messages');
// Cache the form to intercept submissions and send them over the socket.
const form = document.getElementById('chat-form');
// Cache the text field so the user's message can be read and cleared.
const input = document.getElementById('message-input');
// Cache the send control so it can be disabled while disconnected.
const sendButton = document.getElementById('send-button');
// Cache the status label so connection changes are visible to the user.
const status = document.getElementById('status');

// Connect to the WebSocket endpoint on the same host that served this page.
const socket = new WebSocket(`ws://${location.host}`);

// Centralize rendering so chat and system messages use the same safe path.
function addMessage(text, className) {
  // Create a list item because the chat transcript is displayed as a list.
  const li = document.createElement('li');
  // Use textContent to render message text safely without interpreting HTML.
  li.textContent = text;
  // Apply an optional style to distinguish own, system, or other messages.
  if (className) li.className = className;
  // Add the new entry to the visible transcript.
  messages.appendChild(li);
  // Keep the newest entry in view as the conversation grows.
  messages.scrollTop = messages.scrollHeight;
}

// Render a message from the server or another client in the chat transcript.
function showChatMessage(msg) {
  const isMine = msg.name === myName;
  addMessage(`${msg.name}: ${msg.text}`, isMine ? 'mine' : '');
}

// Enable sending and announce successful connection when the socket opens.
socket.addEventListener('open', () => {
  // Show the current connection state to the user.
  status.textContent = 'Connected';
  // Allow message submission only after the socket is ready.
  sendButton.disabled = false;
  // Add a transcript entry so the user sees that they joined.
  //addMessage('You joined the chat', 'system');
});

// Render each message broadcast by the server as it arrives.
// The server sends both retained history and new messages in the same format.
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'history') {
    // Show the retained messages so the user can catch up on the conversation.
    data.messages.forEach(showChatMessage);
    // Add a transcript entry so the user sees that they joined.
    addMessage('You joined the chat', 'system');
  } else if (data.type === 'message') {
    // Show the new message so the user sees what others are saying in real time.
    showChatMessage(data);
  }
});

// Update the interface and explain how to restore service after disconnect.
socket.addEventListener('close', () => {
  // Make the lost connection visible rather than leaving stale status.
  status.textContent = 'Disconnected';
  // Prevent sends that would fail because the socket is no longer open.
  sendButton.disabled = true;
  // Tell the user to refresh because automatic reconnection is not implemented.
  addMessage('Connection lost. Refresh to reconnect.', 'system');
});

// Handle form submission locally instead of allowing a browser page reload.
form.addEventListener('submit', (event) => {
  // Preserve the live chat session by cancelling the form's default navigation.
  event.preventDefault();
  // Remove surrounding whitespace before deciding what to send.
  const text = input.value.trim();
  // Ignore empty submissions so the server only receives meaningful messages.
  if (!text) return;
  // Send the name and message as JSON in the format expected by the server.
  socket.send(JSON.stringify({ name: myName, text }));
  // Clear the field immediately so it is ready for the next message.
  input.value = '';
  // Return keyboard focus to the input for quick consecutive messages.
  input.focus();
});