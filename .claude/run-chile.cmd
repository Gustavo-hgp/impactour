@echo off
rem Helper para o preview: roda o dev server do projeto "Operacao Chile"
rem (cujo caminho tem espacos) a partir de um caminho sem espacos.
cd /d "C:\Users\Usuario\Documents\Sobre o Chile - Operacao"
call npm run dev
