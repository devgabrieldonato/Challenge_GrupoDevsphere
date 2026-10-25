"""Diário privado incremental: não depende do encerramento normal do observador."""
from __future__ import annotations
import json
import os
from pathlib import Path

class Journal:
    """Arquivo novo 0600, append com fsync por registro; nunca sobrescreve evidência."""
    def __init__(self, path, header):
        self.path = Path(path)
        self.fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        self.append('start', header)

    def append(self, kind, data):
        payload = (json.dumps({'kind':kind,'data':data},ensure_ascii=False,allow_nan=False)+'\n').encode()
        view = memoryview(payload)
        while view:
            written = os.write(self.fd, view)
            view = view[written:]
        os.fsync(self.fd)

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None


def recover_checkpoint(path):
    """Recupera linhas completas, limita leitura e identifica a interrupção sem inventar fim."""
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd,'rb') as f:
        data = f.read(16*1024*1024+1)
    if len(data)>16*1024*1024:
        raise ValueError('Checkpoint excede 16 MiB.')
    report = {'samples':[],'transitions':[],'job':None,'recovered':True,'incomplete':True,'stopReason':'interrupted_before_final_report'}
    started = False
    for line in data.splitlines(keepends=True):
        if not line.endswith(b'\n'):
            report['truncatedFinalRecord'] = True
            break
        record = json.loads(line)
        kind, value = record.get('kind'), record.get('data')
        if kind=='start' and isinstance(value,dict):
            # Cabeçalho operacional conhecido, sem importar chaves arbitrárias.
            for key in ('startedAt','maximumDurationSeconds','requestedIntervalSeconds','clinicalValidation','notes'):
                if key in value:report[key]=value[key]
            started=True
        elif kind=='sample' and isinstance(value,dict):
            report['samples'].append(value)
        elif kind=='transition' and isinstance(value,dict):
            report['transitions'].append(value);report['job']=value.get('job')
        elif kind=='finish' and isinstance(value,dict):
            report['stopReason']=value.get('stopReason','unknown');report['elapsedSeconds']=value.get('elapsedSeconds');report['incomplete']=False
    if not started:raise ValueError('Cabeçalho de checkpoint ausente.')
    return report
