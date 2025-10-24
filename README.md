# node-services

[![wakatime](https://wakatime.com/badge/user/db4a2800-e564-4201-9406-b98e170a6764/project/1ee6b9ee-abc1-4773-b270-95b301afc8b0.svg)](https://wakatime.com/badge/user/db4a2800-e564-4201-9406-b98e170a6764/project/1ee6b9ee-abc1-4773-b270-95b301afc8b0)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#licença)

**Coleção de serviços Node.js reutilizáveis** para integrações externas (Chatwoot, etc.), acesso a banco de dados (PostgreSQL), planilhas e gerenciamento de sessões/HTTP — organizados por domínio e publicados como módulos simples para uso em múltiplos projetos.

> **Foco:** velocidade de desenvolvimento, padronização de clientes HTTP e uma API mínima e previsível por domínio (`chatwoot`, `postgres`, `sheets`, `tiny`, …). Projeto em **ESM** (`"type": "module"`).

---

## ✨ Destaques

- **Arquitetura por domínio**: cada pasta em `services/` encapsula um conjunto coeso de funções.
- **Cliente HTTP dedicado por integração**: centraliza autenticação, headers e tratamento de erros.
- **APIs consistentes**: métodos curtos, dados de entrada claros e respostas tipadas por JSDoc.
- **Scripts de teste/POC** em `test/` para validar rapidamente integrações reais.