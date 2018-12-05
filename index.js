const http = require("http");
const Docker = require('dockerode');
const request = require('request');

const docker = new Docker({
    socketPath: '/var/run/docker.sock'
});
let latestValue = null;
const TASK_STATES = {
    RUNNING: "running"
};

const NODE_STATES = {
    READY: "ready",
    ACTIVE: "active"
};

const isAlways = process.argv.indexOf("--always") !== -1;
const isDebug = process.argv.indexOf("--debug") !== -1;

const seconds = parseInt((process.env.MONO_PERIOD || 3));
const time = seconds * 1000;

if (isAlways) {
    console.log(`--always is enabled which means every ${seconds} your service will be informed.`);
} else {
    console.log(`Your service will be informed every ${seconds} when something is changed.`);
}

const serviceUrl = process.env.MONO_SERVICE;
const secret = process.env.MONO_SECRET;

const app = http.createServer((request, response) => {
    response.writeHead(200, {
        "Content-Type": "text/html"
    });
    response.write("Nothing to show here!");
    response.end();
});

const main = async () => {
    try {
        let requestValue = {
            nodes: [],
            services: []
        };

        const nodes = await docker.listNodes();
        let nnodes = {};
        nodes.map(x => {
            if (x.Status.State !== NODE_STATES.READY && x.Spec.Availability !== NODE_STATES.ACTIVE)
                return;
            nnodes[x.ID] = {
                Id: x.ID,
                Name: x.Description.Hostname,
                Ip: x.Status.Addr
            };
        });

        const services = await docker.listServices();

        let nservices = {};
        services.map(x => {
            if (!x.Spec.Mode.Replicated)
                return;
            if (!x.Endpoint.Ports || !x.Endpoint.Ports.length)
                return;

            nservices[x.ID] = {
                Name: x.Spec.Name,
                Ports: x.Endpoint.Ports.map(y => {
                    return {
                        TargetPort: y.TargetPort,
                        PublishedPort: y.PublishedPort
                    };
                }),
                Nodes: [],
                Labels: x.Spec.Labels
            };
        });

        const tasks = await docker.listTasks();
        tasks.map(x => {
            if (!nservices[x.ServiceID])
                return;
            if (!x.Desiredstate === TASK_STATES.RUNNING || x.Status.State !== TASK_STATES.RUNNING)
                return;

            let node = nnodes[x.NodeID];

            if (!node) {
                return;
            }

            if (nservices[x.ServiceID].Nodes.indexOf(node.Id) === -1) {
                nservices[x.ServiceID].Nodes.push(node.Id);
            }
        });


        if (!serviceUrl) {
            console.log("There is no service definition in environment variables. Please define it first. Variable Name: [MONO_SERVICE]");
            return;
        }

        requestValue.nodes = Object.keys(nnodes).map(n => {
            return nnodes[n];
        });

        requestValue.services = Object.keys(nservices).map(s => {
            return nservices[s];
        });

        let value = JSON.stringify(requestValue);
        if (value !== latestValue || isAlways) {
            console.log("Configuration will be updated.");
        } else {
            return;
        }

        if (!secret) {
            console.log("You don't have secret value in your environment variable for sending request. It is highly recommended to define it first. Variable Name: [MONO_SECRET]");
            console.log("This header will sent to your service balancer with X-SECRET header.");
        }

        latestValue = value;

        if (isDebug) {
            console.log(JSON.stringify(requestValue, null, 2));
        }
        console.log(`${Object.keys(nservices).length} services found.`);
        console.log(`Sending to service : ${serviceUrl}`);
        request({
            url: serviceUrl,
            headers: {
                'X-SECRET': secret
            },
            json: true,
            method: 'POST',
            body: requestValue
        }, function (error, response, body) {
            if (error != null) {
                latestValue = null;
                console.log("Something is wrong.");
                console.error(error);
                return;
            } else if (response.statusCode === 200) {
                console.log("Service informed");
                return;
            } else {
                console.log(`No success code from server. We will try again in ${seconds} seconds.`);
                latestValue = null;
                console.log(body);
            }
            setTimeout(main, time);
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
}
main().then(() => {
    setTimeout(main, time);
}, (error) => {
    console.error(error);
});
app.listen(3000);