/*
	ROUTE.JS
		Responsible for the routing of our app.
		(The sequence of how we get from page to page)
*/

//load our user and group models
var User = require('./models/user');
var Group = require('./models/group');
var Meeting = require('./models/meeting');
var configAuth = require('./../config/auth');
//-- UNSURE HOW TO USE GOOGLE CALENDER MODULE AT THE MOMENT
var google = require('googleapis');
var GoogleStrategy  = require('passport-google-oauth').OAuth2Strategy;
var gcal = require('google-calendar');
var dateFormat = require('dateformat');
require('datejs');


module.exports = function(app, passport){
//HOME PAGE

	app.get('/', function(req,res){
		res.render("index.ejs");
	});

//PROFILE PAGE
    
	app.get('/profile',isLoggedIn,function(req,res){
        //get all the emails of every user in the db
        User.find().distinct('google.email', function (err, userEmails) {
            res.render('profile.ejs',{user: req.user, userList:userEmails});
        });
	});
	
	app.get('/resetgroupNotifs', function(req,res) {
		var user = req.user;
		user.google.notifications.groupNotifCount = 0;
		user.save();
		res.render('profile.ejs', {user: req.user});
	});
    
    app.get('/resetmeetingNotifs', function(req,res) {
		var user = req.user;
		user.google.notifications.meetingNotifCount = 0;
		user.save();
		res.render('profile.ejs', {user: req.user});
	});
	

	//When the user clicks button to create form
	app.post('/profile',function(req,res){
		//Get form data
		var user = req.user;
		var groupName = req.body.groupName;
        var groupEmails = req.body.groupEmails.split(",");
		var userEmail = req.user.google.email;
		//Create a new group
		var newGroup = new Group();
		newGroup.name = groupName;
		newGroup.members.push(userEmail);

        for(i=0; i<groupEmails.length; i++){
			newGroup.members.push(groupEmails[i]);

			//Send group notification to users in group
			User.findOne({"google.email": groupEmails[i]}, function (err, groupMember){
				if (err)
					return done(err);
				else
					groupMember.google.notifications.groupNotif += 1;
                    groupMember.google.notifications.groupNotifCount += 1;
					groupMember.save();
			});
        }

		//save the Group
		newGroup.save(function(err){
			if(err){
				console.log(err);
			} else {
				//once group is saved add the group to the users list of groups.
				user.google.groups.push({groupname: groupName,groupID: newGroup.id});
				user.save();

				for(i=0; i<groupEmails.length; i++) {
					User.findOne({"google.email": groupEmails[i]}, function (err, groupMember){
						if (err)
							return done(err);
						else
						{
							groupMember.google.groups.push({groupname: groupName,groupID: newGroup.id});
							groupMember.save();
						}
					});
				}
				//go to the groupProfile page. (use group's id in url)
				res.redirect('/groupProfile/'+newGroup.id);
			}
    	});
	});
	
	//Remove the current user from the database
		app.post('/deleteAccount', function(req, res){
			var user = req.user;
			var groups = user.google.groups;
			var userToRemove = req.user.google.email;

			//First, remove the user from all the groups they are apart of
			
			for (var i=0; i<groups.length; i++){
				//Find group to remove user from, using groupID
				Group.findById(groups[i].groupID, function(err, group) {
					var members = group.members;
					var index = members.indexOf(userToRemove);
					
					//If there are only 2 people inside the group that the
					//current user wants to leave
					if (members.length < 3){
						//Remove all meetings relating to group, if any
						if (group.meetings.length > 0) {
							for (var i=0; i<group.meetings.length; i++) {
								Meeting.find({"_id": group.meetings[i].meetingID}).remove().exec();
							}
						}
						
						//Remove the group to be removed from each user's
						//list of groups
						for (var i=0; i<members.length; i++) {
							//Find the user, and loop through their groups
							//till you find the group to be removed, and 
							//remove it
							User.findOne({"google.email": members[i]}, function (err, groupMember){	
								var currMemberGroups = groupMember.google.groups;
								for (var j=0; j<currMemberGroups.length; j++) {
									if (groupMember.google.groups[j].groupID == groupID){
										groupMember.google.groups.splice(j, 1);
										groupMember.save();
										break;
									}
								}
								
							});
							//Delete the group from the database
							Group.find({"_id": group.id}).remove().exec();
						}
					}
				
					else {
						//First, remove the user from the meetings
						//associated with the group
						
						//If there are meetings for this group
						if (group.meetings.length > 0) {
							//For each meeting, remove the user from all relevant
							//parts of meeting
							for (var i=0; i<group.meetings.length; i++) {
								Meeting.findOne({"_id": group.meetings[i].meetingID}, function (err, meeting) {
									var meetingMembers = meeting.meetingMembers;
									var membersAccepted = meeting.membersAccepted;
									var mIndex = meetingMembers.indexOf(userToRemove);
									
									//Remove the user from the meetingMembers array
									meetingMembers.splice(mIndex, 1);
									
									//If user is moderator, remove user from meetingMembers, 
									//set a new moderator
									if (meeting.moderator == userToRemove) {
										meeting.moderator = meetingMembers[0];
									}				
									
									
									//If the membersAccepted array is not empy
									//check for the user and remove info
									if (meeting.membersAccepted.length > 0) {
										for (var j=0; j<meeting.membersAccepted.length; j++) {
											if (membersAccepted[j].email == userToRemove) {
												membersAccepted.splice(j, 1);
												break;
											}
										}
									}
									meeting.meetingMembers = meetingMembers;
									meeting.membersAccepted = membersAccepted;
									meeting.save();
									
								});
							}
						}
					
						//Second, remove the user from relevant group info
						members.splice(index, 1);
						group.members = members;
						group.save();
						
					}
				});
			}
			
			//Remove User from database, effectively deleting user's FreeTime account
			User.find({"google.email": user.google.email}).remove().exec();
			res.redirect('/');

		});

	// GROUP PROFILE PAGE
		app.get('/groupProfile/:groupID',isLoggedIn,function(req,res){
		// get the group ID from the url parameter
		var groupID = req.params.groupID;
		var user = req.user;
		// using the groupID find the corresponding group in our database
			// so that we can use that information on the page ect.
		Group.findById(groupID, function(err,group){
				// load our groupProfile template using the group found in query.
				res.render('groupProfile.ejs',{group: group, user: user});
			});
		});

		// get and use information when user creates a new meeting request
		app.post('/groupProfile/:groupID',isLoggedIn,function(req,res){
			var groupID = req.params.groupID;
			Group.findById(groupID, function(err,group){
				var  newMeeting = new Meeting();

				//Parse Date
				var start = req.body.dateMin.split("/");
				var end = req.body.dateMax.split("/");
				//Start dates
				var startmonth = parseInt(start[0]);
				var startday = parseInt(start[1]);
				var startyear = parseInt(start[2]);
				//End dates
				var endmonth = parseInt(end[0]);
				var endday = parseInt(end[1]);
				var endyear = parseInt(end[2]);

				var beginTime = req.body.timeMin;
				var endTime =  req.body.timeMax;
				var beginSplit = beginTime.split(":");
				var endSplit = endTime.split(":");
				var beginHour = parseInt(beginSplit[0]);
				var beginMinute;
					//If minutes is '0', make it '00', else leave it as is
					if(parseInt(beginSplit[1].substring(0,2)) == 0) {
						beginMinute = "00";
					}
					else
						beginMinute = parseInt(beginSplit[1].substring(0,2));
				var zeroSeconds = "00";
				var beginFinal;

				var endHour = parseInt(endSplit[0]);
				var endMinute;
					//If minutes is '0', make it '00', else leave it as is
					if(parseInt(endSplit[1].substring(0,2)) == 0) {
						endMinute = "00";
					}
					else
						endMinute = parseInt(endSplit[1].substring(0,2));
				var endFinal;

				var beginTimeOfDay = beginSplit[1].charAt(beginSplit[1].length - 2);
				var endTimeOfDay = endSplit[1].charAt(endSplit[1].length - 2);

				//Freebusy query should be in the form: '2016-02-29T10:30:00.0z

				if (parseInt(startmonth) < 10){
					startmonth = "0" + startmonth;
				}

				if (parseInt(startday) < 10){
					startday = "0" + startday;
				}

				if (parseInt(endmonth) < 10){
					endmonth = "0" + endmonth;
				}

				if (parseInt(endday) < 10){
					endday = "0" + endday;
				}
				//Parse date so query can work
				if (endTimeOfDay == 'a' && endHour == 12){
					var finishTime = "00" + ":" + endMinute;
					endFinal = finishTime + ":" + zeroSeconds;

				}

				else if(endTimeOfDay == 'a' && endHour > 9 && endHour < 12){
					var finishTime = endHour + ":" + endMinute;
					endFinal = finishTime + ":" + zeroSeconds;
				}
				else if(endTimeOfDay == 'p' && endHour == 12){
					var finishTime = endHour + ":" + endMinute;
					endFinal = finishTime + ":" + zeroSeconds;
				}


				else if(endTimeOfDay == 'p' && endHour < 12){
					endHour = endHour + 12;
					var finishTime = endHour + ":" + endMinute;
					endFinal = finishTime + ":" + zeroSeconds;
				}

				else  {
					var finishTime = "0" + endHour + ":" + endMinute;
					endFinal = finishTime + ":" + zeroSeconds;
				}

				//Now do the startTime
				if (beginTimeOfDay == 'a' && beginHour == 12){
					var startTime = "00" + ":" + beginMinute;
					beginFinal = startTime + ":" + zeroSeconds;
				}

				else if(beginTimeOfDay == 'a' && beginHour > 9 && beginHour < 12){
					var startTime = beginHour + ":" + beginMinute;
					beginFinal = startTime + ":" + zeroSeconds;
				}

				else if(beginTimeOfDay == 'p' && beginHour == 12){
					var startTime = beginHour + ":" + beginMinute;
					beginFinal = startTime + ":" + zeroSeconds;
				}

				else if(beginTimeOfDay == 'p' && beginHour < 12){
					beginHour = beginHour + 12;
					var startTime = beginHour + ":" + beginMinute;
					beginFinal = startTime + ":" + zeroSeconds;

				}

				else {
					var startTime = "0" + beginHour + ":" + beginMinute;
					beginFinal = startTime + ":" + zeroSeconds;
				}


				var fbTimeMin = startyear +"-"+startmonth+"-" +startday+"T"+beginFinal+".0z";
				var fbTimeMax = endyear +"-"+endmonth+"-" +endday+"T"+endFinal+".0z";
                newMeeting.timeMax = fbTimeMax;
                newMeeting.timeMin = fbTimeMin;
                newMeeting.name = req.body.meetingName;
                newMeeting.startDay = req.body.dateMin;
                newMeeting.endDay = req.body.dateMax;
                newMeeting.startTime = startTime;
                newMeeting.endTime = finishTime;
                newMeeting.group = groupID;
                newMeeting.meetingMembers = group.members;
                newMeeting.duration = req.body.meetingDuration;
                newMeeting.location = req.body.meetingLocation;
                newMeeting.moderator = req.user.google.email;
                newMeeting.final = false;
				newMeeting.save(function(err){
					if(err){
						console.log(err);
					} else {
						group.meetings.push({meetingName: newMeeting.name, startDay: newMeeting.startDay, endDay: newMeeting.endDay, startTime: newMeeting.startTime, endTime: newMeeting.endTime, meetingID:newMeeting.id});
						group.save();
                        //Members Emails that are in the meeting
                        var meetingEmails = newMeeting.meetingMembers;
                        for(i=0; i<meetingEmails.length; i++){
                            //Send group notification to users in meeting
                            User.findOne({"google.email": meetingEmails[i]}, function (err, meetingMember){
                                if (err)
                                    return done(err);
                                else
                                    meetingMember.google.notifications.meetingNotif += 1;
                                    meetingMember.google.notifications.meetingNotifCount += 1;
                                    meetingMember.save();
                            });
                        }
						res.redirect('/meetingPage/' + groupID +"/" + newMeeting.id);
					}
				});
			});
		});

		//Remove user from group 
		app.post('/leaveGroup/:groupID', function (req, res) {
			var groupID = req.params.groupID;
			var userToRemove = req.user.google.email;
			var user = req.user;
			var userGroups = user.google.groups;
			
			//Find group to remove user from, using groupID
			Group.findById(groupID, function(err, group) {
				var members = group.members;
				var index = members.indexOf(userToRemove);
				
				//If there are only 2 people inside the group that the
				//current user wants to leave
				if (members.length < 3){
					//Remove all meetings relating to group, if any
					if (group.meetings.length > 0) {
						for (var i=0; i<group.meetings.length; i++) {
							Meeting.find({"_id": group.meetings[i].meetingID}).remove().exec();
						}
					}
					
					//Remove the group to be removed from each user's
					//list of groups
					for (var i=0; i<members.length; i++) {
						//Find the user, and loop through their groups
						//till you find the group to be removed, and 
						//remove it
						User.findOne({"google.email": members[i]}, function (err, groupMember){	
							var currMemberGroups = groupMember.google.groups;
							for (var j=0; j<currMemberGroups.length; j++) {
								if (groupMember.google.groups[j].groupID == groupID){
									groupMember.google.groups.splice(j, 1);
									groupMember.save();
									break;
								}
							}
							
						});
						//Delete the group from the database
						Group.find({"_id": group.id}).remove().exec();
					}
				}
			
				else {
					//First, remove the user from the meetings
					//associated with the group
					
					//If there are meetings for this group
					if (group.meetings.length > 0) {
						//For each meeting, remove the user from all relevant
						//parts of meeting
						for (var i=0; i<group.meetings.length; i++) {
							Meeting.findOne({"_id": group.meetings[i].meetingID}, function (err, meeting) {
								var meetingMembers = meeting.meetingMembers;
								var membersAccepted = meeting.membersAccepted;
								var mIndex = meetingMembers.indexOf(userToRemove);
								
								//Remove the user from the meetingMembers array
								meetingMembers.splice(mIndex, 1);
								
								//If user is moderator, remove user from meetingMembers, 
								//set a new moderator
								if (meeting.moderator == userToRemove) {
									meeting.moderator = meetingMembers[0];
								}				
								
								
								//If the membersAccepted array is not empy
								//check for the user and remove info
								if (meeting.membersAccepted.length > 0) {
									for (var j=0; j<meeting.membersAccepted.length; j++) {
										if (membersAccepted[j].email == userToRemove) {
											membersAccepted.splice(j, 1);
											break;
										}
									}
								}
								meeting.meetingMembers = meetingMembers;
								meeting.membersAccepted = membersAccepted;
								meeting.save();
								
							});
						}
					}
				
					//Second, remove the user from relevant group info
					members.splice(index, 1);
					group.members = members;
					group.save();
					
					//Last, remove the group from the user's
					//list of groups
					for (var x=0; x<user.google.groups.length;x++) {
						if (userGroups[x].groupID == groupID){
							userGroups.splice(x, 1);
							user.google.groups = userGroups;
							user.save();
							break;
						}
					}
				}
			});
			
			res.redirect('/profile');
		});

		// WHEN USER GENERATES THIER FREEBUSY QUERY ADD IT TO THE DATABASE
		app.post('/getauth/:meetingID', function (req, res) {
			var meetingID = req.params.meetingID;
			var userBusy = req.body.busy;
			var userEmail = req.user.google.email;

			Meeting.findById(meetingID, function(err,meeting){
				meeting.membersAccepted.push({email:userEmail, busy: userBusy});
				meeting.save();
			});
		});

	//MEETING PAGE
	app.get('/meetingPage/:groupID/:meetingID',isLoggedIn,function(req,res){
		var groupID = req.params.groupID;
		var meetingID = req.params.meetingID;
		var user = req.user;
		Meeting.findById(meetingID, function(err,meeting){
			// load our meetingPage template using the meeting found in query.

            var start = new Date(meeting.timeMin);
            start = dateFormat(start, "dddd, mmmm dS, yyyy, h:MM:ss TT");
            console.log(start);
            var end = new Date(meeting.timeMax);
            end = dateFormat(end, "dddd, mmmm dS, yyyy, h:MM:ss TT");
            res.render('meetingPage.ejs',{meeting: meeting, user: user, groupID: groupID, start: start, end: end});
        });

	});
	
	//Removal of a user from a meeting
	app.post('/removeMeeting/:groupID/:meetingID', function(req,res) {
		var user = req.user;
		var meetingID = req.params.meetingID;
		var groupID = req.params.groupID;
		var userToRemove = user.google.email;
		
		Meeting.findById(meetingID, function (err, meeting){
			var meetingMems = meeting.meetingMembers;
			var acceptedMems = meeting.membersAccepted;
			var index = meetingMems.indexOf(userToRemove);
			meetingMems.splice(index, 1);
			
			//If there were only 2 people scheduled for the meeting
			if (meetingMems.length < 2)
			{
				//Search for the group that the meeting is in
				Group.findById(groupID, function (err, group) {
					var meetingsForGroup = group.meetings;
					
					//Remove the meeting from the group's list of meetings
					for (var i=0; i<meetingsForGroup.length; i++) {
							if (meetingsForGroup[i].meetingID == meetingID) {
								group.meetings.splice(i, 1);
								break;
							}
					}	
					group.save();

				});
				
				//Delete the meeting and save the updated group info
				Meeting.find({"_id": meeting.id}).remove().exec();
			}
			
			//Else just remove the user's info from the meeting
			else { 
				//If user is moderator, remove user from meetingMembers, 
				//set a new moderator
				if (meeting.moderator == userToRemove) {
					meeting.moderator = meetingMems[0];
				}
				
				//If a member of the meeting has authorized calendar access,
				//check to see if it is the current user, and remove the info
				if (acceptedMems.length > 0) {
					for  (var k=0; k<acceptedMems.length; k++) {
						if (acceptedMems[k].email == userToRemove) {
							acceptedMems.splice(k, 1);
							break;
						}
					}
				}
				
				meeting.meetingMembers = meetingMems;
				meeting.acceptedMembers = acceptedMems;
				meeting.save();
			}
			
		});
		
		res.redirect('/profile');

	});
	
	//Removal of a user from a meeting
	app.post('/removeMeeting/:groupID/:meetingID', function(req,res) {
		var user = req.user;
		var meetingID = req.params.meetingID;
		var groupID = req.params.groupID;
		var userToRemove = user.google.email;
		
		Meeting.findById(meetingID, function (err, meeting){
			var meetingMems = meeting.meetingMembers;
			var acceptedMems = meeting.membersAccepted;
			var index = meetingMems.indexOf(userToRemove);
			meetingMems.splice(index, 1);
			
			//If there were only 2 people scheduled for the meeting
			if (meetingMems.length < 2)
			{
				//Search for the group that the meeting is in
				Group.findById(groupID, function (err, group) {
					var meetingsForGroup = group.meetings;
					
					//Remove the meeting from the group's list of meetings
					for (var i=0; i<meetingsForGroup.length; i++) {
							if (meetingsForGroup[i].meetingID == meetingID) {
								group.meetings.splice(i, 1);
								break;
							}
					}	
					group.save();

				});
				
				//Delete the meeting and save the updated group info
				Meeting.find({"_id": meeting.id}).remove().exec();
			}
			
			//Else just remove the user's info from the meeting
			else { 
				//If user is moderator, remove user from meetingMembers, 
				//set a new moderator
				if (meeting.moderator == userToRemove) {
					meeting.moderator = meetingMems[0];
				}
				
				//If a member of the meeting has authorized calendar access,
				//check to see if it is the current user, and remove the info
				if (acceptedMems.length > 0) {
					for  (var k=0; k<acceptedMems.length; k++) {
						if (acceptedMems[k].email == userToRemove) {
							acceptedMems.splice(k, 1);
							break;
						}
					}
				}
				
				meeting.meetingMembers = meetingMems;
				meeting.acceptedMembers = acceptedMems;
				meeting.save();
			}
			
		});
		
		res.redirect('/profile');

	});


//getFreetime page - displays possible meeting times
app.get('/getFreetime/:meetingID',isLoggedIn,function(req,res){
    //Find the days between start and end intervals
    var meetingID = req.params.meetingID;
    Meeting.findById(meetingID, function(err, meeting){
        // n = the difference in days (including the end day)
        var oneDay = 24*60*60*1000;
        var firstDate = new Date(meeting.startDay);
        var secondDate = new Date(meeting.endDay);
        var diffDays = Math.abs((firstDate.getTime() - secondDate.getTime())/(oneDay)) + 1;

       /*  Create array representing every hour of each day within start and end intervals.
            true = no group member is busy during that hour
            false = at least one group member is busy during that hour
       */
        var n = diffDays * 24;
        var totalHours = [];
        for(var i = 0; i < n; i++){
            totalHours[i] = true;
        }

        // set all the hours prior to the starting hour to false
        var startTime = meeting.startTime;
        var startHour = startTime.substring(0,2);
        for(var i = 0; i < startHour; i++){
            totalHours[i]= false;
        }

        // set all the hours after the ending hour to false
        var endTime = meeting.endTime;
        var endHour = endTime.substring(0,2);
        var endHour = parseInt(endHour) + ((diffDays - 1) * 24);
        for(var i = n-1; i >= endHour; i--){
            totalHours[i]= false;
        }

        //go through each user's busy time and set value to false when necessary
        numberOfMembers = meeting.membersAccepted.length;
        for(var i = 0; i < numberOfMembers; i++){
            numberOfEvents = meeting.membersAccepted[i].busy.length;
            for(var j = 0; j < numberOfEvents; j++ ) {
                // get the start and end time of that event
                // separate it into two parts -> date and time
                // splits the string at the T
                // [0] = the date
                // [1] = the time
                s = meeting.membersAccepted[i].busy[j].start.split("T");
                e = meeting.membersAccepted[i].busy[j].end.split("T");

                // START
                s[0] = new Date(s[0]);
                diffDays = Math.round(Math.abs((firstDate.getTime() - s[0].getTime())/(oneDay)));
                // [0] = hour
                // [1] = min

                var sTime = s[1].substring(0,5).split(":");
                var sHour = parseInt(sTime[0]);
                var sMin = parseInt(sTime[1]);
                var sTakeOut = sHour + (diffDays * 24);

                // END
                e[0] = new Date(e[0]);
                diffDays = Math.round(Math.abs((firstDate.getTime() - e[0].getTime())/(oneDay)));
                // [0] = hour
                // [1] = min
                var eTime = e[1].substring(0,5).split(":");
                var eHour = parseInt(eTime[0]);
                var eMin = parseInt(eTime[1]);
                if(eMin > 0){
                    eHour = eHour + 1;
                }
                var eTakeOut = eHour + (diffDays * 24);
                for(var k = sTakeOut; k <= eTakeOut; k++){
                    totalHours[k] = false;
                }
            }
        }
        var startArray= [];
        var endArray = [];
        for(var i = 0; i < n; i++) {
            if(totalHours[i] == true){
                startArray.push(i);
                for(var j = i; j < n; j++){
                    if(totalHours[j] == false || j == (n-1)){
                        endArray.push(j-1);
                        i = j;
                        break;
                    }

                }
            }
        }
        var startDayArray = [];
        var endDayArray = [];

        for(var i = 0; i < startArray.length; i++){
            //duration check
            var sHour = startArray[i];
            var eHour = endArray[i];
            var duration = meeting.duration;
            if((eHour - sHour) >= duration){
                //START: Transform into Day String
                var sDaysAway = Math.floor(sHour/24);
                sHour = sHour - (sDaysAway * 24);
                var fDate = new Date(meeting.startDay);
                var sDay = fDate.addDays(sDaysAway).addHours(sHour);
                sDay = sDay.toString().substring(0,21);
                sDayHour = parseInt(sDay.substring(15,18));
                var sDayHour_String;
                if(sDayHour == 0){
                    sDayHour_String = "12:00AM";
                } else if (sDayHour > 0 && sDayHour < 13){
                    sDayHour_String = sDayHour +":00AM";
                } else {
                    sDayHour = sDayHour - 12;
                    sDayHour_String = sDayHour + ":00PM";
                }
                sDay_String = sDay.substring(0,15);
                sFinal = sDay_String + " " + sDayHour_String;
                startDayArray.push(sFinal);

                var eDaysAway = Math.floor(eHour/24);
                eHour = eHour - (eDaysAway * 24);
                var fDate = new Date(meeting.startDay);
                var eDay = fDate.addDays(eDaysAway).addHours(eHour);
                eDay = eDay.toString().substring(0,21);
                eDayHour = parseInt(eDay.substring(15,18)) + 1;
                var eDayHour_String;
                if(eDayHour == 0){
                    eDayHour_String = "12:00AM";
                } else if (eDayHour > 0 && eDayHour < 13){
                    eDayHour_String = eDayHour +":00AM";
                } else {
                    eDayHour = eDayHour - 12;
                    eDayHour_String = eDayHour + ":00PM";
                }
                eDay_String = eDay.substring(0,15);
                eFinal = eDay_String + " " + eDayHour_String;

                endDayArray.push(eFinal);
            }
        }
        res.render('getFreetime.ejs',{startDays: startDayArray, endDays: endDayArray, user: req.user, meeting: meeting});
        /*
        for(var i = 0; i < startDayArray.length; i++){
                console.log("Possible Meeting Slot: " + i);
                console.log("START TIME: " + startDayArray[i]);
                console.log("END TIME:  " + endDayArray[i]);
        }
        */
       // for(var i = 0; i < n; i++) {
         //   console.log(i + " " + totalHours[i]);
       // }
    });
    /*
     When moderator submits a final meeting time for the group.
     */
    app.post('/getFreetime/:meetingID',function(req,res){

        var meetingID = req.params.meetingID;
        var start = req.body.MeetingTime;



        Meeting.findById(meetingID, function(err, meeting){
            meeting.final = true;
            start = new Date(start);
            var temp = start;
            temp = temp.toString(("yyyy-MM-ddTHH:mm:ss"));
            temp = temp + "-04:00";

            var end = start.addHours(meeting.duration).toString("yyyy-MM-ddTHH:mm:ss");
            end = end + "-04:00" ;
            meeting.timeMin = temp;
            meeting.timeMax = end;
            meeting.save();
            res.redirect('/getFreetime/'+meetingID+"/submit");

        });


    });

    app.get('/getFreetime/:meetingID/submit',isLoggedIn,function(req,res) {
        var startDayArray = [];
        var endDayArray = [];
        var meetingID = req.params.meetingID;
        Meeting.findById(meetingID, function(err, meeting){
            res.render('getFreetime.ejs',{startDays: startDayArray, endDays: endDayArray, user: req.user, meeting: meeting});
        });
    })

    app.post('/submitted/:meetingID',function(req,res) {
        var startDayArray = [];
        var endDayArray = [];
        var meetingID = req.params.meetingID;
        Meeting.findById(meetingID, function(err, meeting){
            meeting.submittedUsers.push(req.user.google.email);
            meeting.save();
            res.redirect('/getFreetime/'+meetingID);
        });
    })

});




//LOGOUT
    // when the user clicks the logout button:
    // logout session and send them back to hoome page.
    app.get('/logout',function(req, res){
        req.logout();
        res.redirect('/');

    });



    // =====================================
    // GOOGLE ROUTES =======================
    // =====================================
    // send to google to do the authentication
    // profile gets us their basic information including their name
    // email gets their emails
    // also ask permission to use google calendar API.
    app.get('/auth/google', passport.authenticate('google', { scope : ['profile', 'email', 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar'] }));
    // the callback after google has authenticated the user
    app.get('/auth/google/callback',
        passport.authenticate('google', {
            successRedirect : '/profile',
            failureRedirect : '/'
        }));
}


//Check to make sure the user is logged in before moving on to next step.
function isLoggedIn(req,res,next){
    if(req.isAuthenticated())
        return next();
    res.redirect('/');
}
