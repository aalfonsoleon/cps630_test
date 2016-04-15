var mongoose = require('mongoose');
var userSchema = mongoose.Schema({
	google: {
		id:String,
		token:String,
		email:String,
		name:String,
		groups:[{groupname: String, groupID: String, viewed: Boolean}],
		notifications: {
			groupNotif: Number,
			meetingNotif: Number,
            groupNotifCount: Number,
			meetingNotifCount: Number
		}
	}
});
module.exports = mongoose.model('User', userSchema);
