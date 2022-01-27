# Twilio TaskRouter TaskQueue Wait Times

## Overview

The purpose of this project is to address the need for a high volume contact center to calculate wait times within the Twilio TaskRouter ecosystem. Due to various limitations within Twilio (API rate limite, Serverless Function timeout limits, API request limits, etc.) we need to move this funcionality out of Twilio and make it faster to retrieve with less chance of a timeout or error.

## How

In this example we will use AWS to set up our enviornment; however, this could technically be built in any combination of services that allow you to run serverless code and a database

- AWS Lambda to run Node.js code and communcate with the Twilio API.
- AWS CloudWatch to [schedule running a Lambda function](https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/RunLambdaSchedule.html).
- AWS DynamoDB, to store TaskRouter TaskQueue wait time data.
- Twilio function to retreive data from DynamoDB

### High Level Flow Overview

1. CloudWatch runs a Lambda function to populate/update the cached wait times in a DynamoDB table.
2. Every time the IVR is executed, a Twilio function is called that is pulling the wait times from DynamoDB 

### Installation - AWS
Create a DynamoDB table with partision key "ID (String)". The DynamoDB table should in the same region you specified in your .env file. 
Create a cloudwatch event that invokes the lambda function to be triggered every 1 minute https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/Create-CloudWatch-Events-Scheduled-Rule.html
Create an IAM user with read only access to your DynamoDB table.

### Installation - Lambda
navigate to lambda-dynamodb
create and populate .env file based on .env.sample
npm install
Use the serverless framework to deploy the Lambda function (Alternatively zip and upload manually) command: "serverless deploy"

### Installation - Twilio function (get wait time)
navigate to queue-wait-time
create and populate .env file based on .env.sample
npm install
Use the Twilio serverless framework to deploy the function "twilio serverless:deploy"

### Installation - Twilio function (queue detection) - Currently not working with my Wofklow, the function is not generic
navigate to taskrouter-queue-detection
npm install
populate assets/workflowConfig.private.json. You can get this information from TaskRouter -> Workspace -> Workflows -> select your flow -> View JSON
Need some explanation about the input event and how it matches to workflowConfig example input event { isIVRFeedback: false,language:"english", isForQueueing: "Y", isForCallback: true, testArray: [1, 2, 3], testObj: { a: "abc" } }
Use the Twilio serverless framework to deploy the function "twilio serverless:deploy"

### Installation - Studio flow
See sample flow screenshot under assets folder


