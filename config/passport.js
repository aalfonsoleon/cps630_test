/* 
config/passport.js
    Responsible for :
        authenticating the user
        grant app permission to use the user's account info and access calendar.
*/

// load all the things we need
var GoogleStrategy  = require('passport-google-oauth20').Strategy;
var configAuth = require('./auth');

// load the user and group model
var User            = require('../app/models/user');
var Group = require('../app/models/user'); 

//EXPORT
module.exports = function(passport) {
    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session

    // used to serialize the user for the session
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });

    // used to deserialize the user
    passport.deserializeUser(function(id, done) {
        User.findById(id, function(err, user) {
            done(err, user);
        });
    });


    // =========================================================================
    // GOOGLE ==================================================================
    // =========================================================================
    passport.use(new GoogleStrategy({
        clientID        : configAuth.googleAuth.clientID,
        clientSecret    : configAuth.googleAuth.clientSecret,
        callbackURL     : configAuth.googleAuth.callbackURL,

    },
    function(token, refreshToken, profile, done) {
        // make the code asynchronous
        // User.findOne won't fire until we have all our data back from Google
        process.nextTick(function() {
            // try to find the user based on their google id
            User.findOne({ 'google.id' : profile.id }, function(err, user) {
                if (err)
                    return done(err);
                if (user) {
                    // if a user is found, log them in
                    return done(null, user);
                } else {
                    // if the user isnt in our database, create a new user
                    var newUser          = new User();
                    // set all of the relevant information
                    newUser.google.id    = profile.id;
                    newUser.google.token = token;
                    
                    newUser.google.name  = profile.displayName;
                    newUser.google.email = profile.emails[0].value; // pull the first email
					newUser.google.notifications.groupNotif = 0;
					newUser.google.notifications.meetingNotif = 0;
                    newUser.google.notifications.groupNotifCount = 0;
					newUser.google.notifications.meetingNotifCount = 0;
                    // save the user
                    newUser.save(function(err) {
                        if (err)
                            throw err;
                        return done(null, newUser);
                    });
                }
            });
        });

    }));
};