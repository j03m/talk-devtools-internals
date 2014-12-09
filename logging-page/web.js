var express = require('express');
var app = express();

app.get('/short', function(req, res){
    res.json({hi:"hi"});
});

app.get('/med', function(req, res){
    setTimeout(function(){
        res.json({hi:"hi"});
    }, 2500)

});

app.get('/long', function(req, res){
    setTimeout(function(){
        res.json({hi:"hi"});
    }, 5000)

});

app.use(express.static(__dirname));

app.listen(8081);