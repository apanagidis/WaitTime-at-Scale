'use strict';
require('dotenv').config();

// Only 2-3 Twilio environments are used, so using .env file for the account config. 
// If more environments are added in the future, better refactor to pull the account details during runtime
const { TWILIO_ACCOUNT_SID_QA,TWILIO_ACCOUNT_SID_DEV, TWILIO_AUTH_TOKEN_DEV,TWILIO_AUTH_TOKEN_QA, TWILIO_WORKSPACE_SID_DEV, TWILIO_WORKSPACE_SID_QA,REGION,TABLE } =
  process.env;

let twilioAccountConfig = [
  {
    TWILIO_ACCOUNT_SID:TWILIO_ACCOUNT_SID_DEV,
    TWILIO_AUTH_TOKEN:TWILIO_AUTH_TOKEN_DEV,
    TWILIO_WORKSPACE_SID:TWILIO_WORKSPACE_SID_DEV
  },
  {
    TWILIO_ACCOUNT_SID:TWILIO_ACCOUNT_SID_QA,
    TWILIO_AUTH_TOKEN:TWILIO_AUTH_TOKEN_QA,
    TWILIO_WORKSPACE_SID:TWILIO_WORKSPACE_SID_QA
  }
]

let _maxAttempts = 3;

let _retryBaseDelayMs = 250;

let _retryStatusCodes = [
  429
];

let client;

var AWS = require('aws-sdk');
AWS.config.update({region: REGION});
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const dbSet = async (params) => {
  ddb.putItem(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Success", data);
    }
  });
};

const getQueueSids = async (TWILIO_WORKSPACE_SID) => {
  try {
    let queueSids = [];
    const queues = await client.taskrouter
      .workspaces(TWILIO_WORKSPACE_SID)
      .taskQueues.list();
    queues.forEach((tq) => {
      queueSids.push(tq.sid);
    });
    return queueSids;
  } catch (error) {
    console.error('Failed to retrieve list of TaskQueue SIDs.', error);
  }
};
const timer = ms => new Promise(res => setTimeout(res, ms))

// Get wait time per queue
const getWaitTimes = async (sid,TWILIO_WORKSPACE_SID,retryCount) => {
  try {
    let waitTimeObj = {};
        const stats = await client.taskrouter
        .workspaces(TWILIO_WORKSPACE_SID)
        .taskQueues(sid)
        .cumulativeStatistics()
        .fetch();
      const timeElapsed = Date.now();
      const today = new Date(timeElapsed);
      waitTimeObj= {
        sid:sid,
        waittime: stats.waitDurationInQueueUntilAccepted.avg,
        timestamp: today.toISOString(),
      };

      return JSON.stringify(waitTimeObj);
  
  } catch (error) {
    console.error('Failed to retrieve TaskQueue wait times.', error);
    const currentCount = retryCount ? retryCount : 1;
    if (currentCount <= _maxAttempts) {
      await timer(_retryBaseDelayMs * currentCount)
      console.log("retrying ", sid)
      return await getWaitTimes(sid,TWILIO_WORKSPACE_SID, currentCount + 1);
    } else {
      throw new Error(`${error.message}. Max retry attempts exceeded`);
    }
  }
};



module.exports.hello = async (event) => {

  let i=0;
  while (i<twilioAccountConfig.length) {
    if(twilioAccountConfig[i].TWILIO_ACCOUNT_SID && twilioAccountConfig[i].TWILIO_WORKSPACE_SID && twilioAccountConfig[i].TWILIO_AUTH_TOKEN){

        client = require('twilio')(twilioAccountConfig[i].TWILIO_ACCOUNT_SID, twilioAccountConfig[i].TWILIO_AUTH_TOKEN);

        let queueSids;
        let waitTimes = [];
        queueSids = await getQueueSids(twilioAccountConfig[i].TWILIO_WORKSPACE_SID);
        console.log(queueSids);

        for (let index = 0; index < queueSids.length; index++) {
          waitTimes.push(await getWaitTimes(queueSids[index],twilioAccountConfig[i].TWILIO_WORKSPACE_SID));
          console.log("waitTimes", waitTimes)
        }
      
        var params = {
          TableName: TABLE,
          Item: {
            "ID": {
              "S": "WaitTimes"+twilioAccountConfig[i].TWILIO_ACCOUNT_SID
            },
            "data": {
              "S": JSON.stringify(waitTimes)
            }
          }
        };
        const dbRes = await dbSet(params);
      }

    i++;
  }

  return {
    statusCode: 200
  };
};
