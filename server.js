/*
	SERVER.JS
*/
// import all the modules needed in app
// used from our dependencies list in package.json


var express = require('express');
var morgan = require('morgan');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var passport = require('passport');
var flash = require('connect-flash');

// connect to to our database using the mlab.com credentials
var configDB = require('./config/database.js');
mongoose.connect(configDB.url);
//passport
require('./config/passport.js')(passport);
//initialize app
var app = express();
//set port to 8000 ---TAKE OUT LATER WHEN
var port = process.env.PORT || 8000;

app.use("/public",express.static(__dirname + "/public"));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: false}));
app.use(session({secret: 'freetime',
				saveUninitialized: true,
				resave: true}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.set('view engine','ejs');
require('./app/routes.js')(app,passport);

app.listen(port);
console.log('Server running on port: ' + port);
