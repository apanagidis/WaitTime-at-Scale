'use strict';
require('dotenv').config();
var AWS = require('aws-sdk');


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

AWS.config.update({region: REGION});
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

let _maxAttempts = 8;
// On congested accounts we want to limit the API calls per sec to avoid hitting the account wide limit of 100 calls/s
let maxCallsSec = 10;
let client;

const dbSet = async (params) => {
  ddb.putItem(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Success", data);
    }
  });
};

async function storeToDB(i,waitTimes ){
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

const timer = ms => new Promise(res => setTimeout(res, ms))

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

async function allSettledWithRetry(promises) {
  let results;
  for (let retry = 0; retry < _maxAttempts; retry++) {
    let promiseArray;
    if (results) {
      console.log("retry")
      // This is a retry; fold in results and new promises.
      promiseArray = results.map(
          (x, index) => x.status === "fulfilled"
            ? x.value
            : promises[index]())
    } else {
      // This is the first run; use promiseFactories only.
      promiseArray = promises.map(x => x());
    }
    results = await Promise.allSettled(promiseArray);
    // Avoid unnecessary loops, though they'd be inexpensive.
    if (results.every(x => x.status === "fulfilled")) {
      return results;
    }
    if(_maxAttempts == retry+1){
      console.log("max attempts reached");
      return null;
    }
  }
  return results;
}

const getWaitTimes = async (sid,TWILIO_WORKSPACE_SID) => {
  try {
        const stats =  client.taskrouter
        .workspaces(TWILIO_WORKSPACE_SID)
        .taskQueues(sid)
        .cumulativeStatistics()
        .fetch();
        return stats;
  } catch (error) {
    console.error('Failed to retrieve TaskQueue wait times.', error);
  }
};

module.exports.hello = async (event) => {

  let i=0;
  while (i<twilioAccountConfig.length) {
    if(twilioAccountConfig[i].TWILIO_ACCOUNT_SID && twilioAccountConfig[i].TWILIO_WORKSPACE_SID && twilioAccountConfig[i].TWILIO_AUTH_TOKEN){

        client = require('twilio')(twilioAccountConfig[i].TWILIO_ACCOUNT_SID, twilioAccountConfig[i].TWILIO_AUTH_TOKEN);
        let waitTimesPromises = [];
        // Fetch all queue SIDs for the account
        let queueSids = await getQueueSids(twilioAccountConfig[i].TWILIO_WORKSPACE_SID);

        for (let index = 0; index < queueSids.length; index++) {
          waitTimesPromises.push(() => getWaitTimes(queueSids[index],twilioAccountConfig[i].TWILIO_WORKSPACE_SID));
        }

        let waitTimesStats = [];
        for (let index = 0; index < waitTimesPromises.length; index++) {
            if(index % maxCallsSec == 0 ){
                let temp = await allSettledWithRetry(waitTimesPromises.slice(index,index+maxCallsSec));
                if(!temp){
                  return {
                    statusCode: 500
                  };
                }
                waitTimesStats.push(temp)
                // waiting 1 sec for every maxCallSec to prevent overwhelming the Twilio wide account limit
                timer(1000);
            } 
        }
        let waitTimesStatsFlat = [].concat.apply([], waitTimesStats);

        let waitTimes = [];
        waitTimesStatsFlat.map(element => {
          const timeElapsed = Date.now();
          const today = new Date(timeElapsed);
          let waitTimeObj= {
            sid:element.value.taskQueueSid,
            waittime: element.value.waitDurationInQueueUntilAccepted.avg,
            timestamp: today.toISOString(),
          };
          waitTimes.push(JSON.stringify(waitTimeObj));
        })

        console.log("number of queue results", waitTimes.length)

        await storeToDB(i, waitTimes);
      }

    i++;
  }

  return {
    statusCode: 200
  };
};
