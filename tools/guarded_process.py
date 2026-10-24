"""Watchdog externo ao processo observado; testes locais usam somente filhos leves."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
from measurement_journal import Journal


def stop_owned(child):
    """Encerra apenas o grupo criado pelo próprio watchdog, nunca busca PIDs por nome."""
    if child.poll() is not None:return
    try:os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:return
    try:child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        if child.poll() is None:
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
        child.wait(timeout=2)


def free_percent():
    """Consulta leve com prazo; ausência de medição não significa memória suficiente."""
    try:
        r=subprocess.run(['/usr/bin/memory_pressure','-Q'],capture_output=True,text=True,timeout=1,check=True)
        m=re.search(r'memory free percentage:\s*(\d+)%',r.stdout)
        return int(m[1]) if m else None
    except (OSError,subprocess.SubprocessError):return None


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--timeout',type=float,default=120)
    p.add_argument('--min-free-percent',type=int,default=10)
    p.add_argument('--consecutive',type=int,default=3)
    p.add_argument('--report',type=Path,required=True)
    p.add_argument('command',nargs=argparse.REMAINDER)
    a=p.parse_args();cmd=a.command[1:] if a.command[:1]==['--'] else a.command
    if not cmd or not .1<=a.timeout<=600 or not 0<=a.min_free_percent<=50 or not 1<=a.consecutive<=10:p.error('Confira comando e limites.')
    # Nenhuma credencial, argv do filho ou ambiente é copiado para o diário.
    journal=Journal(a.report,{'maximumDurationSeconds':a.timeout,'notes':['Interrompe somente filhos próprios. Não encerra Ollama compartilhado nem cancela fila da aplicação. Não garante recuperação de travamento do SO.']})
    child=None;started=time.monotonic();reason='child_exited';low=0
    try:
        env=dict(os.environ);env.setdefault('DEVSPHERE_INFERENCE_ENABLED','0')
        child=subprocess.Popen(cmd,start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=env)
        while child.poll() is None:
            elapsed=time.monotonic()-started
            if elapsed>=a.timeout:reason='duration_limit';break
            free=free_percent() if a.min_free_percent else None
            low=low+1 if free is not None and free<=a.min_free_percent else 0
            journal.append('sample',{'elapsedSeconds':round(elapsed,3),'memoryPressureFreePercent':free})
            if low>=a.consecutive:reason='low_memory_headroom';break
            time.sleep(.1)
    except KeyboardInterrupt:reason='watchdog_interrupted'
    except OSError:reason='child_launch_failed'
    finally:
        if child is not None:stop_owned(child)
        journal.append('finish',{'stopReason':reason,'elapsedSeconds':round(time.monotonic()-started,3),'returnCode':child.returncode if child else None})
        journal.close()
    print(json.dumps({'stopReason':reason,'report':str(a.report)}))
    return 0 if reason=='child_exited' and child.returncode==0 else 1

if __name__=='__main__':raise SystemExit(main())
