const _eval = require('eval')

//Prints context to string
function buildContextString(context) {
  try {
    return Object.keys(context).map(v => `let ${v}=${JSON.stringify(context[v])}`).join(';')
  } catch (e) { }
  return '';
}


function buildCustomOperators(){
  return `
  String.prototype.IN = function (arr){ return arr.includes(this.toString())};
  String.prototype.NOTIN = function (arr){ return !arr.includes(this.toString())};  
  `;
}

/*Maps Following Task Router Expression operators to javascript operators:
CONTAINS , HAS , IN , NOT IN , AND , OR 
Refer: https://www.twilio.com/docs/taskrouter/expression-syntax 
*/

function buildEvaluationString(expression) {
  let exp = expression.replace(/\sOR\s/g, ' || ').replace(/\sAND\s/g, ' && ');  
  exp = exp.replace(/\s+NOT\s+IN\s+\[.*?\]/g,(x)=>x.replace(/\s+NOT\s+IN\s+/g,'.NOTIN(')+')')  
  exp = exp.replace(/\s+IN\s+\[.*?\]/g,(x)=>x.replace(/\s+IN\s+/g,'.IN(')+')')  
  exp = exp.replace(/\s+HAS\s+[\"?\w]*/g,(x)=>x.replace(/\s+HAS\s+/g,'.includes(')+')')  
  exp = exp.replace(/\s+CONTAINS\s+[\"?\w]*/g,(x)=>x.replace(/\s+CONTAINS\s+/g,'.includes(')+')')
  return exp;
}

function evaluateExpression(expression, context) {
  const customOperators = buildCustomOperators();
  const contextString = buildContextString(context);
  const patchedExpression = buildEvaluationString(expression);
  const combinedString = `${customOperators}; ${contextString};exports.result = (${patchedExpression})`;
  const {result} = _eval(combinedString);
  return result;
}


exports.handler = function (context, event, callback) {
  let identifiedFilter = "N/A";
  let identifiedQueue = "N/A";

  try {
    const workflowConfig = require(Runtime.getAssets()['/workflowConfig.json'].path);

    //Testing data to be replaced by event
    const inputContext = { isIVRFeedback: false,language:"english", isForQueueing: "Y", isForCallback: true, testArray: [1, 2, 3], testObj: { a: "abc" } };

    const filters = workflowConfig.task_routing.filters;

    for (let iter = 0; iter < filters.length; iter++) {
      const filter = filters[iter];
      if (evaluateExpression(filter.expression, inputContext)) {
        identifiedQueue = filter.targets[0]["queue"];
        identifiedFilter = filter.filter_friendly_name;
        break;
      }
    }
  } catch (e) { console.error(e) }

  callback(null, { "identifiedQueue": identifiedQueue, "identifiedFilter": identifiedFilter });
};
