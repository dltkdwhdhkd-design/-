import json,sys
rows=[]
for f in sys.argv[1:]:
  for d in json.load(open(f)): rows.append(d)
def g(d,*p):
  for k in p:
    if d is None: return None
    d=d.get(k) if isinstance(d,dict) else None
  return d
cols=[('ack p50/p95',lambda d:f"{g(d,'ackMs','p50')}/{g(d,'ackMs','p95')}"),
('corr ev/max',lambda d:f"{g(d,'correctionPx','events')}/{g(d,'correctionPx','max')}"),
('age p50/p95',lambda d:f"{g(d,'remoteSampleAgeMs','p50')}/{g(d,'remoteSampleAgeMs','p95')}"),
('delay p50/p95',lambda d:f"{g(d,'observer','displayDelayMs','p50')}/{g(d,'observer','displayDelayMs','p95')}"),
('dispErr p50/p95',lambda d:f"{g(d,'observer','displayErrorPx','p50')}/{g(d,'observer','displayErrorPx','p95')}"),
('trajErr p95',lambda d:f"{g(d,'observer','trajectoryErrorPx','p95')}"),
('jump max',lambda d:f"{g(d,'observer','frameJumpPxMax')}"),
('stall%',lambda d:f"{g(d,'observer','stalledMovingFramesPct')}"),
('missing%',lambda d:f"{g(d,'observer','missingWhileVisiblePct')}"),
('vanish',lambda d:f"{g(d,'observer','vanishEvents')}"),
('kill confirm',lambda d:'/'.join(str(k['pressToConfirmMs']) for k in d['kills'])),
('victim sees',lambda d:'/'.join(str(k['victimSeesDeathMs']) for k in d['kills'])),
('body p50/max',lambda d:'/'.join(f"{k['observersSeeBodyP50']}~{k['observersSeeBodyMax']}" for k in d['kills'])),
('kill tries',lambda d:'/'.join(str(k['attempts']) for k in d['kills'])),
('db rt/s',lambda d:f"{g(d,'db','roundTripsPerSec')}"),
('db stmt/s',lambda d:f"{g(d,'db','statementsPerSec')}"),
('db KB/s',lambda d:f"{g(d,'db','kbReadPerSec')}"),
('db busy%',lambda d:f"{g(d,'db','primaryBusyPct')}"),
('http frames',lambda d:f"{g(d,'counts','frame.http') or 0}"),
('loop p99',lambda d:f"{g(d,'simFidelity','eventLoopP99Ms')}"),
]
print('| metric | '+' | '.join(f"{d['scenario']} ({d['client']})" for d in rows)+' |')
print('|---|'+'---|'*len(rows))
for name,fn in cols: print(f'| {name} | '+' | '.join(fn(d) for d in rows)+' |')
for d in rows:
  errs=[e for k in d['kills'] for e in k['errors']]
  if errs: print(d['scenario'],d['client'],'kill errors:',errs[:6])
