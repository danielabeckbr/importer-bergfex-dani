const express = require('express')
const app = express()
const port = 3000

let logManager = {"logLevel": "debug"}

app.get('/', (req, res) => {
    let html = `<!doctype html>
<html>

 <button onclick="check(test)">Check</button>

      <p id="result"></p>

<script>

const report = ["[INFO] (30.03.2023 14:48:00) | Import HR Datatype reports end 30.03.2023 14:48:00 Dauer: 0:00 min",
"[DEBUG] (30.03.2023 14:48:00) | Report: region_schwaben valid_from: 30.03.2023 11:30 already imported!",
"[INFO] (30.03.2023 14:48:00) | Report 'region_schwaben' processing!",
"[DEBUG] (30.03.2023 14:48:00) | Report: region_oberbayern valid_from: 30.03.2023 11:30 already imported!",
"[ERROR] (30.03.2023 14:40:00) | Ich bin ein Fehler 30.03.2023 14:40:00"]

var test = "ERROR";

var check = function(a){
    report.forEach((element) => {
        if (element.includes(a)){
        let myresult = document.createElement("li").innerHTML = element ;
        let list = document.getElementById("result");
        list.append(myresult);
                  }
            });
    };

document.addEventListener('DOMContentLoaded', function () {

    document.levelform.level.addEventListener('change', checkAuswahl, check(level));

 
    function checkAuswahl () {
        var menu = document.levelform.level;
        var level = menu.options[menu.selectedIndex].value;
        // console.log("level: " + level);
        let levelText = level.toUpperCase();
        check(levelText);
        var url = "/setdebuglevel/" + level
        
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open( "GET", url, false ); // false for synchronous request
        xmlHttp.send( null );
        var text = xmlHttp.responseText;
        return text;
        
    }
    
});



    

const url = 'https://api.prod.wetterdaten.hr.de/api/v1/vorhersagen/terminal_br_komplett/V_TERM_BR_AKTUELL';
    
    

    
    fetch(url)
    .then((resp) => resp.json())
      .then(function(data) {
        let wetterArray = [];
    
    for(var item in data){
        
            for(var i in data[item]){
        
                wetterArray.push(data[item][i]);
            }  
        };
    
    wetterArray.sort(function(x, y) {
    
        var firstDate = new Date(x.valid_from),
    
        SecondDate = new Date(y.valid_from);
    
        if (firstDate < SecondDate) return 1;
        if (firstDate > SecondDate) return -1;
    
        return 0;
    
    });
    
    console.log(wetterArray);
    
   
     });
    
    var level = "17"
  

</script>
   <h1>
   XHR POST to Server
   </h1>
   <body>
    <div>Das Wetter</div>
    <ul id="myList"></ul>

    <form name="levelform">
        <label><b>Debug-Level:</b>
        <select id="options1id" name="level" size="1">
           <option value="error">ERROR</option>
           <option value="warn">WARN</option>
           <option value="info">INFO</option>
           <option value="debug">DEBUG</option>
        </select>
        </label>
        </form>

    </body>
    
   </body>
</html>`

    res.send(html)
})

debugger

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

app.get('/setdebuglevel/:dlevel', (req, res) => {

    console.log("Debuglevel changed to: '" + req.params.dlevel + "'")
    logManager.logLevel = req.params.dlevel

    res.send("end")
})