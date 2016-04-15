var mongoose = require('mongoose');
var groupSchema = mongoose.Schema({
		name: String,
		members: [String],
		//members: [{email: String, name:String}],
		meetings:[{meetingName:String, meetingID:String}]
});
module.exports = mongoose.model('Group', groupSchema);
