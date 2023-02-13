
const express = require('express');
const app = express();
const path = require("path");

app.get('/', (req,res) => {
  res.send("hello");
});


app.get('/router1', function (req, res) {
  res.sendFile(path.join(__dirname,'/index.html'));
});

app.get('/about', function (req, res) {
  res.send("about what?");
});

const url = 'https://api.prod.wetterdaten.hr.de/api/v1/vorhersagen/terminal_br_komplett/V_TERM_BR_AKTUELL';

fetch(url)
.then((resp) => resp.json())
  .then(function(data) {
console.log(data);
    console.log(data);
  });

app.listen(process.env.port || 3000);
console.log('Web Server is listening at port '+ (process.env.port || 3000));
const app = express();

app.get("'/', function (req, res) {

let html="./index.html"

res.send(html);
});