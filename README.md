# TableSync

A restaurant demo with guest ordering, owner dashboard, kitchen and DevOps views.
Payments are simulated. Owners manage dishes, prices and tables and see daily
sales, order volume and dish performance.

## Start locally

Start Docker Desktop or Docker Engine. With Node.js/npm available, open a
terminal in this repository and run:

```bash
npm run demo
```

No account setup or host `npm install` is needed. The first start downloads and
builds images. Wait for **Ready: http://localhost:3000**, then open that address.
Select **Restaurant dashboard** and choose the owner or DevOps demo login.
Kitchen is a link in the owner view.

Open **http://localhost:3000/app?table=SAGE-12** in a private/incognito window
for a separate guest. Join, add dishes, then click **Simulate table payment**.

```bash
npm run demo:stop     # Stop; preserve orders and database data
npm run demo:logs     # Read service errors
```

- [Five-minute walkthrough](docs/DEMO.md)
- [Startup help](docs/DEPLOYMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current features and limits](docs/STATUS.md)
- [Cloud setup](infra/k8s/README.md)

## Run the cloud presentation

On this Linux machine, run:

```bash
npm run cloud
```

This stops the local Compose app to free ports, starts the Minikube app and
monitoring, and opens web/Grafana port-forwarding. Keep the terminal open.
The first cloud start can take several minutes. Later, use `npm run cloud:open`
to reopen the running cluster without rebuilding, or `npm run cloud:stop` to
stop it while preserving data.

Minikube/kubectl are downloaded automatically on Linux x86_64 when missing.
Allow at least 6 GiB for the cluster. Local Kubernetes runs on your computer,
not hosted cloud compute. [Cloud details](infra/k8s/README.md).
