@echo off
echo Instalando dependencias (somente na primeira vez)...
call npm install
echo.
echo Iniciando a plataforma. O endereco aparece abaixo em "Plataforma aberta em" e no titulo desta janela.
echo (Se a porta 5173 estiver ocupada, por exemplo pelo Docker, a plataforma abre na proxima porta livre.)
echo.
call npm run dev
pause
