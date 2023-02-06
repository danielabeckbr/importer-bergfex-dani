let http = require('http');
let fs = require('fs');

const debug = require("debug")("wetterbug");

debug("before request");

let debugFunction = function(level){
        
    if (level == "warn") {
        console.log("warn!");
    }
    if (level == "info") {
        console.log("info");
    }
    else
    {
        console.log("fine"); 
    }
   }

let handleRequest = (request, response) => {
    response.writeHead(200, {
        'Content-Type': 'text/html'
    });
    fs.readFile('./index.html', null, function (error, data) {
        if (error) {
            response.writeHead(404);
            respone.write('Whoops! File not found!');
        } else {
            response.write(data);
        }
        response.end();
    });
    
};


http.createServer(handleRequest).listen(3000);

let loglevel = "info";
debugFunction(loglevel);