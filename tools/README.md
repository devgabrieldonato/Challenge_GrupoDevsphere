# Validação estrutural de casos

Execute:

```bash
python3 tools/validate_clinical_case.py caminho/do/caso.json
python3 -m unittest discover -s tools -p 'test_*.py'
```

O validador verifica quantidades, campos dos itens, IDs, pais, ciclos, evidências prioritárias, hipóteses e referências. Ele não substitui a revisão clínica do professor.
