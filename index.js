import http from "http";
import Docker from "dockerode";
import got from "got";

const docker = new Docker({
  socketPath: "/var/run/docker.sock",
});
let latestValue = null;
const TASK_STATES = {
  RUNNING: "running",
};

const NODE_STATES = {
  READY: "ready",
  ACTIVE: "active",
};

const isAlways = process.argv.indexOf("--always") !== -1;
const isDebug = process.argv.indexOf("--debug") !== -1;

const seconds = parseInt(process.env.DUPSTREAM_PERIOD || 3);
const time = seconds * 1000;

if (isAlways) {
  console.log(
    `--always is enabled which means every ${seconds} seconds your service will be informed.`
  );
} else {
  console.log(
    `Your service will be informed every ${seconds} seconds when something is changed.`
  );
}

const servicesUrl = process.env.DUPSTREAM_SERVICE_URL;
const secret = process.env.DUPSTREAM_SERVICE_SECRET;

const app = http.createServer((request, response) => {
  response.writeHead(200, {
    "Content-Type": "text/html",
  });
  response.write("Nothing to show here!");
  response.end();
});

const main = async () => {
  try {
    let requestValue = {
      nodes: [],
      services: [],
    };

    const nodes = await docker.listNodes();
    let nnodes = {};
    nodes.map((x) => {
      if (
        x.Status.State !== NODE_STATES.READY &&
        x.Spec.Availability !== NODE_STATES.ACTIVE
      )
        return;
      nnodes[x.ID] = {
        Id: x.ID,
        Name: x.Description.Hostname,
        Ip: x.Status.Addr,
        State: x.Status.State,
        Availability: x.Spec.Availability,
      };
    });

    const services = await docker.listServices();

    let nservices = {};
    services.map((x) => {
      if (!x.Endpoint.Ports || !x.Endpoint.Ports.length) return;

      nservices[x.ID] = {
        Name: x.Spec.Name,
        Ports: x.Endpoint.Ports.map((y) => {
          return {
            TargetPort: y.TargetPort,
            PublishedPort: y.PublishedPort,
          };
        }),
        Nodes: [],
        Labels: x.Spec.Labels,
      };
    });

    const tasks = await docker.listTasks();
    tasks.map((x) => {
      if (!nservices[x.ServiceID]) return;
      if (
        !x.Desiredstate === TASK_STATES.RUNNING ||
        x.Status.State !== TASK_STATES.RUNNING
      )
        return;

      let node = nnodes[x.NodeID];

      if (
        !node ||
        node.State !== NODE_STATES.READY ||
        node.Availability !== NODE_STATES.ACTIVE
      ) {
        return;
      }

      if (nservices[x.ServiceID].Nodes.indexOf(node.Id) === -1) {
        nservices[x.ServiceID].Nodes.push(node.Id);
      }
    });

    if (!servicesUrl) {
      console.log(
        "There is no service definition in environment variables. Please define it first. Variable Name: [DUPSTREAM_SERVICE_URL]"
      );
      return;
    }

    requestValue.nodes = Object.keys(nnodes).map((n) => {
      return nnodes[n];
    });

    requestValue.services = Object.keys(nservices).map((s) => {
      return nservices[s];
    });

    let value = JSON.stringify(requestValue);
    if (value !== latestValue || isAlways) {
      console.log("Configuration will be updated.");
    } else {
      setTimeout(main, time);
      return;
    }

    if (!secret) {
      console.log(
        "You don't have secret value in your environment variable for sending request. It is highly recommended to define it first. Variable Name: [DUPSTREAM_SERVICE_SECRET]"
      );
      console.log(
        "This header will sent to your service balancer with X-SECRET header."
      );
    }

    latestValue = value;

    if (isDebug) {
      console.log(JSON.stringify(requestValue, null, 2));
    }
    console.log(`${Object.keys(nservices).length} services found.`);
    const allServicesUrls = servicesUrl.split("|");
    console.log(allServicesUrls);
    for (const serviceUrl of allServicesUrls) {
      console.log(`Sending to service : ${serviceUrl}`);
      try {
        const result = await got
          .post(serviceUrl, {
            headers: {
              "X-SECRET": secret,
            },
            json: JSON.parse(JSON.stringify(requestValue)),
            timeout: {
              request: 5000,
            },
          })
          .json();
        console.log(result);
      } catch (gotError) {
        console.log(`Error for ${serviceUrl} Reason: ${gotError.code}`);
        console.log(JSON.stringify(requestValue), null, 2);
      }
    }
    setTimeout(main, time);
  } catch (e) {
    console.error(e);
    throw e;
  }
};
main().then(
  () => {
    setTimeout(main, time);
  },
  (error) => {
    console.error(error);
  }
);
app.listen(8080);
