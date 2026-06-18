import os
import requests
from dotenv import load_dotenv

# Carrega as variáveis de ambiente
load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def send_telegram_message(message: str) -> bool:
    """
    Envia uma mensagem formatada em HTML para o canal do Telegram configurado.
    Retorna True em caso de sucesso, False caso contrário.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("Erro: TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não estão configurados no arquivo .env")
        return False
        
    if "insira_aqui" in TELEGRAM_BOT_TOKEN or "insira_aqui" in TELEGRAM_CHAT_ID:
        print("Erro: Credenciais do Telegram no .env ainda usam os valores do template padrão.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                return True
            else:
                print(f"Telegram API Error: {result.get('description')}")
        else:
            print(f"HTTP Error {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Erro ao enviar notificação para o Telegram: {e}")
        
    return False

if __name__ == "__main__":
    # Teste rápido se rodar diretamente
    print("Testando módulo notifier...")
    test_msg = "<b>[TESTE]</b> O módulo notifier do robô quantitativo foi carregado com sucesso! 🚀"
    success = send_telegram_message(test_msg)
    if success:
        print("Mensagem enviada com sucesso!")
    else:
        print("Falha no envio da mensagem.")
