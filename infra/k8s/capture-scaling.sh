#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tools.sh"
: "${EVIDENCE_DIR:?Set EVIDENCE_DIR}"
mkdir -p "$EVIDENCE_DIR"
exec python3 - "$EVIDENCE_DIR" "${CAPTURE_SECONDS:-900}" <<'PY'
import datetime,json,os,subprocess,sys,time,urllib.request,urllib.parse
end=time.monotonic()+int(sys.argv[2])
queries={'sessionRequests':'sum by(pod)(tablesync_http_requests_total{service="session"})','sessionCpu':'sum by(pod)(rate(container_cpu_usage_seconds_total{namespace="tablesync",container="session"}[1m]))','sessionMemory':'sum by(pod)(container_memory_working_set_bytes{namespace="tablesync",container="session"})'}
def kubectl(*args):
 p=subprocess.run(['kubectl','--context=tablesync','-n','tablesync',*args],capture_output=True,text=True,timeout=8)
 if p.returncode:raise RuntimeError(p.stderr.strip())
 return json.loads(p.stdout) if '-o' in args else p.stdout.strip()
with open(os.path.join(sys.argv[1],'scaling.jsonl'),'a',buffering=1) as out:
 while time.monotonic()<end:
  started=time.monotonic();sample={'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  try:
   sample['hpa']=kubectl('get','hpa','session','-o','json')['status']
   deployment=kubectl('get','deployment','session','-o','json');sample['desiredReplicas']=deployment['spec']['replicas'];sample['deploymentStatus']=deployment.get('status',{})
   sample['pods']=[{'name':p['metadata']['name'],'phase':p['status']['phase'],'ready':any(c['type']=='Ready' and c['status']=='True' for c in p['status'].get('conditions',[]))} for p in kubectl('get','pods','-l','app=session','-o','json')['items']]
   sample['topPods']=kubectl('top','pods','--no-headers')
  except Exception as error:sample['kubernetesError']=str(error)
  for name,query in queries.items():
   try:
    url=os.environ.get('PROMETHEUS_LOCAL_URL','http://127.0.0.1:19090')+'/api/v1/query?'+urllib.parse.urlencode({'query':query})
    with urllib.request.urlopen(url,timeout=3) as response:sample[name]=json.load(response)
   except Exception as error:sample[name]={'state':'unavailable','error':str(error)}
  out.write(json.dumps(sample)+'\n');time.sleep(max(0,5-(time.monotonic()-started)))
PY
