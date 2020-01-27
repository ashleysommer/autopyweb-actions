const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

function process_pull_request(event, options) {
    if (!options) {
        options = {};
    }
    let pr_id = event['number'];
    let pr_id_str = (""+pr_id).padStart(3, '0');
    let pr = event['pull_request'];
    let action = event['action']; //"opened" or "synchronize"
    let base = pr['base']; // this is the dst branch of the PR
    let head = pr['head']; // this is the src branch of the PR
    let queryParams = {};
    // Note, this is where we need to add some business rules
    // Need to decide what is a valid PR to push straight to serve
    const prevent_from_forks = options['prevent_from_forks'];
    if (prevent_from_forks === 'true' || prevent_from_forks === true) {
        let same_repo = base['clone_url'] === head['clone_url'];
        let is_fork = head['fork'] || false;
        if ((!same_repo) || is_fork) {
            throw "Option prevent_from_forks is enabled. Cannot autodeploy this PR.";
        }
    }

    // For now we really only care about the "head" to deploy it for staging/demoing.
    let head_repo = head['repo'];
    queryParams['origin'] = head_repo['clone_url'];
    queryParams['branch'] = head['ref'];
    queryParams['dirname'] = "pr"+pr_id_str;
    queryParams['update'] = action === "synchronize";
    return queryParams;
}

async function main(argv) {
    let deploy_endpoint, prevent_from_forks;
    let event, eventString, eventName;
    try {
      deploy_endpoint = core.getInput('dynamic_deploy_endpoint');
      prevent_from_forks = core.getInput('prevent_from_forks');
      // Get the JSON webhook payload for the event that triggered the workflow
      event = github.context.payload;
      eventString = JSON.stringify(event, undefined, 2);
      eventName = github.context.eventName;
    } catch (error) {
      core.setFailed(error.message);
      return;
    }
    console.log("working in: " + __dirname);
    console.log("event name: "+eventName);
    console.log("event payload: \n"+eventString);
    let query_params;
    if (eventName === "pull_request") {
        let options = {
            prevent_from_forks: prevent_from_forks,
        };
        try {
            query_params = process_pull_request(event, options);
        } catch (error) {
            core.setFailed(error);
            return;
        }
    }

    try {
      let deploy_post_endpoint = deploy_endpoint + "/add";
      let config = {
        params: query_params,
        headers: {
          'Content-Type': 'application/json;charset=utf-8'
        }
      };
      let resp = await axios.post(deploy_post_endpoint, event, config);
      let { data } = resp.data;
      console.log("response: "+data)
    } catch(error) {
      console.log("error: "+error);
      throw error;
    }
    return "OK";
}
if (require.main === module) {
  main(process.argv)
    .then(res => {
      if (res !== "OK") {
        console.log(res);
        core.setOutput('success', "false");
        core.setFailed(res);
        process.exitCode = 1;
      } else {
        console.log({res});
        process.exitCode = 0;
        core.setOutput('success', "true");
      }
    }).catch(err => {
      console.log({ err });
      core.setOutput('success', "false");
      core.setFailed(err);
      process.exitCode = 1;
    })
}

