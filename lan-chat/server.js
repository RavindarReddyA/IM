const express = require('express');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.static('public'));

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://192.168.1.185:${PORT}`);
});