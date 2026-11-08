"""Restart the isolated dev server between batches; resume from per-route evidence."""
import json, os, signal, subprocess, time, urllib.request
from pathlib import Path
base=Path(__file__).resolve().parent
root=Path(os.environ.get('MOBILE_AUDIT_ROOT','/tmp/staymaint-mobile-batches'))
site=root/'site'; results=root/'results'; results.mkdir(exist_ok=True)
env=os.environ.copy()
env.update({'NODE_PATH':'/tmp/staymaint-mobile-audit/node_modules','PLAYWRIGHT_BROWSERS_PATH':'/tmp/staymaint-mobile-audit/browsers','NEXT_PRIVATE_API_URL':'http://127.0.0.1:3101','NEXT_PUBLIC_API_URL':'http://127.0.0.1:3100','AUTH0_BASE_URL':'http://127.0.0.1:3100','APP_BASE_URL':'http://127.0.0.1:3100','NEXT_TELEMETRY_DISABLED':'1','NODE_OPTIONS':'--max-old-space-size=1024'})
cases=json.loads(subprocess.check_output(['node',str(base/'run-batch.cjs'),'--list'],env=env))
(root/'manifest.json').write_text(json.dumps(cases,indent=2))
fixture_log=open(root/'fixture.log','a')
fixture=subprocess.Popen(['node',str(base/'fixtures.cjs')],env=env,stdout=fixture_log,stderr=subprocess.STDOUT,start_new_session=True)
def stop(p):
 if p and p.poll() is None:
  os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=12)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
try:
 requested=os.environ.get('AUDIT_INDICES')
 pending=[int(i) for i in requested.split(',')] if requested else list(range(len(cases)))
 def already_passed(i):
  evidence=results/f'{i}.json'
  if not evidence.exists(): return False
  record=json.loads(evidence.read_text())
  return record.get('source')==cases[i]['source'] and record.get('url')==cases[i]['url'] and record.get('expected')==cases[i]['expected'] and record.get('status') in ['passed','passed-redirect']
 if not requested:
  pending=[i for i in pending if not already_passed(i)]
 size=int(os.environ.get('AUDIT_BATCH_SIZE','1'))
 for off in range(0,len(pending),size):
  batch=pending[off:off+size];server=None
  print('BATCH_START '+json.dumps({'indices':batch,'urls':[cases[i]['url'] for i in batch]}),flush=True)
  log=open(root/f'server-{batch[0]}.log','w')
  try:
   server=subprocess.Popen(['node',str(site/'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3100'],cwd=site,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   for n in range(90):
    if server.poll() is not None:raise RuntimeError('Dev server stopped during startup')
    if 'Ready in' in (root/f'server-{batch[0]}.log').read_text():break
    time.sleep(1)
   run_env=env|{'AUDIT_CASES':json.dumps(batch)}
   run=subprocess.run(['node',str(base/'run-batch.cjs')],cwd=site,env=run_env,timeout=480)
   print('BATCH_FINISH '+json.dumps({'indices':batch,'exit':run.returncode}),flush=True)
  except Exception as e: print('BATCH_ERROR '+str(e),flush=True)
  finally:stop(server);log.close()
  time.sleep(2)
finally:stop(fixture);fixture_log.close()
print('AUDIT_FINISHED',flush=True)
