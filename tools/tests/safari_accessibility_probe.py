#!/usr/bin/env python3
"""Verifica acesso ao Safari nativo sem habilitar automação ou ler sessões pessoais.

Não substitui revisão de jornadas nem leitor de tela: apenas identifica se o
SafariDriver permite iniciar uma sessão vazia exclusiva do teste.
"""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import time


def probe():
    """Encerra exclusivamente o driver/sessão criados aqui; não fecha Safari do usuário."""
    result = {"nativeSafari": True, "driverAvailable": False,
              "automationAvailable": False, "screenReaderTested": False,
              "applicationJourneysTested": False, "persistentSettingsChanged": False}
    driver = Path('/usr/bin/safaridriver')
    if not driver.is_file():
        result["blocker"] = "safaridriver_absent"
        return result
    result["driverVersion"] = subprocess.check_output(
        [str(driver), '--version'], text=True, timeout=5).strip()
    with socket.socket() as reserved:
        reserved.bind(('127.0.0.1', 0))
        port = reserved.getsockname()[1]
    child = subprocess.Popen([str(driver), '-p', str(port)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    session = None
    try:
        def request(method, path, data=None):
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            try:
                connection.request(method, path, json.dumps(data) if data else None,
                                   {'Content-Type': 'application/json'})
                response = connection.getresponse()
                return response.status, json.loads(response.read())
            finally:
                connection.close()
        for _ in range(30):
            try:
                status, _ = request('GET', '/status')
                if status == 200:
                    result['driverAvailable'] = True
                    break
            except (OSError, ValueError):
                pass
            time.sleep(0.1)
        if not result['driverAvailable']:
            result['blocker'] = 'driver_did_not_start'
            return result
        status, payload = request('POST', '/session',
                                  {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})
        value = payload.get('value', {})
        result['sessionHttpStatus'] = status
        if status == 200 and value.get('sessionId'):
            session = value['sessionId']
            result['automationAvailable'] = True
            # Sessão exclusiva vazia: não coleta URLs, cookies ou conteúdo do usuário.
            result['browserVersion'] = value.get('capabilities', {}).get('browserVersion')
        else:
            result['webdriverError'] = value.get('error', 'unknown')
            message = value.get('message', '').lower()
            result['blocker'] = ('remote_automation_disabled'
                                 if 'allow remote automation' in message or
                                    'remote automation' in message
                                 else 'session_not_created')
        return result
    finally:
        if session:
            try:
                request('DELETE', '/session/' + session)
            except (OSError, ValueError):
                pass
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)


if __name__ == '__main__':
    print(json.dumps(probe(), ensure_ascii=False, indent=2))
