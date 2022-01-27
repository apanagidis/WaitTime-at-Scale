require('dotenv').config();
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,REGION,TABLE } =
    process.env;    
var AWS = require('aws-sdk');
AWS.config.update({region: REGION});
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});


exports.handler = async (context, event, callback) => {

  const client = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  var params = {
    TableName: TABLE,
    Key: {
      'ID': {S: 'WaitTimes'}
    }
   };

   let queueSid  = event.queueSid || "WQ6fb132030549e0358227ebf5c439559f"

  // Call DynamoDB to read the item from the table
  ddb.getItem(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      let result = data.Item.data.S;
      let parsedResult= JSON.parse(JSON.parse(result));
      let time = parsedResult.queues[queueSid]['waittime']
      return callback(null, JSON.parse(`{"waittime":"${time}"}`));

    }
  });

};
