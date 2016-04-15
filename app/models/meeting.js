var mongoose = require('mongoose');
var MeetingSchema = mongoose.Schema({
    name: String,
    moderator: String,
    final: Boolean,
    startDay: String,
    endDay:String,
    startTime:String,
    endTime:String,
    timeMin:String,
    timeMax:String,
    duration: Number,
    location: String,
    meetingMembers:[String],
    membersAccepted: [{email: String, busy: Array}],
    group: String,
    submittedUsers:[String]
});
module.exports = mongoose.model('Meeting', MeetingSchema);
