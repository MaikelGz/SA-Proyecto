import requests

LLAMA_API_URL = "http://localhost:8º    º   º   º   º   º   º000/v1/chat/completions"

def load_knowledge_base(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def ask_question(knowledge_base, question):
    system_prompt = f"""Eres un experto asesor agrícola. Responde de forma clara, concisa y profesional usando la siguiente base de conocimientos:

BASE DE CONOCIMIENTOS:
\"\"\"{knowledge_base}\"\"\""""

    payload = {
        "prompt": f"{system_prompt}\nUsuario: {question}\nAsistente:",
        "temperature": 0.2,
        "max_tokens": 512
    }

    try:
        response = requests.post(LLAMA_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        return result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except requests.RequestException as e:
        return f"Error al contactar con el modelo: {e}"

if __name__ == "__main__":
    knowledge_base = load_knowledge_base("base_conocimiento.txt")

    while True:
        user_question = input("\nIntroduce tu pregunta sobre agricultura (o 'salir' para terminar): ")
        if user_question.lower() == "salir":
            break
        answer = ask_question(knowledge_base, user_question)
        print(f"\n🤖 Respuesta:\n{answer}")
