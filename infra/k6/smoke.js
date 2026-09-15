import http from 'k6/http';
import { check } from 'k6';
export const options={vus:2,duration:'10s'};
export default function(){const result=http.get(__ENV.TARGET_URL||'http://localhost:8080/health');check(result,{healthy:r=>r.status===200});}
