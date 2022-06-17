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
      'ID': {S: 'WaitTimes'+TWILIO_ACCOUNT_SID}
    }
   };

   let queueSid  = event.queueSid || "WQ5684c8ed41bdf26073ffb02a02b2f713"

  // Call DynamoDB to read the item from the table
  ddb.getItem(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      let result = data.Item.data.S;
      let parsedResult = JSON.parse(result);
      console.log("queueSid", queueSid);
      for(var i = 0; i < parsedResult.length; i++)
      {
        if(parsedResult[i]){
          let element = JSON.parse(parsedResult[i]);
      
          if(element && element.sid === queueSid){
            return callback(null, JSON.parse(`{"waittime":"${element.waittime}"}`));
          }
       }
      }
      return callback(null);
    }
  });

};
