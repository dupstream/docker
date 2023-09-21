![](https://raw.githubusercontent.com/dupstream/docker/master/img/dupstream-logo-small-w.png)

## dupstream

Dynamic upstream helper for your load balancer.

It will better work with [dupstream/nginx](https://github.com/dupstream/nginx).

## What is it for?

dupstream will help you to send your service, task and node list to service url. For example;

Let's say you added a new service to your docker swarm (and you are using multi-host). Overlay network won't work always as you expected. It will make you crazy 🙂 (We have been there!). So old techs and images won't work too... 

Good news!

You can get information when a service added, updated etc. This service will automatically send you a http request like this;

```json
{
  "nodes": [
    {
      "Id": "xvvpn493yqrvtove74o33o9sf",
      "Name": "linuxkit-025000000001",
      "Ip": "192.168.65.3"
    }
  ],
  "services": [
    {
      "Name": "nginx",
      "Ports": [
        {
          "TargetPort": 80,
          "PublishedPort": 9099
        }
      ],
      "Nodes": [
        "xvvpn493yqrvtove74o33o9sf"
      ],
      "Labels": {
        "mono.upstream.mode": "least_conn"
      }
    },
    {
      "Name": "redis",
      "Ports": [
        {
          "TargetPort": 6397,
          "PublishedPort": 2222
        }
      ],
      "Nodes": [
        "xvvpn493yqrvtove74o33o9sf"
      ],
      "Labels": {}
    }
  ]
}
```

Your can use following environment variables;

| Variable                 | Default | Description                                                                           |
| ------------------------ | ------- | ------------------------------------------------------------------------------------- |
| DUPSTREAM_SERVICE        | `http`  | Service type that dupstream will inform.                                              |
| DUPSTREAM_SERVICE_URL    | `null`  | The service url like "http://mylb.example.com/update"                                 |
| DUPSTREAM_SERVICE_SECRET | `null`  | Use it and secure your endpoint. This will sent to your server with header "X-SECRET" |
| DUPSTREAM_PERIOD         | `3`     | Seconds - will check your services every 3 seconds.                                   |

and a command like `--always` (Which will help you to ignore caching and send always updated version of your services). Also `--debug` will show you the request body.

So with this data, you can use it with template scripts and update your load balancer upstream (like nginx).

We are using volume bind for accessing your services.

So, how to run?

```sh
docker run -d \
    --name=dupstream \
    -e DUPSTREAM_SERVICE_URL=http://yourwebservice/ \
    -e DUPSTREAM_SERVICE_SECRET=YOUR_ULTIMATE_SECRET_KEY \
    -e DUPSTREAM_PERIOD=3 \
    --volume=/var/run/docker.sock:/var/run/docker.sock \
    dupstream/dupstream:latest
```

** You can also run it as a service by the way.

Run with always and debug command;

```sh
docker run -d \
    --name=dupstream \
    --volume=/var/run/docker.sock:/var/run/docker.sock \
    dupstream/dupstream:latest --always --debug
```

We will also publish combined version with nginx config.

You can also use DUPSTREAM_SERVICE_URL with multiple url by adding "|" as separator. For example;

```sh
DUPSTREAM_SERVICE_URL=http://your-service-01|http://your-service-02|http://your-service-03
```

### Roadmap

- We also want to add a support for Consul.