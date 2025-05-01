const express = require('express')
const app = express()

const PORT = 8080

app.post('/wechat', (req, res) => {
    res.send('OK');
  });


app.listen(PORT, () => {
    console.log(`Server has started on : ${PORT}`)
})
