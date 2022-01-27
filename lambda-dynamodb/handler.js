'use strict';
require('dotenv').config();

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WORKSPACE_SID,REGION,TABLE } =
  process.env;
const client = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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

const getQueueSids = async () => {
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

// Get wait time per queue
const getWaitTimes = async (sids) => {
  try {
    let waitTimeObj = { queues: {} };
    for (let index = 0; index < sids.length; index++) {
      const stats = await client.taskrouter
        .workspaces(TWILIO_WORKSPACE_SID)
        .taskQueues(sids[index])
        .cumulativeStatistics()
        .fetch();
      const timeElapsed = Date.now();
      const today = new Date(timeElapsed);
      waitTimeObj.queues[sids[index]] = {
        waittime: stats.waitDurationInQueueUntilAccepted.avg,
        timestamp: today.toISOString(),
      };
    }
    console.log('Queue Wait Times: ', waitTimeObj);
    const queueTimes = JSON.stringify(waitTimeObj);
    return queueTimes;
  } catch (error) {
    console.error('Failed to retrieve TaskQueue wait times.', error);
  }
};

module.exports.hello = async (event) => {
  const queueSids = await getQueueSids();
  const waitTimes = await getWaitTimes(queueSids);
  console.log(queueSids);
  console.log(waitTimes)

  var params = {
    TableName: TABLE,
    Item: {
      "ID": {
        "S": "WaitTimes"
      },
      "data": {
        "S": JSON.stringify(waitTimes)
      }
    }
  };
  const dbRes = await dbSet(params);
  

  return {
    statusCode: 200
  };
};
