# ASTIA PDV — Instala Visual C++ Redistributable automaticamente
# Este script é executado pelo NSIS antes de instalar o aplicativo

!macro customInstall
  # Verifica se VCRUNTIME140.dll já existe (VC++ já instalado)
  IfFileExists "$SYSDIR\VCRUNTIME140.dll" vcredist_ok vcredist_needed
  
  vcredist_needed:
    DetailPrint "Instalando Visual C++ Redistributable 2015-2022..."
    
    # Cria pasta temporária
    SetOutPath "$TEMP\astia_setup"
    
    # Copia o vc_redist que está embutido no instalador
    File /oname=vc_redist.x64.exe "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
    
    # Instala silenciosamente
    ExecWait '"$TEMP\astia_setup\vc_redist.x64.exe" /install /quiet /norestart' $0
    
    # Remove arquivo temporário
    Delete "$TEMP\astia_setup\vc_redist.x64.exe"
    RMDir "$TEMP\astia_setup"
    
    # Verifica se instalou com sucesso
    IntCmp $0 0 vcredist_ok vcredist_failed vcredist_ok
    
    vcredist_failed:
      MessageBox MB_OK|MB_ICONEXCLAMATION "Aviso: Não foi possível instalar o Visual C++ Redistributable automaticamente.$\n$\nSe o ASTIA PDV não abrir, baixe e instale manualmente:$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
    
  vcredist_ok:
    DetailPrint "Visual C++ Redistributable OK"
!macroend

!macro customUnInstall
  # Nada a fazer na desinstalação
!macroend
