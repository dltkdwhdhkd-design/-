#!/usr/bin/env python3
"""Compact v21 -> v22 table from two simulator result files.
usage: python3 tests/sim/summary.py baseline.json current.json"""
import json,sys
def load(p):return {d['scenario']:d for d in json.load(open(p))}
b,c=load(sys.argv[1]),load(sys.argv[2])
NAMES={'p6c2-iso1-d25':'6명 방·2명 접속, 1인스턴스, D1 25ms','p16-iso16-d25':'16명, 16인스턴스, D1 25ms','p29-iso29-d25':'29명, 29인스턴스, D1 25ms','p29-iso1-d170':'29명, 1인스턴스, D1 170ms','p29-iso29-d170':'29명, 29인스턴스, D1 170ms','p29-iso29-d25-recycle':'29명, 29인스턴스, 쿼리 예산 120(교대 강제)','p29-iso29-d170-adverse':'29명, 29인스턴스, D1 170ms, 손실 2%·탭 숨김·재접속'}
def pq(d):return f"{d['p50']:g}/{d['p95']:g}" if d and d.get('p50') is not None else '–'
def kills(d):
    ks=d.get('kills') or [];conf=[k['pressToConfirmMs'] for k in ks if k.get('pressToConfirmMs') is not None]
    return f"{max(conf) if conf else '–'} ({max([k.get('attempts',0) for k in ks] or [0])}회)"
cols=[('입력 확인 ms p50/p95',lambda d:pq(d['ackMs'])),('원격 표시 지연 ms p50/p95',lambda d:pq(d['observer']['displayDelayMs'])),('표시 위치 오차 px p95',lambda d:f"{d['observer']['displayErrorPx']['p95']:g}"),('사라짐 횟수',lambda d:str(d['observer'].get('vanishEvents',0))),('움직이는데 멈춰 보임 %',lambda d:f"{d['observer']['stalledMovingFramesPct']:g}"),('공격 누름→확정 최대 ms (최대 시도)',kills),('D1 batch/s',lambda d:f"{d['db']['roundTripsPerSec']:g}"),('D1 읽기 KB/s',lambda d:f"{d['db']['kbReadPerSec']:g}")]
print('| 시나리오 | '+' | '.join(n for n,_ in cols)+' |');print('|'+'---|'*(len(cols)+1))
for name in c:
    if name not in b:continue
    print(f"| {NAMES.get(name,name)} | "+' | '.join(f"{fn(b[name])} → **{fn(c[name])}**" for _,fn in cols)+' |')
print('\n각 칸: v21 → **v22**. 20초 실행 1회씩. 사라짐 = 서로 0.8×시야 안·벽 없음이 0.4초 이상 유지되는데 보이던 사람이 화면에서 사라진 횟수(관찰자×대상 합계).')
